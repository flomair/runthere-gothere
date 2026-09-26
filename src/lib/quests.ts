import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Quest, QuestParams, QuestPerson, QuestType } from './types';

export function useQuests() {
  return useQuery({
    queryKey: ['quests'],
    queryFn: () => api<{ quests: Quest[] }>('/api/quests').then((r) => r.quests),
    staleTime: 60_000,
  });
}

export function useFriends(enabled = true) {
  return useQuery({
    queryKey: ['quest-friends'],
    queryFn: () => api<{ friends: QuestPerson[] }>('/api/quests/friends').then((r) => r.friends),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export interface QuestDraft {
  toEmail: string;
  type: QuestType;
  params: QuestParams;
  days: number;
  gift: string;
  penalty?: string;
  message?: string;
}

export function useQuestActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['quests'] });
  return {
    create: async (d: QuestDraft) => {
      await api('/api/quests', { method: 'POST', json: d });
      await refresh();
      await qc.invalidateQueries({ queryKey: ['quest-friends'] });
    },
    respond: async (id: string, action: 'accept' | 'decline' | 'cancel' | 'delivered', journeyId?: string) => {
      await api('/api/quests', { method: 'PATCH', json: { id, action, journeyId } });
      await refresh();
    },
  };
}
