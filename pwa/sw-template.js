// Service worker template. The build (pwa/vitePlugin.ts) replaces the two
// placeholders below and emits the result as sw.js.
/* global __PRECACHE__, __VERSION__ */

const CACHE_PREFIX = 'dice-roller-';
const CACHE = CACHE_PREFIX + __VERSION__;
/** Every file of the app, relative to the service worker's scope. */
const PRECACHE = __PRECACHE__;

const inScope = (path) => new URL(path, self.registration.scope).href;

// Download the whole app up front, so it works offline after the first visit.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map(inScope)))
      .then(() => self.skipWaiting()),
  );
});

// Drop caches of older versions and take control of open pages.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Cache first: the app's files are versioned with the cache, so a new build
// installs a new service worker with fresh files.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // ignoreVary: servers may send "Vary: Origin", and module scripts are
  // requested with an Origin header that the precache requests lacked.
  const options = { cacheName: CACHE, ignoreVary: true };
  const cached =
    request.mode === 'navigate'
      ? caches.match(inScope('index.html'), options)
      : caches.match(request, options);
  event.respondWith(cached.then((response) => response ?? fetch(request)));
});
