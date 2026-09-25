import { afterEach, describe, expect, it, vi } from 'vitest';
import { setRepo } from '../server/repo';
import { memoryRepo } from '../server/repo-memory';
import { chunks, localeFor, speechText } from '../server/tts';
import { bearer, fakeVerify, req } from './helpers';

vi.mock('../server/firebase', () => ({
  verifyIdToken: async (t: string) => fakeVerify(t),
  db: () => {
    throw new Error('no Firestore in tests');
  },
  googleAccessToken: async () => 'ya29.test',
  projectId: () => 'demo-project',
}));

afterEach(() => vi.unstubAllGlobals());

describe('text-to-speech helpers', () => {
  it('strips markdown and maps languages to voices', () => {
    expect(speechText('# Dresden\n\n*The* city on the **Elbe**.')).toBe('Dresden\n\nThe city on the Elbe.');
    expect(localeFor('de')).toBe('de-DE');
    expect(localeFor('xx')).toBe('en-US');
  });

  it('splits long text under the byte limit at paragraph and sentence boundaries', () => {
    const para = 'Über die Brücke läuft man in die Altstadt. '.repeat(60).trim();
    const parts = chunks([para, para, para].join('\n\n'), 2000);
    expect(parts.length).toBeGreaterThan(3);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(2000);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe([para, para, para].join(' ').replace(/\s+/g, ' '));
  });
});

describe('/api/tts', () => {
  process.env.SESSION_SECRET = 'test-secret-that-is-long-enough';
  process.env.ADMIN_EMAILS = 'me@example.com';
  setRepo(memoryRepo());
  const H = bearer('me', 'me@example.com');

  it('returns MP3 from Chirp 3 HD in the right language', async () => {
    const fetchMock = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => new Response(JSON.stringify({ audioContent: Buffer.from('ID3fake').toString('base64') })));
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('../routes/tts');
    const res = await POST(req('/api/tts', { method: 'POST', headers: H, json: { text: 'Hallo Dresden.', lang: 'de', voice: 'Kore' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('ID3fake');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.voice).toEqual({ languageCode: 'de-DE', name: 'de-DE-Chirp3-HD-Kore' });
  });

  it('explains how to enable the API when it is off', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'Cloud Text-to-Speech API has not been used in project 1 before or it is disabled.', details: [{ reason: 'SERVICE_DISABLED' }] } }), { status: 403 })));
    const { POST } = await import('../routes/tts');
    const res = await POST(req('/api/tts', { method: 'POST', headers: H, json: { text: 'Hello.', lang: 'en' } }));
    expect(res.status).toBe(501);
    expect(((await res.json()) as { error: string }).error).toMatch(/texttospeech.googleapis.com\?project=demo-project/);
  });
});
