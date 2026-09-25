import { authed } from '../../server/access.js';
import { aiKeyFor } from '../../server/aikey.js';
import { HttpError, json, readJson } from '../../server/http.js';
import { writePostcard } from '../../server/milestones.js';
import { explainError } from '../../server/narrate.js';
import { repo } from '../../server/repo.js';

/** POST /api/milestones/postcard { id, lang? } – (re)write the postcard for one milestone. */
export const POST = authed(async (req, user) => {
  const { id, lang } = await readJson<{ id?: string; lang?: string }>(req);
  if (!id) throw new HttpError(400, 'missing id');
  const m = await repo.getMilestone(user.uid, id);
  if (!m) throw new HttpError(404, 'milestone not found');
  const j = (await repo.listJourneys(user.uid)).find((x) => x.id === m.journeyId);
  if (!j) throw new HttpError(404, 'journey not found');
  const key = await aiKeyFor(user.uid);
  if (!key) throw new HttpError(400, 'Add your own Anthropic API key in the narrator settings first.');
  try {
    m.postcard = { text: await writePostcard(m, j, key, /^[a-z]{2,3}$/.test(lang ?? '') ? lang : 'en'), at: new Date().toISOString() };
  } catch (e) {
    throw new HttpError(400, explainError(e, key));
  }
  await repo.putMilestone(user.uid, m);
  return json({ milestone: m });
});
