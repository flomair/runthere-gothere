import { type Purpose, seal, unseal } from './crypto.js';
import { HttpError } from './http.js';
import { repo } from './repo.js';
import { type StravaTokens, deauthorize, ensureFresh, exchangeCode, getActivity, listActivities } from './strava.js';

const TOKENS: Purpose = 'strava-tokens';
const DAY = 86_400;
/** When re-syncing, look back a little so edits (e.g. changed distance) are picked up. */
const OVERLAP_S = 3 * DAY;

/** Valid tokens for a user (refreshed and persisted if needed), or null if not connected. */
export async function tokensFor(uid: string): Promise<StravaTokens | null> {
  const sealed = (await repo.getSecrets(uid)).strava;
  if (!sealed) return null;
  const stored = unseal<StravaTokens>(TOKENS, sealed);
  if (!stored) return null;
  const { tokens, refreshed } = await ensureFresh(stored);
  if (refreshed) await repo.updateSecrets(uid, { strava: seal(TOKENS, tokens) });
  return tokens;
}

async function earliestJourneyStart(uid: string): Promise<number | undefined> {
  const js = await repo.listJourneys(uid);
  const starts = js.filter((j) => j.useStrava).map((j) => Date.parse(`${j.startDate}T00:00:00Z`) / 1000 - DAY);
  return starts.length ? Math.min(...starts) : undefined;
}

/** Link a Strava account to this user after OAuth, then backfill activities. */
export async function connectStrava(uid: string, code: string): Promise<void> {
  const { tokens, athlete } = await exchangeCode(code);
  const previous = await repo.uidForAthlete(athlete.id);
  if (previous && previous !== uid) {
    // the same Strava account can only feed one app user; move it
    await repo.updateUser(previous, { strava: null });
    await repo.updateSecrets(previous, { strava: null });
  }
  const current = (await repo.getUser(uid))?.strava;
  if (current && current.athleteId !== athlete.id) await repo.unlinkAthlete(current.athleteId);

  await repo.linkAthlete(athlete.id, uid);
  await repo.updateSecrets(uid, { strava: seal(TOKENS, tokens) });
  await repo.updateUser(uid, {
    strava: {
      athleteId: athlete.id,
      firstname: athlete.firstname,
      lastname: athlete.lastname,
      profile: athlete.profile,
      connectedAt: new Date().toISOString(),
    },
  });
  await syncUser(uid);
}

export interface SyncResult {
  fetched: number;
  from: number;
}

/**
 * Pull activities from Strava into Firestore.
 * - `sinceEpoch` earlier than what we already have → backfill from there
 * - otherwise → incremental from the last sync (with a small overlap)
 */
export async function syncUser(uid: string, sinceEpoch?: number): Promise<SyncResult> {
  const tokens = await tokensFor(uid);
  if (!tokens) throw new HttpError(409, 'Strava is not connected');
  const user = await repo.getUser(uid);
  const s = user?.strava;
  if (!s) throw new HttpError(409, 'Strava is not connected');

  const now = Date.now() / 1000;
  const defaultStart = Math.min((await earliestJourneyStart(uid)) ?? now - 30 * DAY, now - 7 * DAY);
  const wanted = sinceEpoch ?? defaultStart;
  let from: number;
  if (s.syncedFrom === undefined || wanted < s.syncedFrom) from = wanted; // backfill
  else from = s.lastSyncAt ? Date.parse(s.lastSyncAt) / 1000 - OVERLAP_S : s.syncedFrom;

  from = Math.floor(from);
  const acts = await listActivities(tokens, from);
  await repo.putActivities(uid, acts);
  await repo.updateUser(uid, {
    strava: { ...s, lastSyncAt: new Date().toISOString(), syncedFrom: Math.min(from, s.syncedFrom ?? from) },
  });
  return { fetched: acts.length, from };
}

export async function disconnectStrava(uid: string): Promise<void> {
  const tokens = await tokensFor(uid).catch(() => null);
  if (tokens) await deauthorize(tokens);
  const s = (await repo.getUser(uid))?.strava;
  if (s) await repo.unlinkAthlete(s.athleteId);
  await repo.updateSecrets(uid, { strava: null });
  await repo.updateUser(uid, { strava: null });
}

export interface StravaEvent {
  object_type: 'activity' | 'athlete';
  object_id: number;
  aspect_type: 'create' | 'update' | 'delete';
  owner_id: number;
  updates?: Record<string, string>;
}

/** Apply one webhook event. Unknown athletes are ignored. */
export async function handleStravaEvent(e: StravaEvent): Promise<string> {
  const uid = await repo.uidForAthlete(e.owner_id);
  if (!uid) return 'unknown athlete';

  if (e.object_type === 'athlete') {
    if (e.updates?.authorized === 'false') {
      // the athlete revoked access on strava.com
      await repo.unlinkAthlete(e.owner_id);
      await repo.updateSecrets(uid, { strava: null });
      await repo.updateUser(uid, { strava: null });
      return 'deauthorized';
    }
    return 'ignored';
  }

  if (e.aspect_type === 'delete') {
    await repo.deleteActivity(uid, e.object_id);
    return 'deleted';
  }
  const tokens = await tokensFor(uid);
  if (!tokens) return 'no tokens';
  try {
    const a = await getActivity(tokens, e.object_id);
    await repo.putActivities(uid, [a]);
    const { detectMilestones } = await import('./milestones.js');
    const created = await detectMilestones(uid, { maxNew: 4, maxPostcards: 1 }).catch((err) => {
      console.error('milestone detection failed', err);
      return [];
    });
    if (created.length) {
      const { notifyMilestones } = await import('./push.js');
      await notifyMilestones(uid, created);
    }
    return created.length ? `saved, ${created.length} milestone(s)` : 'saved';
  } catch (err) {
    // made private without read_all, or deleted meanwhile
    if (err instanceof HttpError && (err.status === 404 || err.status === 403 || err.status === 401)) {
      await repo.deleteActivity(uid, e.object_id);
      return 'removed';
    }
    throw err;
  }
}
