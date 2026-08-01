/* Security Access Tracker - service worker
 *
 * Strategy: NETWORK FIRST, cache as offline fallback.
 *
 * Cache-first repeatedly served stale builds on Samsung Internet, so this
 * always tries the network and only falls back to cache when genuinely
 * offline. Every successful fetch refreshes the cached copy, so the offline
 * fallback is always the most recent build that was reachable.
 *
 * Bump CACHE_VERSION on every deploy to evict old entries.
 */

var CACHE_VERSION = 'sat-v13';
var CACHE_NAME = 'security-access-tracker-' + CACHE_VERSION;

var PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.ico'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        // Individual failures must not abort the whole install.
        return Promise.all(PRECACHE.map(function (url) {
          return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names.map(function (name) {
          if (name !== CACHE_NAME) return caches.delete(name);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;

  // Only handle GETs from our own origin; never touch anything else.
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(function (response) {
        if (response && response.status === 200 && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, copy).catch(function () {});
          });
        }
        return response;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          // Navigation requests fall back to the app shell so the app still
          // opens offline even on a deep link.
          if (req.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
  );
});

// Lets the page trigger an immediate update without a manual reload.
self.addEventListener('message', function (event) {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
