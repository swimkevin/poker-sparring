var quiet = function (e) { if (typeof window !== 'undefined' && window.__psDebug) console.error(e); };
if (typeof module !== 'undefined' && module.exports) {
  var __cards = require('./cards.js');
  var rankChar = __cards.rankChar;
}

var STATS_KEY = 'ps_stats_v1';

function sessionProfitBB(heroStackChips, startStackBB, bb) {
  return heroStackChips / bb - startStackBB;
}

function blankStats() {
  return {
    hands: 0, won: 0, profitBB: 0,
    vpip: 0, pfr: 0, vpipHands: 0,
    postBet: 0, postCall: 0,
    biggestPotBB: 0,
    biggestPotChips: 0,
    profitChips: 0,
    perArchetype: {},
    history: [],
    graph: [],
    leaks: []
  };
}

function loadStats() {
  try {
    var raw = (typeof localStorage !== 'undefined') && localStorage.getItem(STATS_KEY);
    if (raw) {
      var s = JSON.parse(raw);
      var b = blankStats();
      for (var k in b) if (s[k] !== undefined) b[k] = s[k];
      return b;
    }
  } catch (e) { quiet(e); }
  return blankStats();
}

function saveStats(s) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch (e) { quiet(e); }
}

function clearStats() {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(STATS_KEY); } catch (e) { quiet(e); }
  return blankStats();
}

function recordHand(ctx) {
  var s = loadStats();
  s.hands++;
  if (ctx.wonHand) s.won++;
  var profitBB = ctx.profitChips / ctx.bb;
  var profitChips = Math.round(ctx.profitChips);
  s.profitBB += profitBB;
  s.profitChips = (s.profitChips || 0) + profitChips;
  s.vpipHands++;
  if (ctx.vpip) s.vpip++;
  if (ctx.pfr) s.pfr++;
  s.postBet += ctx.postBet || 0;
  s.postCall += ctx.postCall || 0;
  if (ctx.potBB > s.biggestPotBB) s.biggestPotBB = ctx.potBB;
  var potChips = Math.round(ctx.potBB * ctx.bb);
  if (!s.biggestPotChips || potChips > s.biggestPotChips) s.biggestPotChips = potChips;
  (ctx.opponents || []).forEach(function (o) {
    var a = s.perArchetype[o.id] || (s.perArchetype[o.id] = { hands: 0, won: 0, name: o.name, emoji: o.emoji });
    a.hands++;
    if (ctx.wonHand) a.won++;

  });
  s.history.unshift({

    n: s.hands, hole: (ctx.heroHole || []).map(function (c) { return rankChar(c.r) + ' shdc'[c.s + 1] || ''; }),
    board: (ctx.community || []).length,
    profitBB: Math.round(profitBB * 10) / 10,
    profitChips: profitChips,
    won: !!ctx.wonHand, mode: ctx.mode, result: ctx.resultText || '',
    recId: ctx.recId || null
  });
  s.history = s.history.slice(0, 60);
  s.graph.push(Math.round(ctx.heroStackBB * 10) / 10);
  s.graph = s.graph.slice(-200);
  saveStats(s);
  return s;
}

function derivedStats(s) {
  return {
    hands: s.hands,
    winRate: s.hands ? (100 * s.won / s.hands) : 0,
    bbPer100: s.hands ? (100 * s.profitBB / s.hands) : 0,
    vpip: s.vpipHands ? (100 * s.vpip / s.vpipHands) : 0,
    pfr: s.vpipHands ? (100 * s.pfr / s.vpipHands) : 0,
    af: s.postCall ? (s.postBet / s.postCall) : (s.postBet ? 99 : 0),
    biggestPotBB: s.biggestPotBB,
    biggestPotChips: s.biggestPotChips || 0
  };
}

function exportStatsJSON() {
  return JSON.stringify({ exportedAt: new Date().toISOString(), stats: loadStats() }, null, 2);
}

function recordLeak(leak) {
  var s = loadStats();
  s.leaks.unshift(leak);
  if (s.leaks.length > 40) s.leaks.length = 40;
  saveStats(s);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    blankStats: blankStats, loadStats: loadStats, saveStats: saveStats,
    clearStats: clearStats, recordHand: recordHand, derivedStats: derivedStats,
    recordLeak: recordLeak,
    exportStatsJSON: exportStatsJSON, STATS_KEY: STATS_KEY,
    sessionProfitBB: sessionProfitBB
  };
}
