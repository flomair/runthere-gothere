import { randomBytes } from 'node:crypto';
import { computeProgress, type Progress } from '../shared/progress.js';
import { canMoveReward, promise, validPinPosition } from '../shared/rewards.js';
import type { Journey, Reward } from '../shared/types.js';
import { HttpError } from './http.js';
import { repo } from './repo.js';
import { assertOwnPhoto } from './storage.js';

/** The journey and its progress, computed on the server from the stored runs. */
export async function journeyProgress(uid: string, journeyId: string): Promise<{ journey: Journey; progress: Progress }> {
  const journey = (await repo.listJourneys(uid)).find((j) => j.id === journeyId);
  if (!journey) throw new HttpError(404, 'journey not found');
  const acts = await repo.listActivities(uid, new Date(Date.parse(`${journey.startDate}T00:00:00Z`) - 86_400_000).toISOString());
  return { journey, progress: computeProgress(journey, acts) };
}

const cleanTitle = (t: unknown) => {
  const s = typeof t === 'string' ? t.trim().slice(0, 120) : '';
  if (!s) throw new HttpError(400, 'a reward needs a title');
  return s;
};
const cleanLink = (l: unknown) => {
  if (l == null || l === '') return undefined;
  if (typeof l !== 'string' || !/^https?:\/\/\S+$/i.test(l.trim())) throw new HttpError(400, 'the shop link must start with http:// or https://');
  return l.trim().slice(0, 500);
};
const cleanPhoto = (uid: string, p: unknown) => {
  if (p == null || p === '') return undefined;
  if (typeof p !== 'string') throw new HttpError(400, 'invalid photo');
  assertOwnPhoto(uid, p);
  return p;
};

export interface RewardInput {
  journeyId?: string;
  title?: string;
  link?: string | null;
  photo?: string | null;
  atM?: number;
}

/** Pin a new reward somewhere ahead on the route. */
export async function createReward(uid: string, input: RewardInput): Promise<Reward> {
  if (!input.journeyId) throw new HttpError(400, 'missing journeyId');
  const { progress } = await journeyProgress(uid, input.journeyId);
  const atM = Number(input.atM);
  if (!validPinPosition(atM, progress.doneM, progress.totalM)) throw new HttpError(400, 'Place the reward at a point still ahead of you on the route.');
  const r: Reward = {
    id: randomBytes(8).toString('hex'),
    journeyId: input.journeyId,
    title: cleanTitle(input.title),
    link: cleanLink(input.link),
    photo: cleanPhoto(uid, input.photo),
    atM,
    status: 'locked',
    createdAt: new Date().toISOString(),
    fulfillment: promise(),
  };
  await repo.putReward(uid, r);
  return r;
}

/** Edit or move a reward – only while it is still locked. */
export async function updateReward(uid: string, id: string, input: RewardInput): Promise<Reward> {
  const r = await repo.getReward(uid, id);
  if (!r) throw new HttpError(404, 'reward not found');
  const { progress } = await journeyProgress(uid, r.journeyId);
  if (!canMoveReward(r, progress.doneM)) throw new HttpError(409, 'This reward is already unlocked and can no longer be changed.');
  const next: Reward = { ...r };
  if (input.title !== undefined) next.title = cleanTitle(input.title);
  if (input.link !== undefined) next.link = cleanLink(input.link);
  if (input.photo !== undefined) next.photo = cleanPhoto(uid, input.photo);
  if (input.atM !== undefined) {
    const atM = Number(input.atM);
    if (!validPinPosition(atM, progress.doneM, progress.totalM)) throw new HttpError(400, 'Place the reward at a point still ahead of you on the route.');
    next.atM = atM;
  }
  await repo.putReward(uid, next);
  return next;
}

/** "Claimed!" – with an optional photo and note. Only unlocked rewards can be claimed. */
export async function claimReward(uid: string, id: string, input: { photo?: string | null; note?: string | null }): Promise<Reward> {
  const r = await repo.getReward(uid, id);
  if (!r) throw new HttpError(404, 'reward not found');
  const { progress } = await journeyProgress(uid, r.journeyId);
  if (r.status === 'claimed') return r;
  if (r.status !== 'unlocked' && r.atM > progress.doneM) throw new HttpError(409, 'Run to the pin first – this reward is still locked.');
  const now = new Date().toISOString();
  const next: Reward = {
    ...r,
    status: 'claimed',
    unlockedAt: r.unlockedAt ?? now,
    claimedAt: now,
    claimPhoto: cleanPhoto(uid, input.photo),
    claimNote: typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 300) : undefined,
    fulfillment: { ...r.fulfillment, status: 'fulfilled', fulfilledAt: now },
  };
  await repo.putReward(uid, next);
  return next;
}

/** Mark rewards whose pin has been reached as unlocked; returns the newly unlocked ones. */
export async function unlockReachedRewards(uid: string, journey: Journey, progress: Progress): Promise<Reward[]> {
  const locked = (await repo.listRewards(uid, journey.id)).filter((r) => r.status === 'locked' && r.atM <= progress.doneM + 1);
  const now = new Date().toISOString();
  for (const r of locked) {
    r.status = 'unlocked';
    r.unlockedAt = now;
    await repo.putReward(uid, r);
  }
  return locked;
}
