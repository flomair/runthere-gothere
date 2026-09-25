import { authed } from '../../server/access.js';
import { requireMember } from '../../server/groups.js';
import { HttpError, json } from '../../server/http.js';
import { repo } from '../../server/repo.js';

export const GET = authed(async (req, user) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new HttpError(400, 'missing id');
  await requireMember(id, user);
  return json({ feed: await repo.listFeed(id, 60) }, { headers: { 'Cache-Control': 'no-store' } });
});
