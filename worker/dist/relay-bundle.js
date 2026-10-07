var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// js/cards.js
var require_cards = __commonJS({
  "js/cards.js"(exports, module) {
    var SUITS = ["\u2660", "\u2665", "\u2666", "\u2663"];
    var SUIT_NAMES = ["spades", "hearts", "diamonds", "clubs"];
    var RANK_CHARS = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T" };
    var RANK_NAMES = {
      14: "Ace",
      13: "King",
      12: "Queen",
      11: "Jack",
      10: "Ten",
      9: "Nine",
      8: "Eight",
      7: "Seven",
      6: "Six",
      5: "Five",
      4: "Four",
      3: "Three",
      2: "Two"
    };
    function rankChar(r) {
      return RANK_CHARS[r] || String(r);
    }
    function rankName(r) {
      return RANK_NAMES[r];
    }
    function isRed(card) {
      return card.s === 1 || card.s === 2;
    }
    function cardName(c) {
      return rankChar(c.r) + SUITS[c.s];
    }
    function cardsName(cs) {
      return cs.map(cardName).join(" ");
    }
    function makeDeck() {
      var d = [];
      for (var s = 0; s < 4; s++)
        for (var r = 2; r <= 14; r++) d.push({ r, s });
      return d;
    }
    function shuffle(a, rng) {
      rng = rng || Math.random;
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var t = a[i];
        a[i] = a[j];
        a[j] = t;
      }
      return a;
    }
    function sortCardsDesc(cs) {
      return cs.slice().sort(function(a, b) {
        return b.r - a.r || b.s - a.s;
      });
    }
    if (typeof module !== "undefined" && module.exports) {
      module.exports = {
        SUITS,
        SUIT_NAMES,
        RANK_CHARS,
        RANK_NAMES,
        rankChar,
        rankName,
        isRed,
        cardName,
        cardsName,
        makeDeck,
        shuffle,
        sortCardsDesc
      };
    }
  }
});

// js/evaluator.js
var require_evaluator = __commonJS({
  "js/evaluator.js"(exports, module) {
    if (typeof module !== "undefined" && module.exports) {
      __cards = require_cards();
      rankName = __cards.rankName, rankChar = __cards.rankChar;
    }
    var __cards;
    var rankName;
    var rankChar;
    var CATEGORY_NAMES = [
      "High Card",
      "Pair",
      "Two Pair",
      "Three of a Kind",
      "Straight",
      "Flush",
      "Full House",
      "Four of a Kind",
      "Straight Flush"
    ];
    function catOf(score) {
      return Math.floor(score / 1048576);
    }
    function encodeScore(cat, kickers) {
      var s = cat;
      for (var i = 0; i < 5; i++) s = s * 16 + (kickers[i] || 0);
      return s;
    }
    function evaluate5(cards) {
      var ranks = cards.map(function(c) {
        return c.r;
      }).sort(function(a, b) {
        return b - a;
      });
      var flush = cards.every(function(c) {
        return c.s === cards[0].s;
      });
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
      ranks.forEach(function(r) {
        counts[r] = (counts[r] || 0) + 1;
      });
      var groups = Object.keys(counts).map(function(r) {
        return { r: +r, c: counts[r] };
      }).sort(function(a, b) {
        return b.c - a.c || b.r - a.r;
      });
      var g = groups, kick;
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
              var key = pool[j].r + "-" + pool[j].s;
              if (pool[j].r === rank && !used[key]) {
                used[key] = 1;
                best.push(pool[j]);
                break;
              }
            }
          }
        }
        if (cat === 8 || cat === 4) {
          var top = kickers[0], need = [];
          for (var t = 0; t < 5; t++) need.push(top === 5 && t === 4 ? 14 : top - t);
          need.forEach(function(rk) {
            take(rk, 1);
          });
        } else if (cat === 5) {
          best = allCards.slice().sort(function(a, b) {
            return b.r - a.r || b.s - a.s;
          }).slice(0, 5);
        } else {
          var counts2 = {};
          kickers.forEach(function(rk, idx) {
            var n = cat === 7 && idx === 0 ? 4 : cat === 6 ? idx === 0 ? 3 : 2 : cat === 3 && idx === 0 ? 3 : cat === 2 && idx < 2 ? 2 : cat === 1 && idx === 0 ? 2 : 1;
            take(rk, n);
          });
        }
        return { score: encodeScore(cat, kickers), cat, kickers, best5: best };
      }
    }
    function evaluate(cards) {
      if (cards.length === 5) return evaluate5(cards);
      if (cards.length < 5) throw new Error("evaluate needs at least 5 cards");
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
      var k = ev.kickers, rn = typeof rankName !== "undefined" ? rankName : function(r) {
        return String(r);
      };
      function plural(r) {
        return rn(r) + "s";
      }
      switch (ev.cat) {
        case 8:
          return k[0] === 14 ? "Royal Flush" : "Straight Flush, " + rn(k[0]) + " high";
        case 7:
          return "Four of a Kind, " + plural(k[0]);
        case 6:
          return "Full House, " + plural(k[0]) + " over " + plural(k[1]);
        case 5:
          return "Flush, " + rn(k[0]) + " high";
        case 4:
          return "Straight, " + rn(k[0]) + " high";
        case 3:
          return "Three of a Kind, " + plural(k[0]);
        case 2:
          return "Two Pair, " + plural(k[0]) + " and " + plural(k[1]);
        case 1:
          return "Pair of " + plural(k[0]);
        default:
          return rn(k[0]) + " High";
      }
    }
    function compareHands(a, b) {
      return a.score > b.score ? 1 : a.score < b.score ? -1 : 0;
    }
    if (typeof module !== "undefined" && module.exports) {
      module.exports = {
        CATEGORY_NAMES,
        catOf,
        encodeScore,
        evaluate5,
        evaluate,
        evaluate7,
        describeHand,
        compareHands
      };
    }
  }
});

// js/engine.js
var require_engine = __commonJS({
  "js/engine.js"(exports, module) {
    if (typeof module !== "undefined" && module.exports) {
      __cards = require_cards();
      makeDeck = __cards.makeDeck, shuffle = __cards.shuffle;
      __ev = require_evaluator();
      evaluate7 = __ev.evaluate7, describeHand = __ev.describeHand;
    }
    var __cards;
    var makeDeck;
    var shuffle;
    var __ev;
    var evaluate7;
    var describeHand;
    var PokerTable2 = class {
      constructor(opts) {
        opts = opts || {};
        this.players = (opts.players || []).map(function(p, i) {
          return {
            idx: i,
            name: p.name,
            isHero: !!p.isHero,
            archetype: p.archetype || null,
            stack: opts.startingStack != null ? opts.startingStack : 1e4,
            hole: [],
            folded: false,
            allIn: false,
            bet: 0,
            totalBet: 0,
            acted: false,
            sittingOut: false
          };
        });
        this.sb = opts.sb || 50;
        this.bb = opts.bb || 100;
        this.ante = opts.ante || 0;
        this.startingStack = opts.startingStack != null ? opts.startingStack : 1e4;
        this.button = opts.button != null ? opts.button : this.players.length - 1;
        this.handNo = 0;
        this.handOver = true;
        this.onEvent = opts.onEvent || function() {
        };
        this.eventQueue = [];
        this.acting = -1;
      }
      setBlinds(sb, bb, ante) {
        this.sb = sb;
        this.bb = bb;
        this.ante = ante || 0;
      }
      emit(evt) {
        evt.handNo = this.handNo;
        this.eventQueue.push(evt);
        try {
          this.onEvent(evt);
        } catch (e) {
        }
      }
      drainEvents() {
        var q = this.eventQueue;
        this.eventQueue = [];
        return q;
      }
      livePlayers() {
        return this.players.filter(function(p) {
          return !p.folded && !p.sittingOut && (p.stack > 0 || p.totalBet > 0);
        });
      }
      canAct(p) {
        return !p.folded && !p.allIn && !p.sittingOut && p.stack > 0;
      }
      activeCount() {
        return this.players.filter(function(p) {
          return p.stack > 0 && !p.sittingOut;
        }).length;
      }
      // Next seat (exclusive of fromIdx) whose player satisfies filter, wrapping around.
      _nextSeat(fromIdx, filter) {
        var n = this.players.length;
        for (var i = 1; i <= n; i++) {
          var s = (fromIdx + i) % n;
          if (filter(this.players[s])) return s;
        }
        return -1;
      }
      nextLiveSeat(fromIdx, steps) {
        var s = fromIdx;
        for (var k = 0; k < steps; k++)
          s = this._nextSeat(s, function(p) {
            return !p.sittingOut && p.stack > 0;
          });
        return s;
      }
      startHand() {
        if (this.activeCount() < 2) {
          this.emit({ t: "tableBroken" });
          return false;
        }
        this.handNo++;
        this.handOver = false;
        this.community = [];
        this.pot = 0;
        this.street = "preflop";
        this.deck = shuffle(makeDeck());
        var self = this;
        this.players.forEach(function(p) {
          p.hole = [];
          p.folded = false;
          p.allIn = false;
          p.bet = 0;
          p.totalBet = 0;
          p.acted = false;
        });
        this.button = this._nextSeat(this.button, function(p) {
          return p.stack > 0 && !p.sittingOut;
        });
        var live = this.players.filter(function(p) {
          return p.stack > 0 && !p.sittingOut;
        });
        var headsUp = live.length === 2;
        if (this.ante > 0) live.forEach(function(p) {
          self._moveChips(p, Math.min(self.ante, p.stack));
        });
        var sbIdx, bbIdx;
        if (headsUp) {
          sbIdx = this.button;
          bbIdx = this.nextLiveSeat(this.button, 1);
        } else {
          sbIdx = this.nextLiveSeat(this.button, 1);
          bbIdx = this.nextLiveSeat(this.button, 2);
        }
        this.sbIdx = sbIdx;
        this.bbIdx = bbIdx;
        this._moveChips(this.players[sbIdx], Math.min(this.sb, this.players[sbIdx].stack));
        this._moveChips(this.players[bbIdx], Math.min(this.bb, this.players[bbIdx].stack));
        var order = [];
        (function() {
          var s = self.button;
          for (var k = 0; k < live.length; k++) {
            s = self._nextSeat(s, function(p) {
              return p.stack > 0 || p.totalBet > 0;
            });
            order.push(s);
          }
        })();
        for (var r = 0; r < 2; r++) order.forEach(function(s) {
          self.players[s].hole.push(self.deck.pop());
        });
        this.currentBet = this.bb;
        this.lastRaiseSize = this.bb;
        this.acting = bbIdx;
        this.emit({
          t: "handStart",
          button: this.button,
          sbIdx,
          bbIdx,
          sb: this.sb,
          bb: this.bb,
          ante: this.ante,
          stacks: this.players.map(function(p) {
            return p.stack;
          })
        });
        this._step();
        return true;
      }
      _moveChips(p, amt) {
        amt = Math.min(amt, p.stack);
        p.stack -= amt;
        p.bet += amt;
        p.totalBet += amt;
        if (p.stack === 0 && (p.bet > 0 || p.totalBet > 0)) p.allIn = true;
      }
      potTotal() {
        var bets = this.players.reduce(function(s, p) {
          return s + p.bet;
        }, 0);
        return this.pot + bets;
      }
      legalActions(idx) {
        var p = this.players[idx];
        var toCall = this.currentBet - p.bet;
        var maxTo = p.bet + p.stack;
        var out = { toCall, canCheck: toCall === 0, callAmount: Math.min(toCall, p.stack) };
        if (toCall > 0) {
          out.canRaise = p.stack > toCall;
          if (out.canRaise) {
            out.minRaiseTo = Math.min(this.currentBet + this.lastRaiseSize, maxTo);
            out.maxRaiseTo = maxTo;
          }
        } else if (this.currentBet === 0) {
          out.canBet = p.stack > 0;
          if (out.canBet) {
            out.minBetTo = Math.min(this.bb, maxTo);
            out.maxRaiseTo = maxTo;
          }
        } else {
          out.canRaise = p.stack > 0;
          if (out.canRaise) {
            out.minRaiseTo = Math.min(this.currentBet + this.lastRaiseSize, maxTo);
            out.maxRaiseTo = maxTo;
          }
        }
        return out;
      }
      // action: 'fold' | 'check' | 'call' | 'bet' | 'raise'. For bet/raise, amount = TOTAL bet target this street.
      act(idx, action, amount) {
        if (this.handOver) throw new Error("hand is over");
        if (idx !== this.acting) throw new Error("not player " + idx + " turn (acting=" + this.acting + ")");
        var p = this.players[idx];
        if (!this.canAct(p)) throw new Error("player cannot act");
        var toCall = this.currentBet - p.bet;
        if (action === "fold") {
          p.folded = true;
        } else if (action === "check") {
          if (toCall > 0) throw new Error("cannot check facing a bet");
        } else if (action === "call") {
          if (toCall <= 0) throw new Error("nothing to call");
          this._moveChips(p, toCall);
        } else if (action === "bet" || action === "raise") {
          var to = amount;
          if (!(to > this.currentBet)) throw new Error("raise must exceed current bet");
          if (to - p.bet > p.stack) throw new Error("not enough chips");
          var isAllIn = to - p.bet === p.stack;
          var fullRaise = to >= this.currentBet + this.lastRaiseSize;
          if (!isAllIn && !fullRaise) throw new Error("raise below minimum");
          var others = this.players;
          this._moveChips(p, to - p.bet);
          if (to > this.currentBet) {
            if (fullRaise) {
              this.lastRaiseSize = to - this.currentBet;
              this.currentBet = to;
              others.forEach(function(q) {
                if (q !== p && self_canAct(q)) q.acted = false;
              });
            } else {
              this.currentBet = to;
            }
          }
        } else throw new Error("unknown action " + action);
        function self_canAct(q) {
          return !q.folded && !q.allIn && !q.sittingOut && q.stack > 0;
        }
        p.acted = true;
        this.emit({
          t: "actionTaken",
          player: idx,
          action,
          amount: amount || 0,
          bet: p.bet,
          stack: p.stack,
          pot: this.potTotal(),
          currentBet: this.currentBet,
          street: this.street
        });
        this._step();
      }
      _bettingComplete() {
        var self = this;
        var actors = this.players.filter(function(p) {
          return self.canAct(p);
        });
        if (actors.length === 0) return true;
        return actors.every(function(p) {
          return p.acted && p.bet === self.currentBet;
        });
      }
      _step() {
        if (this.handOver) return;
        var live = this.livePlayers();
        if (live.length === 1) return this._winByFold(live[0]);
        if (this._bettingComplete()) return this._endStreet();
        var nxt = this._nextSeat(this.acting, function(p) {
          return !p.folded && !p.allIn && !p.sittingOut && p.stack > 0;
        });
        if (nxt === -1) return this._endStreet();
        this.acting = nxt;
        this.emit({ t: "action", player: nxt, street: this.street });
      }
      _endStreet() {
        var self = this;
        this.players.forEach(function(p) {
          self.pot += p.bet;
          p.bet = 0;
          p.acted = false;
        });
        this.currentBet = 0;
        this.lastRaiseSize = this.bb;
        if (this.street === "river") return this._showdown();
        var deal = this.street === "preflop" ? 3 : 1;
        for (var i = 0; i < deal; i++) this.community.push(this.deck.pop());
        this.street = this.street === "preflop" ? "flop" : this.street === "flop" ? "turn" : "river";
        this.acting = this.button;
        this.emit({ t: "street", street: this.street, community: this.community.slice(), pot: this.pot });
        this._step();
      }
      _winByFold(winner) {
        var self = this;
        this.players.forEach(function(p) {
          self.pot += p.bet;
          p.bet = 0;
        });
        winner.stack += this.pot;
        this.handOver = true;
        this.emit({
          t: "handEnd",
          winners: [{ idx: winner.idx, amount: this.pot, byFold: true }],
          pot: this.pot,
          community: this.community.slice()
        });
        this.pot = 0;
      }
      _buildPots() {
        var contrib = this.players.map(function(p) {
          return p.totalBet;
        });
        var levels = [];
        contrib.forEach(function(c) {
          if (c > 0 && levels.indexOf(c) === -1) levels.push(c);
        });
        levels.sort(function(a, b) {
          return a - b;
        });
        var pots = [], prev = 0, self = this;
        levels.forEach(function(L) {
          var amount = 0, eligible = [];
          self.players.forEach(function(p, i) {
            amount += Math.min(contrib[i], L) - Math.min(contrib[i], prev);
            if (!p.folded && !p.sittingOut && contrib[i] >= L) eligible.push(i);
          });
          if (amount > 0) pots.push({ amount, eligible, level: L, prev });
          prev = L;
        });
        return pots;
      }
      _showdown() {
        var self = this;
        this.players.forEach(function(p) {
          self.pot += p.bet;
          p.bet = 0;
        });
        var pots = this._buildPots();
        var results = [];
        pots.forEach(function(pot, pi) {
          if (pot.eligible.length === 1) {
            var w = pot.eligible[0];
            self.players[w].stack += pot.amount;
            results.push({ potIndex: pi, amount: pot.amount, winners: [w], uncalled: true, hand: null });
            return;
          }
          if (pot.eligible.length === 0) {
            self.players.forEach(function(p) {
              var slice = Math.min(p.totalBet, pot.level) - Math.min(p.totalBet, pot.prev);
              if (slice > 0) p.stack += slice;
            });
            results.push({ potIndex: pi, amount: pot.amount, winners: [], refunded: true, hand: null });
            return;
          }
          var scored = pot.eligible.map(function(i) {
            return { idx: i, ev: evaluate7(self.players[i].hole.concat(self.community)) };
          });
          var best = scored.reduce(function(m, s) {
            return s.ev.score > m.ev.score ? s : m;
          });
          var winners = scored.filter(function(s) {
            return s.ev.score === best.ev.score;
          }).map(function(s) {
            return s.idx;
          });
          winners.sort(function(a, b) {
            return (a - self.button + self.players.length) % self.players.length - (b - self.button + self.players.length) % self.players.length;
          });
          var share = Math.floor(pot.amount / winners.length), rem = pot.amount % winners.length;
          winners.forEach(function(w2, k) {
            self.players[w2].stack += share + (k < rem ? 1 : 0);
          });
          results.push({
            potIndex: pi,
            amount: pot.amount,
            winners,
            each: share,
            hand: describeHand(best.ev),
            best5: best.ev.best5,
            uncalled: false
          });
        });
        this.handOver = true;
        this.emit({
          t: "handEnd",
          winners: results,
          pot: this.pot,
          community: this.community.slice(),
          revealed: this.livePlayers().map(function(p) {
            return { idx: p.idx, hole: p.hole.slice() };
          })
        });
        this.pot = 0;
      }
    };
    if (typeof module !== "undefined" && module.exports) {
      module.exports = { PokerTable: PokerTable2 };
    }
  }
});

// js/room-server.js
var require_room_server = __commonJS({
  "js/room-server.js"(exports, module) {
    var __engine = typeof module !== "undefined" && module.exports ? require_engine() : null;
    var PokerTableCtor = __engine ? __engine.PokerTable : PokerTable;
    var ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    function makeRoomCode() {
      var s = "";
      for (var i = 0; i < 6; i++) s += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
      return s;
    }
    function isValidRoomCode2(s) {
      return typeof s === "string" && /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(s);
    }
    var BREAK_BETWEEN_HANDS_MS = 5e3;
    var MAX_NAME_LEN = 18;
    function clampInt(v, lo, hi, dflt) {
      v = parseInt(v, 10);
      if (isNaN(v)) return dflt;
      return Math.max(lo, Math.min(hi, v));
    }
    var Room2 = class {
      constructor(opts) {
        opts = opts || {};
        this.code = opts.code || makeRoomCode();
        var cfg = opts.config || {};
        this.config = {
          tableName: String(cfg.tableName || "Poker Night").slice(0, 30) || "Poker Night",
          maxPlayers: clampInt(cfg.maxPlayers, 2, 8, 6),
          startingStack: clampInt(cfg.startingStack, 50, 1e6, 1e3),
          sb: clampInt(cfg.sb, 1, 1e5, 5),
          bb: clampInt(cfg.bb, 2, 2e5, 10),
          turnTimerSec: clampInt(cfg.turnTimerSec, 0, 300, 30)
        };
        if (this.config.bb <= this.config.sb) this.config.bb = this.config.sb * 2;
        this.state = "lobby";
        this.players = [];
        this.table = null;
        this.paused = false;
        this.pausedBy = null;
        this._pauseStartedAt = 0;
        this.turnDeadline = 0;
        this._lastActing = -1;
        this.nextHandAt = 0;
        this.lastResult = null;
        this.champion = null;
        this.recent = [];
        this.closed = false;
        this.onEvent = opts.onEvent || function() {
        };
        this._now = opts.now || function() {
          return Date.now();
        };
      }
      _emit(evt) {
        evt.room = this.code;
        try {
          this.onEvent(evt);
        } catch (e) {
        }
      }
      _pushRecent(s) {
        this.recent.push(s);
        if (this.recent.length > 20) this.recent.shift();
      }
      playerByClientId(id) {
        return this.players.filter(function(p) {
          return p.clientId === id;
        })[0] || null;
      }
      playerBySeat(seat) {
        return this.players.filter(function(p) {
          return p.seat === seat;
        })[0] || null;
      }
      host() {
        return this.players.filter(function(p) {
          return p.isHost;
        })[0] || null;
      }
      connectedCount() {
        return this.players.filter(function(p) {
          return p.connected;
        }).length;
      }
      // ---------- lobby ----------
      addPlayer(clientId, name) {
        name = String(name == null ? "" : name).trim().slice(0, MAX_NAME_LEN);
        if (!name) return { ok: false, error: "Enter a name to join." };
        var existing = this.playerByClientId(clientId);
        if (existing) return { ok: true, seat: existing.seat, isHost: existing.isHost, rejoined: true };
        var sameName = this.players.filter(function(p) {
          return p.name === name;
        })[0];
        if (sameName) {
          sameName.clientId = clientId;
          sameName.connected = true;
          this._emit({ t: "playerRejoined", seat: sameName.seat, name });
          return { ok: true, seat: sameName.seat, isHost: sameName.isHost, rejoined: true };
        }
        if (this.state !== "lobby") return { ok: false, error: "Game in progress \u2014 wait for the next one." };
        if (this.players.length >= this.config.maxPlayers)
          return { ok: false, error: "Table is full (" + this.config.maxPlayers + ")." };
        var taken = {};
        this.players.forEach(function(p) {
          taken[p.seat] = true;
        });
        var seat = -1;
        for (var s = 0; s < this.config.maxPlayers; s++) if (!taken[s]) {
          seat = s;
          break;
        }
        var isHost = this.players.length === 0;
        this.players.push({ clientId, name, seat, stack: this.config.startingStack, connected: true, isHost });
        this._emit({ t: "playerJoined", seat, name, isHost });
        return { ok: true, seat, isHost, rejoined: false };
      }
      removePlayer(clientId) {
        var p = this.playerByClientId(clientId);
        if (!p) return { ok: false, error: "not at this table" };
        if (this.state === "lobby") {
          this.players = this.players.filter(function(q) {
            return q !== p;
          });
          if (p.isHost && this.players.length > 0) {
            var nxt = this.players.slice().sort(function(a, b) {
              return a.seat - b.seat;
            })[0];
            nxt.isHost = true;
          }
          if (this.players.length === 0) this.closed = true;
          this._emit({ t: "playerLeft", seat: p.seat, name: p.name });
        } else {
          p.connected = false;
          this._emit({ t: "playerDisconnected", seat: p.seat, name: p.name });
          if (this.table && !this.table.handOver && this.table.acting === p.seat) {
            this._autoAction(p.seat, "left the table");
          }
        }
        return { ok: true };
      }
      setConnected(clientId, connected) {
        var p = this.playerByClientId(clientId);
        if (!p) return;
        p.connected = connected;
        this._emit({ t: connected ? "playerRejoined" : "playerDisconnected", seat: p.seat, name: p.name });
      }
      // ---------- game flow ----------
      start(clientId) {
        var p = this.playerByClientId(clientId);
        if (!p || !p.isHost) return { ok: false, error: "Only the host can start the game." };
        if (this.state !== "lobby") return { ok: false, error: "Game already running." };
        if (this.connectedCount() < 2) return { ok: false, error: "Need at least 2 players to start." };
        var self = this;
        this.players.forEach(function(q) {
          q.stack = self.config.startingStack;
        });
        var seated = this.players.slice().sort(function(a, b) {
          return a.seat - b.seat;
        });
        this.table = new PokerTableCtor({
          players: seated.map(function(q) {
            return { name: q.name };
          }),
          startingStack: this.config.startingStack,
          sb: this.config.sb,
          bb: this.config.bb,
          onEvent: function(e) {
            self._onEngineEvent(e);
          }
        });
        this.state = "playing";
        this.paused = false;
        this.pausedBy = null;
        this.champion = null;
        this.lastResult = null;
        this.recent = [];
        this._pushRecent("Game started \u2014 " + this.connectedCount() + " players.");
        this._emit({ t: "gameStarted" });
        if (!this._startHand()) return { ok: false, error: "Could not start a hand." };
        return { ok: true };
      }
      _startHand() {
        if (this.table.activeCount() < 2) return false;
        this._lastActing = -1;
        this.turnDeadline = 0;
        if (!this.table.startHand()) return false;
        this._pushRecent("Hand #" + this.table.handNo + " dealt.");
        this._afterTableChange();
        return true;
      }
      _onEngineEvent(e) {
        if (e.t === "actionTaken") {
          var p = this.playerBySeat(e.player);
          var nm = p ? p.name : "Seat " + e.player;
          var desc = nm + " " + e.action + (e.amount ? " " + e.amount : "");
          this._pushRecent(desc);
        } else if (e.t === "street") {
          this._pushRecent("\u2014 " + e.street + " \u2014");
        } else if (e.t === "handEnd") {
          var winners = (e.winners || []).map(function(w) {
            var idx = w.idx != null ? w.idx : w.winners && w.winners[0];
            return { idx, amount: w.amount != null ? w.amount : 0, hand: w.hand || null, byFold: !!w.byFold };
          });
          this.lastResult = { winners, revealed: e.revealed || [], handNo: this.table.handNo };
          var self = this;
          winners.forEach(function(w) {
            var pl = self.playerBySeat(w.idx);
            if (pl) self._pushRecent(pl.name + " wins " + w.amount + (w.hand ? " (" + w.hand + ")" : ""));
          });
        }
      }
      // Called after every table mutation: advance timers, detect hand end.
      _afterTableChange() {
        if (!this.table) return;
        if (this.table.handOver) {
          this._onHandEnd();
          return;
        }
        if (this.table.acting !== this._lastActing) {
          this._lastActing = this.table.acting;
          var now = this._now();
          if (this.config.turnTimerSec > 0 && this.state === "playing" && !this.paused) {
            this.turnDeadline = now + this.config.turnTimerSec * 1e3;
          } else {
            this.turnDeadline = 0;
          }
          this._emit({ t: "turn", seat: this.table.acting, msLeft: this._msLeft() });
        }
      }
      _onHandEnd() {
        this.turnDeadline = 0;
        this._lastActing = -1;
        this.nextHandAt = this._now() + BREAK_BETWEEN_HANDS_MS;
        this._emit({ t: "handEnd", result: this.lastResult });
      }
      _maybeNextHand() {
        if (this.table.activeCount() >= 2) {
          this.lastResult = null;
          this._startHand();
        } else {
          var champ = this.table.players.filter(function(p) {
            return p.stack > 0;
          })[0];
          var seat = champ ? champ.idx : -1;
          var pl = seat >= 0 ? this.playerBySeat(seat) : null;
          this.champion = pl ? pl.name : null;
          this.state = "lobby";
          this.table = null;
          this._emit({ t: "gameOver", champion: this.champion });
        }
      }
      _autoAction(seat, reason) {
        if (!this.table || this.table.handOver) return;
        try {
          var legal = this.table.legalActions(seat);
          var action = legal.canCheck ? "check" : "fold";
          this.table.act(seat, action);
          var p = this.playerBySeat(seat);
          this._pushRecent((p ? p.name : "Seat " + seat) + " auto-" + action + "s (" + reason + ")");
        } catch (e) {
        }
        this._afterTableChange();
      }
      applyAction(clientId, action, amount) {
        var p = this.playerByClientId(clientId);
        if (this.state !== "playing" || !this.table) return { ok: false, error: "No hand in progress." };
        if (this.paused) return { ok: false, error: "Game is paused." };
        if (!p || !p.connected) return { ok: false, error: "You are not seated." };
        if (this.table.handOver) return { ok: false, error: "Hand is over." };
        if (this.table.acting !== p.seat) return { ok: false, error: "Not your turn." };
        if (["fold", "check", "call", "bet", "raise"].indexOf(action) === -1)
          return { ok: false, error: "Unknown action." };
        try {
          this.table.act(p.seat, action, amount);
        } catch (e) {
          return { ok: false, error: e && e.message ? e.message : "Illegal action." };
        }
        this._afterTableChange();
        return { ok: true };
      }
      setPaused(clientId, paused) {
        var p = this.playerByClientId(clientId);
        if (!p || !p.isHost) return { ok: false, error: "Only the host can pause." };
        if (this.state !== "playing") return { ok: false, error: "No game running." };
        var now = this._now();
        if (paused && !this.paused) {
          this.paused = true;
          this.pausedBy = p.name;
          this._pauseStartedAt = now;
          this._emit({ t: "paused", by: p.name });
        } else if (!paused && this.paused) {
          var frozen = now - this._pauseStartedAt;
          if (this.turnDeadline) this.turnDeadline += frozen;
          if (this.nextHandAt) this.nextHandAt += frozen;
          this.paused = false;
          this.pausedBy = null;
          this._emit({ t: "resumed" });
        }
        return { ok: true };
      }
      // Called on a timer (worker alarm / mock setInterval / test clock).
      // Returns true if anything changed and clients should get a fresh snapshot.
      tick() {
        if (this.state !== "playing" || this.paused || !this.table) return false;
        var now = this._now();
        if (this.table.handOver) {
          if (now >= this.nextHandAt) {
            this._maybeNextHand();
            return true;
          }
          return false;
        }
        var idx = this.table.acting;
        var p = this.playerBySeat(idx);
        if (!p || !p.connected) {
          this._autoAction(idx, "disconnected");
          return true;
        }
        if (this.config.turnTimerSec > 0 && this.turnDeadline && now >= this.turnDeadline) {
          this._autoAction(idx, "timer expired");
          return true;
        }
        return false;
      }
      needsTick() {
        if (this.state !== "playing" || this.paused || !this.table) return false;
        if (this.table.handOver) return true;
        return this.config.turnTimerSec > 0;
      }
      _msLeft() {
        if (!this.turnDeadline || this.paused) return this.turnDeadline ? Math.max(0, this.turnDeadline - this._now()) : null;
        return Math.max(0, this.turnDeadline - this._now());
      }
      // ---------- snapshots ----------
      getLobby() {
        var self = this;
        return {
          t: "lobby",
          code: this.code,
          state: this.state,
          config: Object.assign({}, this.config),
          champion: this.champion,
          players: this.players.slice().sort(function(a, b) {
            return a.seat - b.seat;
          }).map(function(p) {
            return { seat: p.seat, name: p.name, connected: p.connected, isHost: p.isHost };
          })
        };
      }
      // Per-seat snapshot. Hole cards are included ONLY for the requesting seat.
      getSnapshot(seatIdx) {
        var me = this.playerBySeat(seatIdx);
        var snap = {
          t: "state",
          code: this.code,
          state: this.state,
          config: Object.assign({}, this.config),
          paused: this.paused,
          pausedBy: this.pausedBy,
          mySeat: seatIdx,
          isHost: !!(me && me.isHost),
          players: [],
          handNo: 0,
          street: null,
          community: [],
          pot: 0,
          acting: -1,
          button: -1,
          hole: null,
          legal: null,
          timerMsLeft: null,
          turnTimerSec: this.config.turnTimerSec,
          winners: null,
          showdown: null,
          recent: this.recent.slice(-8),
          champion: this.champion,
          nextHandInMs: 0
        };
        if (this.state === "lobby" || !this.table) {
          snap.players = this.players.slice().sort(function(a, b) {
            return a.seat - b.seat;
          }).map(function(p) {
            return { seat: p.seat, name: p.name, stack: p.stack, connected: p.connected, isHost: p.isHost };
          });
          return snap;
        }
        var t = this.table;
        snap.handNo = t.handNo;
        snap.street = t.street;
        snap.community = t.community.slice();
        snap.pot = t.potTotal();
        snap.acting = t.handOver ? -1 : t.acting;
        snap.button = t.button;
        snap.timerMsLeft = this._msLeft();
        snap.nextHandInMs = t.handOver ? Math.max(0, this.nextHandAt - this._now()) : 0;
        snap.players = t.players.map(function(p) {
          var rp = this.playerBySeat(p.idx);
          return {
            seat: p.idx,
            name: rp ? rp.name : p.name,
            stack: p.stack,
            bet: p.bet,
            folded: p.folded,
            allIn: p.allIn,
            acted: p.acted,
            hasCards: p.hole.length === 2 && !p.folded,
            connected: rp ? rp.connected : true,
            isHost: rp ? rp.isHost : false
          };
        }, this);
        if (me && !t.handOver) {
          var mine = t.players[me.seat];
          if (mine && mine.hole.length === 2) snap.hole = mine.hole.map(function(c) {
            return { r: c.r, s: c.s };
          });
          if (!this.paused && t.acting === me.seat) {
            try {
              snap.legal = t.legalActions(me.seat);
            } catch (e) {
              snap.legal = null;
            }
          }
        }
        if (this.lastResult) {
          snap.winners = this.lastResult.winners;
          snap.showdown = (this.lastResult.revealed || []).map(function(r) {
            return { seat: r.idx, hole: r.hole.map(function(c) {
              return { r: c.r, s: c.s };
            }) };
          });
        }
        return snap;
      }
      // ---- Durable Object persistence ----
      // Rooms must survive DO eviction (idle DOs are dropped; this.room is memory
      // only). toJSON captures everything needed to revive the room, including a
      // mid-hand engine state — all fields are plain JSON data.
      toJSON() {
        var t = this.table;
        return {
          code: this.code,
          config: this.config,
          state: this.state,
          players: this.players,
          table: t ? {
            players: t.players,
            sb: t.sb,
            bb: t.bb,
            ante: t.ante,
            startingStack: t.startingStack,
            button: t.button,
            handNo: t.handNo,
            handOver: t.handOver,
            acting: t.acting,
            deck: t.deck,
            community: t.community,
            pot: t.pot,
            currentBet: t.currentBet,
            lastRaiseSize: t.lastRaiseSize,
            street: t.street,
            sbIdx: t.sbIdx,
            eventQueue: t.eventQueue || []
          } : null,
          paused: this.paused,
          pausedBy: this.pausedBy,
          turnDeadline: this.turnDeadline,
          nextHandAt: this.nextHandAt,
          lastResult: this.lastResult,
          champion: this.champion,
          recent: this.recent,
          closed: this.closed,
          _lastActing: this._lastActing,
          _pauseStartedAt: this._pauseStartedAt
        };
      }
    };
    Room2.fromJSON = function(data) {
      var room = new Room2({ code: data.code, config: data.config });
      room.state = data.state;
      room.players = data.players || [];
      room.paused = !!data.paused;
      room.pausedBy = data.pausedBy || null;
      room.turnDeadline = data.turnDeadline || 0;
      room.nextHandAt = data.nextHandAt || 0;
      room.lastResult = data.lastResult || null;
      room.champion = data.champion || null;
      room.recent = data.recent || [];
      room.closed = !!data.closed;
      room._lastActing = data._lastActing != null ? data._lastActing : -1;
      room._pauseStartedAt = data._pauseStartedAt || 0;
      if (data.table) {
        var t = Object.create(PokerTableCtor.prototype);
        Object.assign(t, data.table);
        t.onEvent = function(e) {
          room._onEngineEvent(e);
        };
        t.eventQueue = t.eventQueue || [];
        room.table = t;
      }
      return room;
    };
    if (typeof module !== "undefined" && module.exports) {
      module.exports = { Room: Room2, makeRoomCode, isValidRoomCode: isValidRoomCode2, BREAK_BETWEEN_HANDS_MS };
    }
  }
});

// worker/room-do.js
var import_room_server = __toESM(require_room_server());
var RoomDO = class {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.room = null;
    this.sessions = /* @__PURE__ */ new Map();
  }
  async fetch(request) {
    const url = new URL(request.url);
    const m = url.pathname.match(/\/room\/([A-Za-z0-9]{6})\/ws$/);
    if (request.headers.get("Upgrade") !== "websocket" || !m) {
      return new Response("Poker Sparring relay \u2014 connect via WebSocket at /room/<CODE>/ws?name=You", { status: 200 });
    }
    const code = m[1].toUpperCase();
    if (!(0, import_room_server.isValidRoomCode)(code)) return new Response("bad room code", { status: 400 });
    const name = (url.searchParams.get("name") || "Player").slice(0, 18);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    const clientId = "c" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    server.serializeAttachment({ clientId, name, code });
    this.sessions.set(server, { clientId, name, code });
    return new Response(null, { status: 101, webSocket: client });
  }
  _meta(ws) {
    let meta = this.sessions.get(ws);
    if (!meta) {
      try {
        meta = ws.deserializeAttachment();
      } catch (e) {
        meta = null;
      }
      if (meta) this.sessions.set(ws, meta);
    }
    return meta || null;
  }
  _getRoom(code) {
    if (!this.room) return null;
    return this.room.code === code ? this.room : null;
  }
  // Rooms live in DO storage, not just memory: idle DOs are evicted, and the
  // room must still be there when players (re)connect minutes later.
  async _ensureRoom(code) {
    if (this.room) return;
    try {
      var data = await this.state.storage.get("room");
      if (data && (!code || data.code === code)) this.room = import_room_server.Room.fromJSON(data);
    } catch (e) {
    }
  }
  async _saveRoom() {
    try {
      if (this.room) await this.state.storage.put("room", this.room.toJSON());
    } catch (e) {
    }
  }
  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }
    const meta = this._meta(ws);
    if (!meta) return;
    const code = meta.code;
    await this._ensureRoom(code);
    if (msg.t === "create") {
      if (!this.room) {
        this.room = new import_room_server.Room({ code, config: msg.config || {} });
      }
      msg = { t: "join", name: meta.name };
    }
    if (!this.room || this.room.code !== code) {
      ws.send(JSON.stringify({ t: "error", message: "Room not found. The host creates it first." }));
      return;
    }
    const room = this.room;
    let changed = false;
    if (msg.t === "join") {
      const r = room.addPlayer(meta.clientId, meta.name);
      if (!r.ok) {
        ws.send(JSON.stringify({ t: "error", message: r.error }));
        return;
      }
      changed = true;
    } else if (msg.t === "start") {
      const r = room.start(meta.clientId);
      if (!r.ok) ws.send(JSON.stringify({ t: "error", message: r.error }));
      else changed = true;
    } else if (msg.t === "action") {
      const r = room.applyAction(meta.clientId, msg.action, msg.amount);
      if (!r.ok) ws.send(JSON.stringify({ t: "error", message: r.error }));
      else changed = true;
    } else if (msg.t === "pause" || msg.t === "resume") {
      const r = room.setPaused(meta.clientId, msg.t === "pause");
      if (!r.ok) ws.send(JSON.stringify({ t: "error", message: r.error }));
      else changed = true;
    } else if (msg.t === "leave") {
      room.removePlayer(meta.clientId);
      changed = true;
      try {
        ws.close(1e3, "left");
      } catch (e) {
      }
    } else {
      ws.send(JSON.stringify({ t: "error", message: "Unknown message." }));
      return;
    }
    if (changed) {
      this.broadcast();
      await this._saveRoom();
    }
    this.scheduleTick();
  }
  async webSocketClose(ws, code, reason, wasClean) {
    const meta = this.sessions.get(ws);
    this.sessions.delete(ws);
    if (meta && this.room) {
      this.room.setConnected(meta.clientId, false);
      this.broadcast();
      await this._saveRoom();
      this.scheduleTick();
    }
  }
  async webSocketError(ws, error) {
    this.webSocketClose(ws, 1011, "error", false);
  }
  // Per-seat snapshots: hole cards go only to their owner.
  broadcast() {
    if (!this.room) return;
    const room = this.room;
    for (const [ws, meta] of this.sessions) {
      const p = room.playerByClientId(meta.clientId);
      if (!p) continue;
      try {
        if (room.state === "lobby") {
          const lob = room.getLobby();
          ws.send(JSON.stringify(Object.assign({}, lob, { you: p.seat, isHost: p.isHost })));
        } else {
          ws.send(JSON.stringify(room.getSnapshot(p.seat)));
        }
      } catch (e) {
      }
    }
  }
  scheduleTick() {
    if (this.room && this.room.needsTick()) {
      this.state.storage.setAlarm(Date.now() + 500).catch(function() {
      });
    }
  }
  async alarm() {
    if (!this.room) {
      await this._ensureRoom();
      return;
    }
    const changed = this.room.tick();
    if (changed) {
      await this._saveRoom();
      if (this.room.state === "lobby") this.broadcast();
      else this.broadcast();
    } else if (this.room.state === "playing" && !this.room.paused && this.room.config.turnTimerSec > 0) {
      const msLeft = this.room._msLeft();
      for (const [ws] of this.sessions) {
        try {
          ws.send(JSON.stringify({ t: "timer", msLeft }));
        } catch (e) {
        }
      }
    }
    this.scheduleTick();
  }
};

// worker/index.js
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{6})(\/ws)?$/);
    if (!m) {
      return new Response(
        "Poker Sparring relay \u2014 play from the Online tab: https://swimkevin.github.io/poker-sparring/",
        { status: 200, headers: { "content-type": "text/plain" } }
      );
    }
    const code = m[1].toUpperCase();
    const id = env.ROOM.idFromName(code);
    const stub = env.ROOM.get(id);
    return stub.fetch(request);
  }
};
export {
  RoomDO,
  index_default as default
};
