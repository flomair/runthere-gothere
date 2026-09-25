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

// Berlin → Dresden → Prague → Vienna, as a dense straight-segment line
const WPS: LatLon[] = [[52.52, 13.405], [51.05, 13.74], [50.075, 14.437], [48.208, 16.373]];
const points: LatLon[] = [];
for (let i = 1; i < WPS.length; i++) for (let t = 0; t < 60; t++) points.push([WPS[i - 1][0] + ((WPS[i][0] - WPS[i - 1][0]) * t) / 60, WPS[i - 1][1] + ((WPS[i][1] - WPS[i - 1][1]) * t) / 60]);
points.push(WPS[3]);
const totalM = cumulativeDistances(points).at(-1)!;

const journey: Journey = {
  id: 'j1',
  name: 'Berlin → Vienna',
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
    { name: 'Vienna', lat: 48.208, lon: 16.373 },
  ],
  mode: 'foot',
  route: { points, totalM, provider: 'test' },
};

const act = (id: number, day: string, km: number) => ({
  id,
  name: `Run ${id}`,
  sportType: 'Run',
  distanceM: km * 1000,
  movingTimeS: km * 330,
  elevationGainM: 0,
  startDate: `${day}T06:00:00Z`,
  startDateLocal: `${day}T08:00:00Z`,
});

const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } });
let store: ReturnType<typeof memoryRepo>;

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-that-is-long-enough';
  process.env.ADMIN_EMAILS = 'owner@example.com';
  store = memoryRepo();
  setRepo(store);
});
afterEach(() => vi.unstubAllGlobals());

describe('milestone candidates', () => {
  it('finds waypoints, every 100 km, halfway, borders and the finish', async () => {
    const { milestoneCandidates, routeCountries } = await import('../server/milestones');
    const c = milestoneCandidates(journey);
    const kinds = c.map((x) => `${x.kind}:${x.countryCode ?? x.title}`);
    expect(kinds).toContain('waypoint:Arrived in Dresden');
    expect(kinds).toContain('waypoint:Arrived in Prague');
    expect(kinds).toContain('distance:100 km on the road');
    expect(kinds).toContain('halfway:Halfway there');
    expect(kinds).toContain('border:CZ');
    expect(kinds).toContain('border:AT');
    expect(c.at(-1)).toMatchObject({ kind: 'finish', title: 'You made it to Vienna!' });
    expect(c.map((x) => x.atM)).toEqual([...c.map((x) => x.atM)].sort((a, b) => a - b));
    expect(routeCountries(journey)).toEqual(['DE', 'CZ', 'AT']);
  });
});

describe('milestone detection', () => {
  it('creates reached milestones once, with place, photo and a postcard', async () => {
    const { seal } = await import('../server/crypto');
    await store.putJourney('owner', journey);
    await store.putActivities('owner', [act(1, '2026-09-05', 60), act(2, '2026-09-12', 60), act(3, '2026-09-19', 90)]);
    await store.updateSecrets('owner', { ai: seal('ai-key', { key: 'sk-ant-api03-mine' }) });
    let postcards = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('nominatim')) return json({ display_name: 'Somewhere', address: { town: 'Pirna', state: 'Saxony', country: 'Germany' } });
        if (url.includes('commons.wikimedia')) return json({ query: { pages: { '1': { pageid: 1, title: 'File:View.jpg', coordinates: [{ lat: 51, lon: 13.8 }], imageinfo: [{ url: 'u', thumburl: 't', descriptionurl: 'd', mime: 'image/jpeg' }] } } } });
        if (url.includes('open-meteo')) return json({ timezone: 'Europe/Berlin', current: { time: '2026-09-23T15:00', temperature_2m: 15, apparent_temperature: 14, wind_speed_10m: 10, precipitation: 0, weather_code: 1, is_day: 1 } });
        if (url.includes('api.anthropic.com')) {
          postcards++;
          return json({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text: 'Dear home, greetings from Pirna! — your virtual self' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
        }
        throw new Error(`unexpected ${url}`);
      }),
    );
    const { detectMilestones } = await import('../server/milestones');
    const created = await detectMilestones('owner', { delayMs: 0 });
    // 210 km along the straight test line: 100 km, Dresden (~165 km), 200 km, Czech border (~205 km)
    expect(created.map((m) => m.kind).sort()).toEqual(['border', 'distance', 'distance', 'waypoint']);
    expect(created.find((m) => m.kind === 'border')?.countryCode).toBe('CZ');
    const dresden = created.find((m) => m.kind === 'waypoint')!;
    expect(dresden.reachedAt.slice(0, 10)).toBe('2026-09-19');
    expect(dresden.place?.name).toBe('Pirna');
    expect(dresden.photo?.url).toBe('t');
    expect(postcards).toBe(2); // the two most recent
    expect((await store.listMilestones('owner', 'j1')).filter((m) => m.postcard).length).toBe(2);

    // nothing new on a second run
    expect(await detectMilestones('owner', { delayMs: 0 })).toEqual([]);

    // API: list, mark seen
    const list = await import('../routes/milestones');
    const r = (await (await list.GET(req('/api/milestones?journeyId=j1', { headers: bearer('owner', 'owner@example.com') }))).json()) as { milestones: { seen: boolean }[] };
    expect(r.milestones).toHaveLength(4);
    const seen = await import('../routes/milestones/seen');
    await seen.POST(req('/api/milestones/seen', { method: 'POST', headers: bearer('owner', 'owner@example.com'), json: { journeyId: 'j1' } }));
    expect((await store.listMilestones('owner', 'j1')).every((m) => m.seen)).toBe(true);
  });
});
