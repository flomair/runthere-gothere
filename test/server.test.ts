import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryRepo } from '../server/repo-memory';
import { setRepo } from '../server/repo';
import { bearer, captureWaitUntil, fakeVerify, mockFetch, req } from './helpers';

vi.mock('../server/firebase', () => ({
  verifyIdToken: async (t: string) => fakeVerify(t),
  db: () => {
    throw new Error('Firestore must not be used in tests');
  },
}));

let store: ReturnType<typeof memoryRepo>;
const OWNER = bearer('owner', 'owner@example.com');
const FRIEND = bearer('friend', 'friend@example.com');

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-that-is-long-enough';
  process.env.STRAVA_CLIENT_ID = '123';
  process.env.STRAVA_CLIENT_SECRET = 'shh';
  process.env.ADMIN_EMAILS = 'Owner@Example.com';
  process.env.CRON_SECRET = 'cron';
  store = memoryRepo();
  setRepo(store);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MAPILLARY_TOKEN;
  delete process.env.GOOGLE_PLACES_API_KEY;
});

describe('crypto', () => {
  it('seals per purpose and rejects tampering', async () => {
    const { seal, unseal } = await import('../server/crypto');
    const token = seal('ai-key', { a: 1 });
    expect(unseal('ai-key', token)).toEqual({ a: 1 });
    expect(unseal('strava-tokens', token)).toBeNull();
    expect(unseal('ai-key', token.slice(0, -2) + 'xx')).toBeNull();
  });
});

describe('access control', () => {
  it('requires sign-in, a verified email and the allowlist', async () => {
    const { GET } = await import('../api/me');
    expect((await GET(req('/api/me'))).status).toBe(401);
    expect((await GET(req('/api/me', { headers: FRIEND }))).status).toBe(403);
    expect((await GET(req('/api/me', { headers: bearer('owner', 'owner@example.com', ':unverified') }))).status).toBe(403);

    const me = await GET(req('/api/me', { headers: OWNER }));
    expect(me.status).toBe(200);
    expect(((await me.json()) as { user: { isAdmin: boolean } }).user.isAdmin).toBe(true);

    await store.allow({ email: 'friend@example.com', addedBy: 'owner@example.com', addedAt: '2026-09-25' });
    const f = await GET(req('/api/me', { headers: FRIEND }));
    expect(f.status).toBe(200);
    expect(((await f.json()) as { user: { isAdmin: boolean } }).user.isAdmin).toBe(false);
  });

  it('lets only admins manage the allowlist', async () => {
    const admin = await import('../api/admin/allowlist');
    await store.allow({ email: 'friend@example.com', addedBy: 'x', addedAt: '2026-09-01' });
    expect((await admin.GET(req('/api/admin/allowlist', { headers: FRIEND }))).status).toBe(403);

    const add = await admin.POST(req('/api/admin/allowlist', { method: 'POST', headers: OWNER, json: { email: ' New@Friend.org ' } }));
    expect(add.status).toBe(200);
    expect(await store.isAllowed('new@friend.org')).toBe(true);
    expect((await admin.POST(req('/api/admin/allowlist', { method: 'POST', headers: OWNER, json: { email: 'nope' } }))).status).toBe(400);

    const list = (await (await admin.GET(req('/api/admin/allowlist', { headers: OWNER }))).json()) as { admins: string[]; allowed: { email: string }[] };
    expect(list.admins).toEqual(['owner@example.com']);
    expect(list.allowed.map((a) => a.email).sort()).toEqual(['friend@example.com', 'new@friend.org']);

    await admin.DELETE(req('/api/admin/allowlist?email=friend@example.com', { method: 'DELETE', headers: OWNER }));
    expect(await store.isAllowed('friend@example.com')).toBe(false);
  });

  it('protects the helper APIs too', async () => {
    const { POST } = await import('../api/route');
    expect((await POST(req('/api/route', { method: 'POST', json: { waypoints: [[1, 2], [3, 4]] } }))).status).toBe(401);
    expect((await POST(req('/api/route', { method: 'POST', headers: OWNER, json: { waypoints: [[1, 2]] } }))).status).toBe(400);
  });
});

describe('journeys', () => {
  const journey = (id: string) => ({
    id,
    name: 'Berlin → Vienna',
    createdAt: '2026-09-01T00:00:00Z',
    startDate: '2026-09-01',
    sportTypes: ['Run'],
    useStrava: true,
    manualEntries: [{ id: 'm', date: '2026-09-02', distanceM: 5000 }],
    excludedActivityIds: [],
    waypoints: [{ name: 'Berlin', lat: 52.52, lon: 13.405 }],
    mode: 'foot',
    route: { points: [[52.52, 13.405], [51.05, 13.74], [48.20817, 16.37382]], totalM: 680000, provider: 'test' },
  });

  it('stores, lists and deletes per user (route kept via polyline)', async () => {
    const api = await import('../api/journeys');
    await store.allow({ email: 'friend@example.com', addedBy: 'x', addedAt: 'x' });
    expect((await api.PUT(req('/api/journeys', { method: 'PUT', headers: OWNER, json: journey('j1') }))).status).toBe(200);

    const mine = (await (await api.GET(req('/api/journeys', { headers: OWNER }))).json()) as { journeys: { id: string; route: { points: number[][] } }[] };
    expect(mine.journeys.map((j) => j.id)).toEqual(['j1']);
    expect(mine.journeys[0].route.points[2][0]).toBeCloseTo(48.20817, 5);

    const theirs = (await (await api.GET(req('/api/journeys', { headers: FRIEND }))).json()) as { journeys: unknown[] };
    expect(theirs.journeys).toEqual([]);

    await api.DELETE(req('/api/journeys?id=j1', { method: 'DELETE', headers: OWNER }));
    expect(await store.listJourneys('owner')).toEqual([]);
  });

  it('rejects malformed journeys', async () => {
    const api = await import('../api/journeys');
    const bad = { ...journey('j2'), route: { points: [[1, 2]], totalM: 1, provider: 'x' } };
    expect((await api.PUT(req('/api/journeys', { method: 'PUT', headers: OWNER, json: bad }))).status).toBe(400);
    expect((await api.PUT(req('/api/journeys', { method: 'PUT', headers: OWNER, json: { ...journey('../x') } }))).status).toBe(400);
  });
});

describe('strava', () => {
  const act = (id: number, day: string, km = 10) => ({
    id,
    name: `Run ${id}`,
    type: 'Run',
    sport_type: 'Run',
    distance: km * 1000,
    moving_time: 3000,
    elapsed_time: 3100,
    total_elevation_gain: 20,
    start_date: `${day}T06:00:00Z`,
    start_date_local: `${day}T08:00:00Z`,
  });

  async function connect() {
    const connectApi = await import('../api/strava/connect');
    const r = (await (await connectApi.POST(req('/api/strava/connect', { method: 'POST', headers: OWNER }))).json()) as { url: string };
    const u = new URL(r.url);
    expect(u.host).toBe('www.strava.com');
    expect(u.searchParams.get('redirect_uri')).toBe('https://app.example/api/strava/callback');
    const state = u.searchParams.get('state')!;

    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      if (url.includes('/oauth/token')) return { access_token: 'a1', refresh_token: 'r1', expires_at: 9e9, athlete: { id: 77, firstname: 'Flo' } };
      if (url.includes('/athlete/activities')) return new URL(url).searchParams.get('page') === '1' ? [act(1, '2026-09-10'), act(2, '2026-09-12')] : [];
      throw new Error(url);
    });
    const cb = await import('../api/strava/callback');
    const res = await cb.GET(req(`/api/strava/callback?code=c&state=${state}&scope=read,activity:read_all`));
    expect(res.headers.get('location')).toBe('https://app.example/?strava=connected');
    return calls;
  }

  it('connects, stores encrypted tokens and backfills activities', async () => {
    await connect();
    expect(await store.uidForAthlete(77)).toBe('owner');
    const secrets = await store.getSecrets('owner');
    expect(secrets.strava).toBeTruthy();
    expect(secrets.strava).not.toContain('a1');
    expect((await store.listActivities('owner')).map((a) => a.id)).toEqual([1, 2]);
    const user = await store.getUser('owner');
    expect(user?.strava?.athleteId).toBe(77);
    expect(user?.strava?.lastSyncAt).toBeTruthy();

    const acts = await import('../api/activities');
    const r = (await (await acts.GET(req('/api/activities?since=2026-09-11', { headers: OWNER }))).json()) as { activities: { id: number }[] };
    expect(r.activities.map((a) => a.id)).toEqual([1, 2]); // one day of slack
  });

  it('rejects a forged or expired state', async () => {
    const cb = await import('../api/strava/callback');
    const res = await cb.GET(req('/api/strava/callback?code=c&state=forged&scope=activity:read_all'));
    expect(res.headers.get('location')).toContain('strava_error=invalid_state');
  });

  it('syncs incrementally and backfills on request', async () => {
    await connect();
    const { syncUser } = await import('../server/sync');
    const afters: number[] = [];
    mockFetch((url) => {
      if (url.includes('/athlete/activities')) {
        afters.push(Number(new URL(url).searchParams.get('after')));
        return [act(3, '2026-09-20')];
      }
      throw new Error(url);
    });
    await syncUser('owner');
    const syncedFrom = (await store.getUser('owner'))!.strava!.syncedFrom!;
    expect(afters[0]).toBeGreaterThan(syncedFrom); // incremental: from last sync minus overlap
    await syncUser('owner', syncedFrom - 86_400 * 100);
    expect(afters[1]).toBe(syncedFrom - 86_400 * 100); // backfill
    expect((await store.getUser('owner'))!.strava!.syncedFrom).toBe(syncedFrom - 86_400 * 100);
    expect((await store.listActivities('owner')).map((a) => a.id)).toEqual([1, 2, 3]);
  });

  it('handles webhook handshake and events', async () => {
    await connect();
    const hook = await import('../api/strava/webhook');
    const ok = await hook.GET(req(`/api/strava/webhook?hub.mode=subscribe&hub.challenge=abc&hub.verify_token=${hook.verifyToken()}`));
    expect(await ok.json()).toEqual({ 'hub.challenge': 'abc' });
    expect((await hook.GET(req('/api/strava/webhook?hub.mode=subscribe&hub.challenge=abc&hub.verify_token=wrong'))).status).toBe(403);

    const flush = captureWaitUntil();
    mockFetch((url) => {
      if (url.endsWith('/api/v3/activities/9')) return act(9, '2026-09-24', 21.1);
      throw new Error(url);
    });
    const post = (e: object) => hook.POST(req('/api/strava/webhook', { method: 'POST', json: e }));
    expect((await post({ object_type: 'activity', aspect_type: 'create', object_id: 9, owner_id: 77 })).status).toBe(200);
    await flush();
    expect((await store.listActivities('owner')).find((a) => a.id === 9)?.distanceM).toBe(21100);

    await post({ object_type: 'activity', aspect_type: 'delete', object_id: 9, owner_id: 77 });
    await flush();
    expect((await store.listActivities('owner')).find((a) => a.id === 9)).toBeUndefined();

    await post({ object_type: 'activity', aspect_type: 'create', object_id: 5, owner_id: 999 }); // unknown athlete
    await flush();

    await post({ object_type: 'athlete', aspect_type: 'update', object_id: 77, owner_id: 77, updates: { authorized: 'false' } });
    await flush();
    expect(await store.uidForAthlete(77)).toBeNull();
    expect((await store.getSecrets('owner')).strava).toBeUndefined();
  });

  it('cron requires the secret and syncs every connected user', async () => {
    await connect();
    const cron = await import('../api/cron/sync');
    expect((await cron.GET(req('/api/cron/sync'))).status).toBe(401);
    mockFetch(() => []);
    const r = (await (await cron.GET(req('/api/cron/sync', { headers: { authorization: 'Bearer cron' } }))).json()) as { users: number };
    expect(r.users).toBe(1);
  });

  it('disconnect forgets tokens but keeps activities', async () => {
    await connect();
    mockFetch(() => ({}));
    const d = await import('../api/strava/disconnect');
    await d.POST(req('/api/strava/disconnect', { method: 'POST', headers: OWNER }));
    expect(await store.uidForAthlete(77)).toBeNull();
    expect((await store.getUser('owner'))?.strava).toBeUndefined();
    expect((await store.listActivities('owner')).length).toBe(2);
  });

  it('refreshes an expired token and persists it', async () => {
    const { seal } = await import('../server/crypto');
    await store.updateSecrets('owner', { strava: seal('strava-tokens', { accessToken: 'old', refreshToken: 'r', expiresAt: 0 }) });
    mockFetch(() => ({ access_token: 'new', refresh_token: 'r2', expires_at: 9e9 }));
    const { tokensFor } = await import('../server/sync');
    expect((await tokensFor('owner'))?.accessToken).toBe('new');
    const { unseal } = await import('../server/crypto');
    expect(unseal<{ refreshToken: string }>('strava-tokens', (await store.getSecrets('owner')).strava!)?.refreshToken).toBe('r2');
  });
});

describe('routing', () => {
  it('falls back from OSRM to BRouter to great circle', async () => {
    const { planRoute } = await import('../server/routing');
    mockFetch((url) => {
      if (url.includes('routing.openstreetmap.de')) return new Response('boom', { status: 503 });
      if (url.includes('brouter.de')) return { features: [{ geometry: { coordinates: [[13.4, 52.5, 30], [14, 51], [16.37, 48.2, 170]] } }] };
      throw new Error('unexpected');
    });
    const r = await planRoute([[52.5, 13.4], [48.2, 16.37]], 'foot');
    expect(r.provider).toMatch(/BRouter/);
    expect(r.notice).toMatch(/Fallback/);
    expect(r.totalM).toBeGreaterThan(500_000);

    mockFetch(() => new Response('down', { status: 500 }));
    const d = await planRoute([[52.5, 13.4], [48.2, 16.37]], 'foot');
    expect(d.provider).toMatch(/Great circle/);
  });
});

describe('photos & surroundings', () => {
  it('parses Wikimedia Commons results, newest first, skipping SVGs', async () => {
    const { commonsPhotos } = await import('../server/photos');
    mockFetch(() => ({
      query: {
        pages: {
          '1': { pageid: 1, title: 'File:Old_bridge.jpg', coordinates: [{ lat: 50, lon: 14 }], imageinfo: [{ url: 'u1', thumburl: 't1', descriptionurl: 'd1', mime: 'image/jpeg', extmetadata: { DateTimeOriginal: { value: '2012:05:01 10:00' }, Artist: { value: '<a href="x">Jane</a>' } } }] },
          '2': { pageid: 2, title: 'File:New.jpg', coordinates: [{ lat: 50.01, lon: 14 }], imageinfo: [{ url: 'u2', descriptionurl: 'd2', mime: 'image/jpeg', extmetadata: { DateTimeOriginal: { value: '2025-07-03' } } }] },
          '3': { pageid: 3, title: 'File:Map.svg', coordinates: [{ lat: 50, lon: 14 }], imageinfo: [{ url: 'u3', descriptionurl: 'd3', mime: 'image/svg+xml' }] },
        },
      },
    }));
    const photos = await commonsPhotos(50, 14);
    expect(photos.map((p) => p.id)).toEqual(['wm-2', 'wm-1']);
    expect(photos[1].author).toBe('Jane');
  });

  it('parses weather, wikipedia and google places', async () => {
    const { weather, wikipedia, googlePlaces } = await import('../server/surroundings');
    mockFetch((url, init) => {
      if (url.includes('open-meteo'))
        return {
          timezone: 'Europe/Prague',
          current: { time: '2026-09-23T14:00', temperature_2m: 18.2, apparent_temperature: 17, wind_speed_10m: 9, precipitation: 0, weather_code: 2, is_day: 1 },
          daily: { temperature_2m_max: [20], temperature_2m_min: [9], sunrise: ['2026-09-23T06:40'], sunset: ['2026-09-23T18:50'] },
        };
      if (url.includes('wikipedia'))
        return { query: { pages: [{ pageid: 1, title: 'Far', extract: 'x', coordinates: [{ lat: 50.05, lon: 14 }] }, { pageid: 2, title: 'Near', extract: 'y', coordinates: [{ lat: 50.001, lon: 14 }] }] } };
      if (url.includes('places.googleapis.com')) {
        expect(new Headers(init?.headers).get('X-Goog-Api-Key')).toBe('g');
        return { places: [{ id: 'p', displayName: { text: 'Café' }, rating: 4.6, userRatingCount: 120, location: { latitude: 50, longitude: 14 }, reviews: [{ rating: 5, text: { text: 'Great cake' } }] }] };
      }
      throw new Error(url);
    });
    expect((await weather(50, 14)).temperatureC).toBe(18.2);
    expect((await wikipedia(50, 14, 'de')).map((a) => a.title)).toEqual(['Near', 'Far']);
    expect(await googlePlaces(50, 14, 'en')).toEqual([]);
    process.env.GOOGLE_PLACES_API_KEY = 'g';
    expect((await googlePlaces(50, 14, 'en'))[0]).toMatchObject({ name: 'Café', rating: 4.6 });
  });
});
