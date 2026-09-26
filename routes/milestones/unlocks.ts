import { authed } from '../../server/access.js';
import { aiKeyFor } from '../../server/aikey.js';
import { HttpError, json, readJson } from '../../server/http.js';
import { repo } from '../../server/repo.js';
import { cityUnlocks } from '../../server/unlocks.js';
import { isCityMilestone } from '../../shared/rewards.js';

/**
 * POST { id, lang? } – fill in the city unlocks (stamp, fun fact, song) of a milestone reached
 * before they existed. Idempotent: returns the stored unlocks when they are already there.
 */
export const POST = authed(async (req, user) => {
  const { id, lang } = await readJson<{ id?: string; lang?: string }>(req);
  if (!id) throw new HttpError(400, 'missing id');
  const m = await repo.getMilestone(user.uid, id);
  if (!m) throw new HttpError(404, 'milestone not found');
  if (!isCityMilestone(m)) throw new HttpError(400, 'only cities have unlocks');
  if (!m.unlocks) {
    const key = await aiKeyFor(user.uid).catch(() => null);
    m.unlocks = await cityUnlocks(m, { lang: /^[a-z]{2}$/.test(lang ?? '') ? lang : 'en', key });
    await repo.putMilestone(user.uid, m);
  }
  return json({ milestone: m });
});
