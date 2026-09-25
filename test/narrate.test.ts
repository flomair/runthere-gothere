import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
let store: ReturnType<typeof memoryRepo>;

function sse(events: [string, unknown][]) {
  const text = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
  return new Response(text, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const apiError = (status: number, type: string, message: string) => json({ type: 'error', error: { type, message } }, status);
const model = () => json({ type: 'model', id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5', created_at: '2026-01-01T00:00:00Z' });

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-that-is-long-enough';
  process.env.ADMIN_EMAILS = 'owner@example.com';
  store = memoryRepo();
  setRepo(store);
});
afterEach(() => vi.unstubAllGlobals());

describe('AI key (per user, encrypted)', () => {
  it('validates, stores encrypted, masks, and deletes', async () => {
    const seen: Headers[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_i: unknown, init?: RequestInit) => {
        const h = new Headers(init?.headers);
        seen.push(h);
        if (h.get('x-api-key') === 'sk-ant-api03-bad0') return apiError(401, 'authentication_error', 'invalid x-api-key');
        if (!h.get('anthropic-workspace-id')) return apiError(400, 'invalid_request_error', 'This API key is not scoped to a workspace');
        return model();
      }),
    );
    const api = await import('../api/ai-key');
    const bad = await api.PUT(req('/api/ai-key', { method: 'PUT', headers: OWNER, json: { key: ' sk-ant-api03-bad0 ' } }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toContain('invalid x-api-key');
    expect((await store.getSecrets('owner')).ai).toBeUndefined();

    const noWs = await api.PUT(req('/api/ai-key', { method: 'PUT', headers: OWNER, json: { key: 'sk-ant-api03-good1234' } }));
    expect(((await noWs.json()) as { error: string }).error).toMatch(/Workspace ID/);

    const good = await api.PUT(req('/api/ai-key', { method: 'PUT', headers: OWNER, json: { key: '"sk-ant-api03-good1234"', workspaceId: 'wrkspc_1' } }));
    expect(await good.json()).toMatchObject({ ok: true, model: 'Claude Sonnet 5' });
    expect(seen.at(-1)!.get('authorization')).toBeNull();
    const sealed = (await store.getSecrets('owner')).ai!;
    expect(sealed).not.toContain('good1234');
    expect((await store.getUser('owner'))?.ai).toMatchObject({ masked: 'sk-ant-api03-…1234', workspaceId: 'wrkspc_1' });

    expect(await (await api.POST(req('/api/ai-key', { method: 'POST', headers: OWNER }))).json()).toMatchObject({ ok: true });
    await api.DELETE(req('/api/ai-key', { method: 'DELETE', headers: OWNER }));
    expect((await store.getSecrets('owner')).ai).toBeUndefined();
    expect((await store.getUser('owner'))?.ai).toBeUndefined();
  });

  it('explains an empty credit balance', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => apiError(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.')));
    const api = await import('../api/ai-key');
    const r = (await (await api.PUT(req('/api/ai-key', { method: 'PUT', headers: OWNER, json: { key: 'sk-ant-api03-x1' } }))).json()) as { error: string };
    expect(r.error).toMatch(/no credits left/);
  });
});

describe('narrate', () => {
  const body = {
    lat: 51.05,
    lon: 13.74,
    language: 'en',
    style: 'travelogue',
    saveKey: 'j1|51.050|13.740|travelogue',
    journey: { name: 'Berlin → Vienna', from: 'Berlin', to: 'Vienna', totalM: 680_000, doneM: 190_000, upcoming: [{ name: 'Prague', inM: 150_000 }] },
  };

  it('requires the user’s own key', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-server-should-be-ignored';
    const { POST } = await import('../api/narrate');
    const res = await POST(req('/api/narrate', { method: 'POST', headers: OWNER, json: body }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/your own Anthropic API key/);
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('streams a story with the stored key and saves it', async () => {
    const { seal } = await import('../server/crypto');
    await store.updateSecrets('owner', { ai: seal('ai-key', { key: 'sk-ant-api03-mine', workspaceId: 'wrkspc_9' }) });
    let anthropicBody: { model: string; thinking: { type: string }; messages: { content: string }[] } | null = null;
    let headers: Headers | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('nominatim')) return json({ display_name: 'Dresden', address: { city: 'Dresden', state: 'Saxony', country: 'Germany' } });
        if (url.includes('open-meteo'))
          return json({ timezone: 'Europe/Berlin', current: { time: '2026-09-23T15:00', temperature_2m: 17, apparent_temperature: 16, wind_speed_10m: 12, precipitation: 0, weather_code: 3, is_day: 1 } });
        if (url.includes('wikipedia')) return json({ query: { pages: [{ pageid: 1, title: 'Frauenkirche', extract: 'Rebuilt in 2005.', coordinates: [{ lat: 51.05, lon: 13.74 }] }] } });
        if (url.includes('api.anthropic.com')) {
          anthropicBody = JSON.parse(String(init?.body));
          headers = new Headers(init?.headers);
          const msg = { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } };
          return sse([
            ['message_start', { type: 'message_start', message: msg }],
            ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
            ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'We stand in ' } }],
            ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Dresden.' } }],
            ['content_block_stop', { type: 'content_block_stop', index: 0 }],
            ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } }],
            ['message_stop', { type: 'message_stop' }],
          ]);
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
    const { POST } = await import('../api/narrate');
    const res = await POST(req('/api/narrate', { method: 'POST', headers: OWNER, json: body }));
    expect(await res.text()).toBe('We stand in Dresden.');
    expect(headers!.get('x-api-key')).toBe('sk-ant-api03-mine');
    expect(headers!.get('anthropic-workspace-id')).toBe('wrkspc_9');
    expect(anthropicBody!.model).toBe('claude-sonnet-5');
    expect(anthropicBody!.thinking.type).toBe('adaptive');
    const prompt = anthropicBody!.messages[0].content;
    expect(prompt).toContain('Dresden (Saxony, Germany)');
    expect(prompt).toContain('Frauenkirche');
    expect(prompt).toContain('Prague in 150 km');
    expect(prompt).toMatch(/excursus/i);

    const saved = await store.getNarration('owner', body.saveKey);
    expect(saved?.text).toBe('We stand in Dresden.');
    const n = await import('../api/narrations');
    const r = (await (await n.GET(req(`/api/narrations?key=${encodeURIComponent(body.saveKey)}`, { headers: OWNER }))).json()) as { narration: { text: string } };
    expect(r.narration.text).toBe('We stand in Dresden.');
  });
});
