import { handle } from '../../server/http.js';
import { STATE_COOKIE, clearCookie, originOf, readCookie, sessionCookie } from '../../server/session.js';
import { exchangeCode } from '../../server/strava.js';

export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const origin = originOf(req);
  const fail = (reason: string) =>
    new Response(null, { status: 302, headers: { Location: `${origin}/?strava_error=${encodeURIComponent(reason)}` } });

  if (url.searchParams.get('error')) return fail(url.searchParams.get('error')!);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || state !== readCookie(req, STATE_COOKIE)) return fail('invalid_state');

  const scope = url.searchParams.get('scope') ?? '';
  if (!scope.includes('activity:read')) return fail('missing_activity_scope');

  const session = await exchangeCode(code);
  const headers = new Headers({ Location: `${origin}/?strava=connected` });
  headers.append('Set-Cookie', sessionCookie(req, session));
  headers.append('Set-Cookie', clearCookie(req, STATE_COOKIE));
  return new Response(null, { status: 302, headers });
});
