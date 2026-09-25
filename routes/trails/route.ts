import { HttpError, json } from '../../server/http.js';
import { authed } from '../../server/access.js';
import { loadTrail } from '../../server/trails.js';

/** GET /api/trails/route?id=<OSM relation id>&reverse=1 – the trail as a journey route. */
export const GET = authed(async (req) => {
  const url = new URL(req.url);
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'invalid relation id');
  const route = await loadTrail(id, url.searchParams.get('reverse') === '1');
  return json(route, { cacheSeconds: 7 * 86_400 });
});
