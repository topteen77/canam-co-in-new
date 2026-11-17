import './index.css';
import './src/mobile.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary
      fallback={
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
          <div className="max-w-md text-center space-y-3">
            <p className="text-lg font-semibold text-slate-800">Something went wrong</p>
            <p className="text-sm text-slate-600">
              The page crashed while loading. Open the browser console for details, then reload.
            </p>
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      }
    >
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

const splashStartedAt = Date.now();
const hideSplash = () => {
  const splash = document.getElementById('app-splash');
  if (!splash || splash.classList.contains('is-done')) return;
  const remaining = Math.max(0, 2800 - (Date.now() - splashStartedAt));
  window.setTimeout(() => {
    splash.classList.add('is-done');
    window.setTimeout(() => splash.remove(), 380);
  }, remaining);
};

requestAnimationFrame(() => requestAnimationFrame(hideSplash));
window.setTimeout(hideSplash, 3600);
