import { json } from '../server/http.js';
/**
 * The single Vercel Function behind every /api/* URL (Vercel's Hobby plan allows at most 12
 * functions per deployment). vercel.json rewrites /api/<path> → /api/router?__path=<path>;
 * handlers live in /routes and keep their original URLs.
 */
type Handler = (req: Request) => Promise<Response>;
type RouteModule = Partial<Record<'GET' | 'POST' | 'PUT' | 'DELETE', Handler>>;

/** Handlers are imported on first use, so a failing dependency breaks one route, not all. */
export const ROUTES: Record<string, () => Promise<RouteModule>> = {
  activities: () => import('../routes/activities.js'),
  'admin/allowlist': () => import('../routes/admin/allowlist.js'),
  'admin/strava-webhook': () => import('../routes/admin/strava-webhook.js'),
  'ai-key': () => import('../routes/ai-key.js'),
  'cron/sync': () => import('../routes/cron/sync.js'),
  elevation: () => import('../routes/elevation.js'),
  geocode: () => import('../routes/geocode.js'),
  health: () => import('../routes/health.js'),
  journeys: () => import('../routes/journeys.js'),
  me: () => import('../routes/me.js'),
  milestones: () => import('../routes/milestones.js'),
  'milestones/check': () => import('../routes/milestones/check.js'),
  'milestones/postcard': () => import('../routes/milestones/postcard.js'),
  'milestones/seen': () => import('../routes/milestones/seen.js'),
  narrate: () => import('../routes/narrate.js'),
  narrations: () => import('../routes/narrations.js'),
  photos: () => import('../routes/photos.js'),
  route: () => import('../routes/route.js'),
  'strava/callback': () => import('../routes/strava/callback.js'),
  'strava/connect': () => import('../routes/strava/connect.js'),
  'strava/disconnect': () => import('../routes/strava/disconnect.js'),
  'strava/sync': () => import('../routes/strava/sync.js'),
  'strava/webhook': () => import('../routes/strava/webhook.js'),
  surroundings: () => import('../routes/surroundings.js'),
  'trails/route': () => import('../routes/trails/route.js'),
  'trails/search': () => import('../routes/trails/search.js'),
};

/** "/api/strava/sync" or "?__path=strava/sync" → "strava/sync" */
export function routePath(url: URL): string {
  const fromRewrite = url.searchParams.get('__path');
  const raw = fromRewrite ?? url.pathname.replace(/^\/api\//, '');
  return raw.replace(/^\/+|\/+$/g, '');
}

async function dispatch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = routePath(url);
  const load = ROUTES[path];
  if (!load) return json({ error: 'Not found' }, { status: 404 });
  let mod: RouteModule;
  try {
    mod = await load();
  } catch (e) {
    console.error(`loading route ${path} failed`, e);
    return json({ error: `Server error while loading /api/${path}: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
  const handler = mod[req.method as keyof RouteModule];
  if (!handler) return json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: Object.keys(mod).join(', ') } });
  // hide the internal routing parameter from the handlers
  if (url.searchParams.has('__path')) {
    url.searchParams.delete('__path');
    url.pathname = `/api/${routePath(new URL(req.url))}`;
    req = new Request(url, req);
  }
  try {
    return await handler(req);
  } catch (e) {
    console.error(`route ${path} crashed`, e);
    return json({ error: `Server error in /api/${path}: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
