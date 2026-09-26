import { iso1A2Code } from '@rapideditor/country-coder';
import Anthropic from '@anthropic-ai/sdk';
import { type LatLon, cumulativeDistances, positionAt } from '../shared/geo.js';
import { computeProgress } from '../shared/progress.js';
import type { Journey, Milestone, MilestoneKind } from '../shared/types.js';
import { aiKeyFor } from './aikey.js';
import { NARRATOR_MODEL, type ResolvedKey } from './narrate.js';
import { commonsPhotos, mapillaryPhotos } from './photos.js';
import { reverseGeocode } from './places.js';
import { repo } from './repo.js';
import { weather } from './surroundings.js';
import { legsOf, waypointPositions } from '../shared/legs.js';
import { unlockReachedRewards } from './rewards.js';
import { cityUnlocks } from './unlocks.js';
import { notifyRewards } from './push.js';
import { isCityMilestone } from '../shared/rewards.js';

export interface Candidate {
  key: string;
  kind: MilestoneKind;
  atM: number;
  title: string;
  countryCode?: string;
}

export const countryName = (code: string, lang = 'en') => {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

/** Country (ISO alpha-2) at a point, offline. */
export const countryAt = ([lat, lon]: LatLon): string | null => iso1A2Code([lon, lat]) ?? null;

/** Milestone key of a leg's destination: "finish" for the first leg (as before legs existed). */
const finishKey = (legIndex: number) => (legIndex === 0 ? 'finish' : `finish-${legIndex + 1}`);

/** Every milestone a journey can have, in route order (true metres). */
export function milestoneCandidates(j: Journey): Candidate[] {
  const pts = j.route.points;
  const cum = cumulativeDistances(pts);
  const total = j.route.totalM;
  const scale = cum[cum.length - 1] > 0 ? cum[cum.length - 1] / total : 1;
  const out: Candidate[] = [];

  // Stops and destinations. Positions come per leg, so a route that passes a city twice places
  // each stop correctly. Earlier destinations keep the milestone key they had when they were the
  // finish ("finish" for the first leg), so continuing a journey never duplicates a milestone.
  const legs = legsOf(j);
  const positions = waypointPositions(j);
  positions.forEach((w, wi) => {
    if (wi === 0 || wi === positions.length - 1) return;
    if (w.legFinish) {
      out.push({ key: finishKey(w.leg), kind: 'finish', atM: w.m, title: `You made it to ${w.name}!` });
    } else {
      out.push({ key: `wp${wi}`, kind: 'waypoint', atM: w.m, title: `Arrived in ${w.name}` });
    }
  });

  for (let km = 100; km * 1000 < total - 5000; km += 100) {
    out.push({ key: String(km), kind: 'distance', atM: km * 1000, title: `${km} km on the road` });
  }
  if (total >= 40_000) out.push({ key: 'half', kind: 'halfway', atM: total / 2, title: 'Halfway there' });

  // border crossings: sample every 2 km with the offline country lookup
  const step = 2000;
  let prev = countryAt(pts[0]);
  for (let m = step; m <= total; m += step) {
    const c = countryAt(positionAt(pts, cum, m * scale).point);
    if (c && prev && c !== prev) out.push({ key: `${c}${Math.round(m / 1000)}`, kind: 'border', atM: m, countryCode: c, title: `Welcome to ${countryName(c)}` });
    if (c) prev = c;
  }

  const last = j.waypoints[j.waypoints.length - 1];
  out.push({ key: finishKey(legs.length - 1), kind: 'finish', atM: total, title: last ? `You made it to ${last.name}!` : 'Finish!' });
  return out.sort((a, b) => a.atM - b.atM);
}

/** Countries along the route (in order), for badges. */
export function routeCountries(j: Journey): string[] {
  const start = countryAt(j.route.points[0]);
  const list = start ? [start] : [];
  for (const c of milestoneCandidates(j)) if (c.kind === 'border' && c.countryCode && list[list.length - 1] !== c.countryCode) list.push(c.countryCode);
  return list;
}

const POSTCARD_SYSTEM = `You write short postcards for "Run There · Go There", an app where a runner's real kilometres move them along a real route.
Write in first person plural ("we"), warm and vivid, 70–120 words, plain prose, no markdown, no emojis. Ground everything in the facts given; well-known general knowledge about the named place is fine, but never invent specific businesses or events. End with the signature "— your virtual self".`;

export async function writePostcard(m: Milestone, j: Journey, key: ResolvedKey, lang = 'en'): Promise<string> {
  const [wx] = await Promise.allSettled([weather(m.lat, m.lon)]);
  const w = wx.status === 'fulfilled' ? wx.value : null;
  const facts = [
    `Journey: ${j.name} (${Math.round(j.route.totalM / 1000)} km in total).`,
    `Milestone: ${m.title}, after ${Math.round(m.atM / 1000)} km, reached on ${m.reachedAt.slice(0, 10)}.`,
    m.place ? `Location: ${m.place.name} (${m.place.context}).` : '',
    w ? `Weather there right now: ${w.temperatureC} °C, wind ${w.windKmh} km/h.` : '',
    m.kind === 'border' && m.countryCode
      ? `We just crossed into ${countryName(m.countryCode)}. Include one useful phrase in the local language (with a translation) and name one typical local dish.`
      : '',
    m.kind === 'finish' ? 'This is the finish of the whole journey: celebrate, and hint that it is time to go there for real.' : '',
    m.kind === 'halfway' ? 'This is the halfway point: look back and ahead.' : '',
  ]
    .filter(Boolean)
    .join('\n');
  const languageName = new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) ?? 'English';
  const client = new Anthropic({ apiKey: key.key, authToken: null, defaultHeaders: key.workspaceId ? { 'anthropic-workspace-id': key.workspaceId } : undefined });
  const res = await client.messages.create({
    model: NARRATOR_MODEL,
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    system: POSTCARD_SYSTEM,
    messages: [{ role: 'user', content: `<facts>\n${facts}\n</facts>\n\nWrite the postcard in ${languageName}.` }],
  });
  if (res.stop_reason === 'refusal') throw new Error('The narrator declined to write this postcard.');
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

async function photoNear(lat: number, lon: number): Promise<Milestone['photo']> {
  const [mly, wm] = await Promise.allSettled([mapillaryPhotos(lat, lon, 1), commonsPhotos(lat, lon, 3)]);
  const p = (mly.status === 'fulfilled' && mly.value[0]) || (wm.status === 'fulfilled' && wm.value[0]) || null;
  return p ? { url: p.thumbUrl, credit: [p.author, p.license].filter(Boolean).join(' · ') || undefined, pageUrl: p.pageUrl } : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DetectOptions {
  journeyId?: string;
  /** Max new milestones enriched (place/photo) per call; the rest follow on the next check. */
  maxNew?: number;
  /** Max postcards written automatically per call. */
  maxPostcards?: number;
  lang?: string;
  /** Pause between place look-ups (Nominatim allows one request per second). */
  delayMs?: number;
  /** Send a push notification for rewards unlocked by this check (background syncs). */
  notifyRewards?: boolean;
}

/** Find newly reached milestones for a user's journeys, store them, and write postcards. */
export async function detectMilestones(uid: string, opts: DetectOptions = {}): Promise<Milestone[]> {
  const { maxNew = 6, maxPostcards = 2, lang = 'en', delayMs = 1100 } = opts;
  const journeys = (await repo.listJourneys(uid)).filter((j) => !opts.journeyId || j.id === opts.journeyId);
  if (!journeys.length) return [];
  const earliest = journeys.map((j) => j.startDate).sort()[0];
  const activities = await repo.listActivities(uid, new Date(Date.parse(`${earliest}T00:00:00Z`) - 86_400_000).toISOString());
  const created: Milestone[] = [];
  let enriched = 0;

  const unlockedRewards: { title: string; journeyId: string }[] = [];

  for (const j of journeys) {
    const progress = computeProgress(j, activities);
    for (const r of await unlockReachedRewards(uid, j, progress)) unlockedRewards.push({ title: r.title, journeyId: j.id });
    const existing = new Set((await repo.listMilestones(uid, j.id)).map((m) => m.id));
    const reached = milestoneCandidates(j).filter((c) => c.atM <= progress.doneM + 1 && !existing.has(`${j.id}_${c.kind}_${c.key}`));
    const pts = j.route.points;
    const cum = cumulativeDistances(pts);
    const scale = cum[cum.length - 1] > 0 ? cum[cum.length - 1] / j.route.totalM : 1;

    for (const c of reached) {
      if (enriched >= maxNew) break;
      const [lat, lon] = positionAt(pts, cum, c.atM * scale).point;
      const entry = progress.entries.find((e) => !e.excluded && e.cumulativeM >= Math.min(c.atM, j.route.totalM) - 1);
      const [place, photo] = await Promise.allSettled([reverseGeocode(lat, lon, lang), photoNear(lat, lon)]);
      const m: Milestone = {
        id: `${j.id}_${c.kind}_${c.key}`,
        journeyId: j.id,
        kind: c.kind,
        atM: c.atM,
        title: c.title,
        lat,
        lon,
        reachedAt: entry?.date ?? new Date().toISOString(),
        createdAt: new Date().toISOString(),
        countryCode: c.countryCode,
        place: place.status === 'fulfilled' && place.value ? { name: place.value.name, context: place.value.context } : undefined,
        photo: photo.status === 'fulfilled' ? photo.value : undefined,
        seen: false,
      };
      if (c.kind === 'distance' && m.place?.name) m.title = `${c.title} · ${m.place.name}`;
      await repo.putMilestone(uid, m);
      created.push(m);
      enriched++;
      if (delayMs) await sleep(delayMs);
    }
  }

  if (unlockedRewards.length && opts.notifyRewards) await notifyRewards(uid, unlockedRewards);

  // postcards for the most recent new milestones, if the user has an AI key
  const key = created.length ? await aiKeyFor(uid).catch(() => null) : null;
  if (key) {
    for (const m of created.slice(-maxPostcards)) {
      const j = journeys.find((x) => x.id === m.journeyId)!;
      try {
        m.postcard = { text: await writePostcard(m, j, key, lang), at: new Date().toISOString() };
        await repo.putMilestone(uid, m);
        await repo.incrementStat(uid, 'postcards');
      } catch (e) {
        console.error('postcard failed', e);
      }
    }
  }

  // what reaching a city unlocks: passport stamp, fun fact, song
  for (const m of created.filter(isCityMilestone)) {
    m.unlocks = await cityUnlocks(m, { lang, key });
    await repo.putMilestone(uid, m);
  }
  return created;
}
