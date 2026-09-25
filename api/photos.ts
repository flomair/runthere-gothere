import { json, latLonParams } from '../server/http.js';
import { authed } from '../server/access.js';
import { commonsPhotos, mapillaryPhotos } from '../server/photos.js';

/** GET /api/photos?lat&lon – street-level (Mapillary) + geotagged Commons photos near a point. */
export const GET = authed(async (req) => {
  const [lat, lon] = latLonParams(new URL(req.url));
  const [mly, wm] = await Promise.allSettled([mapillaryPhotos(lat, lon), commonsPhotos(lat, lon)]);
  const photos = [
    ...(mly.status === 'fulfilled' ? mly.value : []),
    ...(wm.status === 'fulfilled' ? wm.value : []),
  ];
  const errors = [mly, wm].filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason));
  return json({ photos, errors }, { cacheSeconds: 6 * 3600 });
});
