import { authed } from '../server/access.js';
import { elevations } from '../server/elevation.js';
import { HttpError, json, readJson } from '../server/http.js';

/** POST /api/elevation  { points: [[lat, lon], …] } (max 400) → { elevations: number[] } */
export const POST = authed(async (req) => {
  const { points } = await readJson<{ points?: unknown }>(req);
  const ok =
    Array.isArray(points) &&
    points.length >= 2 &&
    points.length <= 400 &&
    points.every((p) => Array.isArray(p) && Math.abs(Number(p[0])) <= 90 && Math.abs(Number(p[1])) <= 180);
  if (!ok) throw new HttpError(400, 'points must be 2–400 [lat, lon] pairs');
  return json({ elevations: await elevations(points as [number, number][]) }, { cacheSeconds: 86_400 });
});
