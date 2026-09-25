import { handle, json } from '../server/http.js';
import { checkKey } from '../server/narrate.js';

/** POST /api/ai-check – verifies the caller's key (x-anthropic-key) or the server key. Spends no tokens. */
export const POST = handle(async (req) => {
  return json(await checkKey(req.headers.get('x-anthropic-key'), req.headers.get('x-anthropic-workspace')), { headers: { 'Cache-Control': 'no-store' } });
});
