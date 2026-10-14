// Alice stack-relative defense (v1.8.95, Kevin): ATs must continue vs a
// cheap 75 raise with 1000 behind; trash still folds; a real 600 bet is
// still respected. Regression for the facingBig branch folding tier 3.
// Alice ATs vs 75 raise, 1000 stack: should call. Trash: should fold.
var path = require('path');
var js = function (f) { return require(path.join(__dirname, '..', 'js', f)); };
var EN = js('engine.js'), BOTS = js('bots.js');

function C(r, s) { return { r: r, s: s }; }
function scenario(hole, raiseTo, callerAlsoIn) {
  var alice = BOTS.getArchetype('alice');
  var players = [
    { name: 'Hero', isHero: true },
    { name: 'Alice', archetype: alice },
    { name: 'Raiser', archetype: BOTS.getArchetype('shark') },
    { name: 'Caller', archetype: BOTS.getArchetype('shark') }
  ];
  var t = new EN.PokerTable({ players: players, sb: 5, bb: 10, startingStack: 1000, button: 0 });
  t.startHand();
  // Force the exact state: street preflop, Alice (idx1) to act facing raiseTo.
  t.street = 'preflop';
  t.community = [];
  t.pot = 15; // blinds
  t.players.forEach(function (p, i) {
    p.bet = 0; p.folded = false; p.allIn = false; p.acted = false;
    p.stack = 1000; p.sittingOut = false;
    if (i !== 1) p.hole = [C(3, 0), C(7, 2)];
  });
  var a = t.players[1];
  a.hole = hole; a.stack = 1000;
  var raiser = t.players[2];
  raiser.bet = raiseTo; raiser.stack = 1000 - raiseTo;
  if (callerAlsoIn) { var c = t.players[3]; c.bet = raiseTo; c.stack = 1000 - raiseTo; }
  t.currentBet = raiseTo;
  t.acting = 1;
  return { t: t, a: a };
}
var counts = { atsCall: 0, atsN: 0, trashCall: 0, trashN: 0, atsBigCall: 0, atsBigN: 0 };
for (var i = 0; i < 200; i++) {
  var s1 = scenario([C(14, 1), C(10, 1)], 75, true); // ATs
  var mv1 = BOTS.botDecide(s1.t, s1.a);
  counts.atsN++; if (mv1 && mv1.a !== 'fold') counts.atsCall++;
  var s2 = scenario([C(7, 0), C(2, 2)], 75, true); // 72o trash
  var mv2 = BOTS.botDecide(s2.t, s2.a);
  counts.trashN++; if (mv2 && mv2.a !== 'fold') counts.trashCall++;
  var s3 = scenario([C(14, 1), C(10, 1)], 600, false); // ATs vs huge bet (60% of stack)
  var mv3 = BOTS.botDecide(s3.t, s3.a);
  counts.atsBigN++; if (mv3 && mv3.a !== 'fold') counts.atsBigCall++;
}
console.log('ATs vs 75 (stack 1000): continued ' + counts.atsCall + '/' + counts.atsN);
console.log('72o vs 75: continued ' + counts.trashCall + '/' + counts.trashN);
console.log('ATs vs 600 (60% stack): continued ' + counts.atsBigCall + '/' + counts.atsBigN);
var ok = counts.atsCall >= 170 && counts.trashCall <= 30 && counts.atsBigCall <= 50;
console.log(ok ? 'ALICE TEST PASSED' : 'ALICE TEST FAILED');
process.exit(ok ? 0 : 1);
