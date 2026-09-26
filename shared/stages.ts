import type { Activity, Stage, StageResult } from './types.js';

const DAY = 86_400_000;
/** Fairness guard: nobody's baseline counts as less than this per week. */
export const MIN_BASELINE_M = 5000;
export const BASELINE_DAYS = 28;

const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) => toDay(dayMs(d) + n * DAY);
/** Local calendar day of an activity (the runner's own time zone). */
const dayOf = (a: Activity) => (a.startDateLocal || a.startDate).slice(0, 10);

/** Tracked activities of the group's sports (manual Strava entries don't count). */
export const counts = (a: Activity, sportTypes: string[]) => !a.manual && sportTypes.includes(a.sportType);

export const stageDays = (s: Pick<Stage, 'startDate' | 'endDate'>) => Math.round((dayMs(s.endDate) - dayMs(s.startDate)) / DAY) + 1;

/** Average weekly distance over the 4 weeks before `startDate`. */
export function baselineFor(acts: Activity[], startDate: string, sportTypes: string[]): number {
  const from = addDays(startDate, -BASELINE_DAYS);
  const sum = acts.filter((a) => counts(a, sportTypes) && dayOf(a) >= from && dayOf(a) < startDate).reduce((s, a) => s + a.distanceM, 0);
  return sum / (BASELINE_DAYS / 7);
}

export function stageResults(s: Stage, actsByUid: Record<string, Activity[]>, sportTypes: string[], baselines: Record<string, number>): StageResult[] {
  const weeks = stageDays(s) / 7;
  return s.participants
    .map((uid) => {
      const distanceM = (actsByUid[uid] ?? []).filter((a) => counts(a, sportTypes) && dayOf(a) >= s.startDate && dayOf(a) <= s.endDate).reduce((x, a) => x + a.distanceM, 0);
      const baselineM = baselines[uid] ?? 0;
      return { uid, distanceM, baselineM, effort: distanceM / (Math.max(baselineM, MIN_BASELINE_M) * weeks) };
    })
    .sort((a, b) => b.effort - a.effort || b.distanceM - a.distanceM);
}

/**
 * Where a stage stands on `today` (YYYY-MM-DD, UTC). Pure: returns the updated stage.
 * Baselines are locked the first time the stage is seen running and never change after.
 */
export function evaluateStage(s: Stage, actsByUid: Record<string, Activity[]>, sportTypes: string[], today: string): Stage {
  if (s.status === 'finished' || s.status === 'cancelled') return s;
  if (today < s.startDate) return { ...s, status: 'scheduled' };
  const baselines = s.baselines ?? Object.fromEntries(s.participants.map((uid) => [uid, baselineFor(actsByUid[uid] ?? [], s.startDate, sportTypes)]));
  const results = stageResults(s, actsByUid, sportTypes, baselines);
  const leader = results[0] && results[0].distanceM > 0 ? results[0].uid : undefined;
  // a day of grace after the last day, so late uploads still count
  if (today > addDays(s.endDate, 1)) {
    return { ...s, baselines, results, leaderUid: leader, status: 'finished', winnerUid: leader, finishedAt: new Date(dayMs(addDays(s.endDate, 2))).toISOString() };
  }
  return { ...s, baselines, results, leaderUid: leader, status: 'running' };
}

/** Stage wins per runner (finished stages only). */
export function stageWins(stages: Stage[]): Record<string, number> {
  const wins: Record<string, number> = {};
  for (const s of stages) if (s.status === 'finished' && s.winnerUid) wins[s.winnerUid] = (wins[s.winnerUid] ?? 0) + 1;
  return wins;
}

/** Who leads the stage-wins table (several on a tie; empty before any win). */
export function bonusLeaders(stages: Stage[]): string[] {
  const wins = stageWins(stages);
  const best = Math.max(0, ...Object.values(wins));
  return best ? Object.keys(wins).filter((u) => wins[u] === best) : [];
}

export function validateStage(input: { fromM: number; toM: number; startDate: string; days: number; participants: string[] }, totalM: number, members: string[], today: string): string | null {
  if (!(input.fromM >= 0 && input.toM <= totalM + 1 && input.toM - input.fromM >= 1000)) return 'pick a segment of at least 1 km on the route';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || input.startDate < addDays(today, -1)) return 'the stage must start today or later';
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 60) return 'a stage lasts 1–60 days';
  const ps = [...new Set(input.participants)];
  if (ps.length < 2) return 'a stage needs at least two runners';
  if (ps.some((u) => !members.includes(u))) return 'only members of this shared journey can race';
  return null;
}
