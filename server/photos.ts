import { haversine } from '../shared/geo.js';
import { fetchJson, stripHtml } from './http.js';
import type { Photo } from '../shared/types.js';
export type { Photo };

interface MapillaryResponse {
  data?: {
    id: string;
    captured_at?: number;
    thumb_1024_url?: string;
    thumb_2048_url?: string;
    creator?: { username?: string };
    geometry: { coordinates: [number, number] };
  }[];
}

/** Recent street-level imagery around the point (requires MAPILLARY_TOKEN). */
export async function mapillaryPhotos(lat: number, lon: number, limit = 8): Promise<Photo[]> {
  const token = process.env.MAPILLARY_TOKEN;
  if (!token) return [];
  // Mapillary rejects large bboxes; widen gradually until something is found.
  for (const r of [0.003, 0.01, 0.03]) {
    const bbox = [lon - r, lat - r, lon + r, lat + r].map((v) => v.toFixed(6)).join(',');
    const u = new URL('https://graph.mapillary.com/images');
    u.searchParams.set('access_token', token);
    u.searchParams.set('fields', 'id,captured_at,thumb_1024_url,thumb_2048_url,creator,geometry');
    u.searchParams.set('bbox', bbox);
    u.searchParams.set('limit', '50');
    const res = await fetchJson<MapillaryResponse>(u.toString()).catch(() => null);
    const data = res?.data?.filter((d) => d.thumb_1024_url) ?? [];
    if (!data.length) continue;
    return data
      .sort((a, b) => (b.captured_at ?? 0) - (a.captured_at ?? 0))
      .slice(0, limit)
      .map((d) => {
        const [plon, plat] = d.geometry.coordinates;
        return {
          id: `mly-${d.id}`,
          source: 'mapillary' as const,
          thumbUrl: d.thumb_1024_url!,
          fullUrl: d.thumb_2048_url ?? d.thumb_1024_url!,
          pageUrl: `https://www.mapillary.com/app/?pKey=${d.id}&focus=photo`,
          title: 'Street-level view',
          author: d.creator?.username,
          license: 'CC BY-SA 4.0',
          takenAt: d.captured_at ? new Date(d.captured_at).toISOString() : undefined,
          lat: plat,
          lon: plon,
          distanceM: haversine([lat, lon], [plat, plon]),
        };
      });
  }
  return [];
}

interface CommonsResponse {
  query?: {
    pages?: Record<
      string,
      {
        pageid: number;
        title: string;
        coordinates?: { lat: number; lon: number }[];
        imageinfo?: {
          url: string;
          thumburl?: string;
          descriptionurl: string;
          mime?: string;
          extmetadata?: Record<string, { value: string }>;
        }[];
      }
    >;
  };
}

function parseCommonsDate(s: string): string | undefined {
  const m = /(\d{4})[-:](\d{2})[-:](\d{2})/.exec(s) ?? /(\d{4})/.exec(s);
  if (!m) return undefined;
  const d = new Date(m.length >= 4 ? `${m[1]}-${m[2]}-${m[3]}T00:00:00Z` : `${m[1]}-01-01T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Geotagged photos from Wikimedia Commons within 10 km, newest first. */
export async function commonsPhotos(lat: number, lon: number, limit = 12): Promise<Photo[]> {
  return (await commonsSearch(lat, lon, 40)).slice(0, limit);
}

/** Old photos (taken before 1960), oldest first – for "then & now". */
export function historicOf(photos: Photo[], limit = 8): Photo[] {
  return photos
    .filter((p) => p.takenAt && p.takenAt < '1960')
    .sort((a, b) => (a.takenAt ?? '').localeCompare(b.takenAt ?? ''))
    .slice(0, limit);
}

/** Geotagged Commons photos within 10 km (up to `max` looked at), newest first. */
export async function commonsSearch(lat: number, lon: number, max: number): Promise<Photo[]> {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({
    action: 'query',
    format: 'json',
    generator: 'geosearch',
    ggscoord: `${lat}|${lon}`,
    ggsradius: '10000',
    ggsnamespace: '6',
    ggslimit: String(max),
    prop: 'imageinfo|coordinates',
    iiprop: 'url|extmetadata|mime',
    iiurlwidth: '800',
    iiextmetadatafilter: 'DateTimeOriginal|DateTime|Artist|LicenseShortName|ObjectName|ImageDescription',
  }).forEach(([k, v]) => u.searchParams.set(k, v));

  const res = await fetchJson<CommonsResponse>(u.toString());
  const pages = Object.values(res.query?.pages ?? {});
  const photos: Photo[] = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    const c = p.coordinates?.[0];
    if (!info || !c || !info.mime?.startsWith('image/') || info.mime === 'image/svg+xml') continue;
    const md = info.extmetadata ?? {};
    photos.push({
      id: `wm-${p.pageid}`,
      source: 'wikimedia',
      thumbUrl: info.thumburl ?? info.url,
      fullUrl: info.url,
      pageUrl: info.descriptionurl,
      title:
        stripHtml(md.ObjectName?.value) ||
        p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' '),
      author: stripHtml(md.Artist?.value) || undefined,
      license: stripHtml(md.LicenseShortName?.value) || undefined,
      takenAt: parseCommonsDate(md.DateTimeOriginal?.value ?? md.DateTime?.value ?? ''),
      lat: c.lat,
      lon: c.lon,
      distanceM: haversine([lat, lon], [c.lat, c.lon]),
    });
  }
  return photos.sort((a, b) => (b.takenAt ?? '').localeCompare(a.takenAt ?? ''));
}

/** The Mapillary image closest to the point (within ~1 km), or null. */
export async function mapillaryNearest(lat: number, lon: number): Promise<Photo | null> {
  const token = process.env.MAPILLARY_TOKEN;
  if (!token) return null;
  for (const r of [0.0015, 0.005, 0.01]) {
    const bbox = [lon - r, lat - r, lon + r, lat + r].map((v) => v.toFixed(6)).join(',');
    const u = new URL('https://graph.mapillary.com/images');
    u.searchParams.set('access_token', token);
    u.searchParams.set('fields', 'id,captured_at,thumb_1024_url,thumb_2048_url,creator,geometry');
    u.searchParams.set('bbox', bbox);
    u.searchParams.set('limit', '30');
    const res = await fetchJson<MapillaryResponse>(u.toString()).catch(() => null);
    const data = res?.data?.filter((d) => d.thumb_1024_url) ?? [];
    if (!data.length) continue;
    const best = data
      .map((d) => ({ d, dist: haversine([lat, lon], [d.geometry.coordinates[1], d.geometry.coordinates[0]]) }))
      .sort((a, b) => a.dist - b.dist)[0];
    const [plon, plat] = best.d.geometry.coordinates;
    return {
      id: `mly-${best.d.id}`,
      source: 'mapillary',
      thumbUrl: best.d.thumb_1024_url!,
      fullUrl: best.d.thumb_2048_url ?? best.d.thumb_1024_url!,
      pageUrl: `https://www.mapillary.com/app/?pKey=${best.d.id}&focus=photo`,
      title: 'Street-level view',
      author: best.d.creator?.username,
      license: 'CC BY-SA 4.0',
      takenAt: best.d.captured_at ? new Date(best.d.captured_at).toISOString() : undefined,
      lat: plat,
      lon: plon,
      distanceM: best.dist,
    };
  }
  return null;
}

export interface AlongFrame {
  /** Index of the requested point. */
  i: number;
  photo: Photo | null;
}

/**
 * One photo per point along a stretch of route, for the slideshow: the nearest street-level
 * image, or else the nearest not-yet-used Commons photo within 3 km.
 */
export async function photosAlong(points: [number, number][], opts: { mapillary?: boolean } = {}): Promise<AlongFrame[]> {
  const useMly = opts.mapillary ?? !!process.env.MAPILLARY_TOKEN;
  const out: AlongFrame[] = [];
  const used = new Set<string>();
  for (let start = 0; start < points.length; start += 6) {
    const batch = points.slice(start, start + 6);
    const found = await Promise.all(
      batch.map(async ([lat, lon]) => {
        const mly = useMly ? await mapillaryNearest(lat, lon).catch(() => null) : null;
        if (mly) return [mly];
        return (await commonsSearch(lat, lon, 30).catch(() => [] as Photo[])).filter((p) => p.distanceM <= 3000).sort((a, b) => a.distanceM - b.distanceM);
      }),
    );
    found.forEach((cands, k) => {
      const photo = cands.find((p) => !used.has(p.id)) ?? null;
      if (photo) used.add(photo.id);
      out.push({ i: start + k, photo });
    });
  }
  return out;
}
