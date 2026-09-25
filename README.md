# Run There · Go There

Turn your Strava runs into a virtual journey between real places.

Plan a route, for example **Berlin → Vienna** (≈ 680 km on footpaths). Every run you log on Strava moves you along it. At any time you can see:

- **where you'd be now** on a map, with the covered part highlighted
- **what it looks like there**: recent street-level photos (Mapillary) and geotagged photos (Wikimedia Commons), plus Street View, satellite and terrain map layers
- **the surroundings**: live weather at your virtual position, nearby Wikipedia articles and top-rated places with Google reviews
- **an AI travel narrator** (Claude). It combines all of that with your progress into a travelogue entry, including an *excursus*, a book-style digression into the local history or culture. You can have it read aloud.
- **what's coming**: preview any point further along the route
- **your stats**: km covered and remaining, weekly pace, estimated arrival date, and a logbook of the activities that got you there

Once you arrive, go there for real. 🏁

## Stack

- **React 19 + TypeScript + Vite + MUI**, with Leaflet / react-leaflet for the map
- **Vercel Functions** in `/api` (Web-standard `Request → Response` handlers)
- No database: Strava tokens live in an **AES-GCM encrypted httpOnly cookie**, and journeys are stored in the browser (`localStorage`, with JSON export/import)

```
api/            Vercel functions (thin handlers)
  auth/         Strava OAuth: login, callback, logout
  activities.ts Strava activities since a date
  route.ts      route planning (OSRM foot/bike → BRouter → great circle fallback)
  geocode.ts    place search (Nominatim)
  photos.ts     Mapillary + Wikimedia Commons photos near a point
  surroundings.ts  place name, weather, Wikipedia, Google places
  narrate.ts    AI narrator (streams text)
server/         server-side logic used by the functions
shared/         code shared by client and server (geo math, types, weather codes)
src/            React app
test/           Vitest unit tests (external APIs are mocked)
```

## Data sources

| What | Source | Key needed |
| --- | --- | --- |
| Activities | Strava API | Strava API app (required for syncing) |
| Routing | [routing.openstreetmap.de](https://routing.openstreetmap.de) (OSRM foot/bike), [BRouter](https://brouter.de) fallback | no |
| Place search / names | OpenStreetMap Nominatim | no (set `CONTACT_EMAIL` as their policy asks) |
| Weather | [Open-Meteo](https://open-meteo.com) | no |
| Wikipedia | Wikipedia geosearch (in your browser language, English fallback) | no |
| Photos | Wikimedia Commons, [Mapillary](https://www.mapillary.com/developer) | Mapillary optional |
| Places & reviews | Google Places API (New) | optional |
| AI narrator | Anthropic Claude (`claude-opus-5`) | server key **or** your own key in the app |
| Read aloud | Browser Web Speech API | no |

## Setup

### 1. Create a Strava API application

At <https://www.strava.com/settings/api>:

- **Authorization Callback Domain**: `localhost` for local dev, or your Vercel domain (e.g. `runthere-gothere.vercel.app`).
- Note the **Client ID** and **Client Secret**. That's all you need from Strava.
- Ignore *Your Access Token* / *Your Refresh Token* on that page. They only carry the `read` scope, which can't read activities. The app gets its own access and refresh tokens (with `activity:read_all`) when you click **Connect with Strava**, and renews them automatically.

### 2. Run locally

```bash
cp .env.example .env.local   # fill in STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, SESSION_SECRET
npm install
npm run dev                  # http://localhost:5173, the /api functions run inside Vite
```

`SESSION_SECRET` is **not** a Strava value: make up any long random string (`openssl rand -hex 32`). It encrypts the cookie that stores your Strava tokens.

### 3. Deploy to Vercel

1. Import the GitHub repo in Vercel. The framework (Vite) is detected from `vercel.json`.
2. Add the environment variables from `.env.example` under *Settings → Environment Variables*.
3. Deploy, then set your Strava app's callback domain to the Vercel domain.

### Optional extras

- `MAPILLARY_TOKEN`: recent street-level photos along the route.
- `GOOGLE_PLACES_API_KEY`: top-rated cafés, sights and parks with a review snippet. Without it the app links to Google Maps searches.
- `ANTHROPIC_API_KEY`: turns on the AI narrator for everyone using the deployment. Alternatively, each user can paste **their own Anthropic key** in the narrator settings. It stays in their browser, is sent only with narration requests (`x-anthropic-key` header) and is never stored on the server.

## AI narrator

When you press **"Tell me about this place"**, the server gathers context for the point: place name, live weather, nearby Wikipedia extracts, Google places and reviews (if enabled), photo titles, and your progress (distance covered, km since your last visit, latest run, upcoming waypoints). Claude then writes a text in one of these styles:

- **Travelogue with excursus** (default): arrival, a digression into one story tied to the place, then back on the road
- **Postcard**, **Running coach**, **Story for kids**

It is written in your browser's language and streamed as it is generated. **Read aloud** uses the browser's built-in voices (you pick the voice and speed in settings). Stories are cached per spot, so reopening doesn't cost another call.

## Scripts

```bash
npm run dev        # dev server incl. API
npm test           # unit tests (vitest)
npm run typecheck  # tsc -b
npm run build      # production build
```

## Notes & limits

- **Single-browser storage**: journeys live in `localStorage`. Use *Export / Import* to move them to another device.
- Public routing servers have fair-use limits. For very long routes the app falls back to another router or a great-circle line and tells you it did.
- Strava's API allows 100 requests / 15 min and 1000 / day per app. Activities are cached for 5 minutes in the client.
- Only activities with the selected sport types, on or after the journey's start date, count. Individual activities can be excluded in the logbook, and distance can be added manually (e.g. for a treadmill run you didn't record).
