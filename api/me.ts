import { handle, json } from '../server/http.js';
import { readSession } from '../server/session.js';
import { googlePlacesEnabled } from '../server/surroundings.js';

export const GET = handle(async (req) => {
  const stravaConfigured = Boolean(
    process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET && process.env.SESSION_SECRET,
  );
  const session = stravaConfigured ? readSession(req) : null;
  return json(
    {
      athlete: session?.athlete ?? null,
      features: {
        strava: stravaConfigured,
        mapillary: Boolean(process.env.MAPILLARY_TOKEN),
        googlePlaces: googlePlacesEnabled(),
        ai: Boolean(process.env.ANTHROPIC_API_KEY),
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
