import { authed } from '../server/access.js';
import { json } from '../server/http.js';
import { routeCountries } from '../server/milestones.js';
import { repo } from '../server/repo.js';

/**
 * GET /api/milestones?journeyId=… – reached milestones (with postcards) in route order, plus the
 * countries along that journey's route. Without journeyId: all milestones of the user.
 */
export const GET = authed(async (req, user) => {
  const journeyId = new URL(req.url).searchParams.get('journeyId') ?? undefined;
  const milestones = await repo.listMilestones(user.uid, journeyId);
  let countries: string[] | undefined;
  if (journeyId) {
    const j = (await repo.listJourneys(user.uid)).find((x) => x.id === journeyId);
    countries = j ? routeCountries(j) : [];
  }
  return json({ milestones, countries }, { headers: { 'Cache-Control': 'no-store' } });
});
