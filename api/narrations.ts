import { authed } from '../server/access.js';
import { HttpError, json } from '../server/http.js';
import { repo } from '../server/repo.js';

/** GET /api/narrations?key=… – a saved story for this spot and style, if any. */
export const GET = authed(async (req, user) => {
  const key = new URL(req.url).searchParams.get('key');
  if (!key) throw new HttpError(400, 'missing key');
  return json({ narration: await repo.getNarration(user.uid, key) }, { headers: { 'Cache-Control': 'no-store' } });
});
