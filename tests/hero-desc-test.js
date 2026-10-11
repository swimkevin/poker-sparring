// Test hero-hand-desc with Kevin's exact scenario: T♥2♥ on A♣2♦5♠ flop.
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
['cards', 'evaluator', 'equity', 'engine', 'bots', 'names', 'pushfold', 'stats',
 'replay', 'room-server', 'netplay', 'ui', 'online', 'app']
  .forEach(function (f) {
    var s = d.createElement('script');
    s.textContent = fs.readFileSync(path.join(dir, 'js', f + '.js'), 'utf8');
    d.head.appendChild(s);
  });
d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

setTimeout(function () {
  var UI = w.UI;
  // Build a fake table matching the screenshot
  function C(r, s) { return { r: r, s: s }; }
  var table = {
    players: [
      { isHero: true, name: 'realswimkev', stack: 2075, hole: [C(10, 1), C(2, 1)], sittingOut: false, folded: false },
      { name: 'Rohan', stack: 950, hole: [C(13, 0), C(13, 2)], sittingOut: false, folded: false }
    ],
    community: [C(14, 3), C(2, 2), C(5, 0)],
    street: 'flop', pot: 0, currentBet: 0, sbIdx: 1, bbIdx: 0,
    potTotal: function () { return 120; },
    livePlayers: function () { return this.players; }
  };
  table.players.forEach(function (p) { p.bet = 0; });
  UI.renderTable(table, {});
  var el = d.getElementById('hero-hand-desc');
  var fails = 0;
  function chk(label, got, want) {
    var ok = got === want;
    if (!ok) fails++;
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + ': ' + JSON.stringify(got) + (ok ? '' : ' (want ' + JSON.stringify(want) + ')'));
  }
  chk('FLOP', el.textContent, 'Pair of Twos');
  table.community.push(C(9, 2));
  UI.renderTable(table, {});
  chk('TURN', el.textContent, 'Pair of Twos');
  table.community.push(C(5, 1));
  UI.renderTable(table, {});
  chk('RIVER', el.textContent, 'Two Pair, Fives and Twos');
  table.community = [];
  table.players[0].hole = [C(14, 0), C(14, 2)];
  UI.renderTable(table, {});
  chk('PREFLOP AA', el.textContent, 'Pair of Aces');
  // Non-pair preflop: no label (nothing made yet)
  table.players[0].hole = [C(13, 0), C(9, 2)];
  UI.renderTable(table, {});
  chk('PREFLOP K9o', el.textContent, '');
  console.log(fails === 0 ? 'ALL HERO-DESC TESTS PASSED' : fails + ' FAILURES');
  process.exit(fails === 0 ? 0 : 1);
}, 800);
