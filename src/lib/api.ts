import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LatLon } from '../../shared/geo';
import { idToken } from './firebase';
import type { Activity, GeoResult, MeResponse, Photo, PlannedRoute, RouteMode, SurroundingsResponse } from './types';

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
    queryFn: () => api<{ photos: Photo[] }>(`/api/photos?lat=${point![0]}&lon=${point![1]}`).then((r) => r.photos),
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
