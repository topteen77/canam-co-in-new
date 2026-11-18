import apiClient from './apiClient';

export type LostReasonRow = {
  id: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  isSystem?: boolean;
};

export const LOST_REASON_OTHER = '__other__';

export function isLostLeadStatus(status?: string | null): boolean {
  const value = String(status || '').trim().toLowerCase();
  return value === 'lost' || value === 'lost post onboarding';
}

export async function listLostReasons(params: { includeInactive?: boolean } = {}): Promise<LostReasonRow[]> {
  const { data } = await apiClient.get<LostReasonRow[]>('/lost-reason-master', { params });
  return Array.isArray(data) ? data : [];
}

export async function saveLostReason(payload: Partial<LostReasonRow> & { name: string }) {
  if (payload.id) {
    const { data } = await apiClient.put(`/lost-reason-master/${payload.id}`, payload);
    return data;
  }
  const { data } = await apiClient.post('/lost-reason-master', payload);
  return data;
}

export async function deleteLostReason(id: string) {
  const { data } = await apiClient.delete(`/lost-reason-master/${id}`);
  return data;
}

/** Persist a custom "Other" reason into master so it appears next time. */
export async function ensureCustomLostReason(name: string) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const { data } = await apiClient.post('/lost-reason-master/ensure', { name: trimmed });
  return data;
}
