import { describe, expect, it } from 'vitest';
import { type LatLon, cumulativeDistances } from '../shared/geo';
import { JOURNEY_SCHEMA, appendLeg, currentLeg, legAt, legWaypoints, migrateJourney, replaceCurrentLeg, waypointPositions } from '../shared/legs';
import { computeProgress } from '../shared/progress';
import type { Journey, Waypoint } from '../shared/types';
import { milestoneCandidates } from '../server/milestones';
import { memoryRepo } from '../server/repo-memory';
import { toStored } from '../server/repo';

const W = (name: string, lat: number, lon: number): Waypoint => ({ name, lat, lon });
const BERLIN = W('Berlin', 52.52, 13.405);
const DRESDEN = W('Dresden', 51.05, 13.74);
const PRAGUE = W('Prague', 50.075, 14.437);
const VIENNA = W('Vienna', 48.208, 16.373);
const BRNO = W('Brno', 49.195, 16.608);

/** Straight-ish line through the given places, one point per ~2 km. */
function line(...wps: Waypoint[]): { points: LatLon[]; totalM: number; provider: string } {
  const pts: LatLon[] = [];
  for (let i = 1; i < wps.length; i++) {
    for (let t = 0; t < 60; t++) pts.push([wps[i - 1].lat + ((wps[i].lat - wps[i - 1].lat) * t) / 60, wps[i - 1].lon + ((wps[i].lon - wps[i - 1].lon) * t) / 60]);
  }
  pts.push([wps[wps.length - 1].lat, wps[wps.length - 1].lon]);
  return { points: pts, totalM: cumulativeDistances(pts).at(-1)!, provider: 'test' };
}

/** A journey as stored before legs existed. */
function oldJourney(): Journey {
  return {
    id: 'j1',
    name: 'Berlin → Prague',
    createdAt: '2026-01-01T00:00:00Z',
    startDate: '2026-01-01',
    sportTypes: ['Run'],
    useStrava: false,
    manualEntries: [],
    excludedActivityIds: [],
    waypoints: [BERLIN, DRESDEN, PRAGUE],
    mode: 'foot',
    route: line(BERLIN, DRESDEN, PRAGUE),
    profile: { stepM: 1000, elevations: [1, 2, 3] },
  };
}

const run = (km: number, date = '2026-02-01') => ({ id: `r${km}${date}`, date, distanceM: km * 1000 });

describe('journey migration', () => {
  it('turns an old journey into a single leg without touching its route', () => {
    const old = oldJourney();
    const j = migrateJourney(old);
    expect(j.schemaVersion).toBe(JOURNEY_SCHEMA);
    expect(j.legs).toEqual([{ id: 'leg-1', startM: 0, totalM: old.route.totalM, waypointIndex: 0, pointIndex: 0, mode: 'foot', provider: 'test', createdAt: old.createdAt }]);
    expect(j.route).toBe(old.route);
    expect(j.waypoints).toBe(old.waypoints);
    expect(migrateJourney(j)).toBe(j); // idempotent
  });

  it('migrates journeys read from the database', async () => {
    const repo = memoryRepo();
    const { legs: _l, schemaVersion: _s, ...stored } = oldJourney() as Journey;
    await repo.putJourney('u1', stored as Journey);
    const [j] = await repo.listJourneys('u1');
    expect(j.legs).toHaveLength(1);
    expect(j.schemaVersion).toBe(JOURNEY_SCHEMA);
    expect(toStored(j).route.totalM).toBeCloseTo(stored.route.totalM);
  });
});

describe('continuing a journey (legs)', () => {
  const leg2 = { route: line(PRAGUE, BRNO, VIENNA), waypoints: [PRAGUE, BRNO, VIENNA], mode: 'hike' as const };

  it('appends a leg as one continuous line', () => {
    const before = migrateJourney(oldJourney());
    const j = appendLeg(before, leg2, new Date('2026-03-01T00:00:00Z'));
    expect(j.waypoints.map((w) => w.name)).toEqual(['Berlin', 'Dresden', 'Prague', 'Brno', 'Vienna']);
    // the joint point is not repeated
    expect(j.route.points).toHaveLength(before.route.points.length + leg2.route.points.length - 1);
    expect(j.route.totalM).toBeCloseTo(before.route.totalM + leg2.route.totalM);
    expect(j.legs).toHaveLength(2);
    expect(currentLeg(j)).toMatchObject({ id: 'leg-2', startM: before.route.totalM, waypointIndex: 2, pointIndex: before.route.points.length - 1, mode: 'hike' });
    expect(legWaypoints(j, 0).map((w) => w.name)).toEqual(['Berlin', 'Dresden', 'Prague']);
    expect(legWaypoints(j, 1).map((w) => w.name)).toEqual(['Prague', 'Brno', 'Vienna']);
    expect(legAt(j, before.route.totalM + 1).index).toBe(1);
    expect(j.name).toBe('Berlin → Vienna');
    expect(j.profile).toBeUndefined();
  });

  it('keeps a custom name', () => {
    const j = appendLeg({ ...oldJourney(), name: 'My big run' }, leg2);
    expect(j.name).toBe('My big run');
  });

  it('carries kilometres run past the old destination over to the new leg', () => {
    const first = migrateJourney(oldJourney());
    const km = Math.round((first.route.totalM * 1.2) / 1000);
    const withRuns = { ...first, manualEntries: [run(km)] };
    const p1 = computeProgress(withRuns, []);
    expect(p1.finished).toBe(true);
    expect(p1.doneM).toBeCloseTo(first.route.totalM);

    const p2 = computeProgress(appendLeg(withRuns, leg2), []);
    expect(p2.finished).toBe(false);
    expect(p2.doneM).toBeCloseTo(km * 1000); // nothing lost: all km count on the continuous line
  });

  it('changes the destination of the current leg only', () => {
    const two = appendLeg(oldJourney(), leg2);
    const changed = replaceCurrentLeg(two, { route: line(PRAGUE, BRNO), waypoints: [PRAGUE, BRNO], mode: 'foot' });
    expect(changed.waypoints.map((w) => w.name)).toEqual(['Berlin', 'Dresden', 'Prague', 'Brno']);
    expect(changed.legs).toHaveLength(2);
    expect(changed.legs![0]).toEqual(two.legs![0]);
    expect(currentLeg(changed)).toMatchObject({ id: 'leg-2', startM: two.legs![1].startM });
    expect(changed.name).toBe('Berlin → Brno');

    const single = replaceCurrentLeg(oldJourney(), { route: line(BERLIN, VIENNA), waypoints: [BERLIN, VIENNA], mode: 'bike' });
    expect(single.waypoints.map((w) => w.name)).toEqual(['Berlin', 'Vienna']);
    expect(single.legs).toHaveLength(1);
    expect(single.mode).toBe('bike');
    expect(single.route.points[0]).toEqual([BERLIN.lat, BERLIN.lon]);
  });
});

describe('waypoint positions and milestones across legs', () => {
  it('places each stop within its own leg, even on a there-and-back route', () => {
    // leg 1: Berlin → Prague via Dresden; leg 2: back to Berlin via Dresden again
    const j = appendLeg(oldJourney(), { route: line(PRAGUE, DRESDEN, BERLIN), waypoints: [PRAGUE, DRESDEN, BERLIN], mode: 'foot' });
    const pos = waypointPositions(j);
    const leg1 = j.legs![0].totalM;
    expect(pos.map((p) => p.name)).toEqual(['Berlin', 'Dresden', 'Prague', 'Dresden', 'Berlin']);
    expect(pos[1].m).toBeLessThan(leg1); // first visit of Dresden, in leg 1
    expect(pos[2]).toMatchObject({ legFinish: true, leg: 0 });
    expect(pos[2].m).toBeCloseTo(leg1);
    expect(pos[3].m).toBeGreaterThan(leg1); // second visit, in leg 2
    expect(pos[4].m).toBeCloseTo(j.route.totalM);
  });

  it('keeps the first destination as "finish" and adds a new finish for the next leg', () => {
    const one = migrateJourney(oldJourney());
    const keysBefore = milestoneCandidates(one).filter((c) => c.kind !== 'border' && c.kind !== 'distance').map((c) => c.key);
    expect(keysBefore).toEqual(['half', 'wp1', 'finish']);

    const two = appendLeg(one, { route: line(PRAGUE, BRNO, VIENNA), waypoints: [PRAGUE, BRNO, VIENNA], mode: 'foot' });
    const cands = milestoneCandidates(two).filter((c) => c.kind === 'waypoint' || c.kind === 'finish');
    expect(cands.map((c) => [c.key, c.kind, c.title])).toEqual([
      ['wp1', 'waypoint', 'Arrived in Dresden'],
      ['finish', 'finish', 'You made it to Prague!'],
      ['wp3', 'waypoint', 'Arrived in Brno'],
      ['finish-2', 'finish', 'You made it to Vienna!'],
    ]);
    expect(cands[1].atM).toBeCloseTo(one.route.totalM);
  });
});
