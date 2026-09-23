import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LatLon } from '../../shared/geo';
import type {
  Activity,
  GeoResult,
  MeResponse,
  Photo,
  PlannedRoute,
  RouteMode,
  SurroundingsResponse,
} from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error ?? `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

export const lang = () => (typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en') || 'en';

/** Round coordinates so nearby look-ups share a cache entry (~100 m). */
const r3 = (n: number) => n.toFixed(3);

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeResponse>('/api/me'),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await api('/api/auth/logout', { method: 'POST' });
    await qc.invalidateQueries();
  };
}

export function useActivities(startDate: string, enabled: boolean) {
  // one day of slack for time zones; exact filtering happens on the local date
  const after = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000) - 86_400;
  return useQuery({
    queryKey: ['activities', after],
    queryFn: () => api<{ activities: Activity[] }>(`/api/activities?after=${after}`).then((r) => r.activities),
    enabled,
    staleTime: 5 * 60_000,
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
  });
}

export const geocode = (q: string) =>
  api<{ results: GeoResult[] }>(`/api/geocode?q=${encodeURIComponent(q)}&lang=${lang()}`).then((r) => r.results);

export const planRoute = (waypoints: LatLon[], mode: RouteMode) =>
  api<PlannedRoute>('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ waypoints, mode }),
  });

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
