import { json, latLonParams } from '../server/http.js';
import { authed } from '../server/access.js';
import { reverseGeocode } from '../server/places.js';
import { googlePlaces, weather, wikipedia } from '../server/surroundings.js';

const settle = <T>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);

/** GET /api/surroundings?lat&lon&lang – place name, current weather, Wikipedia and (optionally) Google places. */
export const GET = authed(async (req) => {
  const url = new URL(req.url);
  const [lat, lon] = latLonParams(url);
  const lang = (url.searchParams.get('lang') ?? 'en').slice(0, 12);
  const [place, wx, wiki, gplaces] = await Promise.allSettled([
    reverseGeocode(lat, lon, lang),
    weather(lat, lon),
    wikipedia(lat, lon, lang).then(async (r) => (r.length || lang === 'en' ? r : wikipedia(lat, lon, 'en'))),
    googlePlaces(lat, lon, lang),
  ]);
  return json(
    {
      place: settle(place),
      weather: settle(wx),
      wikipedia: settle(wiki) ?? [],
      places: settle(gplaces) ?? [],
    },
    { cacheSeconds: 900 },
  );
});
