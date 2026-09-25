import { afterEach, describe, expect, it, vi } from 'vitest';
import { photosAlong } from '../server/photos';

const commonsPage = (id: number, lat: number, lon: number) => ({
  pageid: id,
  title: `File:Photo_${id}.jpg`,
  coordinates: [{ lat, lon }],
  imageinfo: [{ url: `https://x/${id}.jpg`, thumburl: `https://x/t${id}.jpg`, descriptionurl: `https://x/p${id}`, mime: 'image/jpeg', extmetadata: {} }],
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('photosAlong', () => {
  it('uses the nearest unused Commons photo within 3 km per point', async () => {
    vi.stubEnv('MAPILLARY_TOKEN', '');
    // every point sees the same two photos: one at 100 m, one at ~1.1 km from the first point
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ query: { pages: { a: commonsPage(1, 50.0009, 10), b: commonsPage(2, 50.01, 10), c: commonsPage(3, 51, 10) } } })),
      ),
    );
    const frames = await photosAlong([
      [50, 10],
      [50.001, 10],
      [50.002, 10],
    ]);
    expect(frames.map((f) => f.photo?.id ?? null)).toEqual(['wm-1', 'wm-2', null]);
  });

  it('prefers the closest Mapillary image when a token is set', async () => {
    vi.stubEnv('MAPILLARY_TOKEN', 'tok');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(String(url)).toContain('graph.mapillary.com');
        return new Response(
          JSON.stringify({
            data: [
              { id: 'far', thumb_1024_url: 'https://m/far', geometry: { coordinates: [10.001, 50.001] } },
              { id: 'near', thumb_1024_url: 'https://m/near', geometry: { coordinates: [10.0001, 50.0001] } },
            ],
          }),
        );
      }),
    );
    const [f] = await photosAlong([[50, 10]]);
    expect(f.photo).toMatchObject({ id: 'mly-near', source: 'mapillary' });
  });
});
