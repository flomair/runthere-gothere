import { authed } from '../../server/access.js';
import { toggleKudos } from '../../server/groups.js';
import { json, readJson } from '../../server/http.js';

export const POST = authed(async (req, user) => {
  const { id, itemId } = await readJson<{ id: string; itemId: string }>(req);
  return json({ item: await toggleKudos(user, id, itemId) });
});
