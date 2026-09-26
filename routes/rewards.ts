import { authed } from '../server/access.js';
import { HttpError, json, readJson } from '../server/http.js';
import { repo } from '../server/repo.js';
import { type RewardInput, claimReward, createReward, updateReward } from '../server/rewards.js';

/** GET /api/rewards[?journeyId] – the user's personal rewards. */
export const GET = authed(async (req, user) => {
  const journeyId = new URL(req.url).searchParams.get('journeyId') ?? undefined;
  return json({ rewards: await repo.listRewards(user.uid, journeyId) }, { headers: { 'Cache-Control': 'no-store' } });
});

/** POST { journeyId, title, link?, photo?, atM } – pin a new reward ahead on the route. */
export const POST = authed(async (req, user) => json({ reward: await createReward(user.uid, await readJson<RewardInput>(req)) }));

/** PATCH { id, title?, link?, photo?, atM? } (while locked) or { id, claim: { photo?, note? } } (once unlocked). */
export const PATCH = authed(async (req, user) => {
  const body = await readJson<RewardInput & { id?: string; claim?: { photo?: string; note?: string } }>(req);
  if (!body.id) throw new HttpError(400, 'missing id');
  if (body.claim) return json({ reward: await claimReward(user.uid, body.id, body.claim) });
  return json({ reward: await updateReward(user.uid, body.id, body) });
});

/** DELETE ?id – remove a reward (any time; claimed ones leave the gallery). */
export const DELETE = authed(async (req, user) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new HttpError(400, 'missing id');
  await repo.deleteReward(user.uid, id);
  return json({ ok: true });
});
