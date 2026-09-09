/**
 * Auth via backend API (JWT). No Firebase.
 */
import apiClient from './apiClient';

const CRM_USER = 'crmUser';
const CRM_TOKEN = 'crmToken';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
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

export async function login(email: string, password: string, rememberMe = true): Promise<{ user: AuthUser; token: string }> {
  const res = await apiClient.post<{ success: boolean; token: string; user: AuthUser }>('/auth/login', {
    email: email.trim().toLowerCase(),
    password: password.trim(),
  });
  if (!res.data?.token || !res.data?.user) throw new Error('Invalid response from server');
  const { token, user } = res.data;
  persistAuth(token, user, rememberMe);
  setAuthHeader(token);
  return { user, token };
}

export async function register(email: string, password: string, name: string): Promise<void> {
  await apiClient.post('/auth/register', {
    email: email.trim().toLowerCase(),
    password: password.trim(),
    name: (name || email.split('@')[0]).trim(),
  });
}

export function logout(): void {
  clearAuthStorage();
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
