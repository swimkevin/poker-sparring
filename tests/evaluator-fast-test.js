// Differential test for evaluate7Fast (v1.8.273): the direct 7-card evaluator
// must return the exact same score, category and kickers as evaluate7, which
// enumerates all 21 five-card subsets. Any mismatch is a fast-evaluator bug,
// not a test tolerance issue. Seeded RNG, so the run is deterministic.
var EV = require('../js/evaluator.js');

var seed = 424242;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function C(r, s) { return { r: r, s: s }; }
function randHand(n) {
  var deck = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++) deck.push({ r: r, s: s });
  for (var i = 0; i < n; i++) {
    var j = i + Math.floor(rnd() * (deck.length - i));
    var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
  }
  return deck.slice(0, n);
}

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) pass++;
  else { fail++; console.log('FAIL: ' + name); }
}
function sameHand(h, name) {
  var a = EV.evaluate7(h), b = EV.evaluate7Fast(h);
  ok(a.score === b.score && a.cat === b.cat &&
    JSON.stringify(a.kickers) === JSON.stringify(b.kickers),
    name + ' (slow ' + a.score + '/' + a.cat + ' vs fast ' + b.score + '/' + b.cat + ')');
}

var cats = {};
var i, h;
for (i = 0; i < 8000; i++) {
  h = randHand(7);
  var a = EV.evaluate7(h), b = EV.evaluate7Fast(h);
  cats[a.cat] = (cats[a.cat] || 0) + 1;
  ok(a.score === b.score && a.cat === b.cat &&
    JSON.stringify(a.kickers) === JSON.stringify(b.kickers),
    'random 7-card hand ' + i + ' matches');
}
ok(Object.keys(cats).length === 9, 'random sweep covers all 9 categories (' + JSON.stringify(cats) + ')');
for (i = 0; i < 2000; i++) sameHand(randHand(6), 'random 6-card hand ' + i + ' matches');
for (i = 0; i < 2000; i++) sameHand(randHand(5), 'random 5-card hand ' + i + ' matches');

var cases = [
  [[14, 0], [13, 0], [12, 0], [11, 0], [10, 0], [9, 1], [2, 2]],
  [[14, 0], [5, 0], [4, 0], [3, 0], [2, 0], [9, 1], [8, 2]],
  [[9, 0], [9, 1], [9, 2], [9, 3], [13, 0], [12, 1], [2, 2]],
  [[9, 0], [9, 1], [9, 2], [7, 0], [7, 1], [7, 2], [13, 0]],
  [[9, 0], [9, 1], [9, 2], [7, 0], [7, 1], [13, 0], [13, 1]],
  [[14, 0], [13, 0], [12, 0], [11, 0], [9, 0], [8, 0], [2, 1]],
  [[14, 0], [5, 1], [4, 2], [3, 3], [2, 0], [9, 1], [8, 2]],
  [[14, 0], [13, 1], [12, 2], [11, 3], [10, 0], [9, 1], [2, 2]],
  [[7, 0], [7, 1], [7, 2], [5, 0], [5, 1], [13, 0], [2, 2]],
  [[7, 0], [7, 1], [5, 0], [5, 1], [2, 0], [13, 0], [12, 1]],
  [[7, 0], [7, 1], [2, 0], [13, 0], [12, 1], [11, 2], [10, 3]],
  [[14, 0], [13, 1], [12, 2], [11, 3], [9, 0], [8, 1], [2, 2]],
  [[13, 0], [13, 1], [13, 2], [13, 3], [2, 0], [3, 1], [4, 2]],
  [[12, 0], [12, 1], [12, 2], [11, 0], [11, 1], [10, 0], [2, 2]],
  [[6, 0], [5, 1], [4, 2], [3, 3], [2, 0], [14, 1], [13, 2]],
  [[14, 0], [14, 1], [13, 0], [13, 1], [12, 0], [11, 1], [2, 2]],
  [[14, 0], [14, 1], [14, 2], [5, 0], [5, 1], [5, 2], [2, 3]],
  [[13, 0], [12, 0], [11, 0], [10, 0], [9, 0], [8, 0], [7, 0]],
  [[8, 0], [7, 0], [6, 0], [5, 0], [4, 0], [14, 1], [2, 2]],
  [[10, 0], [10, 1], [10, 2], [4, 0], [4, 1], [13, 0], [12, 1]]
];
cases.forEach(function (cs, idx) {
  sameHand(cs.map(function (c) { return C(c[0], c[1]); }), 'targeted case ' + idx + ' matches');
});

console.log(pass + ' passed, ' + fail + ' failed (evaluator-fast)');
if (fail) process.exit(1);
