import { authed } from '../../server/access.js';
import { comment } from '../../server/groups.js';
import { json, readJson } from '../../server/http.js';

/** POST { id, itemId?, text } – comment on a feed item, or post a message when itemId is omitted. */
export const POST = authed(async (req, user) => {
  const { id, itemId, text } = await readJson<{ id: string; itemId?: string; text: string }>(req);
  await comment(user, id, itemId, String(text ?? ''));
  return json({ ok: true });
});
