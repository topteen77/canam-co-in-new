import { useEffect, useState } from 'react';
import apiClient from '../services/apiClient';

let cached: boolean | null = null;
let cachedAt = 0;
let inflight: Promise<boolean> | null = null;

function loadCallReady(force = false) {
  if (!force && cached !== null && Date.now() - cachedAt < 10000) return Promise.resolve(cached);
  if (!force && inflight) return inflight;
  inflight = apiClient.get('/kommuno/status')
    .then(({ data }) => {
      cached = Boolean(data?.callReady);
      cachedAt = Date.now();
      return cached;
    })
    .catch(() => {
      cached = false;
      cachedAt = Date.now();
      return false;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export function publishCallReady(callReady: boolean) {
  cached = callReady;
  cachedAt = Date.now();
  window.dispatchEvent(new CustomEvent('kommuno-call-ready', { detail: { callReady } }));
}

/** Admin always sees the call icon. Other roles see it only after a saved Kommuno API test succeeds. */
export function useShowCallIcon(isAdmin: boolean) {
  const [callReady, setCallReady] = useState<boolean | null>(cached);
  useEffect(() => {
    let stopped = false;
    const pull = (force = false) => {
      loadCallReady(force).then((value) => { if (!stopped) setCallReady(value); });
    };
    pull();
    const timer = window.setInterval(() => pull(true), 20000);
    const onChange = (event: Event) => {
      if (!stopped) setCallReady(Boolean((event as CustomEvent).detail?.callReady));
    };
    window.addEventListener('kommuno-call-ready', onChange);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('kommuno-call-ready', onChange);
    };
  }, []);
  return isAdmin || callReady === true;
}
