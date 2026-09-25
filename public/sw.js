const CACHE = 'avantika-guest-list-v3';
const SHELL = [
  '/',
  '/styles.css?v=3',
  '/guest.js?v=3',
  '/vendor/gsap.min.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/brands/kampai-interior.png',
  '/brands/basque-garden.webp',
  '/brands/basque-logo.webp',
  '/brands/embassy-heritage.webp',
  '/fonts/cormorant-garamond.woff2',
  '/fonts/cormorant-sc.woff2',
  '/fonts/jost.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      return response;
    })),
  );
});
