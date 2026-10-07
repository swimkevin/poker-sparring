// engine.js — Texas Hold'em table engine: blinds, betting rounds, side pots, showdown.
// DOM-free. The UI (or a headless test) drives it: startHand() then act() per player.
// Events are emitted via onEvent AND queued in table.eventQueue for animated draining.

// Node: pull cross-file globals when running as modules (browser uses script tags).
if (typeof module !== 'undefined' && module.exports) {
  var __cards = require('./cards.js');
  var makeDeck = __cards.makeDeck, shuffle = __cards.shuffle;
  var __ev = require('./evaluator.js');
  var evaluate7 = __ev.evaluate7, describeHand = __ev.describeHand;
}

class PokerTable {
  constructor(opts) {
    opts = opts || {};
    this.players = (opts.players || []).map(function (p, i) {
      return {
        idx: i, name: p.name, isHero: !!p.isHero, archetype: p.archetype || null,
        stack: opts.startingStack != null ? opts.startingStack : 10000,
        hole: [], folded: false, allIn: false, bet: 0, totalBet: 0,
        acted: false, sittingOut: false,
        rebuys: 0,   // times this player has bought back in after busting
        tilt: 0      // 0..1 — rises on bad beats, decays per hand; loosens play
      };
    });
    this.sb = opts.sb || 50;
    this.bb = opts.bb || 100;
    this.ante = opts.ante || 0;
    this.startingStack = opts.startingStack != null ? opts.startingStack : 10000;
    this.button = opts.button != null ? opts.button : this.players.length - 1;
    this.handNo = 0;
    this.handOver = true;
    this.onEvent = opts.onEvent || function () {};
    this.eventQueue = [];
    this.acting = -1;
  }

  setBlinds(sb, bb, ante) { this.sb = sb; this.bb = bb; this.ante = ante || 0; }

  emit(evt) {
    evt.handNo = this.handNo;
    this.eventQueue.push(evt);
    try { this.onEvent(evt); } catch (e) { /* UI errors must not break the engine */ }
  }

  drainEvents() { var q = this.eventQueue; this.eventQueue = []; return q; }

  livePlayers() {
    // "Live" = still in the hand AND able to contest chips. A broke player with
    // nothing invested holds no cards (startHand only deals to funded seats), so
    // they are not live. Counting them as live let hands run to a showdown with
    // no eligible winner (TypeError in _showdown) or awarded pots to a cardless
    // player by fold. Note: all-in players always have totalBet > 0, so they
    // stay live.
    return this.players.filter(function (p) { return !p.folded && !p.sittingOut && (p.stack > 0 || p.totalBet > 0); });
  }
  canAct(p) { return !p.folded && !p.allIn && !p.sittingOut && p.stack > 0; }
  activeCount() { return this.players.filter(function (p) { return p.stack > 0 && !p.sittingOut; }).length; }

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
      s = this._nextSeat(s, function (p) { return !p.sittingOut && p.stack > 0; });
    return s;
  }

  startHand() {
    if (this.activeCount() < 2) { this.emit({ t: 'tableBroken' }); return false; }
    this.handNo++;
    this.handOver = false;
    this.community = [];
    this.pot = 0;
    this.street = 'preflop';
    this.deck = shuffle(makeDeck());
    var self = this;
    this.players.forEach(function (p) {
      p.hole = []; p.folded = false; p.allIn = false;
      p.bet = 0; p.totalBet = 0; p.acted = false;
    });

    // Rotate button to next active seat.
    this.button = this._nextSeat(this.button, function (p) { return p.stack > 0 && !p.sittingOut; });

    var live = this.players.filter(function (p) { return p.stack > 0 && !p.sittingOut; });
    var headsUp = live.length === 2;

    // Antes first.
    if (this.ante > 0) live.forEach(function (p) { self._moveChips(p, Math.min(self.ante, p.stack)); });

    var sbIdx, bbIdx;
    if (headsUp) { sbIdx = this.button; bbIdx = this.nextLiveSeat(this.button, 1); }
    else { sbIdx = this.nextLiveSeat(this.button, 1); bbIdx = this.nextLiveSeat(this.button, 2); }
    this.sbIdx = sbIdx; this.bbIdx = bbIdx;
    this._moveChips(this.players[sbIdx], Math.min(this.sb, this.players[sbIdx].stack));
    this._moveChips(this.players[bbIdx], Math.min(this.bb, this.players[bbIdx].stack));

    // Deal two cards each, starting left of the button.
    var order = [];
    (function () {
      var s = self.button;
      for (var k = 0; k < live.length; k++) { s = self._nextSeat(s, function (p) { return p.stack > 0 || p.totalBet > 0; }); order.push(s); }
    })();
    for (var r = 0; r < 2; r++) order.forEach(function (s) { self.players[s].hole.push(self.deck.pop()); });

    this.currentBet = this.bb;
    this.lastRaiseSize = this.bb;
    this.acting = bbIdx; // step() advances to first real actor
    this.emit({
      t: 'handStart', button: this.button, sbIdx: sbIdx, bbIdx: bbIdx,
      sb: this.sb, bb: this.bb, ante: this.ante,
      stacks: this.players.map(function (p) { return p.stack; })
    });
    this._step();
    return true;
  }

  _moveChips(p, amt) {
    amt = Math.min(amt, p.stack);
    p.stack -= amt; p.bet += amt; p.totalBet += amt;
    if (p.stack === 0 && (p.bet > 0 || p.totalBet > 0)) p.allIn = true;
  }

  potTotal() {
    var bets = this.players.reduce(function (s, p) { return s + p.bet; }, 0);
    return this.pot + bets;
  }

  legalActions(idx) {
    var p = this.players[idx];
    var toCall = this.currentBet - p.bet;
    var maxTo = p.bet + p.stack; // total-bet target if shoving
    var out = { toCall: toCall, canCheck: toCall === 0, callAmount: Math.min(toCall, p.stack) };
    if (toCall > 0) {
      // Facing a bet: fold / call / raise.
      out.canRaise = p.stack > toCall;
      if (out.canRaise) {
        out.minRaiseTo = Math.min(this.currentBet + this.lastRaiseSize, maxTo);
        out.maxRaiseTo = maxTo;
      }
    } else if (this.currentBet === 0) {
      // No bets yet this street: check or open-bet.
      out.canBet = p.stack > 0;
      if (out.canBet) { out.minBetTo = Math.min(this.bb, maxTo); out.maxRaiseTo = maxTo; }
    } else {
      // Already matched the bet (e.g. big blind option): check or raise.
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
    if (this.handOver) throw new Error('hand is over');
    if (idx !== this.acting) throw new Error('not player ' + idx + ' turn (acting=' + this.acting + ')');
    var p = this.players[idx];
    if (!this.canAct(p)) throw new Error('player cannot act');
    var toCall = this.currentBet - p.bet;

    if (action === 'fold') { p.folded = true; }
    else if (action === 'check') {
      if (toCall > 0) throw new Error('cannot check facing a bet');
    }
    else if (action === 'call') {
      if (toCall <= 0) throw new Error('nothing to call');
      this._moveChips(p, toCall);
    }
    else if (action === 'bet' || action === 'raise') {
      var to = amount;
      if (!(to > this.currentBet)) throw new Error('raise must exceed current bet');
      if (to - p.bet > p.stack) throw new Error('not enough chips');
      var isAllIn = (to - p.bet) === p.stack;
      var fullRaise = to >= this.currentBet + this.lastRaiseSize;
      if (!isAllIn && !fullRaise) throw new Error('raise below minimum');
      var others = this.players;
      this._moveChips(p, to - p.bet);
      if (to > this.currentBet) {
        if (fullRaise) {
          this.lastRaiseSize = to - this.currentBet;
          this.currentBet = to;
          // Reopen action for everyone who can still act.
          others.forEach(function (q) { if (q !== p && self_canAct(q)) q.acted = false; });
        } else {
          // Short all-in: raises the current bet but does not reopen action.
          this.currentBet = to;
        }
      }
    }
    else throw new Error('unknown action ' + action);

    function self_canAct(q) { return !q.folded && !q.allIn && !q.sittingOut && q.stack > 0; }

    p.acted = true;
    this.emit({
      t: 'actionTaken', player: idx, action: action, amount: amount || 0,
      bet: p.bet, stack: p.stack, pot: this.potTotal(), currentBet: this.currentBet,
      street: this.street
    });
    this._step();
  }

  _bettingComplete() {
    var self = this;
    var actors = this.players.filter(function (p) { return self.canAct(p); });
    if (actors.length === 0) return true;
    return actors.every(function (p) { return p.acted && p.bet === self.currentBet; });
  }

  _step() {
    if (this.handOver) return;
    var live = this.livePlayers();
    if (live.length === 1) return this._winByFold(live[0]);
    if (this._bettingComplete()) return this._endStreet();
    var nxt = this._nextSeat(this.acting, function (p) {
      return !p.folded && !p.allIn && !p.sittingOut && p.stack > 0;
    });
    if (nxt === -1) return this._endStreet();
    this.acting = nxt;
    this.emit({ t: 'action', player: nxt, street: this.street });
  }

  _endStreet() {
    var self = this;
    this.players.forEach(function (p) { self.pot += p.bet; p.bet = 0; p.acted = false; });
    this.currentBet = 0;
    this.lastRaiseSize = this.bb;
    if (this.street === 'river') return this._showdown();
    var deal = this.street === 'preflop' ? 3 : 1;
    for (var i = 0; i < deal; i++) this.community.push(this.deck.pop());
    this.street = this.street === 'preflop' ? 'flop' : this.street === 'flop' ? 'turn' : 'river';
    this.acting = this.button;
    this.emit({ t: 'street', street: this.street, community: this.community.slice(), pot: this.pot });
    this._step();
  }

  _winByFold(winner) {
    var self = this;
    this.players.forEach(function (p) { self.pot += p.bet; p.bet = 0; });
    winner.stack += this.pot;
    this.handOver = true;
    this.emit({
      t: 'handEnd', winners: [{ idx: winner.idx, amount: this.pot, byFold: true }],
      pot: this.pot, community: this.community.slice()
    });
    this.pot = 0;
  }

  _buildPots() {
    var contrib = this.players.map(function (p) { return p.totalBet; });
    var levels = [];
    contrib.forEach(function (c) { if (c > 0 && levels.indexOf(c) === -1) levels.push(c); });
    levels.sort(function (a, b) { return a - b; });
    var pots = [], prev = 0, self = this;
    levels.forEach(function (L) {
      var amount = 0, eligible = [];
      self.players.forEach(function (p, i) {
        amount += Math.min(contrib[i], L) - Math.min(contrib[i], prev);
        if (!p.folded && !p.sittingOut && contrib[i] >= L) eligible.push(i);
      });
      if (amount > 0) pots.push({ amount: amount, eligible: eligible, level: L, prev: prev });
      prev = L;
    });
    return pots;
  }

  _showdown() {
    var self = this;
    this.players.forEach(function (p) { self.pot += p.bet; p.bet = 0; });
    var pots = this._buildPots();
    var results = []; // {pot, winners:[idx], hand, amount each}
    pots.forEach(function (pot, pi) {
      if (pot.eligible.length === 1) {
        var w = pot.eligible[0];
        self.players[w].stack += pot.amount;
        results.push({ potIndex: pi, amount: pot.amount, winners: [w], uncalled: true, hand: null });
        return;
      }
      if (pot.eligible.length === 0) {
        // Degenerate: no live player can win this level. Unreachable via _step
        // (the hand ends when a single contender remains), but _showdown is also
        // invoked directly — never crash the app. Refund each contributor their
        // slice at this level so chips are exactly conserved.
        self.players.forEach(function (p) {
          var slice = Math.min(p.totalBet, pot.level) - Math.min(p.totalBet, pot.prev);
          if (slice > 0) p.stack += slice;
        });
        results.push({ potIndex: pi, amount: pot.amount, winners: [], refunded: true, hand: null });
        return;
      }
      var scored = pot.eligible.map(function (i) {
        return { idx: i, ev: evaluate7(self.players[i].hole.concat(self.community)) };
      });
      var best = scored.reduce(function (m, s) { return s.ev.score > m.ev.score ? s : m; });
      var winners = scored.filter(function (s) { return s.ev.score === best.ev.score; }).map(function (s) { return s.idx; });
      // Order winners from left of button for odd-chip distribution.
      winners.sort(function (a, b) {
        return ((a - self.button + self.players.length) % self.players.length) -
               ((b - self.button + self.players.length) % self.players.length);
      });
      var share = Math.floor(pot.amount / winners.length), rem = pot.amount % winners.length;
      winners.forEach(function (w, k) {
        self.players[w].stack += share + (k < rem ? 1 : 0);
      });
      results.push({
        potIndex: pi, amount: pot.amount, winners: winners,
        each: share, hand: describeHand(best.ev), best5: best.ev.best5, uncalled: false
      });
    });
    this.handOver = true;
    this.emit({
      t: 'handEnd', winners: results, pot: this.pot, community: this.community.slice(),
      revealed: this.livePlayers().map(function (p) { return { idx: p.idx, hole: p.hole.slice() }; })
    });
    this.pot = 0;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PokerTable: PokerTable };
}
