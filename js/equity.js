if (typeof module !== 'undefined' && module.exports) {
  var __ev = require('./evaluator.js');
  var evaluate7Fast = __ev.evaluate7Fast;
  var __cd = require('./cards.js');
  var rankChar = __cd.rankChar;
}

function _key(c) { return c.r * 10 + c.s; }

function drawRealizationDiscount(hc) {
  return (hc === 'draw' || hc === 'draw-weak' || hc === 'draw-strong') ? 0.05 : 0;
}

function seededRnd(seed) {
  var a = seed | 0;
  return function () {
    a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function normCdf(z) {
  var t = 1 / (1 + 0.2316419 * Math.abs(z));
  var d = 0.3989423 * Math.exp(-z * z / 2);
  var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function cardSeed(cards, extra) {
  var seed = 987654321;
  cards.forEach(function (c) { seed = (seed * 31 + c.r * 7 + c.s) % 2147483647; });
  seed = (seed * 31 + (extra || 0)) % 2147483647;
  return seed;
}

function estimateEquity(hole, community, opponents, iters, seed) {
  iters = iters || 300;
  opponents = Math.max(1, opponents || 1);
  var rnd = typeof seed === 'number' ? seededRnd(seed) : Math.random;
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

    var deck = full.slice();
    for (var d = 0; d < need; d++) {
      var j = d + Math.floor(rnd() * (deck.length - d));
      var t = deck[d]; deck[d] = deck[j]; deck[j] = t;
    }
    var board = community.concat(deck.slice(0, boardNeed));
    var myScore = evaluate7Fast(hole.concat(board)).score;
    var win = true, tie = false;
    for (var o = 0; o < opponents; o++) {
      var oh = [deck[boardNeed + o * 2], deck[boardNeed + o * 2 + 1]];
      var os = evaluate7Fast(oh.concat(board)).score;
      if (os > myScore) { win = false; break; }
      if (os === myScore) tie = true;
    }
    if (win) score += tie ? 0.5 : 1;
  }
  return score / iters;
}

function estimateEquityVsRange(hole, maxTier, iters) {
  iters = iters || 300;
  var seed = 987654321;
  hole.forEach(function (c) { seed = (seed * 31 + c.r * 7 + c.s) % 2147483647; });
  seed = (seed * 31 + maxTier) % 2147483647;
  var rnd = seededRnd(seed);
  var known = {};
  hole.forEach(function (c) { known[_key(c)] = 1; });
  var rest = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!known[_key({ r: r, s: s })]) rest.push({ r: r, s: s });

  var pool = [];
  for (var i = 0; i < rest.length; i++)
    for (var j = i + 1; j < rest.length; j++) {
      var h = [rest[i], rest[j]];
      if (holeTier(h) <= maxTier) pool.push(h);
    }
  if (!pool.length) return 0;

  var score = 0;
  for (var k = 0; k < iters; k++) {
    var vh = pool[Math.floor(rnd() * pool.length)];
    var vknown = {};
    vknown[_key(vh[0])] = 1; vknown[_key(vh[1])] = 1;
    hole.forEach(function (c) { vknown[_key(c)] = 1; });
    var deck = [];
    for (var s2 = 0; s2 < 4; s2++)
      for (var r2 = 2; r2 <= 14; r2++)
        if (!vknown[_key({ r: r2, s: s2 })]) deck.push({ r: r2, s: s2 });

    for (var d = 0; d < 5; d++) {
      var jj = d + Math.floor(rnd() * (deck.length - d));
      var t = deck[d]; deck[d] = deck[jj]; deck[jj] = t;
    }
    var board = deck.slice(0, 5);
    var myScore = evaluate7Fast(hole.concat(board)).score;
    var opScore = evaluate7Fast(vh.concat(board)).score;
    if (myScore > opScore) score += 1;
    else if (myScore === opScore) score += 0.5;
  }
  return score / iters;
}

function estimateEquityVsBoardClass(hole, community, iters, wantMade) {
  iters = iters || 150;
  var seed = 987654321;
  hole.concat(community).forEach(function (c) { seed = (seed * 31 + c.r * 7 + c.s) % 2147483647; });
  seed = (seed * 31 + (wantMade ? 1 : 0)) % 2147483647;
  var rnd = seededRnd(seed);
  var known = {};
  hole.concat(community).forEach(function (c) { known[_key(c)] = 1; });
  var rest = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!known[_key({ r: r, s: s })]) rest.push({ r: r, s: s });
  var pool = [];
  for (var i = 0; i < rest.length; i++)
    for (var j = i + 1; j < rest.length; j++) {
      var h = [rest[i], rest[j]];
      var made = evaluate7Fast(h.concat(community)).cat >= 1;
      if (made === wantMade) pool.push(h);
    }
  if (!pool.length) return null;
  var boardNeed = 5 - community.length;
  var score = 0;
  for (var k = 0; k < iters; k++) {
    var vh = pool[Math.floor(rnd() * pool.length)];
    var vknown = {};
    vknown[_key(vh[0])] = 1; vknown[_key(vh[1])] = 1;
    hole.concat(community).forEach(function (c) { vknown[_key(c)] = 1; });
    var deck = [];
    for (var s2 = 0; s2 < 4; s2++)
      for (var r2 = 2; r2 <= 14; r2++)
        if (!vknown[_key({ r: r2, s: s2 })]) deck.push({ r: r2, s: s2 });
    for (var d = 0; d < boardNeed; d++) {
      var jj = d + Math.floor(rnd() * (deck.length - d));
      var tmp = deck[d]; deck[d] = deck[jj]; deck[jj] = tmp;
    }
    var board = community.concat(deck.slice(0, boardNeed));
    var myScore = evaluate7Fast(hole.concat(board)).score;
    var opScore = evaluate7Fast(vh.concat(board)).score;
    if (myScore > opScore) score += 1;
    else if (myScore === opScore) score += 0.5;
  }
  return score / iters;
}
function estimateEquityVsMadeRange(hole, community, iters) {
  return estimateEquityVsBoardClass(hole, community, iters, true);
}
function pairRankOf(hole, community) {
  if (hole[0].r === hole[1].r) return hole[0].r;
  var ranks = {};
  community.forEach(function (c) { ranks[c.r] = 1; });
  if (ranks[hole[0].r]) return hole[0].r;
  if (ranks[hole[1].r]) return hole[1].r;
  return 0;
}
function estimateEquityVsMadePairPlus(hole, community, iters) {
  iters = iters || 150;
  var seed = 987654321;
  hole.concat(community).forEach(function (c) { seed = (seed * 31 + c.r * 7 + c.s) % 2147483647; });
  var rnd = seededRnd(seed);
  var heroPair = pairRankOf(hole, community);
  var known = {};
  hole.concat(community).forEach(function (c) { known[_key(c)] = 1; });
  var rest = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!known[_key({ r: r, s: s })]) rest.push({ r: r, s: s });
  var pool = [];
  for (var i = 0; i < rest.length; i++)
    for (var j = i + 1; j < rest.length; j++) {
      var h = [rest[i], rest[j]];
      var ev = evaluate7Fast(h.concat(community));
      if (ev.cat < 1) continue;
      if (ev.cat === 1 && heroPair > 0 && pairRankOf(h, community) < heroPair) continue;
      pool.push(h);
    }
  if (!pool.length) return null;
  var boardNeed = 5 - community.length;
  var score = 0;
  for (var k = 0; k < iters; k++) {
    var vh = pool[Math.floor(rnd() * pool.length)];
    var vknown = {};
    vknown[_key(vh[0])] = 1; vknown[_key(vh[1])] = 1;
    hole.concat(community).forEach(function (c) { vknown[_key(c)] = 1; });
    var deck = [];
    for (var s2 = 0; s2 < 4; s2++)
      for (var r2 = 2; r2 <= 14; r2++)
        if (!vknown[_key({ r: r2, s: s2 })]) deck.push({ r: r2, s: s2 });
    for (var d = 0; d < boardNeed; d++) {
      var jj = d + Math.floor(rnd() * (deck.length - d));
      var tmp = deck[d]; deck[d] = deck[jj]; deck[jj] = tmp;
    }
    var board = community.concat(deck.slice(0, boardNeed));
    var myScore = evaluate7Fast(hole.concat(board)).score;
    var opScore = evaluate7Fast(vh.concat(board)).score;
    if (myScore > opScore) score += 1;
    else if (myScore === opScore) score += 0.5;
  }
  return score / iters;
}
function estimateEquityVsBettingRange(hole, community, aggression, bluff, nOpp) {
  if (!hole || !community || community.length !== 5) return null;
  if (nOpp !== 1) return null;
  if (typeof aggression !== 'number' || typeof bluff !== 'number') return null;
  var boardKnown = {};
  community.forEach(function (c) { boardKnown[_key(c)] = 1; });
  var heroKnown = {};
  hole.forEach(function (c) { heroKnown[_key(c)] = 1; });
  var deck = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!boardKnown[_key({ r: r, s: s })]) deck.push({ r: r, s: s });
  var pool = [];
  for (var i = 0; i < deck.length; i++)
    for (var j = i + 1; j < deck.length; j++) pool.push([deck[i], deck[j]]);
  var scores = pool.map(function (h) { return evaluate7Fast(h.concat(community)).score; });
  var mss = pool.map(function (h) { return madeStrength(h, community); });
  var keys = pool.map(function (h) { return [_key(h[0]), _key(h[1])]; });
  var betLine = 0.62 - aggression * 0.22 + 0.04;
  var bluffP = bluff * (0.22 + bluff * 0.25);
  var myScore = evaluate7Fast(hole.concat(community)).score;
  var wTot = 0, wEq = 0;
  for (var a = 0; a < pool.length; a++) {
    if (heroKnown[keys[a][0]] || heroKnown[keys[a][1]]) continue;
    var tot = 0, sc = 0;
    for (var b = 0; b < pool.length; b++) {
      if (b === a) continue;
      if (heroKnown[keys[b][0]] || heroKnown[keys[b][1]]) continue;
      if (keys[b][0] === keys[a][0] || keys[b][0] === keys[a][1] ||
          keys[b][1] === keys[a][0] || keys[b][1] === keys[a][1]) continue;
      tot++;
      if (scores[a] > scores[b]) sc += 1;
      else if (scores[a] === scores[b]) sc += 0.5;
    }
    var eq1 = tot ? sc / tot : 0;
    var p = 0;
    if (mss[a] > 0.74) p = 1;
    else if (mss[a] >= 0.55) p = normCdf((eq1 - betLine) / 0.043);
    else if (mss[a] >= 0.40 && mss[a] < 0.55) { var ph = normCdf((eq1 - betLine) / 0.043); p = ph * (0.45 + aggression * 0.25) + (1 - ph) * bluffP; }
    else if (mss[a] < 0.55) p = bluffP;
    if (p <= 0) continue;
    wTot += p;
    if (myScore > scores[a]) wEq += p;
    else if (myScore === scores[a]) wEq += p * 0.5;
  }
  if (!wTot) return null;
  return wEq / wTot;
}
function estimateEquityVsBettingRangePostflop(hole, community, aggression, bluff) {
  if (!hole || !community || (community.length !== 3 && community.length !== 4)) return null;
  if (typeof aggression !== 'number' || typeof bluff !== 'number') return null;
  var boardNeed = 5 - community.length;
  var seed = 987654321;
  hole.concat(community).forEach(function (c) { seed = (seed * 31 + c.r * 7 + c.s) % 2147483647; });
  seed = (seed * 31 + Math.round(aggression * 1000) + Math.round(bluff * 1000)) % 2147483647;
  var rnd = seededRnd(seed);
  var boardKnown = {};
  community.forEach(function (c) { boardKnown[_key(c)] = 1; });
  var rest = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!boardKnown[_key({ r: r, s: s })]) rest.push({ r: r, s: s });
  var heroKnown = {};
  hole.forEach(function (c) { heroKnown[_key(c)] = 1; });
  var betLine = 0.62 - aggression * 0.22;
  var bluffP = bluff * (0.22 + bluff * 0.25) * 0.55;
  var holdings = [];
  var pBet = [];
  for (var i = 0; i < rest.length; i++) {
    for (var j = i + 1; j < rest.length; j++) {
      var h = [rest[i], rest[j]];
      if (heroKnown[_key(h[0])] || heroKnown[_key(h[1])]) continue;
      holdings.push(h);
      var ms = madeStrengthEv(evaluate7Fast(h.concat(community)), h, community);
      var rem = [];
      for (var k = 0; k < rest.length; k++) if (k !== i && k !== j && !heroKnown[_key(rest[k])]) rem.push(rest[k]);
      var wins = 0;
      for (var q = 0; q < 400; q++) {
        var need = boardNeed + 2;
        for (var d = 0; d < need; d++) {
          var jj = d + Math.floor(rnd() * (rem.length - d));
          var tmp = rem[d]; rem[d] = rem[jj]; rem[jj] = tmp;
        }
        var board2 = community.concat(rem.slice(0, boardNeed));
        var opp = [rem[boardNeed], rem[boardNeed + 1]];
        var hs = evaluate7Fast(h.concat(board2)).score;
        var os = evaluate7Fast(opp.concat(board2)).score;
        if (hs > os) wins += 1;
        else if (hs === os) wins += 0.5;
      }
      var eq1 = wins / 400;
      var p = 0;
      if (ms > 0.74) p = 1;
      else if (ms >= 0.55) p = normCdf((eq1 - betLine) / 0.05);
      else if (ms < 0.55) {
        var ld = detectDraws(h, community);
        if (ld.flushDraw || ld.oesd) p = 0.25 + aggression * 0.35;
        else if (ld.gutshot) p = 0.12 + aggression * 0.2;
        else if (ms >= 0.40) { var ph = normCdf((eq1 - betLine) / 0.05); p = ph * (0.45 + aggression * 0.25) + (1 - ph) * bluffP; }
        else p = bluffP;
      }
      pBet.push(p);
    }
  }
  var deck = [];
  var hk = {};
  hole.concat(community).forEach(function (c) { hk[_key(c)] = 1; });
  for (var s2 = 0; s2 < 4; s2++)
    for (var r2 = 2; r2 <= 14; r2++)
      if (!hk[_key({ r: r2, s: s2 })]) deck.push({ r: r2, s: s2 });
  var wTot = 0, wEq = 0, acc = 0, att = 0;
  while (acc < 24000 && att < 720000) {
    att++;
    var idx = Math.floor(rnd() * holdings.length);
    var vh = holdings[idx];
    var pv = pBet[idx];
    if (pv <= 0 || rnd() > pv) continue;
    var pool = deck.filter(function (c) { return _key(c) !== _key(vh[0]) && _key(c) !== _key(vh[1]); });
    for (var d2 = 0; d2 < boardNeed; d2++) {
      var j2 = d2 + Math.floor(rnd() * (pool.length - d2));
      var tmp2 = pool[d2]; pool[d2] = pool[j2]; pool[j2] = tmp2;
    }
    var full = community.concat(pool.slice(0, boardNeed));
    var hs2 = evaluate7Fast(hole.concat(full)).score;
    var vs2 = evaluate7Fast(vh.concat(full)).score;
    acc++;
    wTot += 1;
    if (hs2 > vs2) wEq += 1;
    else if (hs2 === vs2) wEq += 0.5;
  }
  if (!wTot) return null;
  return wEq / wTot;
}
function estimateEquityVsBettingRangeMulti(hole, community, aggression, bluff, extraTiers) {
  if (!hole || !community || (community.length !== 3 && community.length !== 4 && community.length !== 5)) return null;
  if (typeof aggression !== 'number' || typeof bluff !== 'number') return null;
  var river = community.length === 5;
  var boardNeed = 5 - community.length;
  var seed = 987654321;
  hole.concat(community).forEach(function (c) { seed = (seed * 31 + c.r * 7 + c.s) % 2147483647; });
  seed = (seed * 31 + Math.round(aggression * 1000) + Math.round(bluff * 1000)) % 2147483647;
  (extraTiers || []).forEach(function (t) { seed = (seed * 31 + (t || 0)) % 2147483647; });
  var rnd = seededRnd(seed);
  var boardKnown = {};
  community.forEach(function (c) { boardKnown[_key(c)] = 1; });
  var rest = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!boardKnown[_key({ r: r, s: s })]) rest.push({ r: r, s: s });
  var heroKnown = {};
  hole.forEach(function (c) { heroKnown[_key(c)] = 1; });
  var betLine = 0.62 - aggression * 0.22 + (river ? 0.04 : 0);
  var bluffP = bluff * ((extraTiers || []).length ? 0.10 : (0.22 + bluff * 0.25)) * (river ? 1 : 0.55);
  var holdings = [];
  var pBet = [];
  if (river) {
    var pool = [];
    for (var i = 0; i < rest.length; i++)
      for (var j = i + 1; j < rest.length; j++) pool.push([rest[i], rest[j]]);
    var scores = pool.map(function (h) { return evaluate7Fast(h.concat(community)).score; });
    var mss = pool.map(function (h) { return madeStrength(h, community); });
    var keys = pool.map(function (h) { return [_key(h[0]), _key(h[1])]; });
    for (var a = 0; a < pool.length; a++) {
      if (heroKnown[keys[a][0]] || heroKnown[keys[a][1]]) continue;
      var tot = 0, sc = 0;
      for (var b = 0; b < pool.length; b++) {
        if (b === a) continue;
        if (heroKnown[keys[b][0]] || heroKnown[keys[b][1]]) continue;
        if (keys[b][0] === keys[a][0] || keys[b][0] === keys[a][1] ||
            keys[b][1] === keys[a][0] || keys[b][1] === keys[a][1]) continue;
        tot++;
        if (scores[a] > scores[b]) sc += 1;
        else if (scores[a] === scores[b]) sc += 0.5;
      }
      var eq1 = tot ? sc / tot : 0;
      var p = 0;
      if (mss[a] > 0.74) p = 1;
      else if (mss[a] >= 0.55) p = normCdf((eq1 - betLine) / 0.043);
      else if (mss[a] >= 0.40 && mss[a] < 0.55) { var ph = normCdf((eq1 - betLine) / 0.043); p = ph * (0.45 + aggression * 0.25) + (1 - ph) * bluffP; }
      else if (mss[a] < 0.55) p = bluffP;
      holdings.push(pool[a]);
      pBet.push(p);
    }
  } else {
    for (var i2 = 0; i2 < rest.length; i2++) {
      for (var j2 = i2 + 1; j2 < rest.length; j2++) {
        var h = [rest[i2], rest[j2]];
        if (heroKnown[_key(h[0])] || heroKnown[_key(h[1])]) continue;
        holdings.push(h);
        var ms = madeStrengthEv(evaluate7Fast(h.concat(community)), h, community);
        var rem = [];
        for (var k = 0; k < rest.length; k++) if (k !== i2 && k !== j2 && !heroKnown[_key(rest[k])]) rem.push(rest[k]);
        var wins = 0;
        for (var q = 0; q < 400; q++) {
          var need = boardNeed + 2;
          for (var d = 0; d < need; d++) {
            var jj = d + Math.floor(rnd() * (rem.length - d));
            var tmp = rem[d]; rem[d] = rem[jj]; rem[jj] = tmp;
          }
          var board2 = community.concat(rem.slice(0, boardNeed));
          var opp = [rem[boardNeed], rem[boardNeed + 1]];
          var hs = evaluate7Fast(h.concat(board2)).score;
          var os = evaluate7Fast(opp.concat(board2)).score;
          if (hs > os) wins += 1;
          else if (hs === os) wins += 0.5;
        }
        var eq1b = wins / 400;
        var p2 = 0;
        if (ms > 0.74) p2 = 1;
        else if (ms >= 0.55) p2 = normCdf((eq1b - betLine) / 0.05);
        else if (ms < 0.55) {
          var ld2 = detectDraws(h, community);
          if (ld2.flushDraw || ld2.oesd) p2 = 0.25 + aggression * 0.35;
          else if (ld2.gutshot) p2 = 0.12 + aggression * 0.2;
          else if (ms >= 0.40) { var ph2 = normCdf((eq1b - betLine) / 0.05); p2 = ph2 * (0.45 + aggression * 0.25) + (1 - ph2) * bluffP; }
          else p2 = bluffP;
        }
        pBet.push(p2);
      }
    }
  }
  var extraPools = (extraTiers || []).map(function (tier) {
    if (!tier) return null;
    var p3 = [];
    for (var i3 = 0; i3 < rest.length; i3++)
      for (var j3 = i3 + 1; j3 < rest.length; j3++) {
        var h3 = [rest[i3], rest[j3]];
        if (heroKnown[_key(h3[0])] || heroKnown[_key(h3[1])]) continue;
        if (holeTier(h3) <= Math.min(6, Math.max(1, tier))) p3.push(h3);
      }
    return p3;
  });
  var deck = [];
  var hk = {};
  hole.concat(community).forEach(function (c) { hk[_key(c)] = 1; });
  for (var s2 = 0; s2 < 4; s2++)
    for (var r2 = 2; r2 <= 14; r2++)
      if (!hk[_key({ r: r2, s: s2 })]) deck.push({ r: r2, s: s2 });
  var wTot = 0, wEq = 0, acc = 0, att = 0;
  while (acc < 24000 && att < 720000) {
    att++;
    var idx = Math.floor(rnd() * holdings.length);
    var vh = holdings[idx];
    var pv = pBet[idx];
    if (pv <= 0 || rnd() > pv) continue;
    var picked = {};
    picked[_key(vh[0])] = 1; picked[_key(vh[1])] = 1;
    var hands = [vh];
    var ok = true;
    for (var e = 0; e < extraPools.length; e++) {
      var h2 = null;
      for (var t = 0; t < 60; t++) {
        var cand;
        if (extraPools[e]) cand = extraPools[e][Math.floor(rnd() * extraPools[e].length)];
        else {
          var a2 = Math.floor(rnd() * rest.length);
          var b2 = Math.floor(rnd() * rest.length);
          if (a2 === b2) continue;
          cand = [rest[a2], rest[b2]];
        }
        if (heroKnown[_key(cand[0])] || heroKnown[_key(cand[1])]) continue;
        if (!picked[_key(cand[0])] && !picked[_key(cand[1])]) { h2 = cand; break; }
      }
      if (!h2) { ok = false; break; }
      picked[_key(h2[0])] = 1; picked[_key(h2[1])] = 1;
      hands.push(h2);
    }
    if (!ok) continue;
    var pool2 = deck.filter(function (c) { return !picked[_key(c)]; });
    for (var d2 = 0; d2 < boardNeed; d2++) {
      var jj2 = d2 + Math.floor(rnd() * (pool2.length - d2));
      var tmp2 = pool2[d2]; pool2[d2] = pool2[jj2]; pool2[jj2] = tmp2;
    }
    var full = community.concat(pool2.slice(0, boardNeed));
    var myScore = evaluate7Fast(hole.concat(full)).score;
    var best = true, strict = true;
    hands.forEach(function (hh) {
      var os2 = evaluate7Fast(hh.concat(full)).score;
      if (os2 > myScore) { best = false; strict = false; }
      else if (os2 === myScore) strict = false;
    });
    acc++;
    wTot += 1;
    if (strict) wEq += 1;
    else if (best) wEq += 0.5;
  }
  if (!wTot) return null;
  return wEq / wTot;
}
function raiseProb(holding, ms, eq1, community, aggression, bluff, margin, needV, station) {
  var d = detectDraws(holding, community);
  var noDraw = !d.flushDraw && !d.oesd;
  var foldMs = station ? 0.15 : 0.30;
  var foldNeed = station ? 0.30 : 0.25;
  if (ms < foldMs && noDraw && needV >= foldNeed) return 0;
  if (eq1 > needV + margin) return eq1 > 0.74 ? aggression * 0.55 : 0;
  if (ms > 0.22 && eq1 > 0.25) return bluff * 0.16;
  return 0;
}
function estimateEquityVsRaiseRange(hole, community, aggression, bluff, stubborn, needV, station) {
  if (!hole || !community || community.length !== 5) return null;
  if (typeof aggression !== 'number' || typeof bluff !== 'number' || typeof stubborn !== 'number' || typeof needV !== 'number') return null;
  var boardKnown = {};
  community.forEach(function (c) { boardKnown[_key(c)] = 1; });
  var heroKnown = {};
  hole.forEach(function (c) { heroKnown[_key(c)] = 1; });
  var deck = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!boardKnown[_key({ r: r, s: s })]) deck.push({ r: r, s: s });
  var pool = [];
  for (var i = 0; i < deck.length; i++)
    for (var j = i + 1; j < deck.length; j++) pool.push([deck[i], deck[j]]);
  var scores = pool.map(function (h) { return evaluate7Fast(h.concat(community)).score; });
  var mss = pool.map(function (h) { return madeStrength(h, community); });
  var keys = pool.map(function (h) { return [_key(h[0]), _key(h[1])]; });
  var margin = (0.5 - stubborn) * 0.12 + 0.03;
  var myScore = evaluate7Fast(hole.concat(community)).score;
  var wTot = 0, wEq = 0;
  for (var a = 0; a < pool.length; a++) {
    if (heroKnown[keys[a][0]] || heroKnown[keys[a][1]]) continue;
    var tot = 0, sc = 0;
    for (var b = 0; b < pool.length; b++) {
      if (b === a) continue;
      if (heroKnown[keys[b][0]] || heroKnown[keys[b][1]]) continue;
      if (keys[b][0] === keys[a][0] || keys[b][0] === keys[a][1] ||
          keys[b][1] === keys[a][0] || keys[b][1] === keys[a][1]) continue;
      tot++;
      if (scores[a] > scores[b]) sc += 1;
      else if (scores[a] === scores[b]) sc += 0.5;
    }
    var eq1 = tot ? sc / tot : 0;
    var p = raiseProb(pool[a], mss[a], eq1, community, aggression, bluff, margin, needV, station);
    if (p <= 0) continue;
    wTot += p;
    if (myScore > scores[a]) wEq += p;
    else if (myScore === scores[a]) wEq += p * 0.5;
  }
  if (!wTot) return null;
  return wEq / wTot;
}
function estimateEquityVsRaiseRangePostflop(hole, community, aggression, bluff, stubborn, needV, station) {
  if (!hole || !community || (community.length !== 3 && community.length !== 4)) return null;
  if (typeof aggression !== 'number' || typeof bluff !== 'number' || typeof stubborn !== 'number' || typeof needV !== 'number') return null;
  var boardNeed = 5 - community.length;
  var seed = 987654321;
  hole.concat(community).forEach(function (c) { seed = (seed * 31 + c.r * 7 + c.s) % 2147483647; });
  seed = (seed * 31 + Math.round(aggression * 1000) + Math.round(bluff * 1000) + Math.round(stubborn * 1000) + Math.round(needV * 1000)) % 2147483647;
  var rnd = seededRnd(seed);
  var boardKnown = {};
  community.forEach(function (c) { boardKnown[_key(c)] = 1; });
  var rest = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!boardKnown[_key({ r: r, s: s })]) rest.push({ r: r, s: s });
  var heroKnown = {};
  hole.forEach(function (c) { heroKnown[_key(c)] = 1; });
  var margin = (0.5 - stubborn) * 0.12;
  var holdings = [];
  var pRaise = [];
  for (var i = 0; i < rest.length; i++) {
    for (var j = i + 1; j < rest.length; j++) {
      var h = [rest[i], rest[j]];
      if (heroKnown[_key(h[0])] || heroKnown[_key(h[1])]) continue;
      holdings.push(h);
      var ms = madeStrengthEv(evaluate7Fast(h.concat(community)), h, community);
      var rem = [];
      for (var k = 0; k < rest.length; k++) if (k !== i && k !== j && !heroKnown[_key(rest[k])]) rem.push(rest[k]);
      var wins = 0;
      for (var q = 0; q < 100; q++) {
        var need = boardNeed + 2;
        for (var d = 0; d < need; d++) {
          var jj = d + Math.floor(rnd() * (rem.length - d));
          var tmp = rem[d]; rem[d] = rem[jj]; rem[jj] = tmp;
        }
        var board2 = community.concat(rem.slice(0, boardNeed));
        var opp = [rem[boardNeed], rem[boardNeed + 1]];
        var hs = evaluate7Fast(h.concat(board2)).score;
        var os = evaluate7Fast(opp.concat(board2)).score;
        if (hs > os) wins += 1;
        else if (hs === os) wins += 0.5;
      }
      var eq1 = wins / 100;
      pRaise.push(raiseProb(h, ms, eq1, community, aggression, bluff, margin, needV, station));
    }
  }
  var deck = [];
  var hk = {};
  hole.concat(community).forEach(function (c) { hk[_key(c)] = 1; });
  for (var s2 = 0; s2 < 4; s2++)
    for (var r2 = 2; r2 <= 14; r2++)
      if (!hk[_key({ r: r2, s: s2 })]) deck.push({ r: r2, s: s2 });
  var wTot = 0, wEq = 0, acc = 0, att = 0;
  while (acc < 6000 && att < 180000) {
    att++;
    var idx = Math.floor(rnd() * holdings.length);
    var vh = holdings[idx];
    var pv = pRaise[idx];
    if (pv <= 0 || rnd() > pv) continue;
    var pool = deck.filter(function (c) { return _key(c) !== _key(vh[0]) && _key(c) !== _key(vh[1]); });
    for (var d2 = 0; d2 < boardNeed; d2++) {
      var j2 = d2 + Math.floor(rnd() * (pool.length - d2));
      var tmp2 = pool[d2]; pool[d2] = pool[j2]; pool[j2] = tmp2;
    }
    var full = community.concat(pool.slice(0, boardNeed));
    var hs2 = evaluate7Fast(hole.concat(full)).score;
    var vs2 = evaluate7Fast(vh.concat(full)).score;
    acc++;
    wTot += 1;
    if (hs2 > vs2) wEq += 1;
    else if (hs2 === vs2) wEq += 0.5;
  }
  if (!wTot) return null;
  return wEq / wTot;
}
function isWetBoard(community) {
  var suits = [0, 0, 0, 0];
  community.forEach(function (c) { suits[c.s]++; });
  if (suits.some(function (n) { return n === 3; })) return true;
  var seen = {};
  community.forEach(function (c) { seen[c.r] = true; });
  var rs = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  for (var i = 0; i + 2 < rs.length; i++) {
    if (rs[i + 2] - rs[i] <= 4) return true;
  }
  return false;
}
function customBetProb(villainId, holding, ms, eq1, community, aggression, bluff, isRiver, isMulti) {
  if (villainId === 'alice') {
    if (ms >= 0.52) return 1;
    if (eq1 < 0.62) return 0;
    if (ms < 0.40) return 0.35;
    return 0.60;
  }
  if (villainId === 'nathan') {
    return ms > 0.78 ? (isRiver ? 0.75 : 1) : 0;
  }
  if (villainId === 'amogh') {
    var betLine = 0.62 - aggression * 0.12 + (isRiver ? 0.04 : 0);
    var wantsBet = eq1 > betLine || ms > 0.74;
    var d = detectDraws(holding, community);
    var hasDraw = d.flushDraw || d.oesd;
    if (ms >= 0.3 && ms <= 0.6 && !isRiver && !hasDraw) return wantsBet ? 0.3 : 0;
    if (!wantsBet) {
      if (ms >= 0.3) return 0;
      var bluffP = bluff * (isMulti ? 0.12 : 0.30) * (isRiver ? 1 : 0.55);
      return (hasDraw && ms < 0.55) ? bluffP * 0.65 : 0;
    }
    return (hasDraw && ms < 0.55) ? 0.65 : 1;
  }
  if (villainId === 'donald') {
    var dd = detectDraws(holding, community);
    var hasDrawD = dd.flushDraw || dd.oesd;
    var hasGutD = !hasDrawD && dd.gutshot;
    var pDraw = (hasDrawD && ms < 0.55) ? 0.65 : 0;
    var pWet = (ms >= 0.4 && ms < 0.78 && isWetBoard(community) && !isRiver) ? 0.7 : 0;
    var betLineD = 0.62 - aggression * 0.22 + (isRiver ? 0.04 : 0);
    var semiD = 0;
    if (hasDrawD && ms < 0.55) semiD = 0.25 + aggression * 0.35;
    else if (hasGutD && ms < 0.55) semiD = 0.12 + aggression * 0.2;
    var pGenD = 0;
    if (ms > 0.74) pGenD = 1;
    else if (ms >= 0.55 && eq1 > betLineD) pGenD = 1;
    else if (semiD > 0) pGenD = semiD;
    else if (ms >= 0.4 && ms < 0.55 && eq1 > betLineD) pGenD = 0.45 + aggression * 0.25;
    else if (ms < 0.55) pGenD = bluff * (0.22 + bluff * 0.25) * (isRiver ? 1 : 0.55);
    var baseD = pDraw + (1 - pDraw) * pWet;
    return baseD + (1 - baseD) * pGenD;
  }
  return 0;
}
function estimateEquityVsBettingRangeCustom(hole, community, villainId, aggression, bluff) {
  if (!hole || !community || community.length !== 5) return null;
  if (typeof aggression !== 'number' || typeof bluff !== 'number') return null;
  var boardKnown = {};
  community.forEach(function (c) { boardKnown[_key(c)] = 1; });
  var heroKnown = {};
  hole.forEach(function (c) { heroKnown[_key(c)] = 1; });
  var deck = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!boardKnown[_key({ r: r, s: s })]) deck.push({ r: r, s: s });
  var pool = [];
  for (var i = 0; i < deck.length; i++)
    for (var j = i + 1; j < deck.length; j++) pool.push([deck[i], deck[j]]);
  var scores = pool.map(function (h) { return evaluate7Fast(h.concat(community)).score; });
  var mss = pool.map(function (h) { return madeStrength(h, community); });
  var keys = pool.map(function (h) { return [_key(h[0]), _key(h[1])]; });
  var myScore = evaluate7Fast(hole.concat(community)).score;
  var wTot = 0, wEq = 0;
  for (var a = 0; a < pool.length; a++) {
    if (heroKnown[keys[a][0]] || heroKnown[keys[a][1]]) continue;
    var tot = 0, sc = 0;
    for (var b = 0; b < pool.length; b++) {
      if (b === a) continue;
      if (keys[b][0] === keys[a][0] || keys[b][0] === keys[a][1] ||
          keys[b][1] === keys[a][0] || keys[b][1] === keys[a][1]) continue;
      tot++;
      if (scores[a] > scores[b]) sc += 1;
      else if (scores[a] === scores[b]) sc += 0.5;
    }
    var eq1 = tot ? sc / tot : 0;
    var p = customBetProb(villainId, pool[a], mss[a], eq1, community, aggression, bluff, true);
    if (p <= 0) continue;
    wTot += p;
    if (myScore > scores[a]) wEq += p;
    else if (myScore === scores[a]) wEq += p * 0.5;
  }
  if (!wTot) return null;
  return wEq / wTot;
}
function estimateEquityVsBettingRangeCustomPostflop(hole, community, villainId, aggression, bluff) {
  if (!hole || !community || (community.length !== 3 && community.length !== 4)) return null;
  if (typeof aggression !== 'number' || typeof bluff !== 'number') return null;
  var boardNeed = 5 - community.length;
  var seed = 987654321;
  hole.concat(community).forEach(function (c) { seed = (seed * 31 + c.r * 7 + c.s) % 2147483647; });
  seed = (seed * 31 + Math.round(aggression * 1000) + Math.round(bluff * 1000) + villainId.length) % 2147483647;
  var rnd = seededRnd(seed);
  var boardKnown = {};
  community.forEach(function (c) { boardKnown[_key(c)] = 1; });
  var rest = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!boardKnown[_key({ r: r, s: s })]) rest.push({ r: r, s: s });
  var heroKnown = {};
  hole.forEach(function (c) { heroKnown[_key(c)] = 1; });
  var holdings = [];
  var pBet = [];
  for (var i = 0; i < rest.length; i++) {
    for (var j = i + 1; j < rest.length; j++) {
      var h = [rest[i], rest[j]];
      if (heroKnown[_key(h[0])] || heroKnown[_key(h[1])]) continue;
      holdings.push(h);
      var ms = madeStrengthEv(evaluate7Fast(h.concat(community)), h, community);
      var rem = [];
      for (var k = 0; k < rest.length; k++) if (k !== i && k !== j) rem.push(rest[k]);
      var wins = 0;
      for (var q = 0; q < 100; q++) {
        var need = boardNeed + 2;
        for (var d = 0; d < need; d++) {
          var jj = d + Math.floor(rnd() * (rem.length - d));
          var tmp = rem[d]; rem[d] = rem[jj]; rem[jj] = tmp;
        }
        var board2 = community.concat(rem.slice(0, boardNeed));
        var opp = [rem[boardNeed], rem[boardNeed + 1]];
        var hs = evaluate7Fast(h.concat(board2)).score;
        var os = evaluate7Fast(opp.concat(board2)).score;
        if (hs > os) wins += 1;
        else if (hs === os) wins += 0.5;
      }
      var eq1 = wins / 100;
      pBet.push(customBetProb(villainId, h, ms, eq1, community, aggression, bluff, false));
    }
  }
  var deck = [];
  var hk = {};
  hole.concat(community).forEach(function (c) { hk[_key(c)] = 1; });
  for (var s2 = 0; s2 < 4; s2++)
    for (var r2 = 2; r2 <= 14; r2++)
      if (!hk[_key({ r: r2, s: s2 })]) deck.push({ r: r2, s: s2 });
  var wTot = 0, wEq = 0, acc = 0, att = 0;
  while (acc < 6000 && att < 180000) {
    att++;
    var idx = Math.floor(rnd() * holdings.length);
    var vh = holdings[idx];
    var pv = pBet[idx];
    if (pv <= 0 || rnd() > pv) continue;
    var pool = deck.filter(function (c) { return _key(c) !== _key(vh[0]) && _key(c) !== _key(vh[1]); });
    for (var d2 = 0; d2 < boardNeed; d2++) {
      var j2 = d2 + Math.floor(rnd() * (pool.length - d2));
      var tmp2 = pool[d2]; pool[d2] = pool[j2]; pool[j2] = tmp2;
    }
    var full = community.concat(pool.slice(0, boardNeed));
    var hs2 = evaluate7Fast(hole.concat(full)).score;
    var vs2 = evaluate7Fast(vh.concat(full)).score;
    acc++;
    wTot += 1;
    if (hs2 > vs2) wEq += 1;
    else if (hs2 === vs2) wEq += 0.5;
  }
  if (!wTot) return null;
  return wEq / wTot;
}
function estimateEquityVsBettingRangeCustomMulti(hole, community, villainId, aggression, bluff, extraTiers) {
  if (!hole || !community || (community.length !== 3 && community.length !== 4)) return null;
  if (typeof aggression !== 'number' || typeof bluff !== 'number') return null;
  var boardNeed = 5 - community.length;
  var seed = 987654321;
  hole.concat(community).forEach(function (c) { seed = (seed * 31 + c.r * 7 + c.s) % 2147483647; });
  seed = (seed * 31 + Math.round(aggression * 1000) + Math.round(bluff * 1000) + villainId.length) % 2147483647;
  (extraTiers || []).forEach(function (t) { seed = (seed * 31 + (t || 0)) % 2147483647; });
  var rnd = seededRnd(seed);
  var boardKnown = {};
  community.forEach(function (c) { boardKnown[_key(c)] = 1; });
  var rest = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!boardKnown[_key({ r: r, s: s })]) rest.push({ r: r, s: s });
  var heroKnown = {};
  hole.forEach(function (c) { heroKnown[_key(c)] = 1; });
  var nOpp = Math.min(3, (extraTiers || []).length + 1);
  var holdings = [];
  var pBet = [];
  for (var i = 0; i < rest.length; i++) {
    for (var j = i + 1; j < rest.length; j++) {
      var h = [rest[i], rest[j]];
      if (heroKnown[_key(h[0])] || heroKnown[_key(h[1])]) continue;
      holdings.push(h);
      var ms = madeStrengthEv(evaluate7Fast(h.concat(community)), h, community);
      var rem = [];
      for (var k = 0; k < rest.length; k++) {
        if (k === i || k === j) continue;
        rem.push(rest[k]);
      }
      var wins = 0;
      for (var q = 0; q < 100; q++) {
        var need = boardNeed + 2 * nOpp;
        for (var d = 0; d < need; d++) {
          var jj = d + Math.floor(rnd() * (rem.length - d));
          var tmp = rem[d]; rem[d] = rem[jj]; rem[jj] = tmp;
        }
        var board2 = community.concat(rem.slice(0, boardNeed));
        var hs = evaluate7Fast(h.concat(board2)).score;
        var win = true, tie = false;
        for (var o = 0; o < nOpp; o++) {
          var opp = [rem[boardNeed + o * 2], rem[boardNeed + o * 2 + 1]];
          var os = evaluate7Fast(opp.concat(board2)).score;
          if (os > hs) { win = false; break; }
          if (os === hs) tie = true;
        }
        if (win) wins += tie ? 0.5 : 1;
      }
      var eq1 = wins / 100;
      pBet.push(customBetProb(villainId, h, ms, eq1, community, aggression, bluff, false, nOpp > 1));
    }
  }
  var extraPools = (extraTiers || []).map(function (tier) {
    if (!tier) return null;
    var p3 = [];
    for (var i3 = 0; i3 < rest.length; i3++)
      for (var j3 = i3 + 1; j3 < rest.length; j3++) {
        var h3 = [rest[i3], rest[j3]];
        if (heroKnown[_key(h3[0])] || heroKnown[_key(h3[1])]) continue;
        if (holeTier(h3) <= Math.min(6, Math.max(1, tier))) p3.push(h3);
      }
    return p3;
  });
  var deck = [];
  var hk = {};
  hole.concat(community).forEach(function (c) { hk[_key(c)] = 1; });
  for (var s2 = 0; s2 < 4; s2++)
    for (var r2 = 2; r2 <= 14; r2++)
      if (!hk[_key({ r: r2, s: s2 })]) deck.push({ r: r2, s: s2 });
  var wTot = 0, wEq = 0, acc = 0, att = 0;
  while (acc < 6000 && att < 180000) {
    att++;
    var idx = Math.floor(rnd() * holdings.length);
    var vh = holdings[idx];
    var pv = pBet[idx];
    if (pv <= 0 || rnd() > pv) continue;
    var picked = {};
    picked[_key(vh[0])] = 1; picked[_key(vh[1])] = 1;
    var hands = [vh];
    var ok = true;
    for (var e = 0; e < extraPools.length; e++) {
      var h2 = null;
      for (var t = 0; t < 60; t++) {
        var cand;
        if (extraPools[e]) cand = extraPools[e][Math.floor(rnd() * extraPools[e].length)];
        else {
          var a2 = Math.floor(rnd() * rest.length);
          var b2 = Math.floor(rnd() * rest.length);
          if (a2 === b2) continue;
          cand = [rest[a2], rest[b2]];
        }
        if (heroKnown[_key(cand[0])] || heroKnown[_key(cand[1])]) continue;
        if (!picked[_key(cand[0])] && !picked[_key(cand[1])]) { h2 = cand; break; }
      }
      if (!h2) { ok = false; break; }
      picked[_key(h2[0])] = 1; picked[_key(h2[1])] = 1;
      hands.push(h2);
    }
    if (!ok) continue;
    var pool2 = deck.filter(function (c) { return !picked[_key(c)]; });
    for (var d2 = 0; d2 < boardNeed; d2++) {
      var jj2 = d2 + Math.floor(rnd() * (pool2.length - d2));
      var tmp2 = pool2[d2]; pool2[d2] = pool2[jj2]; pool2[jj2] = tmp2;
    }
    var full = community.concat(pool2.slice(0, boardNeed));
    var myScore = evaluate7Fast(hole.concat(full)).score;
    var best = true, strict = true;
    hands.forEach(function (hh) {
      var os2 = evaluate7Fast(hh.concat(full)).score;
      if (os2 > myScore) { best = false; strict = false; }
      else if (os2 === myScore) strict = false;
    });
    acc++;
    wTot += 1;
    if (strict) wEq += 1;
    else if (best) wEq += 0.5;
  }
  if (!wTot) return null;
  return wEq / wTot;
}
function estimateEquityVsRangePostflop(hole, community, maxTier, iters) {
  iters = iters || 150;
  maxTier = Math.min(6, Math.max(1, maxTier || 3));
  if (community.length === 5) {
    var exact = estimateEquityVsRangePostflopExact(hole, community, maxTier);
    if (exact != null) return exact;
  }
  var seed = 987654321;
  hole.concat(community).forEach(function (c) { seed = (seed * 31 + c.r * 7 + c.s) % 2147483647; });
  seed = (seed * 31 + maxTier) % 2147483647;
  var rnd = seededRnd(seed);
  var known = {};
  hole.concat(community).forEach(function (c) { known[_key(c)] = 1; });
  var rest = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!known[_key({ r: r, s: s })]) rest.push({ r: r, s: s });

  var pool = [];
  for (var i = 0; i < rest.length; i++)
    for (var j = i + 1; j < rest.length; j++) {
      var h = [rest[i], rest[j]];
      if (holeTier(h) <= maxTier) pool.push(h);
    }
  if (!pool.length) return 0;
  var boardNeed = 5 - community.length;
  var score = 0;
  for (var k = 0; k < iters; k++) {
    var vh = pool[Math.floor(rnd() * pool.length)];
    var vknown = {};
    vknown[_key(vh[0])] = 1; vknown[_key(vh[1])] = 1;
    hole.concat(community).forEach(function (c) { vknown[_key(c)] = 1; });
    var deck = [];
    for (var s2 = 0; s2 < 4; s2++)
      for (var r2 = 2; r2 <= 14; r2++)
        if (!vknown[_key({ r: r2, s: s2 })]) deck.push({ r: r2, s: s2 });

    for (var d = 0; d < boardNeed; d++) {
      var jj = d + Math.floor(rnd() * (deck.length - d));
      var tmp = deck[d]; deck[d] = deck[jj]; deck[jj] = tmp;
    }
    var board = community.concat(deck.slice(0, boardNeed));
    var myScore = evaluate7Fast(hole.concat(board)).score;
    var opScore = evaluate7Fast(vh.concat(board)).score;
    if (myScore > opScore) score += 1;
    else if (myScore === opScore) score += 0.5;
  }
  return score / iters;
}

function estimateEquityVsRangePostflopExact(hole, community, maxTier) {
  if (!hole || !community || community.length !== 5) return null;
  maxTier = Math.min(6, Math.max(1, maxTier || 3));
  var known = {};
  hole.concat(community).forEach(function (c) { known[_key(c)] = 1; });
  var rest = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!known[_key({ r: r, s: s })]) rest.push({ r: r, s: s });
  var myScore = evaluate7Fast(hole.concat(community)).score;
  var total = 0, score = 0;
  for (var i = 0; i < rest.length; i++)
    for (var j = i + 1; j < rest.length; j++) {
      var h = [rest[i], rest[j]];
      if (holeTier(h) > maxTier) continue;
      total++;
      var os = evaluate7Fast(h.concat(community)).score;
      if (myScore > os) score += 1;
      else if (myScore === os) score += 0.5;
    }
  if (!total) return null;
  return score / total;
}

function estimateEquityVsRanges(hole, community, tiers, iters) {
  iters = iters || 300;
  var seed = 987654321;
  hole.concat(community).forEach(function (c) { seed = (seed * 31 + c.r * 7 + c.s) % 2147483647; });
  tiers.forEach(function (t) { seed = (seed * 31 + (t || 0)) % 2147483647; });
  var rnd = seededRnd(seed);
  var known = {};
  hole.concat(community).forEach(function (c) { known[_key(c)] = 1; });
  var rest = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!known[_key({ r: r, s: s })]) rest.push({ r: r, s: s });
  var pools = tiers.map(function (tier) {
    if (!tier) return null;
    var p = [];
    for (var i = 0; i < rest.length; i++)
      for (var j = i + 1; j < rest.length; j++) {
        var h = [rest[i], rest[j]];
        if (holeTier(h) <= Math.min(6, Math.max(1, tier))) p.push(h);
      }
    return p;
  });
  var boardNeed = 5 - community.length;
  var score = 0, used = 0;
  for (var k = 0; k < iters; k++) {
    var picked = {}, hands = [], okHand = true;
    for (var o = 0; o < tiers.length; o++) {
      var h = null;
      for (var t = 0; t < 60; t++) {
        var cand;
        if (pools[o]) cand = pools[o][Math.floor(rnd() * pools[o].length)];
        else {
          var a = Math.floor(rnd() * rest.length);
          var b = Math.floor(rnd() * rest.length);
          if (a === b) continue;
          cand = [rest[a], rest[b]];
        }
        if (!picked[_key(cand[0])] && !picked[_key(cand[1])]) { h = cand; break; }
      }
      if (!h) { okHand = false; break; }
      picked[_key(h[0])] = 1; picked[_key(h[1])] = 1;
      hands.push(h);
    }
    if (!okHand) continue;
    var vknown = {};
    Object.keys(picked).forEach(function (kk) { vknown[kk] = 1; });
    hole.concat(community).forEach(function (c) { vknown[_key(c)] = 1; });
    var deck = [];
    for (var s2 = 0; s2 < 4; s2++)
      for (var r2 = 2; r2 <= 14; r2++)
        if (!vknown[_key({ r: r2, s: s2 })]) deck.push({ r: r2, s: s2 });
    for (var d = 0; d < boardNeed; d++) {
      var jj = d + Math.floor(rnd() * (deck.length - d));
      var tmp = deck[d]; deck[d] = deck[jj]; deck[jj] = tmp;
    }
    var board = community.concat(deck.slice(0, boardNeed));
    var myScore = evaluate7Fast(hole.concat(board)).score;
    var best = true, strict = true;
    hands.forEach(function (hh) {
      var os = evaluate7Fast(hh.concat(board)).score;
      if (os > myScore) { best = false; strict = false; }
      else if (os === myScore) strict = false;
    });
    if (strict) score += 1;
    else if (best) score += 0.5;
    used++;
  }
  return used ? score / used : 0;
}

function estimateEquityVsMadePool(hole, community, minCat) {
  if (!hole || !community || community.length < 5) return null;
  minCat = minCat || 3;
  var known = {};
  hole.concat(community).forEach(function (c) { known[_key(c)] = 1; });
  var rest = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!known[_key({ r: r, s: s })]) rest.push({ r: r, s: s });
  var myScore = evaluate7Fast(hole.concat(community)).score;
  var total = 0, score = 0;
  for (var i = 0; i < rest.length; i++)
    for (var j = i + 1; j < rest.length; j++) {
      var vh = [rest[i], rest[j]];
      var op = evaluate7Fast(vh.concat(community));
      if (op.cat < minCat) continue;
      total++;
      if (myScore > op.score) score += 1;
      else if (myScore === op.score) score += 0.5;
    }
  if (!total) return null;
  return score / total;
}

function estimateEquityVsMadePoolMulti(hole, community, minCat, nOpp) {
  if (!hole || !community || community.length < 5) return null;
  nOpp = nOpp || 1;
  if (nOpp <= 1) return estimateEquityVsMadePool(hole, community, minCat);
  minCat = minCat || 3;
  var known = {};
  hole.concat(community).forEach(function (c) { known[_key(c)] = 1; });
  var rest = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++)
      if (!known[_key({ r: r, s: s })]) rest.push({ r: r, s: s });
  var pool = [], scores = [];
  for (var i = 0; i < rest.length; i++)
    for (var j = i + 1; j < rest.length; j++) {
      var vh = [rest[i], rest[j]];
      var op = evaluate7Fast(vh.concat(community));
      if (op.cat < minCat) continue;
      pool.push(vh);
      scores.push(op.score);
    }
  if (!pool.length) return null;
  var myScore = evaluate7Fast(hole.concat(community)).score;
  function scoreCombo(idx) {
    var beaten = true, tied = false;
    for (var k = 0; k < idx.length; k++) {
      if (scores[idx[k]] > myScore) { beaten = false; break; }
      if (scores[idx[k]] === myScore) tied = true;
    }
    if (!beaten) return 0;
    return tied ? 0.5 : 1;
  }
  function disjoint(idx) {
    var seen = {};
    for (var k = 0; k < idx.length; k++) {
      var h = pool[idx[k]];
      if (seen[_key(h[0])] || seen[_key(h[1])]) return false;
      seen[_key(h[0])] = 1;
      seen[_key(h[1])] = 1;
    }
    return true;
  }
  if (nOpp <= 3) {
    var total = 0, score = 0, idx = [];
    function walk(start, depth) {
      if (depth === nOpp) {
        if (!disjoint(idx)) return;
        total++;
        score += scoreCombo(idx);
        return;
      }
      for (var p = start; p < pool.length; p++) {
        idx.push(p);
        walk(p + 1, depth + 1);
        idx.pop();
      }
    }
    walk(0, 0);
    if (!total) return null;
    return score / total;
  }
  var seed = 1234567;
  hole.concat(community).forEach(function (c) { seed = (seed * 31 + c.r * 7 + c.s) % 2147483647; });
  var rnd = seededRnd(seed);
  var sims = 20000, sTotal = 0, sScore = 0;
  for (var n = 0; n < sims; n++) {
    var picked = [], used = {};
    var okHand = true;
    for (var o = 0; o < nOpp; o++) {
      var h = null;
      for (var t = 0; t < 200; t++) {
        var cand = pool[Math.floor(rnd() * pool.length)];
        if (!used[_key(cand[0])] && !used[_key(cand[1])]) { h = cand; break; }
      }
      if (!h) { okHand = false; break; }
      used[_key(h[0])] = 1;
      used[_key(h[1])] = 1;
      picked.push(pool.indexOf(h));
    }
    if (!okHand) continue;
    sTotal++;
    sScore += scoreCombo(picked);
  }
  if (!sTotal) return null;
  return sScore / sTotal;
}

function madeStrengthEv(ev, hole, community) {
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

    base = 0.55 - holeTier(hole) * 0.07;
  }
  var d = detectDraws(hole, community);
  if (d.flushDraw) base += 0.12;
  if (!ev || ev.cat < 4) {
    if (d.oesd) base += 0.10;
    else if (d.gutshot) base += 0.05;
  }
  base += d.overcards * 0.03;
  return Math.max(0, Math.min(1, base));
}

function madeStrength(hole, community) {
  var cards = hole.concat(community);
  var ev = cards.length >= 5 ? evaluate7Fast(cards) : null;
  return madeStrengthEv(ev, hole, community);
}

function detectDraws(hole, community) {

  if (!hole || !community) return { flushDraw: false, oesd: false, gutshot: false, overcards: 0 };
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

function holeTier(hole) {
  var a = hole[0], b = hole[1];
  var hi = Math.max(a.r, b.r), lo = Math.min(a.r, b.r);
  var suited = a.s === b.s, pair = a.r === b.r;
  if (pair) {
    if (hi >= 12) return 1;
    if (hi >= 10) return 2;
    if (hi >= 7) return 3;
    return 4;
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

  if (suited) return 5;
  if (hi >= 11 && lo >= 9) return 5;
  if (hi - lo <= 2 && hi >= 8) return 5;
  if (a.r === 14 || b.r === 14) return 5;
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

function bluffBE(size, pot) { return size / (size + pot); }

function spr(effStack, pot) {
  if (!(pot > 0)) return 99;
  return Math.max(0, effStack / pot);
}

function sprVerdict(s, handClass, opts) {
  opts = opts || {};
  var commitAt = 1;
  if (opts.multiway) commitAt = 0.75;
  if (opts.streetsLeft === 0) commitAt = 1.5;
  switch (handClass) {
    case 'nut': return s <= commitAt ? 'commit' : 'decide';
    case 'overpair': return s <= commitAt ? 'commit' : (s <= 6 ? 'decide' : 'pot-control');
    case 'toppair': return s <= commitAt ? 'commit' : (s <= 5 ? 'decide' : 'pot-control');
    case 'trips': return s <= commitAt ? 'commit' : (s <= 6 ? 'decide' : 'pot-control');
    case 'twopair': return s <= commitAt ? 'commit' : (s <= 5 ? 'decide' : 'pot-control');
    case 'secondpair': return s <= 1 ? 'decide' : 'pot-control';
    case 'draw-strong': return s <= commitAt ? 'commit' : 'implied';
    case 'draw': return s >= 6 ? 'implied' : 'decide';
    case 'draw-weak': return s >= 8 ? 'implied' : 'pot-control';
    default: return 'decide';
  }
}

function impliedCredit(o) {
  o = o || {};
  if (!(o.effStackBB >= 12)) return 0;
  if (!(o.draw || o.smallPair)) return 0;
  var c = 0.05;
  if (o.effStackBB >= 30) c += 0.03;
  if (o.villainStubborn > 0.65) c += 0.04;
  if (o.inPosition) c += 0.02;
  if (o.smallPair) c += 0.01;
  return Math.min(0.15, c);
}

function blockerCredit(hole, community) {
  var suits = {};
  community.forEach(function (c) { suits[c.s] = (suits[c.s] || 0) + 1; });
  for (var s = 0; s < 4; s++) {
    if (!(suits[s] >= 3)) continue;
    var heroSuited = hole.filter(function (c) { return c.s === s; }).length;
    if (heroSuited + suits[s] >= 5) continue;
    if (hole.some(function (c) { return c.s === s && c.r === 14; })) return 0.04;
  }
  return 0;
}

function rioPenalty(o) {
  o = o || {};
  if (o.nutDraw && !o.vulnerableMade) return 0;
  var p = 0;
  if (o.villainTight > 0.6) p += 0.06;
  if (o.multiway) p += 0.04;
  if (o.nonNutDraw && o.villainTight > 0.6) p += 0.04;
  if (o.vulnerableMade && o.villainTight > 0.6) p += 0.03;
  return Math.min(0.14, p);
}

function villainFoldy(archetype) {
  var a = archetype || {};
  return 1 - ((typeof a.stubborn === 'number') ? a.stubborn : 0.5);
}
function villainBluffy(archetype) {
  var a = archetype || {};
  return (typeof a.bluff === 'number') ? a.bluff : 0.3;
}

var EXPLOIT_LINES = {
  lag: 'loose-aggressive, plays lots of hands with pressure — re-raise your strong hands, never call with a weak hand',
  rohan: 'loose-passive — plays lots of hands, rarely raises. Value bet big; he calls with pairs but folds when he has nothing, and bluffs sometimes so don\'t auto-fold to his bets',
  amogh: 'straightforward — bombs pots with real hands. Let him bet into you, don\'t call his big bets hoping he\'s bluffing',
  nathan: 'trap player — never raises before the river. Value bet relentlessly, believe his river bet',
  shark: 'solid all-around — stay balanced, steal when he shows weakness',
  station: 'calling station — calls down with anything. Value bet big, never bluff',
  maniac: 'maniac — raises everything. Trap strong hands, call down lighter, never bluff',
  rock: 'rock — only plays monsters. Steal his blinds, fold when he bets',
  alice: 'never bluffs — believe every bet, steal her blinds relentlessly',
  donald: 'tight but sticky — folds preflop, never folds postflop. His bets are often draws, or bets bigger than the pot when ahead; steal his blinds, don\'t try to push him off',
  pro: 'tournament pro — plays few hands but re-raises the best ones hard. Take his blinds, never bluff into his re-raise',
  nit: 'extreme tight — folds almost everything. Take his blinds constantly, fold the moment he bets',
  bully: 'big-stack bully — pushes medium stacks around but backs down to other big stacks. Stand up to him with a real hand',
  gambler: 'super-aggressive — bluffs every street and plays lots of hands. Call down lighter with any decent hand, never bluff him'
};
function exploitLine(archetype) {
  var a = archetype || {};
  if (EXPLOIT_LINES[a.id]) return EXPLOIT_LINES[a.id];
  var st = (typeof a.stubborn === 'number') ? a.stubborn : 0.5;
  var bl = (typeof a.bluff === 'number') ? a.bluff : 0.3;
  return st > 0.75 ? 'calls down a lot — value bet, rarely bluff'
    : st < 0.35 ? 'folds too much — a good bluff target'
    : bl > 0.5 ? 'bluffs a lot — call down lighter, trap your monsters' : 'hard to read — play straightforward';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    estimateEquity: estimateEquity, estimateEquityVsRange: estimateEquityVsRange,
    seededRnd: seededRnd, cardSeed: cardSeed, normCdf: normCdf,
    estimateEquityVsRangePostflop: estimateEquityVsRangePostflop,
    estimateEquityVsRangePostflopExact: estimateEquityVsRangePostflopExact,
    estimateEquityVsMadeRange: estimateEquityVsMadeRange,
    estimateEquityVsMadePairPlus: estimateEquityVsMadePairPlus,
    estimateEquityVsBettingRange: estimateEquityVsBettingRange,
    estimateEquityVsBettingRangePostflop: estimateEquityVsBettingRangePostflop,
    estimateEquityVsRaiseRange: estimateEquityVsRaiseRange,
    estimateEquityVsRaiseRangePostflop: estimateEquityVsRaiseRangePostflop,
    estimateEquityVsBettingRangeCustom: estimateEquityVsBettingRangeCustom,
    estimateEquityVsBettingRangeCustomPostflop: estimateEquityVsBettingRangeCustomPostflop,
    estimateEquityVsBettingRangeCustomMulti: estimateEquityVsBettingRangeCustomMulti,
    customBetProb: customBetProb,
    estimateEquityVsBettingRangeMulti: estimateEquityVsBettingRangeMulti,
    estimateEquityVsRanges: estimateEquityVsRanges,
    estimateEquityVsMadePool: estimateEquityVsMadePool,
    estimateEquityVsMadePoolMulti: estimateEquityVsMadePoolMulti,
    madeStrength: madeStrength, madeStrengthEv: madeStrengthEv,
    detectDraws: detectDraws, holeTier: holeTier, tierName: tierName, TIER_NAMES: TIER_NAMES,
    bluffBE: bluffBE, villainFoldy: villainFoldy, villainBluffy: villainBluffy,
    exploitLine: exploitLine, EXPLOIT_LINES: EXPLOIT_LINES,
    spr: spr, sprVerdict: sprVerdict, impliedCredit: impliedCredit, rioPenalty: rioPenalty,
    blockerCredit: blockerCredit, drawRealizationDiscount: drawRealizationDiscount
  };
}
