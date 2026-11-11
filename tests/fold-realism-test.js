// Fold realism (v1.8.104, Kevin): bots must fold air to big bets postflop —
// the v1.8.103 probe showed donald/lag/amogh never folding air (0/40) and
// shark/pro over-folding nut flush draws (0/40 continued). Station keeps its
// loose character: it only folds "absolutely nothing" into a pretty big raise.
'use strict';
var path = require('path');
var BOTS = require(path.join(__dirname, '..', 'js', 'bots.js'));
function C(r, s) { return { r: r, s: s }; }

function stubTable(board, live, potBefore, bet) {
  return {
    street: 'flop', community: board, currentBet: bet, bb: 10, handNo: 7,
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

function foldRate(id, hole, board, live, potBefore, bet, n) {
  var A = BOTS.getArchetype(id);
  var folds = 0;
  for (var i = 0; i < n; i++) {
    var p = { idx: 1, hole: hole, stack: 2000, bet: 0, totalBet: 10, archetype: A, folded: false };
    var mv = BOTS.botDecide(stubTable(board, live, potBefore, bet), p);
    if (mv && mv.a === 'fold') folds++;
  }
  return folds;
}

var N = 40, fails = 0;
function ok(cond, msg) { console.log((cond ? 'ok' : 'FAIL') + ': ' + msg); if (!cond) fails++; }

var BOARD_AIR = [C(2, 0), C(7, 1), C(9, 2)];      // 2c 7d 9h
var BOARD_NOTHING = [C(13, 0), C(9, 2), C(4, 0)];  // Ks 9h 4c
var BOARD_FD = [C(13, 0), C(7, 0), C(2, 1)];       // Ks 7s 2d
var AIR = [C(12, 0), C(11, 0)];                     // Qs Jc: overcards, no draw
var NOTHING = [C(3, 0), C(2, 1)];                   // 3c 2d: absolutely nothing
var PAIR = [C(9, 0), C(13, 1)];                     // 9s Kd: top pair
var FD = [C(14, 0), C(5, 0)];                       // As 5c: nut flush draw

// A) The core fix: sticky bots fold air to a big bet multiway.
['donald', 'lag', 'amogh', 'nathan', 'rohan', 'maniac'].forEach(function (id) {
  var f = foldRate(id, AIR, BOARD_AIR, 4, 130, 100, N); // need ~0.30
  ok(f >= 35, id + ' folds air to a big bet multiway (' + f + '/' + N + ')');
});
// B) Station keeps its character vs mere air, but folds absolute nothing.
var sAir = foldRate('station', AIR, BOARD_AIR, 4, 130, 100, N);
ok(sAir <= 15, 'station still calls with overcard air (' + (N - sAir) + '/' + N + ' continue)');
var sNothing = foldRate('station', NOTHING, BOARD_NOTHING, 2, 100, 120, N); // need ~0.35
ok(sNothing >= 35, 'station folds absolute nothing into a big raise (' + sNothing + '/' + N + ')');
// B2) Heads-up vs exactly 1/2 pot with air: also folds (need = 0.25:
// potTotal includes the bet, so 50/(150+50) = 0.25 is exactly half-pot).
// (v1.8.104 probe: this was 0/60 before the threshold was corrected.)
['donald', 'lag', 'amogh', 'nathan', 'rohan'].forEach(function (id) {
  var f = foldRate(id, AIR, BOARD_AIR, 2, 100, 50, N); // need = 0.25
  ok(f >= 35, id + ' folds air HU vs a 1/2-pot bet (' + f + '/' + N + ')');
});
// C) No over-tightening: pairs continue, draws continue (incl. shark/pro).
['donald', 'lag', 'amogh', 'shark', 'station', 'rock'].forEach(function (id) {
  var c = N - foldRate(id, PAIR, BOARD_AIR, 4, 130, 100, N);
  ok(c >= 35, id + ' continues with top pair (' + c + '/' + N + ')');
});
['shark', 'pro'].forEach(function (id) {
  var c = N - foldRate(id, FD, BOARD_FD, 4, 130, 100, N);
  ok(c >= 35, id + ' continues with the nut flush draw (' + c + '/' + N + ')');
});
// D) Profile honesty (v1.8.108): maniac folds air to big bets by design
// (section A above), so his tagline must not claim he never folds.
var maniacTag = String(BOTS.getArchetype('maniac').tagline || '').toLowerCase();
ok(maniacTag.indexOf('no fold') === -1 && maniacTag.indexOf('never folds') === -1,
  'maniac tagline stays honest about folding air (' + BOTS.getArchetype('maniac').tagline + ')');
// D2) Profile honesty (v1.8.114): donald's tagline claimed he "almost never
// folds postflop" while section A requires him to fold air 35/40 to big
// bets on every street; rohan's claimed he "calls everything" while his own
// desc and section A say he folds when he has nothing.
var donaldTag = String(BOTS.getArchetype('donald').tagline || '').toLowerCase();
ok(donaldTag.indexOf('almost never folds postflop') === -1,
  'donald tagline no longer claims he never folds postflop (' + BOTS.getArchetype('donald').tagline + ')');
ok(donaldTag.indexOf('air') !== -1,
  'donald tagline admits folding air to big bets (' + BOTS.getArchetype('donald').tagline + ')');
var rohanTag = String(BOTS.getArchetype('rohan').tagline || '').toLowerCase();
ok(rohanTag.indexOf('calls everything') === -1,
  'rohan tagline no longer claims he calls everything (' + BOTS.getArchetype('rohan').tagline + ')');
ok(rohanTag.indexOf('folds') !== -1,
  'rohan tagline admits folding (' + BOTS.getArchetype('rohan').tagline + ')');

console.log(fails === 0 ? 'FOLD REALISM TEST PASSED' : 'FOLD REALISM TEST FAILED (' + fails + ')');
process.exit(fails ? 1 : 0);
