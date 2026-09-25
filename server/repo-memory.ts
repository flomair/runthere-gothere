import type { Activity, Journey, Milestone } from '../shared/types.js';
import { type AllowEntry, type Repo, type Secrets, type UserDoc, fromStored, toStored } from './repo.js';

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
      [...sub(journeys, uid).values()].map((s) => fromStored(s)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
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
  };
}
