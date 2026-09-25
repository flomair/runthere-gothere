import { authed } from '../../server/access.js';
import { HttpError, json, readJson } from '../../server/http.js';
import { photosAlong } from '../../server/photos.js';

const MAX_POINTS = 24;

/** POST /api/photos/along { points: [[lat, lon], …] } – one photo per point, for the street-level slideshow. */
export const POST = authed(async (req) => {
  const { points } = await readJson<{ points?: unknown }>(req);
  if (!Array.isArray(points) || points.length === 0 || points.length > MAX_POINTS) throw new HttpError(400, `send 1–${MAX_POINTS} points`);
  const pts = points.map((p) => {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180) throw new HttpError(400, 'invalid point');
    return [Number(p[0]), Number(p[1])] as [number, number];
  });
  return json({ frames: await photosAlong(pts) });
});
