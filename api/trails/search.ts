import { HttpError, handle, json } from '../../server/http.js';
import { searchTrails } from '../../server/trails.js';

/** GET /api/trails/search?q=Rennsteig – named hiking routes from OpenStreetMap. */
export const GET = handle(async (req) => {
  const q = new URL(req.url).searchParams.get('q')?.trim();
  if (!q || q.length < 2) throw new HttpError(400, 'query too short');
  return json({ results: await searchTrails(q.slice(0, 120)) }, { cacheSeconds: 86_400 });
});
