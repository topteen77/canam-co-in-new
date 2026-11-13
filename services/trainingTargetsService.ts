import apiClient from './apiClient';

export type TrainingDocument = {
  id: string;
  module: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  toolUrl: string;
  sortOrder: number;
  uploadedBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TeamTarget = {
  id: string;
  userEmail: string;
  userName: string;
  periodLabel: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  leadsTarget: number;
  meetingsTarget: number;
  onboardingsTarget: number;
  notes?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TrainingMeta = {
  modules: string[];
  limits: {
    maxFileBytes: number;
    maxDocuments: number;
    allowedExt: string[];
  };
};

export async function fetchTrainingMeta(): Promise<TrainingMeta> {
  const { data } = await apiClient.get<TrainingMeta>('/training/meta');
  return data;
}

export async function listTrainingDocuments(): Promise<TrainingDocument[]> {
  const { data } = await apiClient.get<TrainingDocument[]>('/training/documents');
  return data || [];
}

export async function createTrainingDocument(payload: {
  title: string;
  module: string;
  toolUrl?: string;
  fileName: string;
  fileType: string;
  fileData: string;
}): Promise<TrainingDocument> {
  const { data } = await apiClient.post<TrainingDocument>('/training/documents', payload);
  return data;
}

export async function updateTrainingDocument(
  id: string,
  payload: Partial<{
    title: string;
    module: string;
    toolUrl: string;
    fileName: string;
    fileType: string;
    fileData: string;
  }>
): Promise<TrainingDocument> {
  const { data } = await apiClient.put<TrainingDocument>(`/training/documents/${id}`, payload);
  return data;
}

export async function deleteTrainingDocument(id: string): Promise<void> {
  await apiClient.delete(`/training/documents/${id}`);
}

export function trainingDownloadUrl(id: string): string {
  const base = apiClient.defaults.baseURL || '/api';
  return `${base}/training/documents/${id}/download`;
}

export async function downloadTrainingDocument(id: string, fileName: string): Promise<void> {
  const token =
    (typeof window !== 'undefined' &&
      (sessionStorage.getItem('crmToken') || localStorage.getItem('crmToken'))) ||
    '';
  const url = trainingDownloadUrl(id);
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(err.error || 'Download failed');
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName || 'training-document';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function listTeamTargets(userEmail?: string): Promise<TeamTarget[]> {
  const { data } = await apiClient.get<TeamTarget[]>('/training/targets', {
    params: userEmail ? { userEmail } : undefined,
  });
  return data || [];
}

export async function saveTeamTarget(payload: {
  userEmail: string;
  userName?: string;
  periodLabel: string;
  periodStart?: string;
  periodEnd?: string;
  leadsTarget?: number;
  meetingsTarget?: number;
  onboardingsTarget?: number;
  notes?: string;
}): Promise<TeamTarget> {
  const { data } = await apiClient.post<TeamTarget>('/training/targets', payload);
  return data;
}

export async function deleteTeamTarget(id: string): Promise<void> {
  await apiClient.delete(`/training/targets/${id}`);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
