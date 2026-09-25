import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { FeedItem, Group, GroupMode, GroupStandings, PublicJourney } from './types';
import { t } from './i18n';

export type GroupSummary = Omit<Group, 'route'> & { totalM: number };
export interface Invitation {
  id: string;
  name: string;
  mode: GroupMode;
  from: string;
  totalM: number;
}

export function useGroups() {
  return useQuery({
    queryKey: ['groups'],
    queryFn: () => api<{ groups: GroupSummary[]; invitations: Invitation[] }>('/api/groups'),
    staleTime: 60_000,
  });
}

export function useStandings(id: string) {
  return useQuery({
    queryKey: ['standings', id],
    queryFn: () => api<GroupStandings>(`/api/groups/standings?id=${encodeURIComponent(id)}`),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useFeed(id: string) {
  return useQuery({
    queryKey: ['feed', id],
    queryFn: () => api<{ feed: FeedItem[] }>(`/api/groups/feed?id=${encodeURIComponent(id)}`).then((r) => r.feed),
    refetchInterval: 60_000,
  });
}

export function useGroupActions() {
  const qc = useQueryClient();
  const refresh = (id?: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['groups'] }),
      id ? qc.invalidateQueries({ queryKey: ['feed', id] }) : undefined,
      id ? qc.invalidateQueries({ queryKey: ['standings', id] }) : undefined,
    ]);
  return {
    create: async (journeyId: string, name: string, mode: GroupMode, emails: string[]) => {
      const r = await api<{ id: string; notAllowed: string[] }>('/api/groups', { method: 'POST', json: { journeyId, name, mode, emails } });
      await refresh();
      return r;
    },
    invite: async (id: string, emails: string[]) => {
      const r = await api<{ notAllowed: string[] }>('/api/groups/invite', { method: 'POST', json: { id, emails } });
      await refresh(id);
      return r;
    },
    join: async (id: string) => {
      await api('/api/groups/join', { method: 'POST', json: { id } });
      await refresh(id);
    },
    leave: async (id: string) => {
      await api('/api/groups/leave', { method: 'POST', json: { id } });
      await refresh();
    },
    kudos: async (id: string, itemId: string) => {
      await api('/api/groups/kudos', { method: 'POST', json: { id, itemId } });
      await qc.invalidateQueries({ queryKey: ['feed', id] });
    },
    comment: async (id: string, text: string, itemId?: string) => {
      await api('/api/groups/comment', { method: 'POST', json: { id, itemId, text } });
      await qc.invalidateQueries({ queryKey: ['feed', id] });
    },
  };
}

// ---- public links ----
export const getShare = (journeyId: string) => api<{ token: string | null }>(`/api/shares?journeyId=${encodeURIComponent(journeyId)}`).then((r) => r.token);
export const createShare = (journeyId: string) => api<{ token: string }>('/api/shares', { method: 'POST', json: { journeyId } }).then((r) => r.token);
export const revokeShare = (journeyId: string) => api(`/api/shares?journeyId=${encodeURIComponent(journeyId)}`, { method: 'DELETE' });
export const shareUrl = (token: string) => `${window.location.origin}/#/s/${token}`;

export async function loadPublic(token: string): Promise<PublicJourney> {
  const res = await fetch(`/api/public?token=${encodeURIComponent(token)}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? t('This link is not available.'));
  return body as PublicJourney;
}
