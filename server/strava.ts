import type { Activity, Athlete } from '../shared/types.js';
import { HttpError, fetchJson } from './http.js';

export type { Activity };

const STRAVA = 'https://www.strava.com';

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  /** epoch seconds */
  expiresAt: number;
}

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
  athlete?: Athlete;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = stravaConfig();
  return fetchJson<TokenResponse>(`${STRAVA}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
  });
}

export async function exchangeCode(code: string): Promise<{ tokens: StravaTokens; athlete: Athlete }> {
  const t = await tokenRequest({ code, grant_type: 'authorization_code' });
  if (!t.athlete) throw new HttpError(502, 'Strava did not return athlete info');
  const { id, firstname, lastname, profile } = t.athlete;
  return {
    tokens: { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at },
    athlete: { id, firstname, lastname, profile },
  };
}

/** Returns valid tokens and whether they were refreshed (so the caller can persist them). */
export async function ensureFresh(t: StravaTokens): Promise<{ tokens: StravaTokens; refreshed: boolean }> {
  if (t.expiresAt - 120 > Date.now() / 1000) return { tokens: t, refreshed: false };
  const r = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refreshToken });
  return { tokens: { accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: r.expires_at }, refreshed: true };
}

export async function deauthorize(t: StravaTokens): Promise<void> {
  await fetchJson(`${STRAVA}/oauth/deauthorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: t.accessToken }),
  }).catch(() => undefined);
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
  /** Entered by hand on Strava (no GPS/device recording). */
  manual?: boolean;
}

const mapActivity = (a: RawActivity): Activity => ({
  id: a.id,
  name: a.name,
  sportType: a.sport_type ?? a.type,
  distanceM: a.distance,
  movingTimeS: a.moving_time,
  elevationGainM: a.total_elevation_gain,
  startDate: a.start_date,
  startDateLocal: a.start_date_local,
  ...(a.manual ? { manual: true } : {}),
});

/** All activities since `afterEpoch` (seconds), oldest first. */
export async function listActivities(t: StravaTokens, afterEpoch: number): Promise<Activity[]> {
  const out: Activity[] = [];
  for (let page = 1; page <= 20; page++) {
    const u = new URL(`${STRAVA}/api/v3/athlete/activities`);
    u.searchParams.set('after', String(Math.floor(afterEpoch)));
    u.searchParams.set('per_page', '200');
    u.searchParams.set('page', String(page));
    const batch = await fetchJson<RawActivity[]>(u.toString(), { headers: { Authorization: `Bearer ${t.accessToken}` } });
    out.push(...batch.map(mapActivity));
    if (batch.length < 200) break;
  }
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export async function getActivity(t: StravaTokens, id: number): Promise<Activity> {
  return mapActivity(
    await fetchJson<RawActivity>(`${STRAVA}/api/v3/activities/${id}`, { headers: { Authorization: `Bearer ${t.accessToken}` } }),
  );
}

// ---------- push subscriptions (webhooks) ----------

export interface PushSubscription {
  id: number;
  callback_url: string;
  created_at?: string;
}

export async function listSubscriptions(): Promise<PushSubscription[]> {
  const { clientId, clientSecret } = stravaConfig();
  const u = new URL(`${STRAVA}/api/v3/push_subscriptions`);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('client_secret', clientSecret);
  return fetchJson<PushSubscription[]>(u.toString());
}

export async function createSubscription(callbackUrl: string, verifyToken: string): Promise<{ id: number }> {
  const { clientId, clientSecret } = stravaConfig();
  return fetchJson<{ id: number }>(`${STRAVA}/api/v3/push_subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, callback_url: callbackUrl, verify_token: verifyToken }),
    timeoutMs: 30_000,
  });
}

export async function deleteSubscription(id: number): Promise<void> {
  const { clientId, clientSecret } = stravaConfig();
  const u = new URL(`${STRAVA}/api/v3/push_subscriptions/${id}`);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('client_secret', clientSecret);
  const res = await fetch(u, { method: 'DELETE', signal: AbortSignal.timeout(15_000) });
  if (!res.ok && res.status !== 404) throw new HttpError(502, `Strava: could not delete subscription (${res.status})`);
}
