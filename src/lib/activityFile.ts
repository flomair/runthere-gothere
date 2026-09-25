import { haversine } from '../../shared/geo';

export interface ParsedRun {
  /** YYYY-MM-DD (local date of the start) */
  date: string;
  distanceM: number;
  movingTimeS?: number;
  elevationGainM?: number;
  name?: string;
}

const isoLocalDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function ascent(elev: number[]): number {
  let up = 0;
  let ref = elev[0];
  for (const e of elev) {
    if (e - ref >= 2) {
      up += e - ref;
      ref = e;
    } else if (ref - e >= 2) ref = e;
  }
  return Math.round(up);
}

function fromPoints(pts: { lat: number; lon: number; ele?: number; time?: Date }[], name?: string): ParsedRun {
  if (pts.length < 2) throw new Error('The file contains no track.');
  let dist = 0;
  for (let i = 1; i < pts.length; i++) dist += haversine([pts[i - 1].lat, pts[i - 1].lon], [pts[i].lat, pts[i].lon]);
  const times = pts.map((p) => p.time).filter((t): t is Date => !!t && !Number.isNaN(t.getTime()));
  const elev = pts.map((p) => p.ele).filter((e): e is number => Number.isFinite(e));
  return {
    date: isoLocalDate(times[0] ?? new Date()),
    distanceM: Math.round(dist),
    movingTimeS: times.length > 1 ? Math.round((times[times.length - 1].getTime() - times[0].getTime()) / 1000) : undefined,
    elevationGainM: elev.length > 1 ? ascent(elev) : undefined,
    name,
  };
}

function parseGpx(doc: Document): ParsedRun {
  const pts = [...doc.getElementsByTagName('trkpt')].map((p) => ({
    lat: Number(p.getAttribute('lat')),
    lon: Number(p.getAttribute('lon')),
    ele: p.getElementsByTagName('ele')[0] ? Number(p.getElementsByTagName('ele')[0].textContent) : undefined,
    time: p.getElementsByTagName('time')[0] ? new Date(p.getElementsByTagName('time')[0].textContent ?? '') : undefined,
  }));
  const name = doc.getElementsByTagName('name')[0]?.textContent ?? undefined;
  return fromPoints(pts, name);
}

function parseTcx(doc: Document): ParsedRun {
  const tp = [...doc.getElementsByTagName('Trackpoint')];
  const num = (el: Element, tag: string) => {
    const t = el.getElementsByTagName(tag)[0]?.textContent;
    return t != null && t !== '' ? Number(t) : undefined;
  };
  const pts = tp
    .map((p) => ({
      lat: num(p, 'LatitudeDegrees') ?? NaN,
      lon: num(p, 'LongitudeDegrees') ?? NaN,
      ele: num(p, 'AltitudeMeters'),
      time: p.getElementsByTagName('Time')[0] ? new Date(p.getElementsByTagName('Time')[0].textContent ?? '') : undefined,
    }))
    .filter((p) => Number.isFinite(p.lat));
  const laps = [...doc.getElementsByTagName('Lap')];
  const lapDist = laps.reduce((s, l) => s + (num(l, 'DistanceMeters') ?? 0), 0);
  const lapTime = laps.reduce((s, l) => s + (num(l, 'TotalTimeSeconds') ?? 0), 0);
  if (pts.length >= 2) {
    const r = fromPoints(pts);
    return { ...r, distanceM: lapDist > 0 ? Math.round(lapDist) : r.distanceM, movingTimeS: lapTime > 0 ? Math.round(lapTime) : r.movingTimeS };
  }
  if (lapDist > 0) {
    const start = laps[0].getAttribute('StartTime');
    return { date: isoLocalDate(start ? new Date(start) : new Date()), distanceM: Math.round(lapDist), movingTimeS: Math.round(lapTime) || undefined };
  }
  throw new Error('No distance found in this TCX file.');
}

async function parseFit(buf: ArrayBuffer): Promise<ParsedRun> {
  const { Decoder, Stream } = await import('@garmin/fitsdk');
  const decoder = new Decoder(Stream.fromArrayBuffer(buf));
  if (!decoder.isFIT()) throw new Error('Not a valid FIT file.');
  const { messages } = decoder.read();
  const s = (messages.sessionMesgs as Record<string, unknown>[] | undefined)?.[0];
  if (!s || !Number(s.totalDistance)) throw new Error('No activity summary found in this FIT file.');
  const start = s.startTime instanceof Date ? s.startTime : new Date();
  return {
    date: isoLocalDate(start),
    distanceM: Math.round(Number(s.totalDistance)),
    movingTimeS: Number(s.totalTimerTime) ? Math.round(Number(s.totalTimerTime)) : undefined,
    elevationGainM: Number(s.totalAscent) ? Math.round(Number(s.totalAscent)) : undefined,
    name: typeof s.sport === 'string' ? `${s.sport[0].toUpperCase()}${s.sport.slice(1)} (FIT)` : undefined,
  };
}

/** Read a GPX, TCX or FIT activity file (e.g. from Garmin, Apple Health exports, Komoot). */
export async function parseActivityFile(file: File): Promise<ParsedRun> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.fit')) return parseFit(await file.arrayBuffer());
  const doc = new DOMParser().parseFromString(await file.text(), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Could not read this file.');
  if (lower.endsWith('.tcx') || doc.getElementsByTagName('TrainingCenterDatabase').length) return parseTcx(doc);
  return parseGpx(doc);
}
