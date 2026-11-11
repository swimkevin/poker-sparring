// Winner banner vs uncalled take-backs (v1.8.210, Kevin): the engine is correct —
// one contested winner plus one uncalled take-back — but the app banner used to
// union ALL handEnd winners entries, so a short all-in winning the main pot while
// the hero's overbet came back uncalled read as two winners taking the whole pot
// ("Alice & You take 700"). Drives the real app in jsdom: a rigged real-engine
// handEnd through the real event pump (hooks.emitEvent), then asserts the banner
// title, the Last: line, and the gold seat rings.
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

// Board 2d 7c 9h Jd 8s: no straight, no flush, no board pair, so AA beats KK beats
// QQ as plain pairs (a board King would give Bob trips and sweep both pots).
var board = [{ r: 2, s: 2 }, { r: 7, s: 3 }, { r: 9, s: 1 }, { r: 11, s: 2 }, { r: 8, s: 0 }];
var qq = [{ r: 12, s: 0 }, { r: 12, s: 1 }];
var aa = [{ r: 14, s: 0 }, { r: 14, s: 1 }];
var kk = [{ r: 13, s: 3 }, { r: 13, s: 1 }];

function rig(key, players, bets) {
  var s = d.createElement('script');
  var lines = [
    'window.__rig' + key + ' = new PokerTable({ players: ' + JSON.stringify(players) +
      ', sb: 5, bb: 10, startingStack: 1000 });',
    'var t = window.__rig' + key + ';',
    't.handNo = 1; t.handOver = false; t.button = 1; t.pot = 0;',
    't.community = ' + JSON.stringify(board) + ';'
  ];
  bets.forEach(function (b, i) {
    lines.push('t.players[' + i + '].hole = ' + JSON.stringify(b.hole) +
      '; t.players[' + i + '].totalBet = ' + b.totalBet +
      '; t.players[' + i + '].bet = ' + b.totalBet +
      '; t.players[' + i + '].stack = ' + b.stack + ';');
  });
  lines.push('t._showdown();');
  lines.push('window.__end' + key + ' = t.eventQueue.filter(function (e) { return e.t === "handEnd"; })[0];');
  s.textContent = lines.join('\n');
  d.head.appendChild(s);
  return { table: w['__rig' + key], end: w['__end' + key] };
}

async function drive(rigged, handNo, sbIdx, bbIdx) {
  var H = w.__coachTestHooks;
  H.setTable(rigged.table);
  H.setDecisions([]);
  H.emitEvent({ t: 'handStart', handNo: handNo, button: 1, sb: 5, bb: 10, ante: 0,
    sbIdx: sbIdx, bbIdx: bbIdx,
    stacks: rigged.table.players.map(function (p) { return p.stack; }) });
  await sleep(150);
  H.emitEvent(rigged.end);
  await sleep(250);
}

function titleText() {
  var el = d.querySelector('#winner-banner .wtitle');
  return el ? el.textContent : '';
}

(async function () {
  var fails = 0;
  function ok(c, m) { console.log((c ? 'ok' : 'FAIL') + ': ' + m); if (!c) fails++; }
  w.UI.buildSeats();

  // Scenario A: hero QQ bets 600, Alice AA all-in 100 wins the only contested
  // pot (main, 200); hero's 500 comes back uncalled. Stacks end 900/200.
  var a = rig('A', [{ name: 'You', isHero: true }, { name: 'Alice' }], [
    { hole: qq, totalBet: 600, stack: 400 },
    { hole: aa, totalBet: 100, stack: 0 }
  ]);
  await drive(a, 1, 1, 0);
  ok(titleText() === '😤 Alice takes 200', 'A banner names only Alice taking 200, got "' + titleText() + '"');
  ok(titleText().indexOf('You') === -1, 'A banner title never names the hero (refund is not a win)');
  ok(($('last-result') || {}).textContent === 'Last: Alice +200 · Pair of Aces',
    'A Last line is Alice +200 with her hand, got "' + (($('last-result') || {}).textContent || '') + '"');
  ok(d.querySelectorAll('.seat.winner').length === 1, 'A exactly one gold ring (' +
    d.querySelectorAll('.seat.winner').length + ')');
  ok(!$('seat-0').classList.contains('winner'), 'A hero seat has no gold ring');

  // Scenario B: Alice AA wins main 300, Bob KK wins side 400, hero QQ gets 300
  // back uncalled. Two true winners, one take-back.
  var b = rig('B', [{ name: 'You', isHero: true }, { name: 'Alice' }, { name: 'Bob' }], [
    { hole: qq, totalBet: 600, stack: 400 },
    { hole: aa, totalBet: 100, stack: 0 },
    { hole: kk, totalBet: 300, stack: 0 }
  ]);
  await drive(b, 2, 2, 0);
  ok(titleText() === '😤 Alice & Bob take 700', 'B banner names Alice & Bob taking 700, got "' + titleText() + '"');
  ok(($('last-result') || {}).textContent === 'Last: Alice +300 · Pair of Aces',
    'B Last line is Alice +300 with her hand, got "' + (($('last-result') || {}).textContent || '') + '"');
  ok(d.querySelectorAll('.seat.winner').length === 2, 'B exactly two gold rings (' +
    d.querySelectorAll('.seat.winner').length + ')');
  ok(!$('seat-0').classList.contains('winner'), 'B hero seat has no gold ring');

  if (errors.length) console.log('JS errors: ' + errors.join(' | '));
  console.log(fails === 0 ? 'WINNER HIGHLIGHT TEST PASSED' : 'WINNER HIGHLIGHT TEST FAILED');
  process.exit(fails || errors.length ? 1 : 0);
})().catch(function (e) { console.log('EXCEPTION: ' + e.message); console.log(e.stack); process.exit(1); });
