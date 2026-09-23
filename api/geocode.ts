import { HttpError, handle, json } from '../server/http.js';
import { geocode } from '../server/places.js';

export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) throw new HttpError(400, 'query too short');
  const results = await geocode(q.slice(0, 200), url.searchParams.get('lang') ?? 'en');
  return json({ results }, { cacheSeconds: 86_400 });
});
