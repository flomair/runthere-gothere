import { json, latLonParams } from '../server/http.js';
import { authed } from '../server/access.js';
import { commonsSearch, historicOf, mapillaryPhotos } from '../server/photos.js';

/** GET /api/photos?lat&lon – street-level (Mapillary) + geotagged Commons photos near a point. */
export const GET = authed(async (req) => {
  const [lat, lon] = latLonParams(new URL(req.url));
  const [mly, wm] = await Promise.allSettled([mapillaryPhotos(lat, lon), commonsSearch(lat, lon, 150)]);
  const commons = wm.status === 'fulfilled' ? wm.value : [];
  const photos = [...(mly.status === 'fulfilled' ? mly.value : []), ...commons.slice(0, 12)];
  const errors = [mly, wm].filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason));
  const historic = historicOf(commons);
  return json({ photos, historic, errors }, { cacheSeconds: 6 * 3600 });
});
