import { randomBytes } from 'node:crypto';
import { authed } from '../server/access.js';
import { HttpError, json, readJson } from '../server/http.js';
import { repo } from '../server/repo.js';
import type { Bookmark } from '../shared/types.js';

/** GET ?journeyId – bookmarked places (for the trip planner). */
export const GET = authed(async (req, user) => {
  const journeyId = new URL(req.url).searchParams.get('journeyId') ?? undefined;
  return json({ bookmarks: await repo.listBookmarks(user.uid, journeyId) }, { headers: { 'Cache-Control': 'no-store' } });
});

/** POST { journeyId, kind, title, subtitle?, url?, lat, lon } */
export const POST = authed(async (req, user) => {
  const b = await readJson<Partial<Bookmark>>(req);
  if (!b.journeyId || !b.title || !['wiki', 'place', 'spot'].includes(b.kind ?? '') || !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) throw new HttpError(400, 'invalid bookmark');
  const url = typeof b.url === 'string' && /^https:\/\//.test(b.url) ? b.url.slice(0, 500) : undefined;
  const bm: Bookmark = {
    id: randomBytes(8).toString('base64url'),
    journeyId: b.journeyId,
    kind: b.kind as Bookmark['kind'],
    title: b.title.slice(0, 200),
    subtitle: b.subtitle?.slice(0, 300),
    url,
    lat: b.lat!,
    lon: b.lon!,
    createdAt: new Date().toISOString(),
  };
  await repo.putBookmark(user.uid, bm);
  return json({ bookmark: bm });
});

/** DELETE ?id */
export const DELETE = authed(async (req, user) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new HttpError(400, 'missing id');
  await repo.deleteBookmark(user.uid, id);
  return json({ ok: true });
});
