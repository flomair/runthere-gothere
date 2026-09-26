import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Reward } from './types';

export function useRewards(journeyId?: string) {
  return useQuery({
    queryKey: ['rewards', journeyId ?? 'all'],
    queryFn: () => api<{ rewards: Reward[] }>(`/api/rewards${journeyId ? `?journeyId=${encodeURIComponent(journeyId)}` : ''}`).then((r) => r.rewards),
    staleTime: 30_000,
  });
}

export interface RewardDraft {
  title: string;
  atM: number;
  link?: string | null;
  photo?: string | null;
}

export function useRewardActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['rewards'] });
  return {
    create: async (journeyId: string, d: RewardDraft) => {
      await api('/api/rewards', { method: 'POST', json: { journeyId, ...d } });
      await refresh();
    },
    update: async (id: string, d: Partial<RewardDraft>) => {
      await api('/api/rewards', { method: 'PATCH', json: { id, ...d } });
      await refresh();
    },
    claim: async (id: string, claim: { photo?: string; note?: string }) => {
      await api('/api/rewards', { method: 'PATCH', json: { id, claim } });
      await refresh();
    },
    remove: async (id: string) => {
      await api(`/api/rewards?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await refresh();
    },
  };
}
