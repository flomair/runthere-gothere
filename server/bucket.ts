import { randomBytes, randomInt } from 'node:crypto';
import { TIERS, countByTier, dropFor, eligiblePrizes, lowThreshold, mysteryPins, pickPrize, stageBoost, weekKey } from '../shared/bucket.js';
import { promise } from '../shared/rewards.js';
import type { BucketView, Draw, DrawSource, FeedItem, Group, Prize, PrizeTier } from '../shared/types.js';
import type { User } from './access.js';
import { asJourney, requireMember } from './groups.js';
import { HttpError } from './http.js';
import { milestoneCandidates } from './milestones.js';
import { notify, textFor } from './push.js';
import { repo } from './repo.js';
import { assertOwnPhoto, blobs } from './storage.js';

const newId = () => randomBytes(9).toString('base64url');
const firstName = (g: Group, uid: string) => g.members[uid]?.name?.split(' ')[0] ?? 'Someone';
const groupUrl = (g: Group) => `/#/g/${encodeURIComponent(g.id)}`;
/** Crypto-grade randomness for draws (tests inject their own). */
const secureRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

async function feed(g: Group, item: Omit<FeedItem, 'createdAt' | 'kudos' | 'comments' | 'name' | 'picture' | 'type'> & { name?: string }) {
  await repo.putFeedItem(g.id, { type: 'post', name: item.name ?? g.members[item.uid]?.name ?? 'Someone', picture: g.members[item.uid]?.picture, createdAt: new Date().toISOString(), kudos: [], comments: [], ...item });
}

/** Tell the group once when the bucket runs low; reset when it's filled up again. */
async function checkLow(g: Group): Promise<void> {
  const available = (await repo.listPrizes(g.id)).filter((p) => p.status === 'available').length;
  const limit = lowThreshold(g.memberUids.length);
  if (available < limit && !g.bucketLowSince) {
    g.bucketLowSince = new Date().toISOString();
    await repo.putGroup(g);
    await feed(g, { id: `bucket_low_${Date.now()}`, uid: g.ownerUid, name: '🪣', text: `🪣 ${available} ${available === 1 ? 'surprise' : 'surprises'} left in the bucket – add a few!` });
    for (const uid of g.memberUids) {
      const tx = await textFor(uid);
      await notify(uid, { title: tx.bucketLow(available), body: tx.bucketLowBody(g.name), url: groupUrl(g), tag: `bucket-${g.id}` });
    }
  } else if (available >= limit && g.bucketLowSince) {
    g.bucketLowSince = undefined;
    await repo.putGroup(g);
  }
}

export async function addPrize(user: User, groupId: string, input: { title?: string; tier?: string; anonymous?: boolean }): Promise<Prize> {
  const g = await requireMember(groupId, user);
  const title = (input.title ?? '').trim().slice(0, 140);
  if (!title) throw new HttpError(400, 'What is the surprise?');
  if (!TIERS.includes(input.tier as PrizeTier)) throw new HttpError(400, 'Pick small, medium or rare');
  const p: Prize = {
    id: newId(),
    groupId,
    title,
    tier: input.tier as PrizeTier,
    addedBy: user.uid,
    anonymous: Boolean(input.anonymous),
    createdAt: new Date().toISOString(),
    status: 'available',
    fulfillment: promise(),
  };
  await repo.putPrize(p);
  await checkLow(g);
  return p;
}

/** The giver can take a prize back while it's still in the bucket. */
export async function removePrize(user: User, groupId: string, prizeId: string): Promise<void> {
  const g = await requireMember(groupId, user);
  const p = await repo.getPrize(groupId, prizeId);
  if (!p || p.addedBy !== user.uid) throw new HttpError(404, 'Prize not found');
  if (p.status !== 'available') throw new HttpError(409, 'This surprise was already drawn');
  await repo.deletePrize(groupId, prizeId);
  await checkLow(g);
}

/**
 * Hand out draws a group's members have earned: "?" pins passed, cities/halfway/finish reached,
 * stage wins, and random weekly drops for weeks with runs. Idempotent (deterministic ids).
 * `members[].doneM` is each runner's position (race); relay groups pass the team position.
 */
export async function awardDraws(g: Group, members: { uid: string; doneM: number; days: string[] }[], teamDoneM?: number): Promise<Draw[]> {
  const have = new Set((await repo.listDraws(g.id)).map((d) => d.id));
  const fresh: Draw[] = [];
  const now = new Date().toISOString();
  const give = (id: string, uid: string, source: DrawSource, label: string, boost = 1) => {
    if (have.has(id)) return;
    have.add(id);
    fresh.push({ id, groupId: g.id, uid, source, label, boost, earnedAt: now });
  };
  const pins = mysteryPins(g.id, g.route.totalM);
  const cities = milestoneCandidates(asJourney(g)).filter((c) => c.kind === 'waypoint' || c.kind === 'finish' || c.kind === 'halfway');
  const thisWeek = weekKey(now);

  for (const m of members) {
    if (!g.memberUids.includes(m.uid)) continue;
    const pos = teamDoneM ?? m.doneM;
    for (const p of pins) if (pos >= p.m) give(`pin_${m.uid}_${p.key}`, m.uid, 'pin', `"?" pin at ${Math.round(p.m / 1000)} km`);
    for (const c of cities) if (pos >= c.atM - 1) give(`ms_${m.uid}_${c.kind}_${c.key}`, m.uid, 'milestone', c.title, c.kind === 'finish' ? 2 : 1);
    for (const w of new Set(m.days.map(weekKey))) if (w <= thisWeek && dropFor(g.id, m.uid, w)) give(`drop_${m.uid}_${w}`, m.uid, 'drop', `Lucky week of ${w}`);
  }
  for (const s of await repo.listStages(g.id)) {
    if (s.status !== 'finished' || !s.winnerUid || !g.memberUids.includes(s.winnerUid)) continue;
    give(`stage_${s.id}`, s.winnerUid, 'stage', `Stage win: ${s.name}`, stageBoost(s.results?.[0]?.effort ?? 1));
  }

  for (const d of fresh) await repo.putDraw(d);
  const byUser = new Map<string, number>();
  for (const d of fresh) byUser.set(d.uid, (byUser.get(d.uid) ?? 0) + 1);
  for (const [uid, n] of byUser) {
    const tx = await textFor(uid);
    await notify(uid, { title: n === 1 ? tx.drawEarned : tx.drawsEarned(n), body: tx.drawBody(g.name), url: groupUrl(g), tag: `draws-${g.id}` });
  }
  return fresh;
}

/** Use one of your draws: a prize is picked on the server (never your own), logged and revealed. */
export async function drawPrize(user: User, groupId: string, drawId: string, rng: () => number = secureRandom): Promise<{ draw: Draw; prize: Prize }> {
  const g = await requireMember(groupId, user);
  const d = await repo.getDraw(groupId, drawId);
  if (!d || d.uid !== user.uid) throw new HttpError(404, 'Draw not found');
  if (d.usedAt) throw new HttpError(409, 'This draw was already used');
  const picked = pickPrize(await repo.listPrizes(groupId), d, rng);
  if (!picked) throw new HttpError(409, 'Nothing in the bucket you could draw yet. Ask the others to add surprises – your draw stays saved.');
  // re-check right before claiming it, in case someone else drew it a moment ago
  const fresh = await repo.getPrize(groupId, picked.prize.id);
  if (!fresh || fresh.status !== 'available') throw new HttpError(409, 'Someone drew at the same moment. Try again!');
  const at = new Date().toISOString();
  const prize: Prize = { ...fresh, status: 'drawn', drawnBy: user.uid, drawnAt: at, drawId: d.id };
  const draw: Draw = { ...d, usedAt: at, prizeId: prize.id, tier: picked.tier, odds: picked.odds };
  await repo.putPrize(prize);
  await repo.putDraw(draw);
  const giver = prize.anonymous ? 'someone' : firstName(g, prize.addedBy);
  await feed(g, { id: `drawn_${prize.id}`, uid: user.uid, text: `🎉 drew a ${prize.tier} surprise: ${prize.title} (from ${giver})` });
  if (prize.addedBy !== user.uid) {
    const tx = await textFor(prize.addedBy);
    await notify(prize.addedBy, { title: tx.yourPrizeDrawn(firstName(g, user.uid), prize.title), body: g.name, url: groupUrl(g), tag: `prize-${prize.id}` });
  }
  await checkLow(g);
  return { draw, prize };
}

/** Mark a drawn prize as delivered (winner or giver), optionally with a photo. */
export async function deliverPrize(user: User, groupId: string, prizeId: string, input: { photo?: string; note?: string }): Promise<Prize> {
  const g = await requireMember(groupId, user);
  const p = await repo.getPrize(groupId, prizeId);
  if (!p) throw new HttpError(404, 'Prize not found');
  if (p.drawnBy !== user.uid && p.addedBy !== user.uid) throw new HttpError(403, 'Only the winner or the giver can mark it delivered');
  if (p.status !== 'drawn') throw new HttpError(409, p.status === 'delivered' ? 'Already delivered' : 'Not drawn yet');
  if (input.photo) assertOwnPhoto(user.uid, input.photo);
  const at = new Date().toISOString();
  const next: Prize = {
    ...p,
    status: 'delivered',
    deliveredAt: at,
    deliveredPhoto: input.photo || undefined,
    deliveredNote: input.note?.trim().slice(0, 300) || undefined,
    fulfillment: { ...p.fulfillment, status: 'fulfilled', fulfilledAt: at },
  };
  await repo.putPrize(next);
  await feed(g, { id: `delivered_${p.id}`, uid: p.drawnBy!, text: `📦 ${p.title} – delivered!` });
  return next;
}

/** Signed link to a delivery photo, for any member of the group. */
export async function prizePhotoUrl(user: User, groupId: string, prizeId: string): Promise<string> {
  await requireMember(groupId, user);
  const p = await repo.getPrize(groupId, prizeId);
  if (!p?.deliveredPhoto) throw new HttpError(404, 'No photo');
  return blobs().signedUrl(p.deliveredPhoto, 3600);
}

/** What the viewer may see: counts only for hidden prizes, their own prizes, and everything already drawn. */
export async function bucketView(user: User, groupId: string): Promise<BucketView> {
  const g = await requireMember(groupId, user);
  const [prizes, draws] = await Promise.all([repo.listPrizes(groupId), repo.listDraws(groupId)]);
  const available = prizes.filter((p) => p.status === 'available');
  const mineDraws = draws.filter((d) => d.uid === user.uid);
  const pinIds = new Set(mineDraws.filter((d) => d.source === 'pin').map((d) => d.id));
  return {
    counts: countByTier(available),
    drawable: eligiblePrizes(prizes, user.uid).length,
    low: available.length < lowThreshold(g.memberUids.length),
    lowThreshold: lowThreshold(g.memberUids.length),
    mine: prizes.filter((p) => p.addedBy === user.uid),
    revealed: prizes
      .filter((p) => p.status !== 'available')
      .map((p) => ({ ...p, addedBy: p.anonymous && p.addedBy !== user.uid ? '' : p.addedBy, giverName: p.anonymous && p.addedBy !== user.uid ? undefined : firstName(g, p.addedBy), drawnByName: p.drawnBy ? firstName(g, p.drawnBy) : undefined }))
      .sort((a, b) => (b.drawnAt ?? '').localeCompare(a.drawnAt ?? '')),
    draws: mineDraws.sort((a, b) => Number(!!a.usedAt) - Number(!!b.usedAt) || b.earnedAt.localeCompare(a.earnedAt)),
    pins: mysteryPins(g.id, g.route.totalM).map((p) => ({ ...p, collected: pinIds.has(`pin_${user.uid}_${p.key}`) })),
  };
}
