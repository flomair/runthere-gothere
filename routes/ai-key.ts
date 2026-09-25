import { authed } from '../server/access.js';
import { aiKeyFor, deleteAiKey, saveAiKey } from '../server/aikey.js';
import { json, readJson } from '../server/http.js';
import { checkKey } from '../server/narrate.js';

/** PUT { key, workspaceId? } – validate and store the user's own Anthropic key (encrypted). */
export const PUT = authed(async (req, user) => {
  const body = await readJson<{ key?: string; workspaceId?: string }>(req);
  const r = await saveAiKey(user.uid, body.key ?? '', body.workspaceId);
  return json(r, { status: r.ok ? 200 : 400 });
});

/** POST – test the stored key without spending tokens. */
export const POST = authed(async (_req, user) => {
  const k = await aiKeyFor(user.uid);
  if (!k) return json({ ok: false, error: 'No key stored yet.' }, { status: 400 });
  return json(await checkKey(k));
});

/** DELETE – forget the stored key. */
export const DELETE = authed(async (_req, user) => {
  await deleteAiKey(user.uid);
  return json({ ok: true });
});
