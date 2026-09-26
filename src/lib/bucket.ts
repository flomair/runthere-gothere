import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { BucketView, Draw, Prize, PrizeTier } from './types';

export function useBucket(groupId: string) {
  return useQuery({
    queryKey: ['bucket', groupId],
    queryFn: () => api<BucketView>(`/api/groups/bucket?id=${encodeURIComponent(groupId)}`),
    staleTime: 30_000,
  });
}

export function usePrizePhoto(groupId: string, prizeId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['prize-photo', groupId, prizeId],
    queryFn: () => api<{ url: string }>(`/api/groups/draw?id=${encodeURIComponent(groupId)}&prizeId=${encodeURIComponent(prizeId)}`).then((r) => r.url),
    staleTime: 50 * 60_000,
    enabled,
  });
}

export function useBucketActions(groupId: string) {
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['bucket', groupId] }), qc.invalidateQueries({ queryKey: ['feed', groupId] }), qc.invalidateQueries({ queryKey: ['play'] })]);
  return {
    refresh,
    add: async (title: string, tier: PrizeTier, anonymous: boolean) => {
      await api('/api/groups/bucket', { method: 'POST', json: { id: groupId, title, tier, anonymous } });
      await refresh();
    },
    remove: async (prizeId: string) => {
      await api('/api/groups/bucket', { method: 'PATCH', json: { id: groupId, prizeId, action: 'remove' } });
      await refresh();
    },
    /** Draw; the caller refreshes after the reveal so the list doesn't spoil it. */
    draw: (drawId: string) => api<{ draw: Draw; prize: Prize }>('/api/groups/draw', { method: 'POST', json: { id: groupId, drawId } }),
    deliver: async (prizeId: string, photo?: string | null, note?: string) => {
      await api('/api/groups/bucket', { method: 'PATCH', json: { id: groupId, prizeId, action: 'delivered', photo: photo || undefined, note } });
      await refresh();
    },
  };
}
