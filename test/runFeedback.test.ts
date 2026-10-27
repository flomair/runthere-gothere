import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPushSender } from '../server/push';
import { setRepo } from '../server/repo';
import { memoryRepo } from '../server/repo-memory';
import { bearer, fakeVerify, req } from './helpers';
import {
  type Lap,
  type RunInput,
  type Streams,
  alignSteps,
  checkCadenceLock,
  checkDuplicates,
  checkGaps,
  checkLaps,
  checkStopSave,
  checkStreams,
  checkSyncLatency,
  checkTotals,
  computeFeedback,
  findPauses,
  fromStravaApiStreams,
  fromStravaMcpStreams,
  parseWorkoutText,
} from '../shared/runFeedback';
import type { RunFeedbackZone } from '../shared/types';

vi.mock('../server/firebase', () => ({
  verifyIdToken: async (t: string) => fakeVerify(t),
  db: () => {
    throw new Error('no Firestore in tests');
  },
  messaging: () => {
    throw new Error('no FCM in tests');
  },
}));

/** Intervals.icu Run zones (provisional until the 30-min test). */
const ZONES: RunFeedbackZone[] = [
  { name: 'Z1', minBpm: 0, maxBpm: 141 },
  { name: 'Z2', minBpm: 142, maxBpm: 150 },
];

const DEVICE_CHECK = `Lockerer Mittagslauf, gleichzeitig Gerätetest. Pace 6:30–7:00/km, Puls max 150. Steigerungen locker-schnell, kein Sprint. Pause-Test: an einer Brücke/Ampel die Uhr ~60 s pausieren und weiterlaufen. Am Ende sauber stoppen UND sichern.

Warmup
- Einlaufen 10m Z1 HR

Main Set
- Locker 3km Z2 HR
- Pause-Test, dann gehen 1m Z1 HR
- Gehen, Runde drücken zum Weiter 1m Z1 HR

Steigerungen 4x
- Steigerung 20s
- Traben 1m40s Z1 HR

Steady
- Locker 15m Z2 HR

Cooldown
- Auslaufen 5m Z1 HR
`;

interface Seg {
  s: number;
  speed: number;
  hr: number;
  cad?: number;
  moving?: boolean;
}

/** Build streams from segments, one sample every `dt` seconds; `gapAfter` inserts time jumps. */
function streams(segs: Seg[], opts: { dt?: number; gps?: boolean; cadence?: boolean; watts?: boolean; gaps?: Record<number, number> } = {}): Streams {
  const dt = opts.dt ?? 5;
  const s: Required<Streams> = { time: [], heartrate: [], cadence: [], watts: [], latlng: [], distance: [], velocity: [], moving: [] };
  let t = 0;
  let d = 0;
  let k = 0;
  for (const seg of segs) {
    for (let x = 0; x < seg.s; x += dt) {
      if (opts.gaps?.[k]) t += opts.gaps[k];
      s.time.push(t);
      s.heartrate.push(seg.hr);
      s.cadence.push(seg.cad ?? 84);
      s.watts.push(250);
      s.latlng.push([52.49 + d / 1e6, 13.42]);
      s.distance.push(d);
      s.velocity.push(seg.speed);
      s.moving.push(seg.moving ?? seg.speed > 0.5);
      t += dt;
      d += seg.speed * dt;
      k++;
    }
  }
  const out: Streams = { time: s.time, heartrate: s.heartrate, distance: s.distance, velocity: s.velocity, moving: s.moving };
  if (opts.gps !== false) out.latlng = s.latlng;
  if (opts.cadence !== false) out.cadence = s.cadence;
  if (opts.watts !== false) out.watts = s.watts;
  return out;
}

const run = (over: Partial<RunInput> = {}): RunInput => ({
  id: 1,
  name: 'Lunch Run',
  sportType: 'Run',
  distanceM: 9000,
  movingTimeS: 3600,
  elapsedTimeS: 3660,
  startDate: '2026-10-27T12:05:00Z',
  startDateLocal: '2026-10-27T13:05:00Z',
  hasStartLatLng: true,
  ...over,
});

/** A clean execution of the device-check plan: one segment per expanded step. */
function cleanSession() {
  const plan = parseWorkoutText('Device-Check – locker am Landwehrkanal', DEVICE_CHECK);
  const segs: Seg[] = plan.steps.map((st) => {
    const easy = 2.5;
    if (st.label === 'Steigerung') return { s: st.durationS!, speed: 4, hr: 148 };
    if (st.label.startsWith('Gehen') || st.label.startsWith('Pause')) return { s: st.durationS!, speed: 1.3, hr: 118 };
    const zone2 = st.hrZones?.[0] === 'Z2';
    return { s: st.durationS ?? st.distanceM! / easy, speed: easy, hr: zone2 ? 146 : 136 };
  });
  const s = streams(segs);
  const laps: Lap[] = segs.map((g) => ({ elapsedTimeS: g.s, movingTimeS: g.s, distanceM: g.s * g.speed }));
  return { plan, s, laps, segs };
}

describe('workout text', () => {
  it('parses the device-check session: 7 entries, 4x expanded, ~60 min, umlauts intact', () => {
    const p = parseWorkoutText('Device-Check – locker am Landwehrkanal', DEVICE_CHECK);
    expect(p.topLevelSteps).toBe(7);
    expect(p.steps).toHaveLength(14);
    expect(p.steps[0]).toMatchObject({ label: 'Einlaufen', block: 'Warmup', durationS: 600, hrZones: ['Z1'] });
    expect(p.steps[1]).toMatchObject({ label: 'Locker', distanceM: 3000, hrZones: ['Z2'] });
    expect(p.steps[3].label).toBe('Gehen, Runde drücken zum Weiter');
    const reps = p.steps.filter((s) => s.block === 'Steigerungen 4x');
    expect(reps.map((s) => [s.label, s.rep, s.durationS])).toEqual([1, 2, 3, 4].flatMap((r) => [['Steigerung', r, 20], ['Traben', r, 100]]));
    expect(reps[0].hrZones).toBeUndefined();
    const timed = p.steps.reduce((sum, s) => sum + (s.durationS ?? 0), 0);
    expect(timed / 60).toBe(40); // + 3 km at 6:30–7:00 ≈ 20 min → ~60 min
  });

  it('reads ranges, hours and metres', () => {
    const p = parseWorkoutText('x', 'Main\n- Lauf 1h10m Z1-Z2 HR\n- Bahn 400mtr');
    expect(p.steps[0]).toMatchObject({ durationS: 4200, hrZones: ['Z1', 'Z2'] });
    expect(p.steps[1]).toMatchObject({ distanceM: 400 });
  });
});

describe('stream adapters', () => {
  it('normalises REST and MCP keys and drops mismatched arrays', () => {
    const api = fromStravaApiStreams({ time: { data: [0, 1] }, heartrate: { data: [100, 101] }, velocity_smooth: { data: [2, 2] }, cadence: { data: [80] } });
    expect(api.heartrate).toEqual([100, 101]);
    expect(api.velocity).toEqual([2, 2]);
    expect(api.cadence).toBeUndefined();
    const mcp = fromStravaMcpStreams({ time: [0, 1], heart_rate: [100, 101], location: [[1, 2], [1, 2]] });
    expect(mcp.heartrate).toEqual([100, 101]);
    expect(mcp.latlng).toHaveLength(2);
  });
});

describe('alignment and compliance', () => {
  it('uses laps when they match the step count and scores zones per step', () => {
    const { plan, s, laps } = cleanSession();
    const f = computeFeedback({ activity: run(), streams: s, laps, plan, zones: ZONES, now: 'x' });
    expect(f.alignment.method).toBe('laps');
    expect(f.steps).toHaveLength(14);
    expect(f.steps[0]).toMatchObject({ label: 'Einlaufen', inZonePct: 100, completed: true });
    expect(f.steps[0].actual.zoneS.Z1).toBeGreaterThan(590);
    expect(f.steps[1].actual.avgHr).toBe(146);
    expect(f.steps[1].actual.paceSPerKm).toBe(400);
    expect(f.overall.stepsCompleted).toBe(14);
    expect(f.overall.inZonePct).toBe(100);
    expect(f.overall.zoneVerdictReliable).toBe(true);
    expect(f.checks.find((c) => c.id === 'laps')?.status).toBe('ok');
  });

  it('falls back to moving time when the laps do not match, and reports it', () => {
    const { plan, s } = cleanSession();
    const al = alignSteps(plan, s, [{ elapsedTimeS: 3600, movingTimeS: 3600, distanceM: 9000 }]);
    expect(al.method).toBe('moving-time');
    expect(al.note).toContain('1 laps ≠ 14');
    // warm-up ends after 600 moving seconds (sample every 5 s)
    expect(s.time[al.windows[0][1]]).toBe(600);
    // 3 km at 2.5 m/s = 1200 s
    expect(s.time[al.windows[1][1]] - s.time[al.windows[1][0]]).toBe(1200);
    expect(checkLaps(plan, [{ elapsedTimeS: 1, movingTimeS: 1, distanceM: 1 }]).status).toBe('warning');
  });

  it('measures time out of zone', () => {
    const plan = parseWorkoutText('x', 'Main\n- Locker 10m Z2 HR');
    const s = streams([{ s: 300, speed: 2.5, hr: 146 }, { s: 300, speed: 2.5, hr: 158 }]);
    const f = computeFeedback({ activity: run({ movingTimeS: 600, elapsedTimeS: 600 }), streams: s, laps: [], plan, zones: ZONES });
    expect(f.steps[0].inZonePct).toBe(50);
    // the very last sample has no interval after it
    expect(f.steps[0].actual.zoneS['>Z2']).toBe(295);
  });

  it('without a plan still runs every check', () => {
    const { s } = cleanSession();
    const f = computeFeedback({ activity: run(), streams: s, laps: [], plan: null, zones: ZONES });
    expect(f.plan.source).toBe('none');
    expect(f.steps).toEqual([]);
    expect(f.checks).toHaveLength(8);
  });
});

describe('data-quality checks', () => {
  it('clean run: all ok, and the 60 s pause test shows up as a pause', () => {
    const { plan, s, laps } = cleanSession();
    // pause the watch for 60 s after sample 400 (auto-pause drops samples)
    const paused = streams(cleanSession().segs, { gaps: { 400: 60 } });
    expect(findPauses(paused)).toEqual([{ atS: paused.time[399], durationS: 65 }]);
    const a = run({ elapsedTimeS: 3720 });
    for (const c of [checkStreams(a, s), checkStopSave(a, paused), checkGaps(paused), checkTotals(a), checkLaps(plan, laps), checkCadenceLock(s)]) expect(c.status, `${c.id}: ${c.reason}`).toBe('ok');
  });

  it('Oct 23: trailing sample 1.5 h later, no cadence/power, HR 165–180 at 6:50/km', () => {
    const s = streams([{ s: 3510, speed: 2.44, hr: 168 }], { cadence: false, watts: false });
    s.time.push(9053);
    s.heartrate!.push(109);
    s.distance!.push(8507);
    s.velocity!.push(0);
    s.moving!.push(false);
    s.latlng!.push([52.5, 13.42]);
    const a = run({ id: 20703902115, movingTimeS: 3505, elapsedTimeS: 9303, distanceM: 8507.71 });
    const stop = checkStopSave(a, s);
    expect(stop.status).toBe('problem');
    expect(stop.reason).toBe('recording ran 97 min after the last movement: stopped or saved late');
    expect(checkStreams(a, s)).toMatchObject({ status: 'warning', reason: 'missing: cadence, power' });
    const lock = checkCadenceLock(s);
    expect(lock.status).toBe('warning');
    expect(checkGaps(s).status).toBe('ok'); // the trailing jump is a stop/save problem, not a gap
    const f = computeFeedback({ activity: a, streams: s, laps: [], plan: null, zones: ZONES, lang: 'de' });
    expect(f.overall.zoneVerdictReliable).toBe(false);
    expect(f.checks.find((c) => c.id === 'streams')?.reason).toBe('fehlt: Kadenz, Leistung');
  });

  it('cadence lock with a cadence stream: HR ≈ steps/min for minutes', () => {
    const s = streams([{ s: 600, speed: 2.5, hr: 140, cad: 84 }, { s: 600, speed: 2.5, hr: 170, cad: 85 }]);
    expect(checkCadenceLock(s)).toMatchObject({ status: 'problem' });
    expect(checkCadenceLock(streams([{ s: 1200, speed: 2.5, hr: 140, cad: 84 }])).status).toBe('ok');
  });

  it('Oct 5: no GPS, 69 m, a 42-minute gap', () => {
    const s = streams([{ s: 1200, speed: 2.2, hr: 120 }, { s: 1200, speed: 2.2, hr: 125 }], { gps: false, gaps: { 240: 42 * 60 } });
    // real numbers: 125 s moving, 6061 s elapsed, streams end at 3963 s
    const a = run({ id: 20459130730, name: 'TEST – Regenerationstraben', distanceM: 69.31, movingTimeS: 125, elapsedTimeS: 6061, hasStartLatLng: false });
    expect(checkStreams(a, s)).toMatchObject({ status: 'problem', reason: 'missing: GPS' });
    expect(checkGaps(s)).toMatchObject({ status: 'problem', reason: '1 gap(s) in the streams, longest 42 min' });
    expect(checkTotals(a)).toMatchObject({ status: 'problem' });
    expect(checkTotals(a).reason).toContain('69 m');
    // the watch kept running ~35 min after the streams ended
    expect(checkStopSave(a, s).status).toBe('problem');
  });

  it('Oct 2: two recordings of one run', () => {
    const structured = run({ id: 11, name: '6km Easy Run', startDate: '2026-10-02T05:30:00Z', elapsedTimeS: 500, distanceM: 1200 });
    const other = { id: 12, name: 'Morning Run', startDate: '2026-10-02T05:33:00Z', elapsedTimeS: 1700 };
    const later = { id: 13, name: 'Evening Run', startDate: '2026-10-02T17:00:00Z', elapsedTimeS: 1700 };
    const c = checkDuplicates(structured, [structured, other, later]);
    expect(c.status).toBe('problem');
    expect(c.reason).toContain('"Morning Run" (12)');
    expect(c.reason).not.toContain('Evening');
    expect(checkDuplicates(structured, [later]).status).toBe('ok');
  });

  it('Köln Marathon: 31 km in 10.6 h moving is a corrupt file', () => {
    const c = checkTotals(run({ name: 'Köln Marathon', distanceM: 31_000, movingTimeS: 38_160, elapsedTimeS: 38_500 }));
    expect(c).toMatchObject({ status: 'problem', reason: '31 km in 10.6 h moving is 0.81 m/s: the file looks corrupt' });
  });

  it('flags elapsed time not explained by pauses', () => {
    // streams cover the whole elapsed time without pauses, yet Strava says 30 min weren't moving
    const s = streams([{ s: 5400, speed: 2.5, hr: 140 }]);
    expect(checkStopSave(run({ movingTimeS: 3600, elapsedTimeS: 5400 }), s).status).toBe('warning');
  });

  it('sync latency from end of run to webhook arrival', () => {
    const a = run({ startDate: '2026-10-27T12:00:00Z', elapsedTimeS: 3600 });
    expect(checkSyncLatency({ ...a, receivedAt: '2026-10-27T13:04:00Z' })).toMatchObject({ status: 'ok', reason: 'arrived 4 min after the run ended' });
    expect(checkSyncLatency({ ...a, receivedAt: '2026-10-27T16:00:00Z' }).status).toBe('warning');
    expect(checkSyncLatency(a).reason).toBe('arrival time not recorded');
  });
});

describe('/api/run-feedback', () => {
  const SECRET = 'feedback-secret-that-is-long-enough';
  let store: ReturnType<typeof memoryRepo>;
  let sent: Record<string, string>[];

  beforeEach(async () => {
    process.env.SESSION_SECRET = 'test-secret-that-is-long-enough';
    process.env.ADMIN_EMAILS = 'flo@example.com';
    process.env.FEEDBACK_PUSH_SECRET = SECRET;
    store = memoryRepo();
    setRepo(store);
    await store.linkAthlete(42, 'flo');
    await store.updateUser('flo', { email: 'flo@example.com', pushTokens: ['tok'], pushLang: 'de' });
    sent = [];
    setPushSender(async (tokens, data) => {
      sent.push(data);
      return tokens.map((token) => ({ token, ok: true }));
    });
  });
  afterEach(() => setPushSender(null));

  const feedback = () => {
    const { plan, s, laps } = cleanSession();
    return computeFeedback({ activity: run({ id: 777 }), streams: s, laps, plan, zones: ZONES, lang: 'de' });
  };
  const post = (body: unknown, auth = `Bearer ${SECRET}`) => req('/api/run-feedback', { method: 'POST', headers: { authorization: auth }, json: body });

  it('rejects pushes without the secret', async () => {
    const r = await import('../routes/run-feedback');
    expect((await r.POST(post({ athleteId: 42, feedback: feedback() }, 'Bearer nope'))).status).toBe(401);
    delete process.env.FEEDBACK_PUSH_SECRET;
    expect((await r.POST(post({ athleteId: 42, feedback: feedback() }))).status).toBe(401);
  });

  it('stores pushed feedback once per activity, fills in the sync latency and notifies', async () => {
    const r = await import('../routes/run-feedback');
    await store.putActivities('flo', [{ id: 777, name: 'Lunch Run', sportType: 'Run', distanceM: 9000, movingTimeS: 3600, elevationGainM: 0, startDate: '2026-10-27T12:05:00Z', startDateLocal: '2026-10-27T13:05:00Z', elapsedTimeS: 3660, receivedAt: '2026-10-27T13:08:00Z' }]);
    const res = await r.POST(post({ athleteId: 42, feedback: feedback() }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, stored: 777, notified: 1, inApp: true });
    expect(sent[0]).toMatchObject({ title: '📊 Deine Lauf-Auswertung ist da', url: '/#/run/777' });
    const stored = await store.getRunFeedback('flo', 777);
    expect(stored?.checks.find((c) => c.id === 'syncLatency')?.reason).toBe('kam 2 min nach Laufende an');
    // re-computing (activity updated) overwrites without a second notification
    await r.POST(post({ athleteId: 42, feedback: feedback() }));
    expect(sent).toHaveLength(1);

    const get = await r.GET(req('/api/run-feedback?activityId=777', { headers: bearer('flo', 'flo@example.com') }));
    expect(((await get.json()) as { feedback: { steps: unknown[] } }).feedback.steps).toHaveLength(14);
    const list = (await (await r.GET(req('/api/run-feedback', { headers: bearer('flo', 'flo@example.com') }))).json()) as { feedback: { steps?: unknown }[] };
    expect(list.feedback).toHaveLength(1);
    expect(list.feedback[0].steps).toBeUndefined();
  });

  it('rejects unknown athletes and incomplete feedback', async () => {
    const r = await import('../routes/run-feedback');
    expect((await r.POST(post({ athleteId: 1, feedback: feedback() }))).status).toBe(404);
    expect((await r.POST(post({ athleteId: 42, feedback: { activityId: 1 } }))).status).toBe(400);
  });
});
