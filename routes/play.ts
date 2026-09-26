import { authed } from '../server/access.js';
import { json } from '../server/http.js';
import { repo } from '../server/repo.js';
import type { PlaySummary } from '../shared/types.js';

/**
 * GET /api/play – what's waiting for you across shared journeys: unused mystery draws and the
 * race stages you're in (from stored results; opening the group refreshes them).
 */
export const GET = authed(async (_req, user) => {
  const groups = (await repo.listGroupsFor(user.uid, user.email)).filter((g) => g.memberUids.includes(user.uid));
  const out: PlaySummary = { draws: [], stages: [] };
  for (const g of groups) {
    const [draws, stages] = await Promise.all([repo.listDraws(g.id), repo.listStages(g.id)]);
    const unused = draws.filter((d) => d.uid === user.uid && !d.usedAt).length;
    if (unused) out.draws.push({ groupId: g.id, groupName: g.name, count: unused });
    for (const s of stages) {
      if (!s.participants.includes(user.uid) || (s.status !== 'running' && s.status !== 'scheduled')) continue;
      const rank = (s.results ?? []).findIndex((r) => r.uid === user.uid);
      const leader = s.leaderUid ? g.members[s.leaderUid]?.name?.split(' ')[0] : undefined;
      out.stages.push({
        groupId: g.id,
        groupName: g.name,
        id: s.id,
        name: s.name,
        status: s.status,
        startDate: s.startDate,
        endDate: s.endDate,
        prize: s.prize.text,
        rank: rank >= 0 ? rank + 1 : undefined,
        of: s.participants.length,
        effort: rank >= 0 ? s.results![rank].effort : undefined,
        leaderName: leader,
      });
    }
  }
  return json(out, { headers: { 'Cache-Control': 'no-store' } });
});
