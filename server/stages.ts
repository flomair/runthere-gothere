import { randomBytes } from 'node:crypto';
import { promise } from '../shared/rewards.js';
import { BASELINE_DAYS, addDays, evaluateStage, validateStage } from '../shared/stages.js';
import type { Activity, Group, Stage } from '../shared/types.js';
import type { User } from './access.js';
import { requireMember } from './groups.js';
import { HttpError } from './http.js';
import { notify, textFor } from './push.js';
import { repo } from './repo.js';

const newId = () => randomBytes(9).toString('base64url');
const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const nameOf = (g: Group, uid: string) => g.members[uid]?.name?.split(' ')[0] ?? 'Someone';
const pct = (f: number) => `${Math.round(f * 100)}%`;
const groupUrl = (g: Group) => `/#/g/${encodeURIComponent(g.id)}`;

async function feed(g: Group, id: string, uid: string, text: string) {
  if (await repo.getFeedItem(g.id, id)) return;
  await repo.putFeedItem(g.id, { id, type: 'stage', uid, name: g.members[uid]?.name ?? 'Someone', picture: g.members[uid]?.picture, text, createdAt: new Date().toISOString(), kudos: [], comments: [] });
}

export interface StageInput {
  name?: string;
  fromM?: number;
  toM?: number;
  startDate?: string;
  days?: number;
  participants?: string[];
  prize?: string;
}

/** Turn a segment of the shared route into a race between two or more members. */
export async function createStage(user: User, groupId: string, input: StageInput, now = Date.now()): Promise<Stage> {
  const g = await requireMember(groupId, user);
  const data = {
    fromM: Number(input.fromM),
    toM: Number(input.toM),
    startDate: String(input.startDate ?? ''),
    days: Number(input.days),
    participants: [...new Set(input.participants ?? [])],
  };
  const err = validateStage(data, g.route.totalM, g.memberUids, today(now));
  if (err) throw new HttpError(400, err);
  const prize = (input.prize ?? '').trim().slice(0, 200);
  if (!prize) throw new HttpError(400, 'Set a prize for the stage winner');
  const s: Stage = {
    id: newId(),
    groupId,
    name: (input.name ?? '').trim().slice(0, 80) || `Stage ${(await repo.listStages(groupId)).length + 1}`,
    fromM: data.fromM,
    toM: Math.min(data.toM, g.route.totalM),
    startDate: data.startDate,
    endDate: addDays(data.startDate, data.days - 1),
    participants: data.participants,
    prize: { text: prize, fulfillment: promise() },
    createdBy: user.uid,
    createdAt: new Date(now).toISOString(),
    status: 'scheduled',
  };
  await repo.putStage(s);
  await feed(g, `stage_new_${s.id}`, user.uid, `🚩 ${s.name} · ${s.startDate} – ${s.endDate} · 🏆 ${prize}`);
  for (const uid of s.participants.filter((u) => u !== user.uid)) {
    const tx = await textFor(uid);
    await notify(uid, { title: tx.stageNew(s.name), body: tx.stageNewBody(nameOf(g, user.uid), s.startDate, prize), url: groupUrl(g), tag: `stage-${s.id}` });
  }
  return s;
}

/** Evaluate the group's open stages: lock baselines, update standings, finish them, notify on changes. */
export async function refreshStages(g: Group, now = Date.now()): Promise<Stage[]> {
  const stages = await repo.listStages(g.id);
  const open = stages.filter((s) => s.status === 'scheduled' || s.status === 'running');
  if (!open.length) return stages;
  const day = today(now);
  const since = `${addDays(open.map((s) => s.startDate).sort()[0], -BASELINE_DAYS - 1)}T00:00:00Z`;
  const uids = [...new Set(open.flatMap((s) => s.participants))];
  const acts: Record<string, Activity[]> = {};
  for (const uid of uids) acts[uid] = await repo.listActivities(uid, since);

  const out: Stage[] = [];
  for (const s of stages) {
    if (s.status !== 'scheduled' && s.status !== 'running') {
      out.push(s);
      continue;
    }
    const next = evaluateStage(s, acts, g.sportTypes, day);
    if (JSON.stringify(next) !== JSON.stringify(s)) await repo.putStage(next);
    out.push(next);
    // standings changed: a new leader (not the first one to appear)
    if (next.status === 'running' && s.leaderUid && next.leaderUid && next.leaderUid !== s.leaderUid) {
      const lead = next.results!.find((r) => r.uid === next.leaderUid)!;
      for (const uid of next.participants) {
        const tx = await textFor(uid);
        await notify(uid, {
          title: uid === next.leaderUid ? tx.stageLeadYou(next.name) : tx.stageLead(nameOf(g, next.leaderUid), next.name),
          body: tx.stageLeadBody(pct(lead.effort)),
          url: groupUrl(g),
          tag: `stage-${next.id}`,
        });
      }
    }
    if (next.status === 'finished') {
      if (next.winnerUid) await feed(g, `stage_won_${next.id}`, next.winnerUid, `🏆 ${next.name} · ${pct(next.results![0].effort)}`);
      for (const uid of next.participants) {
        if (!next.winnerUid) continue;
        const tx = await textFor(uid);
        await notify(uid, {
          title: uid === next.winnerUid ? tx.stageWonYou(next.name) : tx.stageWon(nameOf(g, next.winnerUid), next.name),
          body: tx.stageWonBody(next.prize.text),
          url: groupUrl(g),
          tag: `stage-${next.id}`,
        });
      }
    }
  }
  return out;
}

export async function listStages(user: User, groupId: string): Promise<Stage[]> {
  return refreshStages(await requireMember(groupId, user));
}

/** Call off a stage (its creator, before it's over) or mark its prize as delivered (creator, after). */
export async function stageAction(user: User, groupId: string, stageId: string, action: string): Promise<Stage> {
  await requireMember(groupId, user);
  const s = await repo.getStage(groupId, stageId);
  if (!s) throw new HttpError(404, 'Stage not found');
  if (s.createdBy !== user.uid) throw new HttpError(403, 'Only whoever set up the stage can do that');
  if (action === 'cancel') {
    if (s.status === 'finished' || s.status === 'cancelled') throw new HttpError(409, 'This stage is already over');
    s.status = 'cancelled';
  } else if (action === 'delivered') {
    if (s.status !== 'finished' || !s.winnerUid) throw new HttpError(409, 'The prize is due once the stage has a winner');
    s.prize.fulfillment = { ...s.prize.fulfillment, status: 'fulfilled', fulfilledAt: new Date().toISOString() };
  } else throw new HttpError(400, 'unknown action');
  await repo.putStage(s);
  return s;
}

/** Set the bonus prize for the most stage wins (owner), or mark it delivered (whoever set it). */
export async function setBonus(user: User, groupId: string, body: { text?: string; action?: string }): Promise<Group> {
  const g = await requireMember(groupId, user);
  if (body.action === 'delivered') {
    if (!g.bonusPrize || g.bonusPrize.setBy !== user.uid) throw new HttpError(403, 'Only whoever promised the bonus can mark it delivered');
    g.bonusPrize.fulfillment = { ...g.bonusPrize.fulfillment, status: 'fulfilled', fulfilledAt: new Date().toISOString() };
  } else {
    if (g.ownerUid !== user.uid) throw new HttpError(403, 'Only the owner sets the bonus prize');
    const text = (body.text ?? '').trim().slice(0, 200);
    g.bonusPrize = text ? { text, setBy: user.uid, fulfillment: g.bonusPrize?.fulfillment ?? promise() } : undefined;
  }
  await repo.putGroup(g);
  return g;
}
