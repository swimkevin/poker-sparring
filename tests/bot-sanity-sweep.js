// Bot sanity sweep (v1.8.111): every archetype's botDecide must return a
// well-formed action across a grid of random spots — known action string,
// finite non-negative amount, bet/raise amounts inside the legal [min, max]
// range from legalActions, and never check facing a bet.
//
// Loop-ops discipline (learned this run): a probe stub MUST mirror the real
// engine's legalActions contract — minBetTo when canBet, the players array,
// button and bbIdx — or the sweep manufactures fake bugs (an early version
// of this stub read minBetTo-less legals and reported phantom NaN bets).
// Verify the stub against js/engine.js legalActions before trusting findings.
var path = require('path');
var BOTS = require(path.join(__dirname, '..', 'js', 'bots.js'));

function C(r, s) { return { r: r, s: s }; }
function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function hole() {
  var r1 = rnd(2, 14), s1 = rnd(0, 3), r2 = rnd(2, 14), s2 = rnd(0, 3);
  if (r1 === r2 && s1 === s2) s2 = (s2 + 1) % 4;
  return [C(r1, s1), C(r2, s2)];
}
function board(n) {
  var b = [], seen = {};
  while (b.length < n) {
    var r = rnd(2, 14), s = rnd(0, 3), k = r + ',' + s;
    if (!seen[k]) { seen[k] = 1; b.push(C(r, s)); }
  }
  return b;
}

// Mirrors js/engine.js legalActions: minBetTo exists iff canBet,
// minRaiseTo iff canRaise, maxRaiseTo always the all-in target.
function legalFor(currentBet, pBet, stack, bb) {
  var toCall = currentBet - pBet;
  var maxTo = pBet + stack;
  var out = { toCall: toCall, canCheck: toCall === 0, callAmount: Math.min(toCall, stack) };
  if (toCall > 0) {
    out.canRaise = stack > toCall;
    if (out.canRaise) { out.minRaiseTo = Math.min(currentBet + 20, maxTo); out.maxRaiseTo = maxTo; }
  } else if (currentBet === 0) {
    out.canBet = stack > 0;
    if (out.canBet) { out.minBetTo = Math.min(bb, maxTo); out.maxRaiseTo = maxTo; }
  } else {
    out.canRaise = stack > 0;
    if (out.canRaise) { out.minRaiseTo = Math.min(currentBet + 20, maxTo); out.maxRaiseTo = maxTo; }
  }
  return out;
}

var IDS = ['alice', 'donald', 'lag', 'rohan', 'amogh', 'nathan', 'shark',
  'station', 'maniac', 'rock', 'pro', 'nit', 'bully', 'gambler'];
var KNOWN = { fold: 1, check: 1, call: 1, bet: 1, raise: 1, allin: 1 };
var STREETS = [['preflop', 0], ['flop', 3], ['turn', 4], ['river', 5]];
var fails = 0;

function note(msg) {
  fails++;
  if (fails <= 8) console.log('FAIL: ' + msg);
}

for (var iter = 0; iter < 500; iter++) {
  var id = IDS[iter % IDS.length];
  var st = STREETS[rnd(0, 3)];
  var bb = 10, stack = rnd(100, 10000);
  var currentBet = Math.random() < 0.35 ? 0 : rnd(10, 1500);
  var pBet = rnd(0, Math.min(currentBet, stack));
  var live = rnd(2, 6);
  var players = [];
  for (var i = 0; i < live; i++) {
    players.push({ idx: i, totalBet: 0, folded: false, sittingOut: false });
  }
  var legal = legalFor(currentBet, pBet, stack, bb);
  var toCall = legal.toCall;
  var potBefore = rnd(20, 2000);
  var comm = board(st[1]);
  var table = {
    street: st[0], community: comm, currentBet: currentBet, bb: bb, handNo: rnd(1, 50),
    button: 0, bbIdx: 1, players: players,
    canAct: function () { return true; },
    potTotal: function () { return potBefore + currentBet; },
    livePlayers: function () { return players.filter(function (q) { return !q.folded; }); },
    legalActions: function () { return legal; }
  };
  var p = {
    idx: 1 % live, hole: hole(), stack: stack, bet: pBet, totalBet: pBet,
    archetype: BOTS.getArchetype(id), folded: false
  };
  var here = p;
  table.canAct = function (q) { return q === here; };
  var mv;
  try {
    mv = BOTS.botDecide(table, p);
  } catch (e) {
    note(id + ' ' + st[0] + ' threw: ' + e.message);
    continue;
  }
  if (!mv || typeof mv.a !== 'string') { note(id + ' ' + st[0] + ' bad shape: ' + JSON.stringify(mv)); continue; }
  if (!KNOWN[mv.a]) { note(id + ' ' + st[0] + ' unknown action: ' + mv.a); continue; }
  if (mv.a === 'check' && toCall > 0) note(id + ' ' + st[0] + ' checks facing a bet');
  if (mv.a === 'bet' || mv.a === 'raise') {
    var amt = mv.amount;
    if (typeof amt !== 'number' || !isFinite(amt)) {
      note(id + ' ' + st[0] + ' ' + mv.a + ' non-finite amount: ' + amt);
    } else if (amt < 0) {
      note(id + ' ' + st[0] + ' ' + mv.a + ' negative amount: ' + amt);
    } else {
      var lo = mv.a === 'bet' ? legal.minBetTo : legal.minRaiseTo;
      if (lo != null && amt < lo) note(id + ' ' + st[0] + ' ' + mv.a + ' ' + amt + ' below min ' + lo);
      if (legal.maxRaiseTo != null && amt > legal.maxRaiseTo) {
        note(id + ' ' + st[0] + ' ' + mv.a + ' ' + amt + ' above max ' + legal.maxRaiseTo);
      }
    }
  }
}

if (fails === 0) console.log('bot-sanity-sweep: 500 spots x 14 archetypes, all actions sane');
else console.log('bot-sanity-sweep: ' + fails + ' FAILURES');
process.exit(fails ? 1 : 0);
