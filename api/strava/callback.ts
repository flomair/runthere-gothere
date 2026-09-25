import { unseal } from '../../server/crypto.js';
import { handle, originOf } from '../../server/http.js';
import { connectStrava } from '../../server/sync.js';

/** GET /api/strava/callback – Strava redirects here after the user approved access. */
export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const back = (q: string) => new Response(null, { status: 302, headers: { Location: `${originOf(req)}/?${q}` } });
  if (url.searchParams.get('error')) return back(`strava_error=${encodeURIComponent(url.searchParams.get('error')!)}`);

  const state = unseal<{ uid: string; exp: number }>('oauth-state', url.searchParams.get('state') ?? '');
  const code = url.searchParams.get('code');
  if (!state || state.exp < Date.now() || !code) return back('strava_error=invalid_state');
  if (!(url.searchParams.get('scope') ?? '').includes('activity:read')) return back('strava_error=missing_activity_scope');

  try {
    await connectStrava(state.uid, code);
  } catch (e) {
    console.error('strava connect failed', e);
    return back(`strava_error=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 120) : 'connect_failed')}`);
  }
  return back('strava=connected');
});
