import { milestoneTitle } from '../shared/milestoneTitle.js';
import type { Milestone } from '../shared/types.js';
import { messaging } from './firebase.js';
import { repo } from './repo.js';

export interface PushMessage {
  title: string;
  body: string;
  /** In-app link, e.g. "/#/j/abc/diary". */
  url?: string;
  /** Replaces an earlier notification with the same tag. */
  tag?: string;
  image?: string;
}

export interface PushResult {
  token: string;
  ok: boolean;
  /** FCM error code, e.g. "messaging/registration-token-not-registered". */
  code?: string;
}

export type PushSender = (tokens: string[], data: Record<string, string>) => Promise<PushResult[]>;

const fcmSender: PushSender = async (tokens, data) => {
  // data-only message: the service worker (public/sw.js) shows it, so it looks the same on every browser
  const res = await messaging().sendEachForMulticast({ tokens, data, webpush: { headers: { TTL: String(3 * 86_400), Urgency: 'normal' } } });
  return res.responses.map((r, i) => ({ token: tokens[i], ok: r.success, code: r.error?.code }));
};

let sender: PushSender = fcmSender;
/** For tests. */
export const setPushSender = (s: PushSender | null) => {
  sender = s ?? fcmSender;
};

const DEAD = /registration-token-not-registered|invalid-registration-token|invalid-argument|mismatched-credential/;

/** Send to every device of the user; forgets devices FCM says are gone. Never throws. */
export async function notify(uid: string, msg: PushMessage): Promise<number> {
  try {
    const tokens = (await repo.getUser(uid))?.pushTokens ?? [];
    if (!tokens.length) return 0;
    const data = Object.fromEntries(Object.entries({ ...msg, url: msg.url ?? '/' }).filter(([, v]) => v != null).map(([k, v]) => [k, String(v).slice(0, 1000)]));
    const results = await sender(tokens, data);
    const dead = results.filter((r) => !r.ok && DEAD.test(r.code ?? '')).map((r) => r.token);
    if (dead.length) await repo.removePushTokens(uid, dead);
    return results.filter((r) => r.ok).length;
  } catch (e) {
    console.error('push failed', e);
    return 0;
  }
}

const ICON: Record<Milestone['kind'], string> = { waypoint: '📍', distance: '🏃', halfway: '⚖️', border: '🛂', finish: '🏁' };

const TEXT = {
  en: {
    reward: (title: string) => `🎁 Reward unlocked: ${title}`,
    rewardBody: 'You reached the pin. Treat yourself – and tap "Claimed" when you did.',
    rewards: (n: number) => `🎁 ${n} rewards unlocked`,
    one: (m: Milestone) => (m.kind === 'finish' ? 'You made it! Time to go there for real.' : m.place ? `${m.place.name}, ${m.place.context}` : 'A new chapter in your diary.'),
    many: (n: number) => `${n} new milestones in your diary`,
    manyBody: (ms: Milestone[]) => ms.map((m) => milestoneTitle(m, 'en')).join(' · '),
    kudos: (who: string) => `${who} gave you kudos 👏`,
    comment: (who: string) => `${who} commented`,
    questOffer: (who: string) => `⚔️ ${who} challenges you`,
    questAccepted: (who: string) => `⚔️ ${who} accepted your challenge`,
    questDeclined: (who: string) => `${who} declined your challenge`,
    questWon: '🏅 Quest complete!',
    questWonBody: (title: string, gift: string) => `${title} – you earned: ${gift}`,
    questLost: 'Quest over',
    questLostBody: (title: string, penalty?: string) => (penalty ? `${title} – time for the penalty: ${penalty}` : `${title} – next time!`),
    friendWon: (who: string) => `🏅 ${who} completed your challenge`,
    friendWonBody: (title: string, gift: string) => `${title} – time to deliver: ${gift}`,
    friendLost: (who: string) => `${who} missed your challenge`,
    raceWon: (who: string) => `🏁 You beat ${who}!`,
    stageNew: (name: string) => `🚩 New race stage: ${name}`,
    stageNewBody: (who: string, start: string, prize: string) => `${who} set it up · starts ${start} · 🏆 ${prize}`,
    stageLead: (who: string, name: string) => `👑 ${who} takes the lead in ${name}`,
    stageLeadYou: (name: string) => `👑 You take the lead in ${name}`,
    stageLeadBody: (pct: string) => `${pct} of their usual weekly distance`,
    stageWon: (who: string, name: string) => `🏆 ${who} wins ${name}`,
    stageWonYou: (name: string) => `🏆 You win ${name}!`,
    stageWonBody: (prize: string) => `Prize: ${prize}`,
    drawEarned: '🎁 You earned a mystery draw',
    drawsEarned: (n: number) => `🎁 You earned ${n} mystery draws`,
    drawBody: (group: string) => `Open ${group} and draw from the surprise bucket.`,
    yourPrizeDrawn: (who: string, title: string) => `🎉 ${who} drew your surprise: ${title}`,
    bucketLow: (n: number) => `🪣 Only ${n} surprises left in the bucket`,
    bucketLowBody: (group: string) => `Add a few to ${group} so everyone keeps drawing.`,
  },
  de: {
    reward: (title: string) => `🎁 Belohnung freigeschaltet: ${title}`,
    rewardBody: 'Du hast den Pin erreicht. Gönn es dir – und tippe auf „Eingelöst“, wenn es so weit ist.',
    rewards: (n: number) => `🎁 ${n} Belohnungen freigeschaltet`,
    one: (m: Milestone) => (m.kind === 'finish' ? 'Geschafft! Zeit, wirklich hinzufahren.' : m.place ? `${m.place.name}, ${m.place.context}` : 'Ein neues Kapitel in deinem Tagebuch.'),
    many: (n: number) => `${n} neue Meilensteine in deinem Tagebuch`,
    manyBody: (ms: Milestone[]) => ms.map((m) => milestoneTitle(m, 'de')).join(' · '),
    kudos: (who: string) => `${who} hat dir Kudos gegeben 👏`,
    comment: (who: string) => `${who} hat kommentiert`,
    questOffer: (who: string) => `⚔️ ${who} fordert dich heraus`,
    questAccepted: (who: string) => `⚔️ ${who} hat deine Herausforderung angenommen`,
    questDeclined: (who: string) => `${who} hat deine Herausforderung abgelehnt`,
    questWon: '🏅 Quest geschafft!',
    questWonBody: (title: string, gift: string) => `${title} – verdient: ${gift}`,
    questLost: 'Quest vorbei',
    questLostBody: (title: string, penalty?: string) => (penalty ? `${title} – Zeit für die Strafe: ${penalty}` : `${title} – beim nächsten Mal!`),
    friendWon: (who: string) => `🏅 ${who} hat deine Herausforderung geschafft`,
    friendWonBody: (title: string, gift: string) => `${title} – Zeit einzulösen: ${gift}`,
    friendLost: (who: string) => `${who} hat deine Herausforderung verpasst`,
    raceWon: (who: string) => `🏁 Du hast ${who} geschlagen!`,
    stageNew: (name: string) => `🚩 Neue Rennetappe: ${name}`,
    stageNewBody: (who: string, start: string, prize: string) => `von ${who} · Start ${start} · 🏆 ${prize}`,
    stageLead: (who: string, name: string) => `👑 ${who} führt in ${name}`,
    stageLeadYou: (name: string) => `👑 Du führst in ${name}`,
    stageLeadBody: (pct: string) => `${pct} des üblichen Wochenumfangs`,
    stageWon: (who: string, name: string) => `🏆 ${who} gewinnt ${name}`,
    stageWonYou: (name: string) => `🏆 Du gewinnst ${name}!`,
    stageWonBody: (prize: string) => `Preis: ${prize}`,
    drawEarned: '🎁 Du hast eine Überraschungsziehung verdient',
    drawsEarned: (n: number) => `🎁 Du hast ${n} Überraschungsziehungen verdient`,
    drawBody: (group: string) => `Öffne ${group} und zieh aus dem Überraschungstopf.`,
    yourPrizeDrawn: (who: string, title: string) => `🎉 ${who} hat deine Überraschung gezogen: ${title}`,
    bucketLow: (n: number) => `🪣 Nur noch ${n} Überraschungen im Topf`,
    bucketLowBody: (group: string) => `Leg ein paar in ${group} nach, damit alle weiter ziehen können.`,
  },
};
export const textFor = async (uid: string) => TEXT[((await repo.getUser(uid))?.pushLang === 'de' ? 'de' : 'en') as 'en' | 'de'];

/** One notification for the milestones a sync just reached (grouped when there are several). */
export async function notifyMilestones(uid: string, created: Milestone[]): Promise<void> {
  if (!created.length) return;
  const tx = await textFor(uid);
  const last = created[created.length - 1];
  const url = `/#/j/${encodeURIComponent(last.journeyId)}/diary`;
  if (created.length === 1) {
    await notify(uid, { title: `${ICON[last.kind]} ${milestoneTitle(last, tx === TEXT.de ? 'de' : 'en')}`, body: tx.one(last), url, tag: `ms-${last.journeyId}`, image: last.photo?.url });
  } else {
    await notify(uid, { title: `${ICON[last.kind]} ${tx.many(created.length)}`, body: tx.manyBody(created), url, tag: `ms-${last.journeyId}` });
  }
}

/** Kudos or a comment on someone's post in a shared journey. */
export async function notifyFeed(ownerUid: string, kind: 'kudos' | 'comment', who: string, groupId: string, text?: string): Promise<void> {
  const tx = await textFor(ownerUid);
  await notify(ownerUid, {
    title: kind === 'kudos' ? tx.kudos(who) : tx.comment(who),
    body: text ?? '',
    url: `/#/g/${encodeURIComponent(groupId)}`,
    tag: `feed-${groupId}`,
  });
}

/** Personal rewards whose pin a sync has just reached. */
export async function notifyRewards(uid: string, rewards: { title: string; journeyId: string }[]): Promise<void> {
  if (!rewards.length) return;
  const tx = await textFor(uid);
  const first = rewards[0];
  await notify(uid, {
    title: rewards.length === 1 ? tx.reward(first.title) : tx.rewards(rewards.length),
    body: rewards.length === 1 ? tx.rewardBody : rewards.map((r) => r.title).join(' · '),
    url: `/#/j/${encodeURIComponent(first.journeyId)}`,
    tag: `reward-${first.journeyId}`,
  });
}

export type PushText = (typeof TEXT)['en'];
export const langOf = (tx: PushText) => (tx === TEXT.de ? 'de' : 'en');
