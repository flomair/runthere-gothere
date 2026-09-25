import { randomBytes } from 'node:crypto';
import { cumulativeDistances, positionAt, simplifyToMax } from '../shared/geo.js';
import { computeProgress } from '../shared/progress.js';
import type { FeedItem, Group, GroupMode, GroupStandings, Journey, PublicJourney, Standing } from '../shared/types.js';
import type { User } from './access.js';
import { normalizeEmail } from './access.js';
import { HttpError } from './http.js';
import { milestoneCandidates } from './milestones.js';
import { reverseGeocode } from './places.js';
import { repo } from './repo.js';
import { notifyFeed } from './push.js';

const newId = () => randomBytes(9).toString('base64url');
const firstName = (name?: string, email?: string) => (name?.split(' ')[0] || email?.split('@')[0] || 'Runner').slice(0, 40);

/** Journey-shaped view of a group, so progress and milestone logic can be reused. */
function asJourney(g: Group, manual: Journey['manualEntries'] = []): Journey {
  return {
    id: g.id,
    name: g.name,
    createdAt: g.createdAt,
    startDate: g.startDate,
    sportTypes: g.sportTypes,
    useStrava: true,
    manualEntries: manual,
    excludedActivityIds: [],
    waypoints: g.waypoints,
    mode: 'foot',
    route: g.route,
    countElevation: g.countElevation,
  };
}

export async function requireMember(groupId: string, user: User): Promise<Group> {
  const g = await repo.getGroup(groupId);
  if (!g || !g.memberUids.includes(user.uid)) throw new HttpError(404, 'Group not found');
  return g;
}

export async function createGroup(user: User, journeyId: string, name: string, mode: GroupMode, emails: string[]): Promise<Group> {
  const j = (await repo.listJourneys(user.uid)).find((x) => x.id === journeyId);
  if (!j) throw new HttpError(404, 'journey not found');
  const invited = [...new Set(emails.map(normalizeEmail).filter((e) => e && e !== user.email))].slice(0, 30);
  const g: Group = {
    id: newId(),
    name: name.trim().slice(0, 120) || j.name,
    mode,
    ownerUid: user.uid,
    memberUids: [user.uid],
    members: { [user.uid]: { uid: user.uid, name: user.name ?? firstName(undefined, user.email), email: user.email, picture: user.picture, joinedAt: new Date().toISOString() } },
    invitedEmails: invited,
    route: j.route,
    waypoints: j.waypoints,
    startDate: j.startDate,
    sportTypes: j.sportTypes,
    countElevation: j.countElevation,
    createdAt: new Date().toISOString(),
  };
  await repo.putGroup(g);
  await addFeed(g.id, { type: 'join', uid: user.uid, name: g.members[user.uid].name, picture: user.picture, text: `started the ${mode === 'race' ? 'race' : 'relay'}` });
  return g;
}

export async function invite(user: User, groupId: string, emails: string[]): Promise<Group> {
  const g = await requireMember(groupId, user);
  const known = new Set([...g.invitedEmails, ...Object.values(g.members).map((m) => m.email)]);
  for (const e of emails.map(normalizeEmail)) if (e && !known.has(e)) g.invitedEmails.push(e);
  await repo.putGroup(g);
  return g;
}

export async function join(user: User, groupId: string): Promise<Group> {
  const g = await repo.getGroup(groupId);
  if (!g || (!g.invitedEmails.includes(user.email) && !g.memberUids.includes(user.uid))) throw new HttpError(404, 'Invitation not found');
  if (!g.memberUids.includes(user.uid)) {
    g.memberUids.push(user.uid);
    g.members[user.uid] = { uid: user.uid, name: user.name ?? firstName(undefined, user.email), email: user.email, picture: user.picture, joinedAt: new Date().toISOString() };
    g.invitedEmails = g.invitedEmails.filter((e) => e !== user.email);
    await repo.putGroup(g);
    await addFeed(g.id, { type: 'join', uid: user.uid, name: g.members[user.uid].name, picture: user.picture, text: 'joined' });
  }
  return g;
}

/** Leave (or decline an invitation). The last member leaving deletes the group. */
export async function leave(user: User, groupId: string): Promise<void> {
  const g = await repo.getGroup(groupId);
  if (!g) return;
  g.invitedEmails = g.invitedEmails.filter((e) => e !== user.email);
  if (g.memberUids.includes(user.uid)) {
    g.memberUids = g.memberUids.filter((u) => u !== user.uid);
    delete g.members[user.uid];
    if (g.ownerUid === user.uid && g.memberUids.length) g.ownerUid = g.memberUids[0];
  }
  if (!g.memberUids.length) await repo.deleteGroup(g.id);
  else await repo.putGroup(g);
}

async function addFeed(groupId: string, item: Omit<FeedItem, 'id' | 'createdAt' | 'kudos' | 'comments'> & { id?: string; createdAt?: string }) {
  await repo.putFeedItem(groupId, { kudos: [], comments: [], createdAt: new Date().toISOString(), id: newId(), ...item });
}

/** Everyone's progress on the group route; also posts newly reached milestones to the feed. */
export async function standings(user: User, groupId: string): Promise<GroupStandings> {
  const g = await requireMember(groupId, user);
  const pts = g.route.points;
  const cum = cumulativeDistances(pts);
  const scale = cum[cum.length - 1] > 0 ? cum[cum.length - 1] / g.route.totalM : 1;
  const at = (m: number) => positionAt(pts, cum, Math.min(m, g.route.totalM) * scale).point;
  const since = new Date(Date.parse(`${g.startDate}T00:00:00Z`) - 86_400_000).toISOString();
  const journey = asJourney(g);

  const rows: (Standing & { entries: ReturnType<typeof computeProgress>['entries'] })[] = [];
  for (const uid of g.memberUids) {
    const acts = await repo.listActivities(uid, since);
    const p = computeProgress(journey, acts);
    const m = g.members[uid];
    const last = [...p.entries].reverse().find((e) => !e.excluded);
    rows.push({
      uid,
      name: m?.name ?? 'Runner',
      picture: m?.picture,
      distanceM: p.loggedM,
      doneM: p.doneM,
      lastActivity: last?.date,
      weeklyAvgM: p.weeklyAvgM,
      point: at(p.doneM),
      finishedOn: p.finishedOn,
      entries: p.entries,
    });
  }

  let team: GroupStandings['team'];
  if (g.mode === 'relay') {
    // merge everyone's entries in date order to find the team position and finish day
    const merged = rows.flatMap((r) => r.entries.filter((e) => !e.excluded).map((e) => ({ date: e.date, m: e.countedM, uid: r.uid }))).sort((a, b) => a.date.localeCompare(b.date));
    let sum = 0;
    let finishedOn: string | undefined;
    for (const e of merged) {
      sum += e.m;
      if (!finishedOn && sum >= g.route.totalM) finishedOn = e.date;
    }
    const doneM = Math.min(sum, g.route.totalM);
    team = { doneM, point: at(doneM), finishedOn };
    await postMilestones(g, 'team', 'The team', undefined, 0, doneM, merged);
  } else {
    for (const r of rows) await postMilestones(g, r.uid, r.name, r.picture, 0, r.doneM, r.entries.filter((e) => !e.excluded).map((e) => ({ date: e.date, m: e.countedM, uid: r.uid })));
  }

  const standings = rows.map(({ entries: _e, ...s }) => s).sort((a, b) => (g.mode === 'race' ? b.doneM - a.doneM : b.distanceM - a.distanceM));
  return { group: g, standings, team };
}

/** Feed items for milestones reached (idempotent via deterministic ids). */
async function postMilestones(g: Group, who: string, name: string, picture: string | undefined, _from: number, doneM: number, entries: { date: string; m: number; uid: string }[]) {
  const reached = milestoneCandidates(asJourney(g)).filter((c) => c.atM <= doneM + 1 && c.kind !== 'distance');
  for (const c of reached) {
    const id = `m_${who}_${c.kind}_${c.key}`;
    if (await repo.getFeedItem(g.id, id)) continue;
    let sum = 0;
    const hit = entries.find((e) => (sum += e.m) >= c.atM - 1);
    await addFeed(g.id, {
      id,
      type: 'milestone',
      uid: hit?.uid ?? who,
      name,
      picture,
      text: c.title,
      milestone: { kind: c.kind, title: c.title, atM: c.atM, countryCode: c.countryCode },
      createdAt: hit ? new Date(hit.date.length === 10 ? `${hit.date}T12:00:00Z` : hit.date).toISOString() : new Date().toISOString(),
    });
  }
}

export async function toggleKudos(user: User, groupId: string, itemId: string): Promise<FeedItem> {
  const g = await requireMember(groupId, user);
  const item = await repo.getFeedItem(groupId, itemId);
  if (!item) throw new HttpError(404, 'post not found');
  const adding = !item.kudos.includes(user.uid);
  item.kudos = adding ? [...item.kudos, user.uid] : item.kudos.filter((u) => u !== user.uid);
  await repo.putFeedItem(groupId, item);
  if (adding && item.uid !== user.uid) {
    await notifyFeed(item.uid, 'kudos', g.members[user.uid]?.name ?? firstName(user.name, user.email), groupId, item.text);
  }
  return item;
}

export async function comment(user: User, groupId: string, itemId: string | undefined, text: string): Promise<void> {
  const g = await requireMember(groupId, user);
  const clean = text.trim().slice(0, 500);
  if (!clean) throw new HttpError(400, 'empty comment');
  const name = g.members[user.uid]?.name ?? firstName(user.name, user.email);
  if (!itemId) {
    await addFeed(groupId, { type: 'post', uid: user.uid, name, picture: user.picture, text: clean });
    return;
  }
  const item = await repo.getFeedItem(groupId, itemId);
  if (!item) throw new HttpError(404, 'post not found');
  item.comments = [...item.comments, { uid: user.uid, name, text: clean, at: new Date().toISOString() }].slice(-100);
  await repo.putFeedItem(groupId, item);
  if (item.uid !== user.uid) await notifyFeed(item.uid, 'comment', name, groupId, clean);
}

// ---------- public share links ----------

export async function createShare(user: User, journeyId: string): Promise<string> {
  const j = (await repo.listJourneys(user.uid)).find((x) => x.id === journeyId);
  if (!j) throw new HttpError(404, 'journey not found');
  const existing = await repo.listShares(user.uid, journeyId);
  if (existing[0]) return existing[0];
  const token = randomBytes(16).toString('base64url');
  await repo.putShare(token, { uid: user.uid, journeyId, createdAt: new Date().toISOString() });
  return token;
}

export async function revokeShares(user: User, journeyId: string): Promise<void> {
  for (const t of await repo.listShares(user.uid, journeyId)) await repo.deleteShare(t);
}

export async function publicJourney(token: string): Promise<PublicJourney> {
  const share = await repo.getShare(token);
  if (!share) throw new HttpError(404, 'This link is no longer active.');
  const j = (await repo.listJourneys(share.uid)).find((x) => x.id === share.journeyId);
  if (!j) throw new HttpError(404, 'This journey no longer exists.');
  const acts = j.useStrava ? await repo.listActivities(share.uid, new Date(Date.parse(`${j.startDate}T00:00:00Z`) - 86_400_000).toISOString()) : [];
  const p = computeProgress(j, acts);
  const cum = cumulativeDistances(j.route.points);
  const scale = cum[cum.length - 1] > 0 ? cum[cum.length - 1] / j.route.totalM : 1;
  const position = positionAt(j.route.points, cum, p.doneM * scale).point;
  const place = await reverseGeocode(position[0], position[1]).catch(() => null);
  const owner = await repo.getUser(share.uid);
  return {
    name: j.name,
    ownerFirstName: firstName(owner?.name, owner?.email),
    from: j.waypoints[0]?.name ?? 'Start',
    to: j.waypoints[j.waypoints.length - 1]?.name ?? 'Finish',
    totalM: j.route.totalM,
    doneM: p.doneM,
    points: simplifyToMax(j.route.points, 600),
    position,
    place: place ? `${place.name}, ${place.context}` : undefined,
    updatedAt: new Date().toISOString(),
  };
}
