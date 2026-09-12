/**
 * Auth via backend API (JWT). No Firebase.
 */
import apiClient from './apiClient';
import { getDeviceFingerprint, getSessionEnvironment } from './deviceFingerprint';

const CRM_USER = 'crmUser';
const CRM_TOKEN = 'crmToken';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

export interface ActiveSessionInfo {
  id?: string;
  deviceId?: string;
  deviceType?: string;
  deviceName?: string;
  ipAddress?: string;
  lastSeen?: string;
  createdAt?: string;
  environment?: string;
}

export class SessionActiveError extends Error {
  code = 'SESSION_ACTIVE';
  canForceLogin: boolean;
  activeSession: ActiveSessionInfo | null;
  otherSessions: ActiveSessionInfo[];

  constructor(
    message: string,
    canForceLogin: boolean,
    activeSession: ActiveSessionInfo | null,
    otherSessions: ActiveSessionInfo[] = []
  ) {
    super(message);
    this.name = 'SessionActiveError';
    this.canForceLogin = canForceLogin;
    this.activeSession = activeSession;
    this.otherSessions = otherSessions;
  }
}

export function readSessionActiveError(err: any): SessionActiveError | null {
  if (err instanceof SessionActiveError) return err;
  if (err?.code === 'SESSION_ACTIVE' && err.activeSession !== undefined) return err as SessionActiveError;
  const data = err?.response?.data;
  if (data?.error === 'SESSION_ACTIVE') {
    return new SessionActiveError(
      data.message || 'This account is already signed in on another device.',
      Boolean(data.canForceLogin),
      data.activeSession || null,
      Array.isArray(data.otherSessions) ? data.otherSessions : []
    );
  }
  return null;
}

function getAuthItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(key) || localStorage.getItem(key);
}

function persistAuth(token: string, user: AuthUser, remember: boolean): void {
  const keep = remember ? localStorage : sessionStorage;
  const drop = remember ? sessionStorage : localStorage;
  drop.removeItem(CRM_TOKEN);
  drop.removeItem(CRM_USER);
  keep.setItem(CRM_TOKEN, token);
  keep.setItem(CRM_USER, JSON.stringify(user));
}

function clearAuthStorage(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CRM_USER);
  localStorage.removeItem(CRM_TOKEN);
  sessionStorage.removeItem(CRM_USER);
  sessionStorage.removeItem(CRM_TOKEN);
}

function loginBody(email: string, password: string, extra: Record<string, unknown> = {}) {
  return {
    email: email.trim().toLowerCase(),
    password: password.trim(),
    ...getDeviceFingerprint(),
    environment: getSessionEnvironment(),
    ...extra,
  };
}

function throwIfSessionActive(err: any): never {
  const data = err?.response?.data;
  if (data?.error === 'SESSION_ACTIVE') {
    throw new SessionActiveError(
      data.message || 'This account is already signed in on another device.',
      Boolean(data.canForceLogin),
      data.activeSession || null,
      Array.isArray(data.otherSessions) ? data.otherSessions : []
    );
  }
  throw err;
}

export async function login(email: string, password: string, rememberMe = true): Promise<{ user: AuthUser; token: string }> {
  try {
    const res = await apiClient.post<{ success: boolean; token: string; user: AuthUser }>('/auth/login', loginBody(email, password));
    if (!res.data?.token || !res.data?.user) throw new Error('Invalid response from server');
    const { token, user } = res.data;
    persistAuth(token, user, rememberMe);
    setAuthHeader(token);
    return { user, token };
  } catch (err) {
    throwIfSessionActive(err);
  }
}

const MASTER_UNLOCK = 'crmMasterUnlock';

export function getMasterUnlockToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(MASTER_UNLOCK);
}

export function clearMasterUnlockToken(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(MASTER_UNLOCK);
}

export function masterUnlockHeaders(): Record<string, string> {
  const token = getMasterUnlockToken();
  return token ? { 'X-Master-Unlock': token } : {};
}

export async function requestForceLoginOtp(email: string, password: string): Promise<{ success: boolean; message?: string }> {
  const res = await apiClient.post('/auth/force-login/request-otp', loginBody(email, password));
  return res.data;
}

export async function forceLogin(email: string, password: string, masterPassword: string, rememberMe = true): Promise<{ user: AuthUser; token: string }> {
  const res = await apiClient.post<{ success: boolean; token: string; user: AuthUser }>(
    '/auth/force-login',
    loginBody(email, password, { masterPassword: masterPassword.trim() })
  );
  if (!res.data?.token || !res.data?.user) throw new Error('Invalid response from server');
  const { token, user } = res.data;
  persistAuth(token, user, rememberMe);
  setAuthHeader(token);
  return { user, token };
}

export async function unlockMaster(masterPassword: string): Promise<void> {
  const res = await apiClient.post('/admin/master/unlock', { masterPassword: masterPassword.trim() });
  if (!res.data?.unlockToken) throw new Error('Master unlock failed');
  sessionStorage.setItem(MASTER_UNLOCK, res.data.unlockToken);
}

export async function register(email: string, password: string, name: string): Promise<void> {
  await apiClient.post('/auth/register', {
    email: email.trim().toLowerCase(),
    password: password.trim(),
    name: (name || email.split('@')[0]).trim(),
  });
}

export function logout(): void {
  const token = getStoredToken();
  if (token) {
    apiClient.post('/auth/logout').catch(() => undefined);
  }
  clearAuthStorage();
  clearMasterUnlockToken();
  delete apiClient.defaults.headers.common['Authorization'];
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = getAuthItem(CRM_USER);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  return getAuthItem(CRM_TOKEN);
}

/** Set Bearer token on apiClient so all requests are authenticated */
export function setAuthHeader(token: string | null): void {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
}

/** Restore auth header from localStorage (call once on app load) */
export function restoreAuth(): void {
  const token = getStoredToken();
  if (token) setAuthHeader(token);
}

/** Validate token and return current user */
export async function getMe(): Promise<AuthUser | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    setAuthHeader(token);
    const res = await apiClient.get<AuthUser>('/auth/me');
    const user = res.data;
    if (user) {
      const remember = typeof window !== 'undefined' && !!localStorage.getItem(CRM_TOKEN);
      persistAuth(token, user, remember);
    }
    return user;
  } catch {
    logout();
    return null;
  }
}
