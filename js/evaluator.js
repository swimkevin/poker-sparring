// evaluator.js — 7-card Texas Hold'em hand evaluator. DOM-free.
//
// Scoring: single integer, higher = better.
//   score = category * 16^5 + k1*16^4 + k2*16^3 + k3*16^2 + k4*16 + k5
// Categories: 8 straight flush, 7 quads, 6 full house, 5 flush,
//             4 straight, 3 trips, 2 two pair, 1 pair, 0 high card.

// Node: pull cross-file globals when running as modules (browser uses script tags).
if (typeof module !== 'undefined' && module.exports) {
  var __cards = require('./cards.js');
  var rankName = __cards.rankName, rankChar = __cards.rankChar;
}

var CATEGORY_NAMES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind',
  'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'
];

function catOf(score) { return Math.floor(score / 1048576); } // 16^5

function encodeScore(cat, kickers) {
  var s = cat;
  for (var i = 0; i < 5; i++) s = s * 16 + (kickers[i] || 0);
  return s;
}

// Evaluate exactly 5 cards. Returns { score, cat, kickers, best5 }.
function evaluate5(cards) {
  var ranks = cards.map(function (c) { return c.r; }).sort(function (a, b) { return b - a; });
  var flush = cards.every(function (c) { return c.s === cards[0].s; });

  var uniq = [];
  for (var i = 0; i < ranks.length; i++)
    if (i === 0 || ranks[i] !== ranks[i - 1]) uniq.push(ranks[i]);

  var straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2)
      straightHigh = 5; // wheel: A-2-3-4-5
  }

  var counts = {};
  ranks.forEach(function (r) { counts[r] = (counts[r] || 0) + 1; });
  var groups = Object.keys(counts).map(function (r) {
    return { r: +r, c: counts[r] };
  }).sort(function (a, b) { return (b.c - a.c) || (b.r - a.r); });

  var g = groups, kick;
  if (flush && straightHigh)
    return pack(8, [straightHigh], cards);
  if (g[0].c === 4)
    return pack(7, [g[0].r, g[1].r], cards);
  if (g[0].c === 3 && g[1].c === 2)
    return pack(6, [g[0].r, g[1].r], cards);
  if (flush)
    return pack(5, ranks.slice(), cards);
  if (straightHigh)
    return pack(4, [straightHigh], cards);
  if (g[0].c === 3)
    return pack(3, [g[0].r, g[1].r, g[2].r], cards);
  if (g[0].c === 2 && g[1].c === 2)
    return pack(2, [g[0].r, g[1].r, g[2].r], cards);
  if (g[0].c === 2)
    return pack(1, [g[0].r, g[1].r, g[2].r, g[3].r], cards);
  return pack(0, ranks.slice(), cards);

  function pack(cat, kickers, allCards) {
    // Reconstruct the actual best 5 cards for display: pick cards matching kickers.
    var used = {}, best = [];
    var pool = allCards.slice();
    function take(rank, n) {
      for (var k = 0; k < n; k++) {
        for (var j = 0; j < pool.length; j++) {
          var key = pool[j].r + '-' + pool[j].s;
          if (pool[j].r === rank && !used[key]) { used[key] = 1; best.push(pool[j]); break; }
        }
      }
    }
    if (cat === 8 || cat === 4) {
      // straight: take the 5 ranks of the straight
      var top = kickers[0], need = [];
      for (var t = 0; t < 5; t++) need.push(top === 5 && t === 4 ? 14 : top - t);
      need.forEach(function (rk) { take(rk, 1); });
    } else if (cat === 5) {
      best = allCards.slice().sort(function (a, b) { return (b.r - a.r) || (b.s - a.s); }).slice(0, 5);
    } else {
      var counts2 = {};
      kickers.forEach(function (rk, idx) {
        var n = (cat === 7 && idx === 0) ? 4 :
                (cat === 6) ? (idx === 0 ? 3 : 2) :
                (cat === 3 && idx === 0) ? 3 :
                (cat === 2 && idx < 2) ? 2 :
                (cat === 1 && idx === 0) ? 2 : 1;
        take(rk, n);
      });
    }
    return { score: encodeScore(cat, kickers), cat: cat, kickers: kickers, best5: best };
  }
}

// Evaluate 5..7 cards (hole + community). Returns best 5-card result.
function evaluate(cards) {
  if (cards.length === 5) return evaluate5(cards);
  if (cards.length < 5) throw new Error('evaluate needs at least 5 cards');
  var best = null, n = cards.length;
  for (var a = 0; a < n - 4; a++)
    for (var b = a + 1; b < n - 3; b++)
      for (var c = b + 1; c < n - 2; c++)
        for (var d = c + 1; d < n - 1; d++)
          for (var e = d + 1; e < n; e++) {
            var r = evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || r.score > best.score) best = r;
          }
  return best;
}
var evaluate7 = evaluate;

// Human-readable description, e.g. "Flush, Ace high" / "Two Pair, Kings and Tens".
function describeHand(ev) {
  var k = ev.kickers, rn = (typeof rankName !== 'undefined') ? rankName : function (r) { return String(r); };
  function plural(r) { var n = rn(r); return n === 'Six' ? 'Sixes' : n + 's'; }
  switch (ev.cat) {
    case 8: return k[0] === 14 ? 'Royal Flush' : 'Straight Flush, ' + rn(k[0]) + ' high';
    case 7: return 'Four of a Kind, ' + plural(k[0]);
    case 6: return 'Full House, ' + plural(k[0]) + ' over ' + plural(k[1]);
    case 5: return 'Flush, ' + rn(k[0]) + ' high';
    case 4: return 'Straight, ' + rn(k[0]) + ' high';
    case 3: return 'Three of a Kind, ' + plural(k[0]);
    case 2: return 'Two Pair, ' + plural(k[0]) + ' and ' + plural(k[1]);
    case 1: return 'Pair of ' + plural(k[0]);
    default: return rn(k[0]) + ' High';
  }
}

// Compare two evaluations: 1 = a wins, -1 = b wins, 0 = tie.
function compareHands(a, b) {
  return a.score > b.score ? 1 : a.score < b.score ? -1 : 0;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CATEGORY_NAMES: CATEGORY_NAMES, catOf: catOf, encodeScore: encodeScore,
    evaluate5: evaluate5, evaluate: evaluate, evaluate7: evaluate7,
    describeHand: describeHand, compareHands: compareHands
  };
}
