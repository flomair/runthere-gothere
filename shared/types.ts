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

export type RouteMode = 'foot' | 'hike' | 'bike' | 'direct';

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
  user: { uid: string; email: string; name?: string; picture?: string; isAdmin: boolean };
  strava: { athlete: Athlete; lastSyncAt?: string; syncedFrom?: number } | null;
  /** The user's own stored Anthropic key (masked), if any. */
  ai: { masked: string; workspaceId?: string } | null;
  features: { strava: boolean; mapillary: boolean; googlePlaces: boolean };
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

export interface TrailSearchResult {
  /** OSM relation id. */
  osmId: number;
  name: string;
  ref?: string;
  /** International / National / Regional / Local */
  network?: string;
  itinerary?: string;
  source: 'waymarked' | 'nominatim';
}

export interface TrailRoute extends PlannedRoute {
  trail: {
    osmId: number;
    name: string;
    ref?: string;
    from?: string;
    to?: string;
    website?: string;
    wikipedia?: string;
  };
  startName: string;
  endName: string;
}

// ---------- journeys (stored per user in Firestore) ----------

export interface Waypoint {
  name: string;
  lat: number;
  lon: number;
}

export interface ManualEntry {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  distanceM: number;
  note?: string;
  movingTimeS?: number;
  elevationGainM?: number;
  /** Set when imported from a GPX/TCX/FIT file. */
  source?: 'file';
}

/** "Reach <place> by <date>" */
export interface Challenge {
  id: string;
  title: string;
  /** Distance along the route (true metres) to reach. */
  targetM: number;
  /** YYYY-MM-DD */
  deadline: string;
  createdAt: string;
}

export interface Journey {
  id: string;
  name: string;
  createdAt: string;
  /** Only activities on/after this local date (YYYY-MM-DD) count. */
  startDate: string;
  /** Strava sport types that move you forward, e.g. Run, TrailRun. */
  sportTypes: string[];
  useStrava: boolean;
  manualEntries: ManualEntry[];
  excludedActivityIds: number[];
  waypoints: Waypoint[];
  mode: RouteMode | 'gpx' | 'trail';
  /** Set for journeys along a named OSM trail. */
  trail?: { osmId: number; name: string; ref?: string; website?: string; wikipedia?: string };
  route: { points: LatLon[]; totalM: number; provider: string };
  /** Progress when the journey was last opened – used for the "since last time" banner. */
  lastSeen?: { doneM: number; at: string };
  /** Arrive by this date (YYYY-MM-DD). */
  goalDate?: string;
  challenges?: Challenge[];
  /** Count climbing: every 100 m of ascent adds 1 km ("effort km"). */
  countElevation?: boolean;
  /** Elevation profile: `elevations[i]` is the altitude at i·stepM along the route (true metres). */
  profile?: { stepM: number; elevations: number[] };
}


// ---------- milestones & postcards ----------

export type MilestoneKind = 'waypoint' | 'distance' | 'halfway' | 'border' | 'finish';

export interface Milestone {
  /** `${journeyId}_${kind}_${key}` – stable, so a milestone is only created once */
  id: string;
  journeyId: string;
  kind: MilestoneKind;
  /** Distance along the route (true metres). */
  atM: number;
  title: string;
  lat: number;
  lon: number;
  /** Date of the run that got you there (YYYY-MM-DD or ISO). */
  reachedAt: string;
  createdAt: string;
  place?: { name: string; context: string };
  /** ISO 3166-1 alpha-2, for border crossings. */
  countryCode?: string;
  photo?: { url: string; credit?: string; pageUrl?: string };
  postcard?: { text: string; at: string };
  seen?: boolean;
}
