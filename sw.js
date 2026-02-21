/* ============================================================
   SERVICE WORKER — Scalpel Study Squad 20th Book
   FIX v2:
   ✅ Removed mode:'cors' for same-origin URLs (was breaking install)
   ✅ Removed external CDN/font URLs from PRECACHE_URLS (was crashing install on slow networks)
   ✅ Network-first for external resources (fonts, CDN, GitHub images)
   ✅ Cache-first for local files (index.html, manifest.json)
   ✅ localStorage data is NEVER touched by SW
============================================================ */

const CACHE_VERSION = 'sss-v2';
const STATIC_CACHE  = CACHE_VERSION + '-static';

/* Only cache LOCAL files during install — external URLs are too fragile */
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json'
];

/* ── Install: pre-cache local shell only ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))  /* plain strings, no cors mode */
      .then(() => self.skipWaiting())
      .catch(err => {
        console.warn('[SW] Install cache failed:', err);
        return self.skipWaiting(); /* still activate even if caching fails */
      })
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

/* ── Fetch handler ── */
self.addEventListener('fetch', event => {
  /* Ignore non-GET requests entirely */
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  /* ── Same-origin: Cache-first, fall back to network, then offline shell ── */
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;

        return fetch(event.request).then(response => {
          /* Only cache valid responses */
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(c => c.put(event.request, clone));
          return response;
        }).catch(() => {
          /* Offline fallback: serve index.html for navigation requests */
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          /* For other requests (e.g. sub-resources), return nothing gracefully */
          return new Response('', { status: 408, statusText: 'Offline' });
        });
      })
    );
    return;
  }

  /* ── External (fonts, CDN, GitHub images): Network-first, cache as backup ── */
  event.respondWith(
    fetch(event.request).then(response => {
      /* Only cache opaque-safe, successful responses */
      if (!response || response.status !== 200) {
        return response;
      }
      /* Don't cache opaque responses — they can corrupt the cache quota */
      if (response.type === 'opaque') {
        return response;
      }
      const clone = response.clone();
      caches.open(STATIC_CACHE).then(c => c.put(event.request, clone));
      return response;
    }).catch(() => {
      /* Offline: serve whatever we have cached for this external URL */
      return caches.match(event.request).then(cached => {
        return cached || new Response('', { status: 408, statusText: 'Offline' });
      });
    })
  );
});
