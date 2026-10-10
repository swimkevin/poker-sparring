// Update-flow regression test (2026-10-08): the footer "Check for updates"
// button must NAVIGATE to ?v=<new version>, not location.reload() — the old
// reload kept the stale ?v= param in the address bar, so the URL still showed
// the previous version after the refresh.
//
// jsdom cannot perform real navigations, so this tests the pure URL builder
// (the fix's core logic) plus that the live footer button is actually wired
// to it.
var path = require('path');
var fs = require('fs');
var jsdom = require('jsdom');
var JSDOM = jsdom.JSDOM;

var dir = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
var navAttempts = 0;
var vc = new jsdom.VirtualConsole();
vc.on('jsdomError', function (e) {
  if (e && /navigation/i.test(e.message || '')) navAttempts++;
});
var dom = new JSDOM(html, {
  url: 'http://localhost/index.html?v=test37',
  pretendToBeVisual: true,
  runScripts: 'dangerously',
  virtualConsole: vc
});
var w = dom.window;
var d = w.document;
w.scrollTo = function () {};
w.confirm = function () { return true; }; // accept the "reload now?" prompt
w.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: function () { return function () {}; }, set: function () { return true; } });
};
// The "server" reports a newer version than the page's APP_VERSION.
w.fetch = function () {
  return Promise.resolve({ text: function () { return Promise.resolve('9.9.9\n'); } });
};
var errors = [];
w.addEventListener('error', function (e) { errors.push(e.message || String(e.error)); });

['cards', 'evaluator', 'equity', 'engine', 'bots', 'names', 'pushfold', 'stats',
 'replay', 'room-server', 'netplay', 'ui', 'online', 'app']
  .forEach(function (f) {
    var s = d.createElement('script');
    s.textContent = fs.readFileSync(path.join(dir, 'js', f + '.js'), 'utf8');
    d.head.appendChild(s);
  });
d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

var failures = [];
function ok(cond, name) {
  if (cond) { console.log('ok: ' + name); }
  else { failures.push(name); console.log('FAIL: ' + name); }
}

setTimeout(function () {
  try {
    // 1. Pure URL builder: the heart of the fix.
    ok(typeof w.updateReloadURL === 'function', 'updateReloadURL is exposed');
    ok(w.updateReloadURL('/index.html', '9.9.9', '') === '/index.html',
      'page URL stays clean (no ?v=, v1.8.71 best practice)');
    ok(w.updateReloadURL('/index.html', '9.9.9', '#table') === '/index.html#table',
      'preserves the hash fragment');

    // 2. Live wiring: the footer button reaches the navigation line and uses
    // the builder (not location.reload).
    var btn = d.getElementById('btn-check-update');
    ok(!!btn, 'footer check-for-updates button exists');
    var src = btn.onclick ? btn.onclick.toString() : '';
    ok(src.indexOf('updateReloadURL') !== -1, 'button handler calls updateReloadURL');
    ok(src.indexOf('location.reload') === -1, 'button handler no longer calls location.reload');
    btn.click();
    setTimeout(function () {
      ok(navAttempts >= 1, 'clicking with a newer server version attempts navigation');
      var jsErrs = errors.filter(function (m) { return m.indexOf('navigation') === -1; });
      ok(!jsErrs.length, 'no js errors (' + jsErrs.join('; ') + ')');
      console.log(failures.length ? failures.length + ' FAILED (update-flow)' : 'update-flow: all passed');
      process.exit(failures.length ? 1 : 0);
    }, 800);
  } catch (e) {
    console.log('FAIL: exception ' + (e && e.message));
    process.exit(1);
  }
}, 1500);
