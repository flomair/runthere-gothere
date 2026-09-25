import type { LatLon } from '../shared/geo.js';
import { HttpError, json } from '../server/http.js';
import { authed } from '../server/access.js';
import { type RouteMode, planRoute } from '../server/routing.js';

/** POST /api/route  { waypoints: [[lat,lon], ...], mode: 'foot' | 'hike' | 'bike' | 'direct' } */
export const POST = authed(async (req) => {
  const body = (await req.json().catch(() => null)) as { waypoints?: unknown; mode?: unknown } | null;
  const wps = body?.waypoints;
  const valid =
    Array.isArray(wps) &&
    wps.length >= 2 &&
    wps.length <= 25 &&
    wps.every(
      (p) => Array.isArray(p) && p.length === 2 && Math.abs(Number(p[0])) <= 90 && Math.abs(Number(p[1])) <= 180,
    );
  if (!valid) throw new HttpError(400, 'waypoints must be 2–25 [lat, lon] pairs');
  const mode: RouteMode = body?.mode === 'bike' || body?.mode === 'direct' || body?.mode === 'hike' ? body.mode : 'foot';
  const route = await planRoute((wps as number[][]).map(([a, b]) => [Number(a), Number(b)] as LatLon), mode);
  return json(route);
});
