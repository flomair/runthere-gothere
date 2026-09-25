import { adminOnly } from '../../server/access.js';
import { json, originOf } from '../../server/http.js';
import { createSubscription, deleteSubscription, listSubscriptions } from '../../server/strava.js';
import { verifyToken } from '../strava/webhook.js';

const callbackFor = (req: Request) => `${originOf(req)}/api/strava/webhook`;

/** GET – current Strava push subscription (Strava allows one per API app). */
export const GET = adminOnly(async (req) => {
  const subs = await listSubscriptions();
  return json({ expected: callbackFor(req), subscriptions: subs }, { headers: { 'Cache-Control': 'no-store' } });
});

/** POST – (re)register the webhook for this deployment's URL. */
export const POST = adminOnly(async (req) => {
  const target = callbackFor(req);
  for (const s of await listSubscriptions()) {
    if (s.callback_url === target) return json({ ok: true, id: s.id, note: 'already registered' });
    await deleteSubscription(s.id);
  }
  const r = await createSubscription(target, verifyToken());
  return json({ ok: true, id: r.id });
});
