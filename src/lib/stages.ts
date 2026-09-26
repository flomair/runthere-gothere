import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Stage } from './types';

export function useStages(groupId: string) {
  return useQuery({
    queryKey: ['stages', groupId],
    queryFn: () => api<{ stages: Stage[] }>(`/api/groups/stages?id=${encodeURIComponent(groupId)}`).then((r) => r.stages),
    staleTime: 60_000,
  });
}

export interface StageDraft {
  name: string;
  fromM: number;
  toM: number;
  startDate: string;
  days: number;
  participants: string[];
  prize: string;
}

export function useStageActions(groupId: string) {
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['stages', groupId] }), qc.invalidateQueries({ queryKey: ['feed', groupId] }), qc.invalidateQueries({ queryKey: ['play'] })]);
  return {
    create: async (d: StageDraft) => {
      await api('/api/groups/stages', { method: 'POST', json: { id: groupId, ...d } });
      await refresh();
    },
    act: async (stageId: string, action: 'cancel' | 'delivered') => {
      await api('/api/groups/stages', { method: 'PATCH', json: { id: groupId, stageId, action } });
      await refresh();
    },
    bonus: async (body: { text?: string; action?: 'delivered' }) => {
      await api('/api/groups/bonus', { method: 'POST', json: { id: groupId, ...body } });
      await qc.invalidateQueries({ queryKey: ['standings', groupId] });
    },
  };
}
