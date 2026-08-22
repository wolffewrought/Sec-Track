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

var CACHE_VERSION = 'sat-v146';
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

  /* A bare fetch() consults the browser's own HTTP cache first, and GitHub
     Pages serves HTML with a ten minute lifetime. That made this worker
     network-first in name only: a redeploy could keep serving the old page
     from the HTTP cache without ever reaching the network. Documents are
     therefore fetched with cache: 'reload', which bypasses that cache and
     refreshes it. Icons and the manifest can keep using it. */
  var isDocument = req.mode === 'navigate' ||
    /\.html($|\?)/.test(req.url) ||
    /\/$/.test(new URL(req.url).pathname);

  var networkFetch = isDocument
    ? fetch(req.url, { cache: 'reload', credentials: 'same-origin' })
    : fetch(req);

  event.respondWith(
    networkFetch
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
