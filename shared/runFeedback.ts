/**
 * Post-run feedback: how a recorded run went against its planned workout, and whether the
 * recording itself can be trusted. Pure functions only (no I/O), so the same code runs on the
 * server, in the browser and in scripts/run-feedback.ts.
 *
 * Inputs are normalised Strava data (see `fromStravaApiStreams` / `fromStravaMcpStreams`); the
 * plan is either Intervals.icu workout text (`parseWorkoutText`) or nothing.
 */
import type { RunFeedback, RunFeedbackCheck, RunFeedbackStep, RunFeedbackZone } from './types.js';

export type { RunFeedback, RunFeedbackCheck, RunFeedbackStep, RunFeedbackZone };

// ---------- inputs ----------

/** One sample per index; arrays have the same length as `time` (seconds from start, elapsed). */
export interface Streams {
  time: number[];
  heartrate?: number[];
  /** Strava run cadence is per foot (rpm); steps per minute = 2 × cadence. */
  cadence?: number[];
  watts?: number[];
  latlng?: [number, number][];
  distance?: number[];
  velocity?: number[];
  moving?: boolean[];
}

export interface Lap {
  elapsedTimeS: number;
  movingTimeS: number;
  distanceM: number;
}

/** The activity fields the checks need (a superset of the stored `Activity`). */
export interface RunInput {
  id: number;
  name: string;
  sportType: string;
  distanceM: number;
  movingTimeS: number;
  elapsedTimeS: number;
  startDate: string;
  startDateLocal: string;
  hasStartLatLng?: boolean;
  deviceName?: string;
  /** When the app's webhook stored it (ISO), for the sync latency check. */
  receivedAt?: string;
}

/** Another activity of the same athlete, for the duplicate check. */
export interface OtherActivity {
  id: number;
  name: string;
  startDate: string;
  elapsedTimeS: number;
}

export interface PlannedStep {
  label: string;
  /** Section header, e.g. "Warmup" or "Steigerungen 4x". */
  block: string;
  durationS?: number;
  distanceM?: number;
  /** Target heart-rate zone(s) by name, e.g. ["Z1"] or ["Z1", "Z2"]. */
  hrZones?: string[];
  /** 1-based repetition inside a repeat block. */
  rep?: number;
}

export interface PlannedWorkout {
  name: string;
  /** Top-level entries as written (a repeat block counts once). */
  topLevelSteps: number;
  /** Expanded steps in execution order (what the watch writes one lap for). */
  steps: PlannedStep[];
}

// ---------- streams adapters ----------

type KeyedStreams = Record<string, { data: unknown[] } | undefined>;

/** Strava REST `/activities/{id}/streams?key_by_type=true`. */
export function fromStravaApiStreams(s: KeyedStreams): Streams {
  const d = <T,>(k: string) => s[k]?.data as T[] | undefined;
  return clean({
    time: d<number>('time') ?? [],
    heartrate: d<number>('heartrate'),
    cadence: d<number>('cadence'),
    watts: d<number>('watts'),
    latlng: d<[number, number]>('latlng'),
    distance: d<number>('distance'),
    velocity: d<number>('velocity_smooth'),
    moving: d<boolean>('moving'),
  });
}

/** The Strava MCP connector's `get_activity_streams` (plain arrays, different key names). */
export function fromStravaMcpStreams(s: Record<string, unknown[] | undefined>): Streams {
  return clean({
    time: (s.time as number[]) ?? [],
    heartrate: s.heart_rate as number[] | undefined,
    cadence: s.cadence as number[] | undefined,
    watts: s.watts as number[] | undefined,
    latlng: s.location as [number, number][] | undefined,
    distance: s.distance as number[] | undefined,
    velocity: s.velocity_smooth as number[] | undefined,
    moving: s.moving as boolean[] | undefined,
  });
}

const clean = (s: Streams): Streams => {
  const out: Streams = { time: s.time };
  for (const k of ['heartrate', 'cadence', 'watts', 'latlng', 'distance', 'velocity', 'moving'] as const) {
    const v = s[k];
    if (v && v.length === s.time.length && v.length > 0) (out as unknown as Record<string, unknown>)[k] = v;
  }
  return out;
};

// ---------- workout text (Intervals.icu syntax subset) ----------

const DURATION = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;
const DISTANCE = /^(\d+(?:[.,]\d+)?)(km|mtr)$/;
const ZONE = /^Z(\d)(?:-Z(\d))?$/i;

function parseStepLine(line: string, block: string): PlannedStep {
  const tokens = line.replace(/^-\s*/, '').split(/\s+/).filter(Boolean);
  const label: string[] = [];
  const step: PlannedStep = { label: '', block };
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const dur = DURATION.exec(tok);
    const dist = DISTANCE.exec(tok);
    const zone = ZONE.exec(tok);
    if (tok && dur && (dur[1] || dur[2] || dur[3]) && step.durationS == null && step.distanceM == null) {
      step.durationS = Number(dur[1] ?? 0) * 3600 + Number(dur[2] ?? 0) * 60 + Number(dur[3] ?? 0);
    } else if (dist && step.durationS == null && step.distanceM == null) {
      const n = Number(dist[1].replace(',', '.'));
      step.distanceM = dist[2] === 'km' ? n * 1000 : n;
    } else if (zone && tokens[i + 1]?.toUpperCase() === 'HR') {
      const from = Number(zone[1]);
      const to = Number(zone[2] ?? zone[1]);
      step.hrZones = Array.from({ length: to - from + 1 }, (_, k) => `Z${from + k}`);
      i++;
    } else label.push(tok);
  }
  step.label = label.join(' ').replace(/,\s*$/, '');
  return step;
}

/**
 * Parse Intervals.icu workout text: section headers ("Warmup", "Steigerungen 4x") followed by
 * "- <label> <10m|1m40s|3km|400mtr> [Z2 HR]" lines. Prose lines that aren't directly followed
 * by a step are ignored. Repeat blocks are expanded.
 */
export function parseWorkoutText(name: string, text: string): PlannedWorkout {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const steps: PlannedStep[] = [];
  let topLevel = 0;
  let block = '';
  let reps = 1;
  let pending: PlannedStep[] = [];
  const flush = () => {
    if (!pending.length) return;
    if (reps > 1) topLevel++;
    else topLevel += pending.length;
    for (let r = 1; r <= reps; r++) for (const s of pending) steps.push(reps > 1 ? { ...s, rep: r } : { ...s });
    pending = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    if (l.startsWith('-')) {
      pending.push(parseStepLine(l, block));
      continue;
    }
    const next = lines.slice(i + 1).find(Boolean);
    if (!next?.startsWith('-')) continue; // prose
    flush();
    block = l;
    const m = /(?:^|\s)(\d+)x$/i.exec(l);
    reps = m ? Number(m[1]) : 1;
  }
  flush();
  return { name, topLevelSteps: topLevel, steps };
}

// ---------- helpers ----------

/**
 * Per-sample weight in seconds: the gap to the next sample, capped so recording gaps don't count.
 * The cap follows the sampling rate (3 × the median interval, at least 5 s), so downsampled
 * streams still add up to the real duration.
 */
function weights(time: number[]): number[] {
  const dts = time.slice(1).map((t, i) => t - time[i]).sort((a, b) => a - b);
  const cap = Math.max(5, 3 * (dts[Math.floor(dts.length / 2)] ?? 0));
  return time.map((t, i) => (i + 1 < time.length ? Math.min(cap, Math.max(0, time[i + 1] - t)) : 0));
}

export function zoneOf(bpm: number, zones: RunFeedbackZone[]): string {
  for (const z of zones) if (bpm >= z.minBpm && bpm <= z.maxBpm) return z.name;
  const top = zones[zones.length - 1];
  return top && bpm > top.maxBpm ? `>${top.name}` : '?';
}

function zoneRange(names: string[], zones: RunFeedbackZone[]): { min: number; max: number } | null {
  const zs = zones.filter((z) => names.includes(z.name));
  if (!zs.length) return null;
  return { min: Math.min(...zs.map((z) => z.minBpm)), max: Math.max(...zs.map((z) => z.maxBpm)) };
}

/** Moving seconds at each sample (from the `moving` stream, else everything counts). */
function movingClock(s: Streams): number[] {
  const w = weights(s.time);
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < s.time.length; i++) {
    out.push(acc);
    if (!s.moving || s.moving[i]) acc += w[i];
  }
  return out;
}

const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const fmtMin = (s: number) => `${round(s / 60, s < 600 ? 1 : 0)} min`;

// ---------- alignment ----------

export type Alignment = 'laps' | 'moving-time' | 'none';

/** Index windows [from, to) into the streams, one per planned step. */
export function alignSteps(plan: PlannedWorkout, s: Streams, laps: Lap[]): { method: Alignment; windows: [number, number][]; note: string } {
  const n = s.time.length;
  if (!plan.steps.length || !n) return { method: 'none', windows: [], note: 'no plan or no streams' };
  const idxAt = (t: number) => {
    let i = 0;
    while (i < n && s.time[i] < t) i++;
    return i;
  };
  if (laps.length === plan.steps.length) {
    // laps are consecutive in elapsed time; slicing by time works at any stream resolution
    const windows: [number, number][] = [];
    let t = 0;
    for (const l of laps) {
      windows.push([idxAt(t), idxAt(t + l.elapsedTimeS)]);
      t += l.elapsedTimeS;
    }
    windows[windows.length - 1][1] = n;
    return { method: 'laps', windows, note: `${laps.length} laps = ${plan.steps.length} planned steps` };
  }
  const mt = movingClock(s);
  const windows: [number, number][] = [];
  let i = 0;
  for (const step of plan.steps) {
    const from = i;
    if (step.durationS != null) {
      const end = mt[from] + step.durationS;
      while (i < n && mt[i] < end) i++;
    } else if (step.distanceM != null && s.distance) {
      const end = s.distance[from] + step.distanceM;
      while (i < n && s.distance[i] < end) i++;
    } else if (step.distanceM != null) {
      // no distance stream: assume an easy 6:45/km
      const end = mt[from] + (step.distanceM / 1000) * 405;
      while (i < n && mt[i] < end) i++;
    }
    windows.push([from, i]);
  }
  const why = laps.length ? `${laps.length} laps ≠ ${plan.steps.length} planned steps` : 'no laps';
  return { method: 'moving-time', windows, note: `${why}; aligned by moving time from the start` };
}

// ---------- per-step compliance ----------

function stepResult(step: PlannedStep, s: Streams, [from, to]: [number, number], zones: RunFeedbackZone[], mt: number[], w: number[]): RunFeedbackStep {
  let movingS = 0;
  let hrSum = 0;
  let hrS = 0;
  let inTarget = 0;
  const zoneS: Record<string, number> = {};
  const target = step.hrZones ? zoneRange(step.hrZones, zones) : null;
  for (let i = from; i < to; i++) {
    if (s.moving && !s.moving[i]) continue;
    movingS += w[i];
    const hr = s.heartrate?.[i];
    if (hr == null || hr <= 0) continue;
    hrSum += hr * w[i];
    hrS += w[i];
    const z = zoneOf(hr, zones);
    zoneS[z] = (zoneS[z] ?? 0) + w[i];
    if (target && hr >= target.min && hr <= target.max) inTarget += w[i];
  }
  // up to the first sample of the next step, so the last sample's interval counts too
  const distM = s.distance && to > from ? s.distance[Math.min(to, s.distance.length - 1)] - s.distance[from] : undefined;
  const doneRatio = step.durationS ? (to > from ? mt[to - 1] - mt[from] + w[to - 1] : 0) / step.durationS : step.distanceM && distM != null ? distM / step.distanceM : undefined;
  return {
    label: step.label,
    block: step.block,
    ...(step.rep ? { rep: step.rep } : {}),
    planned: {
      ...(step.durationS != null ? { durationS: step.durationS } : {}),
      ...(step.distanceM != null ? { distanceM: step.distanceM } : {}),
      ...(target ? { hrZones: step.hrZones, hrMin: target.min, hrMax: target.max } : {}),
    },
    actual: {
      movingS: round(movingS),
      ...(distM != null ? { distanceM: round(distM) } : {}),
      ...(hrS ? { avgHr: round(hrSum / hrS) } : {}),
      ...(distM && movingS ? { paceSPerKm: round(movingS / (distM / 1000)) } : {}),
      zoneS: Object.fromEntries(Object.entries(zoneS).map(([k, v]) => [k, round(v)])),
    },
    ...(target && hrS ? { inZonePct: round((100 * inTarget) / hrS) } : {}),
    completed: doneRatio != null ? doneRatio >= 0.9 : movingS > 0,
    startS: s.time[from] ?? 0,
    endS: s.time[Math.max(from, to - 1)] ?? 0,
  };
}

// ---------- data-quality checks ----------

export type Lang = 'en' | 'de';

const MSG = {
  en: {
    streamsOk: 'GPS, HR, cadence and power recorded',
    streamsMissing: (m: string) => `missing: ${m}`,
    trailing: (d: string) => `recording ran ${d} after the last movement: stopped or saved late`,
    unexplained: (gap: string, paused: string) => `elapsed exceeds moving by ${gap}, only ${paused} of it are pauses`,
    stoppedPaused: (gap: string) => `stopped cleanly; ${gap} paused in total`,
    stopped: 'stopped cleanly',
    gapsProblem: (n: number, worst: string) => `${n} gap(s) in the streams, longest ${worst}`,
    gapsWarn: (n: number, s: number, worst: string) => `${n} gap(s) over ${s} s, longest ${worst}`,
    gapsOk: 'no gaps in the streams',
    dup: (list: string) => `overlaps in time with ${list}: two recordings of one run?`,
    dupOk: 'no other activity in the same time window',
    corrupt: (km: number, h: number, v: number) => `${km} km in ${h} h moving is ${v} m/s: the file looks corrupt`,
    noDistance: (m: number, d: string) => `only ${m} m in ${d}: distance wasn't recorded`,
    tooFast: (v: number) => `${v} m/s is faster than any runner`,
    totalsOk: (km: number, d: string) => `${km} km in ${d}`,
    lapsNoPlan: (n: number) => `${n} lap(s); no structured plan to compare`,
    lapsOk: (n: number) => `${n} laps, one per planned step`,
    lapsOff: (n: number, p: number) => `${n} lap(s) for ${p} planned steps: the workout didn't run step by step on the watch`,
    noHr: 'no HR stream',
    lock: (tol: number, d: string) => `HR matched step rate (±${tol}) for ${d} at easy pace: wrist HR likely locked onto cadence`,
    lockOk: 'HR independent of step rate',
    lockMaybe: (d: string) => `HR 155–190 for ${d} at easy pace; no cadence stream to confirm, possibly locked onto step rate`,
    lockMaybeOk: 'no sign of cadence lock (no cadence stream)',
    syncUnknown: 'arrival time not recorded',
    syncLate: (d: string) => `arrived ${d} after the run ended`,
    syncOk: (d: string) => `arrived ${d} after the run ended`,
  },
  de: {
    streamsOk: 'GPS, Puls, Kadenz und Leistung aufgezeichnet',
    streamsMissing: (m: string) => `fehlt: ${m}`,
    trailing: (d: string) => `Aufzeichnung lief nach der letzten Bewegung noch ${d} weiter: zu spät gestoppt oder gesichert`,
    unexplained: (gap: string, paused: string) => `Gesamtzeit liegt ${gap} über der Bewegungszeit, davon nur ${paused} Pausen`,
    stoppedPaused: (gap: string) => `sauber gestoppt; ${gap} Pause insgesamt`,
    stopped: 'sauber gestoppt',
    gapsProblem: (n: number, worst: string) => `${n} Lücke(n) in den Daten, längste ${worst}`,
    gapsWarn: (n: number, s: number, worst: string) => `${n} Lücke(n) über ${s} s, längste ${worst}`,
    gapsOk: 'keine Lücken in den Daten',
    dup: (list: string) => `überschneidet sich zeitlich mit ${list}: zwei Aufzeichnungen eines Laufs?`,
    dupOk: 'keine andere Aktivität im selben Zeitraum',
    corrupt: (km: number, h: number, v: number) => `${km} km in ${h} h Bewegungszeit sind ${v} m/s: die Datei ist offenbar beschädigt`,
    noDistance: (m: number, d: string) => `nur ${m} m in ${d}: Distanz wurde nicht aufgezeichnet`,
    tooFast: (v: number) => `${v} m/s ist schneller als jeder Läufer`,
    totalsOk: (km: number, d: string) => `${km} km in ${d}`,
    lapsNoPlan: (n: number) => `${n} Runde(n); kein strukturierter Plan zum Vergleich`,
    lapsOk: (n: number) => `${n} Runden, eine pro geplantem Schritt`,
    lapsOff: (n: number, p: number) => `${n} Runde(n) für ${p} geplante Schritte: das Workout lief nicht Schritt für Schritt auf der Uhr`,
    noHr: 'keine Pulsdaten',
    lock: (tol: number, d: string) => `Puls lag ${d} lang bei der Schrittfrequenz (±${tol}) bei lockerem Tempo: der Handgelenkssensor hat vermutlich die Kadenz erfasst`,
    lockOk: 'Puls unabhängig von der Schrittfrequenz',
    lockMaybe: (d: string) => `Puls 155–190 für ${d} bei lockerem Tempo; ohne Kadenzdaten nicht prüfbar, evtl. Schrittfrequenz statt Puls`,
    lockMaybeOk: 'kein Hinweis auf Kadenz-Lock (keine Kadenzdaten)',
    syncUnknown: 'Ankunftszeit nicht erfasst',
    syncLate: (d: string) => `kam ${d} nach Laufende an`,
    syncOk: (d: string) => `kam ${d} nach Laufende an`,
  },
} satisfies Record<Lang, unknown>;

const check = (id: RunFeedbackCheck['id'], status: RunFeedbackCheck['status'], reason: string): RunFeedbackCheck => ({ id, status, reason });
const STREAM_NAMES = { en: { GPS: 'GPS', HR: 'HR', cadence: 'cadence', power: 'power' }, de: { GPS: 'GPS', HR: 'Puls', cadence: 'Kadenz', power: 'Leistung' } };

export function checkStreams(a: RunInput, s: Streams, lang: Lang = 'en'): RunFeedbackCheck {
  const missing = [!s.latlng && 'GPS', !s.heartrate && 'HR', !s.cadence && 'cadence', !s.watts && 'power'].filter(Boolean) as (keyof (typeof STREAM_NAMES)['en'])[];
  if (!missing.length) return check('streams', 'ok', MSG[lang].streamsOk);
  const list = missing.map((m) => STREAM_NAMES[lang][m]).join(', ');
  const outdoor = a.sportType !== 'VirtualRun';
  if (missing.includes('HR') || (missing.includes('GPS') && outdoor)) return check('streams', 'problem', MSG[lang].streamsMissing(list));
  return check('streams', 'warning', MSG[lang].streamsMissing(list));
}

/** In-run stops: gaps between samples or stretches flagged not-moving, followed by more movement. */
export function findPauses(s: Streams, minS = 20): { atS: number; durationS: number }[] {
  const out: { atS: number; durationS: number }[] = [];
  const n = s.time.length;
  const lastMoving = lastMovingIndex(s);
  let i = 0;
  while (i < lastMoving) {
    const gap = s.time[i + 1] - s.time[i];
    if (s.moving && !s.moving[i + 1]) {
      // a stretch of stationary samples
      let j = i + 1;
      while (j < n && !s.moving[j]) j++;
      if (j >= n) break;
      const d = s.time[j] - s.time[i];
      if (d >= minS) out.push({ atS: s.time[i], durationS: round(d) });
      i = j;
      continue;
    }
    if (gap >= minS) out.push({ atS: s.time[i], durationS: round(gap) });
    i++;
  }
  return out;
}

function lastMovingIndex(s: Streams): number {
  const n = s.time.length;
  if (!s.moving) return n - 1;
  for (let i = n - 1; i >= 0; i--) if (s.moving[i]) return i;
  return 0;
}

/** Elapsed vs moving, and recording left running after the last movement (watch not stopped/saved). */
export function checkStopSave(a: RunInput, s: Streams, lang: Lang = 'en'): RunFeedbackCheck {
  const n = s.time.length;
  // the streams can end before the elapsed time does (or be downsampled), so measure to whichever is later
  const trailing = n ? Math.max(s.time[n - 1], a.elapsedTimeS) - s.time[lastMovingIndex(s)] : 0;
  if (trailing > 120) return check('stopSave', 'problem', MSG[lang].trailing(fmtMin(trailing)));
  const gap = a.elapsedTimeS - a.movingTimeS;
  const paused = findPauses(s).reduce((sum, p) => sum + p.durationS, 0);
  const unexplained = gap - paused - trailing;
  if (unexplained > Math.max(300, 0.1 * a.movingTimeS)) return check('stopSave', 'warning', MSG[lang].unexplained(fmtMin(gap), fmtMin(paused)));
  return check('stopSave', 'ok', gap > 30 ? MSG[lang].stoppedPaused(fmtMin(gap)) : MSG[lang].stopped);
}

export function checkGaps(s: Streams, lang: Lang = 'en', warnS = 120, problemS = 600): RunFeedbackCheck {
  const last = lastMovingIndex(s);
  let worst = 0;
  let count = 0;
  for (let i = 0; i < last; i++) {
    const g = s.time[i + 1] - s.time[i];
    if (g > warnS) count++;
    worst = Math.max(worst, g);
  }
  if (worst > problemS) return check('gaps', 'problem', MSG[lang].gapsProblem(count, fmtMin(worst)));
  if (count) return check('gaps', 'warning', MSG[lang].gapsWarn(count, warnS, fmtMin(worst)));
  return check('gaps', 'ok', MSG[lang].gapsOk);
}

export function checkDuplicates(a: RunInput, others: OtherActivity[], lang: Lang = 'en'): RunFeedbackCheck {
  const start = Date.parse(a.startDate);
  const end = start + a.elapsedTimeS * 1000;
  const overlap = others.filter((o) => {
    if (o.id === a.id) return false;
    const os = Date.parse(o.startDate);
    return os < end && os + o.elapsedTimeS * 1000 > start;
  });
  if (overlap.length) return check('duplicates', 'problem', MSG[lang].dup(overlap.map((o) => `"${o.name}" (${o.id})`).join(', ')));
  return check('duplicates', 'ok', MSG[lang].dupOk);
}

export function checkTotals(a: RunInput, lang: Lang = 'en'): RunFeedbackCheck {
  const speed = a.movingTimeS ? a.distanceM / a.movingTimeS : 0;
  const run = /Run/.test(a.sportType);
  if (run && a.movingTimeS > 3600 && speed < 1.5) return check('totals', 'problem', MSG[lang].corrupt(round(a.distanceM / 1000, 1), round(a.movingTimeS / 3600, 1), round(speed, 2)));
  const time = Math.max(a.movingTimeS, a.elapsedTimeS);
  if (run && time > 600 && a.distanceM < 200) return check('totals', 'problem', MSG[lang].noDistance(round(a.distanceM), fmtMin(time)));
  if (run && speed > 7) return check('totals', 'problem', MSG[lang].tooFast(round(speed, 1)));
  return check('totals', 'ok', MSG[lang].totalsOk(round(a.distanceM / 1000, 2), fmtMin(a.movingTimeS)));
}

export function checkLaps(plan: PlannedWorkout | null, laps: Lap[], lang: Lang = 'en'): RunFeedbackCheck {
  if (!plan?.steps.length) return check('laps', 'ok', MSG[lang].lapsNoPlan(laps.length));
  if (laps.length === plan.steps.length) return check('laps', 'ok', MSG[lang].lapsOk(laps.length));
  return check('laps', 'warning', MSG[lang].lapsOff(laps.length, plan.steps.length));
}

/**
 * The wrist sensor locking onto step rate: HR within a few bpm of steps/min for minutes at an
 * easy pace. Without a cadence stream, a sustained HR in typical step-rate range at easy pace is
 * reported as "possible".
 */
export function checkCadenceLock(s: Streams, lang: Lang = 'en', opts: { easySpeed?: number; tolBpm?: number; minS?: number } = {}): RunFeedbackCheck {
  const easy = opts.easySpeed ?? 2.67; // slower than 6:15/km
  const tol = opts.tolBpm ?? 4;
  const minS = opts.minS ?? 180;
  if (!s.heartrate) return check('cadenceLock', 'ok', MSG[lang].noHr);
  const w = weights(s.time);
  let run = 0;
  let longest = 0;
  let suspicious = 0;
  for (let i = 0; i < s.time.length; i++) {
    const hr = s.heartrate[i];
    const v = s.velocity?.[i];
    const easyHere = v != null && v > 0.5 && v < easy;
    if (s.cadence) {
      const spm = s.cadence[i] * 2;
      if (easyHere && spm > 120 && Math.abs(hr - spm) <= tol) run += w[i];
      else run = 0;
      longest = Math.max(longest, run);
    } else if (easyHere && hr >= 155 && hr <= 190) suspicious += w[i];
  }
  if (s.cadence) {
    if (longest >= minS) return check('cadenceLock', 'problem', MSG[lang].lock(tol, fmtMin(longest)));
    return check('cadenceLock', 'ok', MSG[lang].lockOk);
  }
  if (suspicious >= 300) return check('cadenceLock', 'warning', MSG[lang].lockMaybe(fmtMin(suspicious)));
  return check('cadenceLock', 'ok', MSG[lang].lockMaybeOk);
}

export function checkSyncLatency(a: RunInput, lang: Lang = 'en'): RunFeedbackCheck {
  if (!a.receivedAt) return check('syncLatency', 'ok', MSG[lang].syncUnknown);
  const end = Date.parse(a.startDate) + a.elapsedTimeS * 1000;
  const lag = (Date.parse(a.receivedAt) - end) / 1000;
  if (lag > 3600) return check('syncLatency', 'warning', MSG[lang].syncLate(fmtMin(lag)));
  return check('syncLatency', 'ok', MSG[lang].syncOk(fmtMin(Math.max(0, lag))));
}

// ---------- everything together ----------

export interface FeedbackInput {
  activity: RunInput;
  streams: Streams;
  laps: Lap[];
  plan: PlannedWorkout | null;
  zones: RunFeedbackZone[];
  others?: OtherActivity[];
  /** Where the plan came from, for the UI. */
  planSource?: RunFeedback['plan']['source'];
  /** Language of the check reasons. */
  lang?: Lang;
  now?: string;
}

/** HR strip for the UI: at most `max` points. */
function hrStrip(s: Streams, max = 160): { t: number[]; bpm: number[] } {
  if (!s.heartrate) return { t: [], bpm: [] };
  const step = Math.max(1, Math.ceil(s.time.length / max));
  const t: number[] = [];
  const bpm: number[] = [];
  for (let i = 0; i < s.time.length; i += step) {
    t.push(s.time[i]);
    bpm.push(s.heartrate[i]);
  }
  return { t, bpm };
}

export function computeFeedback(inp: FeedbackInput): RunFeedback {
  const { activity: a, streams: s, laps, plan, zones } = inp;
  const mt = movingClock(s);
  const w = weights(s.time);
  const al = plan ? alignSteps(plan, s, laps) : { method: 'none' as const, windows: [], note: 'no planned workout for this day' };
  const steps = plan ? plan.steps.map((st, i) => stepResult(st, s, al.windows[i] ?? [s.time.length, s.time.length], zones, mt, w)) : [];
  const targeted = steps.filter((x) => x.planned.hrZones && x.inZonePct != null);
  const targetedS = targeted.reduce((sum, x) => sum + x.actual.movingS, 0);
  const inZonePct = targetedS ? round(targeted.reduce((sum, x) => sum + (x.inZonePct! * x.actual.movingS) / 100, 0) / (targetedS / 100)) : undefined;
  const plannedTimeS = plan?.steps.reduce((sum, x) => sum + (x.durationS ?? (x.distanceM ? (x.distanceM / 1000) * 405 : 0)), 0);
  const lang = inp.lang ?? 'en';
  const checks = [
    checkStreams(a, s, lang),
    checkStopSave(a, s, lang),
    checkGaps(s, lang),
    checkDuplicates(a, inp.others ?? [], lang),
    checkTotals(a, lang),
    checkLaps(plan, laps, lang),
    checkCadenceLock(s, lang),
    checkSyncLatency(a, lang),
  ];
  // zone verdicts are unreliable when HR itself is in doubt
  const hrDoubt = !s.heartrate || checks.some((c) => c.id === 'cadenceLock' && c.status !== 'ok');
  return {
    activityId: a.id,
    activityName: a.name,
    startDateLocal: a.startDateLocal,
    computedAt: inp.now ?? new Date().toISOString(),
    lang,
    ...(a.deviceName ? { deviceName: a.deviceName } : {}),
    plan: { source: plan ? (inp.planSource ?? 'intervals') : 'none', name: plan?.name ?? '', topLevelSteps: plan?.topLevelSteps ?? 0, steps: plan?.steps.length ?? 0 },
    alignment: { method: al.method, note: al.note },
    steps,
    overall: {
      ...(inZonePct != null ? { inZonePct } : {}),
      stepsCompleted: steps.filter((x) => x.completed).length,
      stepsPlanned: steps.length,
      movingS: a.movingTimeS,
      elapsedS: a.elapsedTimeS,
      distanceM: round(a.distanceM),
      ...(plannedTimeS ? { plannedTimeS: round(plannedTimeS) } : {}),
      zoneVerdictReliable: !hrDoubt,
    },
    zones,
    pauses: findPauses(s),
    checks,
    hr: hrStrip(s),
  };
}
