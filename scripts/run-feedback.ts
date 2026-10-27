/**
 * Compute run feedback outside the app and (optionally) push it to /api/run-feedback.
 * Meant for a Claude session with the Strava connector: dump the activity, laps and streams
 * from the connector into one JSON file, then
 *
 *   node scripts/run-feedback.ts input.json                       # print the feedback
 *   FEEDBACK_PUSH_SECRET=… node scripts/run-feedback.ts input.json --push https://<app>/api/run-feedback
 *
 * input.json:
 *   { athleteId, activity: RunInput, streams: <get_activity_streams output>, laps: <performance.laps>,
 *     others?: OtherActivity[], plan?: { name, text }, zones: RunFeedbackZone[], lang?: 'en'|'de',
 *     summary?: RunFeedback['summary'] }
 *
 * Node 22 runs this TypeScript directly (type stripping); no build step.
 */
import { readFileSync } from 'node:fs';
import { computeFeedback, fromStravaMcpStreams, parseWorkoutText } from '../shared/runFeedback.ts';

const [file, flag, url] = process.argv.slice(2);
if (!file) {
  console.error('usage: node scripts/run-feedback.ts input.json [--push <url>]');
  process.exit(2);
}
const input = JSON.parse(readFileSync(file, 'utf8'));
const laps = (input.laps ?? []).map((l: { elapsed_time: number; moving_time: number; distance: number }) => ({ elapsedTimeS: l.elapsed_time, movingTimeS: l.moving_time, distanceM: l.distance }));
const plan = input.plan ? parseWorkoutText(input.plan.name, input.plan.text) : null;
const feedback = computeFeedback({
  activity: input.activity,
  streams: fromStravaMcpStreams(input.streams),
  laps,
  plan,
  zones: input.zones,
  others: input.others ?? [],
  planSource: input.plan ? 'text' : 'none',
  lang: input.lang ?? 'en',
});
if (input.summary) feedback.summary = input.summary;

if (flag !== '--push') {
  console.log(JSON.stringify(feedback, null, 2));
} else {
  const secret = process.env.FEEDBACK_PUSH_SECRET;
  if (!secret || !url) {
    console.error('--push needs a URL and FEEDBACK_PUSH_SECRET');
    process.exit(2);
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ athleteId: input.athleteId, feedback }),
  });
  console.log(res.status, await res.text());
  if (!res.ok) process.exit(1);
}
