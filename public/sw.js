// BombRogue Service Worker — minimal PWA shell
// Sert uniquement à satisfaire le critère PWA installable.
// Le jeu est temps-réel via Socket.io donc pas de cache agressif.

const CACHE_NAME = 'bombrogue-v1';

// Fichiers statiques à mettre en cache pour un chargement rapide
const PRECACHE = [
  '/',
  '/css/style.css',
  '/images/icon-logo-192px.png',
  '/images/icon-logo-512px.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Nettoie les anciens caches
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Laisse passer les requêtes Socket.io et API sans interférence
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/api')) {
    return;
  }

  // Network-first pour tout le reste (jeu toujours à jour)
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request)
    )
  );
});
