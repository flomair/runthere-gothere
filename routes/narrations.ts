import { authed } from '../server/access.js';
import { HttpError, json } from '../server/http.js';
import { repo } from '../server/repo.js';

/** GET /api/narrations?key=… – a saved story for this spot and style; ?journeyId=… – all stories of a journey. */
export const GET = authed(async (req, user) => {
  const params = new URL(req.url).searchParams;
  const journeyId = params.get('journeyId');
  if (journeyId) return json({ narrations: await repo.listNarrations(user.uid, journeyId) }, { headers: { 'Cache-Control': 'no-store' } });
  const key = params.get('key');
  if (!key) throw new HttpError(400, 'missing key');
  return json({ narration: await repo.getNarration(user.uid, key) }, { headers: { 'Cache-Control': 'no-store' } });
});
