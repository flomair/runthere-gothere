import type { Activity, Journey } from './types';

export interface ProgressEntry {
  key: string;
  date: string; // ISO (local wall-clock for Strava, YYYY-MM-DD for manual)
  label: string;
  sportType?: string;
  source: 'strava' | 'manual';
  activityId?: number;
  manualId?: string;
  distanceM: number;
  movingTimeS?: number;
  /** Distance along the route after this entry (capped at the total). */
  cumulativeM: number;
  excluded?: boolean;
}

export interface Progress {
  entries: ProgressEntry[];
  /** Distance covered along the route (≤ total). */
  doneM: number;
  /** Everything logged, even beyond the finish. */
  loggedM: number;
  totalM: number;
  remainingM: number;
  fraction: number;
  finished: boolean;
  finishedOn?: string;
  /** Average per week over the last 4 weeks (or since start if shorter). */
  weeklyAvgM: number;
  /** Projected finish date at the current weekly pace. */
  eta?: Date;
}

const DAY = 86_400_000;

export function localDate(iso: string): string {
  return iso.slice(0, 10);
}

export function computeProgress(journey: Journey, activities: Activity[] | undefined, now = new Date()): Progress {
  const totalM = journey.route.totalM;
  const excluded = new Set(journey.excludedActivityIds);
  const raw: Omit<ProgressEntry, 'cumulativeM'>[] = [];

  if (journey.useStrava && activities) {
    for (const a of activities) {
      if (!journey.sportTypes.includes(a.sportType)) continue;
      if (localDate(a.startDateLocal) < journey.startDate) continue;
      raw.push({
        key: `s${a.id}`,
        date: a.startDateLocal,
        label: a.name,
        sportType: a.sportType,
        source: 'strava',
        activityId: a.id,
        distanceM: a.distanceM,
        movingTimeS: a.movingTimeS,
        excluded: excluded.has(a.id),
      });
    }
  }
  for (const m of journey.manualEntries) {
    raw.push({
      key: `m${m.id}`,
      date: m.date,
      label: m.note || 'Manual entry',
      source: 'manual',
      manualId: m.id,
      distanceM: m.distanceM,
    });
  }
  raw.sort((a, b) => a.date.localeCompare(b.date));

  let logged = 0;
  let finishedOn: string | undefined;
  const entries: ProgressEntry[] = raw.map((e) => {
    if (!e.excluded) logged += e.distanceM;
    if (!finishedOn && totalM > 0 && logged >= totalM) finishedOn = e.date;
    return { ...e, cumulativeM: Math.min(logged, totalM) };
  });

  const doneM = Math.min(logged, totalM);
  const start = new Date(`${journey.startDate}T00:00:00`);
  const windowStart = new Date(Math.max(start.getTime(), now.getTime() - 28 * DAY));
  const windowDays = Math.max(7, (now.getTime() - windowStart.getTime()) / DAY);
  const windowM = entries
    .filter((e) => !e.excluded && new Date(e.date.length === 10 ? `${e.date}T12:00:00` : e.date) >= windowStart)
    .reduce((s, e) => s + e.distanceM, 0);
  const weeklyAvgM = (windowM / windowDays) * 7;

  const remainingM = Math.max(0, totalM - doneM);
  const finished = totalM > 0 && remainingM === 0;
  const eta =
    !finished && weeklyAvgM > 0 ? new Date(now.getTime() + (remainingM / weeklyAvgM) * 7 * DAY) : undefined;

  return {
    entries,
    doneM,
    loggedM: logged,
    totalM,
    remainingM,
    fraction: totalM > 0 ? doneM / totalM : 0,
    finished,
    finishedOn,
    weeklyAvgM,
    eta,
  };
}
