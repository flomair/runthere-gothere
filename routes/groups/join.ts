import { authed } from '../../server/access.js';
import { join } from '../../server/groups.js';
import { json, readJson } from '../../server/http.js';

export const POST = authed(async (req, user) => {
  const { id } = await readJson<{ id: string }>(req);
  await join(user, id);
  return json({ ok: true });
});
