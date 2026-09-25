import { authed } from '../server/access.js';
import { json } from '../server/http.js';
import { repo } from '../server/repo.js';
import { googlePlacesEnabled } from '../server/surroundings.js';
import type { MeResponse } from '../shared/types.js';

/** GET /api/me – the signed-in user, connection state and available features. */
export const GET = authed(async (_req, user) => {
  const doc = await repo.getUser(user.uid);
  await repo.updateUser(user.uid, {
    email: user.email,
    name: user.name,
    picture: user.picture,
    lastLoginAt: new Date().toISOString(),
  });
  const s = doc?.strava;
  const body: MeResponse = {
    user: { uid: user.uid, email: user.email, name: user.name, picture: user.picture, isAdmin: user.isAdmin },
    strava: s
      ? { athlete: { id: s.athleteId, firstname: s.firstname, lastname: s.lastname, profile: s.profile }, lastSyncAt: s.lastSyncAt, syncedFrom: s.syncedFrom }
      : null,
    ai: doc?.ai ? { masked: doc.ai.masked, workspaceId: doc.ai.workspaceId } : null,
    features: {
      strava: Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET),
      mapillary: Boolean(process.env.MAPILLARY_TOKEN),
      googlePlaces: googlePlacesEnabled(),
    },
  };
  return json(body, { headers: { 'Cache-Control': 'no-store' } });
});
