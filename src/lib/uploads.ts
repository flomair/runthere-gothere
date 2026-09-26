import { useQuery } from '@tanstack/react-query';
import { api, authHeaders } from './api';

/** Shrink a photo in the browser (longest side 1600 px, JPEG) so uploads stay small and fast. */
export async function resizeImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error('This file is not a photo the browser can read.');
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not prepare the photo.'))), 'image/jpeg', quality));
}

/** Upload a photo to the user's private storage; returns its storage path. */
export async function uploadPhoto(file: File): Promise<string> {
  const blob = await resizeImage(file);
  const res = await fetch('/api/uploads', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'image/jpeg' }, body: blob });
  const body = (await res.json().catch(() => null)) as { path?: string; error?: string } | null;
  if (!res.ok || !body?.path) throw new Error(body?.error ?? `Upload failed (${res.status})`);
  return body.path;
}

/** Short-lived URL to show a stored photo. */
export function usePhotoUrl(path: string | undefined) {
  return useQuery({
    queryKey: ['photo-url', path],
    enabled: !!path,
    staleTime: 45 * 60_000,
    queryFn: () => api<{ url: string }>(`/api/uploads?path=${encodeURIComponent(path!)}`).then((r) => r.url),
  });
}
