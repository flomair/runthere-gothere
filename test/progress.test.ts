import { describe, expect, it } from 'vitest';
import { computeProgress } from '../src/lib/progress';
import type { Activity, Journey } from '../src/lib/types';

const journey = (over: Partial<Journey> = {}): Journey => ({
  id: 'j1',
  name: 'Test',
  createdAt: '2026-09-01T00:00:00Z',
  startDate: '2026-09-01',
  sportTypes: ['Run'],
  useStrava: true,
  manualEntries: [],
  excludedActivityIds: [],
  waypoints: [],
  mode: 'foot',
  route: { points: [[0, 0], [0, 1]], totalM: 100_000, provider: 'test' },
  ...over,
});

const act = (id: number, date: string, km: number, sportType = 'Run'): Activity => ({
  id,
  name: `Run ${id}`,
  sportType,
  distanceM: km * 1000,
  movingTimeS: km * 300,
  elevationGainM: 0,
  startDate: `${date}T06:00:00Z`,
  startDateLocal: `${date}T08:00:00Z`,
});

describe('computeProgress', () => {
  const now = new Date('2026-09-22T12:00:00');

  it('sums matching activities after the start date', () => {
    const p = computeProgress(
      journey(),
      [act(1, '2026-08-30', 10), act(2, '2026-09-02', 10), act(3, '2026-09-05', 5, 'Ride'), act(4, '2026-09-10', 12)],
      now,
    );
    expect(p.doneM).toBe(22_000);
    expect(p.entries.map((e) => e.activityId)).toEqual([2, 4]);
    expect(p.entries[1].cumulativeM).toBe(22_000);
    expect(p.fraction).toBeCloseTo(0.22);
    expect(p.finished).toBe(false);
    expect(p.eta).toBeInstanceOf(Date);
    expect(p.eta!.getTime()).toBeGreaterThan(now.getTime());
  });

  it('respects exclusions, manual entries and ignores Strava when disabled', () => {
    const j = journey({
      excludedActivityIds: [2],
      manualEntries: [{ id: 'm', date: '2026-09-03', distanceM: 4000 }],
    });
    const p = computeProgress(j, [act(2, '2026-09-02', 10), act(4, '2026-09-10', 12)], now);
    expect(p.doneM).toBe(16_000);
    expect(p.entries.find((e) => e.activityId === 2)?.excluded).toBe(true);

    const off = computeProgress({ ...j, useStrava: false }, [act(4, '2026-09-10', 12)], now);
    expect(off.doneM).toBe(4000);
  });

  it('caps at the total and records the finishing day', () => {
    const p = computeProgress(journey(), [act(1, '2026-09-02', 60), act(2, '2026-09-09', 60), act(3, '2026-09-12', 5)], now);
    expect(p.doneM).toBe(100_000);
    expect(p.loggedM).toBe(125_000);
    expect(p.finished).toBe(true);
    expect(p.finishedOn?.slice(0, 10)).toBe('2026-09-09');
    expect(p.eta).toBeUndefined();
  });
});

describe('goals, challenges, streaks, records', () => {
  const now = new Date('2026-09-23T12:00:00'); // Wednesday

  it('counts climbing as effort km when enabled', () => {
    const a = { ...act(1, '2026-09-02', 10), elevationGainM: 300 };
    expect(computeProgress(journey(), [a], now).doneM).toBe(10_000);
    const p = computeProgress(journey({ countElevation: true }), [a], now);
    expect(p.doneM).toBe(13_000);
    expect(p.entries[0]).toMatchObject({ startM: 0, cumulativeM: 13_000, countedM: 13_000 });
  });

  it('computes the weekly distance needed for the goal date', () => {
    const p = computeProgress(journey({ goalDate: '2026-10-21' }), [act(1, '2026-09-20', 30)], now);
    expect(p.goal?.daysLeft).toBe(29);
    expect(p.goal!.requiredWeeklyM / 1000).toBeCloseTo(70 / (29 / 7), 1);
    expect(p.goal?.onTrack).toBe(false);
    const easy = computeProgress(journey({ goalDate: '2027-06-01' }), [act(1, '2026-09-20', 30)], now);
    expect(easy.goal?.onTrack).toBe(true);
  });

  it('tracks challenges', () => {
    const challenges = [
      { id: 'a', title: 'Reach km 20', targetM: 20_000, deadline: '2026-09-30', createdAt: '2026-09-01' },
      { id: 'b', title: 'Reach km 90', targetM: 90_000, deadline: '2026-09-10', createdAt: '2026-09-01' },
    ];
    const p = computeProgress(journey({ challenges }), [act(1, '2026-09-05', 12), act(2, '2026-09-12', 12)], now);
    expect(p.challenges[0]).toMatchObject({ achieved: true, remainingM: 0 });
    expect(p.challenges[0].achievedOn?.slice(0, 10)).toBe('2026-09-12');
    expect(p.challenges[1]).toMatchObject({ achieved: false, expired: true, remainingM: 66_000 });
  });

  it('computes streaks and personal records', () => {
    const acts = [
      act(1, '2026-09-01', 5), // week of Aug 31
      act(2, '2026-09-08', 8), // week of Sep 7
      act(3, '2026-09-15', 21), // week of Sep 14
      act(4, '2026-09-21', 6), // week of Sep 21 (this week), Mon
      act(5, '2026-09-22', 4), // Tue
    ];
    const p = computeProgress(journey(), acts, now);
    expect(p.streaks).toEqual({ weeks: 4, bestWeeks: 4, days: 2 });
    expect(p.records.longest?.distanceM).toBe(21_000);
    expect(p.records.bestWeek).toEqual({ distanceM: 21_000, weekStart: '2026-09-14' });
    expect(p.records.fastestPace?.secPerKm).toBeCloseTo(300, 5);
  });
});
