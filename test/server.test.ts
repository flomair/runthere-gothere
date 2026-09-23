import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (url: string, init?: RequestInit) => unknown;
function mockFetch(handler: Handler) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = handler(url, init);
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-that-is-long-enough';
  process.env.STRAVA_CLIENT_ID = '123';
  process.env.STRAVA_CLIENT_SECRET = 'shh';
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MAPILLARY_TOKEN;
  delete process.env.GOOGLE_PLACES_API_KEY;
});

describe('session', () => {
  it('seals and unseals, rejects tampering', async () => {
    const { seal, unseal } = await import('../server/session');
    const token = seal({ a: 1 });
    expect(unseal(token)).toEqual({ a: 1 });
    expect(unseal(token.slice(0, -2) + 'xx')).toBeNull();
    process.env.SESSION_SECRET = 'another-secret-value-123';
    expect(unseal(token)).toBeNull();
  });
});

describe('strava', () => {
  it('paginates activities and maps fields', async () => {
    const { listActivities } = await import('../server/strava');
    const page = (n: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: n * 1000 + i,
        name: 'r',
        type: 'Run',
        sport_type: 'TrailRun',
        distance: 1000,
        moving_time: 300,
        elapsed_time: 320,
        total_elevation_gain: 5,
        start_date: `2026-09-${String(10 + n).padStart(2, '0')}T06:00:00Z`,
        start_date_local: `2026-09-${String(10 + n).padStart(2, '0')}T08:00:00Z`,
      }));
    const f = mockFetch((url) => {
      const p = Number(new URL(url).searchParams.get('page'));
      return p === 1 ? page(1, 200) : page(2, 3);
    });
    const acts = await listActivities({ accessToken: 't', refreshToken: 'r', expiresAt: 0, athlete: { id: 1 } }, 1000);
    expect(f).toHaveBeenCalledTimes(2);
    expect(acts).toHaveLength(203);
    expect(acts[0].sportType).toBe('TrailRun');
    const auth = new Headers(f.mock.calls[0][1]?.headers).get('Authorization');
    expect(auth).toBe('Bearer t');
  });

  it('refreshes an expired token', async () => {
    const { ensureFresh } = await import('../server/strava');
    const f = mockFetch(() => ({ access_token: 'new', refresh_token: 'r2', expires_at: 9e9 }));
    const { session, refreshed } = await ensureFresh({ accessToken: 'old', refreshToken: 'r', expiresAt: 0, athlete: { id: 1 } });
    expect(refreshed).toBe(true);
    expect(session.accessToken).toBe('new');
    expect(String(f.mock.calls[0][1]?.body)).toContain('grant_type=refresh_token');
  });
});

describe('routing', () => {
  it('falls back from OSRM to BRouter to great circle', async () => {
    const { planRoute } = await import('../server/routing');
    mockFetch((url) => {
      if (url.includes('routing.openstreetmap.de')) return new Response('boom', { status: 503 });
      if (url.includes('brouter.de'))
        return { features: [{ geometry: { coordinates: [[13.4, 52.5, 30], [14, 51], [16.37, 48.2, 170]] } }] };
      throw new Error('unexpected');
    });
    const r = await planRoute([[52.5, 13.4], [48.2, 16.37]], 'foot');
    expect(r.provider).toMatch(/BRouter/);
    expect(r.notice).toMatch(/Fallback/);
    expect(r.points[0]).toEqual([52.5, 13.4]);
    expect(r.totalM).toBeGreaterThan(500_000);

    mockFetch(() => new Response('down', { status: 500 }));
    const d = await planRoute([[52.5, 13.4], [48.2, 16.37]], 'foot');
    expect(d.provider).toMatch(/Great circle/);
    expect(d.notice).toBeTruthy();
  });

  it('uses OSRM geometry when available', async () => {
    const { planRoute } = await import('../server/routing');
    mockFetch(() => ({ code: 'Ok', routes: [{ distance: 1, geometry: { coordinates: [[13.4, 52.5], [13.5, 52.4]] } }] }));
    const r = await planRoute([[52.5, 13.4], [52.4, 13.5]], 'bike');
    expect(r.provider).toMatch(/OSRM bike/);
    expect(r.points).toEqual([[52.5, 13.4], [52.4, 13.5]]);
  });
});

describe('photos & surroundings', () => {
  it('parses Wikimedia Commons results, newest first, skipping SVGs', async () => {
    const { commonsPhotos } = await import('../server/photos');
    mockFetch(() => ({
      query: {
        pages: {
          '1': {
            pageid: 1,
            title: 'File:Old_bridge.jpg',
            coordinates: [{ lat: 50, lon: 14 }],
            imageinfo: [{ url: 'u1', thumburl: 't1', descriptionurl: 'd1', mime: 'image/jpeg', extmetadata: { DateTimeOriginal: { value: '2012:05:01 10:00' }, Artist: { value: '<a href="x">Jane</a>' } } }],
          },
          '2': {
            pageid: 2,
            title: 'File:New.jpg',
            coordinates: [{ lat: 50.01, lon: 14 }],
            imageinfo: [{ url: 'u2', descriptionurl: 'd2', mime: 'image/jpeg', extmetadata: { DateTimeOriginal: { value: '2025-07-03' } } }],
          },
          '3': { pageid: 3, title: 'File:Map.svg', coordinates: [{ lat: 50, lon: 14 }], imageinfo: [{ url: 'u3', descriptionurl: 'd3', mime: 'image/svg+xml' }] },
        },
      },
    }));
    const photos = await commonsPhotos(50, 14);
    expect(photos.map((p) => p.id)).toEqual(['wm-2', 'wm-1']);
    expect(photos[1].author).toBe('Jane');
    expect(photos[1].title).toBe('Old bridge');
    expect(photos[0].distanceM).toBeGreaterThan(1000);
  });

  it('skips Mapillary without a token and sorts by capture date with one', async () => {
    const { mapillaryPhotos } = await import('../server/photos');
    expect(await mapillaryPhotos(50, 14)).toEqual([]);
    process.env.MAPILLARY_TOKEN = 'tok';
    mockFetch(() => ({
      data: [
        { id: 'a', captured_at: 1, thumb_1024_url: 'a.jpg', geometry: { coordinates: [14, 50] } },
        { id: 'b', captured_at: 2, thumb_1024_url: 'b.jpg', geometry: { coordinates: [14, 50] } },
      ],
    }));
    expect((await mapillaryPhotos(50, 14)).map((p) => p.id)).toEqual(['mly-b', 'mly-a']);
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
        return { query: { pages: [{ pageid: 1, title: 'Far', extract: 'x', coordinates: [{ lat: 50.05, lon: 14 }] }, { pageid: 2, title: 'Near', extract: 'y', fullurl: 'https://de.wikipedia.org/wiki/Near', coordinates: [{ lat: 50.001, lon: 14 }] }] } };
      if (url.includes('places.googleapis.com')) {
        expect(new Headers(init?.headers).get('X-Goog-Api-Key')).toBe('g');
        return { places: [{ id: 'p', displayName: { text: 'Café' }, rating: 4.6, userRatingCount: 120, location: { latitude: 50, longitude: 14 }, reviews: [{ rating: 5, text: { text: 'Great cake' } }] }] };
      }
      throw new Error(url);
    });
    const w = await weather(50, 14);
    expect(w.temperatureC).toBe(18.2);
    expect(w.today?.maxC).toBe(20);
    const wiki = await wikipedia(50, 14, 'de');
    expect(wiki.map((a) => a.title)).toEqual(['Near', 'Far']);
    expect(await googlePlaces(50, 14, 'en')).toEqual([]);
    process.env.GOOGLE_PLACES_API_KEY = 'g';
    const pl = await googlePlaces(50, 14, 'en');
    expect(pl[0]).toMatchObject({ name: 'Café', rating: 4.6, review: { text: 'Great cake' } });
  });
});

describe('api handlers', () => {
  it('route validates input', async () => {
    const { POST } = await import('../api/route');
    const res = await POST(new Request('http://x/api/route', { method: 'POST', body: JSON.stringify({ waypoints: [[1, 2]] }) }));
    expect(res.status).toBe(400);
  });

  it('activities require a session', async () => {
    const { GET } = await import('../api/activities');
    const res = await GET(new Request('http://x/api/activities?after=0'));
    expect(res.status).toBe(401);
  });

  it('login redirects to Strava with state cookie', async () => {
    const { GET } = await import('../api/auth/login');
    const res = await GET(new Request('https://app.example/api/auth/login'));
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.host).toBe('www.strava.com');
    expect(loc.searchParams.get('redirect_uri')).toBe('https://app.example/api/auth/callback');
    expect(loc.searchParams.get('scope')).toContain('activity:read_all');
    expect(res.headers.get('set-cookie')).toContain(`rtgt_oauth_state=${loc.searchParams.get('state')}`);
  });

  it('callback rejects a mismatched state', async () => {
    const { GET } = await import('../api/auth/callback');
    const res = await GET(new Request('https://app.example/api/auth/callback?code=c&state=a&scope=read,activity:read_all', { headers: { cookie: 'rtgt_oauth_state=b' } }));
    expect(res.headers.get('location')).toContain('strava_error=invalid_state');
  });

  it('callback stores an encrypted session', async () => {
    mockFetch(() => ({ access_token: 'a', refresh_token: 'r', expires_at: 9e9, athlete: { id: 7, firstname: 'Flo' } }));
    const { GET } = await import('../api/auth/callback');
    const res = await GET(new Request('https://app.example/api/auth/callback?code=c&state=s&scope=read,activity:read_all', { headers: { cookie: 'rtgt_oauth_state=s' } }));
    expect(res.headers.get('location')).toBe('https://app.example/?strava=connected');
    const cookies = res.headers.getSetCookie();
    const session = cookies.find((c) => c.startsWith('rtgt_session='))!;
    expect(session).toContain('HttpOnly');
    expect(session).toContain('Secure');
    const { readSession } = await import('../server/session');
    const me = readSession(new Request('https://x', { headers: { cookie: session.split(';')[0] } }));
    expect(me?.athlete.firstname).toBe('Flo');
  });

  it('narrate explains a missing key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockFetch(() => ({}));
    const { POST } = await import('../api/narrate');
    const res = await POST(
      new Request('http://x/api/narrate', {
        method: 'POST',
        body: JSON.stringify({ lat: 50, lon: 14, language: 'en', style: 'travelogue', journey: { name: 'n', from: 'a', to: 'b', totalM: 10, doneM: 1 } }),
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/API key/);
  });
});
