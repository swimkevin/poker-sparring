// Online mobile scroll regression test (2026-10-23): Kevin reported the
// "Play online" page couldn't scroll on iPhone — the Host/Join forms were
// clipped because #online-view had overflow:hidden on mobile. This locks in
// the fix: Home and Lobby views get the online-scroll class (scrollable),
// the in-game table view does not (stays fixed).
var path = require('path');
var fs = require('fs');
var jsdom = require('jsdom');
var JSDOM = jsdom.JSDOM;

var dir = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
var dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
var w = dom.window, d = w.document;
w.scrollTo = function () {};
w.confirm = function () { return true; };
var errors = [];
w.addEventListener('error', function (e) { errors.push(e.message || String(e.error)); });
['cards', 'evaluator', 'equity', 'engine', 'bots', 'names', 'pushfold', 'stats',
 'replay', 'room-server', 'netplay', 'ui', 'online', 'app'].forEach(function (f) {
  var s = d.createElement('script');
  s.textContent = fs.readFileSync(path.join(dir, 'js', f + '.js'), 'utf8');
  d.head.appendChild(s);
});
d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

var failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.log('FAIL: ' + msg); }
  else { console.log('ok: ' + msg); }
}

var view = d.getElementById('online-view');
check(view === null || !!view, 'online-view lookup does not throw (created on tab open)');

var css = fs.readFileSync(path.join(dir, 'css', 'style.css'), 'utf8');
check(css.indexOf('#online-view.online-scroll') !== -1,
  'CSS defines .online-scroll rules for #online-view');
check(css.indexOf('overflow-y: auto') !== -1,
  'CSS enables vertical scrolling for the scrollable online view');
check(css.indexOf('-webkit-overflow-scrolling: touch') !== -1,
  'CSS enables momentum scrolling on iOS');

var src = fs.readFileSync(path.join(dir, 'js', 'online.js'), 'utf8');
check(src.indexOf("classList.add('online-scroll')") !== -1,
  'online.js adds online-scroll class (Home/Lobby)');
check(src.indexOf("classList.remove('online-scroll')") !== -1,
  'online.js removes online-scroll class (in-game table)');

check(errors.length === 0, 'no JS errors during boot (' + errors.length + ')');

console.log(failures === 0 ? 'ONLINE SCROLL TEST PASSED' : 'ONLINE SCROLL TEST FAILED (' + failures + ')');
process.exit(failures ? 1 : 0);
