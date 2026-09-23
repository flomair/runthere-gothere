import { randomBytes } from 'node:crypto';
import { handle } from '../../server/http.js';
import { STATE_COOKIE, cookie, originOf } from '../../server/session.js';
import { authorizeUrl } from '../../server/strava.js';

export const GET = handle(async (req) => {
  const state = randomBytes(16).toString('hex');
  const headers = new Headers({ Location: authorizeUrl(`${originOf(req)}/api/auth/callback`, state) });
  headers.append('Set-Cookie', cookie(req, STATE_COOKIE, state, 600));
  return new Response(null, { status: 302, headers });
});
