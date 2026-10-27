import { timingSafeEqual } from 'node:crypto';
import { authed } from '../server/access.js';
import { HttpError, handle, json, readJson } from '../server/http.js';
import { notify, textFor } from '../server/push.js';
import { repo } from '../server/repo.js';
import { checkSyncLatency } from '../shared/runFeedback.js';
import type { RunFeedback } from '../shared/types.js';

/**
 * GET  /api/run-feedback               – the signed-in user's feedback list (newest first, without the HR strip)
 * GET  /api/run-feedback?activityId=…  – one feedback document (or null)
 * POST /api/run-feedback               – store feedback computed outside the app (scripts/run-feedback.ts,
 *                                        run from a Claude session with the Strava connector).
 *                                        "Authorization: Bearer $FEEDBACK_PUSH_SECRET",
 *                                        body { athleteId, feedback, notify? }. Sends "Your run feedback is ready".
 */
export const GET = authed(async (req, user) => {
  const id = new URL(req.url).searchParams.get('activityId');
  if (id) return json({ feedback: await repo.getRunFeedback(user.uid, Number(id)) });
  const list = await repo.listRunFeedback(user.uid);
  return json({ feedback: list.map(({ hr: _hr, steps: _steps, ...rest }) => rest) });
});

const MAX_BYTES = 256_000;

function authorised(req: Request): boolean {
  const secret = process.env.FEEDBACK_PUSH_SECRET;
  if (!secret || secret.length < 24) return false;
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

function valid(f: Partial<RunFeedback> | undefined): f is RunFeedback {
  return (
    !!f &&
    Number.isSafeInteger(f.activityId) &&
    typeof f.activityName === 'string' &&
    typeof f.startDateLocal === 'string' &&
    Array.isArray(f.steps) &&
    Array.isArray(f.checks) &&
    !!f.overall &&
    !!f.plan &&
    !!f.alignment
  );
}

export const POST = handle(async (req) => {
  if (!authorised(req)) throw new HttpError(401, 'unauthorized');
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES) throw new HttpError(413, 'feedback too large');
  const body = await readJson<{ athleteId?: number; feedback?: Partial<RunFeedback>; notify?: boolean }>(req);
  if (!body.athleteId || !valid(body.feedback)) throw new HttpError(400, 'athleteId and a complete feedback object are required');
  const uid = await repo.uidForAthlete(body.athleteId);
  if (!uid) throw new HttpError(404, 'no app user for this Strava athlete');
  const f = body.feedback;

  // the arrival time is only known here: replace the script's placeholder check
  const stored = (await repo.listActivities(uid, new Date(Date.parse(f.startDateLocal) - 2 * 86_400_000).toISOString())).find((a) => a.id === f.activityId);
  if (stored?.receivedAt && stored.elapsedTimeS != null) {
    const latency = checkSyncLatency({ ...stored, elapsedTimeS: stored.elapsedTimeS }, f.lang === 'de' ? 'de' : 'en');
    f.checks = [...f.checks.filter((c) => c.id !== 'syncLatency'), latency];
  }
  const first = !(await repo.getRunFeedback(uid, f.activityId));
  await repo.putRunFeedback(uid, f);
  let sent = 0;
  if (body.notify !== false && first) {
    const tx = await textFor(uid);
    sent = await notify(uid, { title: tx.feedbackReady, body: f.summary?.headline ?? f.activityName, url: `/#/run/${f.activityId}`, tag: `feedback-${f.activityId}` });
  }
  return json({ ok: true, stored: f.activityId, notified: sent, inApp: Boolean(stored) });
});
