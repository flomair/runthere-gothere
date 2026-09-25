/** A point as [lat, lon] in degrees. */
export type LatLon = [number, number];

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in metres. */
export function haversine(a: LatLon, b: LatLon): number {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cumulative distance (m) at every vertex; result[0] === 0. */
export function cumulativeDistances(points: LatLon[]): number[] {
  const cum = new Array<number>(points.length);
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) total += haversine(points[i - 1], points[i]);
    cum[i] = total;
  }
  return cum;
}

export interface RoutePosition {
  point: LatLon;
  /** Index of the last vertex at or before the position. */
  index: number;
  /** Distance along the route, clamped to [0, total]. */
  distanceM: number;
}

/** Locate the point `distanceM` metres along the route (linear interpolation between vertices). */
export function positionAt(points: LatLon[], cum: number[], distanceM: number): RoutePosition {
  if (points.length === 0) throw new Error('empty route');
  const total = cum[cum.length - 1];
  const d = Math.max(0, Math.min(total, distanceM));
  if (points.length === 1 || d <= 0) return { point: points[0], index: 0, distanceM: d };
  if (d >= total) return { point: points[points.length - 1], index: points.length - 1, distanceM: d };

  // binary search for last index with cum[i] <= d
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid - 1;
  }
  const seg = cum[lo + 1] - cum[lo];
  const t = seg > 0 ? (d - cum[lo]) / seg : 0;
  const [a, b] = [points[lo], points[lo + 1]];
  return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], index: lo, distanceM: d };
}

/** Split the route into the part already covered and the part still ahead. */
export function splitRoute(points: LatLon[], cum: number[], distanceM: number): { done: LatLon[]; ahead: LatLon[] } {
  if (points.length === 0) return { done: [], ahead: [] };
  const pos = positionAt(points, cum, distanceM);
  const done = points.slice(0, pos.index + 1);
  const ahead = points.slice(pos.index + 1);
  done.push(pos.point);
  ahead.unshift(pos.point);
  return { done, ahead };
}

/** Points along the great circle between a and b, spaced roughly every `stepM` metres. */
export function greatCircle(a: LatLon, b: LatLon, stepM = 5000): LatLon[] {
  const d = haversine(a, b);
  const n = Math.max(1, Math.ceil(d / stepM));
  const [φ1, λ1, φ2, λ2] = [toRad(a[0]), toRad(a[1]), toRad(b[0]), toRad(b[1])];
  const δ = d / EARTH_RADIUS_M;
  if (δ === 0) return [a];
  const out: LatLon[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * δ) / Math.sin(δ);
    const B = Math.sin(f * δ) / Math.sin(δ);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    out.push([toDeg(Math.atan2(z, Math.hypot(x, y))), toDeg(Math.atan2(y, x))]);
  }
  return out;
}

/**
 * Douglas–Peucker simplification using a local equirectangular projection.
 * `toleranceM` is the maximum allowed deviation in metres.
 */
export function simplify(points: LatLon[], toleranceM: number): LatLon[] {
  if (points.length <= 2) return points.slice();
  const lat0 = toRad(points[0][0]);
  const xy = points.map(([la, lo]) => [toRad(lo) * Math.cos(lat0) * EARTH_RADIUS_M, toRad(la) * EARTH_RADIUS_M]);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  const tol2 = toleranceM * toleranceM;
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [x1, y1] = xy[s];
    const [x2, y2] = xy[e];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = xy[i];
      let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = x1 + t * dx - px;
      const ey = y1 + t * dy - py;
      const d2 = ex * ex + ey * ey;
      if (d2 > maxD) {
        maxD = d2;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > tol2) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Simplify with growing tolerance until the route has at most `maxPoints` vertices. */
export function simplifyToMax(points: LatLon[], maxPoints: number, startToleranceM = 5): LatLon[] {
  let tol = startToleranceM;
  let out = simplify(points, tol);
  while (out.length > maxPoints && tol < 100_000) {
    tol *= 2;
    out = simplify(points, tol);
  }
  return out;
}

/** Extract track/route points from a GPX document (trkpt, then rtept, then wpt). */
export function parseGpx(xml: string): LatLon[] {
  for (const tag of ['trkpt', 'rtept', 'wpt']) {
    const re = new RegExp(`<${tag}\\b([^>]*)>`, 'g');
    const pts: LatLon[] = [];
    for (const m of xml.matchAll(re)) {
      const lat = /\blat\s*=\s*["']([-\d.eE+]+)["']/.exec(m[1]);
      const lon = /\blon\s*=\s*["']([-\d.eE+]+)["']/.exec(m[1]);
      if (lat && lon) pts.push([parseFloat(lat[1]), parseFloat(lon[1])]);
    }
    if (pts.length >= 2) return pts;
  }
  return [];
}

/** Human-friendly distance string. */
export function formatKm(meters: number, digits = 1): string {
  const km = meters / 1000;
  return `${km.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: km < 100 ? digits : 0 })} km`;
}

/** Fast approximate distance (m) for nearest-neighbour searches; fine for short gaps. */
function approxDist(a: LatLon, b: LatLon): number {
  const k = Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180));
  const dx = (b[1] - a[1]) * k;
  const dy = b[0] - a[0];
  return Math.sqrt(dx * dx + dy * dy) * 111_195;
}

export interface ChainResult {
  points: LatLon[];
  /** Number of input pieces that ended up in the chain. */
  used: number;
  /** Length of pieces left out (variants, spurs, disconnected bits). */
  skippedM: number;
  /** Largest gap bridged between two pieces. */
  maxGapM: number;
}

interface Piece {
  pts: LatLon[];
  len: number;
  count: number;
}

/**
 * Greedily grow chains: seed with the longest unused piece, then keep attaching the unused piece
 * whose nearest end is closest to either chain end (reversing it as needed) while within `tolM`.
 */
function growChains(pieces: Piece[], tolM: number): (Piece & { maxGap: number })[] {
  const order = pieces.slice().sort((a, b) => b.len - a.len);
  const used = new Uint8Array(order.length);
  const out: (Piece & { maxGap: number })[] = [];
  for (let seed = 0; seed < order.length; seed++) {
    if (used[seed]) continue;
    used[seed] = 1;
    let chain = order[seed].pts.slice();
    let len = order[seed].len;
    let count = order[seed].count;
    let maxGap = 0;
    for (const side of ['tail', 'head'] as const) {
      for (;;) {
        const end = side === 'tail' ? chain[chain.length - 1] : chain[0];
        let best = -1;
        let bestD = Infinity;
        let bestRev = false;
        for (let i = 0; i < order.length; i++) {
          if (used[i]) continue;
          const p = order[i].pts;
          const dStart = approxDist(end, p[0]);
          const dEnd = approxDist(end, p[p.length - 1]);
          const d = Math.min(dStart, dEnd);
          if (d < bestD) {
            bestD = d;
            best = i;
            // tail: the piece must start at the chain end; head: it must end at the chain head
            bestRev = side === 'tail' ? dEnd < dStart : dStart < dEnd;
          }
        }
        if (best === -1 || bestD > tolM) break;
        used[best] = 1;
        len += order[best].len;
        count += order[best].count;
        maxGap = Math.max(maxGap, bestD);
        const p = bestRev ? order[best].pts.slice().reverse() : order[best].pts;
        const touching = bestD < 1;
        if (side === 'tail') chain = chain.concat(touching ? p.slice(1) : p);
        else chain = (touching ? p.slice(0, -1) : p).concat(chain);
      }
    }
    out.push({ pts: chain, len, count, maxGap });
  }
  return out;
}

/**
 * Join the unordered, arbitrarily oriented ways of an OSM route relation into one continuous line.
 * Pass 1 links pieces that actually touch (≤ 30 m) into connected sections; pass 2 bridges real
 * gaps (≤ `maxGapM`) between those sections. The longest resulting line wins, so alternative
 * variants and side trips are left out instead of being stitched in backwards.
 */
export function chainLines(lines: LatLon[][], maxGapM = 5000): ChainResult {
  const pieces: Piece[] = lines
    .filter((l) => l.length >= 2)
    .map((l) => ({ pts: l, len: cumulativeDistances(l).at(-1)!, count: 1 }));
  if (!pieces.length) return { points: [], used: 0, skippedM: 0, maxGapM: 0 };
  const total = pieces.reduce((s, p) => s + p.len, 0);
  const sections = growChains(pieces, 30);
  const joined = growChains(sections, maxGapM).sort((a, b) => b.len - a.len)[0];
  return { points: joined.pts, used: joined.count, skippedM: Math.max(0, total - joined.len), maxGapM: joined.maxGap };
}

/** Google encoded-polyline (precision 5). Compact storage for routes (Firestore has no nested arrays). */
export function encodePolyline(points: LatLon[], precision = 5): string {
  const f = 10 ** precision;
  let out = '';
  let pLat = 0;
  let pLon = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const [la, lo] of points) {
    const lat = Math.round(la * f);
    const lon = Math.round(lo * f);
    enc(lat - pLat);
    enc(lon - pLon);
    pLat = lat;
    pLon = lon;
  }
  return out;
}

export function decodePolyline(s: string, precision = 5): LatLon[] {
  const f = 10 ** precision;
  const out: LatLon[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const dec = () => {
    let shift = 0;
    let result = 0;
    let b;
    do {
      b = s.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < s.length) {
    lat += dec();
    lon += dec();
    out.push([lat / f, lon / f]);
  }
  return out;
}
