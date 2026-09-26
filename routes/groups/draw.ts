import { authed } from '../../server/access.js';
import { markRevealed, prizePhotoUrl } from '../../server/bucket.js';
import { HttpError, json, readJson } from '../../server/http.js';

/** POST { id, prizeId } – the winner opened the reveal of a surprise they won. */
export const POST = authed(async (req, user) => {
  const body = await readJson<{ id?: string; prizeId?: string }>(req);
  if (!body.id || !body.prizeId) throw new HttpError(400, 'missing id or prizeId');
  return json({ prize: await markRevealed(user, body.id, body.prizeId) });
});

/** GET ?id=<group>&prizeId – signed link to the delivery photo (members only). */
export const GET = authed(async (req, user) => {
  const u = new URL(req.url);
  const id = u.searchParams.get('id');
  const prizeId = u.searchParams.get('prizeId');
  if (!id || !prizeId) throw new HttpError(400, 'missing id or prizeId');
  return json({ url: await prizePhotoUrl(user, id, prizeId) }, { headers: { 'Cache-Control': 'private, max-age=3000' } });
});
