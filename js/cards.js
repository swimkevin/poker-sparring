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

// 32 random bits from the strongest source available:
// Web Crypto CSPRNG (browser), Node crypto (tests/CLI), else Math.random.
// Regulated sites seed shuffles from hardware entropy (PokerStars uses a
// quantum RNG + client input); a CSPRNG is the browser-side equivalent —
// Math.random is a predictable PRNG and must never drive a real shuffle.
var _getU32 = null;
function getU32() {
  if (_getU32) return _getU32();
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    var buf = new Uint32Array(1);
    _getU32 = function () { crypto.getRandomValues(buf); return buf[0]; };
  } else if (typeof require !== 'undefined' && typeof module !== 'undefined' && module.exports) {
    try {
      var nodeCrypto = require('crypto');
      if (nodeCrypto && nodeCrypto.randomInt) {
        _getU32 = function () { return nodeCrypto.randomInt(0, 4294967296); };
      }
    } catch (e) { /* fall through to Math.random */ }
  }
  if (!_getU32) _getU32 = function () { return Math.floor(Math.random() * 4294967296); };
  return _getU32();
}

function randInt(n) {
  // Uniform integer in [0, n) via rejection sampling — no modulo bias.
  var limit = Math.floor(4294967296 / n) * n;
  var x;
  do { x = getU32(); } while (x >= limit);
  return x % n;
}

function shuffle(a, rng) {
  if (typeof rng === 'function') {
    // Legacy path: caller-supplied [0,1) float rng (kept for deterministic tests).
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  // Default: Fisher-Yates with CSPRNG + unbiased indices. The whole deck is
  // shuffled once before the hand (like PokerStars: "once the deck is
  // shuffled, it is set, and the order cannot be changed") — no per-card draws.
  for (var k = a.length - 1; k > 0; k--) {
    var m = randInt(k + 1);
    var u = a[k]; a[k] = a[m]; a[m] = u;
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
    makeDeck: makeDeck, shuffle: shuffle, sortCardsDesc: sortCardsDesc,
    getU32: getU32, randInt: randInt
  };
}
