import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LatLon } from '../shared/geo';
import { cumulativeDistances } from '../shared/geo';
import { canMoveReward, rewardState, savingsTotal, songLinks, stampFor, stampHue } from '../shared/rewards';
import type { Journey, Reward } from '../shared/types';
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

const WPS: LatLon[] = [[52.52, 13.405], [51.05, 13.74], [50.075, 14.437]];
const points: LatLon[] = [];
for (let i = 1; i < WPS.length; i++) for (let t = 0; t < 60; t++) points.push([WPS[i - 1][0] + ((WPS[i][0] - WPS[i - 1][0]) * t) / 60, WPS[i - 1][1] + ((WPS[i][1] - WPS[i - 1][1]) * t) / 60]);
points.push(WPS[2]);
const totalM = cumulativeDistances(points).at(-1)!;
const journey: Journey = {
  id: 'j1',
  name: 'Berlin → Prague',
  createdAt: '2026-09-01T00:00:00Z',
  startDate: '2026-09-01',
  sportTypes: ['Run'],
  useStrava: true,
  manualEntries: [],
  excludedActivityIds: [],
  waypoints: [
    { name: 'Berlin', lat: 52.52, lon: 13.405 },
    { name: 'Dresden', lat: 51.05, lon: 13.74 },
    { name: 'Prague', lat: 50.075, lon: 14.437 },
  ],
  mode: 'foot',
  route: { points, totalM, provider: 'test' },
};
const act = (id: number, day: string, km: number) => ({ id, name: `Run ${id}`, sportType: 'Run', distanceM: km * 1000, movingTimeS: km * 330, elevationGainM: 0, startDate: `${day}T06:00:00Z`, startDateLocal: `${day}T08:00:00Z` });
const ME = bearer('me', 'me@example.com');
let store: ReturnType<typeof memoryRepo>;
let blobs: ReturnType<typeof memoryBlobStore>;
let pushes: Record<string, string>[];

beforeEach(async () => {
  process.env.SESSION_SECRET = 'test-secret-that-is-long-enough';
  process.env.ADMIN_EMAILS = 'me@example.com';
  store = memoryRepo();
  setRepo(store);
  blobs = memoryBlobStore();
  setBlobStore(blobs);
  pushes = [];
  setPushSender(async (tokens, data) => {
    pushes.push(data);
    return tokens.map((token) => ({ token, ok: true }));
  });
  await store.putJourney('me', journey);
  await store.putActivities('me', [act(1, '2026-09-05', 50)]);
});
afterEach(() => {
  setBlobStore(null);
  setPushSender(null);
  vi.unstubAllGlobals();
});

async function call<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, json?: unknown) {
  const mod = await import('../routes/rewards');
  const res = await mod[method](req(url, { method, headers: ME, json }));
  return { status: res.status, body: (await res.json()) as T };
}

describe('personal rewards on the route', () => {
  it('pins a reward ahead, moves it while locked, unlocks it at the pin and lets you claim it', async () => {
    // you are at 50 km: a pin behind you is refused
    const behind = await call<{ error: string }>('POST', '/api/rewards', { journeyId: 'j1', title: 'Ice cream', atM: 20_000 });
    expect(behind.status).toBe(400);

    const created = await call<{ reward: Reward }>('POST', '/api/rewards', { journeyId: 'j1', title: 'Ice cream', link: 'https://shop.example/ice', atM: 80_000 });
    expect(created.status).toBe(200);
    const r = created.body.reward;
    expect(r).toMatchObject({ status: 'locked', atM: 80_000, fulfillment: { kind: 'promise', status: 'pending' } });

    // links must be http(s)
    expect((await call('POST', '/api/rewards', { journeyId: 'j1', title: 'X', link: 'javascript:alert(1)', atM: 90_000 })).status).toBe(400);
    // claiming a locked reward is refused
    expect((await call('PATCH', '/api/rewards', { id: r.id, claim: {} })).status).toBe(409);

    // move while locked
    const moved = await call<{ reward: Reward }>('PATCH', '/api/rewards', { id: r.id, atM: 100_000, title: 'Big ice cream' });
    expect(moved.body.reward).toMatchObject({ atM: 100_000, title: 'Big ice cream' });

    // a sync gets you past the pin: unlocked + push notification
    await store.addPushToken('me', 'token-aaaaaaaaaaaaaaaaaaaaaaaa');
    await store.putActivities('me', [act(2, '2026-09-10', 60)]);
    const { detectMilestones } = await import('../server/milestones');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    await detectMilestones('me', { delayMs: 0, maxNew: 0, notifyRewards: true });
    expect((await store.getReward('me', r.id))?.status).toBe('unlocked');
    expect(pushes[0].title).toBe('🎁 Reward unlocked: Big ice cream');
    expect(pushes[0].url).toBe('/#/j/j1');

    // unlocked pins can no longer move
    expect((await call('PATCH', '/api/rewards', { id: r.id, atM: 150_000 })).status).toBe(409);

    // claim with a photo
    const up = await import('../routes/uploads');
    const res = await up.POST(new Request('https://app.example/api/uploads', { method: 'POST', headers: { ...ME, 'Content-Type': 'image/jpeg' }, body: new Uint8Array([255, 216, 255, 1, 2, 3]) }));
    const { path } = (await res.json()) as { path: string };
    expect(path).toMatch(/^users\/me\/photos\/.+\.jpg$/);
    const claimed = await call<{ reward: Reward }>('PATCH', '/api/rewards', { id: r.id, claim: { photo: path, note: 'Delicious' } });
    expect(claimed.body.reward).toMatchObject({ status: 'claimed', claimPhoto: path, claimNote: 'Delicious', fulfillment: { status: 'fulfilled' } });

    const list = await call<{ rewards: Reward[] }>('GET', '/api/rewards?journeyId=j1');
    expect(list.body.rewards.map((x) => x.status)).toEqual(['claimed']);
  });

  it("refuses someone else's photo and non-image uploads", async () => {
    const res = await call('POST', '/api/rewards', { journeyId: 'j1', title: 'X', atM: 90_000, photo: 'users/other/photos/a.jpg' });
    expect(res.status).toBe(403);
    const up = await import('../routes/uploads');
    const bad = await up.POST(new Request('https://app.example/api/uploads', { method: 'POST', headers: { ...ME, 'Content-Type': 'text/html' }, body: '<script>' }));
    expect(bad.status).toBe(415);
    const peek = await up.GET(req('/api/uploads?path=users/other/photos/a.jpg', { headers: ME }));
    expect(peek.status).toBe(403);
  });
});

describe('reward and unlock helpers', () => {
  const r: Reward = { id: 'r', journeyId: 'j', title: 't', atM: 5000, status: 'locked', createdAt: 'x', fulfillment: { kind: 'promise', status: 'pending' } };
  it('derives the visible state and whether a pin can move', () => {
    expect(rewardState(r, 4000)).toBe('locked');
    expect(rewardState(r, 5000)).toBe('unlocked');
    expect(rewardState({ ...r, status: 'claimed' }, 0)).toBe('claimed');
    expect(canMoveReward(r, 4000)).toBe(true);
    expect(canMoveReward(r, 6000)).toBe(false);
  });
  it('adds up the savings jar', () => {
    expect(savingsTotal(123_456, 0.5)).toBe(61.73);
    expect(savingsTotal(0, 1)).toBe(0);
    expect(savingsTotal(10_000, -1)).toBe(0);
  });
  it('builds stamps and song links', () => {
    expect(stampFor({ title: 'Arrived in Dresden', reachedAt: '2026-09-19T06:00:00Z' })).toEqual({ label: 'Dresden', date: '2026-09-19', countryCode: undefined, hue: stampHue('Dresden') });
    expect(songLinks({ title: 'Wien, du Stadt', artist: 'X' }).spotify).toBe('https://open.spotify.com/search/Wien%2C%20du%20Stadt%20X');
  });
  it('falls back to a Wikipedia fun fact without an AI key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ type: 'standard', extract: 'Pirna is a town in Saxony. Its old town was painted by Canaletto in the 18th century. It lies on the Elbe.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Pirna' } } }))));
    const { cityUnlocks } = await import('../server/unlocks');
    const u = await cityUnlocks({ id: 'm', journeyId: 'j', kind: 'waypoint', atM: 1, title: 'Arrived in Pirna', lat: 50.96, lon: 13.94, reachedAt: '2026-09-19', createdAt: 'x', place: { name: 'Pirna', context: 'Saxony' } });
    expect(u.stamp).toMatchObject({ label: 'Pirna', countryCode: 'DE' });
    expect(u.funFact).toEqual({ text: 'Its old town was painted by Canaletto in the 18th century.', source: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Pirna' });
    expect(u.song).toBeUndefined();
  });
});
