import { useSyncExternalStore } from 'react';
import type { Journey } from './types';

const KEY = 'rtgt.journeys.v1';
const listeners = new Set<() => void>();
let cache: Journey[] | null = null;

function read(): Journey[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Journey[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: Journey[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('Could not persist journeys', e);
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      l();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

export const journeyStore = {
  all: read,
  get: (id: string) => read().find((j) => j.id === id),
  add(j: Journey) {
    write([j, ...read()]);
  },
  update(id: string, patch: Partial<Journey> | ((j: Journey) => Partial<Journey>)) {
    write(read().map((j) => (j.id === id ? { ...j, ...(typeof patch === 'function' ? patch(j) : patch) } : j)));
  },
  remove(id: string) {
    write(read().filter((j) => j.id !== id));
  },
  /** Merge imported journeys (same id → replaced). */
  import(list: Journey[]) {
    const ids = new Set(list.map((j) => j.id));
    write([...list, ...read().filter((j) => !ids.has(j.id))]);
  },
};

export function useJourneys(): Journey[] {
  return useSyncExternalStore(subscribe, read, () => []);
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
