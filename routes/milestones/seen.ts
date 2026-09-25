import { authed } from '../../server/access.js';
import { json, readJson } from '../../server/http.js';
import { repo } from '../../server/repo.js';

/** POST /api/milestones/seen { journeyId } – mark a journey's postcards as read. */
export const POST = authed(async (req, user) => {
  const { journeyId } = await readJson<{ journeyId?: string }>(req);
  const list = await repo.listMilestones(user.uid, journeyId);
  for (const m of list.filter((x) => !x.seen)) await repo.putMilestone(user.uid, { ...m, seen: true });
  return json({ ok: true });
});
