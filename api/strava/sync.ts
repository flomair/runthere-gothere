import { authed } from '../../server/access.js';
import { json, readJson } from '../../server/http.js';
import { syncUser } from '../../server/sync.js';

/** POST /api/strava/sync  { since?: 'YYYY-MM-DD' } – pull new (or older) activities now. */
export const POST = authed(async (req, user) => {
  const body = await readJson<{ since?: string }>(req).catch(() => ({}) as { since?: string });
  const since = body.since && /^\d{4}-\d{2}-\d{2}$/.test(body.since) ? Date.parse(`${body.since}T00:00:00Z`) / 1000 - 86_400 : undefined;
  return json(await syncUser(user.uid, since));
});
