import { json } from '../server/http.js';
import * as activities from '../routes/activities.js';
import * as adminAllowlist from '../routes/admin/allowlist.js';
import * as adminStravaWebhook from '../routes/admin/strava-webhook.js';
import * as aiKey from '../routes/ai-key.js';
import * as cronSync from '../routes/cron/sync.js';
import * as geocode from '../routes/geocode.js';
import * as journeys from '../routes/journeys.js';
import * as me from '../routes/me.js';
import * as narrate from '../routes/narrate.js';
import * as narrations from '../routes/narrations.js';
import * as photos from '../routes/photos.js';
import * as route from '../routes/route.js';
import * as stravaCallback from '../routes/strava/callback.js';
import * as stravaConnect from '../routes/strava/connect.js';
import * as stravaDisconnect from '../routes/strava/disconnect.js';
import * as stravaSync from '../routes/strava/sync.js';
import * as stravaWebhook from '../routes/strava/webhook.js';
import * as surroundings from '../routes/surroundings.js';
import * as trailsRoute from '../routes/trails/route.js';
import * as trailsSearch from '../routes/trails/search.js';

/**
 * The single Vercel Function behind every /api/* URL (Vercel's Hobby plan allows at most 12
 * functions per deployment). vercel.json rewrites /api/<path> → /api/router?__path=<path>;
 * handlers live in /routes and keep their original URLs.
 */
type Handler = (req: Request) => Promise<Response>;
type RouteModule = Partial<Record<'GET' | 'POST' | 'PUT' | 'DELETE', Handler>>;

export const ROUTES: Record<string, RouteModule> = {
  activities,
  'admin/allowlist': adminAllowlist,
  'admin/strava-webhook': adminStravaWebhook,
  'ai-key': aiKey,
  'cron/sync': cronSync,
  geocode,
  journeys,
  me,
  narrate,
  narrations,
  photos,
  route,
  'strava/callback': stravaCallback,
  'strava/connect': stravaConnect,
  'strava/disconnect': stravaDisconnect,
  'strava/sync': stravaSync,
  'strava/webhook': stravaWebhook,
  surroundings,
  'trails/route': trailsRoute,
  'trails/search': trailsSearch,
};

/** "/api/strava/sync" or "?__path=strava/sync" → "strava/sync" */
export function routePath(url: URL): string {
  const fromRewrite = url.searchParams.get('__path');
  const raw = fromRewrite ?? url.pathname.replace(/^\/api\//, '');
  return raw.replace(/^\/+|\/+$/g, '');
}

async function dispatch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mod = ROUTES[routePath(url)];
  if (!mod) return json({ error: 'Not found' }, { status: 404 });
  const handler = mod[req.method as keyof RouteModule];
  if (!handler) return json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: Object.keys(mod).join(', ') } });
  // hide the internal routing parameter from the handlers
  if (url.searchParams.has('__path')) {
    url.searchParams.delete('__path');
    url.pathname = `/api/${routePath(new URL(req.url))}`;
    req = new Request(url, req);
  }
  return handler(req);
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
