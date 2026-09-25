import { authed } from '../server/access.js';
import { HttpError, json, readJson } from '../server/http.js';
import { repo } from '../server/repo.js';

const valid = (t: unknown): t is string => typeof t === 'string' && /^[\w:.-]{20,4096}$/.test(t);

/** POST /api/push { token, lang } – this device wants notifications. */
export const POST = authed(async (req, user) => {
  const { token, lang } = await readJson<{ token?: unknown; lang?: string }>(req);
  if (!valid(token)) throw new HttpError(400, 'invalid token');
  await repo.addPushToken(user.uid, token);
  await repo.updateUser(user.uid, { pushLang: lang === 'de' ? 'de' : 'en' });
  return json({ ok: true });
});

/** DELETE /api/push { token } – stop notifications on this device. */
export const DELETE = authed(async (req, user) => {
  const { token } = await readJson<{ token?: unknown }>(req);
  if (!valid(token)) throw new HttpError(400, 'invalid token');
  await repo.removePushTokens(user.uid, [token]);
  return json({ ok: true });
});
