// Winner highlight (v1.8.97, Kevin): at showdown the winning best-5 cards
// lift (board cards + winner's hole cards), the rest dim, and the winner's
// seat gets the gold ring. Plays call-down hands in the real app (jsdom)
// until a showdown occurs, then asserts the DOM classes.
'use strict';
var path = require('path');
var fs = require('fs');
var JSDOM = require('jsdom').JSDOM;
var dir = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
var dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
var w = dom.window, d = w.document;
w.scrollTo = function () {};
w.confirm = function () { return true; };
w.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: function () { return function () {}; }, set: function () { return true; } });
};
var realST = w.setTimeout.bind(w);
w.setTimeout = function (fn, ms) {
  var rest = Array.prototype.slice.call(arguments, 2);
  return realST.apply(null, [fn, Math.min(ms || 0, 60)].concat(rest));
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
function $(id) { return d.getElementById(id); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
(async function () {
  var fails = 0;
  function ok(c, m) { console.log((c ? 'ok' : 'FAIL') + ': ' + m); if (!c) fails++; }
  var cs = $('cfg-stack'); if (cs) cs.value = '100000'; // hero cannot bust mid-test
  $('btn-start').click();
  var found = null;
  for (var hand = 0; hand < 6 && !found; hand++) {
    var guard = 0, ended = false;
    while (!ended && guard++ < 250) {
      if ($('btn-next-hand')) { ended = true; break; }
      var st = ($('turn-status') || {}).textContent || '';
      var cc = $('btn-checkcall');
      if (st.indexOf('Your turn') === 0 && cc && !cc.disabled) { cc.click(); await sleep(120); }
      else await sleep(100);
    }
    var banner = ($('hero-hand-desc') || {}).textContent || '';
    if (/won with/.test(banner)) {
      found = {
        seatWinners: d.querySelectorAll('.seat.winner').length,
        boardWin: d.querySelectorAll('#community .card-win').length,
        boardDim: d.querySelectorAll('#community .card-dim').length,
        holeWin: d.querySelectorAll('.pcards .card-win, #hero-cards .card-win').length,
        banner: banner.slice(0, 60)
      };
    }
    var nx = $('btn-next-hand');
    if (nx) { nx.click(); await sleep(500); }
  }
  ok(!!found, 'a showdown hand occurred within 6 hands');
  if (found) {
    console.log('  banner: ' + found.banner);
    ok(found.seatWinners >= 1, 'winner seat has the gold ring (' + found.seatWinners + ')');
    ok(found.boardWin >= 3, 'at least 3 board cards lifted (' + found.boardWin + ')');
    ok(found.holeWin >= 1 || found.boardWin === 5, 'winner hole cards lifted (' + found.holeWin + ')');
  }
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors[0] : ''));
  console.log(fails === 0 ? 'WINNER HIGHLIGHT TEST PASSED' : 'WINNER HIGHLIGHT TEST FAILED');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('EXCEPTION: ' + e.message); process.exit(1); });
