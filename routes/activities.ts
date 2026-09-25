import { authed } from '../server/access.js';
import { json } from '../server/http.js';
import { repo } from '../server/repo.js';

/** GET /api/activities?since=YYYY-MM-DD – synced Strava activities (from Firestore, not Strava). */
export const GET = authed(async (req, user) => {
  const since = new URL(req.url).searchParams.get('since');
  const sinceIso = since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? `${since}T00:00:00Z` : undefined;
  // one day of slack for time zones; journeys filter on the local date
  const from = sinceIso ? new Date(Date.parse(sinceIso) - 86_400_000).toISOString() : undefined;
  return json({ activities: await repo.listActivities(user.uid, from) }, { headers: { 'Cache-Control': 'no-store' } });
});
