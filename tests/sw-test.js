// Service worker regression test (v1.8.107): sw.js makes the PWA installable
// and genuinely offline-capable. Verified in a stubbed worker environment:
//  - version consistency everywhere (version.txt, APP_VERSION, package.json,
//    every ?v= in index.html, PS_VERSION in sw.js)
//  - install precaches the full app shell (every asset index.html references)
//  - activate deletes stale versioned caches
//  - versioned assets are cache-first; navigations and version.txt are
//    network-first so the update check (fetch('version.txt?v='+Date.now()))
//    keeps working and the page never goes stale while online
//  - cross-origin and non-GET requests pass through untouched
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var dir = path.join(__dirname, '..');
var failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.log('FAIL: ' + msg); }
  else { console.log('ok: ' + msg); }
}

var version = fs.readFileSync(path.join(dir, 'version.txt'), 'utf8').trim();
var html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
var appJs = fs.readFileSync(path.join(dir, 'js', 'app.js'), 'utf8');
var pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
var swSrc = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');

check(appJs.indexOf("var APP_VERSION = '" + version + "'") !== -1,
  'APP_VERSION matches version.txt (' + version + ')');
check(pkg.version === version, 'package.json version matches version.txt');
var busts = {};
html.replace(/(src|href)="([^"]+)\?v=([^"]+)"/g, function (m, a, u, v) { busts[u] = v; return m; });
var bustUrls = Object.keys(busts);
check(bustUrls.length >= 15, 'index.html carries versioned asset URLs (' + bustUrls.length + ')');
check(bustUrls.every(function (u) { return busts[u] === version; }),
  'every ?v= cache-buster in index.html matches version.txt');
var psVer = (swSrc.match(/var PS_VERSION = '([^']+)'/) || [])[1];
check(psVer === version, 'sw.js PS_VERSION matches version.txt');
check(appJs.indexOf("navigator.serviceWorker.register('sw.js')") !== -1,
  'app.js registers sw.js on boot');
check(!/\/\/|\/\*/.test(swSrc.replace(/'(?:[^'\\]|\\.)*'/g, "''")),
  'sw.js ships with zero comments');

var ORIGIN = 'https://x.test';
var SCOPE = ORIGIN + '/poker-sparring/';
function abs(u) { return new URL(u, SCOPE + 'sw.js').href; }
var networkFiles = {};
bustUrls.forEach(function (u) { networkFiles[abs('./' + u + '?v=' + version)] = 'code:' + u; });
['', 'index.html', 'manifest.json', 'icons/icon.svg', 'version.txt'].forEach(function (p) {
  networkFiles[abs('./' + p)] = 'file:' + (p || 'root');
});

var handlers = {};
var store = {};
var networkHits = [];
var sandbox = {
  self: {
    location: { origin: ORIGIN },
    addEventListener: function (name, fn) { handlers[name] = fn; },
    skipWaiting: function () { return Promise.resolve(); },
    clients: { claim: function () { return Promise.resolve(); } }
  },
  caches: {
    open: function (name) {
      store[name] = store[name] || {};
      var bucket = store[name];
      return Promise.resolve({
        addAll: function (urls) {
          urls.forEach(function (u) {
            var a = abs(u);
            if (networkFiles[a] === undefined) throw new Error('precache 404: ' + a);
            bucket[a] = 'precached:' + a;
          });
          return Promise.resolve();
        },
        put: function (rq, rs) { bucket[rq.url] = rs; return Promise.resolve(); },
        match: function (rq) { return Promise.resolve(bucket[rq.url] || null); }
      });
    },
    keys: function () { return Promise.resolve(Object.keys(store)); },
    delete: function (name) { delete store[name]; return Promise.resolve(); },
    match: function (rq) {
      var names = Object.keys(store);
      for (var i = 0; i < names.length; i++) {
        if (store[names[i]][rq.url] !== undefined) return Promise.resolve(store[names[i]][rq.url]);
      }
      return Promise.resolve(null);
    }
  },
  fetch: function (rq) {
    networkHits.push(rq.url);
    var body = networkFiles[rq.url];
    if (body === undefined) return Promise.reject(new Error('net 404: ' + rq.url));
    return Promise.resolve({ url: rq.url, clone: function () { return { url: rq.url, body: body }; } });
  },
  URL: URL,
  Promise: Promise
};
vm.createContext(sandbox);
vm.runInContext(swSrc, sandbox, { filename: 'sw.js' });
check(handlers.install && handlers.activate && handlers.fetch, 'sw.js registers install/activate/fetch handlers');

function fire(name, event) {
  var p;
  var e = Object.assign({
    waitUntil: function (pr) { p = pr; return pr; },
    respondWith: function (pr) { p = pr; return pr; }
  }, event);
  handlers[name](e);
  return p;
}
function req(url, mode, method) { return { url: url, mode: mode || 'no-cors', method: method || 'GET' }; }

(async function () {
  await fire('install', {});
  var names = Object.keys(store);
  check(names.length === 1 && names[0].indexOf(version) !== -1,
    'install creates exactly one versioned cache (' + names.join(',') + ')');
  var cached = Object.keys(store[names[0]]);
  var expected = bustUrls.map(function (u) { return abs('./' + u + '?v=' + version); })
    .concat([abs('./'), abs('./index.html'), abs('./manifest.json'), abs('./icons/icon.svg')]);
  var missing = expected.filter(function (u) { return cached.indexOf(u) === -1; });
  check(missing.length === 0, 'install precaches every asset index.html references' +
    (missing.length ? ' — missing: ' + missing.join(', ') : ' (' + cached.length + ' urls)'));

  store['poker-sparring-0.0.0'] = {};
  await fire('activate', {});
  check(Object.keys(store).length === 1, 'activate deletes stale caches');

  var assetUrl = abs('./js/app.js?v=' + version);
  networkHits.length = 0;
  var r1 = await fire('fetch', { request: req(assetUrl) });
  check(r1 === 'precached:' + assetUrl, 'versioned asset served from cache');
  check(networkHits.length === 0, 'cached asset costs zero network hits');

  var missUrl = abs('./js/brand-new.js?v=' + version);
  networkFiles[missUrl] = 'new';
  var r2 = await fire('fetch', { request: req(missUrl) });
  check(r2 && r2.url === missUrl && networkHits.indexOf(missUrl) !== -1,
    'uncached asset falls back to network');
  networkHits.length = 0;
  await fire('fetch', { request: req(missUrl) });
  check(networkHits.length === 0, 'asset is cached after its first network fetch');

  var vtxt = abs('./version.txt?v=1234567890123');
  networkFiles[vtxt] = '9.9.9';
  networkHits.length = 0;
  await fire('fetch', { request: req(vtxt) });
  check(networkHits.indexOf(vtxt) !== -1,
    'version.txt uses network-first (update check keeps working despite ?v= timestamp)');

  var navUrl = abs('./');
  networkHits.length = 0;
  await fire('fetch', { request: req(navUrl, 'navigate') });
  check(networkHits.indexOf(navUrl) !== -1, 'navigation tries network first');
  delete networkFiles[navUrl];
  var r5 = await fire('fetch', { request: req(navUrl, 'navigate') });
  check(r5 && r5.url === navUrl, 'navigation falls back to cache when offline');

  networkHits.length = 0;
  var p1 = fire('fetch', { request: req('https://cdn.example.com/lib.js') });
  var p2 = fire('fetch', { request: req(assetUrl, 'no-cors', 'POST') });
  await p1; await p2;
  check(networkHits.length === 0, 'cross-origin and non-GET requests bypass the worker untouched');

  console.log(failures ? 'SW TEST FAILED (' + failures + ')' : 'SW TEST PASSED');
  process.exit(failures ? 1 : 0);
})().catch(function (e) { console.log('SW TEST THREW: ' + (e && e.stack || e)); process.exit(1); });
