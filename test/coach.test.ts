import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const OWNER = bearer('owner', 'owner@example.com');
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
    { name: 'Vienna', lat: 48.2, lon: 16.37 },
  ],
  mode: 'foot',
  route: { points: [[52.52, 13.405], [48.2, 16.37]], totalM: 680_000, provider: 'test' },
  event: { name: 'Vienna City Marathon', date: '2027-04-18' },
};
let store: ReturnType<typeof memoryRepo>;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-that-is-long-enough';
  process.env.ADMIN_EMAILS = 'owner@example.com';
  store = memoryRepo();
  setRepo(store);
});
afterEach(() => vi.unstubAllGlobals());

describe('coach', () => {
  it('builds a structured weekly plan with history, race and weather', async () => {
    const { seal } = await import('../server/crypto');
    await store.putJourney('owner', journey);
    await store.updateSecrets('owner', { ai: seal('ai-key', { key: 'sk-ant-api03-mine' }) });
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    await store.putActivities('owner', [1, 3, 8, 10].map((n, i) => ({ id: i, name: 'r', sportType: 'Run', distanceM: 8000 + i * 1000, movingTimeS: 2700, elevationGainM: 0, startDate: `${day(n)}T06:00:00Z`, startDateLocal: `${day(n)}T08:00:00Z` })));
    let body: { output_config: { format: { type: string } }; messages: { content: string }[] } | null = null;
    const plan = { summary: 'Build gently.', targetKm: 32, tip: 'Prague is calling.', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d, i) => ({ day: d, type: i === 6 ? 'long' : i % 2 ? 'rest' : 'easy', distanceKm: i % 2 ? 0 : 6, title: 't', details: 'd' })) };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('open-meteo')) return json({ daily: { time: ['2026-09-28'], temperature_2m_max: [18], temperature_2m_min: [9], precipitation_probability_max: [70], weather_code: [61] } });
        if (url.includes('api.anthropic.com')) {
          body = JSON.parse(String(init?.body));
          return json({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text: JSON.stringify(plan) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
        }
        throw new Error(url);
      }),
    );
    const coach = await import('../routes/coach');
    const res = await coach.POST(req('/api/coach', { method: 'POST', headers: OWNER, json: { journeyId: 'j1', lat: 48.1, lon: 11.5, lang: 'de' } }));
    const r = (await res.json()) as { plan: { targetKm: number; days: unknown[]; weekOf: string } };
    expect(res.status).toBe(200);
    expect(r.plan.targetKm).toBe(32);
    expect(r.plan.days).toHaveLength(7);
    expect(body!.output_config.format.type).toBe('json_schema');
    const prompt = body!.messages[0].content;
    expect(prompt).toContain('Vienna City Marathon on 2027-04-18');
    expect(prompt).toContain('rain 70%');
    expect(prompt).toContain('Write all text fields in German');
    expect((await store.getCoachPlan('owner', 'j1'))?.targetKm).toBe(32);
    expect((await store.getUser('owner'))?.stats?.coachPlans).toBe(1);
  });
});

describe('bookmarks & admin usage', () => {
  it('stores bookmarks per journey and lists usage for admins only', async () => {
    const bm = await import('../routes/bookmarks');
    const add = await bm.POST(req('/api/bookmarks', { method: 'POST', headers: OWNER, json: { journeyId: 'j1', kind: 'wiki', title: 'Frauenkirche', url: 'https://en.wikipedia.org/wiki/Frauenkirche', lat: 51.05, lon: 13.74 } }));
    const { bookmark } = (await add.json()) as { bookmark: { id: string } };
    expect((await bm.POST(req('/api/bookmarks', { method: 'POST', headers: OWNER, json: { journeyId: 'j1', kind: 'nope', title: 'x', lat: 1, lon: 2 } }))).status).toBe(400);
    const list = (await (await bm.GET(req('/api/bookmarks?journeyId=j1', { headers: OWNER }))).json()) as { bookmarks: { title: string }[] };
    expect(list.bookmarks.map((b) => b.title)).toEqual(['Frauenkirche']);
    await bm.DELETE(req(`/api/bookmarks?id=${bookmark.id}`, { method: 'DELETE', headers: OWNER }));
    expect(await store.listBookmarks('owner')).toEqual([]);

    await store.updateUser('owner', { email: 'owner@example.com', name: 'Flo', lastLoginAt: '2026-09-25' });
    await store.incrementStat('owner', 'stories');
    await store.allow({ email: 'friend@example.com', addedBy: 'x', addedAt: 'x' });
    const users = await import('../routes/admin/users');
    expect((await users.GET(req('/api/admin/users', { headers: bearer('friend', 'friend@example.com') }))).status).toBe(403);
    const r = (await (await users.GET(req('/api/admin/users', { headers: OWNER }))).json()) as { users: { uid: string; stats: { stories: number }; hasAiKey: boolean }[] };
    expect(r.users[0]).toMatchObject({ uid: 'owner', stats: { stories: 1 }, hasAiKey: false });
  });
});
