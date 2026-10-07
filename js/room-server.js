// room-server.js — Authoritative online room state machine for Poker Sparring.
// DOM-free. Wraps the PokerTable engine (js/engine.js): the Room owns the lobby,
// seating, turn timers, and pause; the engine owns the poker rules.
// Runs in Node tests, in the browser (MockRoomServer in js/netplay.js), and
// bundled into the Cloudflare Durable Object (worker/room-do.js).
//
// Design notes:
// - All time goes through an injectable clock (opts.now) so tests are deterministic.
// - Validation methods return {ok:true,...} / {ok:false,error} — never throw for
//   protocol-level mistakes. The engine may still throw on illegal actions; the
//   Room catches those and converts them to error results.
// - Hole cards are NEVER in public state. getSnapshot(seatIdx) includes the
//   requester's own hole cards only.

// Node: pull the engine constructor when running as a module.
// (Browser: PokerTable is a global class from the engine.js script tag. It is
// aliased as PokerTableCtor on purpose: a hoisted `var PokerTable` would
// collide with the `class PokerTable` binding and this script would fail to
// parse when loaded via browser script tags.)
var __engine = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : null;
var PokerTableCtor = __engine ? __engine.PokerTable : PokerTable;

var ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
function makeRoomCode() {
  var s = '';
  for (var i = 0; i < 6; i++) s += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  return s;
}
function isValidRoomCode(s) {
  return typeof s === 'string' && /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(s);
}

var BREAK_BETWEEN_HANDS_MS = 5000;
var MAX_NAME_LEN = 18;

function clampInt(v, lo, hi, dflt) {
  v = parseInt(v, 10);
  if (isNaN(v)) return dflt;
  return Math.max(lo, Math.min(hi, v));
}

class Room {
  constructor(opts) {
    opts = opts || {};
    this.code = opts.code || makeRoomCode();
    var cfg = opts.config || {};
    this.config = {
      tableName: String(cfg.tableName || 'Poker Night').slice(0, 30) || 'Poker Night',
      maxPlayers: clampInt(cfg.maxPlayers, 2, 8, 6),
      startingStack: clampInt(cfg.startingStack, 50, 1000000, 1000),
      sb: clampInt(cfg.sb, 1, 100000, 5),
      bb: clampInt(cfg.bb, 2, 200000, 10),
      turnTimerSec: clampInt(cfg.turnTimerSec, 0, 300, 30)
    };
    if (this.config.bb <= this.config.sb) this.config.bb = this.config.sb * 2;
    this.state = 'lobby'; // lobby | playing | gameOver(not used: game over returns to lobby)
    this.players = [];    // {clientId, name, seat, stack, connected, isHost}
    this.table = null;    // PokerTable while a game is running
    this.paused = false;
    this.pausedBy = null;
    this._pauseStartedAt = 0;
    this.turnDeadline = 0; // ms epoch; 0 = no active timer
    this._lastActing = -1;
    this.nextHandAt = 0;
    this.lastResult = null; // {winners, revealed, handNo} from the last handEnd
    this.champion = null;
    this.recent = [];
    this.closed = false;
    this.onEvent = opts.onEvent || function () {};
    this._now = opts.now || function () { return Date.now(); };
  }

  _emit(evt) {
    evt.room = this.code;
    try { this.onEvent(evt); } catch (e) { /* transport errors must not break the room */ }
  }

  _pushRecent(s) {
    this.recent.push(s);
    if (this.recent.length > 20) this.recent.shift();
  }

  playerByClientId(id) {
    return this.players.filter(function (p) { return p.clientId === id; })[0] || null;
  }
  playerBySeat(seat) {
    return this.players.filter(function (p) { return p.seat === seat; })[0] || null;
  }
  host() {
    return this.players.filter(function (p) { return p.isHost; })[0] || null;
  }
  connectedCount() {
    return this.players.filter(function (p) { return p.connected; }).length;
  }

  // ---------- lobby ----------

  addPlayer(clientId, name) {
    name = String(name == null ? '' : name).trim().slice(0, MAX_NAME_LEN);
    if (!name) return { ok: false, error: 'Enter a name to join.' };
    var existing = this.playerByClientId(clientId);
    if (existing) return { ok: true, seat: existing.seat, isHost: existing.isHost, rejoined: true };
    // Session takeover: the same name rebinds to the new connection, whether the
    // old seat is a disconnected ghost or its socket hasn't been recognized as
    // closed yet (a fast redial would otherwise be rejected as "name taken",
    // stranding the player with no seat). Names are unique per table, so the
    // newcomer is the name-holder; the stale socket's later actions/close are
    // no-ops once the clientId is rebound.
    var sameName = this.players.filter(function (p) { return p.name === name; })[0];
    if (sameName) {
      sameName.clientId = clientId;
      sameName.connected = true;
      this._emit({ t: 'playerRejoined', seat: sameName.seat, name: name });
      return { ok: true, seat: sameName.seat, isHost: sameName.isHost, rejoined: true };
    }
    if (this.state !== 'lobby') return { ok: false, error: 'Game in progress — wait for the next one.' };
    if (this.players.length >= this.config.maxPlayers)
      return { ok: false, error: 'Table is full (' + this.config.maxPlayers + ').' };
    var taken = {};
    this.players.forEach(function (p) { taken[p.seat] = true; });
    var seat = -1;
    for (var s = 0; s < this.config.maxPlayers; s++) if (!taken[s]) { seat = s; break; }
    var isHost = this.players.length === 0;
    this.players.push({ clientId: clientId, name: name, seat: seat, stack: this.config.startingStack, connected: true, isHost: isHost, sittingOut: false });
    this._emit({ t: 'playerJoined', seat: seat, name: name, isHost: isHost });
    return { ok: true, seat: seat, isHost: isHost, rejoined: false };
  }

  removePlayer(clientId) {
    var p = this.playerByClientId(clientId);
    if (!p) return { ok: false, error: 'not at this table' };
    if (this.state === 'lobby') {
      this.players = this.players.filter(function (q) { return q !== p; });
      if (p.isHost && this.players.length > 0) {
        // Host migrates to the lowest remaining seat.
        var nxt = this.players.slice().sort(function (a, b) { return a.seat - b.seat; })[0];
        nxt.isHost = true;
      }
      if (this.players.length === 0) this.closed = true;
      this._emit({ t: 'playerLeft', seat: p.seat, name: p.name });
    } else {
      // Mid-game leave: keep the seat (chips stay), mark disconnected. Their
      // turns auto-fold via tick(). Rejoin with the same name reclaims the seat.
      p.connected = false;
      this._emit({ t: 'playerDisconnected', seat: p.seat, name: p.name });
      if (this.table && !this.table.handOver && this.table.acting === p.seat) {
        this._autoAction(p.seat, 'left the table');
      }
    }
    return { ok: true };
  }

  setConnected(clientId, connected) {
    var p = this.playerByClientId(clientId);
    if (!p) return;
    p.connected = connected;
    this._emit({ t: connected ? 'playerRejoined' : 'playerDisconnected', seat: p.seat, name: p.name });
  }

  // ---------- game flow ----------

  start(clientId) {
    var p = this.playerByClientId(clientId);
    if (!p || !p.isHost) return { ok: false, error: 'Only the host can start the game.' };
    if (this.state !== 'lobby') return { ok: false, error: 'Game already running.' };
    if (this.connectedCount() < 2) return { ok: false, error: 'Need at least 2 players to start.' };
    // Fresh game: everyone buys in at the configured stack.
    var self = this;
    this.players.forEach(function (q) { q.stack = self.config.startingStack; q.sittingOut = false; });
    var seated = this.players.slice().sort(function (a, b) { return a.seat - b.seat; });
    this.table = new PokerTableCtor({
      players: seated.map(function (q) { return { name: q.name }; }),
      startingStack: this.config.startingStack,
      sb: this.config.sb, bb: this.config.bb,
      onEvent: function (e) { self._onEngineEvent(e); }
    });
    this.state = 'playing';
    this.paused = false;
    this.pausedBy = null;
    this.champion = null;
    this.lastResult = null;
    this.recent = [];
    this._pushRecent('Game started — ' + this.connectedCount() + ' players.');
    this._emit({ t: 'gameStarted' });
    if (!this._startHand()) return { ok: false, error: 'Could not start a hand.' };
    return { ok: true };
  }

  _startHand() {
    if (this.table.activeCount() < 2) return false;
    // The Room flag is the source of truth; mirror it onto the engine seats so
    // blinds, action order, and pots skip sitters-out. (Mid-hand the engine
    // flag is left alone so an all-in sitter keeps pot eligibility.)
    var self = this;
    this.players.forEach(function (p) {
      var ep = self.table.players[p.seat];
      if (ep) ep.sittingOut = !!p.sittingOut;
    });
    this._lastActing = -1;
    this.turnDeadline = 0;
    if (!this.table.startHand()) return false;
    this._pushRecent('Hand #' + this.table.handNo + ' dealt.');
    this._afterTableChange();
    return true;
  }

  _onEngineEvent(e) {
    if (e.t === 'actionTaken') {
      var p = this.playerBySeat(e.player);
      var nm = p ? p.name : ('Seat ' + e.player);
      var desc = nm + ' ' + e.action + (e.amount ? ' ' + e.amount : '');
      this._pushRecent(desc);
    } else if (e.t === 'street') {
      this._pushRecent('— ' + e.street + ' —');
    } else if (e.t === 'handEnd') {
      var winners = (e.winners || []).map(function (w) {
        // handEnd winners shape differs for fold-wins vs showdowns; normalize.
        var idx = (w.idx != null) ? w.idx : (w.winners && w.winners[0]);
        return { idx: idx, amount: w.amount != null ? w.amount : 0, hand: w.hand || null, byFold: !!w.byFold };
      });
      this.lastResult = { winners: winners, revealed: e.revealed || [], handNo: this.table.handNo };
      var self = this;
      winners.forEach(function (w) {
        var pl = self.playerBySeat(w.idx);
        if (pl) self._pushRecent(pl.name + ' wins ' + w.amount + (w.hand ? ' (' + w.hand + ')' : ''));
      });
    }
  }

  // Called after every table mutation: advance timers, detect hand end.
  _afterTableChange() {
    if (!this.table) return;
    if (this.table.handOver) { this._onHandEnd(); return; }
    if (this.table.acting !== this._lastActing) {
      this._lastActing = this.table.acting;
      var now = this._now();
      if (this.config.turnTimerSec > 0 && this.state === 'playing' && !this.paused) {
        this.turnDeadline = now + this.config.turnTimerSec * 1000;
      } else {
        this.turnDeadline = 0;
      }
      this._emit({ t: 'turn', seat: this.table.acting, msLeft: this._msLeft() });
    }
  }

  _onHandEnd() {
    this.turnDeadline = 0;
    this._lastActing = -1;
    this.nextHandAt = this._now() + BREAK_BETWEEN_HANDS_MS;
    this._emit({ t: 'handEnd', result: this.lastResult });
  }

  _maybeNextHand() {
    if (this.table.activeCount() >= 2) {
      this.lastResult = null;
      this._startHand();
    } else {
      // One player owns all the chips: crown them, back to lobby.
      var champ = this.table.players.filter(function (p) { return p.stack > 0; })[0];
      var seat = champ ? champ.idx : -1;
      var pl = seat >= 0 ? this.playerBySeat(seat) : null;
      this.champion = pl ? pl.name : null;
      this.state = 'lobby';
      this.table = null;
      this._emit({ t: 'gameOver', champion: this.champion });
    }
  }

  // Sit out (or back in). Sitting out mid-hand kills the hand immediately;
  // sitters are skipped for blinds and action until they return. An all-in
  // player's pot eligibility is untouched: only the Room flag is set and the
  // engine picks it up next hand.
  setSitOut(clientId, out) {
    var p = this.playerByClientId(clientId);
    if (!p) return { ok: false, error: 'You are not seated.' };
    out = !!out;
    if (!!p.sittingOut === out) return { ok: true };
    p.sittingOut = out;
    var ep = this.table && this.table.players[p.seat];
    if (out && this.table && !this.table.handOver && ep && !ep.folded && !ep.allIn) {
      try { this.table.act(p.seat, 'fold'); }
      catch (e) { ep.folded = true; ep.acted = true; } // not their turn: engine skips folded seats
    }
    this._pushRecent(p.name + (out ? ' sits out.' : ' is back in.'));
    this._afterTableChange();
    return { ok: true };
  }

  _autoAction(seat, reason) {
    if (!this.table || this.table.handOver) return;
    try {
      var legal = this.table.legalActions(seat);
      var action = legal.canCheck ? 'check' : 'fold';
      this.table.act(seat, action);
      var p = this.playerBySeat(seat);
      this._pushRecent((p ? p.name : 'Seat ' + seat) + ' auto-' + action + 's (' + reason + ')');
    } catch (e) { /* engine is the source of truth; a failed auto-action just stalls to next tick */ }
    this._afterTableChange();
  }

  applyAction(clientId, action, amount) {
    var p = this.playerByClientId(clientId);
    if (this.state !== 'playing' || !this.table) return { ok: false, error: 'No hand in progress.' };
    if (this.paused) return { ok: false, error: 'Game is paused.' };
    if (!p || !p.connected) return { ok: false, error: 'You are not seated.' };
    if (this.table.handOver) return { ok: false, error: 'Hand is over.' };
    if (this.table.acting !== p.seat) return { ok: false, error: 'Not your turn.' };
    if (['fold', 'check', 'call', 'bet', 'raise'].indexOf(action) === -1)
      return { ok: false, error: 'Unknown action.' };
    try {
      this.table.act(p.seat, action, amount);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : 'Illegal action.' };
    }
    this._afterTableChange();
    return { ok: true };
  }

  setPaused(clientId, paused) {
    var p = this.playerByClientId(clientId);
    if (!p || !p.isHost) return { ok: false, error: 'Only the host can pause.' };
    if (this.state !== 'playing') return { ok: false, error: 'No game running.' };
    var now = this._now();
    if (paused && !this.paused) {
      this.paused = true;
      this.pausedBy = p.name;
      this._pauseStartedAt = now;
      this._emit({ t: 'paused', by: p.name });
    } else if (!paused && this.paused) {
      var frozen = now - this._pauseStartedAt;
      if (this.turnDeadline) this.turnDeadline += frozen;
      if (this.nextHandAt) this.nextHandAt += frozen;
      this.paused = false;
      this.pausedBy = null;
      this._emit({ t: 'resumed' });
    }
    return { ok: true };
  }

  // Called on a timer (worker alarm / mock setInterval / test clock).
  // Returns true if anything changed and clients should get a fresh snapshot.
  tick() {
    if (this.state !== 'playing' || this.paused || !this.table) return false;
    var now = this._now();
    if (this.table.handOver) {
      if (now >= this.nextHandAt) { this._maybeNextHand(); return true; }
      return false;
    }
    var idx = this.table.acting;
    var p = this.playerBySeat(idx);
    if (!p || !p.connected) { this._autoAction(idx, 'disconnected'); return true; }
    if (this.config.turnTimerSec > 0 && this.turnDeadline && now >= this.turnDeadline) {
      this._autoAction(idx, 'timer expired');
      return true;
    }
    return false;
  }

  needsTick() {
    // For worker alarms: is there anything time-based pending?
    if (this.state !== 'playing' || this.paused || !this.table) return false;
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
      t: 'lobby', code: this.code, state: this.state,
      config: Object.assign({}, this.config),
      champion: this.champion,
      players: this.players.slice().sort(function (a, b) { return a.seat - b.seat; })
        .map(function (p) { return { seat: p.seat, name: p.name, connected: p.connected, isHost: p.isHost, sittingOut: !!p.sittingOut }; })
    };
  }

  // Per-seat snapshot. Hole cards are included ONLY for the requesting seat.
  getSnapshot(seatIdx) {
    var me = this.playerBySeat(seatIdx);
    var snap = {
      t: 'state', code: this.code, state: this.state,
      config: Object.assign({}, this.config),
      paused: this.paused, pausedBy: this.pausedBy,
      mySeat: seatIdx, isHost: !!(me && me.isHost),
      players: [], handNo: 0, street: null, community: [], pot: 0,
      acting: -1, button: -1, hole: null, legal: null,
      timerMsLeft: null, turnTimerSec: this.config.turnTimerSec,
      winners: null, showdown: null, recent: this.recent.slice(-8),
      champion: this.champion, nextHandInMs: 0
    };
    if (this.state === 'lobby' || !this.table) {
      snap.players = this.players.slice().sort(function (a, b) { return a.seat - b.seat; })
        .map(function (p) { return { seat: p.seat, name: p.name, stack: p.stack, connected: p.connected, isHost: p.isHost, sittingOut: !!p.sittingOut }; });
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
    snap.players = t.players.map(function (p) {
      var rp = this.playerBySeat(p.idx);
      return {
        seat: p.idx, name: rp ? rp.name : p.name,
        stack: p.stack, bet: p.bet, folded: p.folded, allIn: p.allIn,
        acted: p.acted, hasCards: p.hole.length === 2 && !p.folded,
        connected: rp ? rp.connected : true, isHost: rp ? rp.isHost : false,
        sittingOut: rp ? !!rp.sittingOut : !!p.sittingOut
      };
    }, this);
    if (me && !t.handOver) {
      var mine = t.players[me.seat];
      if (mine && mine.hole.length === 2) snap.hole = mine.hole.map(function (c) { return { r: c.r, s: c.s }; });
      if (!this.paused && t.acting === me.seat) {
        try { snap.legal = t.legalActions(me.seat); } catch (e) { snap.legal = null; }
      }
    }
    if (this.lastResult) {
      snap.winners = this.lastResult.winners;
      snap.showdown = (this.lastResult.revealed || []).map(function (r) {
        return { seat: r.idx, hole: r.hole.map(function (c) { return { r: c.r, s: c.s }; }) };
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
      code: this.code, config: this.config, state: this.state,
      players: this.players,
      table: t ? {
        players: t.players, sb: t.sb, bb: t.bb, ante: t.ante,
        startingStack: t.startingStack, button: t.button, handNo: t.handNo,
        handOver: t.handOver, acting: t.acting, deck: t.deck,
        community: t.community, pot: t.pot, currentBet: t.currentBet,
        lastRaiseSize: t.lastRaiseSize, street: t.street, sbIdx: t.sbIdx,
        eventQueue: t.eventQueue || []
      } : null,
      paused: this.paused, pausedBy: this.pausedBy,
      turnDeadline: this.turnDeadline, nextHandAt: this.nextHandAt,
      lastResult: this.lastResult, champion: this.champion,
      recent: this.recent, closed: this.closed,
      _lastActing: this._lastActing, _pauseStartedAt: this._pauseStartedAt
    };
  }
}

Room.fromJSON = function (data) {
  var room = new Room({ code: data.code, config: data.config });
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
    t.onEvent = function (e) { room._onEngineEvent(e); };
    t.eventQueue = t.eventQueue || [];
    room.table = t;
  }
  return room;
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Room: Room, makeRoomCode: makeRoomCode, isValidRoomCode: isValidRoomCode, BREAK_BETWEEN_HANDS_MS: BREAK_BETWEEN_HANDS_MS };
}
