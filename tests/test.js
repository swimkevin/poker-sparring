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

// ---------- SPR + commitment (coach) ----------
(function () {
  ok(EQ.spr(200, 100) === 2, 'spr = effStack/pot');
  ok(EQ.spr(200, 0) === 99, 'spr guards zero pot');
  ok(EQ.sprVerdict(2, 'toppair') === 'commit', 'top pair commits at SPR 2');
  ok(EQ.sprVerdict(12, 'toppair') === 'pot-control', 'top pair pot-controls deep');
  ok(EQ.sprVerdict(2, 'overpair') === 'commit', 'overpair commits at SPR 2');
  ok(EQ.sprVerdict(10, 'overpair') === 'pot-control', 'overpair cautious deep');
  ok(EQ.sprVerdict(1, 'nut') === 'commit', 'nuts always commit shallow');
  ok(EQ.sprVerdict(10, 'draw') === 'implied', 'draws want implied odds deep');
  ok(EQ.sprVerdict(2, 'draw-strong') === 'commit', 'monster draw commits shallow');
  ok(EQ.sprVerdict(4, 'secondpair') === 'pot-control', 'second pair never commits deep');

  // Implied odds: credit only deep + drawing/speculative.
  ok(EQ.impliedCredit({ draw: true, effStackBB: 50, villainStubborn: 0.8, inPosition: true }) > 0.1,
    'deep + station + IP gives real implied credit');
  ok(EQ.impliedCredit({ draw: true, effStackBB: 8, villainStubborn: 0.9, inPosition: true }) === 0,
    'no implied credit short-stacked');
  ok(EQ.impliedCredit({ draw: false, smallPair: false, effStackBB: 50, villainStubborn: 0.9 }) === 0,
    'no credit without a draw or pair');
  ok(EQ.impliedCredit({ draw: true, effStackBB: 50, villainStubborn: 0.8, inPosition: true }) <= 0.15,
    'implied credit capped at 0.15');

  // Reverse implied odds: debit for non-nut draws vs tight/multiway.
  ok(EQ.rioPenalty({ nutDraw: true, villainTight: 0.9, multiway: true }) === 0,
    'nut draws take no RIO penalty');
  ok(EQ.rioPenalty({ nutDraw: false, villainTight: 0.9, multiway: false }) >= 0.06,
    'non-nut draw vs tight range penalized');
  ok(EQ.rioPenalty({ nutDraw: false, villainTight: 0.9, multiway: true }) <= 0.10,
    'RIO penalty capped at 0.10');
  ok(EQ.rioPenalty({ nutDraw: false, villainTight: 0.2, multiway: false }) === 0,
    'no RIO penalty vs loose heads-up');
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
  try { t.act(0, 'fold'); } catch { threw = true; }
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
  try { t2.act(0, 'call'); } catch { threw = true; }
  var guard = 0;
  try { while (!t2.handOver && guard++ < 50) { t2.act(t2.acting, 'check'); } }
  catch { threw = true; }
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
  try { t._showdown(); } catch { threw = true; }
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

// ---------- push/fold: no duplicate opponents in generated scenarios ----------
(function () {
  // Regression: scenarios once showed the same bot twice (swimkev x2).
  var seenDup = false, poolRespected = true;
  for (var i = 0; i < 60; i++) {
    var scn = PF.newPushFoldScenario();
    var ids = scn.opponents.map(function (o) { return o.id; });
    if (new Set(ids).size !== ids.length) seenDup = true;
  }
  ok(!seenDup, '60 scenarios, no duplicate opponent in any');
  // Caller-supplied pool (roster selection) is honored when big enough.
  var pool = [
    { id: 'a', name: 'A', emoji: '🙂', pushTier: 3 },
    { id: 'b', name: 'B', emoji: '🚀', pushTier: 3 },
    { id: 'c', name: 'C', emoji: '🐢', pushTier: 3 }
  ];
  for (var j = 0; j < 30; j++) {
    var s2 = PF.newPushFoldScenario(pool);
    s2.opponents.forEach(function (o) {
      if (pool.map(function (p) { return p.id; }).indexOf(o.id) === -1) poolRespected = false;
    });
    var ids2 = s2.opponents.map(function (o) { return o.id; });
    if (new Set(ids2).size !== ids2.length) seenDup = true;
  }
  ok(poolRespected, 'scenario opponents come from the roster pool');
  ok(!seenDup, 'no duplicates with a custom pool either');
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

  // (b1) Amogh bombs tier-1 monsters (QQ+/AKs) preflop: shoves relentlessly
  // when facing a raise, and always raises (shove or big open) first-in.
  var shovesFirst = 0, spotsFirst = 0, raisesFirst = 0;
  for (var k2 = 0; k2 < 80; k2++) {
    var t2 = mkTable('amogh');
    var i2 = t2.acting;
    t2.players[i2].hole = hand('As Ah'); // rig the monster
    var legal2 = t2.legalActions(i2);
    if (t2.currentBet === t2.bb && legal2.canRaise) { // first-in spot
      var mv2 = BOTS.botDecide(t2, t2.players[i2]);
      spotsFirst++;
      if (mv2 && mv2.a === 'raise' && mv2.amount >= legal2.maxRaiseTo * 0.97) shovesFirst++;
      else if (mv2 && mv2.a === 'raise') raisesFirst++;
    }
  }
  ok(spotsFirst > 40, 'amogh monster spots sampled (' + spotsFirst + ')');
  ok(shovesFirst + raisesFirst === spotsFirst, 'Amogh always raises QQ+ first-in, never flats/folds');
  // Facing an open: shove rate should be relentless.
  var shovesVs = 0, spotsVs = 0;
  for (var k3 = 0; k3 < 60; k3++) {
    var t3 = new EN.PokerTable({
      players: [
        { name: 'You', isHero: true },
        { name: 'Amogh', archetype: BOTS.getArchetype('amogh') },
        { name: 'Z', archetype: BOTS.getArchetype('shark') }
      ], sb: 5, bb: 10, startingStack: 1000
    });
    t3.startHand();
    if (t3.acting !== 0 || t3.currentBet !== 10) { k3--; continue; }
    t3.act(0, 'raise', 30);
    if (t3.acting !== 1) { k3--; continue; }
    t3.players[1].hole = hand('As Ah');
    var legal3 = t3.legalActions(1);
    var mv3 = BOTS.botDecide(t3, t3.players[1]);
    spotsVs++;
    if (mv3 && mv3.a === 'raise' && mv3.amount >= legal3.maxRaiseTo * 0.97) shovesVs++;
  }
  ok(shovesVs / spotsVs > 0.5, 'Amogh shoves QQ+/AKs vs an open relentlessly (' + shovesVs + '/' + spotsVs + ')');

  // (b2) Amogh's postflop sizing: whenever he bets with no one to call, it's
  // an overbet (1.5x+ pot) or an all-in bomb. Tested directly against
  // amoghPostflop with stubbed table/legal — the function only reads
  // table.currentBet and the legal bounds, so no full table is needed.
  var over = 0, bets = 0, bombs = 0;
  for (var k4 = 0; k4 < 60; k4++) {
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
  for (var k5 = 0; k5 < 40; k5++) {
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
  for (var k6 = 0; k6 < 200; k6++) {
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

// ---------- stats: recordHand suit mapping (daily QA 2026-10-08) ----------
// Regression: the suit-letter string was ' sdhc' (hearts/diamonds transposed),
// so Stats → Recent hands showed every heart as a diamond and vice versa.
(function () {
  var mem = {};
  global.localStorage = {
    getItem: function (k) { return mem[k] || null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
  function holeOf(str) {
    var ctx = {
      mode: 'cash', bb: 10, heroHole: hand(str), community: [], profitChips: 0,
      wonHand: false, vpip: false, pfr: false, postBet: 0, postCall: 0,
      opponents: [], heroStackBB: 100, potBB: 3, resultText: 'Lost'
    };
    ST.recordHand(ctx);
    return ST.loadStats().history[0].hole.join(' ');
  }
  ok(holeOf('Qs Qd') === 'Qs Qd', 'spades->s, diamonds->d (was Qs Qh)');
  ok(holeOf('Th 8h') === 'Th 8h', 'hearts->h (was 8d Td)');
  ok(holeOf('Ac Kc') === 'Ac Kc', 'clubs->c');
  ok(holeOf('2s 3h') === '2s 3h', 'mixed suits map correctly');
  delete global.localStorage;
})();

// ---------- stats: sessionProfitBB regression (header stat units bug) ----------
(function () {
  // Regression: the header once computed (heroChips - startBB) / bb, mixing
  // chips and big blinds — a 10-chip (1 bb) win displayed as +91 bb.
  ok(ST.sessionProfitBB(1010, 100, 10) === 1, '1 bb win reads +1 bb');
  ok(ST.sessionProfitBB(950, 100, 10) === -5, '5 bb loss reads -5 bb');
  ok(ST.sessionProfitBB(1000, 100, 10) === 0, 'breakeven reads 0');
  ok(ST.sessionProfitBB(3000, 100, 20) === 50, 'works at other blind levels');
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
    // Strip the ?v= cache-buster: it is a URL query, not part of the filename.
    return fs.readFileSync(path.join(__dirname, '..', f.split('?')[0]), 'utf8');
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

// ---------- seat geometry (regression: seats clipped by .felt{overflow:hidden}) ----------
(function () {
  // Minimal DOM stubs: ui.js only touches document/window inside functions;
  // seatPos reads window.innerWidth at call time.
  if (typeof document === 'undefined') {
    global.document = {
      getElementById: function () { return null; },
      querySelectorAll: function () { return []; },
      createElement: function () { return { style: {}, dataset: {}, classList: { add: function () {}, toggle: function () {} } }; }
    };
  }
  if (typeof window === 'undefined') global.window = { innerWidth: 1280, scrollTo: function () {} };
  var UI = js('ui.js');

  // Seats are absolutely positioned with translate(-50%,-50%) and the felt has
  // overflow:hidden, so every seat rect must sit fully inside the felt.
  // Geometries mirror css/style.css: desktop felt 460px tall, phone felt 440px.
  function checkSeats(viewportW, feltW, feltH, seatW, seatH, tag) {
    global.window.innerWidth = viewportW;
    for (var n = 2; n <= 9; n++) {
      for (var i = 0; i < n; i++) {
        var p = UI.seatPos(i, n);
        var cx = p.x / 100 * feltW, cy = p.y / 100 * feltH;
        ok(cx - seatW / 2 >= 0, tag + ': seat ' + i + '/' + n + ' left edge inside');
        ok(cx + seatW / 2 <= feltW, tag + ': seat ' + i + '/' + n + ' right edge inside');
        ok(cy - seatH / 2 >= 0, tag + ': seat ' + i + '/' + n + ' top edge inside');
        ok(cy + seatH / 2 <= feltH, tag + ': seat ' + i + '/' + n + ' bottom edge inside');
      }
    }
  }
  checkSeats(1280, 1100, 520, 100, 90, 'desktop');
  checkSeats(390, 358, 440, 84, 112, 'phone');
})();



// ---------- coach theory helpers (equity.js) ----------
(function () {
  var E = require('../js/equity.js');
  // Bluff break-even: bet/(bet+pot).
  ok(Math.abs(E.bluffBE(50, 100) - 1 / 3) < 1e-9, 'half-pot bluff needs 33% folds');
  ok(Math.abs(E.bluffBE(100, 300) - 0.25) < 1e-9, 'third-pot bluff needs 25% folds');
  ok(Math.abs(E.bluffBE(100, 100) - 0.5) < 1e-9, 'pot bluff needs 50% folds');
  // Villain foldiness from stubbornness.
  ok(Math.abs(E.villainFoldy({ stubborn: 0.9 }) - 0.1) < 1e-9, 'stubborn 0.9 rarely folds to pressure');
  ok(E.villainFoldy({ stubborn: 0.2 }) === 0.8, 'rock folds a lot');
  ok(E.villainFoldy(null) === 0.5, 'unknown villain defaults to 0.5');
  // Exploit lines: every built-in bot has one, customs get a slider read.
  var B = require('../js/bots.js');
  B.ARCHETYPES.forEach(function (a) {
    ok(typeof E.exploitLine(a) === 'string' && E.exploitLine(a).length > 10,
      'exploit line for ' + a.id);
  });
  ok(/never bluff/.test(E.exploitLine({ id: 'station' })), 'station line says never bluff');
  ok(/trap/.test(E.exploitLine({ id: 'maniac' })), 'maniac line says trap');
  ok(/steal/.test(E.exploitLine({ id: 'rock' })), 'rock line says steal');
  ok(/bluff target/.test(E.exploitLine({ id: 'custom-1', stubborn: 0.2, bluff: 0.1 })),
    'foldy custom is a bluff target');
  ok(/value bet/.test(E.exploitLine({ id: 'custom-2', stubborn: 0.9, bluff: 0.1 })),
    'sticky custom gets value-bet line');
  ok(/call down lighter/.test(E.exploitLine({ id: 'custom-3', stubborn: 0.5, bluff: 0.8 })),
    'bluffy custom gets trap line');
})();




// ---------- bot realism: tilt, rebuys, tournament archetypes ----------
(function () {
  var B = require('../js/bots.js');
  // effectiveArchetype: no tilt => same object back.
  var shark = B.getArchetype('shark');
  ok(B.effectiveArchetype(shark, 0) === shark, 'zero tilt returns archetype unchanged');
  ok(B.effectiveArchetype(shark, undefined) === shark, 'undefined tilt returns archetype unchanged');
  // Tilt loosens everything and never mutates the base.
  var tilted = B.effectiveArchetype(shark, 1);
  ok(tilted !== shark, 'tilted copy is a new object');
  ok(tilted.openTier > shark.openTier, 'tilt opens more hands');
  ok(tilted.aggression > shark.aggression, 'tilt raises aggression');
  ok(tilted.bluff > shark.bluff, 'tilt bluffs more');
  ok(tilted.stubborn > shark.stubborn, 'tilt calls down lighter');
  ok(shark.openTier === 4 && shark.aggression === 0.70, 'base archetype not mutated');
  ok(tilted.aggression <= 1 && tilted.stubborn <= 1 && tilted.openTier <= 6, 'tilt params clamped');
  var half = B.effectiveArchetype(shark, 0.5);
  ok(half.aggression > shark.aggression && half.aggression < tilted.aggression, 'tilt scales monotonically');
  // Every archetype carries tilt/rebuy traits.
  B.ARCHETYPES.forEach(function (a) {
    ok(typeof a.tiltProne === 'number' && a.tiltProne >= 0 && a.tiltProne <= 1,
      a.id + ' has tiltProne');
    ok(typeof a.rebuy === 'number' && a.rebuy >= 0 && a.rebuy <= 1,
      a.id + ' has rebuy tendency');
  });
  ok(B.getArchetype('maniac').tiltProne > B.getArchetype('rock').tiltProne, 'maniac tilts harder than rock');
  // Tournament archetypes.
  var grinder = B.getArchetype('grinder'), bubble = B.getArchetype('bubble');
  ok(grinder && grinder.openTier <= 3, 'grinder is tight preflop (a touch looser since v1.8.45)');
  ok(grinder.threeBetTier <= 2, 'grinder 3-bets aggressively');
  ok(grinder.pushTier >= 5, 'grinder shoves short stacks');
  ok(bubble && bubble.openTier <= 2, 'bubble boy barely plays (a touch looser since v1.8.45)');
  ok(bubble.rebuy < 0.3, 'bubble boy rarely rebuys');
  // Custom bots get calibration fields.
  var c = B.customArchetype({ looseness: 40, aggression: 50, bluff: 20, stubborn: 50, tiltProne: 80, rebuy: 30 });
  ok(c.tiltProne === 0.8 && c.rebuy === 0.3, 'custom tilt/rebuy sliders stored');
  var c2 = B.customArchetype({ looseness: 40, aggression: 50, bluff: 20, stubborn: 50 });
  ok(c2.tiltProne === 0.5 && c2.rebuy === 0.7, 'custom tilt/rebuy default when unset');
})();

(function () {
  // B8 regression: bots must not over-fold to good prices.
  function mkTable(players) {
    return new EN.PokerTable({ players: players, sb: 5, bb: 10, startingStack: 1000, onEvent: function () {} });
  }
  // Maniac SB heads-up with Q3o (tier 6): completing 5 to win 15 is mandatory.
  var folds = 0, N = 30;
  for (var i = 0; i < N; i++) {
    var t = mkTable([{ name: 'You', isHero: true }, { name: 'Amogh', archetype: BOTS.getArchetype('amogh') }]);
    t.button = 0; // startHand rotates to 1: Amogh = button = SB heads-up
    t.startHand();
    if (t.sbIdx !== 1) { i--; continue; } // safety: only test Amogh as SB
    t.players[1].hole = [{ r: 12, s: 1 }, { r: 3, s: 3 }];
    var mv = BOTS.botDecide(t, t.players[1]);
    if (mv && mv.a === 'fold') folds++;
  }
  ok(folds === 0, 'maniac never folds SB heads-up getting 3:1 (folded ' + folds + '/' + N + ')');
  // Min-raise defense: 9Ts (tier 3) in BB vs a 20-chip open should usually continue.
  var folds2 = 0;
  for (var j = 0; j < N; j++) {
    var t2 = mkTable([
      { name: 'You', isHero: true },
      { name: 'Station', archetype: BOTS.getArchetype('station') },
      { name: 'Rock', archetype: BOTS.getArchetype('rock') }
    ]);
    t2.startHand();
    t2.act(0, 'raise', 20); // hero min-opens
    // Find a bot facing the open and give it 9Ts.
    var bi = t2.acting;
    t2.players[bi].hole = [{ r: 9, s: 0 }, { r: 10, s: 0 }];
    var mv2 = BOTS.botDecide(t2, t2.players[bi]);
    if (mv2 && mv2.a === 'fold') folds2++;
  }
  ok(folds2 < N / 2, 'bots defend vs min-raises (folded ' + folds2 + '/' + N + ' with 9Ts)');
})();


(function () {
  // B9: Premiums never fold preflop. Tier 1 in this codebase is QQ+ pairs and
  // AKs (AKo is tier 2 — see holeTier). Vs a single open they 3-bet or call;
  // vs a 3-bet they 4-bet or flat. (Amogh folding KK preflop was the bug.)
  function mkTable(players) {
    return new EN.PokerTable({ players: players, sb: 5, bb: 10, startingStack: 1000, onEvent: function () {} });
  }
  var tier1 = [
    [{ r: 14, s: 0 }, { r: 14, s: 1 }], // AA
    [{ r: 13, s: 0 }, { r: 13, s: 1 }], // KK
    [{ r: 12, s: 0 }, { r: 12, s: 1 }], // QQ
    [{ r: 14, s: 0 }, { r: 13, s: 0 }]  // AKs
  ];
  var tier2 = [
    [{ r: 11, s: 0 }, { r: 11, s: 1 }], // JJ
    [{ r: 14, s: 0 }, { r: 13, s: 1 }]  // AKo
  ];
  var noFoldHands = tier1.concat(tier2); // AA KK QQ AKs JJ AKo
  tier1.forEach(function (h) { ok(EQ.holeTier(h) === 1, 'test hand is tier 1'); });
  tier2.forEach(function (h) { ok(EQ.holeTier(h) === 2, 'test hand is tier 2'); });

  BOTS.ARCHETYPES.forEach(function (arch) {
    // Vs a single 3bb open: hero opens, bot (SB) faces it.
    var folds = 0, N = 30;
    for (var i = 0; i < N; i++) {
      var t = mkTable([
        { name: 'You', isHero: true },
        { name: 'T', archetype: BOTS.getArchetype(arch.id) },
        { name: 'Z', archetype: BOTS.getArchetype('shark') }
      ]);
      t.startHand(); // button=2 -> 0; sb=1, bb=2, acting=0
      if (t.acting !== 0 || t.currentBet !== 10) { i--; continue; }
      t.act(0, 'raise', 30);
      if (t.acting !== 1) { i--; continue; }
      t.players[1].hole = tier1[i % tier1.length];
      var mv = BOTS.botDecide(t, t.players[1]);
      if (mv && mv.a === 'fold') folds++;
    }
    ok(folds === 0, arch.id + ' never folds tier-1 to a single open (folded ' + folds + '/' + N + ')');

    // Vs a 3-bet to 9bb: hero opens, shark 3-bets, bot faces it.
    // Tiers 1 AND 2 never fold here (JJ/AKo folding was the same leak class).
    var folds2 = 0;
    for (var j = 0; j < N; j++) {
      var t2 = mkTable([
        { name: 'You', isHero: true },
        { name: 'R', archetype: BOTS.getArchetype('shark') },
        { name: 'T', archetype: BOTS.getArchetype(arch.id) }
      ]);
      t2.startHand();
      if (t2.acting !== 0 || t2.currentBet !== 10) { j--; continue; }
      t2.act(0, 'raise', 30);
      if (t2.acting !== 1) { j--; continue; }
      t2.act(1, 'raise', 90);
      if (t2.acting !== 2) { j--; continue; }
      t2.players[2].hole = noFoldHands[j % noFoldHands.length];
      var mv2 = BOTS.botDecide(t2, t2.players[2]);
      if (mv2 && mv2.a === 'fold') folds2++;
    }
    ok(folds2 === 0, arch.id + ' never folds tier-1/2 to a 3-bet (folded ' + folds2 + '/' + N + ')');
  });
})();

(function () {
  // B10: 4-bets are sized ~2.3x the 3-bet, not automatic all-in shoves.
  function mkTable(players) {
    return new EN.PokerTable({ players: players, sb: 5, bb: 10, startingStack: 1000, onEvent: function () {} });
  }
  var shoves = 0, fours = 0, N = 60;
  for (var i = 0; i < N; i++) {
    var t = mkTable([
      { name: 'You', isHero: true },
      { name: 'R', archetype: BOTS.getArchetype('shark') },
      { name: 'Lag', archetype: BOTS.getArchetype('lag') }
    ]);
    t.startHand();
    if (t.acting !== 0 || t.currentBet !== 10) { i--; continue; }
    t.act(0, 'raise', 30);
    if (t.acting !== 1) { i--; continue; }
    t.act(1, 'raise', 90);
    if (t.acting !== 2) { i--; continue; }
    t.players[2].hole = [{ r: 11, s: 0 }, { r: 11, s: 1 }]; // JJ, tier 2
    var mv = BOTS.botDecide(t, t.players[2]);
    if (mv && mv.a === 'raise') {
      fours++;
      var maxTo = t.players[2].bet + t.players[2].stack;
      if (mv.amount >= maxTo - 1) shoves++;
      else ok(mv.amount <= 90 * 2.6, 'lag 4-bet sized ~2.3x, not a shove (got ' + mv.amount + ')');
    }
  }
  ok(fours > 0, 'lag 4-bets JJ vs 3-bet sometimes (' + fours + '/' + N + ')');
  ok(shoves === 0, 'no 4-bet shoves with 100bb stacks (' + shoves + '/' + fours + ')');
})();

(function () {
  // B11: 3-bet ranges follow the archetype — rock only 3-bets premiums,
  // TAGs 3-bet strong hands, and everyone 3-bets QQ+ at a healthy clip.
  function mkTable(players) {
    return new EN.PokerTable({ players: players, sb: 5, bb: 10, startingStack: 1000, onEvent: function () {} });
  }
  function threeBetRate(archId, hole, N) {
    var n = 0;
    for (var i = 0; i < N; i++) {
      var t = mkTable([
        { name: 'You', isHero: true },
        { name: 'T', archetype: BOTS.getArchetype(archId) },
        { name: 'Z', archetype: BOTS.getArchetype('shark') }
      ]);
      t.startHand();
      if (t.acting !== 0 || t.currentBet !== 10) { i--; continue; }
      t.act(0, 'raise', 30);
      if (t.acting !== 1) { i--; continue; }
      t.players[1].hole = hole;
      var mv = BOTS.botDecide(t, t.players[1]);
      if (mv && mv.a === 'raise') n++;
    }
    return n;
  }
  var JJ = [{ r: 11, s: 0 }, { r: 11, s: 1 }]; // tier 2
  var QQ = [{ r: 12, s: 0 }, { r: 12, s: 1 }]; // tier 1
  var N = 200; // large enough that the 15% rock threshold is statistically meaningful (N=40 flaked ~1/10 runs)
  // Rock's 3-bet range is premiums-only: with JJ it 3-bets far less often than
  // a TAG (the humanize tier-shift can occasionally promote JJ, so this is a
  // rate comparison, not an absolute zero).
  var rockR = threeBetRate('rock', JJ, N);
  var sharkR = threeBetRate('shark', JJ, N);
  ok(rockR <= N * 0.15, 'rock rarely 3-bets JJ (' + rockR + '/' + N + ')');
  ok(sharkR > 0, 'shark 3-bets JJ sometimes (' + sharkR + '/' + N + ')');
  ok(rockR < sharkR, 'rock 3-bets JJ less than shark (' + rockR + ' vs ' + sharkR + ')');
  ok(threeBetRate('lag', JJ, N) > 0, 'lag 3-bets JJ sometimes');
  ['shark', 'lag', 'grinder', 'maniac'].forEach(function (id) {
    var r = threeBetRate(id, QQ, N);
    ok(r >= N * 0.3, id + ' 3-bets QQ at a healthy clip (' + r + '/' + N + ')');
  });
})();


// ---------- Alice: the vault (never bluffs, super safe) ----------
// Alice folds almost every weak starting hand, never bluffs, sizes value
// bets unpredictably (small or big), and almost always calls with two pair
// or better (madeStrength >= 0.52). Named bots got slightly looser tiers;
// the classic training archetypes (station/maniac/rock) are untouched.
(function () {
  var AL = BOTS.getArchetype('alice');
  ok(!!AL, 'alice archetype exists');
  ok(AL.bluff === 0, 'alice never bluffs (bluff param is 0)');
  ok(AL.openTier === 1 && AL.callTier === 1, 'alice plays only premium tiers preflop');
  ok(AL.stubborn >= 0.8, 'alice is stubborn with made hands');

  function mkTable(players) {
    return new EN.PokerTable({ players: players, sb: 5, bb: 10, startingStack: 1000, onEvent: function () {} });
  }
  // Folds trash to a min-open, always continues with QQ+.
  var trash = [{ r: 7, s: 0 }, { r: 2, s: 1 }], prem = [{ r: 12, s: 0 }, { r: 12, s: 1 }];
  var folds = 0, cont = 0, trials = 0;
  for (var i = 0; i < 24 && trials < 40; i++) {
    var t = mkTable([
      { name: 'You', isHero: true },
      { name: 'A', archetype: AL },
      { name: 'Z', archetype: BOTS.getArchetype('shark') }
    ]);
    t.startHand();
    if (t.acting !== 0 || t.currentBet !== 10) continue;
    t.act(0, 'raise', 20);
    if (t.acting !== 1) continue;
    trials++;
    t.players[1].hole = i % 2 ? prem : trash;
    var mv = BOTS.botDecide(t, t.players[1]);
    if (i % 2) { if (mv && (mv.a === 'call' || mv.a === 'raise')) cont++; }
    else if (mv && mv.a === 'fold') folds++;
  }
  var trashTrials = Math.ceil(trials / 2), premTrials = Math.floor(trials / 2);
  ok(folds >= trashTrials - 1, 'alice folds trash preflop (' + folds + '/' + trashTrials + ')');
  ok(cont === premTrials && premTrials > 0, 'alice always continues QQ+ (' + cont + '/' + premTrials + ')');

  // Postflop via alicePostflop directly (mocked table): never bluffs, calls 2p+.
  var mt = { street: 'flop', currentBet: 0, potTotal: function () { return 200; } };
  var p = { stack: 900, bet: 0 };
  var free = { canBet: true, canRaise: false, minBetTo: 20, maxRaiseTo: 980 };
  var faced = { canBet: false, canRaise: true, minRaiseTo: 100, maxRaiseTo: 980 };
  for (var k = 0; k < 10; k++) {
    var chk = BOTS.alicePostflop(mt, p, AL, free, 0, 200, 0.25 + k * 0.01, 0.20);
    if (chk.a !== 'check') break;
  }
  ok(k === 10, 'alice never bluffs: checks air 10/10');
  ok(BOTS.alicePostflop(mt, p, AL, free, 0, 200, 0.80, 0.55).a === 'bet',
    'alice bets two pair');
  var mt2 = { street: 'turn', currentBet: 50, potTotal: function () { return 200; } };
  ok(BOTS.alicePostflop(mt2, p, AL, faced, 50, 200, 0.80, 0.55).a === 'call',
    'alice calls with two pair facing a bet');
  ok(BOTS.alicePostflop(mt2, p, AL, faced, 50, 200, 0.15, 0.25).a === 'fold',
    'alice folds weak hands facing a bet (disciplined)');
  // Unpredictable value sizing: both small and big bets appear.
  var small = 0, big = 0;
  for (var s = 0; s < 40; s++) {
    var bm = BOTS.alicePostflop(mt, p, AL, free, 0, 200, 0.95, 0.85);
    if (bm.a === 'bet' && bm.amount < 120) small++;
    if (bm.a === 'bet' && bm.amount > 220) big++;
  }
  ok(small > 0 && big > 0, 'alice mixes small and big value sizes (' + small + ' small, ' + big + ' big)');

  // Named bots slightly looser; training archetypes untouched.
  ok(BOTS.getArchetype('shark').openTier === 4, 'shark a touch looser (openTier 4)');
  ok(BOTS.getArchetype('grinder').openTier === 3, 'grinder a touch looser (openTier 3)');
  ok(BOTS.getArchetype('bubble').openTier === 2, 'bubble a touch looser (openTier 2)');
  ok(BOTS.getArchetype('rohan').callTier === 5, 'rohan a touch looser (callTier 5)');
  var st = BOTS.getArchetype('station'), ma = BOTS.getArchetype('maniac'), rk = BOTS.getArchetype('rock');
  ok(st.openTier === 4 && st.callTier === 5, 'calling station untouched (training)');
  ok(ma.openTier === 6 && ma.bluff === 0.55, 'maniac untouched (training)');
  ok(rk.openTier === 2 && rk.callTier === 2, 'rock untouched (training)');
})();


// ---------- shuffle randomness ----------
// Real sites (PokerStars: GLI-certified quantum RNG + client entropy) shuffle
// the whole deck from strong entropy before each hand. Ours must at least use
// a CSPRNG + unbiased Fisher-Yates. These tests verify the statistical
// properties, not the entropy source.
(function () {
  function deckKey(c) { return c.r + ':' + c.s; }

  // 1. Every shuffle is a complete, duplicate-free 52-card permutation.
  var i, d, seen;
  for (i = 0; i < 200; i++) {
    d = C.shuffle(C.makeDeck());
    seen = {};
    d.forEach(function (c) { seen[deckKey(c)] = (seen[deckKey(c)] || 0) + 1; });
    if (Object.keys(seen).length !== 52) break;
  }
  ok(Object.keys(seen).length === 52, 'shuffled deck always has 52 unique cards');
  ok(d === C.shuffle(d), 'shuffle returns the same array (in place)');

  // 2. Uniformity: chi-square on the first card's rank over many shuffles.
  // 13 ranks, 12 df. Critical values: 26.2 (99%), 32.9 (99.9%); we assert
  // < 40 (beyond 99.99%) so a fair shuffle essentially never flakes.
  var N = 6500, counts = {};
  for (i = 0; i < N; i++) {
    var top = C.shuffle(C.makeDeck())[0];
    counts[top.r] = (counts[top.r] || 0) + 1;
  }
  var exp = N / 13, chi2 = 0;
  for (var r = 2; r <= 14; r++) {
    var o = counts[r] || 0;
    chi2 += (o - exp) * (o - exp) / exp;
    ok(Math.abs(o - exp) / exp < 0.25, 'rank ' + r + ' within 25% of expected (' + o + ')');
  }
  ok(chi2 < 40, 'first-card rank uniform, chi2=' + chi2.toFixed(1) + ' < 40');

  // 3. Over many deals every one of the 52 cards shows up as a hole card.
  var dealt = {};
  for (i = 0; i < 500; i++) {
    d = C.shuffle(C.makeDeck());
    dealt[deckKey(d[0])] = 1; dealt[deckKey(d[1])] = 1;
  }
  ok(Object.keys(dealt).length === 52, 'all 52 cards dealt over 500 hands');

  // 4. randInt is unbiased over its range (rejection sampling, no modulo bias).
  var bins = [0, 0, 0, 0, 0, 0];
  for (i = 0; i < 6000; i++) bins[C.randInt(6)]++;
  ok(bins.every(function (b) { return b > 700 && b < 1300; }),
    'randInt(6) uniform-ish: ' + bins.join(','));

  // 5. Legacy caller-supplied rng still works (deterministic for tests).
  function fixedRng() { return 0.999999; }
  var a1 = C.shuffle([1, 2, 3, 4, 5], fixedRng);
  var a2 = C.shuffle([1, 2, 3, 4, 5], fixedRng);
  ok(a1.join(',') === a2.join(','), 'seeded rng gives deterministic shuffle');
  ok(a1.join(',') === '1,2,3,4,5', 'rng~1.0 leaves order unchanged (j always = i)');
})();


console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
