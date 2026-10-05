const CACHE = 'avantika-hospitality-v12';
const SHELL = [
  '/',
  '/styles.css?v=12',
  '/guest.js?v=12',
  '/vendor/gsap.min.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/brands/kampai-interior.png',
  '/brands/basque-garden.jpg',
  '/brands/embassy-cp.jpg',
  '/brands/embassy-elan.jpg',
  '/brands/embassy-vk.jpg',
  '/brands/basque-logo.webp',
  '/fonts/cormorant-garamond.woff2',
  '/fonts/cormorant-sc.woff2',
  '/fonts/jost.woff2',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
