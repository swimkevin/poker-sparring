// bots.js — Offline AI opponents: archetype personalities + heuristic decision engine.
// DOM-free. Each archetype tunes preflop tiers, aggression, bluffing and call-down
// stubbornness, so practice vs "The Nit" feels nothing like practice vs "The Maniac".

// Node: pull cross-file globals when running as modules (browser uses script tags).
if (typeof module !== 'undefined' && module.exports) {
  var __eq = require('./equity.js');
  var holeTier = __eq.holeTier, estimateEquity = __eq.estimateEquity, madeStrength = __eq.madeStrength;
}

// Archetype params:
//   openTier / openTierLate: worst hole-tier opened first-in (1=tight .. 6=any two)
//   callTier: worst tier to flat an open with
//   threeBetTier: worst tier to 3-bet for value with
//   aggression 0..1, bluff 0..1, stubborn 0..1 (call-down frequency)
//   pushTier / callPushTier: short-stack (<13bb) shove / call-shove tiers
var ARCHETYPES = [
  {
    id: 'nit', name: 'The Nit', emoji: '\uD83E\uDDCA',
    tagline: 'Waits for aces. Folds everything else.',
    desc: 'Tight-passive rock. Opens ~12% of hands, almost never bluffs, folds to pressure. Great for practicing value-betting thin and stealing blinds.',
    openTier: 3, openTierLate: 3, callTier: 3, threeBetTier: 2,
    aggression: 0.30, bluff: 0.05, stubborn: 0.25, pushTier: 3, callPushTier: 2, limp: 0.05
  },
  {
    id: 'station', name: 'Calling Station', emoji: '\uD83D\uDCDE',
    tagline: 'Never folds. Ever.',
    desc: 'Loose-passive. Plays ~45% of hands, calls down with middle pair, hates folding draws. Practice: value bet relentlessly, never bluff.',
    openTier: 4, openTierLate: 5, callTier: 4, threeBetTier: 3,
    aggression: 0.25, bluff: 0.05, stubborn: 0.90, pushTier: 4, callPushTier: 3, limp: 0.70
  },
  {
    id: 'maniac', name: 'The Maniac', emoji: '\uD83E\uDD2A',
    tagline: 'Raise. Re-raise. Repeat.',
    desc: 'Loose-aggressive chaos. Opens ~60%, 3-bets light, bluffs rivers. Practice: trap with strong hands, stay calm, let them hang themselves.',
    openTier: 6, openTierLate: 6, callTier: 5, threeBetTier: 4,
    aggression: 0.95, bluff: 0.50, stubborn: 0.60, pushTier: 5, callPushTier: 4, limp: 0.05
  },
  {
    id: 'shark', name: 'TAG Shark', emoji: '\uD83E\uDD88',
    tagline: 'Solid, aggressive, balanced.',
    desc: 'Tight-aggressive regular: ~22% VPIP, position-aware, value bets and bluffs at sane frequencies. The "good player" baseline to measure yourself against.',
    openTier: 3, openTierLate: 5, callTier: 3, threeBetTier: 2,
    aggression: 0.70, bluff: 0.25, stubborn: 0.50, pushTier: 4, callPushTier: 3, limp: 0.10
  },
  {
    id: 'crusher', name: 'Tournament Crusher', emoji: '\uD83C\uDFC6',
    tagline: 'Built for final tables.',
    desc: 'Aggressive tournament specialist: steals blinds late, pressures bubbles, shoves/folds correctly short-stacked. The one to practice tournament spots against.',
    openTier: 4, openTierLate: 5, callTier: 4, threeBetTier: 3,
    aggression: 0.80, bluff: 0.30, stubborn: 0.55, pushTier: 5, callPushTier: 3, limp: 0.15
  }
];

function getArchetype(id, customs) {
  var all = ARCHETYPES.concat(customs || []);
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
  return ARCHETYPES[3];
}

// Build an archetype from user sliders (0..100 each).
function customArchetype(opts) {
  var lz = opts.looseness / 100, ag = opts.aggression / 100,
      bl = opts.bluff / 100, st = opts.stubborn / 100;
  function tierFromLooseness(x) { return Math.max(1, Math.min(6, 1 + Math.round(x * 5))); }
  return {
    id: 'custom-' + Date.now().toString(36),
    name: opts.name || 'My Bot', emoji: opts.emoji || '\uD83E\uDD16',
    tagline: 'Custom-built sparring partner.',
    desc: opts.desc || 'Custom archetype.',
    custom: true,
    openTier: tierFromLooseness(lz * 0.8), openTierLate: tierFromLooseness(lz),
    callTier: tierFromLooseness(lz), threeBetTier: Math.max(1, tierFromLooseness(lz * 0.6) - 1),
    aggression: ag, bluff: bl, stubborn: st, limp: ag < 0.45 ? 0.6 : 0.1,
    pushTier: Math.max(2, tierFromLooseness(lz * 0.7)), callPushTier: Math.max(1, tierFromLooseness(lz * 0.5))
  };
}

// 0 (early) .. 1 (button). Used for positional adjustments.
function positionScore(table, idx) {
  var n = table.players.length, order = [], s = table.button;
  for (var k = 0; k < n; k++) {
    s = (s + 1) % n;
    var p = table.players[s];
    if (!p.sittingOut) order.push(s);
  }
  var pos = order.indexOf(idx);
  var m = order.length;
  if (m <= 2) return pos === m - 1 ? 1 : 0.15; // heads-up: button=1
  // order: SB, BB, UTG, ..., CO, BTN
  if (pos === m - 1) return 1;      // BTN
  if (pos === m - 2) return 0.8;    // CO
  if (pos === 0) return 0.1;        // SB
  if (pos === 1) return 0.2;        // BB
  return 0.35 + 0.45 * (pos / m);   // early -> middle
}

function clampRaise(table, p, legal, to) {
  to = Math.round(to);
  if (!legal.canRaise && !legal.canBet) return null;
  var lo = legal.canRaise ? legal.minRaiseTo : legal.minBetTo;
  var hi = legal.maxRaiseTo;
  to = Math.max(lo, Math.min(hi, to));
  return to;
}

function botDecide(table, p) {
  if (!table.canAct(p)) return null;
  var A = p.archetype || ARCHETYPES[3];
  if (table.street === 'preflop') return botPreflop(table, p, A);
  return botPostflop(table, p, A);
}

function botPreflop(table, p, A) {
  var tier = holeTier(p.hole);
  // Humanize: occasionally play a tier looser/tighter.
  var r0 = Math.random();
  if (r0 < 0.08) tier = Math.min(6, tier + 1);
  else if (r0 < 0.14) tier = Math.max(1, tier - 1);

  var legal = table.legalActions(p.idx);
  var toCall = legal.toCall;
  var effBB = (p.stack + p.bet) / table.bb;

  // --- short stack: push/fold ---
  if (effBB < 13) return shortStackPreflop(table, p, A, legal, tier);

  var pos = positionScore(table, p.idx);
  var openTier = pos >= 0.75 ? A.openTierLate : A.openTier;
  var raised = table.currentBet > table.bb; // someone actually raised (limps don't move currentBet)
  // Voluntary limpers (only meaningful when nobody raised yet).
  var limpers = table.players.filter(function (q) {
    return q !== p && !q.folded && !q.sittingOut && q.idx !== table.bbIdx && q.totalBet >= table.bb;
  }).length;

  // --- first in / vs limps only ---
  if (!raised) {
    if (toCall === 0) {
      // Big blind option.
      if (tier <= A.threeBetTier && Math.random() < 0.4 + A.aggression * 0.3 && legal.canRaise) {
        var toBB = clampRaise(table, p, legal, table.bb * (3.5 + limpers));
        if (toBB != null) return { a: 'raise', amount: toBB };
      }
      return { a: 'check' };
    }
    if (tier <= openTier && legal.canRaise) {
      if (Math.random() < (A.limp || 0)) return { a: 'call' }; // limpy types mix limps
      var toOpen = clampRaise(table, p, legal, table.bb * (2.5 + limpers));
      if (toOpen != null) return { a: 'raise', amount: toOpen };
    }
    // Over-limp behind existing limpers, or first-in limp for limpy archetypes.
    if (tier <= A.callTier + 1 && (limpers > 0 || (A.limp || 0) > 0.5)) return { a: 'call' };
    return { a: 'fold' };
  }

  // --- facing a raise ---
  var facingBig = table.currentBet >= table.bb * 7; // 3-bet or bigger
  var pot = table.potTotal();
  var need = toCall / (pot + toCall);

  if (facingBig) {
    if (tier <= Math.max(1, A.threeBetTier - 1) && Math.random() < 0.3 + A.aggression * 0.4 && legal.canRaise) {
      var to4 = clampRaise(table, p, legal, p.bet + p.stack); // shove it in
      return { a: 'raise', amount: to4 };
    }
    if (tier <= A.callTier && (need < 0.30 || Math.random() < A.stubborn * 0.5)) return { a: 'call' };
    return { a: 'fold' };
  }

  // Facing a single open.
  if (tier <= A.threeBetTier && Math.random() < 0.15 + A.aggression * 0.35 && legal.canRaise) {
    var to3 = clampRaise(table, p, legal, table.currentBet * 3 + (pos >= 0.75 ? 0 : table.bb));
    if (to3 != null) return { a: 'raise', amount: to3 };
  }
  var callLine = A.callTier + (pos >= 0.75 ? 1 : 0);
  if (tier <= callLine && (need < 0.33 || tier <= 2 || Math.random() < (A.callTier / 12)))
    return { a: 'call' };
  // SB completing vs a limp-ish price
  if (need < 0.12 && tier <= 5) return { a: 'call' };
  return { a: 'fold' };
}

function shortStackPreflop(table, p, A, legal, tier) {
  var toCall = legal.toCall;
  var maxTo = p.bet + p.stack;
  if (toCall === 0) {
    if (tier <= (A.pushTier || 4) && legal.canRaise) return { a: 'raise', amount: maxTo };
    return { a: 'check' };
  }
  var need = toCall / (table.potTotal() + toCall);
  if (tier <= (A.callPushTier || 3)) {
    // Shove; if the all-in doesn't exceed the current bet it's an all-in call.
    return maxTo > table.currentBet ? { a: 'raise', amount: maxTo } : { a: 'call' };
  }
  if (need < 0.16 && tier <= 5) return { a: 'call' };
  return { a: 'fold' };
}

function botPostflop(table, p, A) {
  var legal = table.legalActions(p.idx);
  var toCall = legal.toCall;
  var liveOpp = Math.max(1, table.livePlayers().length - 1);
  var eq = estimateEquity(p.hole, table.community, Math.min(3, liveOpp), 150);
  eq += (Math.random() - 0.5) * 0.05;
  var ms = madeStrength(p.hole, table.community);
  var pot = table.potTotal();
  var street = table.street;

  function betSized(frac) {
    var to = clampRaise(table, p, legal, pot * frac);
    if (to == null) return { a: 'check' };
    if (to >= legal.maxRaiseTo * 0.97) return { a: table.currentBet === 0 ? 'bet' : 'raise', amount: legal.maxRaiseTo };
    return { a: table.currentBet === 0 ? 'bet' : 'raise', amount: to };
  }

  if (toCall === 0) {
    var betLine = 0.62 - A.aggression * 0.22 + (street === 'river' ? 0.04 : 0);
    if (eq > betLine || ms > 0.74) return betSized(0.45 + A.aggression * 0.45);
    var bluffP = A.bluff * (liveOpp === 1 ? 0.22 : 0.10) * (street === 'river' ? 1 : 0.55);
    if (Math.random() < bluffP && ms < 0.55) return betSized(0.65);
    return { a: 'check' };
  }

  var need = toCall / (pot + toCall);
  var margin = (0.5 - A.stubborn) * 0.12 + (street === 'river' ? 0.03 : 0);
  if (eq > need + margin) {
    if (eq > 0.74 && Math.random() < A.aggression * 0.55 && legal.canRaise) {
      var to = clampRaise(table, p, legal, (pot + toCall) * (0.7 + Math.random() * 0.5));
      if (to != null) return { a: 'raise', amount: to };
    }
    return { a: 'call' };
  }
  // Occasional bluff-raise with some equity behind it.
  if (Math.random() < A.bluff * 0.16 && legal.canRaise && ms > 0.22 && eq > 0.25) {
    var to2 = clampRaise(table, p, legal, (pot + toCall) * 0.9);
    if (to2 != null) return { a: 'raise', amount: to2 };
  }
  return { a: 'fold' };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ARCHETYPES: ARCHETYPES, getArchetype: getArchetype, customArchetype: customArchetype,
    positionScore: positionScore, botDecide: botDecide
  };
}
