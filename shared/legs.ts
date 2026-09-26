import { type LatLon, cumulativeDistances, haversine, simplifyToMax } from './geo.js';
import type { Journey, JourneyLeg, PlannedRoute, Waypoint } from './types.js';

/** Current journey data version. 2 = journeys have `legs`. */
export const JOURNEY_SCHEMA = 2;

/** Points kept per leg, so long journeys stay well below Firestore's 1 MB document limit. */
const MAX_POINTS_PER_LEG = 6000;

/**
 * Bring a journey stored by an older version up to date. Pure and idempotent: older journeys
 * become a single leg; the new shape is written back the next time the journey is saved.
 */
export function migrateJourney(j: Journey): Journey {
  if ((j.schemaVersion ?? 1) >= JOURNEY_SCHEMA && j.legs?.length) return j;
  return {
    ...j,
    schemaVersion: JOURNEY_SCHEMA,
    legs: [
      {
        id: 'leg-1',
        startM: 0,
        totalM: j.route.totalM,
        waypointIndex: 0,
        pointIndex: 0,
        mode: j.mode,
        provider: j.route.provider,
        createdAt: j.createdAt,
      },
    ],
  };
}

export const legsOf = (j: Journey): JourneyLeg[] => migrateJourney(j).legs!;
export const currentLeg = (j: Journey): JourneyLeg => legsOf(j)[legsOf(j).length - 1];

/** The leg that contains distance `m` (the last leg once you are past every finish). */
export function legAt(j: Journey, m: number): { leg: JourneyLeg; index: number } {
  const legs = legsOf(j);
  for (let i = legs.length - 1; i >= 0; i--) if (m >= legs[i].startM) return { leg: legs[i], index: i };
  return { leg: legs[0], index: 0 };
}

/** Waypoints of one leg, from its start to its destination. */
export function legWaypoints(j: Journey, index: number): Waypoint[] {
  const legs = legsOf(j);
  const from = legs[index].waypointIndex;
  const to = index + 1 < legs.length ? legs[index + 1].waypointIndex : j.waypoints.length - 1;
  return j.waypoints.slice(from, to + 1);
}

export interface WaypointPosition {
  name: string;
  /** Distance along the whole journey (true metres). */
  m: number;
  /** Destination of a leg (the final one or an earlier one). */
  legFinish: boolean;
  /** 0-based leg number the waypoint belongs to (a leg's start belongs to the previous leg). */
  leg: number;
}

/**
 * Where each waypoint sits along the journey. Leg starts and ends are exact; stops in between are
 * matched to the nearest route point *within their leg*, so routes that pass a city twice
 * (there and back) still place every stop correctly.
 */
export function waypointPositions(j0: Journey): WaypointPosition[] {
  const j = migrateJourney(j0);
  const legs = j.legs!;
  const pts = j.route.points;
  const cum = cumulativeDistances(pts);
  const scale = cum[cum.length - 1] > 0 && j.route.totalM > 0 ? cum[cum.length - 1] / j.route.totalM : 1;
  const out: WaypointPosition[] = [];
  j.waypoints.forEach((w, wi) => {
    if (wi === 0) {
      out.push({ name: w.name, m: 0, legFinish: false, leg: 0 });
      return;
    }
    // leg this waypoint belongs to: the last leg starting before it
    let li = 0;
    for (let k = 0; k < legs.length; k++) if (legs[k].waypointIndex < wi) li = k;
    const leg = legs[li];
    const lastWp = li + 1 < legs.length ? legs[li + 1].waypointIndex : j.waypoints.length - 1;
    if (wi === lastWp) {
      out.push({ name: w.name, m: leg.startM + leg.totalM, legFinish: true, leg: li });
      return;
    }
    const endPt = li + 1 < legs.length ? legs[li + 1].pointIndex : pts.length - 1;
    let best = leg.pointIndex;
    let bestD = Infinity;
    for (let k = leg.pointIndex; k <= endPt; k++) {
      const d = haversine(pts[k], [w.lat, w.lon]);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    out.push({ name: w.name, m: cum[best] / scale, legFinish: false, leg: li });
  });
  return out;
}

/** A planned route for a new or replaced leg; its first waypoint must be where the leg starts. */
export interface LegPlan {
  route: Pick<PlannedRoute, 'points' | 'totalM' | 'provider'>;
  waypoints: Waypoint[];
  mode: JourneyLeg['mode'];
}

/** "Berlin → Vienna" becomes "Berlin → Rome" when the destination moves; custom names stay. */
function renamed(j: Journey, newTarget: string): string {
  const first = j.waypoints[0]?.name;
  const last = j.waypoints[j.waypoints.length - 1]?.name;
  return first && last && j.name === `${first} → ${last}` ? `${first} → ${newTarget}` : j.name;
}

/** Continue the journey: a new leg from the current destination. Kilometres already run past it count on the new leg. */
export function appendLeg(j0: Journey, plan: LegPlan, now = new Date()): Journey {
  const j = migrateJourney(j0);
  if (plan.waypoints.length < 2 || plan.route.points.length < 2) throw new Error('a leg needs a start, a destination and a route');
  const legs = j.legs!;
  const raw = plan.route.points as LatLon[];
  const pts = raw.length > MAX_POINTS_PER_LEG ? simplifyToMax(raw, MAX_POINTS_PER_LEG) : raw;
  const leg: JourneyLeg = {
    id: `leg-${legs.length + 1}`,
    startM: j.route.totalM,
    totalM: plan.route.totalM,
    waypointIndex: j.waypoints.length - 1,
    pointIndex: j.route.points.length - 1,
    mode: plan.mode,
    provider: plan.route.provider,
    createdAt: now.toISOString(),
  };
  const target = plan.waypoints[plan.waypoints.length - 1].name;
  return {
    ...j,
    name: renamed(j, target),
    waypoints: [...j.waypoints, ...plan.waypoints.slice(1)],
    route: {
      // the new leg starts where the old one ended: don't repeat that point
      points: [...j.route.points, ...pts.slice(1)],
      totalM: j.route.totalM + plan.route.totalM,
      provider: [...new Set([...legs.map((l) => l.provider), plan.route.provider])].join(' + '),
    },
    legs: [...legs, leg],
    // the elevation profile covered the old route; it is rebuilt for the new one
    profile: undefined,
  };
}

/** Change the destination and stops of the current leg (it is planned again from its start). */
export function replaceCurrentLeg(j0: Journey, plan: LegPlan, now = new Date()): Journey {
  const j = migrateJourney(j0);
  const legs = j.legs!;
  const cur = legs[legs.length - 1];
  if (legs.length === 1) {
    // the only leg: the journey is planned again from its start
    const raw = plan.route.points as LatLon[];
    return {
      ...j,
      name: renamed(j, plan.waypoints[plan.waypoints.length - 1].name),
      waypoints: plan.waypoints,
      route: { points: raw.length > MAX_POINTS_PER_LEG ? simplifyToMax(raw, MAX_POINTS_PER_LEG) : raw, totalM: plan.route.totalM, provider: plan.route.provider },
      mode: plan.mode,
      legs: [{ ...cur, totalM: plan.route.totalM, mode: plan.mode, provider: plan.route.provider }],
      profile: undefined,
    };
  }
  const base: Journey = {
    ...j,
    waypoints: j.waypoints.slice(0, cur.waypointIndex + 1),
    route: { ...j.route, points: j.route.points.slice(0, cur.pointIndex + 1), totalM: cur.startM },
    legs: legs.slice(0, -1),
  };
  const next = appendLeg(base, plan, now);
  const newLegs = next.legs!;
  newLegs[newLegs.length - 1] = { ...newLegs[newLegs.length - 1], id: cur.id };
  return {
    ...next,
    // renaming is judged against the destination before the change
    name: renamed(j, plan.waypoints[plan.waypoints.length - 1].name),
    legs: newLegs,
  };
}
