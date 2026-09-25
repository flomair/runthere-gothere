import { authed } from '../server/access.js';
import { aiKeyFor } from '../server/aikey.js';
import { coachPlan } from '../server/coach.js';
import { HttpError, json, readJson } from '../server/http.js';
import { explainError } from '../server/narrate.js';
import { repo } from '../server/repo.js';

/** GET ?journeyId – the last plan. */
export const GET = authed(async (req, user) => {
  const journeyId = new URL(req.url).searchParams.get('journeyId');
  if (!journeyId) throw new HttpError(400, 'missing journeyId');
  return json({ plan: await repo.getCoachPlan(user.uid, journeyId) }, { headers: { 'Cache-Control': 'no-store' } });
});

/** POST { journeyId, lat?, lon?, lang? } – write a new weekly plan with the user's own key. */
export const POST = authed(async (req, user) => {
  const b = await readJson<{ journeyId?: string; lat?: number; lon?: number; lang?: string }>(req);
  const j = (await repo.listJourneys(user.uid)).find((x) => x.id === b.journeyId);
  if (!j) throw new HttpError(404, 'journey not found');
  const key = await aiKeyFor(user.uid);
  if (!key) throw new HttpError(400, 'Add your own Anthropic API key in the narrator settings first.');
  const coords = Number.isFinite(b.lat) && Number.isFinite(b.lon) && Math.abs(b.lat!) <= 90 && Math.abs(b.lon!) <= 180 ? { lat: b.lat, lon: b.lon } : {};
  try {
    return json({ plan: await coachPlan(user.uid, j, key, { ...coords, lang: /^[a-z]{2,3}$/.test(b.lang ?? '') ? b.lang : 'en' }) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, explainError(e, key));
  }
});
