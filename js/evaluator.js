if (typeof module !== 'undefined' && module.exports) {
  var __cards = require('./cards.js');
  var rankName = __cards.rankName;
}

function encodeScore(cat, kickers) {
  var s = cat;
  for (var i = 0; i < 5; i++) s = s * 16 + (kickers[i] || 0);
  return s;
}

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
      straightHigh = 5;
  }

  var counts = {};
  ranks.forEach(function (r) { counts[r] = (counts[r] || 0) + 1; });
  var groups = Object.keys(counts).map(function (r) {
    return { r: +r, c: counts[r] };
  }).sort(function (a, b) { return (b.c - a.c) || (b.r - a.r); });

  var g = groups;
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

      var top = kickers[0], need = [];
      for (var t = 0; t < 5; t++) need.push(top === 5 && t === 4 ? 14 : top - t);
      need.forEach(function (rk) { take(rk, 1); });
    } else if (cat === 5) {
      best = allCards.slice().sort(function (a, b) { return (b.r - a.r) || (b.s - a.s); }).slice(0, 5);
    } else {
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

function straightHighFromMask(mask) {
  var h, want;
  for (h = 14; h >= 6; h--) {
    want = 31 << (h - 6);
    if ((mask & want) === want) return h;
  }
  if ((mask & 0x100F) === 0x100F) return 5;
  return 0;
}

function topRanksFromMask(mask, count) {
  var out = [];
  for (var r = 14; r >= 2 && out.length < count; r--) {
    if (mask & (1 << (r - 2))) out.push(r);
  }
  return out;
}

function topKickersFromCounts(rc, ex1, ex2, count) {
  var out = [];
  for (var r = 14; r >= 2 && out.length < count; r--) {
    if (rc[r] > 0 && r !== ex1 && r !== ex2) out.push(r);
  }
  return out;
}

function evaluate7Fast(cards) {
  var rc = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  var sc = [0, 0, 0, 0];
  var sm = [0, 0, 0, 0];
  var n = cards.length;
  var i, r, s;
  for (i = 0; i < n; i++) {
    r = cards[i].r; s = cards[i].s;
    rc[r]++;
    sc[s]++;
    sm[s] |= 1 << (r - 2);
  }
  var fs = -1;
  for (i = 0; i < 4; i++) if (sc[i] >= 5) { fs = i; break; }
  var q = 0, t1 = 0, t2 = 0, p1 = 0, p2 = 0;
  for (i = 14; i >= 2; i--) {
    if (rc[i] === 4) q = i;
    else if (rc[i] === 3) { if (!t1) t1 = i; else t2 = i; }
    else if (rc[i] === 2) { if (!p1) p1 = i; else if (!p2) p2 = i; }
  }
  var k;
  if (fs >= 0) {
    var sf = straightHighFromMask(sm[fs]);
    if (sf) return { score: encodeScore(8, [sf]), cat: 8, kickers: [sf] };
  }
  if (q) {
    k = topKickersFromCounts(rc, q, 0, 1);
    return { score: encodeScore(7, [q, k[0]]), cat: 7, kickers: [q, k[0]] };
  }
  if (t1 && (p1 || t2)) {
    var pr = (p1 && (!t2 || p1 > t2)) ? p1 : t2;
    return { score: encodeScore(6, [t1, pr]), cat: 6, kickers: [t1, pr] };
  }
  if (fs >= 0) {
    k = topRanksFromMask(sm[fs], 5);
    return { score: encodeScore(5, k), cat: 5, kickers: k };
  }
  var rm = sm[0] | sm[1] | sm[2] | sm[3];
  var st = straightHighFromMask(rm);
  if (st) return { score: encodeScore(4, [st]), cat: 4, kickers: [st] };
  if (t1) {
    k = topKickersFromCounts(rc, t1, 0, 2);
    return { score: encodeScore(3, [t1, k[0], k[1]]), cat: 3, kickers: [t1, k[0], k[1]] };
  }
  if (p1 && p2) {
    k = topKickersFromCounts(rc, p1, p2, 1);
    return { score: encodeScore(2, [p1, p2, k[0]]), cat: 2, kickers: [p1, p2, k[0]] };
  }
  if (p1) {
    k = topKickersFromCounts(rc, p1, 0, 3);
    return { score: encodeScore(1, [p1, k[0], k[1], k[2]]), cat: 1, kickers: [p1, k[0], k[1], k[2]] };
  }
  k = topKickersFromCounts(rc, 0, 0, 5);
  return { score: encodeScore(0, k), cat: 0, kickers: k };
}

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    encodeScore: encodeScore,
    evaluate5: evaluate5, evaluate: evaluate, evaluate7: evaluate7, evaluate7Fast: evaluate7Fast,
    describeHand: describeHand
  };
}
