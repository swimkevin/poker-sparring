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
  console.log('  nathan blank-river says: ' + strip(v4.html).slice(0, 200));
  ok(v4.advice !== 'fold', 'nathan blank-river advice is not fold (river did not improve his range, got ' + v4.advice + ')');
  ok(strip(v4.html).indexOf('33%') !== -1,
    'nathan blank-river message shows the narrowed 33% figure, not the tier figure (v1.8.141)');
  ok(strip(v4.html).indexOf('simulated 150') === -1,
    'nathan blank-river message uses the exact narrowed figure, not a simulation line (v1.8.141)');
  var v6 = setup('alice', 2, 0, 266, 355, 669, 887, 669);
  console.log('  alice blank-river says: ' + strip(v6.html).slice(0, 120));
  ok(v6.advice === 'call' && strip(v6.html).indexOf('33%') !== -1,
    'alice blank-river also calls on the narrowed figure, not nathan-hardcoded (got ' + v6.advice + ', v1.8.141)');
  function setupFacing(villainId, heroHole, board, nLive, potBefore, bet, timeline) {
    var s = d.createElement('script');
    var js = [
      'window.__fcArch = ARCHETYPES.filter(function (a) { return a.id === "' + villainId + '"; })[0];',
      'window.__fcTable = new PokerTable({ players: [',
      '  { name: "hero", isHero: true }, { name: "V", archetype: window.__fcArch },',
      '  { name: "B" }, { name: "C" },',
      '  { name: "E" }, { name: "F" }, { name: "G" }, { name: "H" }',
      '], sb: 5, bb: 10, startingStack: 3000 });',
      'var t = window.__fcTable;',
      't.button = 0; t.street = "turn"; t.currentBet = ' + bet + '; t.pot = ' + potBefore + ';',
      't.players[0].hole = ' + JSON.stringify(heroHole) + ';',
      't.players[0].stack = 2000; t.players[0].bet = 0;',
      't.players[1].stack = 2000; t.players[1].bet = ' + bet + ';',
      't.community = ' + JSON.stringify(board) + ';',
      'for (var i = ' + nLive + '; i < 8; i++) t.players[i].folded = true;'
    ].join('\n');
    s.textContent = js;
    d.head.appendChild(s);
    var t = w.__fcTable;
    w.__coachTestHooks.setTable(t);
    w.__coachTestHooks.setHandRec({ timeline: timeline || [
      { t: 'action', street: 'turn', player: 1, action: 'bet', bet: bet, pot: potBefore + bet }
    ] });
    w.__coachTestHooks.setDecisions([]);
    return w.coachVerdict();
  }
  var flushBoard = [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 0 }, { r: 5, s: 3 }];
  var pairFlush = [{ r: 2, s: 2 }, { r: 13, s: 2 }];
  var fdHu = setupFacing('lag', pairFlush, flushBoard, 2, 500, 400);
  console.log('  dilution heads-up says: ' + strip(fdHu.html).slice(0, 160));
  ok(fdHu.advice === 'call', 'dilution heads-up control calls (got ' + fdHu.advice + ', v1.8.141)');
  var fdMw = setupFacing('lag', pairFlush, flushBoard, 4, 500, 200);
  console.log('  dilution multiway says: ' + strip(fdMw.html).slice(0, 200));
  ok(fdMw.advice === 'call', 'dilution multiway calls under the true shared-runout sim (got ' + fdMw.advice + ', v1.8.148)');
  ok(strip(fdMw.html).indexOf('beating everyone still in') !== -1,
    'dilution multiway message says everyone still in must lose (v1.8.141)');
  ok(strip(fdMw.html).indexOf('300×') !== -1,
    'dilution multiway message names the 300-sample multi sim (v1.8.148)');
  var weakPair = [{ r: 2, s: 1 }, { r: 13, s: 0 }];
  var fdMwFold = setupFacing('lag', weakPair, [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }], 4, 500, 400);
  console.log('  dilution multiway weak-pair says: ' + strip(fdMwFold.html).slice(0, 200));
  ok(fdMwFold.advice === 'fold', 'dilution multiway weak pair still folds (got ' + fdMwFold.advice + ', v1.8.148)');
  ok(strip(fdMwFold.html).indexOf('beating everyone still in') !== -1,
    'dilution multiway weak-pair message says everyone still in must lose (v1.8.148)');
  var airHigh = [{ r: 14, s: 0 }, { r: 9, s: 1 }];
  var dryBoard = [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }];
  var narrowedTimeline = [
    { t: 'action', street: 'flop', player: 2, action: 'bet', bet: 300, pot: 800 },
    { t: 'action', street: 'flop', player: 1, action: 'call' },
    { t: 'action', street: 'turn', player: 1, action: 'bet', bet: 340, pot: 840 }
  ];
  var narrowed = setupFacing('lag', airHigh, dryBoard, 2, 500, 340, narrowedTimeline);
  console.log('  narrowed says: ' + strip(narrowed.html).slice(0, 220));
  ok(narrowed.advice === 'fold', 'called-big villain narrows to a strong range and folds air (got ' + narrowed.advice + ', v1.8.149)');
  ok(strip(narrowed.html).indexOf('called a big bet earlier') !== -1,
    'narrowed message names the earlier big call (v1.8.149)');
  var airTop = [{ r: 14, s: 0 }, { r: 13, s: 1 }];
  var airCap = setupFacing('nathan', airTop, dryBoard, 2, 500, 50);
  console.log('  air-cap says: ' + strip(airCap.html).slice(0, 220));
  ok(airCap.advice === 'fold', 'air vs a near-never bluffer folds even at a small price (got ' + airCap.advice + ', v1.8.150)');
  ok(strip(airCap.html).indexOf('only win when') !== -1,
    'air-cap message names the bluff-catch logic (v1.8.150)');
  var airCapControl = setupFacing('lag', airTop, dryBoard, 2, 500, 50);
  console.log('  air-cap control says: ' + strip(airCapControl.html).slice(0, 200));
  ok(airCapControl.advice === 'call', 'same air spot vs a bluffer still calls (got ' + airCapControl.advice + ', v1.8.150)');
  var narrowedControl = setupFacing('lag', airHigh, dryBoard, 2, 500, 340);
  console.log('  narrowed control says: ' + strip(narrowedControl.html).slice(0, 200));
  ok(narrowedControl.advice === 'call', 'same spot without the earlier big call still calls (got ' + narrowedControl.advice + ', v1.8.149)');
  var secondPair = [{ r: 7, s: 0 }, { r: 13, s: 1 }];
  var ar = setupFacing('lag', secondPair, dryBoard, 2, 500, 200);
  console.log('  archetype-range says: ' + strip(ar.html).slice(0, 200));
  ok(strip(ar.html).indexOf('kinds of hands') !== -1,
    'archetype-range message names the kinds of hands he plays (v1.8.141)');
  ok(strip(ar.html).indexOf('random hands') === -1,
    'archetype-range message never falls back to random hands (v1.8.141)');

  var v5 = setup('nathan', 7, 2, 178, 355, 757, 711, 757);
  console.log('  nathan small-turn-bet says: ' + strip(v5.html).slice(0, 120));
  ok(v5.advice !== 'fold', 'nathan small-turn-bet advice is not fold (half-pot call does not narrow, got ' + v5.advice + ')');

  function setupBypass(villainId, heroHole, board, street, potBefore, bet, heroStack) {
    var s = d.createElement('script');
    var js = [
      'window.__byArch = ARCHETYPES.filter(function (a) { return a.id === "' + villainId + '"; })[0];',
      'window.__byTable = new PokerTable({ players: [',
      '  { name: "hero", isHero: true }, { name: "V", archetype: window.__byArch },',
      '  { name: "E" }, { name: "F" }, { name: "G" }, { name: "H" }, { name: "I" }, { name: "J" }',
      '], sb: 5, bb: 10, startingStack: 3000 });',
      'var t = window.__byTable;',
      't.button = 0; t.street = "' + street + '"; t.currentBet = ' + bet + '; t.pot = ' + potBefore + ';',
      't.players[0].hole = ' + JSON.stringify(heroHole) + ';',
      't.players[0].stack = ' + heroStack + '; t.players[0].bet = 0;',
      't.players[1].stack = ' + heroStack + '; t.players[1].bet = ' + bet + ';',
      't.community = ' + JSON.stringify(board) + ';',
      'for (var i = 2; i < 8; i++) t.players[i].folded = true;'
    ].join('\n');
    s.textContent = js;
    d.head.appendChild(s);
    var t = w.__byTable;
    w.__coachTestHooks.setTable(t);
    w.__coachTestHooks.setHandRec({ timeline: [
      { t: 'action', street: street, player: 1, action: 'bet', bet: bet, pot: potBefore + bet }
    ] });
    w.__coachTestHooks.setDecisions([]);
    return w.coachVerdict();
  }
  var q725 = [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }];
  var q7259 = [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }, { r: 9, s: 1 }];
  var kk = [{ r: 13, s: 1 }, { r: 13, s: 0 }];
  var qk = [{ r: 12, s: 1 }, { r: 13, s: 0 }];
  var b1 = setupBypass('rock', kk, q725, 'turn', 500, 1000, 1200);
  console.log('  bypass overbet says: ' + strip(b1.html).slice(0, 160));
  ok(b1.advice === 'fold', 'committed overpair vs tight overbet folds, bypass no longer overrides (got ' + b1.advice + ', v1.8.140)');
  ok(strip(b1.html).indexOf('almost always the nuts') !== -1,
    'tight-overbet fold message names the nuts (v1.8.140)');
  var b2 = setupBypass('rock', kk, q725, 'turn', 500, 250, 600);
  console.log('  bypass control says: ' + strip(b2.html).slice(0, 160));
  ok(b2.advice === 'call', 'genuine short-SPR overpair vs normal bet still bypass-calls (got ' + b2.advice + ', v1.8.140)');
  ok(strip(b2.html).indexOf('almost nothing') !== -1,
    'bypass control keeps the plain-language commit message (v1.8.140)');
  var b3 = setupBypass('lag', kk, q725, 'turn', 500, 900, 1120);
  console.log('  bypass size-guard says: ' + strip(b3.html).slice(0, 160));
  ok(b3.advice === 'call' && strip(b3.html).indexOf('Pot odds:') !== -1 &&
    strip(b3.html).indexOf('almost nothing') === -1,
    'oversized call (toCall > 1/2 pot) goes through the math, not the bypass (got ' + b3.advice + ', v1.8.140)');
  var b4 = setupBypass('rock', qk, q725, 'turn', 500, 600, 880);
  console.log('  bypass toppair-polar says: ' + strip(b4.html).slice(0, 160));
  ok(b4.advice === 'call' && strip(b4.html).indexOf('Pot odds:') !== -1 &&
    strip(b4.html).indexOf('almost nothing') === -1,
    'toppair vs polarized tight range goes through the math, not the bypass (got ' + b4.advice + ', v1.8.140)');
  var b5 = setupBypass('lag', kk, q7259, 'river', 1000, 600, 2400);
  console.log('  bypass river-SPR says: ' + strip(b5.html).slice(0, 160));
  ok(b5.advice === 'call' && strip(b5.html).indexOf('Pot odds:') !== -1 &&
    strip(b5.html).indexOf('almost nothing') === -1,
    'river SPR 1.5 overpair goes through the math, not the bypass (got ' + b5.advice + ', v1.8.140)');

  var sN = setupBypass('nathan', kk, q725, 'turn', 500, 200, 2000);
  console.log('  trapper small-bet says: ' + strip(sN.html).slice(0, 160));
  ok(sN.advice !== 'raise', 'small bet from a passive trapper is not raised into (got ' + sN.advice + ', v1.8.146)');
  ok(strip(sN.html).indexOf('tiny bet') === -1,
    'trapper small-bet message never calls it a tiny bet to attack (v1.8.146)');
  var sL = setupBypass('lag', kk, q725, 'turn', 500, 200, 2000);
  console.log('  lag small-bet says: ' + strip(sL.html).slice(0, 160));
  ok(sL.advice === 'raise' && strip(sL.html).indexOf('tiny bet') !== -1,
    'small bet from an aggressive player is still raised (got ' + sL.advice + ', v1.8.146)');

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
