var PS_VERSION = '1.8.119';
var CACHE_NAME = 'poker-sparring-' + PS_VERSION;
var V = '?v=' + PS_VERSION;
var APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './css/style.css' + V,
  './css/online.css' + V,
  './js/cards.js' + V,
  './js/evaluator.js' + V,
  './js/equity.js' + V,
  './js/engine.js' + V,
  './js/bots.js' + V,
  './js/names.js' + V,
  './js/pushfold.js' + V,
  './js/stats.js' + V,
  './js/replay.js' + V,
  './js/room-server.js' + V,
  './js/netplay.js' + V,
  './js/ui.js' + V,
  './js/online.js' + V,
  './js/app.js' + V
];
function cacheFirst(req) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
      return res;
    });
  });
}
function networkFirst(req) {
  return fetch(req).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
    return res;
  }).catch(function () {
    return caches.match(req);
  });
}
function isVersionCheck(url) {
  return url.pathname.slice(-11) === 'version.txt';
}
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (c) { return c.addAll(APP_SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE_NAME ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  var fresh = e.request.mode === 'navigate' || isVersionCheck(url);
  e.respondWith(fresh ? networkFirst(e.request) : cacheFirst(e.request));
});
