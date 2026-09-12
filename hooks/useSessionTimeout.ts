import { useEffect } from 'react';

const INACTIVITY_MS = 8 * 60 * 60 * 1000;

export function useSessionTimeout(currentUser: string | null, onTimeout: () => void) {
  useEffect(() => {
    if (!currentUser) return;

    let inactivityTimer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        onTimeout();
      }, INACTIVITY_MS);

      localStorage.setItem('lastActivityTime', Date.now().toString());
    };

    resetTimer();

    const activityHandler = () => {
      const lastActivity = parseInt(localStorage.getItem('lastActivityTime') || '0', 10);

      if (Date.now() - lastActivity > INACTIVITY_MS) {
        clearTimeout(inactivityTimer);
        onTimeout();
        return;
      }

      // Throttle updates to at most once per second
      if (Date.now() - lastActivity > 1000) {
        resetTimer();
      }
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, activityHandler, true);
    });

    const intervalId = setInterval(() => {
      const lastActivity = parseInt(localStorage.getItem('lastActivityTime') || '0', 10);
      if (Date.now() - lastActivity > INACTIVITY_MS) {
        clearTimeout(inactivityTimer);
        onTimeout();
      }
    }, 60000); // Check every minute

    return () => {
      clearTimeout(inactivityTimer);
      clearInterval(intervalId);
      events.forEach(event => {
        document.removeEventListener(event, activityHandler, true);
      });
    };
  }, [currentUser, onTimeout]);
}
