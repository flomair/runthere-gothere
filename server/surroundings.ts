import { haversine } from '../shared/geo.js';
import { fetchJson } from './http.js';
import type { Weather, WikiArticle, NearbyPlace } from '../shared/types.js';
export type { Weather, WikiArticle, NearbyPlace };

// ---------- Weather (Open-Meteo, no key) ----------

interface OpenMeteo {
  timezone: string;
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    wind_speed_10m: number;
    precipitation: number;
    weather_code: number;
    is_day: number;
  };
  daily?: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise: string[];
    sunset: string[];
  };
}

export async function weather(lat: number, lon: number): Promise<Weather> {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude', lat.toFixed(4));
  u.searchParams.set('longitude', lon.toFixed(4));
  u.searchParams.set('current', 'temperature_2m,apparent_temperature,wind_speed_10m,precipitation,weather_code,is_day');
  u.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,sunrise,sunset');
  u.searchParams.set('forecast_days', '1');
  u.searchParams.set('timezone', 'auto');
  const r = await fetchJson<OpenMeteo>(u.toString());
  const d = r.daily;
  return {
    temperatureC: r.current.temperature_2m,
    apparentC: r.current.apparent_temperature,
    windKmh: r.current.wind_speed_10m,
    precipitationMm: r.current.precipitation,
    weatherCode: r.current.weather_code,
    isDay: r.current.is_day === 1,
    time: r.current.time,
    timezone: r.timezone,
    today: d
      ? { maxC: d.temperature_2m_max[0], minC: d.temperature_2m_min[0], sunrise: d.sunrise[0], sunset: d.sunset[0] }
      : undefined,
  };
}

// ---------- Wikipedia nearby articles ----------

interface WikiResponse {
  query?: {
    pages?: {
      pageid: number;
      title: string;
      extract?: string;
      fullurl?: string;
      thumbnail?: { source: string };
      coordinates?: { lat: number; lon: number }[];
    }[];
  };
}

export async function wikipedia(lat: number, lon: number, lang: string, limit = 8): Promise<WikiArticle[]> {
  const safeLang = /^[a-z-]{2,12}$/.test(lang) ? lang : 'en';
  const u = new URL(`https://${safeLang}.wikipedia.org/w/api.php`);
  Object.entries({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'geosearch',
    ggscoord: `${lat}|${lon}`,
    ggsradius: '10000',
    ggslimit: String(limit),
    prop: 'extracts|pageimages|coordinates|info',
    exintro: '1',
    explaintext: '1',
    exsentences: '3',
    exlimit: 'max',
    piprop: 'thumbnail',
    pithumbsize: '400',
    inprop: 'url',
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetchJson<WikiResponse>(u.toString());
  return (r.query?.pages ?? [])
    .map((p) => {
      const c = p.coordinates?.[0];
      return {
        title: p.title,
        extract: p.extract ?? '',
        url: p.fullurl ?? `https://${safeLang}.wikipedia.org/?curid=${p.pageid}`,
        thumbUrl: p.thumbnail?.source,
        distanceM: c ? haversine([lat, lon], [c.lat, c.lon]) : Number.POSITIVE_INFINITY,
        lang: safeLang,
      };
    })
    .sort((a, b) => a.distanceM - b.distanceM);
}

// ---------- Google Places (optional, needs GOOGLE_PLACES_API_KEY) ----------

interface PlacesResponse {
  places?: {
    id: string;
    displayName?: { text: string };
    primaryTypeDisplayName?: { text: string };
    rating?: number;
    userRatingCount?: number;
    googleMapsUri?: string;
    location?: { latitude: number; longitude: number };
    reviews?: {
      rating?: number;
      text?: { text: string };
      relativePublishTimeDescription?: string;
      authorAttribution?: { displayName?: string };
    }[];
  }[];
}

export const googlePlacesEnabled = () => Boolean(process.env.GOOGLE_PLACES_API_KEY);

export async function googlePlaces(lat: number, lon: number, lang: string, limit = 8): Promise<NearbyPlace[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return [];
  const r = await fetchJson<PlacesResponse>('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.primaryTypeDisplayName,places.rating,places.userRatingCount,places.googleMapsUri,places.location,places.reviews',
    },
    body: JSON.stringify({
      includedTypes: ['tourist_attraction', 'restaurant', 'cafe', 'bakery', 'park', 'museum'],
      maxResultCount: limit,
      rankPreference: 'POPULARITY',
      languageCode: lang,
      locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: 5000 } },
    }),
  });
  return (r.places ?? []).map((p) => {
    const rv = p.reviews?.find((x) => x.text?.text);
    return {
      id: p.id,
      name: p.displayName?.text ?? 'Unnamed place',
      type: p.primaryTypeDisplayName?.text,
      rating: p.rating,
      ratingCount: p.userRatingCount,
      mapsUrl: p.googleMapsUri,
      distanceM: p.location ? haversine([lat, lon], [p.location.latitude, p.location.longitude]) : 0,
      review: rv
        ? {
            author: rv.authorAttribution?.displayName,
            rating: rv.rating,
            text: rv.text!.text,
            when: rv.relativePublishTimeDescription,
          }
        : undefined,
    };
  });
}
