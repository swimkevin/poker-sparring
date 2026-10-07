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
//   neverRaise: strictly passive — botDecide converts every bet/raise into a
//     check (when free) or a call, so 3-bet/4-bet/bluff lines can never fire
//   riverTrap: with neverRaise, still allow bets on the river (the trap springs)
// Profiles follow the classic live-game taxonomy (rock / calling station /
// maniac / TAG / LAG) described by Sklansky, Harrington and modern training
// sites: each has a `beat` line teaching the standard exploit, so practice
// transfers to real tables.
var ARCHETYPES = [
  {
    id: 'lag', name: 'swimkev', emoji: '🏊',
    tagline: 'Wild and unpredictable — wins big or rebuys instantly.',
    desc: 'Loose-aggressive skilled: ~30% of hands with constant pressure, well-timed 3-bets, big raises, and tricky lines — but disciplined enough to fold when clearly beat. swimkev will either win a lot or rebuy back in instantly. There is no in-between. The most fun seat at any friendly home game.',
    beat: 'Play solid and straightforward; don\'t try to out-bluff him. Value bet confidently — he calls wider than he should, and he will respect it when you push back.',
    openTier: 4, openTierLate: 5, callTier: 4, threeBetTier: 3,
    aggression: 0.80, bluff: 0.35, stubborn: 0.60, pushTier: 5, callPushTier: 3, limp: 0.15,
    tiltProne: 0.70, rebuy: 0.90,
    friendly: true,
  },
  {
    id: 'rohan', name: 'Rohan', emoji: '🙂',
    tagline: 'Straightforward and safe. Calls everything, raises nothing.',
    desc: 'Loose-passive: plays ~40%+ of hands but never raises and never 3-bets — neverRaise converts every aggressive action into a check or a call. Rarely bluffs, but will call you down light with just a pair. Rohan will win a lot, then lose a lot — sometimes in the same orbit. Buckle up.',
    beat: 'Value bet thin — he will call with worse. Never bluff him; he does not fold pairs.',
    openTier: 3, openTierLate: 4, callTier: 4, threeBetTier: 1,
    aggression: 0.05, bluff: 0.05, stubborn: 0.80, pushTier: 4, callPushTier: 4, limp: 0.9,
    tiltProne: 0.40, rebuy: 0.80,
    neverRaise: true
  },
  {
    id: 'amogh', name: 'Amogh', emoji: '🚀',
    tagline: 'Bombs every pot the moment he likes his hand.',
    desc: 'Big-bet sizer: fires huge 1.5x-2.5x pot overbets with any pair or better to take down small pots, and shoves all-in with monsters (QQ+/AKs) when the moment feels right. Value-heavy, not bluff-heavy — the sizing is the weapon, and it is a blast to play against. Some days Amogh gets super lucky and wins huge; other days he could not catch a card with a net. You never know which Amogh showed up today.',
    beat: 'Wait for a real hand and let the big bets come to you. Do not try to bluff-catch light — his range is strong when the money goes in.',
    openTier: 3, openTierLate: 4, callTier: 3, threeBetTier: 3,
    aggression: 1.0, bluff: 0.15, stubborn: 0.7, pushTier: 3, callPushTier: 2, limp: 0.05,
    tiltProne: 0.80, rebuy: 0.85,
    friendly: true,
    friendly: true,
  },
  {
    id: 'nathan', name: 'Nathan', emoji: '🐢',
    tagline: 'Never raises. Has been trapping you since the flop.',
    desc: 'Ultra-safe trapper: never raises on any street before the river — monsters included — just calls everything down. On the river the trap springs: a small value bet, or a rare all-in. And fair warning: Nathan will leave the table right after winning a few big hands. Hit-and-run champion — if you want your chips back, win them fast.',
    beat: 'Bet your strong hands for value — he will never raise you off them. But when Nathan finally bets the river, believe him.',
    openTier: 3, openTierLate: 4, callTier: 4, threeBetTier: 1,
    aggression: 0.05, bluff: 0.02, stubborn: 0.9, pushTier: 3, callPushTier: 3, limp: 0.6,
    tiltProne: 0.30, rebuy: 0.50,
    neverRaise: true, riverTrap: true
  },
  {
    id: 'grinder', name: 'The Grinder', emoji: '⏱️',
    tagline: 'Tournament pro. Tight early, lethal with 20 big blinds.',
    desc: 'Tournament TAG: folds ~85% of hands, but 3-bets relentlessly with the top of the range and shoves short stacks with correct push/fold math. Never spews, never tilts much — the player type that actually cashes.',
    beat: 'Steal his blinds early when stacks are deep. Never pay off a shove without a real hand — his all-in range is brutally strong.',
    openTier: 2, openTierLate: 3, callTier: 2, threeBetTier: 2,
    aggression: 0.65, bluff: 0.12, stubborn: 0.40, pushTier: 5, callPushTier: 2, limp: 0.05,
    tiltProne: 0.25, rebuy: 0.60,
    friendly: true,
  },
  {
    id: 'bubble', name: 'Bubble Boy', emoji: '🫧',
    tagline: 'Here to cash, not to win. Folds everything but the nuts.',
    desc: 'Extreme survival mode: plays ~7% of hands and treats every all-in like the tournament bubble. Will blind down to 5 big blinds waiting for aces — then shove them with total conviction.',
    beat: 'Rob his blinds with any two cards. When he finally plays back at you, believe the strength and get out of the way.',
    openTier: 1, openTierLate: 2, callTier: 1, threeBetTier: 1,
    aggression: 0.30, bluff: 0.02, stubborn: 0.30, pushTier: 2, callPushTier: 1, limp: 0.10,
    tiltProne: 0.45, rebuy: 0.15
  },
  {
    id: 'shark', name: 'TAG Shark', emoji: '🦈',
    tagline: 'Tight, aggressive, disciplined. The winning baseline.',
    desc: 'Tight-aggressive: ~20% of hands, position-aware, value bets and bluffs at balanced frequencies. The style winning players are taught — measure yourself against it.',
    beat: 'Respect their aggression and avoid marginal spots. Steal their blinds when they show weakness.',
    openTier: 3, openTierLate: 5, callTier: 3, threeBetTier: 2,
    aggression: 0.70, bluff: 0.25, stubborn: 0.50, pushTier: 4, callPushTier: 3, limp: 0.10,
    tiltProne: 0.25, rebuy: 0.70
  },
  {
    id: 'station', name: 'Calling Station', emoji: '📞',
    tagline: 'Sees every flop with a smile. Folding is not in the vocabulary.',
    desc: 'Loose-passive: sees ~45% of flops, calls down with middle pair or any draw, almost never raises. The friendliest seat in home games — always in the hand, always having a good time.',
    beat: 'Value bet big with any decent hand — and never bluff. They love to call, so size up your value bets and enjoy the ride.',
    openTier: 4, openTierLate: 5, callTier: 5, threeBetTier: 2,
    aggression: 0.20, bluff: 0.03, stubborn: 0.95, pushTier: 4, callPushTier: 4, limp: 0.75,
    tiltProne: 0.35, rebuy: 0.90
  },
  {
    id: 'maniac', name: 'The Maniac', emoji: '🤪',
    tagline: 'Raises everything. No fold button found.',
    desc: 'Loose-aggressive chaos: plays ~65% of hands, 3-bets light, bluffs every street. A total rollercoaster — scary until you realize their range is literally everything, and then it is just plain fun.',
    beat: 'Tighten up, trap with strong hands, and call down a little lighter than usual. Patience pays off big in this matchup.',
    openTier: 6, openTierLate: 6, callTier: 5, threeBetTier: 5,
    aggression: 0.95, bluff: 0.55, stubborn: 0.65, pushTier: 6, callPushTier: 4, limp: 0.05,
    tiltProne: 0.95, rebuy: 1.00
  },
  {
    id: 'rock', name: 'The Rock', emoji: '🪨',
    tagline: 'Only plays monsters. You always know where you stand.',
    desc: 'Tight-passive: plays ~10% of hands — big pairs and big aces — and only bets with genuine strength. The classic "rock" from every low-stakes game.',
    beat: 'Pick up their blinds when they let you. When they finally bet or raise, believe them and fold everything but the nuts.',
    openTier: 2, openTierLate: 3, callTier: 2, threeBetTier: 1,
    aggression: 0.20, bluff: 0.02, stubborn: 0.20, pushTier: 3, callPushTier: 2, limp: 0.05,
    tiltProne: 0.20, rebuy: 0.40
  }

];

// Fallback is by id, not array position, so the display order above can change freely.
function getArchetype(id, customs) {
  var all = ARCHETYPES.concat(customs || []);
  var fb = all[0];
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === id) return all[i];
    if (all[i].id === 'shark') fb = all[i];
  }
  return fb;
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
    tiltProne: opts.tiltProne != null ? opts.tiltProne / 100 : 0.5,
    rebuy: opts.rebuy != null ? opts.rebuy / 100 : 0.7,
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

// Tilt morphs a bot's style: tilted players play more hands, blast more, and
// call down lighter trying to win it back — the classic real-money tell.
// Returns a shallow copy with shifted params; the base archetype is never mutated.
function effectiveArchetype(A, tilt) {
  if (!A || !(tilt > 0.02)) return A;
  var t = Math.min(1, tilt);
  return Object.assign({}, A, {
    openTier: Math.min(6, (A.openTier || 3) + Math.round(t * 2)),
    openTierLate: Math.min(6, (A.openTierLate || 4) + Math.round(t * 2)),
    callTier: Math.min(6, (A.callTier || 4) + Math.round(t * 1)),
    threeBetTier: Math.min(6, (A.threeBetTier || 3) + Math.round(t * 1)),
    aggression: Math.min(1, (A.aggression == null ? 0.5 : A.aggression) + t * 0.30),
    bluff: Math.min(1, (A.bluff == null ? 0.2 : A.bluff) + t * 0.25),
    stubborn: Math.min(1, (A.stubborn == null ? 0.5 : A.stubborn) + t * 0.30)
  });
}

// Friendly-game looseness: when the price to call is trivial relative to the
// bot's stack (e.g. 40 chips from a 3000 stack), even tight bots play looser —
// just like a real home game. Returns 0..1, higher = call wider.
// Friend-named bots (friendly: true) get roughly double the discount.
function stackDiscount(p, toCall, A) {
  var total = p.stack + p.bet;
  if (total <= 0 || toCall <= 0) return 0;
  var frac = toCall / total;
  var base = frac >= 0.05 ? 0 : frac >= 0.03 ? 0.15 : frac >= 0.015 ? 0.35 : 0.55;
  if (A && A.friendly) base = Math.min(0.8, base * 1.8);
  return base;
}

function botDecide(table, p) {
  if (!table.canAct(p)) return null;
  var A = effectiveArchetype(p.archetype || getArchetype('shark'), p.tilt || 0);
  var mv = table.street === 'preflop' ? botPreflop(table, p, A) : botPostflop(table, p, A);
  // Strictly passive archetypes never take an aggressive action: convert every
  // bet/raise into a check (when free) or a call. This single gate covers
  // 3-bets, 4-bets, bluffs and shoves, so no raise path can leak through.
  // Nathan is exempt on the river, where his trap springs (see botPostflop).
  if (mv && A.neverRaise && (mv.a === 'bet' || mv.a === 'raise') &&
      !(A.riverTrap && table.street === 'river')) {
    var legal = table.legalActions(p.idx);
    mv = legal.canCheck ? { a: 'check' } : { a: 'call' };
  }
  return mv;
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

  // Amogh: tier-1 monsters (QQ+/AKs) go in relentlessly, first-in or facing heat.
  if (A.id === 'amogh' && tier <= 1 && legal.canRaise && Math.random() < 0.9) {
    return { a: 'raise', amount: legal.maxRaiseTo };
  }

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
    // SB completion: facing only the blinds is 3:1+ — maniacs complete nearly
    // everything, tighter bots stick closer to their calling range.
    if (toCall > 0 && toCall <= table.bb) {
      var wide = (A.aggression || 0) >= 0.8 ? 6 : A.callTier + 1;
      if (tier <= wide) return { a: 'call' };
    }
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
  // Stack-relative looseness: trivial prices get called much wider.
  var sd = stackDiscount(p, toCall, A);
  if (sd > 0 && tier <= callLine + Math.round(sd * 3) && need < 0.45) return { a: 'call' };
  if (tier <= callLine && (need < 0.33 || tier <= 2 || Math.random() < (A.callTier / 12)))
    return { a: 'call' };
  // Min-raise defense: a 2bb open lays ~2.5:1, too good a price to fold
  // speculative hands. Without this every bot over-folds to min-raises.
  if (table.currentBet <= table.bb * 2.5 && tier <= callLine + 1 && need < 0.42)
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

  // Amogh: huge sizing can't be expressed with the aggression/bluff params,
  // so it lives in amoghPostflop (null = fall through to standard logic).
  if (A.id === 'amogh') {
    var amv = amoghPostflop(table, p, A, legal, toCall, pot, eq, ms, street, liveOpp);
    if (amv) return amv;
  }
  // Nathan: the trap springs on the river; earlier streets stay passive
  // via the neverRaise gate in botDecide.
  if (A.id === 'nathan' && street === 'river') {
    return nathanRiver(table, p, A, legal, toCall, pot, ms, eq);
  }

  function betSized(frac) {
    // Friendly bots lean into slightly bigger sizing (home-game feel).
    if (A.friendly) frac = Math.min(1.2, frac * 1.25);
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
  // Stack-relative looseness: cheap calls need less equity (friendly game).
  margin -= stackDiscount(p, toCall, A) * 0.18;
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

// Amogh's sizing: overbets of 1.5x-2.5x pot the moment he thinks he's ahead,
// all-in bombs with monsters (madeStrength >= 0.78 is flush-or-better).
// Returns a move, or null to fall through to the standard postflop logic
// (used when facing a bet without a monster).
function amoghPostflop(table, p, A, legal, toCall, pot, eq, ms, street, liveOpp) {
  function shove() {
    return { a: table.currentBet === 0 ? 'bet' : 'raise', amount: legal.maxRaiseTo };
  }
  if (toCall === 0) {
    var betLine = 0.62 - A.aggression * 0.22 + (street === 'river' ? 0.04 : 0);
    var wantsBet = eq > betLine || ms > 0.74;
    if (!wantsBet) {
      var bluffP = A.bluff * (liveOpp === 1 ? 0.22 : 0.10) * (street === 'river' ? 1 : 0.55);
      if (!(Math.random() < bluffP && ms < 0.55)) return { a: 'check' };
    }
    if (!legal.canBet && !legal.canRaise) return { a: 'check' };
    if (ms > 0.78 && Math.random() < 0.45) return shove(); // monster bomb
    var over = clampRaise(table, p, legal, pot * (1.5 + Math.random()));
    if (over == null) return { a: 'check' };
    if (over >= legal.maxRaiseTo * 0.97) return shove();
    return { a: table.currentBet === 0 ? 'bet' : 'raise', amount: over };
  }
  // Facing a bet: shove over the top with a monster, else standard logic.
  if (ms > 0.78 && Math.random() < 0.6 && legal.canRaise) return shove();
  return null;
}

// Nathan springs the trap on the river: a small value bet (or a rare bomb)
// with near-nut hands; otherwise he checks down. Facing a bet he only
// calls — never raises.
function nathanRiver(table, p, A, legal, toCall, pot, ms, eq) {
  var act = table.currentBet === 0 ? 'bet' : 'raise';
  if (toCall === 0) {
    if (ms > 0.78 && Math.random() < 0.75 && (legal.canBet || legal.canRaise)) {
      if (Math.random() < 0.22) return { a: act, amount: legal.maxRaiseTo }; // rare bomb
      var v = clampRaise(table, p, legal, pot * 0.3);
      if (v != null) return { a: act, amount: v };
    }
    return { a: 'check' };
  }
  var need = toCall / (pot + toCall);
  if (eq > need - 0.05) return { a: 'call' };
  return { a: 'fold' };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ARCHETYPES: ARCHETYPES, getArchetype: getArchetype, customArchetype: customArchetype,
    effectiveArchetype: effectiveArchetype,
    positionScore: positionScore, botDecide: botDecide, holeTier: holeTier,
    amoghPostflop: amoghPostflop, nathanRiver: nathanRiver
  };
}
