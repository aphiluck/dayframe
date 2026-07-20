/* Dayframe Service Worker — offline-first app shell caching */

const CACHE_VERSION = 'dayframe-v6';
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

// Third-party CDN origins we're happy to cache with a stale-while-revalidate
// strategy so the app keeps working (with slightly stale libs) when offline.
const CACHEABLE_ORIGINS = [
  'cdn.tailwindcss.com',
  'unpkg.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache live data APIs
  if (url.hostname.includes('open-meteo.com') || url.hostname.includes('geocoding-api') ||
      url.hostname.includes('bigdatacloud.net') || url.hostname.includes('supabase.co')) {
    return;
  }

  // FIX: Safari blocks SW responses that are redirects on navigation requests.
  // For ALL navigation requests (typing URL, clicking links, page reload),
  // always serve index.html directly from cache — no redirects involved.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html')
        .then((cached) => cached || fetch('./index.html', { redirect: 'follow' }))
        .catch(() => fetch('./index.html'))
    );
    return;
  }

  // App shell static assets: cache-first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req, { redirect: 'follow' }).then((res) => {
          // Only cache successful, non-redirected responses
          if (res.ok && !res.redirected) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // Known CDN libraries: stale-while-revalidate.
  if (CACHEABLE_ORIGINS.some((o) => url.hostname.includes(o))) {
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) =>
        cache.match(req).then((cached) => {
          const networkFetch = fetch(req)
            .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
            .catch(() => cached);
          return cached || networkFetch;
        })
      )
    );
  }
});
