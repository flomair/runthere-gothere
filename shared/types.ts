import type { LatLon } from './geo.js';

/** Types shared between the Vercel API (/api, /server) and the React client (/src). */

export interface Activity {
  id: number;
  name: string;
  sportType: string;
  distanceM: number;
  movingTimeS: number;
  elevationGainM: number;
  startDate: string;
  startDateLocal: string;
}

export interface GeoResult {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
}

export interface PlaceName {
  /** Short locality name, e.g. "Dresden". */
  name: string;
  /** Region / country context, e.g. "Saxony, Germany". */
  context: string;
  displayName: string;
  countryCode?: string;
}

export type RouteMode = 'foot' | 'bike' | 'direct';

export interface PlannedRoute {
  points: LatLon[];
  totalM: number;
  provider: string;
  /** Set when the preferred router failed and a fallback was used. */
  notice?: string;
}

export interface Photo {
  id: string;
  source: 'mapillary' | 'wikimedia';
  thumbUrl: string;
  fullUrl: string;
  pageUrl: string;
  title: string;
  author?: string;
  license?: string;
  /** ISO date the photo was taken (best effort). */
  takenAt?: string;
  lat: number;
  lon: number;
  distanceM: number;
}

export interface Weather {
  temperatureC: number;
  apparentC: number;
  windKmh: number;
  precipitationMm: number;
  weatherCode: number;
  isDay: boolean;
  time: string;
  timezone: string;
  today?: { maxC: number; minC: number; sunrise: string; sunset: string };
}

export interface WikiArticle {
  title: string;
  extract: string;
  url: string;
  thumbUrl?: string;
  distanceM: number;
  lang: string;
}

export interface NearbyPlace {
  id: string;
  name: string;
  type?: string;
  rating?: number;
  ratingCount?: number;
  mapsUrl?: string;
  distanceM: number;
  review?: { author?: string; rating?: number; text: string; when?: string };
}

export interface Athlete {
  id: number;
  firstname?: string;
  lastname?: string;
  profile?: string;
}

export interface MeResponse {
  athlete: Athlete | null;
  features: { strava: boolean; mapillary: boolean; googlePlaces: boolean; ai: boolean };
}

export interface SurroundingsResponse {
  place: PlaceName | null;
  weather: Weather | null;
  wikipedia: WikiArticle[];
  places: NearbyPlace[];
}

export type NarrationStyle = 'travelogue' | 'postcard' | 'coach' | 'kids';

export interface NarrateRequest {
  lat: number;
  lon: number;
  /** ISO 639-1 language code for the narration. */
  language: string;
  style: NarrationStyle;
  journey: {
    name: string;
    from: string;
    to: string;
    totalM: number;
    doneM: number;
    sinceLastM?: number;
    previousPlace?: string;
    lastActivity?: { name: string; distanceM: number; date: string };
    upcoming?: { name: string; inM: number }[];
  };
  /** Set when narrating a look-ahead point rather than the current position. */
  peek?: { aheadM: number };
  photoTitles?: string[];
}
