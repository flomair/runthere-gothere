import type { LatLon } from '../shared/geo.js';
import { fetchJson } from './http.js';

/** Altitudes (m) for up to 400 points via Open-Meteo's elevation API (Copernicus DEM, ~90 m). */
export async function elevations(points: LatLon[]): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    const u = new URL('https://api.open-meteo.com/v1/elevation');
    u.searchParams.set('latitude', chunk.map((p) => p[0].toFixed(5)).join(','));
    u.searchParams.set('longitude', chunk.map((p) => p[1].toFixed(5)).join(','));
    const r = await fetchJson<{ elevation: number[] }>(u.toString());
    out.push(...r.elevation.map((e) => (Number.isFinite(e) ? Math.round(e) : 0)));
  }
  return out;
}
