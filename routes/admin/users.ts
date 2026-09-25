import { adminOnly } from '../../server/access.js';
import { json } from '../../server/http.js';
import { repo } from '../../server/repo.js';
import type { AdminUserRow } from '../../shared/types.js';

/** GET /api/admin/users – usage overview (no secrets, no activity details). */
export const GET = adminOnly(async () => {
  const users = await repo.listUsers();
  const rows: AdminUserRow[] = await Promise.all(
    users.map(async (u) => ({
      uid: u.uid,
      email: u.email,
      name: u.name,
      lastLoginAt: u.lastLoginAt,
      strava: u.strava ? { athleteName: [u.strava.firstname, u.strava.lastname].filter(Boolean).join(' ') || undefined, lastSyncAt: u.strava.lastSyncAt } : null,
      hasAiKey: await repo.hasAiKey(u.uid),
      stats: u.stats ?? {},
    })),
  );
  rows.sort((a, b) => (b.lastLoginAt ?? '').localeCompare(a.lastLoginAt ?? ''));
  return json({ users: rows }, { headers: { 'Cache-Control': 'no-store' } });
});
