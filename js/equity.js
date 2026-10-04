// equity.js — Monte Carlo equity, made-hand strength, and draw detection. DOM-free.

// Node: pull cross-file globals when running as modules (browser uses script tags).
if (typeof module !== 'undefined' && module.exports) {
  var __ev = require('./evaluator.js');
  var evaluate7 = __ev.evaluate7;
  var __cd = require('./cards.js');
  var rankChar = __cd.rankChar;
}

function _key(c) { return c.r * 10 + c.s; }

// Estimate P(win) for `hole` vs `opponents` random hands given `community` (0-5 cards).
// Ties count as half a win (slight multiway approximation). iters trades speed/accuracy.
function estimateEquity(hole, community, opponents, iters) {
  iters = iters || 300;
  opponents = Math.max(1, opponents || 1);
  var known = {};
  hole.concat(community).forEach(function (c) { known[_key(c)] = 1; });
  var full = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!known[_key({ r: r, s: s })]) full.push({ r: r, s: s });

  var boardNeed = 5 - community.length;
  var need = boardNeed + opponents * 2;
  var score = 0;

  for (var i = 0; i < iters; i++) {
    // Partial Fisher-Yates: only shuffle the cards we need.
    var deck = full.slice();
    for (var d = 0; d < need; d++) {
      var j = d + Math.floor(Math.random() * (deck.length - d));
      var t = deck[d]; deck[d] = deck[j]; deck[j] = t;
    }
    var board = community.concat(deck.slice(0, boardNeed));
    var myScore = evaluate7(hole.concat(board)).score;
    var win = true, tie = false;
    for (var o = 0; o < opponents; o++) {
      var oh = [deck[boardNeed + o * 2], deck[boardNeed + o * 2 + 1]];
      var os = evaluate7(oh.concat(board)).score;
      if (os > myScore) { win = false; break; }
      if (os === myScore) tie = true;
    }
    if (win) score += tie ? 0.5 : 1;
  }
  return score / iters;
}

// Estimate P(win) for `hole` vs a SINGLE opponent whose hole cards are sampled
// uniformly from hands with holeTier <= maxTier (a shoving/calling "range").
// This is the honest number for "facing a shove" spots: a shover's range is
// far stronger than random hands, so estimateEquity() would overstate our equity.
function estimateEquityVsRange(hole, maxTier, iters) {
  iters = iters || 300;
  var known = {};
  hole.forEach(function (c) { known[_key(c)] = 1; });
  var rest = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!known[_key({ r: r, s: s })]) rest.push({ r: r, s: s });
  // All villain hole-card combos inside the range (hero's cards excluded).
  var pool = [];
  for (var i = 0; i < rest.length; i++)
    for (var j = i + 1; j < rest.length; j++) {
      var h = [rest[i], rest[j]];
      if (holeTier(h) <= maxTier) pool.push(h);
    }
  if (!pool.length) return 0;

  var score = 0;
  for (var k = 0; k < iters; k++) {
    var vh = pool[Math.floor(Math.random() * pool.length)];
    var vknown = {};
    vknown[_key(vh[0])] = 1; vknown[_key(vh[1])] = 1;
    hole.forEach(function (c) { vknown[_key(c)] = 1; });
    var deck = [];
    for (var s2 = 0; s2 < 4; s2++)
      for (var r2 = 2; r2 <= 14; r2++)
        if (!vknown[_key({ r: r2, s: s2 })]) deck.push({ r: r2, s: s2 });
    // Partial Fisher-Yates for the 5 board cards.
    for (var d = 0; d < 5; d++) {
      var jj = d + Math.floor(Math.random() * (deck.length - d));
      var t = deck[d]; deck[d] = deck[jj]; deck[jj] = t;
    }
    var board = deck.slice(0, 5);
    var myScore = evaluate7(hole.concat(board)).score;
    var opScore = evaluate7(vh.concat(board)).score;
    if (myScore > opScore) score += 1;
    else if (myScore === opScore) score += 0.5;
  }
  return score / iters;
}
// Adds draw bonuses so semi-bluffing works.
// Rough "how strong is my made hand right now" in [0,1], for bot heuristics.
// Adds draw bonuses so semi-bluffing works.
function madeStrength(hole, community) {
  var cards = hole.concat(community);
  var ev = cards.length >= 5 ? evaluate7(cards) : null;
  var base = 0;
  if (ev) {
    switch (ev.cat) {
      case 8: base = 1.0; break;
      case 7: base = 0.95; break;
      case 6: base = 0.88; break;
      case 5: base = 0.80; break;
      case 4: base = 0.72; break;
      case 3: base = 0.62 + (ev.kickers[0] / 14) * 0.06; break;
      case 2: base = 0.50 + (ev.kickers[0] / 14) * 0.08; break;
      case 1: {
        var pr = ev.kickers[0];
        var overpair = community.length >= 3 &&
          Math.min.apply(null, community.map(function (c) { return c.r; })) > 0 &&
          pr > Math.max.apply(null, community.map(function (c) { return c.r; }));
        base = 0.28 + (pr / 14) * 0.14 + (overpair ? 0.10 : 0) +
               (ev.kickers[1] / 14) * 0.03;
        break;
      }
      default: base = 0.05 + (ev.kickers[0] / 14) * 0.08;
    }
  } else {
    // Preflop: use hole-card tier as a proxy.
    base = 0.55 - holeTier(hole) * 0.07;
  }
  var d = detectDraws(hole, community);
  if (d.flushDraw) base += 0.12;
  if (d.oesd) base += 0.10;
  else if (d.gutshot) base += 0.05;
  base += d.overcards * 0.03;
  return Math.max(0, Math.min(1, base));
}

function detectDraws(hole, community) {
  var cards = hole.concat(community);
  var suitCount = [0, 0, 0, 0];
  cards.forEach(function (c) { suitCount[c.s]++; });
  var flushDraw = suitCount.some(function (n) { return n === 4; }) && community.length < 5;

  var uniq = {};
  cards.forEach(function (c) { uniq[c.r] = 1; if (c.r === 14) uniq[1] = 1; });
  var rs = Object.keys(uniq).map(Number).sort(function (a, b) { return a - b; });
  var oesd = false, gutshot = false;
  for (var i = 0; i + 3 < rs.length; i++) {
    var span = rs[i + 3] - rs[i];
    if (span === 3) { oesd = true; break; }
    if (span === 4 && !oesd) {
      // 4 ranks spanning 5 (one gap) with board not yet complete => gutshot-ish
      gutshot = true;
    }
  }
  var overcards = 0;
  if (community.length >= 3) {
    var bmax = Math.max.apply(null, community.map(function (c) { return c.r; }));
    hole.forEach(function (c) { if (c.r > bmax) overcards++; });
  }
  return { flushDraw: flushDraw, oesd: oesd && community.length < 5, gutshot: gutshot && community.length < 5, overcards: overcards };
}

// Preflop hole-card tier: 1 = premium ... 6 = trash. Used by bots + coach tips.
function holeTier(hole) {
  var a = hole[0], b = hole[1];
  var hi = Math.max(a.r, b.r), lo = Math.min(a.r, b.r);
  var suited = a.s === b.s, pair = a.r === b.r;
  if (pair) {
    if (hi >= 12) return 1;      // QQ+
    if (hi >= 10) return 2;      // JJ TT
    if (hi >= 7) return 3;       // 99-77
    return 4;                    // 66-22
  }
  var key = rankChar(hi) + rankChar(lo) + (suited ? 's' : 'o');
  var T1 = { 'AKs': 1 };
  var T2 = { 'AKo': 1, 'AQs': 1, 'AJs': 1, 'KQs': 1 };
  if (T1[key]) return 1;
  if (T2[key]) return 2;
  var T3 = { 'AQo': 1, 'AJo': 1, 'ATs': 1, 'KJs': 1, 'QJs': 1, 'JTs': 1, 'KQo': 1 };
  if (T3[key]) return 3;
  var T4 = {
    'ATo': 1, 'A9s': 1, 'A8s': 1, 'A7s': 1, 'A6s': 1, 'A5s': 1, 'A4s': 1, 'A3s': 1, 'A2s': 1,
    'KJo': 1, 'KQo': 0, 'KTs': 1, 'QJo': 1, 'QTs': 1, 'JTo': 1, 'J9s': 1, 'T9s': 1,
    '98s': 1, '87s': 1, '76s': 1, '65s': 1, 'KQd': 0
  };
  if (T4[key]) return 4;
  // Tier 5: remaining suited hands, offsuit broadways/connectors
  if (suited) return 5;
  if (hi >= 11 && lo >= 9) return 5;                 // KJo QJo etc.
  if (hi - lo <= 2 && hi >= 8) return 5;             // connectors/gappers
  if (a.r === 14 || b.r === 14) return 5;            // any ace
  return 6;
}

var TIER_NAMES = {
  1: 'Premium (QQ+, AK)',
  2: 'Strong (JJ-TT, AQ, KQ suited)',
  3: 'Playable (99-77, AJ, KJ/QJ suited)',
  4: 'Speculative (small pairs, suited aces, suited connectors)',
  5: 'Marginal (weak suited, weak broadways)',
  6: 'Trash'
};
function tierName(t) { return TIER_NAMES[t] || 'Unknown'; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    estimateEquity: estimateEquity, estimateEquityVsRange: estimateEquityVsRange,
    madeStrength: madeStrength,
    detectDraws: detectDraws, holeTier: holeTier, tierName: tierName, TIER_NAMES: TIER_NAMES
  };
}
