import type { Activity, Quest, QuestParams, QuestProgress, QuestStatus, QuestType } from './types.js';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
/** An offer nobody answers disappears after two weeks. */
export const OFFER_TTL_DAYS = 14;

/** Only runs count for quests (tracked Strava activities, not manual entries). */
export const isRun = (a: Pick<Activity, 'sportType' | 'manual'>) => /Run$/.test(a.sportType) && !a.manual;

export const QUEST_EMOJI: Record<QuestType, string> = { distance: '🏅', habit: '🔁', race: '🏁', speed: '⚡' };

/** Checks a new quest; returns an error message or null. */
export function validateQuest(type: QuestType, p: QuestParams, days: number): string | null {
  if (!['distance', 'habit', 'race', 'speed'].includes(type)) return 'unknown quest type';
  if (!Number.isInteger(days) || days < 1 || days > 120) return 'the time window must be 1–120 days';
  const d = p.distanceM ?? 0;
  if (type === 'distance' || type === 'race') {
    if (!(d >= 1000 && d <= 3_000_000)) return 'the distance must be 1–3000 km';
  }
  if (type === 'habit') {
    if (!Number.isInteger(p.runsPerWeek) || p.runsPerWeek! < 1 || p.runsPerWeek! > 14) return 'runs per week must be 1–14';
    if (days % 7) return 'a habit quest runs for whole weeks';
  }
  if (type === 'speed') {
    if (!(d >= 400 && d <= 100_000)) return 'the run must be 0.4–100 km';
    if (!(p.timeS && p.timeS >= 60 && p.timeS <= 86_400)) return 'the time must be between 1 minute and 24 hours';
  }
  return null;
}

/** Only the fields that matter for the type (so stray inputs are not stored). */
export function cleanParams(type: QuestType, p: QuestParams): QuestParams {
  if (type === 'habit') return { runsPerWeek: p.runsPerWeek };
  if (type === 'speed') return { distanceM: p.distanceM, timeS: p.timeS };
  return { distanceM: p.distanceM };
}

export interface QuestEvaluation {
  status: QuestStatus;
  progress?: QuestProgress;
  resolvedAt?: string;
  winnerUid?: string;
}

const inWindow = (runs: Activity[], start: number, end: number) =>
  runs
    .filter(isRun)
    .map((a) => ({ a, t: Date.parse(a.startDate) }))
    .filter((x) => x.t >= start && x.t < end)
    .sort((x, y) => x.t - y.t);

/** When cumulative distance first reaches the target (ms), and the total. */
function crossing(runs: { a: Activity; t: number }[], target: number): { at?: number; total: number } {
  let sum = 0;
  let at: number | undefined;
  for (const r of runs) {
    sum += r.a.distanceM;
    if (at === undefined && sum >= target) at = r.t;
  }
  return { at, total: sum };
}

/**
 * Where a quest stands. Pure: needs the recipient's runs (and the challenger's for a race).
 * Runs count from acceptance until the end of the window; they still count for journeys too.
 */
export function evaluateQuest(q: Quest, toRuns: Activity[], fromRuns: Activity[], now = Date.now()): QuestEvaluation {
  const iso = (t: number) => new Date(t).toISOString();
  if (q.status === 'offered') {
    return now - Date.parse(q.createdAt) > OFFER_TTL_DAYS * DAY ? { status: 'expired', resolvedAt: iso(now) } : { status: 'offered' };
  }
  if (q.status !== 'accepted' || !q.startsAt || !q.endsAt) return { status: q.status, progress: q.progress, resolvedAt: q.resolvedAt, winnerUid: q.winnerUid };

  const start = Date.parse(q.startsAt);
  const end = Date.parse(q.endsAt);
  const over = now >= end;
  const mine = inWindow(toRuns, start, end);
  const updatedAt = iso(now);
  const toUid = q.to.uid;

  switch (q.type) {
    case 'distance': {
      const target = q.params.distanceM!;
      const c = crossing(mine, target);
      const progress = { value: c.total, target, updatedAt };
      if (c.at !== undefined) return { status: 'won', progress, resolvedAt: iso(c.at), winnerUid: toUid };
      return over ? { status: 'lost', progress, resolvedAt: iso(end) } : { status: 'accepted', progress };
    }
    case 'habit': {
      const need = q.params.runsPerWeek!;
      const weeks = Math.max(1, Math.round((end - start) / WEEK));
      let met = 0;
      let failedAt: number | undefined;
      let wonAt: number | undefined;
      let weekRuns = 0;
      for (let w = 0; w < weeks; w++) {
        const ws = start + w * WEEK;
        const we = Math.min(start + (w + 1) * WEEK, end);
        const runs = mine.filter((r) => r.t >= ws && r.t < we);
        if (now >= ws && now < we) weekRuns = runs.length;
        if (runs.length >= need) {
          met++;
          if (met === weeks) wonAt = runs[need - 1].t;
        } else if (now >= we && failedAt === undefined) failedAt = we;
      }
      const progress = { value: met, target: weeks, weekRuns, updatedAt };
      if (failedAt !== undefined) return { status: 'lost', progress, resolvedAt: iso(failedAt) };
      if (wonAt !== undefined) return { status: 'won', progress, resolvedAt: iso(wonAt), winnerUid: toUid };
      return over ? { status: 'lost', progress, resolvedAt: iso(end) } : { status: 'accepted', progress };
    }
    case 'race': {
      const target = q.params.distanceM!;
      const me = crossing(mine, target);
      const rival = crossing(inWindow(fromRuns, start, end), target);
      const progress = { value: me.total, target, rival: rival.total, updatedAt };
      if (me.at !== undefined && (rival.at === undefined || me.at <= rival.at)) return { status: 'won', progress, resolvedAt: iso(me.at), winnerUid: toUid };
      if (rival.at !== undefined) return { status: 'lost', progress, resolvedAt: iso(rival.at), winnerUid: q.from.uid };
      return over ? { status: 'expired', progress, resolvedAt: iso(end) } : { status: 'accepted', progress };
    }
    case 'speed': {
      const d = q.params.distanceM!;
      const limit = q.params.timeS!;
      // a run at least that long, at an average pace that covers the distance within the time
      const tries = mine.filter((r) => r.a.distanceM >= d && r.a.movingTimeS > 0).map((r) => ({ t: r.t, s: (r.a.movingTimeS * d) / r.a.distanceM }));
      const best = tries.length ? Math.min(...tries.map((x) => x.s)) : undefined;
      const hit = tries.find((x) => x.s <= limit);
      const progress = { value: hit ? 1 : 0, target: 1, bestS: best, updatedAt };
      if (hit) return { status: 'won', progress, resolvedAt: iso(hit.t), winnerUid: toUid };
      return over ? { status: 'lost', progress, resolvedAt: iso(end) } : { status: 'accepted', progress };
    }
  }
}

/** Fraction done (0–1), for progress bars and the branch on the map. */
export function questFraction(q: Pick<Quest, 'type' | 'status' | 'progress'>): number {
  if (q.status === 'won') return 1;
  const p = q.progress;
  if (!p || !p.target) return 0;
  return Math.max(0, Math.min(1, p.value / p.target));
}

export const isFinished = (s: QuestStatus) => s === 'won' || s === 'lost' || s === 'expired' || s === 'declined' || s === 'cancelled';

const km = (m: number, lang: string) => `${(m / 1000).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 1 })} km`;
export const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

/** Short title of a quest, e.g. "50 km in 14 days" (English or German). */
export function questTitle(q: Pick<Quest, 'type' | 'params' | 'days'>, lang = 'en'): string {
  const de = lang === 'de';
  const p = q.params;
  switch (q.type) {
    case 'distance':
      return de ? `${km(p.distanceM!, lang)} in ${q.days} Tagen` : `${km(p.distanceM!, lang)} in ${q.days} days`;
    case 'habit': {
      const w = Math.round(q.days / 7);
      return de ? `${p.runsPerWeek}× pro Woche, ${w} ${w === 1 ? 'Woche' : 'Wochen'} lang` : `${p.runsPerWeek} runs a week for ${w} ${w === 1 ? 'week' : 'weeks'}`;
    }
    case 'race':
      return de ? `Wer zuerst ${km(p.distanceM!, lang)} schafft` : `First to ${km(p.distanceM!, lang)}`;
    case 'speed':
      return de ? `${km(p.distanceM!, lang)} unter ${clock(p.timeS!)}` : `${km(p.distanceM!, lang)} under ${clock(p.timeS!)}`;
  }
}
