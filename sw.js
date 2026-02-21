/* ============================================================
   SERVICE WORKER — Scalpel Study Squad 20th Book
   Strategy: Cache-first for static assets, network-first for
   everything else. localStorage data is NOT touched by SW.
   Updating the CACHE_VERSION below forces a fresh cache on
   next visit — user data in localStorage is always preserved.
============================================================ */

const CACHE_VERSION = 'sss-v1';
const STATIC_CACHE  = CACHE_VERSION + '-static';

/* Files to cache on install */
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Roboto+Condensed:wght@400;700&family=Roboto+Mono:wght@400;500&family=Nunito:wght@700;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

/* ── Install: pre-cache static shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS.map(url => {
        return new Request(url, { mode: 'cors' });
      })).catch(() => cache.addAll(['./index.html'])))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: delete old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: cache-first for same-origin, network-first for CDN ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Always go network for non-GET requests */
  if (event.request.method !== 'GET') return;

  /* Cache-first strategy for same-origin files (index.html, manifest) */
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(c => c.put(event.request, clone));
          return response;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  /* Network-first for external CDN (fonts, jspdf, GitHub images) */
  event.respondWith(
    fetch(event.request).then(response => {
      if (!response || response.status !== 200 || response.type === 'opaque') {
        return response;
      }
      const clone = response.clone();
      caches.open(STATIC_CACHE).then(c => c.put(event.request, clone));
      return response;
    }).catch(() => caches.match(event.request))
  );
});

