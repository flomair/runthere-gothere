import { type LatLon, cumulativeDistances, greatCircle, simplifyToMax } from '../shared/geo.js';
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
