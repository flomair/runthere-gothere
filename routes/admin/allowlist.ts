import { adminEmails, adminOnly, normalizeEmail } from '../../server/access.js';
import { HttpError, json, readJson } from '../../server/http.js';
import { repo } from '../../server/repo.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GET – admins (from ADMIN_EMAILS) and allowlisted users. */
export const GET = adminOnly(async () => {
  return json({ admins: adminEmails(), allowed: await repo.listAllowed() }, { headers: { 'Cache-Control': 'no-store' } });
});

/** POST { email } – allow a Google account. */
export const POST = adminOnly(async (req, user) => {
  const { email } = await readJson<{ email?: string }>(req);
  const e = normalizeEmail(email ?? '');
  if (!EMAIL.test(e)) throw new HttpError(400, 'Please enter a valid email address');
  await repo.allow({ email: e, addedBy: user.email, addedAt: new Date().toISOString() });
  return json({ ok: true });
});

/** DELETE ?email=… – revoke access. */
export const DELETE = adminOnly(async (req) => {
  const e = normalizeEmail(new URL(req.url).searchParams.get('email') ?? '');
  if (!e) throw new HttpError(400, 'missing email');
  await repo.disallow(e);
  return json({ ok: true });
});
