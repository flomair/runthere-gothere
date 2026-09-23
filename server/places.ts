import { fetchJson } from './http.js';
import type { GeoResult, PlaceName } from '../shared/types.js';
export type { GeoResult, PlaceName };

const NOMINATIM = 'https://nominatim.openstreetmap.org';

interface NominatimSearch {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
}

export async function geocode(q: string, lang = 'en', limit = 6): Promise<GeoResult[]> {
  const u = new URL(`${NOMINATIM}/search`);
  u.searchParams.set('q', q);
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('accept-language', lang);
  const rows = await fetchJson<NominatimSearch[]>(u.toString());
  return rows.map((r) => ({
    name: r.name || r.display_name.split(',')[0],
    displayName: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
  }));
}

interface NominatimReverse {
  display_name?: string;
  address?: Record<string, string>;
  error?: string;
}

export async function reverseGeocode(lat: number, lon: number, lang = 'en'): Promise<PlaceName | null> {
  const u = new URL(`${NOMINATIM}/reverse`);
  u.searchParams.set('lat', lat.toFixed(5));
  u.searchParams.set('lon', lon.toFixed(5));
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('zoom', '14');
  u.searchParams.set('accept-language', lang);
  const r = await fetchJson<NominatimReverse>(u.toString());
  if (r.error || !r.address) return null;
  const a = r.address;
  const name =
    a.village ?? a.town ?? a.city ?? a.hamlet ?? a.suburb ?? a.municipality ?? a.county ?? a.state ?? r.display_name ?? '';
  const context = [a.state ?? a.county, a.country].filter(Boolean).join(', ');
  return { name, context, displayName: r.display_name ?? name, countryCode: a.country_code };
}
