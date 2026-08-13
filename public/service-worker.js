const CACHE_NAME = 'am-connect-v7';
const APP_SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/forms.js',
  '/pdf.js',
  '/vendor/jspdf.umd.min.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install: pre-cache the entire app shell so the app opens with no network at all.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches on version bump.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - Navigation & app-shell requests: cache-first, so the app always opens offline.
// - API requests (/api/*): network-only — these are handled/queued by app.js, never cached.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) {
    return; // let it hit the network directly; app.js handles failures
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});
