import { authed } from '../../server/access.js';
import { json } from '../../server/http.js';
import { notify } from '../../server/push.js';
import { repo } from '../../server/repo.js';

/** POST /api/push/test – send a test notification to all of your devices. */
export const POST = authed(async (_req, user) => {
  const de = (await repo.getUser(user.uid))?.pushLang === 'de';
  const sent = await notify(user.uid, {
    title: de ? '🏃 Benachrichtigungen sind an' : '🏃 Notifications are on',
    body: de ? 'Du hörst von uns, wenn du einen Meilenstein erreichst oder Freunde reagieren.' : "You'll hear from us when you reach a milestone or friends cheer you on.",
    url: '/',
    tag: 'test',
  });
  return json({ sent });
});
