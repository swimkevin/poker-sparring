// Side-pot reconciliation test (v1.8.99): the Oct-10 report said Station's
// seat stack jumped to 3,275 while the hand history suggested ~231 — i.e.
// the handEnd EVENT data (which feeds the winner banner AND the hand
// history) may disagree with the ACTUAL stack credits. Synthetic tests only
// checked total conservation, never per-player event-vs-reality agreement.
// This test forces random multi-level all-in side pots across many hands and
// asserts, per player per hand: actual net won === sum of event-credited
// amounts (per-winner shares + odd chips + uncalled refunds + degenerate
// slice refunds).
var EN = require('../js/engine.js');
var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}

function rnd(n) { return Math.floor(Math.random() * n); }
function card() { return { r: 2 + rnd(13), s: rnd(4) }; }

var HANDS = 150;
for (var h = 0; h < HANDS; h++) {
  var nP = 4 + rnd(3); // 4-6 players
  var names = ['Hero', 'Station', 'Amogh', 'Rohan', 'Nathan', 'Shark'];
  var players = [];
  for (var i = 0; i < nP; i++) players.push({ name: names[i] });
  var t = new EN.PokerTable({ players: players, sb: 5, bb: 10, startingStack: 1000 });
  // Randomize starting stacks a bit (200-1500) like a real session.
  t.players.forEach(function (p) { p.stack = 200 + rnd(1301); });

  var events = [];
  t.onEvent = function (e) { events.push(e); };

  // Force a side-pot scenario: 2-3 distinct all-in levels among the players.
  var levels = [];
  var nLevels = 2 + rnd(2);
  for (var l = 0; l < nLevels; l++) levels.push(50 + rnd(900));
  levels.sort(function (a, b) { return a - b; });
  var stacksBefore = t.players.map(function (p) { return p.stack; });
  t.players.forEach(function (p, pi) {
    var lvl = levels[pi % levels.length];
    var bet = Math.min(lvl, p.stack);
    p.totalBet = bet;
    p.stack -= bet;
    p.folded = (pi % 3 === 2) && pi > 1; // some folders add dead money
    p.allIn = (bet >= stacksBefore[pi]);
    p.hole = [card(), card()];
  });
  // Ensure at least 2 non-folded players so _showdown runs a real contest.
  var live = t.players.filter(function (p) { return !p.folded; });
  if (live.length < 2) { t.players[1].folded = false; t.players[2].folded = false; }
  t.community = [card(), card(), card(), card(), card()];

  var totalBefore = stacksBefore.reduce(function (a, b) { return a + b; }, 0);
  var contribBefore = t.players.map(function (p) { return p.totalBet; });
  t._showdown();
  var totalAfter = t.players.reduce(function (p2, p) { return p2 + p.stack; }, 0);
  ok(totalAfter === totalBefore,
    'hand ' + h + ': total conservation (' + totalBefore + ' -> ' + totalBefore + ')');

  var he = events.filter(function (e) { return e.t === 'handEnd'; })[0];
  ok(!!he, 'hand ' + h + ': handEnd emitted');
  if (!he) continue;

  // Rebuild per-player credited amounts from the event, mirroring the
  // engine's rules exactly. Net won = stackAfter - stackBefore + contributed
  // (getting your own money back is not winnings).
  var credited = {};
  function credit(i, amt) { credited[i] = (credited[i] || 0) + amt; }
  he.winners.forEach(function (w) {
    var ids = w.winners || [w.idx];
    if (!ids.length || ids[0] === undefined) return; // unreachable: refunds are itemized
    // Uncalled / refunded: exactly amount back to the single player.
    if (w.uncalled) { credit(ids[0], w.amount); return; }
    // Contested/split pot: share = floor(amount/n); the first `rem`
    // winners in button order get +1 (odd-chip rule).
    var n = ids.length;
    var share = Math.floor(w.amount / n), rem = w.amount % n;
    var ordered = ids.slice().sort(function (a, b) {
      return ((a - t.button + t.players.length) % t.players.length) -
             ((b - t.button + t.players.length) % t.players.length);
    });
    ordered.forEach(function (idx2, k) { credit(idx2, share + (k < rem ? 1 : 0)); });
  });
  t.players.forEach(function (p, pi) {
    var net = p.stack - stacksBefore[pi] + contribBefore[pi];
    var ev = credited[pi] || 0;
    ok(net === ev,
      'hand ' + h + ' player ' + p.name + ': event amounts match actual credit (' + net + ' vs ' + ev + ')');
    ok(net >= 0, 'hand ' + h + ' player ' + p.name + ': no negative net win');
  });
  // Hand-history feed: the recorded per-pot amount must equal the engine's
  // per-winner share (this is the number Kevin saw as "231").
  he.winners.forEach(function (w, wi) {
    if (w.uncalled || w.refunded) return;
    var ids3 = w.winners || [w.idx];
    var recorded = (w.each != null ? w.each : w.amount);
    var actualShare = Math.floor(w.amount / ids3.length);
    ok(recorded === actualShare,
      'hand ' + h + ' pot ' + wi + ': recorded amount equals actual share (' + recorded + ')');
  });
}

console.log('sidepot-reconcile: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
