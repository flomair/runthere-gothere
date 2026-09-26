import { authed } from '../server/access.js';
import { HttpError, json } from '../server/http.js';
import { MAX_UPLOAD_BYTES, assertOwnPhoto, blobs, savePhoto } from '../server/storage.js';

/** POST /api/uploads (body: the image, Content-Type image/jpeg|png|webp) → { path } */
export const POST = authed(async (req, user) => {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Photo too large (max 3 MB).');
  const bytes = new Uint8Array(await req.arrayBuffer());
  const path = await savePhoto(user.uid, bytes, (req.headers.get('content-type') ?? '').split(';')[0].trim());
  return json({ path });
});

/** GET /api/uploads?path=… → { url } – a signed link valid for an hour. */
export const GET = authed(async (req, user) => {
  const path = new URL(req.url).searchParams.get('path') ?? '';
  assertOwnPhoto(user.uid, path);
  return json({ url: await blobs().signedUrl(path, 3600) }, { headers: { 'Cache-Control': 'private, max-age=3000' } });
});
