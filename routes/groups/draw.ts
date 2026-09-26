import { authed } from '../../server/access.js';
import { drawPrize, prizePhotoUrl } from '../../server/bucket.js';
import { HttpError, json, readJson } from '../../server/http.js';

/** POST { id, drawId } – use a draw: returns the revealed prize. */
export const POST = authed(async (req, user) => {
  const body = await readJson<{ id?: string; drawId?: string }>(req);
  if (!body.id || !body.drawId) throw new HttpError(400, 'missing id or drawId');
  return json(await drawPrize(user, body.id, body.drawId));
});

/** GET ?id=<group>&prizeId – signed link to the delivery photo (members only). */
export const GET = authed(async (req, user) => {
  const u = new URL(req.url);
  const id = u.searchParams.get('id');
  const prizeId = u.searchParams.get('prizeId');
  if (!id || !prizeId) throw new HttpError(400, 'missing id or prizeId');
  return json({ url: await prizePhotoUrl(user, id, prizeId) }, { headers: { 'Cache-Control': 'private, max-age=3000' } });
});
