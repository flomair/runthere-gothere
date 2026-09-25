import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LatLon } from '../shared/geo';
import { cumulativeDistances } from '../shared/geo';
import type { Journey } from '../shared/types';
import { setRepo } from '../server/repo';
import { memoryRepo } from '../server/repo-memory';
import { bearer, fakeVerify, req } from './helpers';

vi.mock('../server/firebase', () => ({
  verifyIdToken: async (t: string) => fakeVerify(t),
  db: () => {
    throw new Error('no Firestore in tests');
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

const OWNER = bearer('owner', 'owner@example.com');
const FRIEND = bearer('friend', 'friend@example.com');
const STRANGER = bearer('stranger', 'stranger@example.com');
let store: ReturnType<typeof memoryRepo>;

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-that-is-long-enough';
  process.env.ADMIN_EMAILS = 'owner@example.com';
  store = memoryRepo();
  setRepo(store);
});
afterEach(() => vi.unstubAllGlobals());

const call = async <T,>(mod: { GET?: (r: Request) => Promise<Response>; POST?: (r: Request) => Promise<Response>; DELETE?: (r: Request) => Promise<Response> }, method: 'GET' | 'POST' | 'DELETE', url: string, headers: Record<string, string>, json?: unknown) => {
  const res = await mod[method]!(req(url, { method, headers, json }));
  return { status: res.status, body: (await res.json()) as T };
};

describe('shared journeys', () => {
  it('race: invite, join, standings, feed, kudos, comments, leave', async () => {
    await store.putJourney('owner', journey);
    await store.putActivities('owner', [act(1, '2026-09-05', 100), act(2, '2026-09-12', 90)]); // past Dresden (~165 km)
    await store.putActivities('friend', [act(10, '2026-09-06', 42)]);
    const groups = await import('../routes/groups');

    const created = await call<{ id: string; notAllowed: string[] }>(groups, 'POST', '/api/groups', OWNER, { journeyId: 'j1', name: 'Autumn race', mode: 'race', emails: ['Friend@Example.com'] });
    expect(created.status).toBe(200);
    expect(created.body.notAllowed).toEqual([]); // owner is admin → friend auto-allowed
    expect(await store.isAllowed('friend@example.com')).toBe(true);
    const id = created.body.id;

    const friendList = await call<{ groups: unknown[]; invitations: { id: string; from: string }[] }>(groups, 'GET', '/api/groups', FRIEND);
    expect(friendList.body.groups).toEqual([]);
    expect(friendList.body.invitations[0]).toMatchObject({ id, from: 'owner' });

    const standingsApi = await import('../routes/groups/standings');
    expect((await call(standingsApi, 'GET', `/api/groups/standings?id=${id}`, FRIEND)).status).toBe(404); // not joined yet
    await call(await import('../routes/groups/join'), 'POST', '/api/groups/join', FRIEND, { id });

    const st = await call<{ standings: { uid: string; doneM: number }[] }>(standingsApi, 'GET', `/api/groups/standings?id=${id}`, FRIEND);
    expect(st.body.standings.map((s) => s.uid)).toEqual(['owner', 'friend']);
    expect(st.body.standings[1].doneM).toBe(42_000);

    const feedApi = await import('../routes/groups/feed');
    const feed1 = await call<{ feed: { id: string; type: string; text: string; name: string }[] }>(feedApi, 'GET', `/api/groups/feed?id=${id}`, OWNER);
    const dresden = feed1.body.feed.find((f) => f.type === 'milestone' && f.text === 'Arrived in Dresden');
    expect(dresden?.name).toBe('owner');
    // standings again: no duplicate milestone posts
    await call(standingsApi, 'GET', `/api/groups/standings?id=${id}`, OWNER);
    const feed2 = await call<{ feed: unknown[] }>(feedApi, 'GET', `/api/groups/feed?id=${id}`, OWNER);
    expect(feed2.body.feed.length).toBe(feed1.body.feed.length);

    const kudos = await import('../routes/groups/kudos');
    const k1 = await call<{ item: { kudos: string[] } }>(kudos, 'POST', '/api/groups/kudos', FRIEND, { id, itemId: dresden!.id });
    expect(k1.body.item.kudos).toEqual(['friend']);
    const k2 = await call<{ item: { kudos: string[] } }>(kudos, 'POST', '/api/groups/kudos', FRIEND, { id, itemId: dresden!.id });
    expect(k2.body.item.kudos).toEqual([]);

    const commentApi = await import('../routes/groups/comment');
    await call(commentApi, 'POST', '/api/groups/comment', FRIEND, { id, itemId: dresden!.id, text: 'Chapeau!' });
    await call(commentApi, 'POST', '/api/groups/comment', FRIEND, { id, text: 'See you in Prague' });
    const feed3 = await call<{ feed: { id: string; type: string; text: string; comments: { text: string }[] }[] }>(feedApi, 'GET', `/api/groups/feed?id=${id}`, OWNER);
    expect(feed3.body.feed.find((f) => f.id === dresden!.id)?.comments.map((c) => c.text)).toEqual(['Chapeau!']);
    expect(feed3.body.feed.some((f) => f.type === 'post' && f.text === 'See you in Prague')).toBe(true);

    // outsiders see nothing
    expect((await call(feedApi, 'GET', `/api/groups/feed?id=${id}`, STRANGER)).status).toBe(403); // not allowlisted at all
    await store.allow({ email: 'stranger@example.com', addedBy: 'x', addedAt: 'x' });
    expect((await call(feedApi, 'GET', `/api/groups/feed?id=${id}`, STRANGER)).status).toBe(404);

    await call(await import('../routes/groups/leave'), 'POST', '/api/groups/leave', FRIEND, { id });
    expect((await store.getGroup(id))?.memberUids).toEqual(['owner']);
    await call(await import('../routes/groups/leave'), 'POST', '/api/groups/leave', OWNER, { id });
    expect(await store.getGroup(id)).toBeNull();
  });

  it('relay: combines everyone’s distance; non-admins learn who is not allowed', async () => {
    await store.allow({ email: 'friend@example.com', addedBy: 'owner', addedAt: 'x' });
    await store.putJourney('friend', journey);
    const groups = await import('../routes/groups');
    const r = await call<{ id: string; notAllowed: string[] }>(groups, 'POST', '/api/groups', FRIEND, { journeyId: 'j1', name: 'Team', mode: 'relay', emails: ['owner@example.com', 'new@person.org'] });
    expect(r.body.notAllowed).toEqual(['new@person.org']);
    await call(await import('../routes/groups/join'), 'POST', '/api/groups/join', OWNER, { id: r.body.id });
    await store.putActivities('owner', [act(1, '2026-09-05', 100)]);
    await store.putActivities('friend', [act(2, '2026-09-06', 80)]);
    const st = await call<{ team: { doneM: number }; standings: { uid: string; distanceM: number }[] }>(await import('../routes/groups/standings'), 'GET', `/api/groups/standings?id=${r.body.id}`, OWNER);
    expect(st.body.team.doneM).toBe(180_000);
    expect(st.body.standings.map((s) => [s.uid, s.distanceM])).toEqual([['owner', 100_000], ['friend', 80_000]]);
    const feed = await call<{ feed: { type: string; text: string; name: string }[] }>(await import('../routes/groups/feed'), 'GET', `/api/groups/feed?id=${r.body.id}`, OWNER);
    expect(feed.body.feed.find((f) => f.text === 'Arrived in Dresden')?.name).toBe('The team');
  });
});

describe('public share links', () => {
  it('shows live progress without sign-in and can be revoked', async () => {
    await store.putJourney('owner', journey);
    await store.updateUser('owner', { name: 'Flo Mair', email: 'owner@example.com' });
    await store.putActivities('owner', [act(1, '2026-09-05', 50)]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ display_name: 'x', address: { town: 'Zossen', state: 'Brandenburg', country: 'Germany' } }), { headers: { 'Content-Type': 'application/json' } })));
    const shares = await import('../routes/shares');
    const { body } = await call<{ token: string }>(shares, 'POST', '/api/shares', OWNER, { journeyId: 'j1' });
    expect((await call<{ token: string }>(shares, 'POST', '/api/shares', OWNER, { journeyId: 'j1' })).body.token).toBe(body.token);

    const pub = await import('../routes/public');
    const r = await call<Record<string, unknown>>(pub, 'GET', `/api/public?token=${body.token}`, {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ name: 'Berlin → Prague', ownerFirstName: 'Flo', doneM: 50_000, place: 'Zossen, Brandenburg, Germany' });
    expect(JSON.stringify(r.body)).not.toContain('owner@example.com');
    expect(r.body).not.toHaveProperty('entries');

    await call(shares, 'DELETE', '/api/shares?journeyId=j1', OWNER);
    expect((await call(pub, 'GET', `/api/public?token=${body.token}`, {})).status).toBe(404);
  });
});
