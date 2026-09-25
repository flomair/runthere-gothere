import { HttpError, handle } from './http.js';
import { verifyIdToken } from './firebase.js';
import { repo } from './repo.js';

export interface User {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
  isAdmin: boolean;
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '').split(/[,\s;]+/).filter(Boolean).map(normalizeEmail);
}

/**
 * Verifies the Firebase ID token (Authorization: Bearer …) and checks the allowlist.
 * 401 = not signed in, 403 = signed in but not allowed.
 */
export async function requireUser(req: Request): Promise<User> {
  const header = req.headers.get('authorization') ?? '';
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
  if (!token) throw new HttpError(401, 'Please sign in');
  let t;
  try {
    t = await verifyIdToken(token);
  } catch {
    throw new HttpError(401, 'Your sign-in expired. Please sign in again.');
  }
  if (!t.email || !t.emailVerified) throw new HttpError(403, 'not_allowed: a verified Google email is required');
  const email = normalizeEmail(t.email);
  const isAdmin = adminEmails().includes(email);
  if (!isAdmin && !(await repo.isAllowed(email))) throw new HttpError(403, `not_allowed: ${email}`);
  return { uid: t.uid, email, name: t.name, picture: t.picture, isAdmin };
}

/** Like `handle`, but only for signed-in, allowlisted users. */
export function authed(fn: (req: Request, user: User) => Promise<Response>) {
  return handle(async (req) => fn(req, await requireUser(req)));
}

/** Only for admins (ADMIN_EMAILS). */
export function adminOnly(fn: (req: Request, user: User) => Promise<Response>) {
  return authed(async (req, user) => {
    if (!user.isAdmin) throw new HttpError(403, 'Admins only');
    return fn(req, user);
  });
}
