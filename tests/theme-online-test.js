// Theme-toggle / Online-tab regression test (2026-10-21): Kevin reported a
// transient blank of the Online tab when toggling the theme (v1.8.106, never
// reproduced). This locks in the DOM-state invariant: toggling the theme must
// never hide screen-online or empty its content, on the lobby or after
// navigating away and back.
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
w.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: function () { return function () {}; }, set: function () { return true; } });
};
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
function click(el) {
  el.click();
}
function visibleScreens() {
  return Array.prototype.filter.call(
    d.querySelectorAll('main .screen'),
    function (s) { return !s.hidden; }
  ).map(function (s) { return s.id; });
}
function onlineState() {
  var sc = d.getElementById('screen-online');
  var root = d.getElementById('online-root');
  return {
    shown: !!sc && !sc.hidden,
    hasContent: !!root && root.textContent.trim().length > 50,
    theme: d.documentElement.dataset.theme
  };
}

click(d.querySelector('.nav-btn[data-nav="online"]'));
var st = onlineState();
check(st.shown, 'online nav shows screen-online');
check(st.hasContent, 'screen-online has lobby content');

var themes = [];
for (var i = 0; i < 4; i++) {
  click(d.getElementById('theme-toggle'));
  st = onlineState();
  themes.push(st.theme);
  check(st.shown, 'screen-online still shown after theme toggle ' + (i + 1));
  check(st.hasContent, 'screen-online still has content after theme toggle ' + (i + 1));
  var vis = visibleScreens();
  check(vis.length === 1 && vis[0] === 'screen-online',
    'exactly screen-online visible after toggle ' + (i + 1) + ' (saw: ' + vis.join(',') + ')');
}
check(themes[0] !== themes[1] && themes[1] !== themes[2],
  'theme actually flips on toggle (' + themes.join('>') + ')');

click(d.querySelector('.nav-btn[data-nav="stats"]'));
check(!onlineState().shown, 'leaving online hides screen-online');
click(d.querySelector('.nav-btn[data-nav="online"]'));
click(d.getElementById('theme-toggle'));
st = onlineState();
check(st.shown && st.hasContent, 'online tab survives navigate-away, back, and toggle');

check(errors.length === 0, 'zero JS errors (' + errors.length + ' seen)');

if (failures) { console.log(failures + ' FAILURES (theme-online)'); }
else { console.log('THEME-ONLINE TEST PASSED'); }
process.exit(failures ? 1 : 0);
