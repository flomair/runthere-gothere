<p align="center"><img src="public/logo.svg" width="120" alt="Run There · Go There logo"></p>

# Run There · Go There

Turn your Strava runs into a virtual journey between real places.

Plan a route, for example **Berlin → Vienna** (≈ 680 km on footpaths). Every run you log on Strava moves you along it. At any time you can see:

- **where you'd be now** on a map, with the covered part highlighted
- **what it looks like there**: recent street-level photos (Mapillary) and geotagged photos (Wikimedia Commons), plus Street View, satellite and terrain map layers
- **the surroundings**: live weather at your virtual position, nearby Wikipedia articles and top-rated places with Google reviews
- **an AI travel narrator** (Claude). It combines all of that with your progress into a travelogue entry, including an *excursus*, a book-style digression into the local history or culture. You can have it read aloud.
- **what's coming**: preview any point further along the route
- **one continuous journey**: pick a destination with stops on the way; once you arrive, pick the next destination and keep going on the same line (kilometres run past the old destination carry over). Change the destination or stops of the current leg at any time
- **classic trails**: pick a famous hiking trail (Rennsteig, West Highland Way, Camino Francés, E5, Pacific Crest Trail…) from the recommendations or search any waymarked route in OpenStreetMap
- **your stats**: km covered and remaining, weekly pace, estimated arrival date, and a logbook of the activities that got you there

- **a slideshow along the route**: street-level photos (Mapillary, or Wikimedia Commons) every 500 m of your last or next 10 km
- **3D flyover**: fly along your last 20 km, the next 20 km or the whole journey over satellite imagery and real terrain
- **the real trip**: save places while exploring, then plan the trip to the finish (race countdown, transport and stay links, KML export)
- **an app on your phone**: install it to the home screen (Android: *Install*; iPhone: Share → *Add to Home Screen*). It opens full screen and keeps working on a patchy connection

- **rewards on the route**: every city you reach unlocks a passport stamp, a fun fact (Wikipedia) and a song for the road, and the postcard can be read aloud. Pin your own treats (title, shop link, photo) at any kilometre ahead: they unlock only when you run there, and can be moved until then. Claim them with a photo for the gallery in *My collection*, and optionally fill a savings jar with an amount per km
- **side quests**: challenge a friend (someone you share a journey with, or anyone allowed in the app) to run X km in Y days, keep N runs a week, race to a distance, or run a distance under a time. They accept or decline; accepted quests branch off their route on the map, count only tracked runs from acceptance on, and never take kilometres away from the journey. The challenger promises a gift (and maybe a fun penalty); completing a quest earns a badge in *My collection*
- **English or German**: the app follows your browser language; switch any time in the account menu. Stories, coach plans and notifications follow the choice

Once you arrive, go there for real. 🏁

## Stack

- **React 19 + TypeScript + Vite + MUI**, with Leaflet / react-leaflet for the map
- **One Vercel Function** (`api/router.ts`) serving every `/api/*` URL. The handlers live in `/routes` as Web-standard `Request → Response` functions. This keeps the app within the Hobby plan's limit of 12 functions. Plus a daily **Vercel Cron**.
- **Firebase Authentication** (Google sign-in) and **Cloud Firestore**. Only the server talks to Firestore (Admin SDK); the database rules deny all browser access.
- Sign-in is required, and only admins (`ADMIN_EMAILS`) and people on the in-app **allowlist** can use the app.
- Strava tokens and each user's own Anthropic key are stored **AES-256-GCM encrypted** in Firestore.

```
api/router.ts   the single Vercel Function; vercel.json rewrites /api/<path> to it
routes/         the /api handlers (all require sign-in except Strava's callbacks and the cron)
  me.ts         the signed-in user, connections, features
  journeys.ts   list / save / delete journeys
  activities.ts synced Strava activities (from Firestore)
  strava/       connect, callback, sync, disconnect, webhook (Strava push events)
  cron/sync.ts  daily safety-net sync for everyone connected
  admin/        allowlist, Strava webhook registration (admins only)
  ai-key.ts     save / test / delete your own Anthropic key (encrypted)
  narrate.ts    AI narrator (streams text, saves the story)
  narrations.ts saved stories
  route.ts      route planning (OSRM foot/bike, BRouter hiking trails, great circle fallback)
  trails/       classic trails: search (Waymarked Trails / Nominatim) and route geometry (Overpass)
  geocode.ts    place search (Nominatim)
  photos.ts     Mapillary + Wikimedia Commons photos near a point
  surroundings.ts  place name, weather, Wikipedia, Google places
server/         server-side logic (access control, Firestore repository, Strava sync, crypto)
shared/         code shared by client and server (geo math, types, weather codes)
src/            React app
test/           Vitest tests (Firebase and external APIs mocked); test/e2e: browser smoke-test config
firestore.rules deny-all rules for direct database access
```

### How runs are synced

1. **Connect Strava** once. The app stores the refresh token encrypted and backfills your runs from the earliest journey start.
2. **Strava webhook:** Strava notifies `/api/strava/webhook` within seconds about new, edited or deleted activities of every connected user. The app re-fetches the activity with that user's token and stores it.
3. **Daily cron** (`/api/cron/sync`, 04:30 UTC) catches anything a webhook missed. **Sync now** in the account menu does the same on demand.
4. Journeys calculate progress from the stored activities, so no Strava calls are needed to show your progress.

## Data sources

| What | Source | Key needed |
| --- | --- | --- |
| Sign-in & data | Firebase Authentication (Google) + Cloud Firestore | Firebase project (free tier is plenty) |
| Activities | Strava API + webhooks | Strava API app |
| Routing | [routing.openstreetmap.de](https://routing.openstreetmap.de) (OSRM foot/bike), [BRouter](https://brouter.de) (hiking trails) | no |
| Classic trails | [Waymarked Trails](https://hiking.waymarkedtrails.org) search, [Overpass API](https://overpass-api.de) for the OSM relation geometry | no |
| Place search / names | OpenStreetMap Nominatim | no (set `CONTACT_EMAIL` as their policy asks) |
| Base map | OpenStreetMap tiles, recoloured to the app colours with a CSS filter; classic OSM, satellite and terrain as alternatives | no |
| Weather | [Open-Meteo](https://open-meteo.com) | no |
| Wikipedia | Wikipedia geosearch (in your browser language, English fallback) | no |
| Photos | Wikimedia Commons, [Mapillary](https://www.mapillary.com/developer) | Mapillary optional |
| Places & reviews | Google Places API (New) | optional |
| AI narrator | Anthropic Claude (`claude-sonnet-5`) | each user's own key (stored encrypted) |
| Read aloud | Google Cloud Text-to-Speech (Chirp 3 HD natural voices) via the Firebase service account; browser voices as fallback | no extra key; enable the API once |
| 3D flyover | [MapLibre GL](https://maplibre.org), Esri World Imagery, [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) | no |

## Setup

### 1. Firebase (Google sign-in + database)

1. Create a project at <https://console.firebase.google.com>. Google Analytics is not needed.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.**
3. **Authentication → Settings → Authorized domains:** add your Vercel domain (e.g. `runthere-gothere-dev.vercel.app`). `localhost` is already there.
4. **Build → Firestore Database → Create database** (production mode, a region near you). Under **Rules**, paste the contents of `firestore.rules` and publish.
5. **Web app config:** the config of the `run-there-go-threre` project is built into `src/lib/firebase.ts`. For a different Firebase project, set the `VITE_FIREBASE_*` variables (Project settings → General → Your apps → Web).
6. **Project settings → Service accounts → Generate new private key:** put the whole JSON into `FIREBASE_SERVICE_ACCOUNT` (raw, or base64 with `base64 -w0 key.json`). Keep it secret.
7. Set `ADMIN_EMAILS` to your Google address.

### 2. Strava API application

At <https://www.strava.com/settings/api>:

- **Authorization Callback Domain**: your Vercel domain, or `localhost` for local dev. Strava allows one domain per app; create a second app for development if you like.
- Copy the **Client ID** and **Client Secret**. Ignore *Your Access Token* / *Your Refresh Token*: the app gets its own tokens when you click **Connect with Strava**.

### 3. Secrets

- `SESSION_SECRET`: any long random string (`openssl rand -hex 32`). It encrypts stored tokens and keys; don't change it later.
- `CRON_SECRET`: any random string; protects the daily sync job.

### 4. Run locally

```bash
cp .env.example .env.local   # fill in the values from steps 1–3
npm install
npm run dev                  # http://localhost:5173, the /api functions run inside Vite
```

Webhooks can't reach `localhost`; use **Sync now** in the account menu while developing.

### 5. Deploy to Vercel

1. Add all variables from `.env.example` under *Settings → Environment Variables* (Production, and Preview if you use it), then redeploy.
2. Sign in with your admin account, open **Admin** in the account menu and click **Turn on** under *Automatic Strava sync*. This registers the webhook for your domain.
3. Add your friends' Google addresses on the same page.

### Optional extras

- `MAPILLARY_TOKEN`: recent street-level photos along the route.
- `GOOGLE_PLACES_API_KEY`: top-rated cafés, sights and parks with a review snippet. Without it the app links to Google Maps searches.

- `VITE_FIREBASE_VAPID_KEY`: turns on **push notifications** (milestones reached, kudos and comments from friends). In the Firebase console open *Project settings → Cloud Messaging → Web Push certificates* and click *Generate key pair*; copy the key. Each person then turns notifications on per device in the account menu. On iPhone this works only in the installed app (iOS 16.4+). Sending uses the service account you already set up.

- **Photos for rewards**: in the Firebase console open *Storage → Get started* (the project may need the Blaze plan). The bucket defaults to `<project-id>.firebasestorage.app`; set `FIREBASE_STORAGE_BUCKET` if yours differs. Photos are private to each user and shown through short-lived links. Without Storage, rewards work without photos.

- **Natural read-aloud voices**: in the Google Cloud console of your Firebase project, enable the *Cloud Text-to-Speech API* (APIs & Services → Library; the project needs billing turned on, Google includes a monthly free allowance). The app uses the service account you already set up. Until it's enabled, stories are read with the best voice of the device.

The Mapillary and Google keys are shared by everyone using the deployment. The AI narrator is not: **each user adds their own Anthropic key** in the narrator settings. The key is checked, stored encrypted in their account, and used only for their own stories. Organization-level keys also need the Workspace ID (Anthropic says "not scoped to a workspace" otherwise).

## Route options

When planning **From A to B** you choose how the route is drawn:

- **Footpaths** (default): the shortest walkable way on paths, tracks and quiet roads (OSRM foot).
- **Hiking trails**: BRouter's hiking profile, which prefers waymarked hiking routes and paths. Routes longer than 120 km are planned in sections in parallel. A section BRouter can't solve falls back to footpaths, and the app says so.
- **Bike routes**: cycle routes (OSRM bike), good for very long journeys.
- **Straight line**: as the crow flies.

The **Classic trail** tab follows an official waymarked trail exactly. It loads the OpenStreetMap route relation (including sub-relations of long trails such as the E-paths) and joins its pieces into one line. First it links pieces that touch, then it bridges small mapping gaps (≤ 5 km). Alternative variants and side trips are left out, and the app tells you how many km that was. **Reverse direction** flips the trail if you want to walk it the other way.

You can also **upload a GPX** from Komoot, Strava routes, Garmin or waymarkedtrails.org.

## AI narrator

When you press **"Tell me about this place"**, the server gathers context for the point: place name, live weather, nearby Wikipedia extracts, Google places and reviews (if enabled), photo titles, and your progress (distance covered, km since your last visit, latest run, upcoming waypoints). Claude then writes a text in one of these styles:

- **Travelogue with excursus** (default): arrival, a digression into one story tied to the place, then back on the road
- **Postcard**, **Running coach**, **Story for kids**

It is written in your browser's language and streamed as it is generated. **Read aloud** uses the browser's built-in voices (you pick the voice and speed in settings). Stories are saved in your account per spot and style, so reopening one doesn't cost another call, on any device.

## Scripts

```bash
npm run dev        # dev server incl. API
npm test           # unit tests (vitest)
npm run typecheck  # tsc -b
npm run build      # production build
```

## Notes & limits

- Journeys saved in the browser by earlier versions are uploaded to your account on first sign-in. *Export / Import* still works for backups.
- Public routing servers have fair-use limits. For very long routes the app falls back to another router or a great-circle line and tells you it did.
- Strava's API allows 100 requests / 15 min and 1000 / day per app, shared by all users. Webhooks plus stored activities keep usage low.
- Only activities with the selected sport types, on or after the journey's start date, count. Individual activities can be excluded in the logbook, and distance can be added manually (e.g. for a treadmill run you didn't record).
