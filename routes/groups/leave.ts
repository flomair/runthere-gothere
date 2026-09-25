import { authed } from '../../server/access.js';
import { leave } from '../../server/groups.js';
import { json, readJson } from '../../server/http.js';

/** Leave a group or decline an invitation. */
export const POST = authed(async (req, user) => {
  const { id } = await readJson<{ id: string }>(req);
  await leave(user, id);
  return json({ ok: true });
});
