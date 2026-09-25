import { HttpError, handle, json } from '../../server/http.js';
import { repo } from '../../server/repo.js';
import { syncUser } from '../../server/sync.js';

/**
 * GET /api/cron/sync – daily safety net for missed webhooks (see vercel.json "crons").
 * Vercel sends "Authorization: Bearer $CRON_SECRET".
 */
export const GET = handle(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'unauthorized');
  const uids = [...new Set(await repo.listStravaUsers())];
  const results: Record<string, string> = {};
  for (const uid of uids) {
    try {
      const r = await syncUser(uid);
      results[uid] = `${r.fetched} activities`;
    } catch (e) {
      results[uid] = `error: ${e instanceof Error ? e.message : e}`;
    }
  }
  return json({ users: uids.length, results });
});
