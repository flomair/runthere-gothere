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
  /** Entered by hand on Strava, not recorded: doesn't count for quests and race stages. */
  manual?: boolean;
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
  lat?: number;
  lon?: number;
}

export interface NearbyPlace {
  id: string;
  name: string;
  type?: string;
  rating?: number;
  ratingCount?: number;
  mapsUrl?: string;
  distanceM: number;
  lat?: number;
  lon?: number;
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

/**
 * One leg of a journey: from the previous destination (or the start) to the next one.
 * The journey's `route` and `waypoints` hold all legs joined into one continuous line;
 * a leg records where it begins in them.
 */
export interface JourneyLeg {
  id: string;
  /** Distance along the whole journey where this leg starts (true metres). */
  startM: number;
  /** Length of this leg (true metres). */
  totalM: number;
  /** Index in `journey.waypoints` of the leg's start (the previous destination). */
  waypointIndex: number;
  /** Index in `journey.route.points` of the leg's start. */
  pointIndex: number;
  mode: RouteMode | 'gpx' | 'trail';
  provider: string;
  createdAt: string;
}

export interface Journey {
  /** Data version; see shared/legs.ts `migrateJourney`. Missing = 1 (before legs existed). */
  schemaVersion?: number;
  /** Legs of the journey in order (added by migration for older journeys). */
  legs?: JourneyLeg[];
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
  /** A real race at the destination: the journey is the build-up. */
  event?: RaceEvent;
  /** Savings jar: put money aside for every kilometre. */
  savings?: { perKm: number; currency: string };
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
  /** Virtual rewards for reaching a city (stops and destinations). */
  unlocks?: CityUnlocks;
}

/** What reaching a city unlocks. The audio story is the postcard read aloud; the postcard image is `photo`. */
export interface CityUnlocks {
  /** Passport stamp, drawn in the app from these values. */
  stamp: { label: string; date: string; countryCode?: string; hue: number };
  funFact?: { text: string; source: 'wikipedia' | 'ai'; url?: string };
  /** A song that fits the place (suggested by the AI); the app links to music services. */
  song?: { title: string; artist: string };
  generatedAt: string;
}

// ---------- gifts, rewards & prizes ----------

/**
 * How a gift, reward or prize is delivered. Today everything is a promise tracked in the app;
 * gift cards and payments can be added later by filling in the other kinds without changing
 * the documents that hold a fulfillment.
 */
export interface Fulfillment {
  kind: 'promise' | 'giftCard' | 'payment';
  status: 'pending' | 'fulfilled' | 'cancelled';
  /** e.g. the provider of a gift card or payment. */
  provider?: string;
  /** Provider reference (voucher code id, payment id …). */
  ref?: string;
  amount?: { value: number; currency: string };
  note?: string;
  fulfilledAt?: string;
}

/** A real-life treat the user pins at a point on their route; it unlocks only there. */
export interface Reward {
  id: string;
  journeyId: string;
  title: string;
  /** Storage path of an optional photo (see /api/uploads). */
  photo?: string;
  /** Optional shop link. */
  link?: string;
  /** Distance along the journey where it unlocks (true metres). */
  atM: number;
  status: 'locked' | 'unlocked' | 'claimed';
  createdAt: string;
  unlockedAt?: string;
  claimedAt?: string;
  /** Storage path of an optional photo taken when claiming. */
  claimPhoto?: string;
  claimNote?: string;
  fulfillment: Fulfillment;
}

// ---------- side quests: friend challenges ----------

export type QuestType = 'distance' | 'habit' | 'race' | 'speed';

export interface QuestParams {
  /** distance: total in the window; race: first to this; speed: length of the one run. */
  distanceM?: number;
  /** habit: runs needed in each week. */
  runsPerWeek?: number;
  /** speed: the run must take at most this (moving time). */
  timeS?: number;
}

export interface QuestPerson {
  uid?: string;
  email: string;
  name: string;
  picture?: string;
}

export type QuestStatus = 'offered' | 'accepted' | 'declined' | 'cancelled' | 'won' | 'lost' | 'expired';

export interface QuestProgress {
  /** Recipient's value (metres, runs or completed weeks, depending on the type). */
  value: number;
  target: number;
  /** race only: the challenger's value. */
  rival?: number;
  /** habit only: runs so far in the current week. */
  weekRuns?: number;
  /** speed only: best qualifying time so far (s). */
  bestS?: number;
  updatedAt: string;
}

export interface Quest {
  id: string;
  type: QuestType;
  params: QuestParams;
  /** Length of the window, counted from acceptance. */
  days: number;
  from: QuestPerson & { uid: string };
  to: QuestPerson;
  message?: string;
  /** What the challenger promises if the recipient wins. */
  gift: { text: string; fulfillment: Fulfillment };
  /** Optional fun penalty if the recipient loses. */
  penalty?: string;
  status: QuestStatus;
  createdAt: string;
  respondedAt?: string;
  /** Window (set on acceptance). */
  startsAt?: string;
  endsAt?: string;
  /** Where the recipient shows the quest: branch off this journey at this point (true metres). */
  journeyId?: string;
  branchAtM?: number;
  progress?: QuestProgress;
  resolvedAt?: string;
  /** uid of whoever completed it (the recipient, or the faster runner in a race). */
  winnerUid?: string;
  badge?: { emoji: string; label: string };
}

// ---------- friends: shared journeys ----------

export type GroupMode = 'race' | 'relay';

export interface GroupMember {
  uid: string;
  name: string;
  email: string;
  picture?: string;
  joinedAt: string;
}

export interface Group {
  id: string;
  name: string;
  mode: GroupMode;
  ownerUid: string;
  memberUids: string[];
  members: Record<string, GroupMember>;
  invitedEmails: string[];
  route: Journey['route'];
  waypoints: Waypoint[];
  startDate: string;
  sportTypes: string[];
  countElevation?: boolean;
  createdAt: string;
  /** Promised to whoever wins the most race stages, handed over at the final destination. */
  bonusPrize?: { text: string; setBy: string; fulfillment: Fulfillment };
  /** Set while the surprise bucket is low (so the group is told once). */
  bucketLowSince?: string;
}

export interface StageResult {
  uid: string;
  /** Tracked distance in the stage window. */
  distanceM: number;
  /** Locked baseline: average weekly distance of the 4 weeks before the start. */
  baselineM: number;
  /** Distance ÷ (baseline × weeks in the window); 1 = as much as usual. */
  effort: number;
}

export interface Stage {
  id: string;
  groupId: string;
  name: string;
  /** Segment of the group route (true metres). */
  fromM: number;
  toM: number;
  /** Window in each runner's local dates, both inclusive (YYYY-MM-DD). */
  startDate: string;
  endDate: string;
  participants: string[];
  /** Locked when the stage starts. */
  baselines?: Record<string, number>;
  prize: { text: string; fulfillment: Fulfillment };
  createdBy: string;
  createdAt: string;
  status: 'scheduled' | 'running' | 'finished' | 'cancelled';
  results?: StageResult[];
  leaderUid?: string;
  winnerUid?: string;
  finishedAt?: string;
}

// ---------- group surprise bucket ----------

export type PrizeTier = 'small' | 'medium' | 'rare';

export interface Prize {
  id: string;
  groupId: string;
  title: string;
  tier: PrizeTier;
  addedBy: string;
  /** Hide who added it, also after it is drawn. */
  anonymous: boolean;
  createdAt: string;
  status: 'available' | 'drawn' | 'delivered';
  drawnBy?: string;
  drawnAt?: string;
  drawId?: string;
  deliveredAt?: string;
  deliveredPhoto?: string;
  deliveredNote?: string;
  fulfillment: Fulfillment;
}

export type DrawSource = 'pin' | 'stage' | 'drop' | 'milestone';

/** A chance to draw from the bucket, earned by a member. Also the log of what was drawn. */
export interface Draw {
  id: string;
  groupId: string;
  uid: string;
  source: DrawSource;
  label: string;
  /** ≥ 1: better achievements raise the odds of a rare prize. */
  boost: number;
  earnedAt: string;
  usedAt?: string;
  prizeId?: string;
  tier?: PrizeTier;
  /** Tier odds at the moment of drawing (for the log). */
  odds?: Record<PrizeTier, number>;
}

/** What a member sees of the bucket: available prizes stay hidden except your own. */
export interface BucketView {
  counts: Record<PrizeTier, number>;
  /** Available prizes you could draw (not your own). */
  drawable: number;
  low: boolean;
  lowThreshold: number;
  mine: Prize[];
  revealed: (Prize & { giverName?: string; drawnByName?: string })[];
  draws: Draw[];
  pins: { key: string; m: number; collected: boolean }[];
}

/** Home-screen summary of group games (see routes/play.ts). */
export interface PlaySummary {
  draws: { groupId: string; groupName: string; count: number }[];
  stages: {
    groupId: string;
    groupName: string;
    id: string;
    name: string;
    status: Stage['status'];
    startDate: string;
    endDate: string;
    prize: string;
    rank?: number;
    of: number;
    effort?: number;
    leaderName?: string;
  }[];
}

export interface Standing {
  uid: string;
  name: string;
  picture?: string;
  /** Race: own distance along the route. Relay: this member's contribution. */
  distanceM: number;
  /** Race: position along the route (≤ total). */
  doneM: number;
  lastActivity?: string;
  weeklyAvgM: number;
  point: LatLon;
  finishedOn?: string;
}

export interface GroupStandings {
  group: Group;
  standings: Standing[];
  /** Relay: the team's combined distance along the route. */
  team?: { doneM: number; point: LatLon; finishedOn?: string };
}

export interface FeedComment {
  uid: string;
  name: string;
  text: string;
  at: string;
}

export interface FeedItem {
  id: string;
  type: 'milestone' | 'post' | 'join' | 'stage';
  uid: string;
  name: string;
  picture?: string;
  text: string;
  milestone?: { kind: MilestoneKind; title: string; atM: number; countryCode?: string };
  createdAt: string;
  kudos: string[];
  comments: FeedComment[];
}

/** What a public share link shows (no personal data beyond a first name). */
export interface PublicJourney {
  name: string;
  ownerFirstName: string;
  from: string;
  to: string;
  totalM: number;
  doneM: number;
  points: LatLon[];
  position: LatLon;
  place?: string;
  updatedAt: string;
}

// ---------- coach, real race, trip planner ----------

export interface RaceEvent {
  name: string;
  /** YYYY-MM-DD */
  date: string;
  url?: string;
}

export type WorkoutType = 'easy' | 'long' | 'tempo' | 'intervals' | 'recovery' | 'rest' | 'cross';

export interface CoachPlan {
  weekOf: string;
  summary: string;
  targetKm: number;
  days: { day: string; type: WorkoutType; distanceKm: number; title: string; details: string }[];
  tip: string;
  createdAt: string;
}

export interface Bookmark {
  id: string;
  journeyId: string;
  kind: 'wiki' | 'place' | 'spot';
  title: string;
  subtitle?: string;
  url?: string;
  lat: number;
  lon: number;
  createdAt: string;
}

export interface AdminUserRow {
  uid: string;
  email?: string;
  name?: string;
  lastLoginAt?: string;
  strava?: { athleteName?: string; lastSyncAt?: string } | null;
  hasAiKey: boolean;
  stats: { stories?: number; postcards?: number; coachPlans?: number };
}
