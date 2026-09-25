import { adminEmails, normalizeEmail, type User } from './access.js';
import { repo } from './repo.js';

/** Invited friends must be able to sign in: admins add them to the allowlist, others get told who's missing. */
export async function ensureAllowed(user: User, emails: string[]): Promise<string[]> {
  const admins = new Set(adminEmails());
  const missing: string[] = [];
  for (const e of emails.map(normalizeEmail)) {
    if (!e || admins.has(e) || (await repo.isAllowed(e))) continue;
    if (user.isAdmin) await repo.allow({ email: e, addedBy: user.email, addedAt: new Date().toISOString() });
    else missing.push(e);
  }
  return missing;
}
