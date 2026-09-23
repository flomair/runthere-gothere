import Anthropic from '@anthropic-ai/sdk';
import { formatKm } from '../shared/geo.js';
import type { NarrateRequest, NarrationStyle } from '../shared/types.js';
import { HttpError } from './http.js';
import { reverseGeocode } from './places.js';
import { googlePlaces, weather, wikipedia } from './surroundings.js';
import { describeWeatherCode } from '../shared/weather.js';

export const NARRATOR_MODEL = 'claude-opus-5';

const STYLE_GUIDE: Record<NarrationStyle, string> = {
  travelogue: `Write a travelogue entry of 250–400 words in the first person plural ("we"), as if the reader and you were walking there together.
Structure:
1. Arrival: where we are, what the road behind us looked like, what we see, hear and smell right now, grounded in the current weather and the time of day.
2. An excursus: set off with a short heading in italics. It is a digression, as in a travel book, into one story that the facts tie to this place: a historical episode, a person, a legend, an architectural oddity, a local food or custom. Tell it with concrete details, then come back to the road with a clear transition.
3. Onward: a glance at what lies ahead and one line of encouragement for the next run.`,
  postcard: `Write a postcard of 90–140 words: vivid, warm, one surprising local fact, signed "— your virtual self".`,
  coach: `Write 120–180 words as an upbeat running coach who knows the area: where we are, one striking local fact as motivation, what the terrain and weather would mean for today's run here, and a concrete challenge for the next session that gets us to the next landmark.`,
  kids: `Write a story of 150–220 words for children aged 6–10: simple sentences, curiosity, one amazing fact about the place, and a question to wonder about at the end.`,
};

const SYSTEM = `You are the narrator of "Run There · Go There". The app turns a runner's real Strava kilometres into a virtual journey along a real route. You describe the runner's current virtual surroundings so the place feels vivid and real.

Rules:
- Use only the facts in <context> for anything specific: names, dates, numbers and history. Well-known general knowledge about the named places is fine. Never invent specific businesses, reviews or events.
- Weather is live data for the virtual position right now. Weave it in naturally rather than reciting it.
- If the context is thin (open countryside, for example), describe the landscape and the region, and pick the excursus from the nearest notable place in the context.
- Write in the requested language. Plain prose only: no markdown headings, lists or emojis. The one exception is the italic excursus heading in the travelogue style, written like *Excursus: …*.
- The text may be read aloud, so it must flow well when spoken.`;

function contextBlock(req: NarrateRequest, gathered: Awaited<ReturnType<typeof gather>>): string {
  const { journey } = req;
  const lines: string[] = [];
  lines.push(`<journey name="${journey.name}">`);
  lines.push(`Route: ${journey.from} → ${journey.to}, ${formatKm(journey.totalM, 0)} in total.`);
  lines.push(`Covered so far: ${formatKm(journey.doneM)} (${((journey.doneM / journey.totalM) * 100).toFixed(1)}%). Remaining: ${formatKm(journey.totalM - journey.doneM)}.`);
  if (journey.sinceLastM && journey.sinceLastM > 0) lines.push(`Moved since the runner last looked: ${formatKm(journey.sinceLastM)}${journey.previousPlace ? ` (from around ${journey.previousPlace})` : ''}.`);
  if (journey.lastActivity) lines.push(`Latest activity: "${journey.lastActivity.name}", ${formatKm(journey.lastActivity.distanceM)} on ${journey.lastActivity.date}.`);
  if (journey.upcoming?.length) lines.push(`Coming up along the route: ${journey.upcoming.map((u) => `${u.name} in ${formatKm(u.inM, 0)}`).join('; ')}.`);
  if (req.peek) lines.push(`NOTE: This is a look-ahead preview of a point ${formatKm(req.peek.aheadM, 0)} further along the route, not where the runner is now. Narrate it as a preview of what awaits.`);
  lines.push('</journey>');

  const p = gathered.place;
  lines.push(`<location lat="${req.lat.toFixed(4)}" lon="${req.lon.toFixed(4)}">${p ? `${p.name} (${p.context}). Full address context: ${p.displayName}` : 'unknown'}</location>`);

  const w = gathered.weather;
  if (w) {
    lines.push(`<weather local_time="${w.time}" timezone="${w.timezone}">${describeWeatherCode(w.weatherCode).label}, ${w.temperatureC}°C (feels like ${w.apparentC}°C), wind ${w.windKmh} km/h, precipitation ${w.precipitationMm} mm, ${w.isDay ? 'daytime' : 'night'}${w.today ? `; today ${w.today.minC}–${w.today.maxC}°C, sunrise ${w.today.sunrise.slice(11)}, sunset ${w.today.sunset.slice(11)}` : ''}</weather>`);
  }
  if (gathered.wiki.length) {
    lines.push('<wikipedia_nearby>');
    for (const a of gathered.wiki) lines.push(`<article title="${a.title}" distance_km="${(a.distanceM / 1000).toFixed(1)}">${a.extract}</article>`);
    lines.push('</wikipedia_nearby>');
  }
  if (gathered.places.length) {
    lines.push('<google_places>');
    for (const pl of gathered.places) {
      lines.push(`<place name="${pl.name}" type="${pl.type ?? ''}" rating="${pl.rating ?? ''}" reviews="${pl.ratingCount ?? ''}">${pl.review ? `A recent review says: "${pl.review.text.slice(0, 300)}"` : ''}</place>`);
    }
    lines.push('</google_places>');
  }
  if (req.photoTitles?.length) lines.push(`<photo_titles>${req.photoTitles.slice(0, 12).join(' | ')}</photo_titles>`);
  return lines.join('\n');
}

async function gather(req: NarrateRequest) {
  const [place, wx, wiki, places] = await Promise.allSettled([
    reverseGeocode(req.lat, req.lon, req.language),
    weather(req.lat, req.lon),
    wikipedia(req.lat, req.lon, req.language, 8).then((r) => (r.length || req.language === 'en' ? r : wikipedia(req.lat, req.lon, 'en', 8))),
    googlePlaces(req.lat, req.lon, req.language, 6),
  ]);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null);
  return { place: ok(place), weather: ok(wx), wiki: ok(wiki) ?? [], places: ok(places) ?? [] };
}

/** Streams the narration as plain UTF-8 text. */
export async function narrate(req: NarrateRequest, apiKey: string | undefined): Promise<ReadableStream<Uint8Array>> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError(400, 'No AI key configured. Add your Anthropic API key in the narrator settings, or set ANTHROPIC_API_KEY on the server.');

  const gathered = await gather(req);
  const client = new Anthropic({ apiKey: key });
  const languageName = new Intl.DisplayNames(['en'], { type: 'language' }).of(req.language) ?? req.language;

  const stream = client.beta.messages.stream({
    model: NARRATOR_MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `<context>\n${contextBlock(req, gathered)}\n</context>\n\nStyle:\n${STYLE_GUIDE[req.style]}\n\nWrite in ${languageName}.`,
      },
    ],
  });

  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        stream.on('text', (t) => controller.enqueue(enc.encode(t)));
        const final = await stream.finalMessage();
        if (final.stop_reason === 'refusal') controller.enqueue(enc.encode('\n\n[The narrator declined to describe this place.]'));
        controller.close();
      } catch (e) {
        const msg =
          e instanceof Anthropic.AuthenticationError
            ? 'The AI key was rejected. Check it in the narrator settings.'
            : e instanceof Anthropic.RateLimitError
              ? 'The AI is rate-limited right now. Try again in a minute.'
              : e instanceof Anthropic.APIError
                ? `AI error ${e.status}: ${e.message}`
                : String(e);
        controller.enqueue(enc.encode(`\n\n[${msg}]`));
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });
}
