import { HttpError, handle, json, numParam } from '../server/http.js';
import { readSession, sessionCookie } from '../server/session.js';
import { ensureFresh, listActivities } from '../server/strava.js';

/** GET /api/activities?after=<epoch seconds> – the athlete's activities since then. */
export const GET = handle(async (req) => {
  const stored = readSession(req);
  if (!stored) throw new HttpError(401, 'Not connected to Strava');
  const after = numParam(new URL(req.url), 'after', 0, 1e11);
  const { session, refreshed } = await ensureFresh(stored);
  const activities = await listActivities(session, after);
  const headers = new Headers({ 'Cache-Control': 'private, no-store' });
  if (refreshed) headers.append('Set-Cookie', sessionCookie(req, session));
  return json({ activities }, { headers });
});
