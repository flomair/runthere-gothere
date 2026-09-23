import { describe, expect, it } from 'vitest';
import { type LatLon, cumulativeDistances, greatCircle, haversine, parseGpx, positionAt, simplify, simplifyToMax, splitRoute } from '../shared/geo';

const BERLIN: LatLon = [52.52, 13.405];
const VIENNA: LatLon = [48.2082, 16.3738];

describe('geo', () => {
  it('haversine Berlin–Vienna ≈ 524 km', () => {
    expect(haversine(BERLIN, VIENNA) / 1000).toBeCloseTo(524, -1);
  });

  it('positionAt interpolates and clamps', () => {
    const pts: LatLon[] = [[0, 0], [0, 1], [0, 2]];
    const cum = cumulativeDistances(pts);
    const half = positionAt(pts, cum, cum[2] / 4);
    expect(half.index).toBe(0);
    expect(half.point[1]).toBeCloseTo(0.5, 5);
    expect(positionAt(pts, cum, -5).point).toEqual([0, 0]);
    expect(positionAt(pts, cum, 1e12).point).toEqual([0, 2]);
    expect(positionAt(pts, cum, cum[1]).index).toBe(1);
  });

  it('splitRoute shares the current point', () => {
    const pts: LatLon[] = [[0, 0], [0, 1], [0, 2]];
    const cum = cumulativeDistances(pts);
    const { done, ahead } = splitRoute(pts, cum, cum[2] * 0.75);
    expect(done[done.length - 1]).toEqual(ahead[0]);
    expect(done).toHaveLength(3);
    expect(ahead).toHaveLength(2);
  });

  it('greatCircle ends at both endpoints with sane spacing', () => {
    const gc = greatCircle(BERLIN, VIENNA, 10_000);
    expect(gc[0][0]).toBeCloseTo(BERLIN[0], 6);
    expect(gc[gc.length - 1][1]).toBeCloseTo(VIENNA[1], 6);
    const cum = cumulativeDistances(gc);
    expect(cum[cum.length - 1]).toBeCloseTo(haversine(BERLIN, VIENNA), -2);
  });

  it('simplify keeps endpoints and removes collinear points', () => {
    const line: LatLon[] = Array.from({ length: 100 }, (_, i) => [0, i * 0.001]);
    const s = simplify(line, 1);
    expect(s).toEqual([line[0], line[99]]);
    const zig: LatLon[] = Array.from({ length: 2000 }, (_, i) => [(i % 2) * 0.01, i * 0.001]);
    expect(simplifyToMax(zig, 300).length).toBeLessThanOrEqual(300);
  });

  it('parseGpx reads trkpt, falls back to rtept', () => {
    const trk = `<gpx><trk><trkseg><trkpt lat="52.5" lon="13.4"><ele>30</ele></trkpt><trkpt lon='13.5' lat='52.6'/></trkseg></trk></gpx>`;
    expect(parseGpx(trk)).toEqual([[52.5, 13.4], [52.6, 13.5]]);
    const rte = `<gpx><rte><rtept lat="1" lon="2"/><rtept lat="3" lon="4"/></rte></gpx>`;
    expect(parseGpx(rte)).toEqual([[1, 2], [3, 4]]);
    expect(parseGpx('<gpx/>')).toEqual([]);
  });
});
