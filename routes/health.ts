import { handle, json } from '../server/http.js';

/**
 * GET /api/health – public configuration check. Reports which settings are present (never their
 * values) and whether Firebase Admin and Firestore can be reached.
 */
export const GET = handle(async () => {
  const has = (k: string) => Boolean(process.env[k]?.trim());
  const env = Object.fromEntries(
    ['FIREBASE_SERVICE_ACCOUNT', 'ADMIN_EMAILS', 'SESSION_SECRET', 'CRON_SECRET', 'STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'MAPILLARY_TOKEN', 'GOOGLE_PLACES_API_KEY'].map((k) => [k, has(k)]),
  );
  let firebase: string;
  try {
    const { db } = await import('../server/firebase.js');
    await db().collection('allowlist').limit(1).get();
    firebase = 'ok';
  } catch (e) {
    firebase = `error: ${e instanceof Error ? e.message : String(e)}`;
  }
  return json({ ok: firebase === 'ok', firebase, env, node: process.version }, { headers: { 'Cache-Control': 'no-store' } });
});
