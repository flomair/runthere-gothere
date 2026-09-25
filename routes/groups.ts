import { authed } from '../server/access.js';
import { createGroup } from '../server/groups.js';
import { HttpError, json, readJson } from '../server/http.js';
import { ensureAllowed } from '../server/invites.js';
import { repo } from '../server/repo.js';

/** GET /api/groups – shared journeys I'm in, plus invitations. */
export const GET = authed(async (_req, user) => {
  const groups = await repo.listGroupsFor(user.uid, user.email);
  return json(
    {
      groups: groups.filter((g) => g.memberUids.includes(user.uid)).map(({ route, ...g }) => ({ ...g, totalM: route.totalM })),
      invitations: groups.filter((g) => !g.memberUids.includes(user.uid)).map((g) => ({ id: g.id, name: g.name, mode: g.mode, from: Object.values(g.members).find((m) => m.uid === g.ownerUid)?.name ?? 'A friend', totalM: g.route.totalM })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

/** POST /api/groups { journeyId, name, mode: 'race' | 'relay', emails } – share a journey with friends. */
export const POST = authed(async (req, user) => {
  const b = await readJson<{ journeyId?: string; name?: string; mode?: string; emails?: string[] }>(req);
  if (!b.journeyId || (b.mode !== 'race' && b.mode !== 'relay')) throw new HttpError(400, 'journeyId and mode are required');
  const emails = Array.isArray(b.emails) ? b.emails.filter((e): e is string => typeof e === 'string') : [];
  const g = await createGroup(user, b.journeyId, b.name ?? '', b.mode, emails);
  const notAllowed = await ensureAllowed(user, g.invitedEmails);
  return json({ id: g.id, notAllowed });
});
