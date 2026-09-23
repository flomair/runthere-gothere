import { HttpError, handle } from '../server/http.js';
import { narrate } from '../server/narrate.js';
import type { NarrateRequest } from '../shared/types.js';

const STYLES = new Set(['travelogue', 'postcard', 'coach', 'kids']);

/**
 * POST /api/narrate – AI-written description of the virtual surroundings, streamed as text.
 * Uses the caller's own Anthropic key from the `x-anthropic-key` header if given (never stored),
 * otherwise the server's ANTHROPIC_API_KEY.
 */
export const POST = handle(async (req) => {
  const body = (await req.json().catch(() => null)) as NarrateRequest | null;
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
  body.language = /^[a-z]{2,3}$/.test(body.language) ? body.language : 'en';
  const stream = await narrate(body, req.headers.get('x-anthropic-key')?.trim() || undefined);
  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
});
