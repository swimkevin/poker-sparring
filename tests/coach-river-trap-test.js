// Kevin's river half of the screenshot hand (2026-11-02): hero 4d 9c, river
// board 7d 4c Qd 4s 7h, hero holds 4s full of 7s. Nathan called a 3/4-pot turn
// bet, then shoves the river. The old coach said "you win 97%, call" — equity
// vs RANDOM hands. A small full house is ~97% vs random, but that number is
// meaningless facing this villain, this action sequence, and this river card:
// Nathan almost never bluffs, his first big bet of the hand is a monster
// signal, his big-turn-call range is a 7, a 4, or a strong Queen, and the
// river 7 makes any 7 a bigger full house. The fix is range + profile logic,
// never a hardcoded "Nathan has a 7": the same structure must fold vs other
// passive trappers, and must NOT fold vs a known bluffer, on a blank river,
// or when the turn call was only for a small bet.
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

function strip(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// villainId: archetype id. riverRank/riverSuit: river card. turnBet: hero's
// turn bet size. turnPot: pot before the turn bet. heroStack: hero's stack
// on the river (after paying the turn bet). riverPot: pot before the river
// shove. shove: villain's river bet total.
function setup(villainId, riverRank, riverSuit, turnBet, turnPot, heroStack, riverPot, shove) {
  var s = d.createElement('script');
  var js = [
    'window.__riverArch = ARCHETYPES.filter(function (a) { return a.id === "' + villainId + '"; })[0];',
    'window.__riverTable = new PokerTable({ players: [',
    '  { name: "hero", isHero: true }, { name: "V", archetype: window.__riverArch },',
    '  { name: "E" }, { name: "F" }, { name: "G" }, { name: "H" }, { name: "I" }, { name: "J" }',
    '], sb: 5, bb: 10, startingStack: 935 });',
    'var t = window.__riverTable;',
    't.button = 0; t.street = "river"; t.currentBet = ' + shove + '; t.pot = ' + riverPot + ';',
    't.players[0].hole = [{ r: 4, s: 1 }, { r: 9, s: 0 }];',
    't.players[0].stack = ' + heroStack + '; t.players[0].bet = 0;',
    't.players[1].stack = 0; t.players[1].bet = ' + shove + ';',
    't.community = [{ r: 7, s: 1 }, { r: 4, s: 0 }, { r: 12, s: 1 }, { r: 4, s: 3 },',
    '  { r: ' + riverRank + ', s: ' + riverSuit + ' }];',
    'for (var i = 2; i < 8; i++) t.players[i].folded = true;'
  ].join('\n');
  s.textContent = js;
  d.head.appendChild(s);
  var t = w.__riverTable;
  w.__coachTestHooks.setTable(t);
  w.__coachTestHooks.setHandRec({ timeline: [
    { t: 'action', street: 'turn', player: 0, action: 'bet', bet: turnBet, pot: turnPot + turnBet },
    { t: 'action', street: 'turn', player: 1, action: 'call', bet: turnBet, pot: turnPot + turnBet * 2 },
    { t: 'action', street: 'river', player: 1, action: 'bet', bet: shove, pot: riverPot + shove }
  ] });
  w.__coachTestHooks.setDecisions([]);
  return w.coachVerdict();
}

setTimeout(function () {
  var fails = 0;
  function ok(c, m) { console.log((c ? 'ok' : 'FAIL') + ': ' + m); if (!c) fails++; }
  var H = w.__coachTestHooks;
  ok(!!H && typeof H.setTable === 'function', 'setTable hook exposed');

  var v1 = setup('nathan', 7, 2, 266, 355, 669, 887, 669);
  var t1 = strip(v1.html);
  console.log('  nathan 7-river says: ' + t1.slice(0, 300));
  ok(!v1.error, 'nathan 7-river verdict has no error' + (v1.error ? ' (' + v1.error + ')' : ''));
  ok(v1.advice === 'fold', 'nathan 7-river advice is fold (got ' + v1.advice + ')');
  ok(t1.indexOf('Fold') !== -1, 'nathan 7-river message says Fold');
  ok(t1.indexOf('big bet') !== -1, 'nathan 7-river message names the big turn call');
  ok(t1.indexOf('Seven') !== -1 && t1.indexOf('Four') !== -1 && t1.indexOf('Queen') !== -1,
    'nathan 7-river message names the narrowed range (Seven, Four, strong Queen)');
  ok(t1.indexOf('bluff') !== -1, 'nathan 7-river message names the non-bluffer profile');
  ok(t1.indexOf('97%') === -1, 'nathan 7-river message never quotes the vs-random 97%');

  var v2 = setup('alice', 7, 2, 266, 355, 669, 887, 669);
  console.log('  alice 7-river says: ' + strip(v2.html).slice(0, 120));
  ok(v2.advice === 'fold', 'alice 7-river advice is fold too, not nathan-hardcoded (got ' + v2.advice + ')');

  var v3 = setup('lag', 7, 2, 266, 355, 669, 887, 669);
  console.log('  lag 7-river says: ' + strip(v3.html).slice(0, 120));
  ok(v3.advice !== 'fold', 'lag 7-river advice is not fold (bluffer control, got ' + v3.advice + ')');

  var v4 = setup('nathan', 2, 0, 266, 355, 669, 887, 669);
  console.log('  nathan blank-river says: ' + strip(v4.html).slice(0, 120));
  ok(v4.advice !== 'fold', 'nathan blank-river advice is not fold (river did not improve his range, got ' + v4.advice + ')');

  var v5 = setup('nathan', 7, 2, 178, 355, 757, 711, 757);
  console.log('  nathan small-turn-bet says: ' + strip(v5.html).slice(0, 120));
  ok(v5.advice !== 'fold', 'nathan small-turn-bet advice is not fold (half-pot call does not narrow, got ' + v5.advice + ')');

  var eq = require('../js/equity.js');
  ok(typeof eq.estimateEquityVsMadePool === 'function', 'estimateEquityVsMadePool exported');
  var hero = [{ r: 4, s: 1 }, { r: 9, s: 0 }];
  var board7 = [{ r: 7, s: 1 }, { r: 4, s: 0 }, { r: 12, s: 1 }, { r: 4, s: 3 }, { r: 7, s: 2 }];
  var board2 = [{ r: 7, s: 1 }, { r: 4, s: 0 }, { r: 12, s: 1 }, { r: 4, s: 3 }, { r: 2, s: 0 }];
  var eq7 = eq.estimateEquityVsMadePool(hero, board7, 3);
  var eq2 = eq.estimateEquityVsMadePool(hero, board2, 3);
  console.log('  narrowed-pool equity: 7-river ' + eq7 + ', blank-river ' + eq2);
  ok(eq7 != null && eq7 < 0.30, '7-river narrowed equity is below 30% (got ' + eq7 + ')');
  ok(eq2 != null && eq2 > 0.30, 'blank-river narrowed equity is above the 30% call threshold (got ' + eq2 + ' — just above it, which is why the blank-river coach calls)');
  ok(eq2 > eq7, 'river 7 lowers narrowed equity vs a blank river');

  console.log(fails === 0 ? 'COACH RIVER TRAP TEST PASSED' : 'COACH RIVER TRAP TEST FAILED (' + fails + ')');
  process.exit(fails ? 1 : 0);
}, 800);
