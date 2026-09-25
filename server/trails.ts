import { type LatLon, chainLines } from '../shared/geo.js';
import type { PlannedRoute, TrailRoute, TrailSearchResult } from '../shared/types.js';
import { HttpError, fetchJson } from './http.js';
import { reverseGeocode } from './places.js';
import { finalizeRoute } from './routing.js';

export type { TrailRoute, TrailSearchResult };

const WAYMARKED = 'https://hiking.waymarkedtrails.org/api/v1';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

const GROUP_LABEL: Record<string, string> = {
  INT: 'International',
  NAT: 'National',
  REG: 'Regional',
  LOC: 'Local',
};

interface WaymarkedItem {
  type?: string;
  id?: number;
  name?: string;
  ref?: string;
  group?: string;
  itinerary?: string[];
}

/** Waymarked Trails search: OSM hiking route relations by name or ref. */
async function searchWaymarked(q: string): Promise<TrailSearchResult[]> {
  const u = new URL(`${WAYMARKED}/list/search`);
  u.searchParams.set('query', q);
  u.searchParams.set('limit', '12');
  const r = await fetchJson<{ results?: WaymarkedItem[] }>(u.toString());
  return (r.results ?? [])
    .filter((x) => x.id && (x.type ?? 'relation') === 'relation' && x.name)
    .map((x) => ({
      osmId: x.id!,
      name: x.name!,
      ref: x.ref || undefined,
      network: x.group ? (GROUP_LABEL[x.group] ?? x.group) : undefined,
      itinerary: x.itinerary?.length ? x.itinerary.join(' – ') : undefined,
      source: 'waymarked' as const,
    }));
}

interface NominatimItem {
  osm_type: string;
  osm_id: number;
  name?: string;
  display_name: string;
  category?: string;
  type?: string;
}

/** Fallback search: Nominatim knows named route relations too. */
async function searchNominatim(q: string): Promise<TrailSearchResult[]> {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('q', q);
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('limit', '20');
  const rows = await fetchJson<NominatimItem[]>(u.toString());
  return rows
    .filter((r) => r.osm_type === 'relation' && (r.category === 'route' || r.type === 'hiking' || r.type === 'foot'))
    .map((r) => ({
      osmId: r.osm_id,
      name: r.name || r.display_name.split(',')[0],
      itinerary: r.display_name,
      source: 'nominatim' as const,
    }));
}

export async function searchTrails(q: string): Promise<TrailSearchResult[]> {
  try {
    const r = await searchWaymarked(q);
    if (r.length) return r;
  } catch {
    /* fall through to Nominatim */
  }
  return searchNominatim(q);
}

interface OverpassResponse {
  elements: (
    | { type: 'way'; id: number; geometry?: { lat: number; lon: number }[] }
    | { type: 'relation'; id: number; tags?: Record<string, string> }
    | { type: 'node'; id: number }
  )[];
}

/**
 * Load the full geometry of an OSM route relation (including member relations of super-routes
 * such as the E-paths or Camino variants) and chain it into one line.
 */
export async function loadTrail(osmId: number, reverse: boolean): Promise<TrailRoute> {
  const query = `[out:json][timeout:90];relation(${osmId});out tags;relation(${osmId});(._;>>;);way._;out geom;`;
  const r = await fetchJson<OverpassResponse>(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }),
    timeoutMs: 55_000,
  });
  const rel = r.elements.find((e) => e.type === 'relation' && e.id === osmId) as
    | { tags?: Record<string, string> }
    | undefined;
  const lines: LatLon[][] = [];
  for (const e of r.elements) {
    if (e.type === 'way' && e.geometry?.length) lines.push(e.geometry.map((g) => [g.lat, g.lon] as LatLon));
  }
  if (!lines.length) throw new HttpError(404, 'This trail has no mapped geometry in OpenStreetMap.');

  const chained = chainLines(lines);
  let points = chained.points;
  const tags = rel?.tags ?? {};

  if (reverse) points = points.slice().reverse();

  const route: PlannedRoute = finalizeRoute(points, 'OpenStreetMap trail relation (Waymarked Trails)');
  const totalWays = lines.length;
  const skippedKm = Math.round(chained.skippedM / 1000);
  const notices: string[] = [];
  if (skippedKm >= 1) notices.push(`${skippedKm} km of alternative variants or side trips were left out.`);
  if (chained.maxGapM > 500) notices.push(`Small gaps in the mapped trail (up to ${(chained.maxGapM / 1000).toFixed(1)} km) are bridged.`);
  if (chained.used < totalWays * 0.5) notices.push('Much of this relation is disconnected; the longest continuous part is used.');

  const start = points[0];
  const end = points[points.length - 1];
  const [a, b] = await Promise.allSettled([reverseGeocode(start[0], start[1]), reverseGeocode(end[0], end[1])]);
  const name = tags['name:en'] || tags.name || `Trail ${osmId}`;
  return {
    ...route,
    notice: notices.join(' ') || undefined,
    trail: {
      osmId,
      name,
      ref: tags.ref,
      from: tags.from,
      to: tags.to,
      website: tags.website,
      wikipedia: tags.wikipedia,
    },
    startName: (a.status === 'fulfilled' && a.value?.name) || (reverse ? tags.to : tags.from) || 'Start',
    endName: (b.status === 'fulfilled' && b.value?.name) || (reverse ? tags.from : tags.to) || 'Finish',
  };
}
