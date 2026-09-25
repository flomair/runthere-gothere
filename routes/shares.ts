import { authed } from '../server/access.js';
import { createShare, revokeShares } from '../server/groups.js';
import { HttpError, json, readJson } from '../server/http.js';
import { repo } from '../server/repo.js';

/** GET ?journeyId – is there an active public link? */
export const GET = authed(async (req, user) => {
  const journeyId = new URL(req.url).searchParams.get('journeyId');
  if (!journeyId) throw new HttpError(400, 'missing journeyId');
  return json({ token: (await repo.listShares(user.uid, journeyId))[0] ?? null }, { headers: { 'Cache-Control': 'no-store' } });
});

/** POST { journeyId } – create (or return) the public read-only link. */
export const POST = authed(async (req, user) => {
  const { journeyId } = await readJson<{ journeyId?: string }>(req);
  if (!journeyId) throw new HttpError(400, 'missing journeyId');
  return json({ token: await createShare(user, journeyId) });
});

/** DELETE ?journeyId – revoke the link. */
export const DELETE = authed(async (req, user) => {
  const journeyId = new URL(req.url).searchParams.get('journeyId');
  if (!journeyId) throw new HttpError(400, 'missing journeyId');
  await revokeShares(user, journeyId);
  return json({ ok: true });
});
