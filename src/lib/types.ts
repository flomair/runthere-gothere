import type { LatLon } from '../../shared/geo';
import type { RouteMode } from '../../shared/types';

export type * from '../../shared/types';

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
}

export const SPORT_TYPES: { value: string; label: string }[] = [
  { value: 'Run', label: 'Run' },
  { value: 'TrailRun', label: 'Trail run' },
  { value: 'VirtualRun', label: 'Treadmill / virtual run' },
  { value: 'Walk', label: 'Walk' },
  { value: 'Hike', label: 'Hike' },
  { value: 'Ride', label: 'Ride' },
  { value: 'GravelRide', label: 'Gravel ride' },
  { value: 'MountainBikeRide', label: 'MTB ride' },
  { value: 'VirtualRide', label: 'Virtual ride' },
  { value: 'Swim', label: 'Swim' },
  { value: 'NordicSki', label: 'Nordic ski' },
  { value: 'InlineSkate', label: 'Inline skate' },
];
