import { FieldValue } from 'firebase-admin/firestore';
import { decodePolyline, encodePolyline } from '../shared/geo.js';
import type { Activity, Bookmark, CoachPlan, FeedItem, Group, Journey, Milestone, Quest, Reward, Stage } from '../shared/types.js';
import { db } from './firebase.js';
import { migrateJourney } from '../shared/legs.js';

/**
 * All persistence goes through this interface. Only the server touches Firestore (security
 * rules deny all client access); tests swap in the in-memory implementation.
 *
 * Layout:
 *   allowlist/{email}                  who may use the app (besides ADMIN_EMAILS)
 *   users/{uid}                        profile + public connection state (never secrets)
 *   users/{uid}/journeys/{id}          journeys (route stored as an encoded polyline)
 *   users/{uid}/activities/{id}        synced Strava activities
 *   users/{uid}/narrations/{key}       saved narrator stories
 *   secrets/{uid}                      encrypted Strava tokens and Anthropic key
 *   stravaAthletes/{athleteId}         → uid, for webhook routing
 *   quests/{id}                        friend challenges (fromUid / toUid / toEmail for queries)
 */

export interface AllowEntry {
  email: string;
  addedBy: string;
  addedAt: string;
}

export interface UserDoc {
  email?: string;
  name?: string;
  picture?: string;
  lastLoginAt?: string;
  strava?: {
    athleteId: number;
    firstname?: string;
    lastname?: string;
    profile?: string;
    connectedAt: string;
    lastSyncAt?: string;
    /** Earliest date (epoch s) activities have been fetched from. */
    syncedFrom?: number;
  } | null;
  ai?: { masked: string; workspaceId?: string; updatedAt: string } | null;
  stats?: { stories?: number; postcards?: number; coachPlans?: number };
  /** FCM registration tokens of the devices that turned on notifications. */
  pushTokens?: string[];
  /** Language for notifications ('en' | 'de'). */
  pushLang?: string;
}

export interface Secrets {
  /** sealed('strava-tokens', StravaTokens) */
  strava?: string | null;
  /** sealed('ai-key', { key, workspaceId }) */
  ai?: string | null;
}

export interface Repo {
  isAllowed(email: string): Promise<boolean>;
  listAllowed(): Promise<AllowEntry[]>;
  allow(entry: AllowEntry): Promise<void>;
  disallow(email: string): Promise<void>;

  getUser(uid: string): Promise<UserDoc | null>;
  updateUser(uid: string, patch: Partial<UserDoc>): Promise<void>;
  getSecrets(uid: string): Promise<Secrets>;
  updateSecrets(uid: string, patch: Secrets): Promise<void>;

  uidForAthlete(athleteId: number): Promise<string | null>;
  linkAthlete(athleteId: number, uid: string): Promise<void>;
  unlinkAthlete(athleteId: number): Promise<void>;
  listStravaUsers(): Promise<string[]>;

  listJourneys(uid: string): Promise<Journey[]>;
  putJourney(uid: string, j: Journey): Promise<void>;
  deleteJourney(uid: string, id: string): Promise<void>;

  listActivities(uid: string, sinceIso?: string): Promise<Activity[]>;
  putActivities(uid: string, acts: Activity[]): Promise<void>;
  deleteActivity(uid: string, id: number): Promise<void>;

  getNarration(uid: string, key: string): Promise<{ text: string; at: string } | null>;
  putNarration(uid: string, key: string, text: string): Promise<void>;
  /** Saved stories of one journey (keys start with `${journeyId}|`). */
  listNarrations(uid: string, journeyId: string): Promise<{ key: string; text: string; at: string }[]>;

  listMilestones(uid: string, journeyId?: string): Promise<Milestone[]>;
  getMilestone(uid: string, id: string): Promise<Milestone | null>;
  putMilestone(uid: string, m: Milestone): Promise<void>;

  getGroup(id: string): Promise<Group | null>;
  putGroup(g: Group): Promise<void>;
  deleteGroup(id: string): Promise<void>;
  /** Groups the user belongs to or is invited to (by email). */
  listGroupsFor(uid: string, email: string): Promise<Group[]>;
  listFeed(groupId: string, limit?: number): Promise<FeedItem[]>;
  getFeedItem(groupId: string, id: string): Promise<FeedItem | null>;
  putFeedItem(groupId: string, item: FeedItem): Promise<void>;
  listStages(groupId: string): Promise<Stage[]>;
  getStage(groupId: string, id: string): Promise<Stage | null>;
  putStage(s: Stage): Promise<void>;

  getShare(token: string): Promise<{ uid: string; journeyId: string; createdAt: string } | null>;
  putShare(token: string, share: { uid: string; journeyId: string; createdAt: string }): Promise<void>;
  deleteShare(token: string): Promise<void>;
  listShares(uid: string, journeyId: string): Promise<string[]>;

  listBookmarks(uid: string, journeyId?: string): Promise<Bookmark[]>;
  putBookmark(uid: string, b: Bookmark): Promise<void>;
  deleteBookmark(uid: string, id: string): Promise<void>;

  listRewards(uid: string, journeyId?: string): Promise<Reward[]>;
  getReward(uid: string, id: string): Promise<Reward | null>;
  putReward(uid: string, r: Reward): Promise<void>;
  deleteReward(uid: string, id: string): Promise<void>;

  getQuest(id: string): Promise<Quest | null>;
  putQuest(q: Quest): Promise<void>;
  /** Quests the user sent or received (received ones also by email, before the first sign-in). */
  listQuestsFor(uid: string, email: string): Promise<Quest[]>;
  uidForEmail(email: string): Promise<string | null>;

  getCoachPlan(uid: string, journeyId: string): Promise<CoachPlan | null>;
  putCoachPlan(uid: string, journeyId: string, plan: CoachPlan): Promise<void>;

  incrementStat(uid: string, key: 'stories' | 'postcards' | 'coachPlans'): Promise<void>;
  addPushToken(uid: string, token: string): Promise<void>;
  removePushTokens(uid: string, tokens: string[]): Promise<void>;
  listUsers(): Promise<(UserDoc & { uid: string })[]>;
  hasAiKey(uid: string): Promise<boolean>;
}

type StoredQuest = Quest & { fromUid: string; toUid: string | null; toEmail: string };
const stripQuest = ({ fromUid: _f, toUid: _t, toEmail: _e, ...q }: StoredQuest): Quest => q;

/** Firestore doc ids can't contain "/"; keep them short and safe. */
export const docId = (s: string) => s.replace(/\//g, '_').slice(0, 700);

type StoredJourney = Omit<Journey, 'route'> & { route: { polyline: string; totalM: number; provider: string } };

export const toStored = (j: Journey): StoredJourney => ({
  ...j,
  route: { polyline: encodePolyline(j.route.points), totalM: j.route.totalM, provider: j.route.provider },
});

export const fromStored = (s: StoredJourney): Journey => ({
  ...s,
  route: { points: decodePolyline(s.route.polyline), totalM: s.route.totalM, provider: s.route.provider },
});

/** Firestore merge semantics: null means "delete this field". */
function withDeletes<T extends object>(patch: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === null ? FieldValue.delete() : v]));
}

export const firestoreRepo: Repo = {
  async isAllowed(email) {
    return (await db().collection('allowlist').doc(docId(email)).get()).exists;
  },
  async listAllowed() {
    const snap = await db().collection('allowlist').orderBy('addedAt', 'desc').get();
    return snap.docs.map((d) => d.data() as AllowEntry);
  },
  async allow(entry) {
    await db().collection('allowlist').doc(docId(entry.email)).set(entry);
  },
  async disallow(email) {
    await db().collection('allowlist').doc(docId(email)).delete();
  },

  async getUser(uid) {
    const d = await db().collection('users').doc(uid).get();
    return d.exists ? (d.data() as UserDoc) : null;
  },
  async updateUser(uid, patch) {
    await db().collection('users').doc(uid).set(withDeletes(patch), { merge: true });
  },
  async getSecrets(uid) {
    const d = await db().collection('secrets').doc(uid).get();
    return (d.data() as Secrets | undefined) ?? {};
  },
  async updateSecrets(uid, patch) {
    await db().collection('secrets').doc(uid).set(withDeletes(patch), { merge: true });
  },

  async uidForAthlete(athleteId) {
    const d = await db().collection('stravaAthletes').doc(String(athleteId)).get();
    return d.exists ? ((d.data() as { uid: string }).uid ?? null) : null;
  },
  async linkAthlete(athleteId, uid) {
    await db().collection('stravaAthletes').doc(String(athleteId)).set({ uid, linkedAt: new Date().toISOString() });
  },
  async unlinkAthlete(athleteId) {
    await db().collection('stravaAthletes').doc(String(athleteId)).delete();
  },
  async listStravaUsers() {
    const snap = await db().collection('stravaAthletes').get();
    return snap.docs.map((d) => (d.data() as { uid: string }).uid);
  },

  async listJourneys(uid) {
    const snap = await db().collection('users').doc(uid).collection('journeys').orderBy('createdAt', 'desc').get();
    // older journeys are brought up to date on read (see shared/legs.ts)
    return snap.docs.map((d) => migrateJourney(fromStored(d.data() as StoredJourney)));
  },
  async putJourney(uid, j) {
    await db().collection('users').doc(uid).collection('journeys').doc(docId(j.id)).set(toStored(j));
  },
  async deleteJourney(uid, id) {
    await db().collection('users').doc(uid).collection('journeys').doc(docId(id)).delete();
  },

  async listActivities(uid, sinceIso) {
    let q = db().collection('users').doc(uid).collection('activities').orderBy('startDate');
    if (sinceIso) q = q.where('startDate', '>=', sinceIso);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as Activity);
  },
  async putActivities(uid, acts) {
    const col = db().collection('users').doc(uid).collection('activities');
    // batches are limited to 500 writes
    for (let i = 0; i < acts.length; i += 400) {
      const batch = db().batch();
      for (const a of acts.slice(i, i + 400)) batch.set(col.doc(String(a.id)), a);
      await batch.commit();
    }
  },
  async deleteActivity(uid, id) {
    await db().collection('users').doc(uid).collection('activities').doc(String(id)).delete();
  },

  async getNarration(uid, key) {
    const d = await db().collection('users').doc(uid).collection('narrations').doc(docId(key)).get();
    return d.exists ? (d.data() as { text: string; at: string }) : null;
  },
  async putNarration(uid, key, text) {
    await db()
      .collection('users')
      .doc(uid)
      .collection('narrations')
      .doc(docId(key))
      .set({ text, at: new Date().toISOString(), key, journeyId: key.split('|')[0] });
  },
  async listNarrations(uid, journeyId) {
    const snap = await db().collection('users').doc(uid).collection('narrations').where('journeyId', '==', journeyId).get();
    return snap.docs
      .map((d) => d.data() as { key: string; text: string; at: string })
      .sort((a, b) => a.at.localeCompare(b.at));
  },

  async listMilestones(uid, journeyId) {
    let q: FirebaseFirestore.Query = db().collection('users').doc(uid).collection('milestones');
    if (journeyId) q = q.where('journeyId', '==', journeyId);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as Milestone).sort((a, b) => a.atM - b.atM);
  },
  async getMilestone(uid, id) {
    const d = await db().collection('users').doc(uid).collection('milestones').doc(docId(id)).get();
    return d.exists ? (d.data() as Milestone) : null;
  },
  async putMilestone(uid, m) {
    await db().collection('users').doc(uid).collection('milestones').doc(docId(m.id)).set(m);
  },

  async getGroup(id) {
    const d = await db().collection('groups').doc(docId(id)).get();
    return d.exists ? fromStoredGroup(d.data() as StoredGroup) : null;
  },
  async putGroup(g) {
    await db().collection('groups').doc(docId(g.id)).set(toStoredGroup(g));
  },
  async deleteGroup(id) {
    await db().recursiveDelete(db().collection('groups').doc(docId(id)));
  },
  async listGroupsFor(uid, email) {
    const [member, invited] = await Promise.all([
      db().collection('groups').where('memberUids', 'array-contains', uid).get(),
      db().collection('groups').where('invitedEmails', 'array-contains', email).get(),
    ]);
    const byId = new Map<string, Group>();
    for (const d of [...member.docs, ...invited.docs]) byId.set(d.id, fromStoredGroup(d.data() as StoredGroup));
    return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async listFeed(groupId, limit = 50) {
    const snap = await db().collection('groups').doc(docId(groupId)).collection('feed').orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => d.data() as FeedItem);
  },
  async getFeedItem(groupId, id) {
    const d = await db().collection('groups').doc(docId(groupId)).collection('feed').doc(docId(id)).get();
    return d.exists ? (d.data() as FeedItem) : null;
  },
  async putFeedItem(groupId, item) {
    await db().collection('groups').doc(docId(groupId)).collection('feed').doc(docId(item.id)).set(item);
  },

  async listStages(groupId) {
    const snap = await db().collection('groups').doc(docId(groupId)).collection('stages').get();
    return snap.docs.map((d) => d.data() as Stage).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt));
  },
  async getStage(groupId, id) {
    const d = await db().collection('groups').doc(docId(groupId)).collection('stages').doc(docId(id)).get();
    return d.exists ? (d.data() as Stage) : null;
  },
  async putStage(s) {
    await db().collection('groups').doc(docId(s.groupId)).collection('stages').doc(docId(s.id)).set(s);
  },
  async getShare(token) {
    const d = await db().collection('shares').doc(docId(token)).get();
    return d.exists ? (d.data() as { uid: string; journeyId: string; createdAt: string }) : null;
  },
  async putShare(token, share) {
    await db().collection('shares').doc(docId(token)).set(share);
  },
  async deleteShare(token) {
    await db().collection('shares').doc(docId(token)).delete();
  },
  async listBookmarks(uid, journeyId) {
    let q: FirebaseFirestore.Query = db().collection('users').doc(uid).collection('bookmarks');
    if (journeyId) q = q.where('journeyId', '==', journeyId);
    return (await q.get()).docs.map((d) => d.data() as Bookmark).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async putBookmark(uid, b) {
    await db().collection('users').doc(uid).collection('bookmarks').doc(docId(b.id)).set(b);
  },
  async deleteBookmark(uid, id) {
    await db().collection('users').doc(uid).collection('bookmarks').doc(docId(id)).delete();
  },
  async listRewards(uid, journeyId) {
    let q: FirebaseFirestore.Query = db().collection('users').doc(uid).collection('rewards');
    if (journeyId) q = q.where('journeyId', '==', journeyId);
    return (await q.get()).docs.map((d) => d.data() as Reward).sort((a, b) => a.atM - b.atM);
  },
  async getReward(uid, id) {
    const d = await db().collection('users').doc(uid).collection('rewards').doc(docId(id)).get();
    return d.exists ? (d.data() as Reward) : null;
  },
  async putReward(uid, r) {
    await db().collection('users').doc(uid).collection('rewards').doc(docId(r.id)).set(r);
  },
  async deleteReward(uid, id) {
    await db().collection('users').doc(uid).collection('rewards').doc(docId(id)).delete();
  },
  async getCoachPlan(uid, journeyId) {
    const d = await db().collection('users').doc(uid).collection('coach').doc(docId(journeyId)).get();
    return d.exists ? (d.data() as CoachPlan) : null;
  },
  async putCoachPlan(uid, journeyId, plan) {
    await db().collection('users').doc(uid).collection('coach').doc(docId(journeyId)).set(plan);
  },
  async incrementStat(uid, key) {
    await db().collection('users').doc(uid).set({ stats: { [key]: FieldValue.increment(1) } }, { merge: true });
  },
  async addPushToken(uid, token) {
    await db().collection('users').doc(uid).set({ pushTokens: FieldValue.arrayUnion(token) }, { merge: true });
  },
  async removePushTokens(uid, tokens) {
    if (tokens.length) await db().collection('users').doc(uid).set({ pushTokens: FieldValue.arrayRemove(...tokens) }, { merge: true });
  },
  async getQuest(id) {
    const d = await db().collection('quests').doc(docId(id)).get();
    return d.exists ? stripQuest(d.data() as StoredQuest) : null;
  },
  async putQuest(q) {
    await db().collection('quests').doc(docId(q.id)).set({ ...q, fromUid: q.from.uid, toUid: q.to.uid ?? null, toEmail: q.to.email });
  },
  async listQuestsFor(uid, email) {
    const col = db().collection('quests');
    const snaps = await Promise.all([col.where('fromUid', '==', uid).get(), col.where('toUid', '==', uid).get(), col.where('toEmail', '==', email).get()]);
    const byId = new Map<string, Quest>();
    for (const d of snaps.flatMap((x) => x.docs)) byId.set(d.id, stripQuest(d.data() as StoredQuest));
    return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async uidForEmail(email) {
    const snap = await db().collection('users').where('email', '==', email).limit(1).get();
    return snap.docs[0]?.id ?? null;
  },
  async listUsers() {
    const snap = await db().collection('users').get();
    return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as UserDoc) }));
  },
  async hasAiKey(uid) {
    return Boolean(((await db().collection('secrets').doc(uid).get()).data() as Secrets | undefined)?.ai);
  },
  async listShares(uid, journeyId) {
    const snap = await db().collection('shares').where('uid', '==', uid).where('journeyId', '==', journeyId).get();
    return snap.docs.map((d) => d.id);
  },
};

type StoredGroup = Omit<Group, 'route'> & { route: { polyline: string; totalM: number; provider: string } };
export const toStoredGroup = (g: Group): StoredGroup => ({ ...g, route: toStored({ route: g.route } as Journey).route });
export const fromStoredGroup = (g: StoredGroup): Group => ({ ...g, route: fromStored({ route: g.route } as StoredJourney).route });

/** The active repository (swappable in tests). */
export let repo: Repo = firestoreRepo;
export function setRepo(r: Repo) {
  repo = r;
}
