import { useEffect } from 'react';
import apiClient from '../services/apiClient';
import { getDeviceFingerprint, getSessionEnvironment } from '../services/deviceFingerprint';

export function useSessionGuard(currentUser: string | null, onRemoteLogout: (reason: string) => void) {
  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;

    const check = async () => {
      try {
        const { data } = await apiClient.post('/auth/session/heartbeat', {
          ...getDeviceFingerprint(),
          environment: getSessionEnvironment(),
        });
        if (!cancelled && data?.valid === false) {
          onRemoteLogout('This account was signed out from another device or by an admin.');
        }
      } catch (err: any) {
        const code = err?.response?.data?.error;
        const status = err?.response?.status;
        if (!cancelled && (code === 'SESSION_REVOKED' || status === 401 || status === 403)) {
          onRemoteLogout('This account was signed out from another device or by an admin.');
        }
      }
    };

    check();
    const timer = window.setInterval(check, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentUser, onRemoteLogout]);
}
