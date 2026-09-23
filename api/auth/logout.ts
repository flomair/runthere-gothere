import { handle, json } from '../../server/http.js';
import { SESSION_COOKIE, clearCookie } from '../../server/session.js';

export const POST = handle(async (req) => {
  return json({ ok: true }, { headers: { 'Set-Cookie': clearCookie(req, SESSION_COOKIE) } });
});
