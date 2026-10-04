// cards.js — Card primitives. DOM-free (reused by web UI now, React Native later).
// Card = { r: 2..14, s: 0..3 }  (suits: 0=spades, 1=hearts, 2=diamonds, 3=clubs)

var SUITS = ['\u2660', '\u2665', '\u2666', '\u2663'];
var SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];
var RANK_CHARS = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: 'T' };
var RANK_NAMES = {
  14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 10: 'Ten',
  9: 'Nine', 8: 'Eight', 7: 'Seven', 6: 'Six', 5: 'Five',
  4: 'Four', 3: 'Three', 2: 'Two'
};

function rankChar(r) { return RANK_CHARS[r] || String(r); }
function rankName(r) { return RANK_NAMES[r]; }
function isRed(card) { return card.s === 1 || card.s === 2; }
function cardName(c) { return rankChar(c.r) + SUITS[c.s]; }
function cardsName(cs) { return cs.map(cardName).join(' '); }

function makeDeck() {
  var d = [];
  for (var s = 0; s < 4; s++)
    for (var r = 2; r <= 14; r++) d.push({ r: r, s: s });
  return d;
}

function shuffle(a, rng) {
  rng = rng || Math.random;
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// Sort cards descending by rank (then suit) — handy for display.
function sortCardsDesc(cs) {
  return cs.slice().sort(function (a, b) { return (b.r - a.r) || (b.s - a.s); });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SUITS: SUITS, SUIT_NAMES: SUIT_NAMES, RANK_CHARS: RANK_CHARS, RANK_NAMES: RANK_NAMES,
    rankChar: rankChar, rankName: rankName, isRed: isRed,
    cardName: cardName, cardsName: cardsName,
    makeDeck: makeDeck, shuffle: shuffle, sortCardsDesc: sortCardsDesc
  };
}
