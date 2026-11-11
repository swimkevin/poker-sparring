// Bot identity test (v1.8.120, recalibrated ws3): first-in preflop
// tendencies must match each archetype's profile. The spot-check sweep
// proves actions are legal; this proves they are in character: tight bots
// fold trash facing a lone big blind, loose bots call or fold it at their
// own measured rates, and everyone but the never-raisers raises aces.
// First-in VPIP is measured over 2000 random hands per bot and banded
// around the measured rate; the old CALL_TRASH rule (fold <= 20%) was
// wrong for every loose bot once the cheap-call branches were fixed —
// real loose humans fold 72o first-in most of the time, they just play
// far more hands overall. Bands sit many sigma from the measured rates
// (N=1000-2000), so this must not flake.
var path = require('path');
var BOTS = require(path.join(__dirname, '..', 'js', 'bots.js'));

function C(r, s) { return { r: r, s: s }; }
var TRASH = [C(7, 0), C(2, 1)];
var ACES = [C(14, 0), C(14, 1)];
var N = 1000;
var NV = 2000;

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

function randomHole() {
  var r1 = 2 + Math.floor(Math.random() * 13);
  var s1 = Math.floor(Math.random() * 4);
  var r2 = 2 + Math.floor(Math.random() * 13);
  var s2 = Math.floor(Math.random() * 4);
  if (r1 === r2 && s1 === s2) s2 = (s2 + 1) % 4;
  return [C(r1, s1), C(r2, s2)];
}

function rates(id) {
  var foldTrash = 0, raiseAces = 0, foldAces = 0, vpip = 0, errs = 0;
  for (var i = 0; i < N; i++) {
    try {
      var a = decide(id, TRASH, i % 5);
      if (a.a === 'fold') foldTrash++;
      var b = decide(id, ACES, i % 5);
      if (b.a === 'raise' || b.a === 'bet' || b.a === 'allin') raiseAces++;
      if (b.a === 'fold') foldAces++;
    } catch (e) { errs++; void e; }
  }
  for (var j = 0; j < NV; j++) {
    try {
      var v = decide(id, randomHole(), j % 5);
      if (v.a !== 'fold') vpip++;
    } catch (e) { errs++; void e; }
  }
  return { foldTrash: foldTrash / N, raiseAces: raiseAces / N, foldAces: foldAces / N, vpip: vpip / NV, errs: errs };
}

var FOLD_TRASH = ['alice', 'donald', 'rohan', 'shark', 'rock', 'pro', 'nit'];
var LOOSE_TRASH = { lag: [0.75, 0.95], amogh: [0.90, 1.0], nathan: [0.78, 0.96], station: [0.76, 0.95], maniac: [0.50, 0.75], bully: [0.90, 1.0], gambler: [0.80, 0.97] };
var VPIP = { alice: [0, 0.15], donald: [0.02, 0.21], lag: [0.32, 0.52], rohan: [0.34, 0.54], amogh: [0.24, 0.43], nathan: [0.37, 0.57], shark: [0.16, 0.35], station: [0.38, 0.58], maniac: [0.59, 0.79], rock: [0, 0.17], pro: [0.06, 0.25], nit: [0, 0.17], bully: [0.24, 0.43], gambler: [0.38, 0.58] };
var NEVER_RAISE = ['rohan', 'nathan'];

var fails = 0;
function check(cond, msg) {
  if (!cond) { fails++; console.log('FAIL: ' + msg); }
  else { console.log('ok: ' + msg); }
}

var ALL = FOLD_TRASH.concat(Object.keys(LOOSE_TRASH));
ALL.forEach(function (id) {
  var r = rates(id);
  check(r.errs === 0, id + ' botDecide never throws (' + r.errs + ' errors)');
  check(r.foldAces <= 0.05, id + ' never folds aces first-in (fold ' + (100 * r.foldAces).toFixed(1) + '%)');
  if (FOLD_TRASH.indexOf(id) >= 0) {
    check(r.foldTrash >= 0.80, id + ' folds trash first-in (fold ' + (100 * r.foldTrash).toFixed(1) + '%)');
  } else {
    var band = LOOSE_TRASH[id];
    check(r.foldTrash >= band[0] && r.foldTrash <= band[1], id + ' folds trash first-in in band (fold ' + (100 * r.foldTrash).toFixed(1) + '%, band ' + (100 * band[0]) + '-' + (100 * band[1]) + '%)');
  }
  var vb = VPIP[id];
  check(r.vpip >= vb[0] && r.vpip <= vb[1], id + ' first-in VPIP in band (VPIP ' + (100 * r.vpip).toFixed(1) + '%, band ' + (100 * vb[0]) + '-' + (100 * vb[1]) + '%)');
  if (NEVER_RAISE.indexOf(id) >= 0) {
    check(r.raiseAces <= 0.10, id + ' never raises aces first-in (raise ' + (100 * r.raiseAces).toFixed(1) + '%)');
  } else if (id !== 'station') {
    check(r.raiseAces >= 0.50, id + ' raises aces first-in (raise ' + (100 * r.raiseAces).toFixed(1) + '%)');
  }
});

if (fails === 0) console.log('bot-identity-test: all archetypes in character');
else console.log('bot-identity-test: ' + fails + ' FAILURES');
process.exit(fails ? 1 : 0);
