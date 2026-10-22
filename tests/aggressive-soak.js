// Aggressive-hero soak: full hands with a maximum-pressure hero policy against
// every bot archetype. Guards three composition-level invariants the spot-check
// sweep can't: no engine exceptions across full hands, every bot action legal
// per engine.legalActions, and chip conservation hand to hand.
// Probe-fidelity note (v1.8.113): botDecide returns { a, amount } and the engine
// treats 'bet'/'raise' identically in act() — the checker mirrors both.
'use strict';
var path = require('path');
var ENG = require(path.join(__dirname, '..', 'js', 'engine.js'));
var BOTS = require(path.join(__dirname, '..', 'js', 'bots.js'));
var EV = require(path.join(__dirname, '..', 'js', 'evaluator.js'));

var ARCHETYPES = ['shark', 'station', 'maniac', 'donald', 'lag', 'amogh',
  'nathan', 'rohan', 'pro', 'alice', 'swimkev'];
var START = 10000, SB = 50, BB = 100, HANDS = 25;

function handStrength(hole, community) {
  if (community.length < 3) {
    var r = hole.map(function (c) { return c.r; }).sort(function (a, b) { return b - a; });
    var pair = r[0] === r[1];
    return pair ? 0.75 : (r[0] >= 12 ? 0.45 : 0.25);
  }
  var desc = EV.describeHand(EV.evaluate7(hole.concat(community)));
  if (/straight flush|four of|full house/i.test(desc)) return 0.95;
  if (/flush|straight/i.test(desc)) return 0.8;
  if (/three of/i.test(desc)) return 0.7;
  if (/two pair/i.test(desc)) return 0.6;
  if (/pair/i.test(desc)) return 0.5;
  return 0.3;
}

function heroMove(t, idx) {
  var p = t.players[idx];
  var L = t.legalActions(idx);
  var str = handStrength(p.hole, t.community);
  var pot = t.potTotal();
  if (t.street === 'preflop') {
    if (L.toCall === 0) {
      var open = Math.min(Math.max(3 * BB, L.minRaiseTo || 0), L.maxRaiseTo);
      return { a: 'bet', amount: open };
    }
    if (L.toCall > 0 && L.toCall <= p.stack * 0.12) {
      if (L.canRaise && str > 0.45) {
        var r = Math.min(Math.max(L.minRaiseTo, L.toCall * 3 + t.currentBet), L.maxRaiseTo);
        return { a: 'raise', amount: r };
      }
      return { a: 'call' };
    }
    if (L.toCall > 0 && str > 0.7 && L.canRaise) return { a: 'raise', amount: L.maxRaiseTo };
    return { a: 'fold' };
  }
  if (L.toCall === 0) {
    var bet = Math.min(Math.max(Math.round(pot * 0.66), L.minBetTo || 0), L.maxRaiseTo);
    return { a: 'bet', amount: bet };
  }
  if (str > 0.55 && L.canRaise) {
    var r2 = Math.min(Math.max(L.minRaiseTo, Math.round(t.currentBet * 2.5)), L.maxRaiseTo);
    return { a: 'raise', amount: r2 };
  }
  if (L.toCall <= pot * 0.34) return { a: 'call' };
  return { a: 'fold' };
}

function legalMove(t, idx, mv) {
  var p = t.players[idx];
  var L = t.legalActions(idx);
  if (!mv || !mv.a) return 'no action returned';
  if (mv.a === 'fold') return null;
  if (mv.a === 'check') return L.canCheck ? null : 'check facing a bet';
  if (mv.a === 'call') return L.toCall > 0 ? null : 'call with nothing to call';
  if (mv.a === 'bet' || mv.a === 'raise') {
    var to = mv.amount;
    if (!(to > t.currentBet)) return 'raise must exceed current bet (' + to + ' <= ' + t.currentBet + ')';
    if (to - p.bet > p.stack) return 'not enough chips (' + to + ')';
    var isAllIn = (to - p.bet) === p.stack;
    var fullRaise = to >= t.currentBet + t.lastRaiseSize;
    if (!isAllIn && !fullRaise) return 'raise below minimum (' + to + ')';
    return null;
  }
  return 'unknown action ' + mv.a;
}

var fails = 0, hands = 0;

var botCursor = 0;
for (var h = 0; h < HANDS; h++) {
  var defs = [{ name: 'HERO', isHero: true }];
  for (var i = 0; i < 5; i++) {
    var id = ARCHETYPES[(botCursor++) % ARCHETYPES.length];
    defs.push({ name: id, archetype: BOTS.getArchetype(id) });
  }
  var t = new ENG.PokerTable({ players: defs, startingStack: START, sb: SB, bb: BB });
  var expected = 6 * START;
  var handFail = 0;
  if (!t.startHand()) { console.log('FAIL: hand ' + h + ' did not start'); fails++; continue; }
  var guard = 0;
  try {
    while (!t.handOver && guard++ < 500) {
      var ai = t.acting;
      if (ai < 0) break;
      var pl = t.players[ai];
      var mv = pl.isHero ? heroMove(t, ai) : BOTS.botDecide(t, pl);
      var bad = legalMove(t, ai, mv);
      if (bad) { console.log('FAIL: hand ' + h + ' ' + pl.name + ': ' + bad); handFail++; break; }
      t.act(ai, mv.a, mv.amount);
    }
    if (guard >= 500) { console.log('FAIL: hand ' + h + ' guard tripped'); handFail++; }
  } catch (e) { console.log('FAIL: hand ' + h + ' exception: ' + e.message); handFail++; }
  var total = t.players.reduce(function (s, p) { return s + p.stack + p.bet; }, 0) + t.pot;
  if (total !== expected) { console.log('FAIL: hand ' + h + ' chip leak: ' + total + ' != ' + expected); handFail++; }
  if (handFail === 0) hands++;
  else fails++;
}

console.log(hands + '/' + HANDS + ' aggressive-soak hands clean');
if (fails > 0 || hands !== HANDS) { console.log('AGGRESSIVE SOAK FAILED'); process.exit(1); }
console.log('AGGRESSIVE SOAK PASSED');
