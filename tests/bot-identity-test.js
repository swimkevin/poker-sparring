// Bot identity test (v1.8.120): first-in preflop tendencies must match each
// archetype's profile. The spot-check sweep proves actions are legal; this
// proves they are in character: tight bots fold trash facing a lone big
// blind, loose bots call it, and everyone but the never-raisers raises aces.
// The stub mirrors js/engine.js legalActions for "first to act, blinds only":
// currentBet = bb, bot never sits in the bb seat (bbIdx 5, bot idx 0-4), so
// toCall is always the blind and no check is available. Thresholds sit many
// sigma from the measured rates (folds cluster at 0% or 95-100%, AA raises
// at 0% or 85-100% over 1000 trials each), so this must not flake.
var path = require('path');
var BOTS = require(path.join(__dirname, '..', 'js', 'bots.js'));

function C(r, s) { return { r: r, s: s }; }
var TRASH = [C(7, 0), C(2, 1)];
var ACES = [C(14, 0), C(14, 1)];
var N = 1000;

function decide(id, hole, idx) {
  var players = [];
  for (var j = 0; j < 6; j++) players.push({ idx: j, totalBet: 0, folded: false, sittingOut: false });
  var legal = { toCall: 10, canCheck: false, callAmount: 10, canRaise: true, minRaiseTo: 30, maxRaiseTo: 1000 };
  var here = { idx: idx, hole: hole, stack: 1000, bet: 0, totalBet: 0, archetype: BOTS.getArchetype(id), folded: false };
  var table = {
    street: 'preflop', community: [], currentBet: 10, bb: 10, handNo: 1,
    button: 0, bbIdx: 5, players: players,
    canAct: function (q) { return q === here; },
    potTotal: function () { return 15; },
    livePlayers: function () { return players; },
    legalActions: function () { return legal; }
  };
  return BOTS.botDecide(table, here);
}

function rates(id) {
  var foldTrash = 0, raiseAces = 0, foldAces = 0, errs = 0;
  for (var i = 0; i < N; i++) {
    try {
      var a = decide(id, TRASH, i % 5);
      if (a.a === 'fold') foldTrash++;
      var b = decide(id, ACES, i % 5);
      if (b.a === 'raise' || b.a === 'bet' || b.a === 'allin') raiseAces++;
      if (b.a === 'fold') foldAces++;
    } catch (e) { errs++; void e; }
  }
  return { foldTrash: foldTrash / N, raiseAces: raiseAces / N, foldAces: foldAces / N, errs: errs };
}

var FOLD_TRASH = ['alice', 'donald', 'rohan', 'shark', 'rock', 'pro', 'nit'];
var CALL_TRASH = ['lag', 'amogh', 'nathan', 'station', 'maniac', 'bully', 'gambler'];
var NEVER_RAISE = ['rohan', 'nathan'];

var fails = 0;
function check(cond, msg) {
  if (!cond) { fails++; console.log('FAIL: ' + msg); }
  else { console.log('ok: ' + msg); }
}

var ALL = FOLD_TRASH.concat(CALL_TRASH);
ALL.forEach(function (id) {
  var r = rates(id);
  check(r.errs === 0, id + ' botDecide never throws (' + r.errs + ' errors)');
  check(r.foldAces <= 0.05, id + ' never folds aces first-in (fold ' + (100 * r.foldAces).toFixed(1) + '%)');
  if (FOLD_TRASH.indexOf(id) >= 0) {
    check(r.foldTrash >= 0.80, id + ' folds trash first-in (fold ' + (100 * r.foldTrash).toFixed(1) + '%)');
  } else {
    check(r.foldTrash <= 0.20, id + ' calls trash first-in (fold ' + (100 * r.foldTrash).toFixed(1) + '%)');
  }
  if (NEVER_RAISE.indexOf(id) >= 0) {
    check(r.raiseAces <= 0.10, id + ' never raises aces first-in (raise ' + (100 * r.raiseAces).toFixed(1) + '%)');
  } else if (id !== 'station') {
    check(r.raiseAces >= 0.50, id + ' raises aces first-in (raise ' + (100 * r.raiseAces).toFixed(1) + '%)');
  }
});

if (fails === 0) console.log('bot-identity-test: all archetypes in character');
else console.log('bot-identity-test: ' + fails + ' FAILURES');
process.exit(fails ? 1 : 0);
