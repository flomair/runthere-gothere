import { authed } from '../../server/access.js';
import { json } from '../../server/http.js';
import { disconnectStrava } from '../../server/sync.js';

/** POST /api/strava/disconnect – revoke access and forget the tokens (synced activities stay). */
export const POST = authed(async (_req, user) => {
  await disconnectStrava(user.uid);
  return json({ ok: true });
});
