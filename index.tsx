import './index.css';
import './src/mobile.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalCrashHandlers } from './utils/globalCrashOverlay';

installGlobalCrashHandlers();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary label="CRM app">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

const SPLASH_SEEN_KEY = 'crm_splash_seen';
const splashAlreadySeen = (() => {
  try {
    return sessionStorage.getItem(SPLASH_SEEN_KEY) === '1';
  } catch {
    return false;
  }
})();

const splashStartedAt = Date.now();
const hideSplash = () => {
  const splash = document.getElementById('app-splash');
  if (!splash || splash.classList.contains('is-done')) return;
  const finish = () => {
    splash.classList.add('is-done');
    window.setTimeout(() => {
      try { splash.remove(); } catch { /* ignore */ }
    }, splashAlreadySeen ? 0 : 380);
  };
  if (splashAlreadySeen || document.documentElement.classList.contains('splash-skip')) {
    finish();
    return;
  }
  try { sessionStorage.setItem(SPLASH_SEEN_KEY, '1'); } catch { /* ignore */ }
  const remaining = Math.max(0, 2800 - (Date.now() - splashStartedAt));
  window.setTimeout(finish, remaining);
};

if (splashAlreadySeen) {
  hideSplash();
} else {
  requestAnimationFrame(() => requestAnimationFrame(hideSplash));
  window.setTimeout(hideSplash, 3600);
}
