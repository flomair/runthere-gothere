import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countByTier, dropFor, hash01, lowThreshold, mysteryPins, pickPrize, stageBoost, tierOdds, weekKey } from '../shared/bucket';
import type { LatLon } from '../shared/geo';
import type { BucketView, Draw, Group, Prize, Stage } from '../shared/types';
import { setPushSender } from '../server/push';
import { setRepo } from '../server/repo';
import { memoryRepo } from '../server/repo-memory';
import { memoryBlobStore, setBlobStore } from '../server/storage';
import { bearer, fakeVerify, req } from './helpers';

vi.mock('../server/firebase', () => ({
  verifyIdToken: async (t: string) => fakeVerify(t),
  db: () => {
    throw new Error('no Firestore in tests');
  },
  messaging: () => {
    throw new Error('no FCM in tests');
  },
  storageBucket: () => {
    throw new Error('no Cloud Storage in tests');
  },
}));

const prize = (id: string, tier: Prize['tier'], addedBy = 'ben', status: Prize['status'] = 'available'): Prize => ({
  id,
  groupId: 'g1',
  title: `Prize ${id}`,
  tier,
  addedBy,
  anonymous: false,
  createdAt: `2026-09-01T00:00:0${id.length}Z`,
  status,
  fulfillment: { kind: 'promise', status: 'pending' },
});

describe('bucket maths', () => {
  it('boost raises the odds of rare prizes; only tiers still in the bucket count', () => {
    const all = { small: 1, medium: 1, rare: 1 };
    const base = tierOdds(1, all);
    expect(base.small).toBeCloseTo(0.6);
    expect(base.rare).toBeCloseTo(0.1);
    const boosted = tierOdds(3, all);
    expect(boosted.rare).toBeGreaterThan(base.rare * 2);
    expect(boosted.small).toBeLessThan(base.small);
    expect(tierOdds(99, all)).toEqual(boosted); // capped
    expect(tierOdds(1, { small: 0, medium: 2, rare: 0 })).toEqual({ small: 0, medium: 1, rare: 0 });
    expect(stageBoost(1.3)).toBeCloseTo(2.3);
  });

  it('never picks your own prize, follows the odds and is empty-safe', () => {
    const prizes = [prize('a', 'small', 'me'), prize('b', 'small'), prize('c', 'rare'), prize('d', 'medium', 'ben', 'drawn')];
    expect(pickPrize([prize('x', 'rare', 'me')], { uid: 'me', boost: 1 })).toBeNull();
    // eligible: b (small), c (rare) → odds small 60/70, rare 10/70
    const low = pickPrize(prizes, { uid: 'me', boost: 1 }, () => 0.5)!;
    expect(low.prize.id).toBe('b');
    expect(low.odds.rare).toBeCloseTo(1 / 7);
    const high = pickPrize(prizes, { uid: 'me', boost: 1 }, () => 0.9)!;
    expect(high.prize.id).toBe('c');
    // over many draws, never "a" (own) or "d" (already drawn)
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(pickPrize(prizes, { uid: 'me', boost: 2 }, rng)!.prize.id);
    expect([...seen].sort()).toEqual(['b', 'c']);
  });

  it('places "?" pins stably along the route, and random drops are stable per week', () => {
    const pins = mysteryPins('g1', 700_000);
    expect(pins).toHaveLength(9);
    expect(mysteryPins('g1', 700_000)).toEqual(pins);
    expect(pins.every((p, i) => p.m > 0 && p.m < 700_000 && (i === 0 || p.m > pins[i - 1].m))).toBe(true);
    expect(mysteryPins('g1', 50_000)).toHaveLength(2);
    expect(weekKey('2026-09-27')).toBe('2026-09-21'); // Sunday → Monday of that week
    expect(dropFor('g1', 'me', '2026-09-21')).toBe(hash01('drop:g1:me:2026-09-21') < 0.25);
    expect(lowThreshold(2)).toBe(3);
    expect(countByTier([prize('a', 'rare'), prize('b', 'rare')])).toEqual({ small: 0, medium: 0, rare: 2 });
  });
});

describe('surprise bucket API', () => {
  const pts: LatLon[] = [];
  for (let i = 0; i <= 100; i++) pts.push([52.5 - i * 0.02, 13.4]);
  const TOTAL = 222_000;
  let store: ReturnType<typeof memoryRepo>;
  let pushes: { to: string; title: string }[];
  const ANNA = bearer('anna', 'anna@example.com');
  const BEN = bearer('ben', 'ben@example.com');
  const EVE = bearer('eve', 'eve@example.com');

  beforeEach(async () => {
    process.env.SESSION_SECRET = 'test-secret-that-is-long-enough';
    process.env.ADMIN_EMAILS = '';
    store = memoryRepo();
    setRepo(store);
    setBlobStore(memoryBlobStore());
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
      id: 'g1', name: 'Autumn race', mode: 'race', ownerUid: 'anna', memberUids: ['anna', 'ben'], invitedEmails: [],
      route: { points: pts, totalM: TOTAL, provider: 't' },
      waypoints: [{ name: 'Berlin', lat: 52.5, lon: 13.4 }, { name: 'Somewhere', lat: 50.5, lon: 13.4 }],
      startDate: '2026-01-01', sportTypes: ['Run'], createdAt: 'x',
      members: { anna: { uid: 'anna', name: 'Anna', email: 'anna@example.com', joinedAt: 'x' }, ben: { uid: 'ben', name: 'Ben', email: 'ben@example.com', joinedAt: 'x' } },
    } as unknown as Group;
    await store.putGroup(g);
  });
  afterEach(() => {
    setPushSender(null);
    setBlobStore(null);
  });

  const bucket = async <T,>(who: Record<string, string>, method: 'GET' | 'POST' | 'PATCH', json?: unknown) => {
    const mod = await import('../routes/groups/bucket');
    const res = await mod[method](req(method === 'GET' ? '/api/groups/bucket?id=g1' : '/api/groups/bucket', { method, headers: who, json }));
    return { status: res.status, body: (await res.json()) as T };
  };

  it('hides prizes, earns draws from pins, milestones and stage wins, draws (never your own), reveals and delivers', async () => {
    expect((await bucket(EVE, 'POST', { id: 'g1', title: 'x', tier: 'small' })).status).toBe(404);
    expect((await bucket(ANNA, 'POST', { id: 'g1', title: 'x', tier: 'huge' })).status).toBe(400);
    await bucket(ANNA, 'POST', { id: 'g1', title: 'Anna’s cake', tier: 'small' });
    // low bucket (1 < 3): the group is told once
    expect(pushes.map((p) => p.title)).toEqual(['🪣 Only 1 surprises left in the bucket', '🪣 Only 1 surprises left in the bucket']);
    await bucket(BEN, 'POST', { id: 'g1', title: 'Ben’s massage voucher', tier: 'rare', anonymous: true });
    await bucket(BEN, 'POST', { id: 'g1', title: 'Ben’s socks', tier: 'small' });
    expect(pushes.length).toBe(2);
    expect((await store.getGroup('g1'))!.bucketLowSince).toBeUndefined();

    // Anna sees counts, her own prize, but not Ben's titles
    const view = (await bucket<BucketView>(ANNA, 'GET')).body;
    expect(view.counts).toEqual({ small: 2, medium: 0, rare: 1 });
    expect(view.drawable).toBe(2);
    expect(view.mine.map((p) => p.title)).toEqual(['Anna’s cake']);
    expect(JSON.stringify(view)).not.toContain('massage');

    // Anna runs past the first "?" pin and halfway, and wins a stage
    await store.putActivities('anna', [{ id: 1, name: 'Run', sportType: 'Run', distanceM: 120_000, movingTimeS: 1, elevationGainM: 0, startDate: '2026-09-02T06:00:00Z', startDateLocal: '2026-09-02T08:00:00Z' }]);
    const stage: Stage = { id: 's1', groupId: 'g1', name: 'Stage 1', fromM: 0, toM: 100_000, startDate: '2026-09-01', endDate: '2026-09-07', participants: ['anna', 'ben'], prize: { text: 'x', fulfillment: { kind: 'promise', status: 'pending' } }, createdBy: 'ben', createdAt: 'x', status: 'finished', winnerUid: 'anna', results: [{ uid: 'anna', distanceM: 120_000, baselineM: 0, effort: 4.8 }] };
    await store.putStage(stage);
    pushes.length = 0;
    const standings = await import('../routes/groups/standings');
    await standings.GET(req('/api/groups/standings?id=g1', { headers: ANNA }));
    const draws = (await store.listDraws('g1')).filter((d) => d.uid === 'anna');
    const pinsPassed = mysteryPins('g1', TOTAL).filter((p) => p.m <= 120_000).length;
    expect(draws.filter((d) => d.source === 'pin')).toHaveLength(pinsPassed);
    expect(draws.find((d) => d.source === 'milestone')).toMatchObject({ label: 'Halfway there', boost: 1 });
    expect(draws.find((d) => d.source === 'stage')).toMatchObject({ id: 'stage_s1', boost: 3 });
    expect(pushes.filter((p) => p.to === 'anna')).toHaveLength(1);
    expect(pushes[0].title).toMatch(/^🎁 You earned \d+ mystery draws$/);
    // idempotent
    await standings.GET(req('/api/groups/standings?id=g1', { headers: ANNA }));
    expect((await store.listDraws('g1')).filter((d) => d.uid === 'anna')).toHaveLength(draws.length);

    // draw with the stage-win draw: never her own cake
    const { drawPrize } = await import('../server/bucket');
    const anna = { uid: 'anna', email: 'anna@example.com', isAdmin: false };
    await expect(drawPrize({ ...anna, uid: 'ben' }, 'g1', 'stage_s1')).rejects.toThrow(/Draw not found/);
    const got = await drawPrize(anna, 'g1', 'stage_s1', () => 0.99);
    expect(got.prize).toMatchObject({ title: 'Ben’s massage voucher', tier: 'rare', status: 'drawn', drawnBy: 'anna' });
    expect(got.draw).toMatchObject({ usedAt: expect.any(String), prizeId: got.prize.id, tier: 'rare' });
    expect(got.draw.odds!.rare).toBeCloseTo(30 / 90);
    await expect(drawPrize(anna, 'g1', 'stage_s1')).rejects.toThrow(/already used/);
    // Ben (anonymous giver) is told privately; the feed hides his name
    expect(pushes.slice(-3)).toEqual([
      { to: 'ben', title: '🎉 Anna drew your surprise: Ben’s massage voucher' },
      // two left for three needed: the group is told the bucket runs low
      { to: 'anna', title: '🪣 Only 2 surprises left in the bucket' },
      { to: 'ben', title: '🪣 Only 2 surprises left in the bucket' },
    ]);
    const feed = await store.listFeed('g1');
    expect(feed.find((f) => f.id === `drawn_${got.prize.id}`)!.text).toBe('🎉 drew a rare surprise: Ben’s massage voucher (from someone)');

    // revealed for everyone, giver hidden (except for the giver)
    const annaView = (await bucket<BucketView>(ANNA, 'GET')).body;
    expect(annaView.revealed[0]).toMatchObject({ title: 'Ben’s massage voucher', addedBy: '', drawnByName: 'Anna' });
    expect(annaView.revealed[0].giverName).toBeUndefined();
    expect((await bucket<BucketView>(BEN, 'GET')).body.revealed[0]).toMatchObject({ addedBy: 'ben', giverName: 'Ben' });

    // one draw left for Anna that she could use: only Ben's socks remain drawable; then the bucket is empty for her
    const pin = draws.find((d) => d.source === 'pin')!;
    expect((await drawPrize(anna, 'g1', pin.id)).prize.title).toBe('Ben’s socks');
    const ms = draws.find((d) => d.source === 'milestone')!;
    await expect(drawPrize(anna, 'g1', ms.id)).rejects.toThrow(/Nothing in the bucket you could draw/);
    expect((await store.getDraw('g1', ms.id))!.usedAt).toBeUndefined();

    // delivered with a photo (winner), not by strangers
    const up = await import('../routes/uploads');
    const res = await up.POST(new Request('https://app.example/api/uploads', { method: 'POST', headers: { ...ANNA, 'Content-Type': 'image/jpeg' }, body: new Uint8Array([255, 216, 255, 1]) }));
    const { path } = (await res.json()) as { path: string };
    expect((await bucket(BEN, 'PATCH', { id: 'g1', prizeId: got.prize.id, action: 'delivered', photo: path })).status).toBe(403);
    const del = await bucket<{ prize: Prize }>(ANNA, 'PATCH', { id: 'g1', prizeId: got.prize.id, action: 'delivered', photo: path, note: 'Bliss' });
    expect(del.body.prize).toMatchObject({ status: 'delivered', deliveredPhoto: path, deliveredNote: 'Bliss', fulfillment: { status: 'fulfilled' } });
    const photo = await import('../routes/groups/draw');
    const link = await photo.GET(req(`/api/groups/draw?id=g1&prizeId=${got.prize.id}`, { headers: BEN }));
    expect(((await link.json()) as { url: string }).url).toContain(path);
    expect((await photo.GET(req(`/api/groups/draw?id=g1&prizeId=${got.prize.id}`, { headers: EVE }))).status).toBe(404);
  });

  it('givers can take back undrawn prizes only', async () => {
    const p = (await bucket<{ prize: Prize }>(ANNA, 'POST', { id: 'g1', title: 'Tea', tier: 'medium' })).body.prize;
    expect((await bucket(BEN, 'PATCH', { id: 'g1', prizeId: p.id, action: 'remove' })).status).toBe(404);
    expect((await bucket(ANNA, 'PATCH', { id: 'g1', prizeId: p.id, action: 'remove' })).status).toBe(200);
    expect(await store.listPrizes('g1')).toEqual([]);
    const d: Draw = { id: 'x', groupId: 'g1', uid: 'ben', source: 'drop', label: 'x', boost: 1, earnedAt: 'x' };
    await store.putDraw(d);
    expect((await store.listDraws('g1')).length).toBe(1);
  });
});
