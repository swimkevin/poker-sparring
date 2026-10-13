// v1.8.101: hero "plays the board" — none of the hero's hole cards are in
// the best 5. Kevin's river spot: A♣K♠ on Q♥Q♦7♣Q♣7♥. The old code classified
// this as 'nut' and the coach said "Raise for value" — but nobody can hold a
// worse hand than the board, so raising is pointless and a bet is never a
// bluff. handClass must return 'board' (not 'nut'); the verdict branches are
// covered by static checks in coach-scenarios.js.
'use strict';
var path = require('path');
var fs = require('fs');
var jsdom = require('jsdom');
var JSDOM = jsdom.JSDOM;
var dir = path.join(__dirname, '..');
var dom = new JSDOM(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'),
  { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
var w = dom.window, d = w.document;
w.scrollTo = function () {};
w.confirm = function () { return true; };
w.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: function () { return function () {}; }, set: function () { return true; } });
};
['cards', 'evaluator', 'equity', 'engine', 'bots', 'names', 'pushfold', 'stats',
 'replay', 'room-server', 'netplay', 'ui', 'online', 'app'].forEach(function (f) {
  var s = d.createElement('script');
  s.textContent = fs.readFileSync(path.join(dir, 'js', f + '.js'), 'utf8');
  d.head.appendChild(s);
});
d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
function C(r, s) { return { r: r, s: s }; } // s: 0=c 1=d 2=h 3=s
setTimeout(function () {
  var fails = 0;
  function ok(c, m) { console.log((c ? 'ok' : 'FAIL') + ': ' + m); if (!c) fails++; }
  var H = w.__coachTestHooks;
  ok(!!H && !!H.handClass, 'handClass exposed in test hooks');
  var board = [C(12, 2), C(12, 1), C(7, 0), C(12, 0), C(7, 2)]; // Qh Qd 7c Qc 7h
  ok(H.handClass([C(14, 0), C(13, 3)], board) === 'board', 'AK on QQQ77 plays the board');
  ok(H.handClass([C(12, 3), C(2, 0)], board) === 'nut', 'Q2 on QQQ77 makes quad queens (hole card plays)');
  ok(H.handClass([C(7, 3), C(2, 0)], board) === 'nut', '72 on QQQ77 makes sevens full (hole card plays)');
  ok(H.handClass([C(14, 2), C(13, 2)], [C(5, 0), C(6, 1), C(7, 2), C(8, 0), C(9, 3)]) === 'board',
    'AK on 56789 plays the board straight');
  ok(H.handClass([C(14, 0), C(13, 3)], [C(12, 2), C(12, 1), C(7, 0), C(2, 3), C(5, 1)]) !== 'board',
    'AK on QQT72 is trips, not board-play');
  ok(H.handClass([C(12, 3), C(13, 3)], [C(12, 2), C(12, 1), C(7, 0), C(7, 3), C(2, 1)]) === 'nut',
    'QK on QQ772 makes queens full (hole queen plays)');
  console.log(fails === 0 ? 'BOARD PLAY TEST PASSED' : 'BOARD PLAY TEST FAILED (' + fails + ')');
  process.exit(fails ? 1 : 0);
}, 800);
