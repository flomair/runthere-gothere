import { HttpError, handle, json } from '../../server/http.js';
import { repo } from '../../server/repo.js';
import { refreshQuestsFor, syncUser } from '../../server/sync.js';

/**
 * GET /api/cron/sync – daily safety net for missed webhooks (see vercel.json "crons").
 * Vercel sends "Authorization: Bearer $CRON_SECRET".
 */
export const GET = handle(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'unauthorized');
  const uids = [...new Set(await repo.listStravaUsers())];
  const results: Record<string, string> = {};
  const started = Date.now();
  const { detectMilestones } = await import('../../server/milestones.js');
  const { notifyMilestones } = await import('../../server/push.js');
  for (const uid of uids) {
    // stay well within the function time limit; the rest is picked up tomorrow or by webhooks
    if (Date.now() - started > 40_000) {
      results[uid] = 'skipped (time budget)';
      continue;
    }
    try {
      const r = await syncUser(uid);
      const m = await detectMilestones(uid, { maxNew: 3, maxPostcards: 0, notifyRewards: true });
      await notifyMilestones(uid, m);
      await refreshQuestsFor(uid);
      results[uid] = `${r.fetched} activities, ${m.length} milestone(s)`;
    } catch (e) {
      results[uid] = `error: ${e instanceof Error ? e.message : e}`;
    }
  }
  return json({ users: uids.length, results });
});
