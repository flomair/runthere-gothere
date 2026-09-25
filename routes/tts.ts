import { authed } from '../server/access.js';
import { HttpError, readJson } from '../server/http.js';
import { NATURAL_VOICES, type NaturalVoice, synthesize } from '../server/tts.js';

const MAX_CHARS = 12_000;

/** POST /api/tts { text, lang, voice } → audio/mpeg, read by a natural Google Cloud voice. */
export const POST = authed(async (req) => {
  const { text, lang, voice } = await readJson<{ text?: string; lang?: string; voice?: string }>(req);
  if (!text?.trim()) throw new HttpError(400, 'missing text');
  if (text.length > MAX_CHARS) throw new HttpError(400, `text too long (max ${MAX_CHARS} characters)`);
  const v = (NATURAL_VOICES as readonly string[]).includes(voice ?? '') ? (voice as NaturalVoice) : 'Charon';
  const audio = await synthesize(text, /^[a-z]{2}/i.test(lang ?? '') ? lang! : 'en', v);
  return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=86400' } });
});
