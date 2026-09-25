import type { Activity, Challenge, Journey } from './types.js';

/** Effort-km rule: every 100 m of ascent counts as 1 km extra. */
export const EFFORT_M_PER_M_ASCENT = 10;

export interface ProgressEntry {
  key: string;
  date: string; // ISO (local wall-clock for Strava, YYYY-MM-DD for manual)
  label: string;
  sportType?: string;
  source: 'strava' | 'manual';
  activityId?: number;
  manualId?: string;
  distanceM: number;
  elevationGainM?: number;
  movingTimeS?: number;
  /** Distance credited to the journey (distance + climbing bonus when effort km are on). */
  countedM: number;
  /** Position along the route before / after this entry (capped at the total). */
  startM: number;
  cumulativeM: number;
  excluded?: boolean;
}

export interface GoalStatus {
  date: string;
  daysLeft: number;
  /** Weekly distance needed from now on to arrive by the goal date. */
  requiredWeeklyM: number;
  onTrack: boolean;
}

export interface ChallengeStatus extends Challenge {
  achieved: boolean;
  achievedOn?: string;
  remainingM: number;
  daysLeft: number;
  expired: boolean;
}

export interface Streaks {
  /** Consecutive weeks (Mon–Sun) with at least one counted activity, up to this or last week. */
  weeks: number;
  bestWeeks: number;
  /** Consecutive days with activity, up to today or yesterday. */
  days: number;
}

export interface Records {
  longest?: { distanceM: number; date: string; label: string };
  /** Fastest average pace (s/km) over an activity of at least 3 km. */
  fastestPace?: { secPerKm: number; date: string; label: string };
  bestWeek?: { distanceM: number; weekStart: string };
  climbedM: number;
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
  goal?: GoalStatus;
  challenges: ChallengeStatus[];
  streaks: Streaks;
  records: Records;
}

const DAY = 86_400_000;

export function localDate(iso: string): string {
  return iso.slice(0, 10);
}

const dayStart = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`);
const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Monday of the week containing `d` (local time), as YYYY-MM-DD. */
export function weekStart(d: Date): string {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return toIsoDate(m);
}

function streaksFor(entries: ProgressEntry[], now: Date): Streaks {
  const days = new Set(entries.map((e) => localDate(e.date)));
  const weeks = new Set([...days].map((d) => weekStart(dayStart(d))));

  let dayStreak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(toIsoDate(cursor))) cursor.setDate(cursor.getDate() - 1); // today may still come
  while (days.has(toIsoDate(cursor))) {
    dayStreak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const weekCursor = dayStart(weekStart(now));
  if (!weeks.has(toIsoDate(weekCursor))) weekCursor.setDate(weekCursor.getDate() - 7);
  let weekStreak = 0;
  while (weeks.has(toIsoDate(weekCursor))) {
    weekStreak++;
    weekCursor.setDate(weekCursor.getDate() - 7);
  }

  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const w of [...weeks].sort()) {
    const d = dayStart(w);
    run = prev && Math.round((d.getTime() - prev.getTime()) / (7 * DAY)) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { weeks: weekStreak, bestWeeks: best, days: dayStreak };
}

function recordsFor(entries: ProgressEntry[]): Records {
  const r: Records = { climbedM: 0 };
  const perWeek = new Map<string, number>();
  for (const e of entries) {
    r.climbedM += e.elevationGainM ?? 0;
    if (!r.longest || e.distanceM > r.longest.distanceM) r.longest = { distanceM: e.distanceM, date: e.date, label: e.label };
    if (e.movingTimeS && e.distanceM >= 3000) {
      const pace = e.movingTimeS / (e.distanceM / 1000);
      if (!r.fastestPace || pace < r.fastestPace.secPerKm) r.fastestPace = { secPerKm: pace, date: e.date, label: e.label };
    }
    const w = weekStart(dayStart(e.date));
    perWeek.set(w, (perWeek.get(w) ?? 0) + e.distanceM);
  }
  for (const [w, m] of perWeek) if (!r.bestWeek || m > r.bestWeek.distanceM) r.bestWeek = { distanceM: m, weekStart: w };
  return r;
}

export function computeProgress(journey: Journey, activities: Activity[] | undefined, now = new Date()): Progress {
  const totalM = journey.route.totalM;
  const excluded = new Set(journey.excludedActivityIds);
  const effort = journey.countElevation === true;
  const raw: Omit<ProgressEntry, 'cumulativeM' | 'startM' | 'countedM'>[] = [];

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
        elevationGainM: a.elevationGainM,
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
      elevationGainM: m.elevationGainM,
      movingTimeS: m.movingTimeS,
    });
  }
  raw.sort((a, b) => a.date.localeCompare(b.date));

  let logged = 0;
  let finishedOn: string | undefined;
  const entries: ProgressEntry[] = raw.map((e) => {
    const countedM = e.distanceM + (effort ? (e.elevationGainM ?? 0) * EFFORT_M_PER_M_ASCENT : 0);
    const startM = Math.min(logged, totalM);
    if (!e.excluded) logged += countedM;
    if (!finishedOn && totalM > 0 && logged >= totalM) finishedOn = e.date;
    return { ...e, countedM, startM, cumulativeM: Math.min(logged, totalM) };
  });
  const counted = entries.filter((e) => !e.excluded);

  const doneM = Math.min(logged, totalM);
  const start = new Date(`${journey.startDate}T00:00:00`);
  const windowStart = new Date(Math.max(start.getTime(), now.getTime() - 28 * DAY));
  const windowDays = Math.max(7, (now.getTime() - windowStart.getTime()) / DAY);
  const windowM = counted
    .filter((e) => new Date(e.date.length === 10 ? `${e.date}T12:00:00` : e.date) >= windowStart)
    .reduce((s, e) => s + e.countedM, 0);
  const weeklyAvgM = (windowM / windowDays) * 7;

  const remainingM = Math.max(0, totalM - doneM);
  const finished = totalM > 0 && remainingM === 0;
  const eta = !finished && weeklyAvgM > 0 ? new Date(now.getTime() + (remainingM / weeklyAvgM) * 7 * DAY) : undefined;

  let goal: GoalStatus | undefined;
  if (journey.goalDate) {
    const end = new Date(`${journey.goalDate}T23:59:59`);
    const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY));
    const requiredWeeklyM = finished ? 0 : daysLeft > 0 ? remainingM / (daysLeft / 7) : Infinity;
    goal = {
      date: journey.goalDate,
      daysLeft,
      requiredWeeklyM,
      onTrack: finished || (daysLeft > 0 && weeklyAvgM >= requiredWeeklyM),
    };
  }

  const challenges: ChallengeStatus[] = (journey.challenges ?? []).map((c) => {
    const target = Math.min(c.targetM, totalM);
    const hit = counted.find((e) => e.cumulativeM >= target);
    const achieved = doneM >= target;
    const end = new Date(`${c.deadline}T23:59:59`);
    const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY));
    return {
      ...c,
      achieved,
      achievedOn: achieved ? hit?.date : undefined,
      remainingM: Math.max(0, target - doneM),
      daysLeft,
      expired: !achieved && end.getTime() < now.getTime(),
    };
  });

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
    goal,
    challenges,
    streaks: streaksFor(counted, now),
    records: recordsFor(counted),
  };
}
