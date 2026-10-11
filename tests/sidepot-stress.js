// Side pot stress test: force all-ins at different levels, verify chip conservation
var EN = require('../js/engine.js');
var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) pass++;
  else { fail++; console.log('FAIL: ' + name); }
}

// Test 1: Three all-ins at different levels
(function() {
  var t = new EN.PokerTable({
    players: [{name:'A'},{name:'B'},{name:'C'},{name:'D'}],
    sb: 5, bb: 10, startingStack: 1000
  });
  var totalBefore = t.players.reduce(function(a,p){return a+p.stack;}, 0);
  // A: 1000, B: 500 (all-in), C: 750 (all-in), D: 1000
  var bets = [1000, 500, 750, 1000];
  t.players.forEach(function(p, i) {
    p.totalBet = bets[i];
    p.stack -= bets[i];
    p.folded = false;
    p.hole = [{r:14,s:0},{r:13,s:0}];
  });
  t.community = [{r:2,s:0},{r:3,s:1},{r:4,s:2},{r:5,s:3},{r:7,s:0}];
  // Give A the best hand (pair of aces), others worse
  t.players[0].hole = [{r:14,s:0},{r:14,s:1}];
  t.players[1].hole = [{r:2,s:0},{r:3,s:1}];
  t.players[2].hole = [{r:4,s:0},{r:5,s:1}];
  t.players[3].hole = [{r:6,s:0},{r:7,s:1}];
  t._showdown();
  var totalAfter = t.players.reduce(function(a,p){return a+p.stack;}, 0);
  ok(totalAfter === totalBefore, 'chip conservation: 3 all-ins (' + totalBefore + ' -> ' + totalAfter + ')');
})();

// Test 2: All-in for less than blinds
(function() {
  var t = new EN.PokerTable({
    players: [{name:'A'},{name:'B'},{name:'C'}],
    sb: 5, bb: 10, startingStack: 1000
  });
  var totalBefore = t.players.reduce(function(a,p){return a+p.stack;}, 0);
  var bets = [1000, 3, 1000]; // B all-in for 3 (less than SB)
  t.players.forEach(function(p, i) {
    p.totalBet = bets[i];
    p.stack -= bets[i];
    p.folded = false;
    p.hole = [{r:14,s:0},{r:13,s:0}];
  });
  t.community = [{r:2,s:0},{r:3,s:1},{r:4,s:2},{r:5,s:3},{r:7,s:0}];
  t._showdown();
  var totalAfter = t.players.reduce(function(a,p){return a+p.stack;}, 0);
  ok(totalAfter === totalBefore, 'chip conservation: micro all-in (' + totalBefore + ' -> ' + totalAfter + ')');
})();

console.log('sidepot-stress: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
