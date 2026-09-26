import { randomBytes } from 'node:crypto';
import { computeProgress } from '../shared/progress.js';
import { QUEST_EMOJI, cleanParams, evaluateQuest, isFinished, questTitle, validateQuest } from '../shared/quests.js';
import { promise } from '../shared/rewards.js';
import type { Quest, QuestParams, QuestPerson, QuestType } from '../shared/types.js';
import { type User, adminEmails, normalizeEmail } from './access.js';
import { HttpError } from './http.js';
import { langOf, notify, textFor } from './push.js';
import { repo } from './repo.js';

const DAY = 86_400_000;
const newId = () => randomBytes(9).toString('base64url');
const firstName = (name?: string, email?: string) => (name?.split(' ')[0] || email?.split('@')[0] || 'Runner').slice(0, 40);
const QUESTS_URL = '/#/quests';

export interface QuestInput {
  toEmail?: string;
  type?: QuestType;
  params?: QuestParams;
  days?: number;
  gift?: string;
  penalty?: string;
  message?: string;
}

/** People you can challenge: everyone you share a journey with, and everyone you had a quest with. */
export async function friendsOf(user: User): Promise<QuestPerson[]> {
  const byEmail = new Map<string, QuestPerson>();
  for (const g of await repo.listGroupsFor(user.uid, user.email)) {
    if (!g.memberUids.includes(user.uid)) continue;
    for (const m of Object.values(g.members)) if (m.uid !== user.uid && m.email) byEmail.set(m.email, { uid: m.uid, email: m.email, name: m.name, picture: m.picture });
  }
  for (const q of await repo.listQuestsFor(user.uid, user.email)) {
    const other = q.from.uid === user.uid ? q.to : q.from;
    if (other.email !== user.email && !byEmail.has(other.email)) byEmail.set(other.email, { uid: other.uid, email: other.email, name: other.name, picture: other.picture });
  }
  return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Offer a quest to a friend. The friend must be able to use the app (allowlist). */
export async function createQuest(user: User, input: QuestInput): Promise<Quest> {
  const toEmail = normalizeEmail(input.toEmail ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) throw new HttpError(400, 'Pick a friend or enter an email address');
  if (toEmail === user.email) throw new HttpError(400, 'You cannot challenge yourself');
  const type = input.type as QuestType;
  const params = cleanParams(type, input.params ?? {});
  const days = Number(input.days);
  const err = validateQuest(type, params, days);
  if (err) throw new HttpError(400, err);
  const gift = (input.gift ?? '').trim().slice(0, 200);
  if (!gift) throw new HttpError(400, 'Promise a gift for the winner');

  const friends = await friendsOf(user);
  const friend = friends.find((f) => f.email === toEmail);
  if (!friend && !adminEmails().includes(toEmail) && !(await repo.isAllowed(toEmail))) {
    if (!user.isAdmin) throw new HttpError(403, `${toEmail} can't use the app yet. Ask the admin to add them, or share a journey with them first.`);
    await repo.allow({ email: toEmail, addedBy: user.email, addedAt: new Date().toISOString() });
  }
  const toUid = friend?.uid ?? (await repo.uidForEmail(toEmail)) ?? undefined;
  const toDoc = toUid ? await repo.getUser(toUid) : null;

  const q: Quest = {
    id: newId(),
    type,
    params,
    days,
    from: { uid: user.uid, email: user.email, name: firstName(user.name, user.email), picture: user.picture },
    to: { uid: toUid, email: toEmail, name: friend?.name ?? firstName(toDoc?.name, toEmail), picture: friend?.picture ?? toDoc?.picture },
    message: input.message?.trim().slice(0, 300) || undefined,
    gift: { text: gift, fulfillment: promise() },
    penalty: input.penalty?.trim().slice(0, 200) || undefined,
    status: 'offered',
    createdAt: new Date().toISOString(),
  };
  await repo.putQuest(q);
  if (toUid) {
    const tx = await textFor(toUid);
    await notify(toUid, { title: tx.questOffer(q.from.name), body: `${questTitle(q, langOf(tx))} · 🎁 ${gift}`, url: QUESTS_URL, tag: `quest-${q.id}` });
  }
  return q;
}

const isRecipient = (q: Quest, user: User) => q.to.uid === user.uid || q.to.email === user.email;

/** Accept or decline (recipient), cancel (challenger), or mark the gift as delivered (challenger). */
export async function respondQuest(user: User, id: string, action: string, journeyId?: string): Promise<Quest> {
  const q = await repo.getQuest(id);
  if (!q || (q.from.uid !== user.uid && !isRecipient(q, user))) throw new HttpError(404, 'Quest not found');
  const now = new Date();

  if (action === 'accept' || action === 'decline') {
    if (!isRecipient(q, user)) throw new HttpError(403, 'Only the challenged friend can answer');
    if (q.status !== 'offered') throw new HttpError(409, 'This quest was already answered');
    q.to.uid = user.uid;
    q.respondedAt = now.toISOString();
    if (action === 'decline') {
      q.status = 'declined';
    } else {
      q.status = 'accepted';
      q.startsAt = now.toISOString();
      q.endsAt = new Date(now.getTime() + q.days * DAY).toISOString();
      const j = journeyId ? (await repo.listJourneys(user.uid)).find((x) => x.id === journeyId) : undefined;
      if (j) {
        const acts = j.useStrava ? await repo.listActivities(user.uid, new Date(Date.parse(`${j.startDate}T00:00:00Z`) - DAY).toISOString()) : [];
        q.journeyId = j.id;
        q.branchAtM = computeProgress(j, acts).doneM;
      }
    }
    await repo.putQuest(q);
    const tx = await textFor(q.from.uid);
    await notify(q.from.uid, {
      title: action === 'accept' ? tx.questAccepted(q.to.name) : tx.questDeclined(q.to.name),
      body: questTitle(q, langOf(tx)),
      url: QUESTS_URL,
      tag: `quest-${q.id}`,
    });
    return q;
  }
  if (action === 'cancel') {
    if (q.from.uid !== user.uid) throw new HttpError(403, 'Only the challenger can call it off');
    if (isFinished(q.status)) throw new HttpError(409, 'This quest is already over');
    q.status = 'cancelled';
    q.resolvedAt = now.toISOString();
    await repo.putQuest(q);
    return q;
  }
  if (action === 'delivered') {
    if (q.from.uid !== user.uid) throw new HttpError(403, 'Only the challenger can deliver the gift');
    if (q.status !== 'won') throw new HttpError(409, 'The gift is due once the quest is won');
    q.gift.fulfillment = { ...q.gift.fulfillment, status: 'fulfilled', fulfilledAt: now.toISOString() };
    await repo.putQuest(q);
    return q;
  }
  throw new HttpError(400, 'unknown action');
}

async function resolved(q: Quest): Promise<void> {
  const title = (tx: Awaited<ReturnType<typeof textFor>>) => questTitle(q, langOf(tx));
  const toUid = q.to.uid!;
  const txTo = await textFor(toUid);
  const txFrom = await textFor(q.from.uid);
  const tag = `quest-${q.id}`;
  if (q.status === 'won') {
    await notify(toUid, { title: txTo.questWon, body: txTo.questWonBody(title(txTo), q.gift.text), url: QUESTS_URL, tag });
    await notify(q.from.uid, { title: txFrom.friendWon(q.to.name), body: txFrom.friendWonBody(title(txFrom), q.gift.text), url: QUESTS_URL, tag });
  } else if (q.status === 'lost') {
    await notify(toUid, { title: txTo.questLost, body: txTo.questLostBody(title(txTo), q.penalty), url: QUESTS_URL, tag });
    await notify(q.from.uid, {
      title: q.type === 'race' && q.winnerUid === q.from.uid ? txFrom.raceWon(q.to.name) : txFrom.friendLost(q.to.name),
      body: title(txFrom),
      url: QUESTS_URL,
      tag,
    });
  }
}

/**
 * Bring the user's quests up to date: link invitations sent to their email, expire unanswered
 * offers, evaluate running quests against tracked runs, award badges and notify on the result.
 */
export async function refreshQuests(uid: string, email: string, now = Date.now()): Promise<Quest[]> {
  const quests = await repo.listQuestsFor(uid, email);
  for (const q of quests) {
    let changed = false;
    if (!q.to.uid && q.to.email === email) {
      q.to.uid = uid;
      changed = true;
    }
    if (q.status === 'offered' || (q.status === 'accepted' && q.to.uid)) {
      const since = q.startsAt ?? q.createdAt;
      const [toRuns, fromRuns] = await Promise.all([
        q.status === 'accepted' ? repo.listActivities(q.to.uid!, since) : [],
        q.status === 'accepted' && q.type === 'race' ? repo.listActivities(q.from.uid, since) : [],
      ]);
      const ev = evaluateQuest(q, toRuns, fromRuns, now);
      const before = JSON.stringify([q.status, q.progress?.value, q.progress?.rival, q.progress?.weekRuns, q.progress?.bestS]);
      const status = ev.status;
      Object.assign(q, { status, progress: ev.progress ?? q.progress, resolvedAt: ev.resolvedAt, winnerUid: ev.winnerUid });
      if (status === 'won' || (q.type === 'race' && status === 'lost')) q.badge = { emoji: QUEST_EMOJI[q.type], label: questTitle(q) };
      const after = JSON.stringify([q.status, q.progress?.value, q.progress?.rival, q.progress?.weekRuns, q.progress?.bestS]);
      if (before !== after) changed = true;
      if (changed) await repo.putQuest(q);
      if (isFinished(status) && q.to.uid && q.startsAt && status !== 'expired') await resolved(q);
      continue;
    }
    if (changed) await repo.putQuest(q);
  }
  return quests;
}
