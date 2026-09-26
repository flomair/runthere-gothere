import type { Activity, Bookmark, CoachPlan, FeedItem, Group, Journey, Milestone, Quest, Reward, Stage } from '../shared/types.js';
import { type AllowEntry, type Repo, type Secrets, type UserDoc, fromStored, fromStoredGroup, toStored, toStoredGroup } from './repo.js';
import { migrateJourney } from '../shared/legs.js';

const merge = <T extends object>(base: T, patch: object): T => {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else if (v !== undefined) out[k] = v;
  }
  return out as T;
};

/** In-memory Repo for tests (and anything that needs a throwaway store). */
export function memoryRepo(): Repo & { dump: () => unknown } {
  const allow = new Map<string, AllowEntry>();
  const users = new Map<string, UserDoc>();
  const secrets = new Map<string, Secrets>();
  const athletes = new Map<number, string>();
  const journeys = new Map<string, Map<string, ReturnType<typeof toStored>>>();
  const activities = new Map<string, Map<number, Activity>>();
  const narrations = new Map<string, Map<string, { text: string; at: string }>>();
  const milestones = new Map<string, Map<string, Milestone>>();
  const groups = new Map<string, ReturnType<typeof toStoredGroup>>();
  const feeds = new Map<string, Map<string, FeedItem>>();
  const shares = new Map<string, { uid: string; journeyId: string; createdAt: string }>();
  const bookmarks = new Map<string, Map<string, Bookmark>>();
  const rewards = new Map<string, Map<string, Reward>>();
  const coach = new Map<string, Map<string, CoachPlan>>();
  const quests = new Map<string, Quest>();
  const stages = new Map<string, Map<string, Stage>>();
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  const sub = <K, V>(m: Map<string, Map<K, V>>, uid: string) => {
    if (!m.has(uid)) m.set(uid, new Map());
    return m.get(uid)!;
  };
  return {
    dump: () => ({ allow, users, secrets, athletes, journeys, activities, narrations, milestones }),
    isAllowed: async (e) => allow.has(e),
    listAllowed: async () => [...allow.values()].sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    allow: async (e) => void allow.set(e.email, e),
    disallow: async (e) => void allow.delete(e),
    getUser: async (uid) => users.get(uid) ?? null,
    updateUser: async (uid, p) => void users.set(uid, merge(users.get(uid) ?? {}, p)),
    getSecrets: async (uid) => secrets.get(uid) ?? {},
    updateSecrets: async (uid, p) => void secrets.set(uid, merge(secrets.get(uid) ?? {}, p)),
    uidForAthlete: async (id) => athletes.get(id) ?? null,
    linkAthlete: async (id, uid) => void athletes.set(id, uid),
    unlinkAthlete: async (id) => void athletes.delete(id),
    listStravaUsers: async () => [...athletes.values()],
    listJourneys: async (uid) =>
      [...sub(journeys, uid).values()].map((s) => migrateJourney(fromStored(s))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    putJourney: async (uid, j: Journey) => void sub(journeys, uid).set(j.id, toStored(j)),
    deleteJourney: async (uid, id) => void sub(journeys, uid).delete(id),
    listActivities: async (uid, since) =>
      [...sub(activities, uid).values()]
        .filter((a) => !since || a.startDate >= since)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    putActivities: async (uid, acts) => acts.forEach((a) => sub(activities, uid).set(a.id, a)),
    deleteActivity: async (uid, id) => void sub(activities, uid).delete(id),
    getNarration: async (uid, key) => sub(narrations, uid).get(key) ?? null,
    putNarration: async (uid, key, text) => void sub(narrations, uid).set(key, { text, at: new Date().toISOString() }),
    listNarrations: async (uid, journeyId) =>
      [...sub(narrations, uid).entries()]
        .filter(([k]) => k.startsWith(`${journeyId}|`))
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => a.at.localeCompare(b.at)),
    listMilestones: async (uid, journeyId) =>
      [...sub(milestones, uid).values()].filter((m) => !journeyId || m.journeyId === journeyId).sort((a, b) => a.atM - b.atM),
    getMilestone: async (uid, id) => sub(milestones, uid).get(id) ?? null,
    putMilestone: async (uid, m) => void sub(milestones, uid).set(m.id, structuredClone(m)),
    getGroup: async (id) => (groups.has(id) ? fromStoredGroup(structuredClone(groups.get(id)!)) : null),
    putGroup: async (g: Group) => void groups.set(g.id, structuredClone(toStoredGroup(g))),
    deleteGroup: async (id) => {
      groups.delete(id);
      feeds.delete(id);
    },
    listGroupsFor: async (uid, email) =>
      [...groups.values()]
        .filter((g) => g.memberUids.includes(uid) || g.invitedEmails.includes(email))
        .map((g) => fromStoredGroup(structuredClone(g)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    listFeed: async (groupId, limit = 50) =>
      [...sub(feeds, groupId).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((x) => structuredClone(x)),
    getFeedItem: async (groupId, id) => (sub(feeds, groupId).has(id) ? structuredClone(sub(feeds, groupId).get(id)!) : null),
    putFeedItem: async (groupId, item) => void sub(feeds, groupId).set(item.id, structuredClone(item)),
    getShare: async (t) => shares.get(t) ?? null,
    putShare: async (t, sh) => void shares.set(t, sh),
    deleteShare: async (t) => void shares.delete(t),
    listBookmarks: async (uid, journeyId) =>
      [...sub(bookmarks, uid).values()].filter((b) => !journeyId || b.journeyId === journeyId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    putBookmark: async (uid, b) => void sub(bookmarks, uid).set(b.id, { ...b }),
    deleteBookmark: async (uid, id) => void sub(bookmarks, uid).delete(id),
    listRewards: async (uid, journeyId) => [...sub(rewards, uid).values()].filter((r) => !journeyId || r.journeyId === journeyId).map((r) => ({ ...r })).sort((a, b) => a.atM - b.atM),
    getReward: async (uid, id) => (sub(rewards, uid).get(id) ? { ...sub(rewards, uid).get(id)! } : null),
    putReward: async (uid, r) => void sub(rewards, uid).set(r.id, { ...r }),
    deleteReward: async (uid, id) => void sub(rewards, uid).delete(id),
    listStages: async (groupId) => [...sub(stages, groupId).values()].map(clone).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt)),
    getStage: async (groupId, id) => (sub(stages, groupId).has(id) ? clone(sub(stages, groupId).get(id)!) : null),
    putStage: async (s) => void sub(stages, s.groupId).set(s.id, clone(s)),
    getQuest: async (id) => (quests.has(id) ? clone(quests.get(id)!) : null),
    putQuest: async (q) => void quests.set(q.id, clone(q)),
    listQuestsFor: async (uid, email) =>
      [...quests.values()].filter((q) => q.from.uid === uid || q.to.uid === uid || q.to.email === email).map(clone).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    uidForEmail: async (email) => [...users.entries()].find(([, u]) => u.email === email)?.[0] ?? null,
    getCoachPlan: async (uid, journeyId) => sub(coach, uid).get(journeyId) ?? null,
    putCoachPlan: async (uid, journeyId, plan) => void sub(coach, uid).set(journeyId, plan),
    incrementStat: async (uid, key) => {
      const u = users.get(uid) ?? {};
      users.set(uid, { ...u, stats: { ...(u.stats ?? {}), [key]: (u.stats?.[key] ?? 0) + 1 } });
    },
    addPushToken: async (uid, token) => {
      const u = users.get(uid) ?? {};
      users.set(uid, { ...u, pushTokens: [...new Set([...(u.pushTokens ?? []), token])] });
    },
    removePushTokens: async (uid, tokens) => {
      const u = users.get(uid) ?? {};
      users.set(uid, { ...u, pushTokens: (u.pushTokens ?? []).filter((t) => !tokens.includes(t)) });
    },
    listUsers: async () => [...users.entries()].map(([uid, u]) => ({ uid, ...u })),
    hasAiKey: async (uid) => Boolean(secrets.get(uid)?.ai),
    listShares: async (uid, journeyId) => [...shares.entries()].filter(([, v]) => v.uid === uid && v.journeyId === journeyId).map(([k]) => k),
  };
}
