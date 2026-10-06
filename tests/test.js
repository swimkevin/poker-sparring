// Headless tests: node tests/test.js
var path = require('path');
var js = function (f) { return require(path.join(__dirname, '..', 'js', f)); };
var C = js('cards.js'), E = js('evaluator.js'), EQ = js('equity.js'), EN = js('engine.js');
var BOTS = js('bots.js'), PF = js('pushfold.js'), ST = js('stats.js');
var RP = js('replay.js');

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}
function card(r, s) { return { r: r, s: s }; } // s: 0 spade 1 heart 2 diamond 3 club
function hand(str) {
  // e.g. "As Kd Qh Jc Ts"
  var sm = { s: 0, h: 1, d: 2, c: 3 };
  var rm = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  return str.split(' ').map(function (t) {
    var r = rm[t[0]] || parseInt(t[0], 10);
    return { r: r, s: sm[t[1]] };
  });
}

// ---------- evaluator ----------
(function () {
  var royal = E.evaluate(hand('As Ks Qs Js Ts 2d 3c'));
  var quad = E.evaluate(hand('9s 9h 9d 9c 2s 3d 4c'));
  ok(royal.cat === 8 && royal.score > quad.score, 'royal flush beats quads');

  var wheel = E.evaluate(hand('As 2d 3h 4c 5s Kd Qh'));
  ok(wheel.cat === 4 && wheel.kickers[0] === 5, 'wheel straight detected (5 high), got ' + JSON.stringify(wheel.kickers));

  var sixHigh = E.evaluate(hand('2s 3d 4h 5c 6s Kd Qh'));
  ok(sixHigh.score > wheel.score, '6-high straight beats wheel');

  var fh1 = E.evaluate(hand('Ks Kh Kd 2s 2h 3d 4c')); // KKK22
  var fh2 = E.evaluate(hand('Qs Qh Qd As Ah 3d 4c')); // QQQAA
  ok(fh1.score > fh2.score, 'KKK22 beats QQQAA');

  var fl1 = E.evaluate(hand('As 9s 7s 5s 3s Kd Qh'));
  var fl2 = E.evaluate(hand('Ah 9h 7h 5h 4h Ks Qd'));
  ok(fl2.score > fl1.score, 'flush: A9874 beats A9873 on 5th kicker');

  var p1 = E.evaluate(hand('Ks Kh 2d 5c 7s Ad Qh')); // pair K, A kicker
  var p2 = E.evaluate(hand('Kd Kc 2d 5c 7s Qd Jh')); // pair K, Q kicker
  ok(p1.score > p2.score, 'pair kicker decides');

  var tp1 = E.evaluate(hand('Ks Kh Qd Qc 2s 3d 4c'));
  var tp2 = E.evaluate(hand('Ks Kh Jd Jc As 3d 4c'));
  ok(tp1.score > tp2.score, 'KKQQ beats KKJJ');

  // Split pot: board plays
  var b1 = E.evaluate(hand('As Ks Qs Js Ts 2d 3c').concat(hand('2h 3h')));
  var b2 = E.evaluate(hand('As Ks Qs Js Ts 2d 3c').concat(hand('7h 8h')));
  ok(b1.score === b2.score, 'identical best-5 => tie');

  var sf = E.evaluate(hand('9s Ts Js Qs Ks 2d 3c'));
  ok(sf.cat === 8 && sf.kickers[0] === 13, 'straight flush K high');

  var trips = E.evaluate(hand('7s 7h 7d As Kd Qh 2c'));
  ok(trips.cat === 3 && trips.kickers[0] === 7, 'trips');

  // 7-card flush picks best 5
  var fl = E.evaluate(hand('2s 4s 6s 8s Ts Ks Qd'));
  ok(fl.cat === 5 && fl.kickers[0] === 13 && fl.kickers[4] === 4, '7-card flush best 5 (K,T,8,6,4)');

  console.log('describe:', E.describeHand(E.evaluate(hand('Ks Kh Kd 2s 2h 3d 4c'))));
  console.log('describe:', E.describeHand(E.evaluate(hand('As Ks Qs Js Ts 2d 3c'))));
  console.log('describe:', E.describeHand(E.evaluate(hand('9s 8d 7h 6c 5s Kd Qh'))));
})();

// ---------- equity sanity ----------
(function () {
  var eqAA = EQ.estimateEquity(hand('As Ah'), [], 1, 400);
  ok(eqAA > 0.78 && eqAA < 0.92, 'AA vs random ~0.85, got ' + eqAA.toFixed(3));
  var eq72 = EQ.estimateEquity(hand('7s 2d'), [], 1, 400);
  ok(eq72 < 0.45, '72o vs random << 0.5, got ' + eq72.toFixed(3));
  var eqDraw = EQ.estimateEquity(hand('As Ks'), hand('Qs Js 2d'), 1, 300);
  ok(eqDraw > 0.45, 'nut flush draw + overs reasonable, got ' + eqDraw.toFixed(3));
})();

// ---------- engine: 300-hand soak test ----------
function randomPolicy(table, idx) {
  var legal = table.legalActions(idx);
  var r = Math.random();
  if (legal.toCall > 0) {
    if (r < 0.35) return { a: 'fold' };
    if (r < 0.8 || !legal.canRaise) return { a: 'call' };
    var to = Math.min(legal.minRaiseTo, legal.maxRaiseTo);
    return { a: 'raise', amount: to };
  }
  if (legal.canRaise && r >= 0.85) {
    return { a: 'raise', amount: Math.min(legal.minRaiseTo, legal.maxRaiseTo) };
  }
  if (r < 0.7 || !legal.canBet) return { a: 'check' };
  return { a: 'bet', amount: Math.min(legal.minBetTo, legal.maxRaiseTo) };
}

function heroPolicy(table, idx) {
  var p = table.players[idx];
  var legal = table.legalActions(idx);
  if (table.street === 'preflop') {
    var tier = EQ.holeTier(p.hole);
    if (legal.toCall === 0) {
      if (tier <= 3 && legal.canRaise) return { a: 'raise', amount: Math.min(Math.round(table.bb * 2.5), legal.maxRaiseTo) };
      return { a: 'check' };
    }
    if (tier <= 2 && legal.canRaise && Math.random() < 0.5)
      return { a: 'raise', amount: Math.min(legal.minRaiseTo, legal.maxRaiseTo) };
    if (tier <= 4 && legal.callAmount <= p.stack * 0.12) return { a: 'call' };
    if (tier <= 3) return { a: 'call' };
    return { a: 'fold' };
  }
  var liveOpp = table.livePlayers().length - 1;
  var eq = EQ.estimateEquity(p.hole, table.community, liveOpp, 80);
  var pot = table.potTotal();
  if (legal.toCall === 0) {
    if (eq > 0.62 && legal.canBet) return { a: 'bet', amount: Math.max(legal.minBetTo, Math.min(Math.round(pot * 0.6), legal.maxRaiseTo)) };
    return { a: 'check' };
  }
  var need = legal.callAmount / (pot + legal.callAmount);
  if (eq > need) {
    if (eq > 0.75 && legal.canRaise && Math.random() < 0.4)
      return { a: 'raise', amount: Math.min(legal.minRaiseTo, legal.maxRaiseTo) };
    return { a: 'call' };
  }
  return { a: 'fold' };
}

(function () {
  var N = 6, START = 10000;
  var table = new EN.PokerTable({
    players: Array.from({ length: N }, function (_, i) {
      return { name: i === 0 ? 'Hero' : 'Bot' + i, isHero: i === 0 };
    }),
    sb: 50, bb: 100, startingStack: START
  });
  var totalChips = N * START;
  var showdowns = 0, foldWins = 0;
  for (var h = 0; h < 300; h++) {
    if (table.activeCount() < 2) {
      // rebuy everyone for soak purposes
      table.players.forEach(function (p) { p.stack = START; p.sittingOut = false; });
    }
    var okStart = table.startHand();
    if (!okStart) break;
    var guard = 0;
    while (!table.handOver && guard++ < 500) {
      var i = table.acting;
      var mv = table.players[i].isHero ? heroPolicy(table, i) : randomPolicy(table, i);
      table.act(i, mv.a, mv.amount);
    }
    ok(table.handOver, 'hand ' + h + ' finished');
    ok(guard < 500, 'hand ' + h + ' no infinite loop');
    // chip conservation
    var chips = table.players.reduce(function (s, p) { return s + p.stack; }, 0) + table.pot +
      table.players.reduce(function (s, p) { return s + p.bet; }, 0);
    ok(chips === totalChips, 'hand ' + h + ' chip conservation (' + chips + ' vs ' + totalChips + ')');
    var lastEvts = table.eventQueue;
    var end = lastEvts[lastEvts.length - 1];
    if (end.t === 'handEnd') {
      if (end.winners.length === 1 && end.winners[0].byFold) foldWins++;
      else showdowns++;
    }
    table.eventQueue = [];
  }
  console.log('soak: 300 hands, showdowns=' + showdowns + ', foldWins=' + foldWins);
  ok(showdowns + foldWins === 300, 'every hand ended in a showdown or a fold win');
  ok(showdowns > 20, 'enough showdowns happened (' + showdowns + ')');
  // Fold-win occurrence is pinned by a deterministic test below (the count above
  // is inherently random, so it is not thresholded).
})();

// ---------- deterministic side pots (no randomness: rigged cards, direct _showdown) ----------
(function () {
  function mkTable() {
    return new EN.PokerTable({
      players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      sb: 5, bb: 10, startingStack: 1000
    });
  }
  // _buildPots: A all-in 100, B all-in 300, C bets 600.
  var t = mkTable();
  t.players[0].totalBet = 100; t.players[1].totalBet = 300; t.players[2].totalBet = 600;
  var pots = t._buildPots();
  ok(pots.length === 3, 'three pots built');
  ok(pots[0].amount === 300 && pots[1].amount === 400 && pots[2].amount === 300,
    'pot amounts 300/400/300, got ' + pots.map(function (p) { return p.amount; }).join('/'));
  ok(pots[0].eligible.join() === '0,1,2' && pots[1].eligible.join() === '1,2' && pots[2].eligible.join() === '2',
    'pot eligibility main=[A,B,C] side1=[B,C] side2=[C]');

  // _showdown: A(AA) all-in 100, B(KK) all-in 300, C(QQ) bets 600, board bricks.
  var t2 = mkTable();
  t2.handNo = 1; t2.handOver = false; t2.button = 2;
  t2.community = hand('2d 3d 4d 5d 9c');
  t2.players[0].hole = hand('As Ah'); t2.players[0].totalBet = 100; t2.players[0].stack = 0;
  t2.players[1].hole = hand('Ks Kh'); t2.players[1].totalBet = 300; t2.players[1].stack = 0;
  t2.players[2].hole = hand('Qs Qh'); t2.players[2].totalBet = 600; t2.players[2].stack = 400;
  t2._showdown();
  ok(t2.handOver, 'showdown ends the hand');
  ok(t2.players[0].stack === 300, 'A wins main pot 300, got ' + t2.players[0].stack);
  ok(t2.players[1].stack === 400, 'B wins side pot 400, got ' + t2.players[1].stack);
  ok(t2.players[2].stack === 700, 'C gets uncalled 300 back, got ' + t2.players[2].stack);
  var tot = t2.players[0].stack + t2.players[1].stack + t2.players[2].stack;
  ok(tot === 1400, 'side-pot chip conservation, got ' + tot);
  var endEvts = t2.eventQueue.filter(function (e) { return e.t === 'handEnd'; });
  ok(endEvts.length === 1 && endEvts[0].winners.length === 3, 'handEnd reports all 3 pots');
  ok(endEvts[0].winners[2].uncalled === true, 'third pot flagged uncalled');

  // Odd chip: royal on board => A & B tie; C's folded dead money makes the main pot odd.
  var t3 = mkTable();
  t3.handNo = 1; t3.handOver = false; t3.button = 2;
  t3.community = hand('Ad Kd Qd Jd Td'); // board plays for everyone
  t3.players[0].hole = hand('As Ah'); t3.players[0].totalBet = 100; t3.players[0].stack = 0;
  t3.players[1].hole = hand('Ks Kh'); t3.players[1].totalBet = 100; t3.players[1].stack = 0;
  t3.players[2].hole = hand('2c 3c'); t3.players[2].totalBet = 1; t3.players[2].stack = 900;
  t3.players[2].folded = true;
  t3._showdown();
  // Level-1 pot = 3 (A,B eligible, tie) -> 1 each + 1 odd chip; level-100 pot = 198 -> 99 each.
  // Winners ordered from left of button(2): A first, so A gets the odd chip.
  var w0 = t3.eventQueue.filter(function (e) { return e.t === 'handEnd'; })[0].winners[0];
  ok(w0.winners.join() === '0,1', 'tied winners ordered from left of button');
  ok(t3.players[0].stack === 101, 'A gets the odd chip (2+99), got ' + t3.players[0].stack);
  ok(t3.players[1].stack === 100, 'B gets 100 (1+99), got ' + t3.players[1].stack);
  // Win by fold (deterministic): everyone folds to A's flop bet.
  var t4 = new EN.PokerTable({
    players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    sb: 5, bb: 10, startingStack: 1000, button: 2 // rotates to 0: B=SB, C=BB, A first
  });
  t4.startHand();
  t4.act(0, 'call');    // A calls 10
  t4.act(1, 'call');    // B calls 5 more
  t4.act(2, 'check');   // C checks option
  // Flop: action starts left of the button (B first).
  t4.act(1, 'check');   // B checks
  t4.act(2, 'check');   // C checks
  t4.act(0, 'bet', 20); // A bets the flop
  t4.act(1, 'fold');
  t4.act(2, 'fold');    // -> win by fold
  ok(t4.handOver, 'fold win ends the hand');
  ok(t4.players[0].stack === 1020, 'A takes the 50 pot (970+50), got ' + t4.players[0].stack);
  var fe = t4.eventQueue.filter(function (e) { return e.t === 'handEnd'; })[0];
  ok(fe.winners.length === 1 && fe.winners[0].byFold === true && fe.winners[0].idx === 0,
    'handEnd flags a lone by-fold winner');
})();

// ---------- engine: broke players are not live (showdown-crash regression) ----------
// Cash games leave busted bots seated with 0 chips (not sittingOut). They hold no
// cards and must not keep a hand alive: previously the engine ran such hands to a
// showdown with no eligible winner and crashed in _showdown (reduce of empty array).
(function () {
  function mkTable() {
    var t = new EN.PokerTable({
      players: [{ name: 'Hero' }, { name: 'Z1' }, { name: 'Shorty' }, { name: 'Z2' }],
      sb: 50, bb: 100, startingStack: 10000 // default button=3 -> rotates to Hero(0)
    });
    t.players[1].stack = 0; // busted earlier, still seated (cash game)
    t.players[3].stack = 0;
    t.players[2].stack = 17; // short stack
    return t;
  }
  // Heads-up by funding: Hero=SB(50), Shorty=BB(17 all-in). Hero folds.
  var t = mkTable();
  ok(t.startHand(), 'hand starts with broke players seated');
  ok(t.players[1].hole.length === 0 && t.players[3].hole.length === 0, 'broke players are not dealt cards');
  ok(t.livePlayers().length === 2, 'only funded players count as live');
  ok(t.acting === 0, 'hero (SB) acts first');
  var threw = false;
  try { t.act(0, 'fold'); } catch (e) { threw = true; }
  ok(!threw, 'fold into a short-stack blind does not throw');
  ok(t.handOver, 'hand ends by fold instead of running a zombie showdown');
  ok(t.players[2].stack === 67, 'shorty wins the 67 pot by fold, got ' + t.players[2].stack);
  var chips = t.players.reduce(function (s, p) { return s + p.stack; }, 0);
  ok(chips === 10017, 'chip conservation after zombie fold-win, got ' + chips);

  // Same setup, hero calls -> clean all-in showdown, no crash, sane pots.
  var t2 = mkTable();
  t2.startHand();
  t2.players[0].hole = hand('As Ah');
  t2.players[2].hole = hand('7s 2d');
  t2.deck = hand('4c 3s 9h 5d 2c'); // board runs out 2c 5d 9h | 3s | 4c
  threw = false;
  try { t2.act(0, 'call'); } catch (e) { threw = true; }
  var guard = 0;
  try { while (!t2.handOver && guard++ < 50) { t2.act(t2.acting, 'check'); } }
  catch (e) { threw = true; }
  ok(!threw && t2.handOver, 'all-in showdown with broke players seated does not throw');
  ok(t2.players[0].stack === 10017, 'hero (AA) wins the 117 pot, got ' + t2.players[0].stack);
  var chips2 = t2.players.reduce(function (s, p) { return s + p.stack; }, 0);
  ok(chips2 === 10017, 'chip conservation after zombie showdown, got ' + chips2);
})();

// ---------- engine: degenerate showdown level refunds instead of crashing ----------
// _showdown is also invoked directly (tests, future callers): a pot level no live
// player is eligible for must refund contributors, never throw.
(function () {
  var t = new EN.PokerTable({ players: [{ name: 'A' }, { name: 'B' }], sb: 5, bb: 10, startingStack: 1000 });
  t.handNo = 1; t.handOver = false; t.button = 0;
  t.community = hand('2d 3d 4d 5d 9c');
  t.players[0].hole = hand('As Ah'); t.players[0].totalBet = 50; t.players[0].stack = 950; t.players[0].folded = true;
  t.players[1].hole = hand('Ks Kh'); t.players[1].totalBet = 17; t.players[1].stack = 983;
  var threw = false;
  try { t._showdown(); } catch (e) { threw = true; }
  ok(!threw, 'degenerate showdown does not throw');
  ok(t.handOver, 'hand still ends after degenerate showdown');
  // Level 17: B alone eligible -> 34 uncalled. Level 50: nobody eligible -> A's 33 refunded.
  ok(t.players[0].stack === 983, 'folder refunded 33, got ' + t.players[0].stack);
  ok(t.players[1].stack === 1017, 'live player gets 34 uncalled, got ' + t.players[1].stack);
  var tot = t.players[0].stack + t.players[1].stack;
  ok(tot === 2000, 'chip conservation on refund, got ' + tot);
  var end = t.eventQueue.filter(function (e) { return e.t === 'handEnd'; })[0];
  ok(end && end.winners[1].refunded === true && end.winners[1].winners.length === 0,
    'refund recorded on handEnd');
})();

// ---------- deterministic full hand through act() (rigged deck) ----------
(function () {
  var t = new EN.PokerTable({
    players: [{ name: 'Hero', isHero: true }, { name: 'Villain' }],
    sb: 5, bb: 10, startingStack: 1000, button: 1 // rotates to 0: Hero = SB, acts first
  });
  t.players[0].stack = 100; // short stack
  ok(t.startHand(), 'heads-up hand starts');
  t.players[0].hole = hand('As Ah');
  t.players[1].hole = hand('7s 2d');
  // deck.pop() order: flop1, flop2, flop3, turn, river.
  t.deck = hand('4c 3s 9h 5d 2c'); // board runs out 2c 5d 9h | 3s | 4c
  var guard = 0;
  while (!t.handOver && guard++ < 50) {
    var i = t.acting, legal = t.legalActions(i);
    if (i === 0) t.act(i, 'raise', 100); // Hero shoves
    else if (legal.toCall > 0) t.act(i, 'call');
    else t.act(i, 'check');
  }
  ok(t.handOver, 'rigged hand finished');
  ok(t.players[0].stack === 200, 'Hero doubles to 200, got ' + t.players[0].stack);
  ok(t.players[1].stack === 900, 'Villain left with 900, got ' + t.players[1].stack);
  var end = t.eventQueue.filter(function (e) { return e.t === 'handEnd'; })[0];
  ok(end.winners.length === 1 && end.winners[0].winners.join() === '0', 'Hero wins the only pot');
})();

// ---------- equity vs a shoving range ----------
(function () {
  var t2o = hand('7s 2d'), aa = hand('As Ah');
  var rTight = EQ.estimateEquityVsRange(t2o, 2, 1500);
  var rRandom = EQ.estimateEquity(t2o, [], 1, 1500);
  ok(rTight >= 0 && rTight <= 1, 'range equity in [0,1], got ' + rTight.toFixed(3));
  ok(rTight < rRandom - 0.05,
    '72o does far worse vs a premium-only range than vs random (' +
    rTight.toFixed(3) + ' vs ' + rRandom.toFixed(3) + ')');
  var rAA = EQ.estimateEquityVsRange(aa, 3, 800);
  ok(rAA > 0.6 && rAA < 0.95, 'AA vs tier-3 shoving range sane, got ' + rAA.toFixed(3));
  // Tier 6 ("any two") must approximate equity vs random hands.
  var rAnyTwo = EQ.estimateEquityVsRange(aa, 6, 800);
  var rRandAA = EQ.estimateEquity(aa, [], 1, 800);
  ok(Math.abs(rAnyTwo - rRandAA) < 0.07,
    'tier-6 range ~= random (' + rAnyTwo.toFixed(3) + ' vs ' + rRandAA.toFixed(3) + ')');
})();

// ---------- push/fold verdicts are consistent with the displayed range equity ----------
(function () {
  function mkScn(holeStr, shover, heroBB, shoverBB) {
    return {
      heroHole: hand(holeStr), stackBB: heroBB || 10, pos: 'BTN', nPlayers: 3,
      opponents: [{}, {}], facingShove: true,
      shover: { name: shover.name, emoji: '🤖', stackBB: shoverBB || 12, pushTier: shover.pushTier },
      potBB: 1.5
    };
  }
  var rock = { name: 'The Rock', pushTier: 3 };
  var maniac = { name: 'The Maniac', pushTier: 6 };

  var r1 = PF.evaluatePushFold(mkScn('As Ah', rock), 'call');
  ok(r1.rangeEquity > r1.need + 0.15, 'AA crushes a rock shoving range');
  ok(r1.correct === true && r1.right === true, 'calling AA vs a rock shove is correct');

  var r2 = PF.evaluatePushFold(mkScn('7s 2d', rock), 'fold');
  ok(r2.rangeEquity < r2.need - 0.1, '72o crushed by a rock shoving range');
  ok(r2.correct === false && r2.right === true, 'folding 72o vs a rock shove is correct');

  // The old bug: folding 94o was marked "correct" while the displayed equity
  // beat the required equity. Now the verdict follows the RANGE equity shown.
  var r3 = PF.evaluatePushFold(mkScn('9s 4d', maniac, 10, 20), 'call');
  ok(r3.explain.indexOf('shoving range') !== -1, 'feedback explains the range-based equity');
  ok(r3.right === (r3.rangeEquity > r3.need + 0.02),
    'verdict agrees with displayed range equity vs required equity');

  // Chart branch still works for first-in spots.
  var scn2 = { heroHole: hand('As Ah'), stackBB: 10, pos: 'BTN', nPlayers: 3, opponents: [{}, {}], facingShove: false, potBB: 1.5 };
  var r4 = PF.evaluatePushFold(scn2, 'shove');
  ok(r4.right === true, 'shoving AA first-in is correct');
})();

// ---------- bots always produce legal moves (all archetypes, many tables) ----------
(function () {
  var tried = 0, illegal = 0;
  BOTS.ARCHETYPES.forEach(function (A) {
    for (var k = 0; k < 30; k++) {
      var n = 2 + Math.floor(Math.random() * 4);
      var t = new EN.PokerTable({
        players: Array.from({ length: n }, function (_, i) { return { name: 'P' + i, archetype: A }; }),
        sb: 5, bb: 10, startingStack: 1000
      });
      t.startHand();
      var guard = 0;
      while (!t.handOver && guard++ < 25) {
        var i = t.acting, legal = t.legalActions(i);
        var mv = BOTS.botDecide(t, t.players[i]);
        if (!mv) break;
        var valid;
        if (mv.a === 'fold') valid = true;
        else if (mv.a === 'check') valid = legal.canCheck;
        else if (mv.a === 'call') valid = legal.toCall > 0;
        else if (mv.a === 'bet' || mv.a === 'raise') {
          var lo = legal.canRaise ? legal.minRaiseTo : legal.minBetTo;
          valid = (legal.canRaise || legal.canBet) && mv.amount >= lo && mv.amount <= legal.maxRaiseTo;
        } else valid = false;
        if (!valid) { illegal++; console.log('ILLEGAL: ' + A.id + ' -> ' + mv.a + ' ' + mv.amount); }
        try { t.act(i, mv.a, mv.amount); tried++; }
        catch (e) { illegal++; console.log('THROW: ' + A.id + ' ' + mv.a + ' ' + e.message); break; }
      }
    }
  });
  console.log('bot validity: ' + tried + ' bot decisions, ' + illegal + ' illegal');
  ok(illegal === 0, 'no illegal bot moves across all archetypes');
  ok(tried > 500, 'enough bot decisions sampled (' + tried + ')');
})();

// ---------- new archetypes: Rohan / Amogh / Nathan behavior ----------
(function () {
  function mkTable(id, n) {
    var A = BOTS.getArchetype(id);
    var t = new EN.PokerTable({
      players: Array.from({ length: n || 6 }, function (_, i) { return { name: 'P' + i, archetype: A }; }),
      sb: 5, bb: 10, startingStack: 1000
    });
    t.startHand();
    return t;
  }
  function playThrough(t, maxSteps) {
    var guard = 0;
    while (!t.handOver && guard++ < (maxSteps || 40)) {
      var i = t.acting, mv = BOTS.botDecide(t, t.players[i]);
      if (!mv) break;
      t.act(i, mv.a, mv.amount);
    }
  }

  // (a) Rohan never takes an aggressive action on any street.
  var rAggro = 0, rTried = 0;
  for (var k = 0; k < 40; k++) {
    var t = mkTable('rohan');
    var g = 0;
    while (!t.handOver && g++ < 40) {
      var i = t.acting, mv = BOTS.botDecide(t, t.players[i]);
      if (!mv) break;
      rTried++;
      if (mv.a === 'bet' || mv.a === 'raise') rAggro++;
      t.act(i, mv.a, mv.amount);
    }
  }
  ok(rTried > 200, 'rohan decisions sampled (' + rTried + ')');
  ok(rAggro === 0, 'Rohan never bets or raises (' + rAggro + ' aggressive of ' + rTried + ')');

  // (b1) Amogh shoves tier-1 monsters (QQ+/AKs) preflop relentlessly.
  var shoves = 0, spots = 0;
  for (var k2 = 0; k2 < 80; k2++) {
    var t2 = mkTable('amogh');
    var i2 = t2.acting;
    t2.players[i2].hole = hand('As Ah'); // rig the monster
    var legal2 = t2.legalActions(i2);
    if (t2.currentBet === t2.bb && legal2.canRaise) { // first-in spot
      var mv2 = BOTS.botDecide(t2, t2.players[i2]);
      spots++;
      if (mv2 && mv2.a === 'raise' && mv2.amount >= legal2.maxRaiseTo * 0.97) shoves++;
    }
  }
  ok(spots > 40, 'amogh monster spots sampled (' + spots + ')');
  ok(shoves / spots > 0.5, 'Amogh shoves QQ+/AKs preflop relentlessly (' + shoves + '/' + spots + ')');

  // (b2) Amogh's postflop sizing: whenever he bets with no one to call, it's
  // an overbet (1.5x+ pot) or an all-in bomb. Tested directly against
  // amoghPostflop with stubbed table/legal — the function only reads
  // table.currentBet and the legal bounds, so no full table is needed.
  var over = 0, bets = 0, bombs = 0;
  for (var k3 = 0; k3 < 60; k3++) {
    var fakeLegal = { toCall: 0, canCheck: true, canBet: true, canRaise: false,
                      minBetTo: 10, maxRaiseTo: 990 };
    var Aam = BOTS.getArchetype('amogh');
    var mvb = BOTS.amoghPostflop({ currentBet: 0 }, {}, Aam, fakeLegal,
                                 0, 100, 0.65, 0.55, 'flop', 2);
    if (mvb && (mvb.a === 'bet' || mvb.a === 'raise')) {
      bets++;
      if (mvb.amount >= 140 || mvb.amount >= 990 * 0.97) over++;
    }
    var mvm = BOTS.amoghPostflop({ currentBet: 0 }, {}, Aam, fakeLegal,
                                 0, 100, 0.9, 0.9, 'turn', 2);
    if (mvm && mvm.amount >= 990 * 0.97) bombs++;
  }
  ok(bets > 30, 'amogh postflop bets sampled (' + bets + ')');
  ok(over / bets > 0.9, 'Amogh overbets or bombs when he bets (' + over + '/' + bets + ')');
  ok(bombs > 10, 'Amogh bombs all-in with monsters (' + bombs + '/60)');

  // (c1) Nathan never bets/raises before the river.
  var nAggro = 0, nTried = 0;
  for (var k4 = 0; k4 < 40; k4++) {
    var t4 = mkTable('nathan');
    var g4 = 0;
    while (!t4.handOver && g4++ < 40) {
      if (t4.street === 'river') break; // the trap may spring on the river
      var i4 = t4.acting, mv4 = BOTS.botDecide(t4, t4.players[i4]);
      if (!mv4) break;
      nTried++;
      if (mv4.a === 'bet' || mv4.a === 'raise') nAggro++;
      t4.act(i4, mv4.a, mv4.amount);
    }
  }
  ok(nTried > 100, 'nathan pre-river decisions sampled (' + nTried + ')');
  ok(nAggro === 0, 'Nathan never bets/raises before the river (' + nAggro + ')');

  // (c2) Nathan springs the trap on the river with the nuts.
  var trapBets = 0, trapSpots = 0;
  for (var k5 = 0; k5 < 200; k5++) {
    var t5 = mkTable('nathan');
    var g5 = 0;
    while (!t5.handOver && g5++ < 40) {
      var i5 = t5.acting, p5 = t5.players[i5];
      if (t5.street === 'river') {
        var legal5 = t5.legalActions(i5);
        if (legal5.toCall === 0 && EQ.madeStrength(p5.hole, t5.community) > 0.78) {
          var mv5 = BOTS.botDecide(t5, p5);
          trapSpots++;
          if (mv5 && (mv5.a === 'bet' || mv5.a === 'raise')) trapBets++;
        }
      }
      var mv6 = BOTS.botDecide(t5, p5);
      if (!mv6) break;
      t5.act(i5, mv6.a, mv6.amount);
    }
  }
  ok(trapSpots > 10, 'nathan river-nut spots sampled (' + trapSpots + ')');
  ok(trapBets / trapSpots > 0.4, 'Nathan bets the river with the nuts (' + trapBets + '/' + trapSpots + ')');
})();

// ---------- stats: recordHand / derivedStats ----------
(function () {
  var s = ST.blankStats();
  ok(s.hands === 0 && (s.leaks || []).length === 0, 'blank stats shape');
  var ctx = {
    mode: 'cash', bb: 10, heroHole: hand('As Ah'), community: [], profitChips: 150,
    wonHand: true, vpip: true, pfr: true, postBet: 2, postCall: 1,
    opponents: [{ id: 'rock', name: 'The Rock', emoji: '🪨' }],
    heroStackBB: 115, potBB: 30, resultText: 'Pair of Aces'
  };
  // recordHand hits localStorage; stub it in Node.
  var mem = {};
  global.localStorage = {
    getItem: function (k) { return mem[k] || null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
  ST.recordHand(ctx);
  var s2 = ST.loadStats();
  ok(s2.hands === 1 && s2.won === 1, 'hand recorded');
  ok(s2.perArchetype.rock && s2.perArchetype.rock.hands === 1, 'per-archetype record kept');
  ok(Math.abs(s2.profitBB - 15) < 1e-9, 'profit tracked in bb');
  var d = ST.derivedStats(s2);
  ok(d.bbPer100 === 1500, 'bb/100 math');
  ok(ST.blankStats().hands === 0, 'blankStats unaffected');
  delete global.localStorage;
})();

// ---------- replay.js: capture, storage, state machine ----------
(function () {
  // --- hand 1: preflop shove, hero doubles ---
  // Events are fed to the recorder in emission order, exactly like app.js does.
  var t1 = new EN.PokerTable({
    players: [{ name: 'Hero', isHero: true }, { name: 'Villain' }],
    sb: 5, bb: 10, startingStack: 1000, button: 1
  });
  t1.players[0].stack = 100;
  var ev1 = [];
  t1.onEvent = function (e) { ev1.push(e); };
  ok(t1.startHand(), 'replay hand 1 starts');
  t1.players[0].hole = hand('As Ah');
  t1.players[1].hole = hand('7s 2d');
  t1.deck = hand('4c 3s 9h 5d 2c');
  var s0 = t1.players[0].stack; // 95 after posting SB
  var rec1 = RP.startHandRecord(t1, ev1[0], 'cash');
  ok(rec1.players[0].stack === 100 && rec1.players[1].stack === 1000, 'starting stacks recorded pre-blind');
  ok(JSON.stringify(rec1.heroHole) === JSON.stringify(hand('As Ah')), 'hero hole cards captured');
  var g1 = 0;
  while (!t1.handOver && g1++ < 50) {
    var i1 = t1.acting, lg1 = t1.legalActions(i1);
    if (i1 === 0) t1.act(i1, 'raise', 100);
    else if (lg1.toCall > 0) t1.act(i1, 'call');
    else t1.act(i1, 'check');
  }
  ev1.forEach(function (e) {
    if (e.t === 'actionTaken') RP.recordHandAction(rec1, t1, e);
    else if (e.t === 'street') RP.recordHandStreet(rec1, t1, e);
    else if (e.t === 'handEnd') RP.finishHandRecord(rec1, t1, e, t1.players[0].stack - s0);
  });
  var acts1 = rec1.timeline.filter(function (f) { return f.t === 'action'; });
  // Villain is deep-stacked, so the board runs out after the all-in: the
  // engine deals flop/turn/river with villain checking each street.
  ok(rec1.timeline.length === 11, 'timeline: blinds + raise + call + 3 streets + end, got ' + rec1.timeline.length);
  ok(acts1.map(function (a) { return a.action; }).join() === 'sb,bb,raise,call,check,check,check',
    'action sequence, got ' + acts1.map(function (a) { return a.action; }).join());
  ok(acts1.map(function (a) { return a.pot; }).join() === '5,15,110,200,200,200,200',
    'pot evolution, got ' + acts1.map(function (a) { return a.pot; }).join());
  ok(acts1.slice(0, 4).every(function (a) { return a.street === 'preflop'; }) &&
    acts1[4].street === 'flop' && acts1[5].street === 'turn' && acts1[6].street === 'river',
    'actions tagged with their street');
  var streets1 = ev1.filter(function (e) { return e.t === 'actionTaken'; }).map(function (e) { return e.street; });
  ok(streets1.join() === 'preflop,preflop,flop,turn,river',
    'engine actionTaken events carry street, got ' + streets1.join());
  var end1 = rec1.timeline[rec1.timeline.length - 1];
  ok(end1.t === 'end' && end1.winners[0].names.join() === 'You' && end1.pot === 200, 'end frame: hero wins 200');
  ok(rec1.heroNet === 105 && rec1.heroNetBB === 10.5, 'hero net +105 chips (+10.5 bb), got ' + rec1.heroNet);
  ok(rec1.result.indexOf('You win 200') === 0, 'result one-liner, got "' + rec1.result + '"');

  // state machine on the shove hand
  var st = RP.replayState(rec1, 0);
  ok(st.street === 'preflop' && st.community.length === 0 && st.actions.length === 0 && st.pot === 0 && !st.done,
    'frame 0: empty preflop');
  st = RP.replayState(rec1, 2);
  ok(st.actions.length === 2 && st.pot === 15, 'frame 2: blinds posted, pot 15');
  st = RP.replayState(rec1, 4);
  ok(st.actions.length === 4 && st.pot === 200 && !st.done, 'frame 4: all preflop actions, pot 200, not done');
  st = RP.replayState(rec1, 11);
  ok(st.done && st.winners && st.winners[0].names[0] === 'You', 'final frame: done with winners');
  st = RP.replayState(rec1, 10);
  ok(!st.done && st.winners === null, 'stepping back clears winners');
  ok(RP.replayState(rec1, 999).idx === 11 && RP.replayState(rec1, -3).idx === 0, 'frame index clamped');
  ok(RP.frameIndexForStreet(rec1, 'preflop') === 0, 'preflop jump = 0');
  ok(RP.frameIndexForStreet(rec1, 'flop') === 5, 'flop jump lands after street frame');

  // --- hand 2: multi-street, checks all the way ---
  var t2 = new EN.PokerTable({
    players: [{ name: 'Hero', isHero: true }, { name: 'A' }, { name: 'B' }],
    sb: 5, bb: 10, startingStack: 1000, button: 0 // rotates to 1; SB=2, BB=0(hero)
  });
  var ev2 = [];
  t2.onEvent = function (e) { ev2.push(e); };
  ok(t2.startHand(), 'replay hand 2 starts');
  t2.players[0].hole = hand('As Ks');
  t2.players[1].hole = hand('7h 2d');
  t2.players[2].hole = hand('9c 8c');
  t2.deck = hand('4c 3s 9h 5d 2c'); // board: 2c 5d 9h | 3s | 4c
  var s20 = t2.players[0].stack;
  var rec2 = RP.startHandRecord(t2, ev2[0], 'tourney');
  var g2 = 0;
  while (!t2.handOver && g2++ < 80) {
    var i2 = t2.acting, lg2 = t2.legalActions(i2);
    if (lg2.toCall > 0) t2.act(i2, 'call');
    else t2.act(i2, 'check');
  }
  ok(t2.handOver, 'multi-street hand finished');
  ev2.forEach(function (e) {
    if (e.t === 'actionTaken') RP.recordHandAction(rec2, t2, e);
    else if (e.t === 'street') RP.recordHandStreet(rec2, t2, e);
    else if (e.t === 'handEnd') RP.finishHandRecord(rec2, t2, e, t2.players[0].stack - s20);
  });
  var streets = rec2.timeline.filter(function (f) { return f.t === 'street'; });
  ok(streets.map(function (f) { return f.street; }).join() === 'flop,turn,river', 'street frames in order');
  ok(streets[0].community.length === 3 && streets[1].community.length === 4 && streets[2].community.length === 5,
    'community grows 3/4/5');
  ok(JSON.stringify(streets[0].community) === JSON.stringify(hand('2c 5d 9h')), 'flop cards exact');
  var preActs = rec2.timeline.slice(0, 5).filter(function (f) { return f.t === 'action'; });
  ok(preActs.length === 5 && preActs.every(function (a) { return a.street === 'preflop'; }),
    'first 5 timeline entries are preflop actions (sb,bb,call,call,check)');
  var pots = rec2.timeline.map(function (f) { return f.pot; });
  ok(pots.every(function (p, i) { return i === 0 || p >= pots[i - 1]; }), 'pot never decreases along timeline');
  ok(RP.frameIndexForStreet(rec2, 'flop') === 6, 'flop jump lands after street frame');
  ok(RP.frameIndexForStreet(rec2, 'river') === 14, 'river jump index');
  var rs = RP.replayState(rec2, 6);
  ok(rs.street === 'flop' && rs.community.length === 3 && rs.pot === 30, 'frame 6: flop, pot 30');
  rs = RP.replayState(rec2, 5);
  ok(rs.street === 'preflop' && rs.community.length === 0, 'frame 5: still preflop');
  var rend = RP.replayState(rec2, rec2.timeline.length);
  ok(rend.done && rend.winners.length === 1 && rend.winners[0].names[0] === 'You',
    'hero wins with the wheel (A-2-3-4-5)');
  ok(rec2.result.indexOf('You win 30 (Straight, Five high)') === 0,
    'result one-liner, got "' + rec2.result + '"');
  var rback = RP.replayState(rec2, rec2.timeline.length - 1);
  ok(!rback.done && rback.winners === null, 'step back from end clears winners');

  // --- hand 3: antes are synthesized in engine order ---
  var t3 = new EN.PokerTable({
    players: [{ name: 'Hero', isHero: true }, { name: 'V' }],
    sb: 5, bb: 10, ante: 10, startingStack: 1000, button: 1
  });
  var ev3 = [];
  t3.onEvent = function (e) { ev3.push(e); };
  t3.startHand();
  var rec3 = RP.startHandRecord(t3, ev3[0], 'tourney');
  var syn = rec3.timeline.slice(0, 4);
  ok(syn.map(function (a) { return a.action; }).join() === 'ante,ante,sb,bb', 'synth order ante,ante,sb,bb');
  ok(syn.map(function (a) { return a.pot; }).join() === '10,20,25,35', 'synth pots 10,20,25,35');

  // --- storage: cap 50, newest first, clear ---
  var mem = {};
  global.localStorage = {
    getItem: function (k) { return mem[k] || null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
  for (var i = 0; i < 55; i++) RP.saveHandRecord({ id: 'r' + i, handNo: i, timeline: [] });
  var list = RP.loadHandRecords();
  ok(list.length === 50, 'storage capped at 50, got ' + list.length);
  ok(list[0].id === 'r54' && list[49].id === 'r5', 'newest first, oldest dropped');
  ok(JSON.parse(mem[RP.HANDS_KEY]).length === 50, 'stored under ' + RP.HANDS_KEY);
  RP.clearHandRecords();
  ok(RP.loadHandRecords().length === 0, 'clearHandRecords empties storage');
  delete global.localStorage;
})();

// ---------- browser global scope: no var/class collisions ----------
// Regression guard for the Online-tab incident (docs/INCIDENTS.md): a hoisted
// `var X` in one script colliding with `class X` in another is a SyntaxError
// in browsers (scripts share one global lexical scope) but invisible to Node
// module tests, where each file gets its own scope. Concatenate index.html's
// scripts in page order and parse as a single classic script — any collision
// fails the parse. (Catches the bug class, not just the instance.)
(function () {
  var vm = require('vm');
  var fs = require('fs');
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var files = [];
  var re = /<script src="([^"]+)"><\/script>/g, m;
  while ((m = re.exec(html))) files.push(m[1]);
  ok(files.length >= 10, 'found page scripts in index.html (' + files.length + ')');
  var combined = files.map(function (f) {
    return fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  }).join('\n;\n');
  var failed = null;
  try { new vm.Script(combined, { filename: 'browser-bundle.js' }); }
  catch (e) { failed = e.message; }
  ok(!failed, 'page scripts parse as one global scope' + (failed ? ': ' + failed : ''));
})();

// ---------------- NamePrefs (username + bot renames) ----------------
(function () {
  var NP = js('names.js').NamePrefs;
  var mem = {};
  global.localStorage = {
    getItem: function (k) { return mem[k] || null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
  NP.resetAll();

  // username
  ok(NP.getUsername() === '', 'username defaults to empty');
  ok(NP.heroName() === 'You', 'hero seat falls back to You');
  NP.setUsername('  Kevin  ');
  ok(NP.getUsername() === 'Kevin', 'username trimmed');
  ok(NP.heroName() === 'Kevin', 'heroName uses the username');
  NP.setUsername('x'.repeat(50));
  ok(NP.getUsername().length === NP.MAX_LEN, 'username capped at MAX_LEN');
  NP.setUsername('');
  ok(NP.heroName() === 'You', 'clearing username restores You');

  // bot renames (keyed by archetype id; archetype objects never mutated)
  var B = js('bots.js');
  var shark = B.ARCHETYPES.filter(function (a) { return a.id === 'shark'; })[0];
  ok(NP.displayName(shark) === shark.name, 'display name defaults to archetype name');
  NP.setBotOverride('shark', 'Nemo');
  ok(NP.displayName(shark) === 'Nemo', 'custom rename applies');
  ok(shark.name !== 'Nemo', 'archetype object not mutated');
  ok(NP.getBotOverrides().shark === 'Nemo', 'override persisted');
  NP.setBotOverride('shark', '   ');
  ok(NP.displayName(shark) === shark.name, 'empty rename resets to default');
  ok(!('shark' in NP.getBotOverrides()), 'reset removes the override key');
  NP.setBotOverride('rohan', 'y'.repeat(40));
  ok(NP.displayName({ id: 'rohan', name: 'Rohan' }) === 'y'.repeat(NP.MAX_LEN), 'bot rename capped at MAX_LEN');
  NP.clearBotOverride('rohan');
  ok(NP.displayName({ id: 'rohan', name: 'Rohan' }) === 'Rohan', 'clearBotOverride resets');

  // corrupted storage degrades gracefully
  mem['ps_bot_names_v1'] = 'not-json{{{';
  ok(NP.displayName(shark) === shark.name, 'corrupt override JSON falls back to default');
  delete global.localStorage;
  NP.resetAll(); // memory fallback still works without localStorage
  NP.setUsername('Zed');
  ok(NP.getUsername() === 'Zed', 'in-memory fallback works when localStorage is absent');
  NP.resetAll();
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
