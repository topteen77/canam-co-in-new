import { useEffect } from 'react';
import apiClient from '../services/apiClient';

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 20000,
    });
  });
}

export function useMeetingPresenceWatch(currentUser: string | null, hasActiveMeeting: boolean) {
  useEffect(() => {
    if (!currentUser || !hasActiveMeeting) return;
    let cancelled = false;

    const ping = async () => {
      try {
        const pos = await getPosition();
        if (cancelled) return;
        await apiClient.post('/meetings/presence', {
          email: currentUser,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          address: '',
        });
      } catch {
        // Permission denied or GPS unavailable — skip this tick
      }
    };

    ping();
    const timer = window.setInterval(ping, 60000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') ping();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentUser, hasActiveMeeting]);
}
