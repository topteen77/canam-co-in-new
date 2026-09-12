import './index.css';
import './src/mobile.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
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
