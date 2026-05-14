// BombRogue Service Worker — aggressive runtime caching to minimize bandwidth.
//
// Strategy:
//   • /socket.io/* and /api/* → bypass SW entirely (real-time and dynamic)
//   • index.html (navigation requests) → network-first (so updates ship fast)
//   • /images, /sounds, /js, /css and other static files → cache-first
//     (downloaded once per device, then served from local cache forever
//      until the CACHE_VERSION bumps)
//
// Bump CACHE_VERSION when you ship new sounds, art, or JS that must replace
// older cached copies on existing installs. Old caches are deleted on activate.

const CACHE_VERSION = 'v2';
const CACHE_NAME    = `bombrogue-${CACHE_VERSION}`;

// Tiny shell that's always pre-fetched on install so the app boots offline.
const PRECACHE = [
  '/',
  '/css/style.css',
  '/manifest.json',
  '/images/icon-logo-192px.png',
  '/images/icon-logo-512px.png',
];

// Cache-first paths: large, rarely-changing assets. First fetch hits the
// network, every subsequent fetch comes from local cache (0 bandwidth).
const CACHE_FIRST_PREFIXES = [
  '/images/',
  '/sounds/',
  '/js/',
  '/css/',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Delete caches from previous versions so we don't accumulate stale files.
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Same-origin only — never intercept third-party requests.
  if (url.origin !== self.location.origin) return;

  // Real-time / dynamic endpoints: pass through to the network untouched.
  if (url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/api')) {
    return;
  }

  // Navigation requests (HTML): network-first so updates ship immediately,
  // fall back to cache offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(resp => {
        // Stash a fresh copy for offline fallback
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match(req).then(r => r || caches.match('/')))
    );
    return;
  }

  // Cache-first for everything that's static and large.
  const isCacheFirst = CACHE_FIRST_PREFIXES.some(p => url.pathname.startsWith(p));
  if (isCacheFirst) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(resp => {
          // Only cache successful, basic responses
          if (resp && resp.ok && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
          }
          return resp;
        });
      })
    );
    return;
  }

  // Default: try network, fall back to cache if offline.
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
