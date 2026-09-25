import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LatLon } from '../../shared/geo';
import { idToken } from './firebase';
import type { Activity, Bookmark, CoachPlan, GeoResult, MeResponse, Milestone, Photo, PlannedRoute, RouteMode, SurroundingsResponse } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function authHeaders(): Promise<Record<string, string>> {
  const t = await idToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** Fetch an /api endpoint with the signed-in user's token; JSON in, JSON out. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  for (const [k, v] of Object.entries(await authHeaders())) headers.set(k, v);
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  const res = await fetch(path, { ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const b = body as { error?: string } | null;
    // non-JSON answers (e.g. Vercel's own crash page) are shown as text so the cause is visible
    const detail = b?.error ?? (text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) || res.statusText);
    throw new ApiError(res.status, `${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return body as T;
}

export const lang = () => (typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en') || 'en';

/** Round coordinates so nearby look-ups share a cache entry (~100 m). */
const r3 = (n: number) => n.toFixed(3);

export function useMe(enabled = true) {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeResponse>('/api/me'),
    staleTime: 5 * 60_000,
    retry: false,
    enabled,
  });
}

export function useActivities(startDate: string, enabled: boolean) {
  return useQuery({
    queryKey: ['activities', startDate],
    queryFn: () => api<{ activities: Activity[] }>(`/api/activities?since=${startDate}`).then((r) => r.activities),
    enabled,
    staleTime: 60_000,
  });
}

// ---- Strava ----
export async function connectStrava() {
  const { url } = await api<{ url: string }>('/api/strava/connect', { method: 'POST' });
  window.location.href = url;
}

export function useStravaActions() {
  const qc = useQueryClient();
  return {
    sync: async (since?: string) => {
      const r = await api<{ fetched: number }>('/api/strava/sync', { method: 'POST', json: since ? { since } : {} });
      await Promise.all([qc.invalidateQueries({ queryKey: ['activities'] }), qc.invalidateQueries({ queryKey: ['me'] })]);
      return r;
    },
    disconnect: async () => {
      await api('/api/strava/disconnect', { method: 'POST' });
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
  };
}

// ---- helpers used by the journey planner and explorer ----
export const geocode = (q: string) =>
  api<{ results: GeoResult[] }>(`/api/geocode?q=${encodeURIComponent(q)}&lang=${lang()}`).then((r) => r.results);

export const planRoute = (waypoints: LatLon[], mode: RouteMode) =>
  api<PlannedRoute>('/api/route', { method: 'POST', json: { waypoints, mode } });

export function usePhotos(point: LatLon | null) {
  return useQuery({
    queryKey: ['photos', point && r3(point[0]), point && r3(point[1])],
    queryFn: () =>
      api<{ photos: Photo[]; historic?: Photo[] }>(`/api/photos?lat=${point![0]}&lon=${point![1]}`).then((r) => ({ photos: r.photos, historic: r.historic ?? [] })),
    enabled: !!point,
    staleTime: 60 * 60_000,
  });
}

export function useSurroundings(point: LatLon | null) {
  return useQuery({
    queryKey: ['surroundings', point && r3(point[0]), point && r3(point[1]), lang()],
    queryFn: () => api<SurroundingsResponse>(`/api/surroundings?lat=${point![0]}&lon=${point![1]}&lang=${lang()}`),
    enabled: !!point,
    staleTime: 10 * 60_000,
  });
}

// ---- milestones, postcards, diary ----
export const flag = (cc: string) => (/^[A-Za-z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🏳️');

export function useMilestones(journeyId?: string) {
  return useQuery({
    queryKey: ['milestones', journeyId ?? 'all'],
    queryFn: () =>
      api<{ milestones: Milestone[]; countries?: string[] }>(`/api/milestones${journeyId ? `?journeyId=${encodeURIComponent(journeyId)}` : ''}`),
    staleTime: 60_000,
  });
}

export function useMilestoneActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['milestones'] });
  return {
    check: async (journeyId: string) => {
      const r = await api<{ created: Milestone[] }>('/api/milestones/check', { method: 'POST', json: { journeyId, lang: lang() } });
      if (r.created.length) await refresh();
      return r.created;
    },
    writePostcard: async (id: string) => {
      await api('/api/milestones/postcard', { method: 'POST', json: { id, lang: lang() } });
      await refresh();
    },
    markSeen: async (journeyId: string) => {
      await api('/api/milestones/seen', { method: 'POST', json: { journeyId } });
      await refresh();
    },
  };
}

export function useJourneyStories(journeyId: string) {
  return useQuery({
    queryKey: ['stories', journeyId],
    queryFn: () =>
      api<{ narrations: { key: string; text: string; at: string }[] }>(`/api/narrations?journeyId=${encodeURIComponent(journeyId)}`).then((r) => r.narrations),
  });
}

// ---- coach & bookmarks ----
export function useCoachPlan(journeyId: string) {
  return useQuery({
    queryKey: ['coach', journeyId],
    queryFn: () => api<{ plan: CoachPlan | null }>(`/api/coach?journeyId=${encodeURIComponent(journeyId)}`).then((r) => r.plan),
  });
}

/** Best-effort real location (for the weather-aware coach); resolves to null if denied. */
export const realLocation = () =>
  new Promise<{ lat: number; lon: number } | null>((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 3_600_000 },
    );
  });

export function useBookmarks(journeyId: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['bookmarks', journeyId],
    queryFn: () => api<{ bookmarks: Bookmark[] }>(`/api/bookmarks?journeyId=${encodeURIComponent(journeyId)}`).then((r) => r.bookmarks),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['bookmarks', journeyId] });
  return {
    ...q,
    add: async (b: Omit<Bookmark, 'id' | 'createdAt' | 'journeyId'>) => {
      await api('/api/bookmarks', { method: 'POST', json: { ...b, journeyId } });
      await refresh();
    },
    remove: async (id: string) => {
      await api(`/api/bookmarks?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await refresh();
    },
    /** Bookmark with the same title and position, if any. */
    find: (title: string, lat: number, lon: number) => q.data?.find((b) => b.title === title && Math.abs(b.lat - lat) < 1e-4 && Math.abs(b.lon - lon) < 1e-4),
  };
}
