// Shark discipline (v1.8.97, Kevin): the TAG baseline must fold no-pair
// hands to big prices multiway, even with a big stack — Monte Carlo equity
// vs random hands + the stack discount used to talk him into calls with
// overcards/gutshots. He still continues with a pair, and still calls
// small bets heads-up with overcards (not over-tightened).
'use strict';
var path = require('path');
var BOTS = require(path.join(__dirname, '..', 'js', 'bots.js'));
function C(r, s) { return { r: r, s: s }; }
var BOARD = [C(2, 0), C(7, 1), C(9, 3)]; // 2c 7d 9s
function stubTable(live, potBefore, bet) {
  return {
    street: 'flop', community: BOARD, currentBet: bet, bb: 10, handNo: 1,
    canAct: function () { return true; },
    potTotal: function () { return potBefore + bet; },
    livePlayers: function () {
      var arr = [];
      for (var i = 0; i < live; i++) arr.push({ idx: i, totalBet: 0, folded: false });
      return arr;
    },
    legalActions: function () {
      return { toCall: bet, canCheck: false, canBet: false, canRaise: true,
               minRaiseTo: bet * 2, maxRaiseTo: 2000 };
    }
  };
}
function run(hole, live, potBefore, bet, n) {
  var A = BOTS.getArchetype('shark');
  var folds = 0;
  for (var i = 0; i < n; i++) {
    var p = { idx: 1, hole: hole, stack: 2000, bet: 0, totalBet: 10, archetype: A, folded: false };
    var mv = BOTS.botDecide(stubTable(live, potBefore, bet), p);
    if (mv && mv.a === 'fold') folds++;
  }
  return folds;
}
var N = 40, fails = 0;
function ok(cond, msg) { console.log((cond ? 'ok' : 'FAIL') + ': ' + msg); if (!cond) fails++; }
// A) Air + gutshot (Qs Js), multiway, ~pot-sized bet, deep stack: FOLD.
var a = run([C(12, 0), C(11, 0)], 4, 130, 100, N);
ok(a >= N - 2, 'shark folds no-pair to a pot-sized bet multiway (' + a + '/' + N + ')');
// B) Top pair (9s Kd), same price multiway: CONTINUES.
var b = run([C(9, 0), C(13, 1)], 4, 130, 100, N);
ok(N - b >= 30, 'shark continues with top pair at the same price (' + (N - b) + '/' + N + ')');
// C) Air heads-up vs a small bet: NOT auto-folded — still plays.
var c = run([C(12, 0), C(11, 0)], 2, 160, 40, N);
ok(N - c >= 25, 'shark still calls small bets heads-up with overcards+gutshot (' + (N - c) + '/' + N + ')');
// D) Pure air (Ks Qd, no draw), multiway, overbet: FOLD.
var dd = run([C(13, 0), C(12, 1)], 4, 100, 150, N);
ok(dd >= N - 2, 'shark folds pure air to an overbet multiway (' + dd + '/' + N + ')');
console.log(fails === 0 ? 'SHARK DISCIPLINE TEST PASSED' : 'SHARK DISCIPLINE TEST FAILED (' + fails + ')');
process.exit(fails ? 1 : 0);
