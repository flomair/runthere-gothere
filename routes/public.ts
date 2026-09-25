import { publicJourney } from '../server/groups.js';
import { HttpError, handle, json } from '../server/http.js';

/** GET /api/public?token=… – read-only journey for a public share link (no sign-in). */
export const GET = handle(async (req) => {
  const token = new URL(req.url).searchParams.get('token');
  if (!token || !/^[\w-]{10,64}$/.test(token)) throw new HttpError(404, 'This link is not valid.');
  return json(await publicJourney(token), { cacheSeconds: 120 });
});
