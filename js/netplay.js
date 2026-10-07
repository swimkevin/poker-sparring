// netplay.js — Online multiplayer transport for Poker Sparring.
// DOM-free (except NetClient, which is browser-only).
//
// Message protocol (JSON over WebSocket; MockRoomServer delivers the same
// objects via direct calls, so the UI code is identical for both):
//
//   Client -> server:
//     {t:'create', config, name}   host a table (live worker path; mock uses createRoom)
//     {t:'join', name}             join by room code (live worker path)
//     {t:'start'}                  host starts the game (needs 2+ players)
//     {t:'action', action, amount}  fold|check|call|bet|raise (amount = TOTAL bet target)
//     {t:'pause'} / {t:'resume'}   host only
//     {t:'leave'}
//
//   Server -> client:
//     {t:'lobby', code, state, config, champion, players:[{seat,name,connected,isHost}]}
//     {t:'state', ...}   full per-seat snapshot (see Room.getSnapshot); hole cards
//                        are included ONLY for the requesting seat
//     {t:'timer', msLeft}
//     {t:'error', message}

// Node: pull cross-file globals when running as a module.
// (Browser: Room / makeRoomCode / isValidRoomCode are globals from the
// room-server.js script tag. Room is aliased as RoomCtor on purpose: a hoisted
// `var Room` would collide with room-server.js's `class Room` binding and this
// script would fail to parse via browser script tags. `var` + `function` of the
// same name is harmless, so makeRoomCode / isValidRoomCode keep their names.)
var __room = (typeof module !== 'undefined' && module.exports) ? require('./room-server.js') : null;
var RoomCtor = __room ? __room.Room : Room;
if (__room) { var makeRoomCode = __room.makeRoomCode, isValidRoomCode = __room.isValidRoomCode; }

// ---------- NetClient: thin WebSocket wrapper (browser only) ----------
function NetClient() {
  this.ws = null;
  this.onmessage = null;
  this.onopen = null;
  this.onclose = null;        // fires only when the socket is gone for good
  this.onerror = null;
  this.onreconnecting = null; // fires before each automatic redial: (tryNumber)
  this._url = null;
  this._reconnectTries = 0;
  this._autoReconnect = false;
  this._maxTries = 12;
  this._userClosed = false;
}

NetClient.prototype.connect = function (url, opts) {
  var self = this;
  this._url = url;
  opts = opts || {};
  this._autoReconnect = !!opts.autoReconnect;
  if (opts.maxTries) this._maxTries = opts.maxTries;
  this._userClosed = false;
  if (typeof WebSocket === 'undefined') {
    if (self.onerror) self.onerror(new Error('WebSocket is not available in this environment.'));
    return;
  }
  var ws;
  try { ws = new WebSocket(url); } catch (e) {
    if (self.onerror) self.onerror(e);
    return;
  }
  this.ws = ws;
  ws.onopen = function () { self._reconnectTries = 0; if (self.onopen) self.onopen(); };
  ws.onmessage = function (ev) {
    var m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (self.onmessage) self.onmessage(m);
  };
  ws.onclose = function () {
    // A dropped socket redials with backoff while autoReconnect is on. The app
    // re-sends its join on every onopen, which is how the Room reclaims the
    // seat and the client resyncs to the current state (lobby or mid-game).
    // Intentional close() is silent: no redial, no onclose.
    if (self._userClosed) return;
    if (self._autoReconnect && self._reconnectTries < self._maxTries) {
      self._reconnectTries++;
      var delay = Math.min(1000 * Math.pow(2, self._reconnectTries), 8000);
      if (self.onreconnecting) { try { self.onreconnecting(self._reconnectTries); } catch (e) {} }
      setTimeout(function () {
        if (self._userClosed) return;
        self.connect(url, opts);
      }, delay);
      return;
    }
    self._reconnectTries = 0;
    if (self.onclose) self.onclose();
  };
  ws.onerror = function (e) { if (self.onerror) self.onerror(e); };
};

NetClient.prototype.send = function (obj) {
  if (this.ws && this.ws.readyState === 1) {
    try { this.ws.send(JSON.stringify(obj)); } catch (e) { /* ignore */ }
  }
};

NetClient.prototype.close = function () {
  this._userClosed = true; // intentional: the pending redial (if any) stands down
  if (this.ws) { try { this.ws.close(); } catch (e) {} this.ws = null; }
};

// ---------- MockRoomServer: in-page server for prototype + tests ----------
// Wraps one Room per room code and delivers messages via direct calls — the UI
// and the test suite run with NO backend. In the browser it ticks rooms on a
// 250ms interval; in tests pass {manualTick:true, now:fn} and drive the clock.
function MockRoomServer(opts) {
  opts = opts || {};
  this.rooms = {}; // code -> { room, clients: {clientId: rec} }
  this._seq = 1;
  this._botSeq = 1;
  this.manual = !!opts.manualTick;
  this._now = opts.now || function () { return Date.now(); };
  var self = this;
  if (!this.manual && typeof setInterval !== 'undefined') {
    this._timer = setInterval(function () { self.tickAll(self._now()); }, 250);
  }
}

MockRoomServer.prototype.close = function () {
  if (this._timer) { clearInterval(this._timer); this._timer = null; }
};

MockRoomServer.prototype._newClientId = function () {
  return 'c' + (this._seq++);
};

// Host path: creates the Room AND connects the host in one call.
MockRoomServer.prototype.createRoom = function (config, hostName, emoji) {
  var code = makeRoomCode();
  var guard = 0;
  while (this.rooms[code] && guard++ < 50) code = makeRoomCode();
  var room = new RoomCtor({ code: code, config: config, now: this._now });
  this.rooms[code] = { room: room, clients: {} };
  var res = this._attach(code, hostName, false, emoji);
  if (res.error) { delete this.rooms[code]; return { error: res.error }; }
  return { code: code, client: res.client };
};

// Join path: attach to an existing room.
MockRoomServer.prototype.connect = function (code, name) {
  code = String(code || '').toUpperCase().trim();
  var entry = this.rooms[code];
  if (!entry || entry.room.closed) return { error: 'Room not found. Check the code.' };
  return this._attach(code, name, false);
};

MockRoomServer.prototype._attach = function (code, name, isBot, emoji) {
  var entry = this.rooms[code];
  var clientId = this._newClientId();
  var server = this;
  var rec = {
    id: clientId, code: code, seat: -1, name: String(name || ''),
    isBot: !!isBot, closed: false, onmessage: null, last: null,
    send: function (msg) { server._route(rec, msg); },
    close: function () { server._removeClient(rec); }
  };
  var r = entry.room.addPlayer(clientId, name, { emoji: emoji || null });
  if (!r.ok) return { error: r.error };
  rec.seat = r.seat;
  rec.name = r.rejoined ? entry.room.playerByClientId(clientId).name : rec.name;
  entry.clients[clientId] = rec;
  this._sendLobby(entry);
  return { client: rec, rejoined: r.rejoined };
};

MockRoomServer.prototype._entryFor = function (rec) {
  var entry = this.rooms[rec.code];
  if (!entry || rec.closed) return null;
  return entry;
};

MockRoomServer.prototype._deliver = function (rec, msg) {
  rec.last = msg;
  if (rec.onmessage) {
    try { rec.onmessage(msg); } catch (e) { /* UI errors must not break the server */ }
  }
};

MockRoomServer.prototype._sendLobby = function (entry) {
  var lobby = entry.room.getLobby();
  Object.keys(entry.clients).forEach(function (id) {
    var rec = entry.clients[id];
    if (!rec.closed) {
      // Personalize isHost and seat per client (the live path needs `you`).
      var personal = Object.assign({}, lobby, {
        isHost: entry.room.playerBySeat(rec.seat).isHost,
        you: rec.seat
      });
      rec.last = personal;
      if (rec.onmessage) { try { rec.onmessage(personal); } catch (e) {} }
    }
  });
};

MockRoomServer.prototype._broadcastState = function (entry) {
  var self = this;
  Object.keys(entry.clients).forEach(function (id) {
    var rec = entry.clients[id];
    if (rec.closed) return;
    self._deliver(rec, entry.room.getSnapshot(rec.seat));
  });
};

MockRoomServer.prototype._route = function (rec, msg) {
  var entry = this._entryFor(rec);
  if (!entry) { this._deliver(rec, { t: 'error', message: 'Not connected.' }); return; }
  var room = entry.room;
  msg = msg || {};
  var r;
  switch (msg.t) {
    case 'start':
      r = room.start(rec.id);
      if (!r.ok) this._deliver(rec, { t: 'error', message: r.error });
      else this._broadcastState(entry);
      break;
    case 'action':
      r = room.applyAction(rec.id, msg.action, msg.amount);
      if (!r.ok) this._deliver(rec, { t: 'error', message: r.error });
      else this._broadcastState(entry);
      break;
    case 'pause':
      r = room.setPaused(rec.id, true);
      if (!r.ok) this._deliver(rec, { t: 'error', message: r.error });
      else this._broadcastState(entry);
      break;
    case 'resume':
      r = room.setPaused(rec.id, false);
      if (!r.ok) this._deliver(rec, { t: 'error', message: r.error });
      else this._broadcastState(entry);
      break;
    case 'leave':
      this._removeClient(rec);
      break;
    case 'sitout':
      r = room.setSitOut(rec.id, msg.out);
      if (!r.ok) this._deliver(rec, { t: 'error', message: r.error });
      else this._broadcastState(entry);
      break;
    case 'chat':
      r = room.sendChat(rec.id, msg.text);
      if (!r.ok) this._deliver(rec, { t: 'error', message: r.error });
      else this._broadcastState(entry);
      break;
    case 'rebuy':
      r = room.rebuy(rec.id);
      if (!r.ok) this._deliver(rec, { t: 'error', message: r.error });
      else this._broadcastState(entry);
      break;
    default:
      this._deliver(rec, { t: 'error', message: 'Unknown message.' });
  }
};

MockRoomServer.prototype._removeClient = function (rec) {
  var entry = this.rooms[rec.code];
  rec.closed = true;
  if (!entry) return;
  delete entry.clients[rec.id];
  entry.room.removePlayer(rec.id);
  if (entry.room.closed) { delete this.rooms[rec.code]; return; }
  if (entry.room.state === 'lobby') this._sendLobby(entry);
  else this._broadcastState(entry);
};

// Advance all rooms' clocks. Returns nothing; clients get state/timer messages.
MockRoomServer.prototype.tickAll = function (now) {
  var self = this;
  Object.keys(this.rooms).forEach(function (code) {
    var entry = self.rooms[code];
    var changed = entry.room.tick();
    if (changed) {
      if (entry.room.state === 'lobby') self._sendLobby(entry);
      else self._broadcastState(entry);
    } else if (entry.room.state === 'playing' && !entry.room.paused && entry.room.config.turnTimerSec > 0) {
      // Cheap countdown ticks so clients can animate the timer bar.
      var msLeft = entry.room._msLeft();
      Object.keys(entry.clients).forEach(function (id) {
        var rec = entry.clients[id];
        if (!rec.closed) self._deliver(rec, { t: 'timer', msLeft: msLeft });
      });
    }
    // Demo bots act on fresh state.
    Object.keys(entry.clients).forEach(function (id) {
      var rec = entry.clients[id];
      if (rec.isBot && !rec.closed && !self.manual) self._botMaybeAct(entry, rec);
    });
  });
};

// ---------- demo bots (mock/prototype only) ----------
// Lets a solo tester actually play a hand: clearly-labeled filler seats with a
// trivial random-legal policy. NOT the offline archetype AI — production rooms
// are humans-only.
MockRoomServer.prototype.addDemoBot = function (code, name) {
  var entry = this.rooms[code];
  if (!entry) return { error: 'Room not found.' };
  name = name || ('Guest-' + (this._botSeq++));
  var res = this._attach(code, name, true);
  return res;
};

MockRoomServer.prototype._demoPolicy = function (state) {
  var legal = state.legal;
  if (!legal) return null;
  if (legal.canCheck) return { action: 'check' };
  if (legal.callAmount <= state.config.bb * 4 && Math.random() < 0.8) return { action: 'call' };
  if (legal.canBet && Math.random() < 0.25) {
    return { action: 'bet', amount: Math.min(legal.minBetTo * 3, legal.maxRaiseTo) };
  }
  return { action: 'fold' };
};

// Manual driver for tests (deterministic): act once for the bot if it's its turn.
MockRoomServer.prototype.botActNow = function (rec) {
  var entry = this._entryFor(rec);
  if (!entry || !rec.isBot) return false;
  var state = entry.room.getSnapshot(rec.seat);
  if (state.acting !== rec.seat || !state.legal) return false;
  var mv = this._demoPolicy(state);
  if (!mv) return false;
  var r = entry.room.applyAction(rec.id, mv.action, mv.amount);
  if (r.ok) this._broadcastState(entry);
  return r.ok;
};

MockRoomServer.prototype._botMaybeAct = function (entry, rec) {
  var self = this;
  var state = entry.room.getSnapshot(rec.seat);
  if (state.acting !== rec.seat || !state.legal || state.paused) return;
  setTimeout(function () {
    if (rec.closed) return;
    self.botActNow(rec);
  }, 600 + Math.random() * 800);
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NetClient: NetClient, MockRoomServer: MockRoomServer,
    makeRoomCode: makeRoomCode, isValidRoomCode: isValidRoomCode
  };
}
