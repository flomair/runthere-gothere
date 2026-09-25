import { HttpError, json } from '../../server/http.js';
import { authed } from '../../server/access.js';
import { searchTrails } from '../../server/trails.js';

/** GET /api/trails/search?q=Rennsteig – named hiking routes from OpenStreetMap. */
export const GET = authed(async (req) => {
  const q = new URL(req.url).searchParams.get('q')?.trim();
  if (!q || q.length < 2) throw new HttpError(400, 'query too short');
  return json({ results: await searchTrails(q.slice(0, 120)) }, { cacheSeconds: 86_400 });
});
