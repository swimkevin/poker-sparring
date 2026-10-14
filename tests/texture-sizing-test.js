// v1.8.102: boardTexture must not call paired boards "wet" (Kevin's 6h6s2d
// screenshot — "not many draws out here"), and the default value-bet size on
// dry boards is 1/4 pot (Kevin), not 1/2 or 3/4.
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
  var bt = H.boardTexture;
  ok(typeof bt === 'function', 'boardTexture exposed in test hooks');
  // Kevin's spot: 6h6s2d rainbow — no flush draw, no straight draw possible.
  ok(bt([C(6, 2), C(6, 3), C(2, 1)]) === 'dry', 'paired rainbow 662 is dry');
  ok(bt([C(8, 0), C(8, 1), C(3, 2)]) === 'dry', 'paired 883 rainbow is dry');
  ok(bt([C(9, 0), C(7, 1), C(5, 2)]) === 'wet', '975 rainbow is wet (straight draws)');
  ok(bt([C(13, 0), C(12, 1), C(11, 2)]) === 'wet', 'KQJ rainbow is wet');
  ok(bt([C(14, 0), C(13, 1), C(4, 2)]) === 'dry', 'AK4 rainbow is dry');
  ok(bt([C(9, 2), C(7, 2), C(5, 2)]) === 'wet', '975 three-flush is wet');
  ok(bt([C(9, 2), C(7, 2), C(5, 2), C(2, 2)]) === 'completed', 'four-flush is completed, not wet');
  ok(bt([C(12, 2), C(12, 1), C(7, 0), C(12, 0), C(7, 2)]) === 'dry', 'QQQ77 river is dry');
  ok(bt([C(6, 0), C(6, 1), C(7, 2), C(8, 3)]) === 'wet', 'paired turn 6678 can have straight draws');
  // Sizing source: 1/4 pot default on dry boards.
  var src = fs.readFileSync(path.join(dir, 'js', 'app.js'), 'utf8');
  ok(src.includes("var frac = tex === 'wet' ? 0.67 : 0.25;"), 'dry default is 1/4 pot, wet is 2/3');
  ok(src.includes('dry board, few draws: bet small'), 'dry message explains the small sizing');
  // Donald: air bluffs toned down (1.0 -> 0.5), draw semi-bluffs untouched.
  var bots = fs.readFileSync(path.join(dir, 'js', 'bots.js'), 'utf8');
  var dm = bots.match(/id: 'donald'[\s\S]*?bluff: ([0-9.]+)/);
  ok(dm && parseFloat(dm[1]) <= 0.6, 'donald bluff param lowered (' + (dm && dm[1]) + ')');
  ok(bots.includes('if (hasDraw && ms < 0.55 && Math.random() < 0.65)'), 'donald draw semi-bluff rate unchanged');
  console.log(fails === 0 ? 'TEXTURE SIZING TEST PASSED' : 'TEXTURE SIZING TEST FAILED (' + fails + ')');
  process.exit(fails ? 1 : 0);
}, 800);
