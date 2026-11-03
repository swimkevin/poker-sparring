// Solver lab: a headless harness that keeps the coach honest the way a
// solver would — by replaying a library of diagnostic spots, comparing
// the coach's recommended action against the alternatives on EV, and
// failing on clearly losing advice. The library covers both Kevin hands
// plus the regression spot for every coach fix since, so a later change
// that re-breaks an earlier fix fails the lab instead of shipping.
//
// Run: npm run solver-lab
// Runtime: seconds (one jsdom load plus a handful of synchronous
// verdicts and equity evaluations — deliberately far faster than the
// full coach-eval simulation, so the daily loop can run it every day).
// Failure definition:
//   - any diagnostic spot where the coach's action differs from the
//     known-correct action -> FAIL (a clearly losing recommendation);
//   - any leading bet above 1.5x pot outside short stack-to-pot
//     and short-stack spots -> FAIL (the guardrail);
//   - any gross-checked facing spot where a seeded shared-runout
//     simulation disagrees with the coach's action by more than 20
//     points of equity -> FAIL (a gross error, not noise);
//   - any river spot where exact enumeration says calling loses money
//     and the coach calls anyway -> FAIL, with the EV loss reported.
// Honesty note: river spots with a made-hand pool get EXACT equity
// (full enumeration, no Monte Carlo noise), so their EV verdicts are
// exact. Other facing spots report the coach's own Monte Carlo
// figure as coach-implied EV for the leak report only — the lab does
// not fail on small Monte Carlo EV differences, because simulation
// noise would make that flaky, but a 20-point gross disagreement on
// a seeded simulation fails, since no plausible noise explains it.
// Leading spots are checked against guardrail
// invariants rather than fake-precision EV: there is no single
// "correct" bet size, only sizes that are clearly too big.
// The lab is intentionally NOT part of the npm test chain: it is a
// daily-loop diagnostic, not a release gate.
'use strict';
var path = require('path');
var fs = require('fs');
var jsdom = require('jsdom');
var JSDOM = jsdom.JSDOM;
var dir = path.join(__dirname, '..');
var EQ = require('../js/equity.js');
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
function tableScript(varName, players, street, currentBet, pot, heroHole, heroStack, villainStack, board, nLive) {
  var lines = [
    'window.' + varName + ' = new PokerTable({ players: [',
    '  { name: "hero", isHero: true }, ' + players,
    '], sb: 5, bb: 10, startingStack: 3000 });',
    'var t = window.' + varName + ';',
    't.button = 0; t.street = "' + street + '"; t.currentBet = ' + currentBet + '; t.pot = ' + pot + ';',
    't.players[0].hole = ' + JSON.stringify(heroHole) + ';',
    't.players[0].stack = ' + heroStack + '; t.players[0].bet = 0;',
    't.players[1].stack = ' + villainStack + '; t.players[1].bet = ' + currentBet + ';',
    't.community = ' + JSON.stringify(board) + ';',
    'for (var i = ' + nLive + '; i < 8; i++) t.players[i].folded = true;'
  ];
  return lines.join('\n');
}
function runSpot(spot) {
  var s = d.createElement('script');
  var arch = spot.villain
    ? 'ARCHETYPES.filter(function (a) { return a.id === "' + spot.villain + '"; })[0]'
    : 'null';
  var players = '{ name: "V", archetype: ' + arch + ' }, { name: "B" }, { name: "C" },' +
    ' { name: "E" }, { name: "F" }, { name: "G" }, { name: "H" }';
  s.textContent = tableScript('__labTable', players, spot.street, spot.bet || 0,
    spot.potBefore, spot.hero, spot.heroStack, spot.villainStack === undefined ? spot.heroStack : spot.villainStack,
    spot.board, spot.nLive || 2);
  d.head.appendChild(s);
  var t = w.__labTable;
  w.__coachTestHooks.setTable(t);
  w.__coachTestHooks.setHandRec({ timeline: spot.timeline || [] });
  w.__coachTestHooks.setDecisions([]);
  if (spot.mode) w.__coachTestHooks.setGameMode(spot.mode);
  var v = w.coachVerdict();
  w.__coachTestHooks.setGameMode('cash');
  return v;
}
function sizeOf(msg) {
  var m = /pot \(([\d,]+)\)/.exec(msg) || /All-in \(([\d,]+)\)/.exec(msg);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}
function pctOf(msg) {
  var m = /You win about (\d+)%/.exec(msg);
  return m ? parseInt(m[1], 10) / 100 : null;
}
function seededGrossEq(spot) {
  var h = 0;
  for (var i = 0; i < spot.name.length; i++) h = (h * 31 + spot.name.charCodeAt(i)) % 2147483647;
  var seed = h || 1;
  function rnd() {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  }
  var arch = spot.villain
    ? w.ARCHETYPES.filter(function (a) { return a.id === spot.villain; })[0]
    : null;
  var tiers = [];
  for (var o = 0; o < (spot.nLive || 2) - 1; o++) tiers.push(o === 0 ? ((arch && arch.openTier) || 3) : 0);
  var realRandom = Math.random;
  Math.random = rnd;
  var eq;
  try {
    eq = EQ.estimateEquityVsRanges(spot.hero, spot.board, tiers, 1000);
  } finally {
    Math.random = realRandom;
  }
  return eq;
}

var C = function (r, s) { return { r: r, s: s }; };
var Q725 = [C(12, 2), C(7, 1), C(2, 0), C(5, 3)];
var TURN_TRIPS = [C(7, 1), C(4, 0), C(12, 1), C(4, 3)];
var FLUSH_BOARD = [C(12, 2), C(7, 2), C(2, 0), C(5, 3)];
var RIVER_7 = [C(7, 1), C(4, 0), C(12, 1), C(4, 3), C(7, 2)];
var RIVER_2 = [C(7, 1), C(4, 0), C(12, 1), C(4, 3), C(2, 0)];

function riverTimeline(turnBet, turnPot, shove, riverPot) {
  return [
    { t: 'action', street: 'turn', player: 0, action: 'bet', bet: turnBet, pot: turnPot + turnBet },
    { t: 'action', street: 'turn', player: 1, action: 'call', bet: turnBet, pot: turnPot + turnBet * 2 },
    { t: 'action', street: 'river', player: 1, action: 'bet', bet: shove, pot: riverPot + shove }
  ];
}
function betTimeline(street, bet, potBefore) {
  return [{ t: 'action', street: street, player: 1, action: 'bet', bet: bet, pot: potBefore + bet }];
}
function narrowedTimeline() {
  return [
    { t: 'action', street: 'flop', player: 2, action: 'bet', bet: 300, pot: 800 },
    { t: 'action', street: 'flop', player: 1, action: 'call' },
    { t: 'action', street: 'turn', player: 1, action: 'bet', bet: 340, pot: 840 }
  ];
}

var SPOTS = [
  { name: 'kevin-turn', kind: 'leading', hero: [C(4, 1), C(9, 0)], board: TURN_TRIPS,
    street: 'turn', potBefore: 355, heroStack: 935, nLive: 5, expect: 'bet' },
  { name: 'kevin-turn-lowSPR', kind: 'leading', hero: [C(13, 1), C(13, 0)], board: Q725,
    street: 'turn', potBefore: 500, heroStack: 400, nLive: 2, expect: 'bet', allowAllIn: true },
  { name: 'multiway-value', kind: 'leading', hero: [C(13, 1), C(13, 0)], board: Q725,
    street: 'turn', potBefore: 400, heroStack: 2000, nLive: 4, expect: 'bet', expectSize: 200 },
  { name: 'multiway-air', kind: 'leading', villain: 'rock', hero: [C(9, 0), C(3, 1)], board: Q725,
    street: 'turn', potBefore: 400, heroStack: 2000, nLive: 4, expect: 'check' },
  { name: 'trips-paired-dry', kind: 'leading', hero: [C(4, 1), C(9, 0)], board: TURN_TRIPS,
    street: 'turn', potBefore: 400, heroStack: 2000, nLive: 2, expect: 'bet', expectSize: 268 },
  { name: 'small-dry-value', kind: 'leading', hero: [C(13, 1), C(13, 0)], board: Q725,
    street: 'turn', potBefore: 400, heroStack: 2000, nLive: 2, expect: 'bet', expectSize: 100 },
  { name: 'kevin-river-nathan-7', kind: 'facing-exact', villain: 'nathan',
    hero: [C(4, 1), C(9, 0)], board: RIVER_7, street: 'river',
    potBefore: 887, bet: 669, heroStack: 669, villainStack: 0, nLive: 2, expect: 'fold',
    timeline: riverTimeline(266, 355, 669, 887), exactPool: true },
  { name: 'kevin-river-nathan-blank', kind: 'facing-exact', villain: 'nathan',
    hero: [C(4, 1), C(9, 0)], board: RIVER_2, street: 'river',
    potBefore: 887, bet: 669, heroStack: 669, villainStack: 0, nLive: 2, expect: 'call',
    timeline: riverTimeline(266, 355, 669, 887), exactPool: true },
  { name: 'bypass-overbet', kind: 'facing', villain: 'rock',
    hero: [C(13, 1), C(13, 0)], board: Q725, street: 'turn',
    potBefore: 500, bet: 1000, heroStack: 1200, nLive: 2, expect: 'fold',
    timeline: betTimeline('turn', 1000, 500) },
  { name: 'bypass-control', kind: 'facing', villain: 'rock',
    hero: [C(13, 1), C(13, 0)], board: Q725, street: 'turn',
    potBefore: 500, bet: 250, heroStack: 600, nLive: 2, expect: 'call',
    timeline: betTimeline('turn', 250, 500) },
  { name: 'dilution-headsup', kind: 'facing', villain: 'lag',
    hero: [C(2, 2), C(13, 2)], board: FLUSH_BOARD, street: 'turn',
    potBefore: 500, bet: 400, heroStack: 2000, nLive: 2, expect: 'call',
    timeline: betTimeline('turn', 400, 500), grossCheck: true },
  { name: 'dilution-multiway', kind: 'facing', villain: 'lag',
    hero: [C(2, 2), C(13, 2)], board: FLUSH_BOARD, street: 'turn',
    potBefore: 500, bet: 200, heroStack: 2000, nLive: 4, expect: 'call',
    timeline: betTimeline('turn', 200, 500), grossCheck: true },
  { name: 'dilution-multiway-fold', kind: 'facing', villain: 'lag',
    hero: [C(2, 1), C(13, 0)], board: Q725, street: 'turn',
    potBefore: 500, bet: 400, heroStack: 2000, nLive: 4, expect: 'fold',
    timeline: betTimeline('turn', 400, 500), grossCheck: true },
  { name: 'trapper-small-bet', kind: 'facing', villain: 'nathan',
    hero: [C(13, 1), C(13, 0)], board: Q725, street: 'turn',
    potBefore: 500, bet: 200, heroStack: 2000, nLive: 2, expect: 'call',
    timeline: betTimeline('turn', 200, 500) },
  { name: 'narrowed-range', kind: 'facing', villain: 'lag',
    hero: [C(14, 0), C(9, 1)], board: Q725, street: 'turn',
    potBefore: 500, bet: 340, heroStack: 2000, nLive: 2, expect: 'fold',
    timeline: narrowedTimeline() },
  { name: 'air-cap', kind: 'facing', villain: 'nathan',
    hero: [C(14, 0), C(13, 1)], board: Q725, street: 'turn',
    potBefore: 500, bet: 50, heroStack: 2000, nLive: 2, expect: 'fold',
    timeline: betTimeline('turn', 50, 500) },
  { name: 'tourney-veto', kind: 'facing', villain: 'nathan',
    hero: [C(4, 1), C(9, 0)], board: RIVER_2, street: 'river',
    potBefore: 250, bet: 188, heroStack: 200, villainStack: 0, nLive: 2, expect: 'fold',
    timeline: riverTimeline(75, 100, 188, 250), mode: 'tourney' },
  { name: 'paired-draw', kind: 'facing', villain: 'rock',
    hero: [C(14, 2), C(2, 2)], board: [C(12, 2), C(12, 1), C(7, 2), C(5, 3)], street: 'turn',
    potBefore: 500, bet: 350, heroStack: 2000, nLive: 4, expect: 'fold',
    timeline: betTimeline('turn', 350, 500) },
  { name: 'river-floor', kind: 'leading',
    hero: [C(14, 2), C(14, 3)], board: [C(2, 0), C(5, 1), C(8, 2), C(11, 3), C(13, 0)],
    street: 'river', potBefore: 400, heroStack: 2000, nLive: 2, expect: 'bet', expectSize: 200 },
  { name: 'archetype-range', kind: 'facing', villain: 'lag',
    hero: [C(7, 0), C(13, 1)], board: Q725, street: 'turn',
    potBefore: 500, bet: 200, heroStack: 2000, nLive: 2, expect: 'call',
    timeline: betTimeline('turn', 200, 500), expectWord: 'kinds of hands', grossCheck: true },
  { name: 'nut-raise-size', kind: 'facing-raise', villain: 'lag',
    hero: [C(5, 0), C(2, 1)], board: [C(9, 0), C(8, 1), C(7, 2), C(6, 3)], street: 'turn',
    potBefore: 500, bet: 400, heroStack: 2000, nLive: 2, expect: 'raise', expectRaiseTo: 1200,
    timeline: betTimeline('turn', 400, 500) },
  { name: 'tiny-bet-raise-size', kind: 'facing-raise', villain: 'lag',
    hero: [C(13, 1), C(13, 0)], board: Q725, street: 'turn',
    potBefore: 500, bet: 100, heroStack: 2000, nLive: 2, expect: 'raise', expectRaiseTo: 300,
    timeline: betTimeline('turn', 100, 500) },
  { name: 'draw-raise-size', kind: 'facing-raise', villain: 'rock',
    hero: [C(8, 2), C(6, 2)], board: [C(12, 2), C(7, 2), C(2, 0), C(5, 3)], street: 'turn',
    potBefore: 500, bet: 300, heroStack: 2000, nLive: 2, expect: 'raise', expectRaiseTo: 900,
    timeline: betTimeline('turn', 300, 500) },
  { name: 'veto-multiway-blank', kind: 'facing-exact', villain: 'nathan',
    hero: [C(4, 1), C(9, 0)], board: RIVER_2, street: 'river',
    potBefore: 887, bet: 669, heroStack: 669, villainStack: 0, nLive: 3, expect: 'fold',
    timeline: riverTimeline(266, 355, 669, 887), exactPool: true, multiOpp: 2 }
];

setTimeout(function () {
  var fails = 0, exactLoss = 0, lines = [];
  SPOTS.forEach(function (spot) {
    var v = runSpot(spot);
    var msg = strip(v.html);
    var problems = [];
    if (v.error) problems.push('error ' + v.error);
    if (v.advice !== spot.expect)
      problems.push('expected ' + spot.expect + ', got ' + v.advice);
    var evNote = '';
    if (spot.kind === 'leading' && v.advice === 'bet') {
      var size = sizeOf(msg);
      var potTotal = spot.potBefore;
      var ratio = size == null ? null : size / potTotal;
      var sprV = spot.heroStack / potTotal;
      var allowed = ratio == null || ratio <= 1.5 || sprV <= 1.05 ||
        spot.heroStack <= 200 || spot.allowAllIn;
      if (size == null) problems.push('bet with no parsable size');
      else if (!allowed) problems.push('bet ratio ' + ratio.toFixed(2) + 'x pot exceeds guardrail');
      if (spot.expectSize != null && size !== spot.expectSize)
        problems.push('expected size ' + spot.expectSize + ', got ' + size);
      evNote = 'size ' + size + ' (' + (ratio == null ? '?' : ratio.toFixed(2)) + 'x pot)';
    }
    if (spot.kind === 'facing-exact') {
      var pot = spot.potBefore + spot.bet;
      var eq = spot.multiOpp
        ? EQ.estimateEquityVsMadePoolMulti(spot.hero, spot.board, 3, spot.multiOpp)
        : EQ.estimateEquityVsMadePool(spot.hero, spot.board, 3);
      var need = spot.bet / (pot + spot.bet);
      var evCall = eq * (pot + spot.bet) - spot.bet;
      var evCoach = v.advice === 'call' ? evCall : 0;
      var best = Math.max(0, evCall);
      var loss = Math.max(0, best - evCoach);
      exactLoss += loss;
      evNote = 'exact eq ' + (eq * 100).toFixed(1) + '% vs need ' + (need * 100).toFixed(1) +
        '% | EV(call) ' + evCall.toFixed(0) + ' | coach EV ' + evCoach.toFixed(0) +
        ' | loss ' + loss.toFixed(0);
      if (loss > 0) problems.push('exact EV loss ' + loss.toFixed(0));
    }
    if (spot.kind === 'facing-raise') {
      var rm = /to ~\s*([\d,]+)/.exec(msg);
      var gotTo = rm ? parseInt(rm[1].replace(/,/g, ''), 10) : null;
      if (v.advice === 'raise' && gotTo == null) problems.push('raise with no parsable size');
      else if (v.advice === 'raise' && gotTo !== spot.expectRaiseTo)
        problems.push('expected raise to ' + spot.expectRaiseTo + ', got ' + gotTo);
      evNote = 'raise to ' + gotTo;
    }
    if (spot.kind === 'facing') {
      var pct = pctOf(msg);
      var potF = spot.potBefore + spot.bet;
      var needF = spot.bet / (potF + spot.bet);
      evNote = pct == null ? 'no equity figure in message'
        : 'coach-implied eq ' + Math.round(pct * 100) + '% vs need ' + Math.round(needF * 100) +
          '% (Monte Carlo, reported only)';
      if (spot.grossCheck) {
        var grossEq = seededGrossEq(spot);
        evNote += ' | seeded eq ' + (grossEq * 100).toFixed(1) + '%';
        if (v.advice === 'call' && grossEq < needF - 0.20)
          problems.push('gross EV failure: seeded eq ' + (grossEq * 100).toFixed(1) + '% vs need ' + Math.round(needF * 100) + '% on a call');
        if (v.advice === 'fold' && grossEq > needF + 0.20)
          problems.push('gross EV failure: seeded eq ' + (grossEq * 100).toFixed(1) + '% vs need ' + Math.round(needF * 100) + '% on a fold');
      }
    }
    if (spot.expectWord && msg.indexOf(spot.expectWord) === -1)
      problems.push('message missing "' + spot.expectWord + '"');
    if (problems.length) fails++;
    lines.push((problems.length ? 'FAIL' : 'PASS') + ' ' + spot.name + ': advice ' + v.advice +
      (evNote ? ' | ' + evNote : '') + (problems.length ? ' | ' + problems.join('; ') : ''));
  });
  lines.forEach(function (l) { console.log(l); });
  console.log('SOLVER LAB: ' + SPOTS.length + ' spots, ' + fails + ' failures, total exact EV loss ' +
    exactLoss.toFixed(0));
  console.log(fails === 0 ? 'SOLVER LAB PASSED' : 'SOLVER LAB FAILED (' + fails + ')');
  process.exit(fails ? 1 : 0);
}, 800);
