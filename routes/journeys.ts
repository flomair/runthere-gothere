import { authed } from '../server/access.js';
import { HttpError, json, readJson } from '../server/http.js';
import { repo } from '../server/repo.js';
import type { Journey } from '../shared/types.js';

const MAX_POINTS = 6000;

function validate(j: Journey): Journey {
  const ok =
    j &&
    typeof j.id === 'string' &&
    /^[\w-]{1,80}$/.test(j.id) &&
    typeof j.name === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(j.startDate) &&
    Array.isArray(j.sportTypes) &&
    Array.isArray(j.manualEntries) &&
    Array.isArray(j.excludedActivityIds) &&
    Array.isArray(j.waypoints) &&
    Array.isArray(j.route?.points) &&
    j.route.points.length >= 2 &&
    j.route.points.length <= MAX_POINTS &&
    j.route.points.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) &&
    Number.isFinite(j.route.totalM);
  if (!ok) throw new HttpError(400, 'invalid journey');
  return { ...j, name: j.name.slice(0, 200) };
}

/** GET /api/journeys – all of the user's journeys. */
export const GET = authed(async (_req, user) => {
  return json({ journeys: await repo.listJourneys(user.uid) }, { headers: { 'Cache-Control': 'no-store' } });
});

/** PUT /api/journeys – create or replace one journey. */
export const PUT = authed(async (req, user) => {
  const j = validate(await readJson<Journey>(req));
  await repo.putJourney(user.uid, j);
  return json({ ok: true });
});

/** DELETE /api/journeys?id=… */
export const DELETE = authed(async (req, user) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new HttpError(400, 'missing id');
  await repo.deleteJourney(user.uid, id);
  return json({ ok: true });
});
