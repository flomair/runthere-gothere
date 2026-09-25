import { FieldValue } from 'firebase-admin/firestore';
import { decodePolyline, encodePolyline } from '../shared/geo.js';
import type { Activity, Journey } from '../shared/types.js';
import { db } from './firebase.js';

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
}

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
    return snap.docs.map((d) => fromStored(d.data() as StoredJourney));
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
      .set({ text, at: new Date().toISOString() });
  },
};

/** The active repository (swappable in tests). */
export let repo: Repo = firestoreRepo;
export function setRepo(r: Repo) {
  repo = r;
}
