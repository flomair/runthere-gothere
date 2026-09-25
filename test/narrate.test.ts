import { afterEach, describe, expect, it, vi } from 'vitest';

function sse(events: [string, unknown][]) {
  const text = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
  return new Response(text, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('narrate', () => {
  it('gathers context, calls Claude with fallbacks and streams text back', async () => {
    let anthropicBody: Record<string, unknown> | null = null;
    let anthropicHeaders: Headers | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } });
        if (url.includes('nominatim')) return json({ display_name: 'Dresden, Saxony, Germany', address: { city: 'Dresden', state: 'Saxony', country: 'Germany' } });
        if (url.includes('open-meteo'))
          return json({ timezone: 'Europe/Berlin', current: { time: '2026-09-23T15:00', temperature_2m: 17, apparent_temperature: 16, wind_speed_10m: 12, precipitation: 0, weather_code: 3, is_day: 1 } });
        if (url.includes('wikipedia')) return json({ query: { pages: [{ pageid: 1, title: 'Frauenkirche', extract: 'A Lutheran church rebuilt in 2005.', coordinates: [{ lat: 51.05, lon: 13.74 }] }] } });
        if (url.includes('api.anthropic.com')) {
          anthropicBody = JSON.parse(String(init?.body));
          anthropicHeaders = new Headers(init?.headers);
          const msg = { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } };
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
    const res = await POST(
      new Request('http://x/api/narrate', {
        method: 'POST',
        headers: { 'x-anthropic-key': 'sk-ant-user' },
        body: JSON.stringify({
          lat: 51.05,
          lon: 13.74,
          language: 'en',
          style: 'travelogue',
          journey: { name: 'Berlin → Vienna', from: 'Berlin', to: 'Vienna', totalM: 680_000, doneM: 190_000, upcoming: [{ name: 'Prague', inM: 150_000 }] },
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('We stand in Dresden.');

    expect(anthropicHeaders!.get('x-api-key')).toBe('sk-ant-user');
    expect(anthropicHeaders!.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    const body = anthropicBody as unknown as { model: string; fallbacks: string; stream: boolean; messages: { content: string }[] };
    expect(body.model).toBe('claude-opus-5');
    expect(body.fallbacks).toBe('default');
    expect(body.stream).toBe(true);
    const prompt = body.messages[0].content;
    expect(prompt).toContain('Dresden (Saxony, Germany)');
    expect(prompt).toContain('Frauenkirche');
    expect(prompt).toContain('Overcast, 17°C');
    expect(prompt).toContain('Prague in 150 km');
    expect(prompt).toMatch(/excursus/i);
  });
});

describe('key handling', () => {
  it('cleans pasted keys and prefers the user key', async () => {
    const { cleanKey, resolveKey } = await import('../server/narrate');
    expect(cleanKey(' "sk-ant-api03-abc​def"\n')).toBe('sk-ant-api03-abcdef');
    process.env.ANTHROPIC_API_KEY = "'sk-ant-api03-server1234'";
    expect(resolveKey('')).toMatchObject({ source: 'server', key: 'sk-ant-api03-server1234', masked: 'sk-ant-api03-…1234' });
    expect(resolveKey('sk-ant-api03-mine9999')).toMatchObject({ source: 'yours', masked: 'sk-ant-api03-…9999' });
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('reports which key Anthropic rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toContain('/v1/models/claude-opus-5');
        const h = new Headers(init?.headers);
        expect(h.get('x-api-key')).toBe('sk-ant-api03-bad0');
        expect(h.get('authorization')).toBeNull();
        return new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const { POST } = await import('../api/ai-check');
    const r = (await (await POST(new Request('http://x/api/ai-check', { method: 'POST', headers: { 'x-anthropic-key': ' sk-ant-api03-bad0 ' } }))).json()) as {
      ok: boolean;
      error: string;
    };
    expect(r.ok).toBe(false);
    expect(r.error).toContain('your key (sk-ant-api03-…bad0)');
    expect(r.error).toContain('invalid x-api-key');
  });
});

describe('workspace header', () => {
  it('sends anthropic-workspace-id with the user key and explains the error without it', async () => {
    const seen: (string | null)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const ws = new Headers(init?.headers).get('anthropic-workspace-id');
        seen.push(ws);
        if (!ws)
          return new Response(
            JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header' } }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        return new Response(JSON.stringify({ type: 'model', id: 'claude-opus-5', display_name: 'Claude Opus 5', created_at: '2026-01-01T00:00:00Z' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const { POST } = await import('../api/ai-check');
    const call = (h: Record<string, string>) =>
      POST(new Request('http://x/api/ai-check', { method: 'POST', headers: h })).then((r) => r.json() as Promise<{ ok: boolean; error?: string; model?: string }>);
    const without = await call({ 'x-anthropic-key': 'sk-ant-api03-org1' });
    expect(without.ok).toBe(false);
    expect(without.error).toMatch(/Workspace ID/);
    const withWs = await call({ 'x-anthropic-key': 'sk-ant-api03-org1', 'x-anthropic-workspace': ' wrkspc_abc123 ' });
    expect(withWs).toMatchObject({ ok: true, model: 'Claude Opus 5' });
    expect(seen).toEqual([null, 'wrkspc_abc123']);
  });
});
