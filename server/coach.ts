import Anthropic from '@anthropic-ai/sdk';
import { computeProgress, weekStart } from '../shared/progress.js';
import type { CoachPlan, Journey } from '../shared/types.js';
import { fetchJson } from './http.js';
import { NARRATOR_MODEL, type ResolvedKey } from './narrate.js';
import { repo } from './repo.js';

const DAY = 86_400_000;

interface Forecast {
  daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[]; weather_code: number[] };
}

async function forecast(lat: number, lon: number): Promise<string> {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude', lat.toFixed(3));
  u.searchParams.set('longitude', lon.toFixed(3));
  u.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code');
  u.searchParams.set('forecast_days', '7');
  u.searchParams.set('timezone', 'auto');
  const f = await fetchJson<Forecast>(u.toString());
  return f.daily.time
    .map((d, i) => `${d}: ${Math.round(f.daily.temperature_2m_min[i])}–${Math.round(f.daily.temperature_2m_max[i])} °C, rain ${f.daily.precipitation_probability_max[i] ?? 0}%`)
    .join('\n');
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'targetKm', 'days', 'tip'],
  properties: {
    summary: { type: 'string', description: 'Two or three sentences: what this week is about and why.' },
    targetKm: { type: 'number', description: 'Total planned kilometres for the week.' },
    days: {
      type: 'array',
      description: 'Exactly seven entries, Monday to Sunday.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['day', 'type', 'distanceKm', 'title', 'details'],
        properties: {
          day: { type: 'string', enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
          type: { type: 'string', enum: ['easy', 'long', 'tempo', 'intervals', 'recovery', 'rest', 'cross'] },
          distanceKm: { type: 'number' },
          title: { type: 'string', description: 'Short, e.g. "Easy 8 km along the river".' },
          details: { type: 'string', description: 'One or two sentences: pace/effort guidance, and weather if relevant.' },
        },
      },
    },
    tip: { type: 'string', description: 'One motivating sentence tying the week to the virtual route.' },
  },
} as const;

const SYSTEM = `You are a friendly, evidence-based running coach inside "Run There · Go There", where a runner's real kilometres move them along a virtual route.
Plan the coming week (Monday–Sunday) for this runner. Principles: increase weekly volume by at most ~10% over the recent average, keep most running easy, at most one quality session (tempo or intervals) unless the history clearly supports two, one long run of about 25–30% of the week, at least one rest day. Adapt to the weather forecast at the runner's real location. If the runner has been inconsistent, favour consistency over volume. Never give medical advice beyond "listen to your body". Distances in kilometres.`;

export async function coachPlan(uid: string, j: Journey, key: ResolvedKey, opts: { lat?: number; lon?: number; lang?: string }): Promise<CoachPlan> {
  const now = new Date();
  const since = new Date(now.getTime() - 56 * DAY).toISOString();
  const all = await repo.listActivities(uid, since);
  const runs = all.filter((a) => j.sportTypes.includes(a.sportType));
  const weeks = new Map<string, number>();
  for (let i = 0; i < 8; i++) weeks.set(weekStart(new Date(now.getTime() - i * 7 * DAY)), 0);
  for (const a of runs) {
    const w = weekStart(new Date(a.startDateLocal.slice(0, 10) + 'T12:00:00'));
    if (weeks.has(w)) weeks.set(w, weeks.get(w)! + a.distanceM / 1000);
  }
  const longest = runs.reduce((m, a) => Math.max(m, a.distanceM), 0) / 1000;
  const paces = runs.filter((a) => a.distanceM > 3000 && a.movingTimeS).map((a) => a.movingTimeS / (a.distanceM / 1000));
  const typicalPace = paces.length ? paces.sort((a, b) => a - b)[Math.floor(paces.length / 2)] : null;
  const days = new Set(runs.map((a) => new Date(a.startDateLocal.slice(0, 10) + 'T12:00:00').getDay()));

  const journeyActs = await repo.listActivities(uid, new Date(Date.parse(`${j.startDate}T00:00:00Z`) - DAY).toISOString());
  const p = computeProgress(j, journeyActs, now);
  const nextWp = j.waypoints.slice(1).find((_, i) => (i + 1) / (j.waypoints.length - 1) > p.fraction);

  const weather = opts.lat != null && opts.lon != null ? await forecast(opts.lat, opts.lon).catch(() => null) : null;
  const facts = [
    `Journey: ${j.name}, ${Math.round(p.doneM / 1000)} of ${Math.round(j.route.totalM / 1000)} km done, ${Math.round(p.remainingM / 1000)} km to go.`,
    nextWp ? `Next place on the route: ${nextWp.name}.` : '',
    j.event ? `Real race at the finish: ${j.event.name} on ${j.event.date}.` : '',
    p.goal ? `Arrival goal ${p.goal.date}: needs ${Math.round(p.goal.requiredWeeklyM / 1000)} km/week (${p.goal.onTrack ? 'on track' : 'behind'}).` : '',
    `Weekly km, most recent first: ${[...weeks.entries()].map(([w, km]) => `${w}: ${km.toFixed(1)}`).join('; ')}.`,
    `Longest run in 8 weeks: ${longest.toFixed(1)} km. Runs in 8 weeks: ${runs.length}.`,
    typicalPace ? `Typical pace: ${Math.floor(typicalPace / 60)}:${String(Math.round(typicalPace % 60)).padStart(2, '0')} min/km.` : 'No pace data.',
    days.size ? `Usually runs on: ${[...days].map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}.` : '',
    weather ? `Weather forecast at the runner's real location:\n${weather}` : 'No weather forecast available.',
  ]
    .filter(Boolean)
    .join('\n');

  const languageName = new Intl.DisplayNames(['en'], { type: 'language' }).of(opts.lang ?? 'en') ?? 'English';
  const client = new Anthropic({ apiKey: key.key, authToken: null, defaultHeaders: key.workspaceId ? { 'anthropic-workspace-id': key.workspaceId } : undefined });
  const res = await client.messages.create({
    model: NARRATOR_MODEL,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
    system: SYSTEM,
    messages: [{ role: 'user', content: `<runner>\n${facts}\n</runner>\n\nWrite all text fields in ${languageName}.` }],
  });
  if (res.stop_reason === 'refusal') throw new Error('The coach declined to write a plan.');
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const parsed = JSON.parse(text) as Omit<CoachPlan, 'weekOf' | 'createdAt'>;
  const plan: CoachPlan = { ...parsed, weekOf: weekStart(new Date(now.getTime() + (now.getDay() === 0 ? DAY : 0))), createdAt: now.toISOString() };
  await repo.putCoachPlan(uid, j.id, plan);
  await repo.incrementStat(uid, 'coachPlans');
  return plan;
}
