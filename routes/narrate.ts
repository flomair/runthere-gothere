import { authed } from '../server/access.js';
import { aiKeyFor } from '../server/aikey.js';
import { HttpError } from '../server/http.js';
import { narrate } from '../server/narrate.js';
import { repo } from '../server/repo.js';
import type { NarrateRequest } from '../shared/types.js';

const STYLES = new Set(['travelogue', 'postcard', 'coach', 'kids']);

/**
 * POST /api/narrate – AI-written description of the virtual surroundings, streamed as text.
 * Always uses the signed-in user's own stored Anthropic key. The finished story is saved
 * under `saveKey` so it can be shown again without another call.
 */
export const POST = authed(async (req, user) => {
  const body = (await req.json().catch(() => null)) as (NarrateRequest & { saveKey?: string }) | null;
  if (
    !body ||
    !Number.isFinite(body.lat) ||
    !Number.isFinite(body.lon) ||
    Math.abs(body.lat) > 90 ||
    Math.abs(body.lon) > 180 ||
    !STYLES.has(body.style) ||
    !body.journey ||
    !(body.journey.totalM > 0)
  ) {
    throw new HttpError(400, 'invalid narrate request');
  }
  const key = await aiKeyFor(user.uid);
  if (!key) throw new HttpError(400, 'Add your own Anthropic API key in the narrator settings first.');
  body.language = /^[a-z]{2,3}$/.test(body.language) ? body.language : 'en';
  const saveKey = typeof body.saveKey === 'string' && body.saveKey.length < 300 ? body.saveKey : undefined;
  const stream = await narrate(body, key, saveKey ? async (text) => { await repo.putNarration(user.uid, saveKey, text); await repo.incrementStat(user.uid, 'stories'); } : undefined);
  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
});
