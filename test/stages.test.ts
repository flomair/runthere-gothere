import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIN_BASELINE_M, baselineFor, bonusLeaders, evaluateStage, stageWins, validateStage } from '../shared/stages';
import type { Activity, Group, Stage } from '../shared/types';
import { setPushSender } from '../server/push';
import { setRepo } from '../server/repo';
import { memoryRepo } from '../server/repo-memory';
import { bearer, fakeVerify, req } from './helpers';

vi.mock('../server/firebase', () => ({
  verifyIdToken: async (t: string) => fakeVerify(t),
  db: () => {
    throw new Error('no Firestore in tests');
  },
  messaging: () => {
    throw new Error('no FCM in tests');
  },
}));

let nextId = 1;
const act = (day: string, km: number, extra: Partial<Activity> = {}): Activity => ({
  id: nextId++,
  name: 'Run',
  sportType: 'Run',
  distanceM: km * 1000,
  movingTimeS: km * 330,
  elevationGainM: 0,
  startDate: `${day}T05:00:00Z`,
  startDateLocal: `${day}T07:00:00Z`,
  ...extra,
});

const stage = (over: Partial<Stage> = {}): Stage => ({
  id: 's1',
  groupId: 'g1',
  name: 'Dresden → Prague',
  fromM: 0,
  toM: 150_000,
  startDate: '2026-10-01',
  endDate: '2026-10-14',
  participants: ['anna', 'ben'],
  prize: { text: 'Coffee', fulfillment: { kind: 'promise', status: 'pending' } },
  createdBy: 'anna',
  createdAt: '2026-09-25T00:00:00Z',
  status: 'scheduled',
  ...over,
});

describe('stage maths', () => {
  it('baseline = average weekly distance of the 4 weeks before the start (tracked runs of the group sports only)', () => {
    const acts = [
      act('2026-09-02', 99), // 29 days before: outside
      act('2026-09-03', 20),
      act('2026-09-20', 20),
      act('2026-09-30', 40),
      act('2026-10-01', 50), // start day: not part of the baseline
      act('2026-09-10', 30, { manual: true }),
      act('2026-09-11', 60, { sportType: 'Ride' }),
    ];
    expect(baselineFor(acts, '2026-10-01', ['Run'])).toBe(20_000);
  });

  it('effort compares the window with the locked baseline; a small baseline counts as the minimum', () => {
    const acts = {
      // Anna usually runs 40 km a week, Ben almost nothing
      anna: [act('2026-09-10', 80), act('2026-09-20', 80), act('2026-10-02', 60), act('2026-10-09', 20)],
      ben: [act('2026-09-12', 4), act('2026-10-03', 12), act('2026-10-10', 5, { manual: true })],
    };
    const s = evaluateStage(stage(), acts, ['Run'], '2026-10-05');
    expect(s.status).toBe('running');
    expect(s.baselines).toEqual({ anna: 40_000, ben: 1_000 });
    // Anna: 80 km / (40 km × 2 weeks) = 100 %; Ben: 12 km / (5 km minimum × 2 weeks) = 120 %
    expect(s.results!.map((r) => [r.uid, r.distanceM, Math.round(r.effort * 100)])).toEqual([
      ['ben', 12_000, 120],
      ['anna', 80_000, 100],
    ]);
    expect(s.leaderUid).toBe('ben');
    expect(MIN_BASELINE_M).toBe(5000);

    // the locked baseline doesn't move when older runs show up later
    const later = evaluateStage(s, { ...acts, anna: [...acts.anna, act('2026-09-25', 200)] }, ['Run'], '2026-10-06');
    expect(later.baselines).toEqual({ anna: 40_000, ben: 1_000 });
  });

  it('is scheduled before the start, finishes a day after the end (grace for late uploads) and picks the winner', () => {
    const acts = { anna: [act('2026-10-02', 30)], ben: [act('2026-10-14', 31)] };
    expect(evaluateStage(stage(), acts, ['Run'], '2026-09-30').status).toBe('scheduled');
    expect(evaluateStage(stage(), acts, ['Run'], '2026-10-15').status).toBe('running');
    const done = evaluateStage(stage(), acts, ['Run'], '2026-10-16');
    expect(done).toMatchObject({ status: 'finished', winnerUid: 'ben' });
    // once finished, nothing changes any more
    expect(evaluateStage(done, { anna: [act('2026-10-05', 500)] }, ['Run'], '2026-10-20')).toBe(done);
  });

  it('nobody ran → no winner; wins and bonus leaders are counted from finished stages', () => {
    expect(evaluateStage(stage(), {}, ['Run'], '2026-10-20')).toMatchObject({ status: 'finished', winnerUid: undefined });
    const list = [stage({ id: 'a', status: 'finished', winnerUid: 'anna' }), stage({ id: 'b', status: 'finished', winnerUid: 'ben' }), stage({ id: 'c', status: 'finished', winnerUid: 'anna' }), stage({ id: 'd', status: 'running', leaderUid: 'ben' })];
    expect(stageWins(list)).toEqual({ anna: 2, ben: 1 });
    expect(bonusLeaders(list)).toEqual(['anna']);
    expect(bonusLeaders(list.slice(0, 2)).sort()).toEqual(['anna', 'ben']);
  });

  it('validates new stages', () => {
    const ok = { fromM: 0, toM: 50_000, startDate: '2026-10-01', days: 14, participants: ['anna', 'ben'] };
    expect(validateStage(ok, 100_000, ['anna', 'ben'], '2026-09-30')).toBeNull();
    expect(validateStage({ ...ok, participants: ['anna'] }, 100_000, ['anna', 'ben'], '2026-09-30')).toMatch(/two runners/);
    expect(validateStage({ ...ok, participants: ['anna', 'eve'] }, 100_000, ['anna', 'ben'], '2026-09-30')).toMatch(/members/);
    expect(validateStage({ ...ok, startDate: '2026-09-01' }, 100_000, ['anna', 'ben'], '2026-09-30')).toMatch(/start/);
    expect(validateStage({ ...ok, toM: 500 }, 100_000, ['anna', 'ben'], '2026-09-30')).toMatch(/segment/);
  });
});

describe('stage API', () => {
  let store: ReturnType<typeof memoryRepo>;
  let pushes: { to: string; title: string }[];
  const ANNA = bearer('anna', 'anna@example.com');
  const BEN = bearer('ben', 'ben@example.com');
  const EVE = bearer('eve', 'eve@example.com');
  const today = new Date().toISOString().slice(0, 10);
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  beforeEach(async () => {
    process.env.SESSION_SECRET = 'test-secret-that-is-long-enough';
    process.env.ADMIN_EMAILS = '';
    store = memoryRepo();
    setRepo(store);
    pushes = [];
    for (const uid of ['anna', 'ben', 'eve']) {
      await store.allow({ email: `${uid}@example.com`, addedBy: 'x', addedAt: 'x' });
      await store.addPushToken(uid, `token-${uid}-aaaaaaaaaaaaaaaaaaaa`);
    }
    setPushSender(async (tokens, data) => {
      pushes.push({ to: tokens[0].split('-')[1], title: data.title });
      return tokens.map((token) => ({ token, ok: true }));
    });
    const g = {
      id: 'g1', name: 'Berlin → Vienna', mode: 'race', ownerUid: 'anna', memberUids: ['anna', 'ben'], invitedEmails: [],
      route: { points: [[52.5, 13.4], [48.2, 16.4]], totalM: 600_000, provider: 't' }, waypoints: [], startDate: '2026-01-01', sportTypes: ['Run'], createdAt: 'x',
      members: { anna: { uid: 'anna', name: 'Anna', email: 'anna@example.com', joinedAt: 'x' }, ben: { uid: 'ben', name: 'Ben', email: 'ben@example.com', joinedAt: 'x' } },
    } as unknown as Group;
    await store.putGroup(g);
  });
  afterEach(() => setPushSender(null));

  async function call<T>(who: Record<string, string>, method: 'GET' | 'POST' | 'PATCH', json?: unknown) {
    const mod = await import('../routes/groups/stages');
    const url = method === 'GET' ? '/api/groups/stages?id=g1' : '/api/groups/stages';
    const res = await mod[method](req(url, { method, headers: who, json }));
    return { status: res.status, body: (await res.json()) as T };
  }

  it('sets up a stage, locks baselines at the start, notifies lead changes and the winner', async () => {
    // Anna's usual: 20 km/week; Ben's: 10 km/week
    await store.putActivities('anna', [act(day(-10), 80)]);
    await store.putActivities('ben', [act(day(-12), 40)]);

    expect((await call(EVE, 'POST', { id: 'g1', fromM: 0, toM: 100_000, startDate: today, days: 7, participants: ['anna', 'ben'], prize: 'Coffee' })).status).toBe(404);
    expect((await call(ANNA, 'POST', { id: 'g1', fromM: 0, toM: 100_000, startDate: today, days: 7, participants: ['anna', 'ben'], prize: '' })).status).toBe(400);
    const created = await call<{ stage: Stage }>(ANNA, 'POST', { id: 'g1', name: 'Dresden → Prague', fromM: 0, toM: 100_000, startDate: today, days: 7, participants: ['anna', 'ben', 'ben'], prize: 'Coffee' });
    expect(created.body.stage).toMatchObject({ status: 'scheduled', participants: ['anna', 'ben'], endDate: day(6), prize: { text: 'Coffee', fulfillment: { status: 'pending' } } });
    expect(pushes).toEqual([{ to: 'ben', title: '🚩 New race stage: Dresden → Prague' }]);
    const feed = await store.listFeed('g1');
    expect(feed[0]).toMatchObject({ type: 'stage', uid: 'anna' });

    // Anna runs first: she leads (first leader: no notification)
    await store.putActivities('anna', [act(today, 10)]);
    let list = await call<{ stages: Stage[] }>(BEN, 'GET');
    expect(list.body.stages[0]).toMatchObject({ status: 'running', baselines: { anna: 20_000, ben: 10_000 }, leaderUid: 'anna' });
    expect(pushes.length).toBe(1);

    // Ben runs 8 km: 8/10 = 80 % beats Anna's 10/20 = 50 % → lead change, both notified
    await store.putActivities('ben', [act(today, 8)]);
    list = await call<{ stages: Stage[] }>(ANNA, 'GET');
    expect(list.body.stages[0].leaderUid).toBe('ben');
    expect(pushes.slice(1)).toEqual([
      { to: 'anna', title: '👑 Ben takes the lead in Dresden → Prague' },
      { to: 'ben', title: '👑 You take the lead in Dresden → Prague' },
    ]);
    // no change → no new notifications
    await call(ANNA, 'GET');
    expect(pushes.length).toBe(3);

    // manual entries don't count
    await store.putActivities('anna', [act(today, 50, { manual: true })]);
    list = await call<{ stages: Stage[] }>(ANNA, 'GET');
    expect(list.body.stages[0].leaderUid).toBe('ben');

    // time passes: the stage finishes, Ben wins
    const { refreshStages } = await import('../server/stages');
    const g = (await store.getGroup('g1'))!;
    const done = await refreshStages(g, Date.now() + 9 * 86_400_000);
    expect(done[0]).toMatchObject({ status: 'finished', winnerUid: 'ben' });
    expect(pushes.slice(-2)).toEqual([
      { to: 'anna', title: '🏆 Ben wins Dresden → Prague' },
      { to: 'ben', title: '🏆 You win Dresden → Prague!' },
    ]);

    // only the creator marks the prize delivered
    expect((await call(BEN, 'PATCH', { id: 'g1', stageId: done[0].id, action: 'delivered' })).status).toBe(403);
    const del = await call<{ stage: Stage }>(ANNA, 'PATCH', { id: 'g1', stageId: done[0].id, action: 'delivered' });
    expect(del.body.stage.prize.fulfillment.status).toBe('fulfilled');
  });

  it('the owner sets the bonus prize for the most stage wins', async () => {
    const bonus = await import('../routes/groups/bonus');
    const post = (who: Record<string, string>, json: unknown) => bonus.POST(req('/api/groups/bonus', { method: 'POST', headers: who, json }));
    expect((await post(BEN, { id: 'g1', text: 'Weekend in Vienna' })).status).toBe(403);
    const ok = (await (await post(ANNA, { id: 'g1', text: 'Weekend in Vienna' })).json()) as { group: Group };
    expect(ok.group.bonusPrize).toMatchObject({ text: 'Weekend in Vienna', setBy: 'anna', fulfillment: { kind: 'promise', status: 'pending' } });
    expect((await post(BEN, { id: 'g1', action: 'delivered' })).status).toBe(403);
    const del = (await (await post(ANNA, { id: 'g1', action: 'delivered' })).json()) as { group: Group };
    expect(del.group.bonusPrize?.fulfillment.status).toBe('fulfilled');
  });
});
