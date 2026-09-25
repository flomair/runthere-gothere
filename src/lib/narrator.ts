import { useSyncExternalStore } from 'react';
import { api, authHeaders } from './api';
import type { NarrateRequest, NarrationStyle } from './types';

/** Per-device preferences (voices differ per device). The API key lives encrypted on the server. */
export interface NarratorSettings {
  style: NarrationStyle;
  voiceURI: string | null;
  rate: number;
}

const KEY = 'rtgt.narrator.v1';
const DEFAULTS: NarratorSettings = { style: 'travelogue', voiceURI: null, rate: 1 };
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
  req: NarrateRequest & { saveKey: string },
  onText: (full: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch('/api/narrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
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

// ---- saved stories (stored in the user's account) ----

export const narrationKey = (journeyId: string, lat: number, lon: number, style: string) =>
  `${journeyId}|${lat.toFixed(3)}|${lon.toFixed(3)}|${style}`;

export const loadNarration = (key: string) =>
  api<{ narration: { text: string; at: string } | null }>(`/api/narrations?key=${encodeURIComponent(key)}`).then((r) => r.narration);

// ---- the user's Anthropic key (encrypted on the server) ----

export type KeyResult = { ok: true; model: string } | { ok: false; error: string };

async function keyCall(method: 'PUT' | 'POST' | 'DELETE', json?: unknown): Promise<KeyResult> {
  const res = await fetch('/api/ai-key', {
    method,
    headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(await authHeaders()) },
    body: json ? JSON.stringify(json) : undefined,
  });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; model?: string; error?: string } | null;
  if (body?.ok === true) return { ok: true, model: body.model ?? 'the narrator model' };
  return { ok: false, error: body?.error ?? `Request failed (${res.status})` };
}

export const saveAiKey = (key: string, workspaceId: string) => keyCall('PUT', { key, workspaceId });
export const testAiKey = () => keyCall('POST');
export const deleteAiKey = () => keyCall('DELETE');
