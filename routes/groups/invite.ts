import { authed } from '../../server/access.js';
import { invite } from '../../server/groups.js';
import { json, readJson } from '../../server/http.js';
import { ensureAllowed } from '../../server/invites.js';

export const POST = authed(async (req, user) => {
  const { id, emails } = await readJson<{ id: string; emails: string[] }>(req);
  const list = Array.isArray(emails) ? emails.filter((e): e is string => typeof e === 'string').slice(0, 30) : [];
  await invite(user, id, list);
  return json({ ok: true, notAllowed: await ensureAllowed(user, list) });
});
