const CACHE_NAME = 'fitness-hq-v4';

const PAGES = [
  'workout-reference-guide.html',
  'fitness-ecosystem-master-plan.html',
  'calisthenics-master-plan.html',
  'fitness-nutrition-systems.html',
  'warm-up-routines-v1.2.html',
  'yoga-strap-flexibility-routine.html',
  'targeted-practice.html',
  'checkin-summary.html',
  'yoga-app-ecosystem-master-plan-v5.1.html',
  'smoothie-lab.html',
  'workout-logger.html',
  'check-in-app.html',
  'icon-192.png',
  'icon-512.png',
];

// Install — cache all pages
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PAGES))
  );
});

// Activate — immediately clear ALL old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first, fall back to cache
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
