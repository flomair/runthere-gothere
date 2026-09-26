import Anthropic from '@anthropic-ai/sdk';
import { iso1A2Code } from '@rapideditor/country-coder';
import { stampFor } from '../shared/rewards.js';
import type { CityUnlocks, Milestone } from '../shared/types.js';
import { fetchJson } from './http.js';
import { NARRATOR_MODEL, type ResolvedKey } from './narrate.js';

interface WikiSummary {
  type?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

/** Split into sentences without breaking abbreviations like "St." too often. */
const sentences = (text: string) => text.match(/[^.!?]+(?:[.!?]+(?=\s+[A-ZÄÖÜ]|$))/g)?.map((s) => s.trim()) ?? [text];

/**
 * A fun fact from the Wikipedia summary of the place: the second sentence is usually the most
 * interesting (the first just says what the place is).
 */
export async function wikipediaFact(place: string, lang: string): Promise<CityUnlocks['funFact'] | undefined> {
  for (const l of [...new Set([lang, 'en'])]) {
    const s = await fetchJson<WikiSummary>(`https://${l}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(place.replace(/ /g, '_'))}`, { timeoutMs: 8000 }).catch(() => null);
    if (!s?.extract || s.type === 'disambiguation') continue;
    const parts = sentences(s.extract);
    const pick = parts.find((p, i) => i > 0 && p.length > 40 && p.length < 320) ?? parts[0];
    if (pick) return { text: pick.slice(0, 320), source: 'wikipedia', url: s.content_urls?.desktop?.page };
  }
  return undefined;
}

const EXTRAS_SCHEMA = {
  type: 'object',
  properties: {
    funFact: { type: 'string', description: 'One surprising, true, well-known fact about the place, 1–2 sentences.' },
    song: {
      type: 'object',
      properties: { title: { type: 'string' }, artist: { type: 'string' } },
      required: ['title', 'artist'],
      additionalProperties: false,
    },
  },
  required: ['funFact', 'song'],
  additionalProperties: false,
} as const;

/** A fun fact and a fitting song, from the user's own AI key. */
export async function aiCityExtras(place: string, context: string | undefined, key: ResolvedKey, lang: string): Promise<Pick<CityUnlocks, 'funFact' | 'song'>> {
  const languageName = new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) ?? 'English';
  const client = new Anthropic({ apiKey: key.key, authToken: null, defaultHeaders: key.workspaceId ? { 'anthropic-workspace-id': key.workspaceId } : undefined });
  const res = await client.messages.create({
    model: NARRATOR_MODEL,
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: EXTRAS_SCHEMA as unknown as Record<string, unknown> } },
    system:
      'A runner has just reached a place on their virtual journey. Give one surprising but true and well-known fun fact about the place, and one real, existing song that fits it (about the place, from there, or famously linked to it). Never invent songs or facts; if unsure, choose something widely known.',
    messages: [{ role: 'user', content: `Place: ${place}${context ? ` (${context})` : ''}. Write the fun fact in ${languageName}.` }],
  });
  if (res.stop_reason === 'refusal') throw new Error('declined');
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const parsed = JSON.parse(text) as { funFact: string; song: { title: string; artist: string } };
  return { funFact: { text: parsed.funFact, source: 'ai' }, song: parsed.song };
}

/** Everything a city unlocks. Never throws: missing parts are simply left out. */
export async function cityUnlocks(m: Milestone, opts: { lang?: string; key?: ResolvedKey | null } = {}): Promise<CityUnlocks> {
  const lang = opts.lang ?? 'en';
  const stamp = stampFor({ ...m, countryCode: m.countryCode ?? iso1A2Code([m.lon, m.lat]) ?? undefined });
  const out: CityUnlocks = { stamp, generatedAt: new Date().toISOString() };
  if (opts.key) {
    try {
      Object.assign(out, await aiCityExtras(stamp.label, m.place?.context, opts.key, lang));
    } catch (e) {
      console.error('AI city extras failed', e);
    }
  }
  if (!out.funFact) out.funFact = await wikipediaFact(stamp.label, lang).catch(() => undefined);
  return out;
}
