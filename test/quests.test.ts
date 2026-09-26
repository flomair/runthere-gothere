import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateQuest, questFraction, questTitle, validateQuest } from '../shared/quests';
import type { Activity, Group, Journey, Quest } from '../shared/types';
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

const run = (id: number, at: string, km: number, min = km * 5.5, sportType = 'Run'): Activity => ({
  id,
  name: `Run ${id}`,
  sportType,
  distanceM: km * 1000,
  movingTimeS: Math.round(min * 60),
  elevationGainM: 0,
  startDate: at,
  startDateLocal: at,
});

const base = (over: Partial<Quest>): Quest => ({
  id: 'q',
  type: 'distance',
  params: { distanceM: 30_000 },
  days: 7,
  from: { uid: 'anna', email: 'anna@example.com', name: 'Anna' },
  to: { uid: 'me', email: 'me@example.com', name: 'Me' },
  gift: { text: 'Pizza', fulfillment: { kind: 'promise', status: 'pending' } },
  status: 'accepted',
  createdAt: '2026-09-01T10:00:00.000Z',
  startsAt: '2026-09-01T10:00:00.000Z',
  endsAt: '2026-09-08T10:00:00.000Z',
  ...over,
});
const T = (iso: string) => Date.parse(iso);

describe('quest evaluation', () => {
  it('distance: counts only runs inside the window and wins when the total is reached', () => {
    const q = base({});
    const runs = [run(1, '2026-09-01T09:59:00Z', 50), run(2, '2026-09-02T06:00:00Z', 12), run(3, '2026-09-03T06:00:00Z', 10, 60, 'Ride'), run(4, '2026-09-05T06:00:00Z', 20)];
    const mid = evaluateQuest(q, runs.slice(0, 3), [], T('2026-09-04T00:00:00Z'));
    expect(mid).toMatchObject({ status: 'accepted', progress: { value: 12_000, target: 30_000 } });
    const done = evaluateQuest(q, runs, [], T('2026-09-06T00:00:00Z'));
    expect(done).toMatchObject({ status: 'won', resolvedAt: '2026-09-05T06:00:00.000Z', winnerUid: 'me' });
    // the window end is exclusive
    const late = evaluateQuest(q, [run(5, '2026-09-08T10:00:00Z', 40)], [], T('2026-09-09T00:00:00Z'));
    expect(late).toMatchObject({ status: 'lost', resolvedAt: '2026-09-08T10:00:00.000Z' });
  });

  it('habit: every week needs N runs; a missed week loses at once', () => {
    const q = base({ type: 'habit', params: { runsPerWeek: 2 }, days: 14, endsAt: '2026-09-15T10:00:00.000Z' });
    const w1 = [run(1, '2026-09-02T06:00:00Z', 5), run(2, '2026-09-04T06:00:00Z', 5)];
    expect(evaluateQuest(q, w1, [], T('2026-09-09T00:00:00Z'))).toMatchObject({ status: 'accepted', progress: { value: 1, target: 2, weekRuns: 0 } });
    const both = [...w1, run(3, '2026-09-09T06:00:00Z', 5), run(4, '2026-09-10T06:00:00Z', 5)];
    expect(evaluateQuest(q, both, [], T('2026-09-11T00:00:00Z'))).toMatchObject({ status: 'won', resolvedAt: '2026-09-10T06:00:00.000Z' });
    const missed = [run(1, '2026-09-02T06:00:00Z', 5)];
    expect(evaluateQuest(q, missed, [], T('2026-09-08T11:00:00Z'))).toMatchObject({ status: 'lost', resolvedAt: '2026-09-08T10:00:00.000Z' });
  });

  it('race: the first to reach the distance wins; nobody → expired', () => {
    const q = base({ type: 'race', params: { distanceM: 20_000 } });
    const mine = [run(1, '2026-09-02T06:00:00Z', 10), run(2, '2026-09-04T06:00:00Z', 10)];
    const hers = [run(9, '2026-09-03T06:00:00Z', 21)];
    expect(evaluateQuest(q, mine, hers, T('2026-09-05T00:00:00Z'))).toMatchObject({ status: 'lost', winnerUid: 'anna', progress: { value: 20_000, rival: 21_000 } });
    expect(evaluateQuest(q, mine, [], T('2026-09-05T00:00:00Z'))).toMatchObject({ status: 'won', winnerUid: 'me' });
    expect(evaluateQuest(q, [], [run(9, '2026-09-03T06:00:00Z', 5)], T('2026-09-09T00:00:00Z'))).toMatchObject({ status: 'expired' });
  });

  it('speed: one run at least that long, fast enough on average pace', () => {
    const q = base({ type: 'speed', params: { distanceM: 10_000, timeS: 50 * 60 } });
    const slow = [run(1, '2026-09-02T06:00:00Z', 10, 55), run(2, '2026-09-03T06:00:00Z', 5, 20)];
    expect(evaluateQuest(q, slow, [], T('2026-09-04T00:00:00Z'))).toMatchObject({ status: 'accepted', progress: { bestS: 55 * 60 } });
    // 12 km in 58 min = 10 km in 48:20
    const fast = [...slow, run(3, '2026-09-05T06:00:00Z', 12, 58)];
    expect(evaluateQuest(q, fast, [], T('2026-09-06T00:00:00Z'))).toMatchObject({ status: 'won', resolvedAt: '2026-09-05T06:00:00.000Z' });
  });

  it('offers expire after two weeks without an answer', () => {
    const q = base({ status: 'offered', startsAt: undefined, endsAt: undefined });
    expect(evaluateQuest(q, [], [], T('2026-09-10T00:00:00Z')).status).toBe('offered');
    expect(evaluateQuest(q, [], [], T('2026-09-16T00:00:00Z')).status).toBe('expired');
  });

  it('validates input and writes titles in both languages', () => {
    expect(validateQuest('distance', { distanceM: 50_000 }, 14)).toBeNull();
    expect(validateQuest('distance', { distanceM: 10 }, 14)).toMatch(/distance/);
    expect(validateQuest('habit', { runsPerWeek: 3 }, 10)).toMatch(/whole weeks/);
    expect(validateQuest('speed', { distanceM: 5000 }, 7)).toMatch(/time/);
    expect(questTitle(base({}))).toBe('30 km in 7 days');
    expect(questTitle(base({ type: 'speed', params: { distanceM: 10_000, timeS: 2950 } }), 'de')).toBe('10 km unter 49:10');
    expect(questTitle(base({ type: 'habit', params: { runsPerWeek: 3 }, days: 21 }))).toBe('3 runs a week for 3 weeks');
    expect(questFraction(base({ progress: { value: 15_000, target: 30_000, updatedAt: 'x' } }))).toBe(0.5);
  });
});

describe('quest API', () => {
  let store: ReturnType<typeof memoryRepo>;
  let pushes: { to: string; data: Record<string, string> }[];
  const ANNA = bearer('anna', 'anna@example.com');
  const ME = bearer('me', 'me@example.com');
  const EVE = bearer('eve', 'eve@example.com');

  beforeEach(async () => {
    process.env.SESSION_SECRET = 'test-secret-that-is-long-enough';
    process.env.ADMIN_EMAILS = 'admin@example.com';
    store = memoryRepo();
    setRepo(store);
    pushes = [];
    for (const [uid, email] of [['anna', 'anna@example.com'], ['me', 'me@example.com'], ['eve', 'eve@example.com']]) {
      await store.allow({ email, addedBy: 'admin@example.com', addedAt: 'x' });
      await store.updateUser(uid, { email, name: uid[0].toUpperCase() + uid.slice(1) });
      await store.addPushToken(uid, `token-${uid}-aaaaaaaaaaaaaaaaaaaa`);
    }
    setPushSender(async (tokens, data) => {
      pushes.push({ to: tokens[0].split('-')[1], data });
      return tokens.map((token) => ({ token, ok: true }));
    });
    // Anna and I share a journey, so we are friends
    const g = { id: 'g1', name: 'Us', mode: 'race', ownerUid: 'anna', memberUids: ['anna', 'me'], invitedEmails: [], route: { points: [[52, 13], [51, 13]], totalM: 111_000, provider: 't' }, waypoints: [], startDate: '2026-09-01', sportTypes: ['Run'], createdAt: 'x',
      members: { anna: { uid: 'anna', name: 'Anna', email: 'anna@example.com', joinedAt: 'x' }, me: { uid: 'me', name: 'Me', email: 'me@example.com', joinedAt: 'x' } } } as unknown as Group;
    await store.putGroup(g);
    const j: Journey = { id: 'j1', name: 'Mine', createdAt: 'x', startDate: '2026-09-01', sportTypes: ['Run'], useStrava: true, manualEntries: [], excludedActivityIds: [], waypoints: [], mode: 'foot', route: { points: [[52, 13], [51, 13]], totalM: 111_000, provider: 't' } };
    await store.putJourney('me', j);
    await store.putActivities('me', [run(1, '2026-09-02T06:00:00Z', 8)]);
  });
  afterEach(() => setPushSender(null));

  async function call<T>(who: Record<string, string>, method: 'GET' | 'POST' | 'PATCH', json?: unknown) {
    const mod = await import('../routes/quests');
    const res = await mod[method](req('/api/quests', { method, headers: who, json }));
    return { status: res.status, body: (await res.json()) as T };
  }

  it('offers, accepts, tracks progress on runs, completes with a badge and lets the challenger deliver', async () => {
    const friends = await (await import('../routes/quests/friends')).GET(req('/api/quests/friends', { headers: ANNA }));
    expect(((await friends.json()) as { friends: { email: string }[] }).friends.map((f) => f.email)).toEqual(['me@example.com']);

    const bad = await call(ANNA, 'POST', { toEmail: 'me@example.com', type: 'distance', params: { distanceM: 20_000 }, days: 7, gift: '' });
    expect(bad.status).toBe(400);
    const { body } = await call<{ quest: Quest }>(ANNA, 'POST', { toEmail: 'me@example.com', type: 'distance', params: { distanceM: 20_000, timeS: 99 }, days: 7, gift: 'Pizza', penalty: 'Sing in the rain' });
    const q = body.quest;
    expect(q).toMatchObject({ status: 'offered', params: { distanceM: 20_000 }, to: { uid: 'me', name: 'Me' }, gift: { text: 'Pizza', fulfillment: { kind: 'promise', status: 'pending' } } });
    expect(pushes.at(-1)).toMatchObject({ to: 'me', data: { title: '⚔️ anna challenges you', url: '/#/quests' } });

    // Eve is not part of it; Anna can't answer her own offer
    expect((await call(EVE, 'PATCH', { id: q.id, action: 'accept' })).status).toBe(404);
    expect((await call(ANNA, 'PATCH', { id: q.id, action: 'accept' })).status).toBe(403);

    const acc = await call<{ quest: Quest }>(ME, 'PATCH', { id: q.id, action: 'accept', journeyId: 'j1' });
    expect(acc.body.quest).toMatchObject({ status: 'accepted', journeyId: 'j1', branchAtM: 8000 });
    expect(pushes.at(-1)).toMatchObject({ to: 'anna', data: { title: '⚔️ Me accepted your challenge' } });
    expect((await call(ME, 'PATCH', { id: q.id, action: 'decline' })).status).toBe(409);

    // runs after acceptance count (and still count for the journey – quests only read runs)
    const soon = new Date(Date.now() + 3600_000).toISOString();
    await store.putActivities('me', [run(2, soon, 12)]);
    let list = await call<{ quests: Quest[] }>(ME, 'GET');
    expect(list.body.quests[0]).toMatchObject({ status: 'accepted', progress: { value: 12_000, target: 20_000 } });
    await store.putActivities('me', [run(3, new Date(Date.now() + 7200_000).toISOString(), 9)]);
    list = await call<{ quests: Quest[] }>(ANNA, 'GET');
    expect(list.body.quests[0]).toMatchObject({ status: 'won', winnerUid: 'me', badge: { emoji: '🏅', label: '20 km in 7 days' } });
    expect(pushes.slice(-2).map((p) => [p.to, p.data.title])).toEqual([
      ['me', '🏅 Quest complete!'],
      ['anna', '🏅 Me completed your challenge'],
    ]);
    // evaluated once: no repeated notifications
    const n = pushes.length;
    await call(ME, 'GET');
    expect(pushes.length).toBe(n);

    expect((await call(ME, 'PATCH', { id: q.id, action: 'delivered' })).status).toBe(403);
    const del = await call<{ quest: Quest }>(ANNA, 'PATCH', { id: q.id, action: 'delivered' });
    expect(del.body.quest.gift.fulfillment).toMatchObject({ status: 'fulfilled' });
  });

  it('only challenges people who can use the app; invitations by email are linked on first visit', async () => {
    const stranger = await call<{ error: string }>(ME, 'POST', { toEmail: 'nobody@example.com', type: 'race', params: { distanceM: 10_000 }, days: 7, gift: 'Beer' });
    expect(stranger.status).toBe(403);
    expect(await store.isAllowed('nobody@example.com')).toBe(false);

    await store.allow({ email: 'new@example.com', addedBy: 'x', addedAt: 'x' });
    const ok = await call<{ quest: Quest }>(ME, 'POST', { toEmail: 'New@Example.com', type: 'race', params: { distanceM: 10_000 }, days: 7, gift: 'Beer' });
    expect(ok.body.quest.to).toMatchObject({ email: 'new@example.com', name: 'new' });
    expect(ok.body.quest.to.uid).toBeUndefined();
    const NEW = bearer('newbie', 'new@example.com');
    const list = await call<{ quests: Quest[] }>(NEW, 'GET');
    expect(list.body.quests[0].to.uid).toBe('newbie');
    expect((await call(NEW, 'PATCH', { id: ok.body.quest.id, action: 'decline' })).body).toMatchObject({ quest: { status: 'declined' } });
  });
});
