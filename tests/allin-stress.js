// Force all-in situations and verify chip conservation + sane stacks
var EN = require('../js/engine.js');
var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) pass++;
  else { fail++; console.log('FAIL: ' + name); }
}

for (var round = 0; round < 50; round++) {
  var t = new EN.PokerTable({
    players: [{name:'A'},{name:'B'},{name:'C'},{name:'D'},{name:'E'},{name:'F'}],
    sb: 5, bb: 10, startingStack: 1000
  });
  var totalBefore = t.players.reduce(function(a,p){return a+p.stack;}, 0);
  // Random all-in levels
  t.players.forEach(function(p) {
    var bet = [100, 250, 500, 750, 1000][Math.floor(Math.random()*5)];
    bet = Math.min(bet, p.stack);
    p.totalBet = bet;
    p.stack -= bet;
    p.folded = Math.random() < 0.2;
    p.hole = [{r:2+Math.floor(Math.random()*13),s:Math.floor(Math.random()*4)},
              {r:2+Math.floor(Math.random()*13),s:Math.floor(Math.random()*4)}];
  });
  // Ensure at least 2 non-folded
  t.players[0].folded = false; t.players[1].folded = false;
  t.community = [{r:2,s:0},{r:5,s:1},{r:9,s:2},{r:12,s:3},{r:7,s:0}];
  t._showdown();
  var totalAfter = t.players.reduce(function(a,p){return a+p.stack;}, 0);
  if (totalAfter !== totalBefore) {
    ok(false, 'round ' + round + ': chips ' + totalBefore + ' -> ' + totalAfter);
  }
  // Check no negative stacks
  t.players.forEach(function(p, i) {
    if (p.stack < 0) ok(false, 'round ' + round + ' player ' + i + ' negative: ' + p.stack);
  });
}
ok(true, 'completed 50 all-in rounds');
console.log('allin-stress: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
