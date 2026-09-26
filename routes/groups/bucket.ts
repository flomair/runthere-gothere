import { authed } from '../../server/access.js';
import { addPrize, bucketView, deliverPrize, removePrize } from '../../server/bucket.js';
import { HttpError, json, readJson } from '../../server/http.js';

/** GET ?id=<group> – the surprise bucket as you may see it, plus your draws and the "?" pins. */
export const GET = authed(async (req, user) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new HttpError(400, 'missing id');
  return json(await bucketView(user, id), { headers: { 'Cache-Control': 'no-store' } });
});

/** POST { id, title, tier: 'small'|'medium'|'rare', anonymous? } – put a hidden prize in the bucket. */
export const POST = authed(async (req, user) => {
  const body = await readJson<{ id?: string; title?: string; tier?: string; anonymous?: boolean }>(req);
  if (!body.id) throw new HttpError(400, 'missing id');
  return json({ prize: await addPrize(user, body.id, body) });
});

/** PATCH { id, prizeId, action: 'delivered', photo?, note? } or { id, prizeId, action: 'remove' } */
export const PATCH = authed(async (req, user) => {
  const body = await readJson<{ id?: string; prizeId?: string; action?: string; photo?: string; note?: string }>(req);
  if (!body.id || !body.prizeId) throw new HttpError(400, 'missing id or prizeId');
  if (body.action === 'remove') {
    await removePrize(user, body.id, body.prizeId);
    return json({ ok: true });
  }
  if (body.action === 'delivered') return json({ prize: await deliverPrize(user, body.id, body.prizeId, body) });
  throw new HttpError(400, 'unknown action');
});
