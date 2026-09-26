import { authed } from '../../server/access.js';
import { json } from '../../server/http.js';
import { friendsOf } from '../../server/quests.js';

/** GET /api/quests/friends – people you can challenge (shared journeys, earlier quests). */
export const GET = authed(async (_req, user) => json({ friends: await friendsOf(user) }));
