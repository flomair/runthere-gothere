import { useSyncExternalStore } from 'react';
import type { NarrateRequest, NarrationStyle } from './types';

export interface NarratorSettings {
  /** User's own Anthropic API key – stays in this browser, sent only with narrate requests. */
  apiKey: string;
  style: NarrationStyle;
  voiceURI: string | null;
  rate: number;
}

const KEY = 'rtgt.narrator.v1';
const DEFAULTS: NarratorSettings = { apiKey: '', style: 'travelogue', voiceURI: null, rate: 1 };
const listeners = new Set<() => void>();
let cache: NarratorSettings | null = null;

function read(): NarratorSettings {
  if (!cache) {
    try {
      cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    } catch {
      cache = { ...DEFAULTS };
    }
  }
  return cache!;
}

export function saveNarratorSettings(patch: Partial<NarratorSettings>) {
  cache = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l());
}

export function useNarratorSettings(): NarratorSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => DEFAULTS,
  );
}

export const STYLE_LABELS: Record<NarrationStyle, string> = {
  travelogue: 'Travelogue with excursus',
  postcard: 'Postcard',
  coach: 'Running coach',
  kids: 'Story for kids',
};

/** Streams narration text; calls onText with the accumulated text. */
export async function streamNarration(
  req: NarrateRequest,
  apiKey: string,
  onText: (full: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch('/api/narrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'x-anthropic-key': apiKey } : {}) },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { error?: string } | null)?.error ?? `Narrator failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += dec.decode(value, { stream: true });
    onText(full);
  }
  return full;
}

// ---- saved narrations (so a story survives a reload) ----
const SAVED = 'rtgt.narrations.v1';
type Saved = Record<string, { text: string; at: string }>;

export const narrationKey = (journeyId: string, lat: number, lon: number, style: string) =>
  `${journeyId}|${lat.toFixed(3)}|${lon.toFixed(3)}|${style}`;

export function loadNarration(key: string) {
  try {
    return (JSON.parse(localStorage.getItem(SAVED) ?? '{}') as Saved)[key] ?? null;
  } catch {
    return null;
  }
}

export function storeNarration(key: string, text: string) {
  try {
    const all = JSON.parse(localStorage.getItem(SAVED) ?? '{}') as Saved;
    all[key] = { text, at: new Date().toISOString() };
    const trimmed = Object.fromEntries(Object.entries(all).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, 40));
    localStorage.setItem(SAVED, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}
