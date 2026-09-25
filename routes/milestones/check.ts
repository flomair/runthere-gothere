import { authed } from '../../server/access.js';
import { json, readJson } from '../../server/http.js';
import { detectMilestones } from '../../server/milestones.js';

/** POST /api/milestones/check { journeyId?, lang? } – detect newly reached milestones now. */
export const POST = authed(async (req, user) => {
  const body = await readJson<{ journeyId?: string; lang?: string }>(req).catch(() => ({}) as { journeyId?: string; lang?: string });
  const lang = /^[a-z]{2,3}$/.test(body.lang ?? '') ? body.lang : 'en';
  const created = await detectMilestones(user.uid, { journeyId: body.journeyId, maxNew: 5, maxPostcards: 2, lang });
  return json({ created });
});
