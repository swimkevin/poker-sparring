// swimkev iso identity (v1.8.96, Kevin): A9s behind limpers = big iso-raise
// (pressure + range info), never a limp-fold; facing an iso he continues.
var path = require('path');
var js = function (f) { return require(path.join(__dirname, '..', 'js', f)); };
var EN = js('engine.js'), BOTS = js('bots.js');
function C(r, s) { return { r: r, s: s }; }
// Scenario 1: swimkev (idx2) with A9s, two limpers before him, unraised pot.
function isoScenario() {
  var players = [
    { name: 'Hero', isHero: true },
    { name: 'Limp1', archetype: BOTS.getArchetype('station') },
    { name: 'swimkev', archetype: BOTS.getArchetype('lag') },
    { name: 'Limp2', archetype: BOTS.getArchetype('rohan') }
  ];
  var t = new EN.PokerTable({ players: players, sb: 5, bb: 10, startingStack: 1000, button: 3 });
  t.startHand();
  t.street = 'preflop'; t.community = []; t.pot = 15;
  t.players.forEach(function (p, i) { p.bet = 0; p.folded = false; p.allIn = false; p.acted = false; p.stack = 1000; p.sittingOut = false; p.hole = [C(3, 0), C(7, 2)]; p.totalBet = 0; });
  var k = t.players[2];
  k.hole = [C(14, 1), C(9, 1)]; // A9s tier 4
  t.players[1].bet = 10; t.players[1].totalBet = 10; t.players[1].stack = 990;
  t.players[3].bet = 10; t.players[3].totalBet = 10; t.players[3].stack = 990;
  t.currentBet = 10; t.acting = 2;
  return { t: t, k: k };
}
// Scenario 2: swimkev with A9s facing a big iso raise (to 90) after he limped.
function faceIsoScenario() {
  var s = isoScenario();
  var t = s.t, k = s.k;
  k.bet = 10; k.totalBet = 10; k.stack = 990;
  t.players[1].bet = 90; t.players[1].totalBet = 90; t.players[1].stack = 910;
  t.currentBet = 90;
  return { t: t, k: k };
}
var iso = 0, isoBig = 0, cont = 0, N = 40;
for (var i = 0; i < N; i++) {
  var s1 = isoScenario();
  var mv1 = BOTS.botDecide(s1.t, s1.k);
  if (mv1 && mv1.a === 'raise') { iso++; if (mv1.amount >= 60) isoBig++; }
  var s2 = faceIsoScenario();
  var mv2 = BOTS.botDecide(s2.t, s2.k);
  if (mv2 && mv2.a !== 'fold') cont++;
}
console.log('swimkev A9s behind limpers: iso-raised ' + iso + '/' + N + ' (big >=60: ' + isoBig + ')');
console.log('swimkev A9s facing iso 90: continued ' + cont + '/' + N);
var ok = iso >= 28 && isoBig >= 24 && cont >= 26;
console.log(ok ? 'SWIMKEV TEST PASSED' : 'SWIMKEV TEST FAILED');
process.exit(ok ? 0 : 1);
