// Away-freeze test (v1.8.95): leaving the table tab mid-hand must freeze the
// game exactly; returning resumes from the same spot.
// Strategy: wait until a BOT is thinking (turn-status "Waiting for ..."),
// snapshot the visible state, switch to Learn for 3s, assert nothing moved,
// switch back, assert the game resumes (state changes / hero turn arrives).
var path = require('path');
var fs = require('fs');
var jsdom = require('jsdom');
var JSDOM = jsdom.JSDOM;
var dir = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
var dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
var w = dom.window;
var d = w.document;
w.scrollTo = function () {};
w.confirm = function () { return true; };
w.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: function () { return function () {}; }, set: function () { return true; } });
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

function $(id) { return d.getElementById(id); }
function snap() {
  return JSON.stringify({
    pot: ($('pot-display') || {}).textContent || '',
    board: d.querySelectorAll('#board .card').length,
    hero: ($('hero-info') || {}).textContent || '',
    seats: Array.prototype.map.call(d.querySelectorAll('.seat .stack'), function (e) { return e.textContent; }).join('|'),
    status: ($('turn-status') || {}).textContent || ''
  });
}
function waitFor(fn, timeoutMs, label) {
  return new Promise(function (resolve, reject) {
    var t0 = Date.now();
    (function poll() {
      var v;
      try { v = fn(); } catch { v = null; }
      if (v) return resolve(v);
      if (Date.now() - t0 > timeoutMs) return reject(new Error('timeout: ' + label));
      setTimeout(poll, 100);
    })();
  });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  var fails = 0;
  function ok(cond, name) { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); if (!cond) fails++; }
  try {
    $('btn-start').click();
    // Wait for a bot to be thinking (game live, not hero's turn).
    await waitFor(function () {
      var s = ($('turn-status') || {}).textContent || '';
      return s.indexOf('Waiting for') === 0 ? s : null;
    }, 20000, 'bot thinking');
    var before = snap();
    w.UI.showScreen('learn');
    ok(($('screen-table') || {}).hidden === true, 'table screen hidden on Learn');
    await sleep(3000);
    var during = snap();
    ok(before === during, 'state frozen while away (pot/board/stacks/status identical)');
    if (before !== during) { console.log('  before: ' + before); console.log('  during: ' + during); }
    w.UI.showScreen('table');
    // Game must resume: state changes or it becomes hero's turn within 8s.
    var resumed = await waitFor(function () {
      var s = ($('turn-status') || {}).textContent || '';
      if (s === 'Your turn') return 'hero-turn';
      return snap() !== before ? 'moved' : null;
    }, 8000, 'resume').catch(function () { return null; });
    ok(!!resumed, 'game resumed on return (' + resumed + ')');
    ok(errors.length === 0, 'no js errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  } catch (e) {
    console.log('FAIL exception: ' + e.message);
    fails++;
  }
  console.log(fails === 0 ? 'ALL AWAY-FREEZE TESTS PASSED' : fails + ' FAILURES');
  process.exit(fails === 0 ? 0 : 1);
})();
