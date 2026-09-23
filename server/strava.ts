import { HttpError, fetchJson } from './http.js';
import type { StravaSession } from './session.js';
import type { Activity } from '../shared/types.js';
export type { Activity };

const STRAVA = 'https://www.strava.com';

export function stravaConfig() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new HttpError(500, 'STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET are not configured');
  return { clientId, clientSecret };
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const { clientId } = stravaConfig();
  const u = new URL(`${STRAVA}/oauth/authorize`);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('approval_prompt', 'auto');
  u.searchParams.set('scope', 'read,activity:read_all');
  u.searchParams.set('state', state);
  return u.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: StravaSession['athlete'];
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = stravaConfig();
  return fetchJson<TokenResponse>(`${STRAVA}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
  });
}

export async function exchangeCode(code: string): Promise<StravaSession> {
  const t = await tokenRequest({ code, grant_type: 'authorization_code' });
  if (!t.athlete) throw new HttpError(502, 'Strava did not return athlete info');
  const { id, firstname, lastname, profile } = t.athlete;
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: t.expires_at,
    athlete: { id, firstname, lastname, profile },
  };
}

/** Returns a session with a valid access token and whether it changed (so the cookie must be re-set). */
export async function ensureFresh(s: StravaSession): Promise<{ session: StravaSession; refreshed: boolean }> {
  if (s.expiresAt - 120 > Date.now() / 1000) return { session: s, refreshed: false };
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refreshToken });
  return {
    session: { ...s, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at },
    refreshed: true,
  };
}

interface RawActivity {
  id: number;
  name: string;
  sport_type?: string;
  type: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  start_date: string;
  start_date_local: string;
}

/** All activities since `afterEpoch` (seconds), oldest first. */
export async function listActivities(s: StravaSession, afterEpoch: number): Promise<Activity[]> {
  const out: Activity[] = [];
  for (let page = 1; page <= 20; page++) {
    const u = new URL(`${STRAVA}/api/v3/athlete/activities`);
    u.searchParams.set('after', String(Math.floor(afterEpoch)));
    u.searchParams.set('per_page', '200');
    u.searchParams.set('page', String(page));
    const batch = await fetchJson<RawActivity[]>(u.toString(), {
      headers: { Authorization: `Bearer ${s.accessToken}` },
    });
    for (const a of batch) {
      out.push({
        id: a.id,
        name: a.name,
        sportType: a.sport_type ?? a.type,
        distanceM: a.distance,
        movingTimeS: a.moving_time,
        elevationGainM: a.total_elevation_gain,
        startDate: a.start_date,
        startDateLocal: a.start_date_local,
      });
    }
    if (batch.length < 200) break;
  }
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate));
}
