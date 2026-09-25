import { afterEach, describe, expect, it, vi } from 'vitest';
import { type LatLon, chainLines } from '../shared/geo';

afterEach(() => vi.unstubAllGlobals());

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

describe('chainLines', () => {
  it('joins shuffled, reversed pieces into one line and skips a far-away variant', () => {
    const a: LatLon[] = [[0, 0], [0, 0.01]];
    const b: LatLon[] = [[0, 0.02], [0, 0.01]]; // reversed
    const c: LatLon[] = [[0, 0.02], [0, 0.03], [0, 0.05]]; // longest, in the middle-end
    const d: LatLon[] = [[0, -0.02], [0, 0]]; // before a
    const variant: LatLon[] = [[1, 1], [1, 1.01]];
    const r = chainLines([b, variant, a, c, d]);
    expect(r.used).toBe(4);
    const lons = r.points.map((p) => p[1]);
    const sorted = [...lons].sort((x, y) => x - y);
    expect(lons).toEqual(lons[0] < lons[lons.length - 1] ? sorted : sorted.reverse());
    expect(new Set(lons).size).toBe(lons.length); // no duplicated joints
    expect(r.skippedM).toBeGreaterThan(1000);
  });

  it('bridges small gaps and reports them', () => {
    const r = chainLines([[[0, 0], [0, 0.1]], [[0, 0.11], [0, 0.2]]]);
    expect(r.used).toBe(2);
    expect(r.maxGapM).toBeGreaterThan(1000);
    expect(r.maxGapM).toBeLessThan(1200);
  });
});

describe('hiking-trail routing', () => {
  it('splits long routes into sections and falls back per section', async () => {
    const { planRoute, legsFor } = await import('../server/routing');
    const wps: LatLon[] = [[52.52, 13.405], [48.208, 16.373]];
    const legs = legsFor(wps, 120_000);
    expect(legs.length).toBe(5);
    expect(legs[0][0]).toEqual(wps[0]);
    expect(legs[4][1][0]).toBeCloseTo(wps[1][0], 6);

    let brouterCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('brouter.de')) {
          brouterCalls++;
          const lonlats = new URL(url).searchParams.get('lonlats')!.split('|').map((p) => p.split(',').map(Number));
          if (brouterCalls === 2) return new Response('target island detected', { status: 400 });
          return json({ features: [{ geometry: { coordinates: lonlats } }] });
        }
        if (url.includes('routed-foot')) {
          const coords = url.split('/driving/')[1].split('?')[0].split(';').map((p) => p.split(',').map(Number));
          return json({ code: 'Ok', routes: [{ distance: 1, geometry: { coordinates: coords } }] });
        }
        throw new Error(url);
      }),
    );
    const r = await planRoute(wps, 'hike');
    expect(brouterCalls).toBe(5);
    expect(r.provider).toMatch(/hiking trails in 5 sections/);
    expect(r.notice).toMatch(/1 of 5 sections/);
    expect(r.points[0]).toEqual(wps[0]);
    expect(r.totalM).toBeGreaterThan(520_000);
  });
});

describe('trails', () => {
  it('searches Waymarked Trails and falls back to Nominatim', async () => {
    const { searchTrails } = await import('../server/trails');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('waymarkedtrails')) return json({ results: [{ type: 'relation', id: 11, name: 'Rennsteig', group: 'NAT', ref: 'R', itinerary: ['Hörschel', 'Blankenstein'] }] });
        throw new Error(url);
      }),
    );
    expect(await searchTrails('Rennsteig')).toEqual([
      { osmId: 11, name: 'Rennsteig', ref: 'R', network: 'National', itinerary: 'Hörschel – Blankenstein', source: 'waymarked' },
    ]);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('waymarkedtrails')) return new Response('down', { status: 503 });
        if (url.includes('nominatim'))
          return json([
            { osm_type: 'relation', osm_id: 22, name: 'Malerweg', display_name: 'Malerweg, Sachsen', category: 'route', type: 'hiking' },
            { osm_type: 'node', osm_id: 1, display_name: 'Malerweg street', category: 'highway', type: 'residential' },
          ]);
        throw new Error(url);
      }),
    );
    const r = await searchTrails('Malerweg');
    expect(r.map((x) => x.osmId)).toEqual([22]);
  });

  it('loads a relation via Overpass, chains it and names the ends', async () => {
    const { loadTrail } = await import('../server/trails');
    let overpassBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('overpass')) {
          overpassBody = String(init?.body);
          return json({
            elements: [
              { type: 'relation', id: 99, tags: { name: 'Testweg', ref: 'TW', from: 'Nord', to: 'Süd' } },
              { type: 'way', id: 2, geometry: [{ lat: 50.1, lon: 10 }, { lat: 50.2, lon: 10 }] },
              { type: 'way', id: 1, geometry: [{ lat: 50.1, lon: 10 }, { lat: 50.0, lon: 10 }] },
            ],
          });
        }
        if (url.includes('nominatim')) {
          const lat = Number(new URL(url).searchParams.get('lat'));
          return json({ display_name: 'x', address: { town: lat > 50.1 ? 'Nordhausen' : 'Südstadt', country: 'DE' } });
        }
        throw new Error(url);
      }),
    );
    const r = await loadTrail(99, false);
    expect(decodeURIComponent(overpassBody)).toContain('relation(99)');
    expect(r.trail).toMatchObject({ osmId: 99, name: 'Testweg', ref: 'TW' });
    expect(r.totalM / 1000).toBeCloseTo(22.2, 0);
    expect(r.points[0][0] === 50 || r.points[0][0] === 50.2).toBe(true);
    expect([r.startName, r.endName].sort()).toEqual(['Nordhausen', 'Südstadt']);

    const rev = await loadTrail(99, true);
    expect(rev.startName).toBe(r.endName);
  });
});
