import apiClient from './apiClient';
import { getStoredUser } from './authService';
import { formatCrashReport, type CrashDetails } from '../components/CrashScreen';

export type CrashReportResult = {
  ok?: boolean;
  sent?: boolean;
  reason?: string;
  email?: string;
  error?: string;
};

const recentKeys = new Set<string>();

function crashKey(details: CrashDetails): string {
  return `${details.name || ''}|${details.message || ''}|${details.url || ''}|${details.source || ''}`;
}

function collectUserInfo() {
  const user = getStoredUser?.() || null;
  const anyUser = user as Record<string, unknown> | null;
  return {
    userEmail: String(anyUser?.email || ''),
    userName: String(anyUser?.name || anyUser?.userName || ''),
    userRole: String(anyUser?.role || ''),
    userId: String(anyUser?.id || ''),
  };
}

function collectClientMeta() {
  if (typeof window === 'undefined') {
    return { userAgent: '', viewport: '', appVersion: '' };
  }
  return {
    userAgent: navigator.userAgent || '',
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    appVersion: (document.querySelector('meta[name="app-version"]') as HTMLMetaElement)?.content
      || (window as Window & { __CRM_VERSION__?: string }).__CRM_VERSION__
      || '',
  };
}

/**
 * Fire-and-forget crash report to webadmin email (if configured).
 * Dedupes identical crashes in-session so one bad loop cannot spam SMTP.
 */
export async function reportCrashToWebadmin(details: CrashDetails): Promise<CrashReportResult> {
  const key = crashKey(details);
  if (recentKeys.has(key)) {
    return { ok: true, sent: false, reason: 'duplicate' };
  }
  recentKeys.add(key);

  const payload = {
    ...details,
    ...collectUserInfo(),
    ...collectClientMeta(),
    report: formatCrashReport({
      ...details,
      url: details.url || (typeof window !== 'undefined' ? window.location.href : ''),
      time: details.time || new Date().toISOString(),
    }),
    url: details.url || (typeof window !== 'undefined' ? window.location.href : ''),
    time: details.time || new Date().toISOString(),
  };

  try {
    const { data } = await apiClient.post('/client-errors', payload);
    return data || { ok: true, sent: false };
  } catch (error: any) {
    return {
      ok: false,
      sent: false,
      error: error?.response?.data?.error || error?.message || 'Could not send error report',
    };
  }
}
