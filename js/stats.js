// stats.js — Local training stats (localStorage). DOM-free except guarded storage.

if (typeof module !== 'undefined' && module.exports) {
  var __cards = require('./cards.js');
  var rankChar = __cards.rankChar;
}

var STATS_KEY = 'ps_stats_v1';

// Session profit in big blinds. heroStackChips is in chips; startStackBB is the
// hero's starting stack already expressed in bb (stack / bb at deal time).
// Both terms must be in bb before subtracting — mixing chips and bb here once
// shipped a header stat that read +91 bb after a 1 bb win.
function sessionProfitBB(heroStackChips, startStackBB, bb) {
  return heroStackChips / bb - startStackBB;
}

function blankStats() {
  return {
    hands: 0, won: 0, profitBB: 0,
    vpip: 0, pfr: 0, vpipHands: 0,
    postBet: 0, postCall: 0,          // postflop aggression
    biggestPotBB: 0,
    perArchetype: {},                 // id -> { hands, won, profitBB }
    history: [],                      // recent hands (max 60)
    graph: [],                        // hero stack in bb after each hand (max 200)
    leaks: []                         // detected hero mistakes (max 40), newest first
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
  } catch (e) {}
  return blankStats();
}

function saveStats(s) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch (e) {}
}

function clearStats() {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(STATS_KEY); } catch (e) {}
  return blankStats();
}

// ctx: { mode, bb, heroHole:[{r,s}], community, profitChips, wonHand, vpip, pfr,
//        postBet, postCall, opponents:[{id,name}], heroStackBB, potBB, resultText }
function recordHand(ctx) {
  var s = loadStats();
  s.hands++;
  if (ctx.wonHand) s.won++;
  var profitBB = ctx.profitChips / ctx.bb;
  s.profitBB += profitBB;
  s.vpipHands++;
  if (ctx.vpip) s.vpip++;
  if (ctx.pfr) s.pfr++;
  s.postBet += ctx.postBet || 0;
  s.postCall += ctx.postCall || 0;
  if (ctx.potBB > s.biggestPotBB) s.biggestPotBB = ctx.potBB;
  (ctx.opponents || []).forEach(function (o) {
    var a = s.perArchetype[o.id] || (s.perArchetype[o.id] = { hands: 0, won: 0, profitBB: 0, name: o.name, emoji: o.emoji });
    a.hands++;
    if (ctx.wonHand) a.won++;
    a.profitBB += profitBB / Math.max(1, (ctx.opponents || []).length);
  });
  s.history.unshift({
    n: s.hands, hole: (ctx.heroHole || []).map(function (c) { return rankChar(c.r) + ' sdhc'[c.s + 1] || ''; }),
    board: (ctx.community || []).length,
    profitBB: Math.round(profitBB * 10) / 10,
    won: !!ctx.wonHand, mode: ctx.mode, result: ctx.resultText || ''
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
    biggestPotBB: s.biggestPotBB
  };
}

function exportStatsJSON() {
  return JSON.stringify({ exportedAt: new Date().toISOString(), stats: loadStats() }, null, 2);
}

// A "leak" is a detected hero mistake: { hand, hole, street, type, title, spot, why }.
// Newest first, capped at 40.
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
