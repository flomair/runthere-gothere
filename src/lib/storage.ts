import { useSyncExternalStore } from 'react';
import { api } from './api';
import type { Journey } from './types';

/**
 * Journeys live in Firestore (via /api/journeys). This module keeps an in-memory copy for the UI:
 * mutations update it immediately and are saved in the background (rolled back on failure).
 */
interface State {
  status: 'idle' | 'loading' | 'ready' | 'error';
  journeys: Journey[];
  error?: string;
}

let state: State = { status: 'idle', journeys: [] };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function put(j: Journey) {
  await api('/api/journeys', { method: 'PUT', json: j });
}

/** Coalesce rapid edits (e.g. "last seen" updates) into one save per journey. */
function scheduleSave(id: string) {
  clearTimeout(saveTimers.get(id));
  saveTimers.set(
    id,
    setTimeout(() => {
      saveTimers.delete(id);
      const j = state.journeys.find((x) => x.id === id);
      if (j) put(j).catch((e) => set({ error: `Could not save "${j.name}": ${e instanceof Error ? e.message : e}` }));
    }, 400),
  );
}

// ---- one-time migration of journeys saved in the browser by earlier versions ----
const LEGACY_KEY = 'rtgt.journeys.v1';

async function migrateLocal(serverIds: Set<string>): Promise<Journey[]> {
  let local: Journey[] = [];
  try {
    local = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '[]') as Journey[];
  } catch {
    return [];
  }
  const missing = local.filter((j) => j?.id && j.route?.points?.length && !serverIds.has(j.id));
  for (const j of missing) {
    await put({ ...j, excludedActivityIds: j.excludedActivityIds ?? [], manualEntries: j.manualEntries ?? [] });
  }
  if (local.length) {
    localStorage.setItem(`${LEGACY_KEY}.migrated`, localStorage.getItem(LEGACY_KEY)!);
    localStorage.removeItem(LEGACY_KEY);
  }
  return missing;
}

export const journeyStore = {
  async load() {
    set({ status: 'loading', error: undefined });
    try {
      const { journeys } = await api<{ journeys: Journey[] }>('/api/journeys');
      const migrated = await migrateLocal(new Set(journeys.map((j) => j.id))).catch(() => []);
      set({ status: 'ready', journeys: [...migrated, ...journeys] });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },
  reset() {
    saveTimers.forEach(clearTimeout);
    saveTimers.clear();
    set({ status: 'idle', journeys: [], error: undefined });
  },
  get: (id: string) => state.journeys.find((j) => j.id === id),
  async add(j: Journey) {
    set({ journeys: [j, ...state.journeys] });
    try {
      await put(j);
    } catch (e) {
      set({ journeys: state.journeys.filter((x) => x.id !== j.id), error: `Could not save the journey: ${e instanceof Error ? e.message : e}` });
      throw e;
    }
  },
  update(id: string, patch: Partial<Journey> | ((j: Journey) => Partial<Journey>)) {
    set({
      journeys: state.journeys.map((j) => (j.id === id ? { ...j, ...(typeof patch === 'function' ? patch(j) : patch) } : j)),
    });
    scheduleSave(id);
  },
  async remove(id: string) {
    const before = state.journeys;
    clearTimeout(saveTimers.get(id));
    set({ journeys: before.filter((j) => j.id !== id) });
    try {
      await api(`/api/journeys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (e) {
      set({ journeys: before, error: `Could not delete: ${e instanceof Error ? e.message : e}` });
    }
  },
  /** Merge imported journeys (same id → replaced). */
  async import(list: Journey[]) {
    const ids = new Set(list.map((j) => j.id));
    set({ journeys: [...list, ...state.journeys.filter((j) => !ids.has(j.id))] });
    for (const j of list) await put(j);
  },
  clearError() {
    set({ error: undefined });
  },
};

export function useJourneyState(): State {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function useJourneys(): Journey[] {
  return useJourneyState().journeys;
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
