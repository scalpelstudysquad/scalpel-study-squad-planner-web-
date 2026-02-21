/* ============================================================
   SERVICE WORKER — Scalpel Study Squad 20th Book
   FIX v3 — Home Screen Icon Opens Correctly
   ✅ Uses absolute URLs as cache keys (no relative path mismatch)
   ✅ Cache-FIRST for navigation (works offline / from home screen)
   ✅ Caches the real resolved start_url on install
   ✅ Stale-while-revalidate for local assets
   ✅ Network-first for external resources, cached fallback
   ✅ localStorage/IndexedDB never touched
============================================================ */

const CACHE_VERSION  = 'sss-v4';
const STATIC_CACHE   = CACHE_VERSION + '-static';
const DYNAMIC_CACHE  = CACHE_VERSION + '-dynamic';

/* Build absolute URLs so cache keys always match what the browser requests */
const BASE = self.location.pathname.replace(/\/sw\.js$/, '/');

const SHELL_URLS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json'
];

/* ── INSTALL: pre-cache the app shell with absolute URLs ── */
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);

      /* Cache each URL individually so one failure doesn't block all */
      await Promise.allSettled(
        SHELL_URLS.map(url =>
          cache.add(new Request(url, { cache: 'reload' }))
            .catch(err => console.warn('[SW] Failed to cache:', url, err))
        )
      );

      console.log('[SW] Shell cached. Skipping waiting.');
      await self.skipWaiting();
    })()
  );
});

/* ── ACTIVATE: wipe old caches, claim all clients immediately ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      );
      /* Claim immediately so the new SW controls already-open tabs */
      await self.clients.claim();
      console.log('[SW] Activated and claimed all clients.');
    })()
  );
});

/* ── FETCH: smart routing ── */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  /* ── 1. NAVIGATION requests → Cache-first, then network ──
     This is the critical fix. Standalone PWA launch hits this path.
     We serve the cached shell immediately so it NEVER hits the network
     on open. After serving, we try to update the cache in the background. */
  if (event.request.mode === 'navigate') {
    event.respondWith(navigationHandler(event.request));
    return;
  }

  /* ── 2. Same-origin static assets → Stale-while-revalidate ── */
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event.request, STATIC_CACHE));
    return;
  }

  /* ── 3. External (fonts, CDN, GitHub images) → Network-first, cache fallback ── */
  event.respondWith(networkFirstExternal(event.request));
});

/* ────────────────────────────────────────────
   STRATEGY: Navigation — Cache-first
   Serve shell instantly. Revalidate in background.
──────────────────────────────────────────── */
async function navigationHandler(request) {
  /* Try the exact URL first, then try index.html as universal fallback */
  const cached =
    (await caches.match(request, { ignoreSearch: true })) ||
    (await caches.match(BASE + 'index.html')) ||
    (await caches.match(BASE));

  if (cached) {
    /* Serve cached version immediately, update in background */
    updateCacheInBackground(request);
    return cached;
  }

  /* Nothing cached yet — go to network (first launch with network) */
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    /* Truly offline, nothing cached — return a minimal offline page */
    return offlineFallback();
  }
}

/* ────────────────────────────────────────────
   STRATEGY: Stale-While-Revalidate (same-origin assets)
──────────────────────────────────────────── */
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);

  const networkFetch = fetch(request).then(async response => {
    if (response && response.status === 200 && response.type === 'basic') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  return cached || await networkFetch || new Response('', { status: 408 });
}

/* ────────────────────────────────────────────
   STRATEGY: Network-first (external resources)
──────────────────────────────────────────── */
async function networkFirstExternal(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'opaque') {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    return cached || new Response('', { status: 408, statusText: 'Offline' });
  }
}

/* ── Background cache update (don't block response) ── */
function updateCacheInBackground(request) {
  fetch(request).then(async response => {
    if (response && response.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response);
    }
  }).catch(() => { /* Offline — that's fine */ });
}

/* ── Minimal offline fallback page ── */
function offlineFallback() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Scalpel Study Squad — Offline</title>
<style>
  body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;
    justify-content:center;background:#0A1929;color:#E8F4FD;font-family:sans-serif;text-align:center;padding:20px;}
  h1{color:#4FC3F7;font-size:1.5rem;margin-bottom:12px;}
  p{color:#90CAF9;font-size:0.95rem;line-height:1.6;max-width:320px;}
  button{margin-top:24px;padding:12px 28px;background:#1976D2;color:#fff;border:none;
    border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer;letter-spacing:1px;}
</style>
</head>
<body>
  <h1>📴 You're Offline</h1>
  <p>SSS 20th Book needs one network visit to cache fully. Please connect and reload once.</p>
  <button onclick="location.reload()">🔄 Retry</button>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

