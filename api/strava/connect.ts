import { randomBytes } from 'node:crypto';
import { authed } from '../../server/access.js';
import { seal } from '../../server/crypto.js';
import { json, originOf } from '../../server/http.js';
import { authorizeUrl } from '../../server/strava.js';

/**
 * POST /api/strava/connect → { url } to send the browser to. The OAuth state carries the
 * signed-in uid (encrypted, 10 minutes), so the callback knows whose account to link.
 */
export const POST = authed(async (req, user) => {
  const state = seal('oauth-state', { uid: user.uid, n: randomBytes(8).toString('hex'), exp: Date.now() + 10 * 60_000 });
  return json({ url: authorizeUrl(`${originOf(req)}/api/strava/callback`, state) });
});
