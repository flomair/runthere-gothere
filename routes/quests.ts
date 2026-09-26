import { authed } from '../server/access.js';
import { HttpError, json, readJson } from '../server/http.js';
import { type QuestInput, createQuest, refreshQuests, respondQuest } from '../server/quests.js';

/** GET /api/quests – quests you sent or received, evaluated against your latest runs. */
export const GET = authed(async (_req, user) => json({ quests: await refreshQuests(user.uid, user.email) }, { headers: { 'Cache-Control': 'no-store' } }));

/** POST { toEmail, type, params, days, gift, penalty?, message? } – challenge a friend. */
export const POST = authed(async (req, user) => json({ quest: await createQuest(user, await readJson<QuestInput>(req)) }));

/** PATCH { id, action: 'accept' | 'decline' | 'cancel' | 'delivered', journeyId? } */
export const PATCH = authed(async (req, user) => {
  const body = await readJson<{ id?: string; action?: string; journeyId?: string }>(req);
  if (!body.id || !body.action) throw new HttpError(400, 'missing id or action');
  return json({ quest: await respondQuest(user, body.id, body.action, body.journeyId) });
});
