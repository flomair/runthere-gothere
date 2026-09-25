import { waitUntil } from '@vercel/functions';
import { derivedToken } from '../../server/crypto.js';
import { handle, json } from '../../server/http.js';
import { type StravaEvent, handleStravaEvent } from '../../server/sync.js';

export const verifyToken = () => derivedToken('strava-webhook');

/** GET – Strava's subscription validation handshake. */
export const GET = handle(async (req) => {
  const p = new URL(req.url).searchParams;
  if (p.get('hub.mode') !== 'subscribe' || p.get('hub.verify_token') !== verifyToken()) {
    return json({ error: 'forbidden' }, { status: 403 });
  }
  return json({ 'hub.challenge': p.get('hub.challenge') });
});

/**
 * POST – activity/athlete events. Strava wants a 200 within 2 seconds, so the work continues
 * after the response via waitUntil. Only the object ids are trusted: the activity itself is
 * re-fetched from Strava with the owner's token.
 */
export const POST = handle(async (req) => {
  const e = (await req.json().catch(() => null)) as StravaEvent | null;
  if (e && typeof e.owner_id === 'number' && typeof e.object_id === 'number') {
    waitUntil(
      handleStravaEvent(e)
        .then((r) => console.log(`strava event ${e.object_type} ${e.aspect_type} ${e.object_id}: ${r}`))
        .catch((err) => console.error('strava event failed', err)),
    );
  }
  return json({ ok: true });
});
