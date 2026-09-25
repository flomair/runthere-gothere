import { authed } from '../../server/access.js';
import { standings } from '../../server/groups.js';
import { HttpError, json } from '../../server/http.js';

export const GET = authed(async (req, user) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new HttpError(400, 'missing id');
  return json(await standings(user, id), { headers: { 'Cache-Control': 'no-store' } });
});
