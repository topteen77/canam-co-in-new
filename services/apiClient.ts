import axios from 'axios';

function isLocalHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function resolveApiUrl(): string {
  const configured = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '';
  if (typeof window !== 'undefined' && isLocalHost(window.location.hostname)) {
    try {
      if (configured && isLocalHost(new URL(configured, window.location.origin).hostname)) {
        return configured.replace(/\/$/, '');
      }
    } catch {
      // ignore invalid VITE_API_URL and use this machine's API
    }
    const port = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_PORT) || '5002';
    return `${window.location.protocol}//${window.location.hostname}:${port}/api`;
  }
  return (configured || 'https://canam.co.in/api').replace(/\/$/, '');
}

const API_URL = resolveApiUrl();

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT from sessionStorage (session) or localStorage (remember me)
apiClient.interceptors.request.use((config) => {
  const token =
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('crmToken')) ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('crmToken'));
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.warn('API Error:', error.response?.status, error.message);
    return Promise.reject(error);
  }
);

export default apiClient;