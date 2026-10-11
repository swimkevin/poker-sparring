// Pot-layer merge (v1.8.96, Kevin's hand #6): layers with identical
// eligible players are ONE pot. Heads-up vs a short all-in must not
// fabricate a 'side pot' — excess over the short stack is uncalled.
// Kevin's hand #6: hero shoves 3881, short stack (942) calls, 4 others in for 35.
var path = require('path');
var js = function (f) { return require(path.join(__dirname, '..', 'js', f)); };
var EN = js('engine.js');
function C(r, s) { return { r: r, s: s }; }
var names = ['Hero', 'Rohan', 'A', 'B', 'C', 'D'];
var players = names.map(function (n, i) { return { name: n, isHero: i === 0 }; });
var t = new EN.PokerTable({ players: players, sb: 5, bb: 10, startingStack: 5000, button: 0 });
t.startHand();
// Force contributions: hero 3881, Rohan 942 (all-in), others 35 then folded.
t.players[0].totalBet = 3881; t.players[0].hole = [C(10, 2), C(4, 2)]; t.players[0].stack = 5000 - 3881; t.players[0].folded = false;
t.players[1].totalBet = 942; t.players[1].hole = [C(14, 3), C(12, 3)]; t.players[1].stack = 0; t.players[1].allIn = true; t.players[1].folded = false;
for (var i = 2; i < 6; i++) { t.players[i].totalBet = 35; t.players[i].folded = true; t.players[i].hole = [C(2, 0), C(3, 1)]; }
t.community = [C(9, 1), C(6, 3), C(8, 2), C(6, 0), C(14, 1)];
t.pot = 3881 + 942 + 35 * 4;
var pots = t._buildPots();
console.log('pots:', JSON.stringify(pots.map(function (p) { return { amount: p.amount, eligible: p.eligible }; })));
var total = pots.reduce(function (s, p) { return s + p.amount; }, 0);
console.log('total across pots:', total, '(expect 4963)');
var ok = pots.length === 2 &&
  pots[0].amount === 210 + (942 - 35) * 2 &&
  pots[0].eligible.join(',') === '0,1' &&
  pots[1].eligible.join(',') === '0';
console.log(ok ? 'POT MERGE TEST PASSED' : 'POT MERGE TEST FAILED');
process.exit(ok ? 0 : 1);
