import { type LatLon, cumulativeDistances, greatCircle, haversine, simplifyToMax } from '../shared/geo.js';
import { fetchJson } from './http.js';
import type { RouteMode, PlannedRoute } from '../shared/types.js';
export type { RouteMode, PlannedRoute };

/** Keep stored routes small enough for localStorage while staying visually accurate. */
const MAX_POINTS = 4000;

interface OsrmResponse {
  code: string;
  message?: string;
  routes?: { distance: number; geometry: { coordinates: [number, number][] } }[];
}

async function osrm(profile: 'routed-foot' | 'routed-bike', waypoints: LatLon[]): Promise<LatLon[]> {
  const coords = waypoints.map(([la, lo]) => `${lo.toFixed(6)},${la.toFixed(6)}`).join(';');
  const url = `https://routing.openstreetmap.de/${profile}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const r = await fetchJson<OsrmResponse>(url, { timeoutMs: 25_000 });
  if (r.code !== 'Ok' || !r.routes?.length) throw new Error(`OSRM: ${r.message ?? r.code}`);
  return r.routes[0].geometry.coordinates.map(([lo, la]) => [la, lo]);
}

interface BRouterResponse {
  features?: { geometry: { coordinates: number[][] } }[];
}

async function brouter(profile: string, waypoints: LatLon[]): Promise<LatLon[]> {
  const lonlats = waypoints.map(([la, lo]) => `${lo.toFixed(6)},${la.toFixed(6)}`).join('|');
  const url = `https://brouter.de/brouter?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`;
  const r = await fetchJson<BRouterResponse>(url, { timeoutMs: 25_000 });
  const c = r.features?.[0]?.geometry.coordinates;
  if (!c?.length) throw new Error('BRouter returned no route');
  return c.map(([lo, la]) => [la, lo]);
}

/** Join consecutive leg geometries, dropping the duplicated joint points. */
function concatLegs(legs: LatLon[][]): LatLon[] {
  const out: LatLon[] = [];
  for (const leg of legs) out.push(...(out.length ? leg.slice(1) : leg));
  return out;
}

/**
 * Split waypoint pairs that are further apart than `maxLegM` by inserting points along the great
 * circle, so each request stays small enough for public routers that struggle with long routes.
 */
export function legsFor(waypoints: LatLon[], maxLegM: number): LatLon[][] {
  const legs: LatLon[][] = [];
  for (let i = 1; i < waypoints.length; i++) {
    const [a, b] = [waypoints[i - 1], waypoints[i]];
    const n = Math.max(1, Math.ceil(haversine(a, b) / maxLegM));
    const gc = n > 1 ? greatCircle(a, b, haversine(a, b) / n) : [a, b];
    // keep the user's exact waypoints at the section boundaries
    gc[0] = a;
    gc[gc.length - 1] = b;
    for (let k = 1; k < gc.length; k++) legs.push([gc[k - 1], gc[k]]);
  }
  return legs;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const HIKE_LEG_M = 120_000;

/**
 * Hiking-trail routing: BRouter's hiking profile prefers waymarked hiking routes (route=hiking
 * relations) and paths. Long routes are split into legs of ≤120 km and routed in parallel;
 * a leg BRouter can't solve falls back to the OSRM foot router so the journey still connects.
 */
async function hikingRoute(waypoints: LatLon[]): Promise<{ points: LatLon[]; fallbackLegs: number; legs: number }> {
  const direct1 = waypoints.length === 2 && haversine(waypoints[0], waypoints[1]) <= HIKE_LEG_M;
  const legs = direct1 ? [waypoints] : legsFor(waypoints, HIKE_LEG_M);
  let fallbackLegs = 0;
  const parts = await mapLimit(legs, 4, async (leg) => {
    try {
      return await brouter('hiking-mountain', leg);
    } catch {
      fallbackLegs++;
      return osrm('routed-foot', leg);
    }
  });
  return { points: concatLegs(parts), fallbackLegs, legs: legs.length };
}

function direct(waypoints: LatLon[]): LatLon[] {
  const out: LatLon[] = [];
  for (let i = 1; i < waypoints.length; i++) {
    const seg = greatCircle(waypoints[i - 1], waypoints[i]);
    out.push(...(i === 1 ? seg : seg.slice(1)));
  }
  return out.length ? out : waypoints.slice();
}

export function finalizeRoute(raw: LatLon[], provider: string, notice?: string): PlannedRoute {
  // total distance is measured on the full-resolution geometry, then the stored line is simplified
  const cum = cumulativeDistances(raw);
  const points = simplifyToMax(raw, MAX_POINTS);
  return { points, totalM: cum[cum.length - 1] ?? 0, provider, notice };
}

export async function planRoute(waypoints: LatLon[], mode: RouteMode): Promise<PlannedRoute> {
  if (mode === 'direct') return finalizeRoute(direct(waypoints), 'Great circle (as the crow flies)');

  if (mode === 'hike') {
    try {
      const r = await hikingRoute(waypoints);
      const sections = r.legs > 1 ? ` in ${r.legs} sections` : '';
      return finalizeRoute(
        r.points,
        `BRouter hiking trails${sections}`,
        r.fallbackLegs ? `${r.fallbackLegs} of ${r.legs} sections had no hiking-trail route and use regular footpaths.` : undefined,
      );
    } catch (e) {
      return planRoute(waypoints, 'foot').then((r) => ({
        ...r,
        notice: `Hiking-trail routing unavailable (${e instanceof Error ? e.message : e}); using footpaths instead.`,
      }));
    }
  }

  const attempts: [string, () => Promise<LatLon[]>][] =
    mode === 'bike'
      ? [
          ['OSRM bike · routing.openstreetmap.de', () => osrm('routed-bike', waypoints)],
          ['BRouter trekking', () => brouter('trekking', waypoints)],
        ]
      : [
          ['OSRM foot · routing.openstreetmap.de', () => osrm('routed-foot', waypoints)],
          ['BRouter hiking', () => brouter('hiking-mountain', waypoints)],
        ];

  const errors: string[] = [];
  for (const [provider, run] of attempts) {
    try {
      return finalizeRoute(await run(), provider, errors.length ? `Fallback used (${errors.join('; ')})` : undefined);
    } catch (e) {
      errors.push(`${provider}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return finalizeRoute(
    direct(waypoints),
    'Great circle (as the crow flies)',
    `Road routing unavailable, using a straight line. ${errors.join('; ')}`,
  );
}
