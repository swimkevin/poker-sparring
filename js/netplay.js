var quiet = function (e) { if (typeof window !== 'undefined' && window.__psDebug) console.error(e); };
var __room = (typeof module !== 'undefined' && module.exports) ? require('./room-server.js') : null;
var RoomCtor = __room ? __room.Room : Room;
if (__room) { var makeRoomCode = __room.makeRoomCode, isValidRoomCode = __room.isValidRoomCode; }

function NetClient() {
  this.ws = null;
  this.onmessage = null;
  this.onopen = null;
  this.onclose = null;
  this.onerror = null;
  this.onreconnecting = null;
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
    try { m = JSON.parse(ev.data); } catch { return; }
    if (self.onmessage) self.onmessage(m);
  };
  ws.onclose = function () {

    if (self._userClosed) return;
    if (self._autoReconnect && self._reconnectTries < self._maxTries) {
      self._reconnectTries++;
      var delay = Math.min(1000 * Math.pow(2, self._reconnectTries), 8000);
      if (self.onreconnecting) { try { self.onreconnecting(self._reconnectTries); } catch (e) { quiet(e); } }
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
    try { this.ws.send(JSON.stringify(obj)); } catch {  }
  }
};

NetClient.prototype.close = function () {
  this._userClosed = true;
  if (this.ws) { try { this.ws.close(); } catch (e) { quiet(e); } this.ws = null; }
};

function MockRoomServer(opts) {
  opts = opts || {};
  this.rooms = {};
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
    try { rec.onmessage(msg); } catch {  }
  }
};

MockRoomServer.prototype._sendLobby = function (entry) {
  var lobby = entry.room.getLobby();
  Object.keys(entry.clients).forEach(function (id) {
    var rec = entry.clients[id];
    if (!rec.closed) {

      var personal = Object.assign({}, lobby, {
        isHost: entry.room.playerBySeat(rec.seat).isHost,
        you: rec.seat
      });
      rec.last = personal;
      if (rec.onmessage) { try { rec.onmessage(personal); } catch (e) { quiet(e); } }
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

MockRoomServer.prototype.tickAll = function (now) {
  var self = this;
  Object.keys(this.rooms).forEach(function (code) {
    var entry = self.rooms[code];
    var changed = entry.room.tick();
    if (changed) {
      if (entry.room.state === 'lobby') self._sendLobby(entry);
      else self._broadcastState(entry);
    } else if (entry.room.state === 'playing' && !entry.room.paused && entry.room.config.turnTimerSec > 0) {

      var msLeft = entry.room._msLeft();
      Object.keys(entry.clients).forEach(function (id) {
        var rec = entry.clients[id];
        if (!rec.closed) self._deliver(rec, { t: 'timer', msLeft: msLeft });
      });
    }

    Object.keys(entry.clients).forEach(function (id) {
      var rec = entry.clients[id];
      if (rec.isBot && !rec.closed && !self.manual) self._botMaybeAct(entry, rec);
    });
  });
};

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
