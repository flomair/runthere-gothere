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
