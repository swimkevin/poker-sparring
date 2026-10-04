// pushfold.js — Short-stack push/fold drill scenarios + feedback. DOM-free.
//
// Each scenario: hero has 5-15bb, random position, 1-3 opponents. Either hero
// acts first (SHOVE/FOLD) or faces an open-shove (CALL/FOLD). Feedback compares
// the player's choice against a simplified push/fold chart plus pot-odds math.

if (typeof module !== 'undefined' && module.exports) {
  var __eq = require('./equity.js');
  var holeTier = __eq.holeTier, estimateEquity = __eq.estimateEquity, tierName = __eq.tierName;
  var __cards = require('./cards.js');
  var makeDeck = __cards.makeDeck, shuffle = __cards.shuffle, rankChar = __cards.rankChar;
  var __bots = require('./bots.js');
  var ARCHETYPES = __bots.ARCHETYPES;
}

var PF_POSITIONS = ['BTN', 'SB', 'BB', 'CO', 'MP', 'UTG'];

function newPushFoldScenario() {
  var deck = shuffle(makeDeck());
  var heroHole = [deck.pop(), deck.pop()];
  var stackBB = 5 + Math.floor(Math.random() * 11); // 5..15
  var nPlayers = 2 + Math.floor(Math.random() * 3); // 2..4 handed
  var pos = PF_POSITIONS[Math.floor(Math.random() * Math.min(nPlayers + 1, PF_POSITIONS.length))];
  var nOpp = nPlayers - 1;
  var opps = [];
  for (var i = 0; i < nOpp; i++) {
    var a = ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];
    opps.push({ name: a.name, emoji: a.emoji, id: a.id, stackBB: 8 + Math.floor(Math.random() * 30) });
  }
  var facingShove = Math.random() < 0.35;
  var shover = null;
  if (facingShove) {
    shover = opps[Math.floor(Math.random() * opps.length)];
    shover.shoving = true;
  }
  return {
    heroHole: heroHole, stackBB: stackBB, pos: pos, nPlayers: nPlayers,
    opponents: opps, facingShove: facingShove, shover: shover,
    potBB: 1.5 // blinds
  };
}

// Simplified chart: max hole-tier that should shove, by position & stack.
function chartShoveTier(pos, stackBB) {
  var late = (pos === 'BTN' || pos === 'SB' || pos === 'CO');
  if (stackBB <= 8) return late ? 5 : 3;
  if (stackBB <= 12) return late ? 4 : (pos === 'BB' ? 4 : 3);
  return late ? 4 : 2;
}

function evaluatePushFold(scn, action) {
  // action: 'shove' | 'fold' | 'call'
  var tier = holeTier(scn.heroHole);
  var eq = estimateEquity(scn.heroHole, [], scn.opponents.length, 400);
  var out = { tier: tier, tierName: tierName(tier), equity: eq };

  if (!scn.facingShove) {
    var shoveTier = chartShoveTier(scn.pos, scn.stackBB);
    out.chartTier = shoveTier;
    out.correct = tier <= shoveTier;
    out.playerAction = action;
    out.right = (action === 'shove') === out.correct;
    out.explain = 'With ' + scn.stackBB + 'bb ' +
      (scn.pos === 'BB' ? 'in the big blind' : 'on the ' + scn.pos) +
      ', the chart shoves the top ~' + tierLabel(shoveTier) + ' of hands. ' +
      'Your ' + cardPairName(scn.heroHole) + ' is ' + tierName(tier) + ' (tier ' + tier + '). ' +
      'Estimated equity vs ' + scn.opponents.length + ' random hand(s): ' + Math.round(eq * 100) + '%. ' +
      (out.right
        ? (action === 'shove' ? 'Correct shove — fold equity + hand strength makes this +EV.' : 'Correct fold — too weak to shove here; wait for a better spot.')
        : (action === 'shove' ? 'Too loose — this hand should be folded at this stack/position.' : 'Too tight — this is a standard shove; you are passing up +EV chips.'));
  } else {
    // Facing a shove: pot odds math.
    var toCall = Math.min(scn.stackBB, scn.shover.stackBB);
    var potAfter = scn.potBB + scn.shover.stackBB + toCall;
    var need = toCall / potAfter;
    out.need = need;
    out.correct = tier <= 2 || (tier === 3 && need < 0.42) || (eq > need + 0.05 && tier <= 4);
    out.playerAction = action;
    out.right = (action === 'call') === out.correct;
    out.explain = scn.shover.emoji + ' ' + scn.shover.name + ' shoves ' + scn.shover.stackBB + 'bb. ' +
      'Calling ' + toCall + 'bb to win ' + Math.round(potAfter) + 'bb — you need ' + Math.round(need * 100) + '% equity. ' +
      'Your ' + cardPairName(scn.heroHole) + ' (' + tierName(tier) + ') has ~' + Math.round(eq * 100) + '% vs a random hand. ' +
      (out.right
        ? (action === 'call' ? 'Correct call — the price is right for this hand.' : 'Correct fold — not enough equity to call off your stack.')
        : (action === 'call' ? 'Too loose — you are not getting the right price with this hand.' : 'Too tight — this hand is strong enough to call the shove.'));
  }
  return out;
}

function tierLabel(t) {
  return { 1: '3%', 2: '8%', 3: '15%', 4: '25%', 5: '40%' }[t] || '?';
}
function cardPairName(hole) {
  return hole.map(function (c) { return rankChar(c.r); }).join('') + (hole[0].s === hole[1].s ? 's' : 'o');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    newPushFoldScenario: newPushFoldScenario, evaluatePushFold: evaluatePushFold,
    chartShoveTier: chartShoveTier
  };
}
