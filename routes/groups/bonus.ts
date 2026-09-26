import { authed } from '../../server/access.js';
import { HttpError, json, readJson } from '../../server/http.js';
import { setBonus } from '../../server/stages.js';

/** POST { id, text } (owner: set or clear the bonus prize) or { id, action: 'delivered' }. */
export const POST = authed(async (req, user) => {
  const body = await readJson<{ id?: string; text?: string; action?: string }>(req);
  if (!body.id) throw new HttpError(400, 'missing id');
  return json({ group: await setBonus(user, body.id, body) });
});
