// Canam CRM service worker — app shell + offline fallback
const CACHE_NAME = 'canam-crm-pwa-v11';
const APP_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.svg',
  '/splash-1080x1920.png',
  '/canam-crm-logo.png',
  '/canam-crm-logo-light.png',
  '/canam-crm-favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.error('Service Worker install cache failed:', error);
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

function isBypassed(url) {
  if (url.pathname.startsWith('/api/')) return true;
  if (url.pathname === '/version.json' || url.pathname === '/sw.js') return true;
  const host = url.hostname;
  return (
    host.includes('googleapis.com') ||
    host.includes('gstatic.com') ||
    host.includes('google.com') ||
    host.includes('firebase') ||
    host.includes('esm.sh') ||
    host.includes('jsdelivr.net') ||
    host.includes('unpkg.com') ||
    host.includes('tessdata.projectnaptha.com') ||
    host.includes('tesseract')
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (isBypassed(url)) return;

  const isDocument = request.mode === 'navigate' || request.destination === 'document';

  if (isDocument) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          return (await caches.match('/index.html')) || (await caches.match('/offline.html')) || Response.error();
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networked = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached || caches.match('/offline.html'));
      return cached || networked;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CHECK_UPDATE' && self.registration) {
    self.registration.update();
  }
});

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  const leadId = data.leadId;
  const followUpId = data.followUpId || data.meetingId;
  const notificationId = data.notificationId || event.notification.tag;
  const targetUrl = '/#/followups';

  if (event.action === 'snooze') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'NOTIFICATION_SNOOZE',
            notificationId,
            minutes: 15,
            leadId,
            meetingId: followUpId,
            followUpId
          });
        });
      })
    );
    event.notification.close();
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        const client = clientList[0];
        client.focus();
        client.postMessage({
          type: 'NOTIFICATION_CLICK',
          notificationId,
          leadId,
          meetingId: followUpId,
          followUpId,
          action: 'view'
        });
        return;
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
  event.notification.close();
});
