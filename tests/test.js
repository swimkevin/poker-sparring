// Headless tests: node tests/test.js
var path = require('path');
var js = function (f) { return require(path.join(__dirname, '..', 'js', f)); };
var C = js('cards.js'), E = js('evaluator.js'), EQ = js('equity.js'), EN = js('engine.js');
var BOTS = js('bots.js'), PF = js('pushfold.js'), ST = js('stats.js');

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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
