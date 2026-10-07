// tests/worker.test.js — boots the REAL worker/room-do.js Durable Object with
// stubbed Cloudflare globals and replays the browser's exact create/join flow.
// Regression guard: a missing `code` in the sessions map made every 'create'
// fail with "Room not found. The host creates it first." (Room got a random
// code, then room.code !== meta.code).
//
// Run: node tests/worker.test.js (also wired into `npm test`).
var path = require('path');
var assert = require('assert');
var urlMod = require('url');

function makeSocket() {
  var sent = [];
  var attachment = null;
  return {
    sent: sent,
    send: function (s) { sent.push(JSON.parse(s)); },
    close: function () {},
    serializeAttachment: function (a) { attachment = a; },
    deserializeAttachment: function () { return attachment; }
  };
}

// ---- Cloudflare globals ----
global.WebSocketPair = function () {
  var client = makeSocket();
  var server = makeSocket();
  return { 0: client, 1: server };
};
global.Response = function (body, init) {
  this.body = body;
  this.status = (init && init.status) || 200;
  this.webSocket = init && init.webSocket;
};

function fakeState(store) {
  store = store || new Map();
  return {
    acceptWebSocket: function () {},
    storage: {
      setAlarm: function () { return Promise.resolve(); },
      get: function (k) { return Promise.resolve(store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : undefined); },
      put: function (k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return Promise.resolve(); }
    },
    _store: store
  };
}
function upgradeRequest(roomUrl) {
  return {
    url: roomUrl,
    headers: { get: function (k) { return k === 'Upgrade' ? 'websocket' : null; } }
  };
}

(async function () {
  var pass = 0;
  function ok(cond, name) {
    if (cond) { pass++; }
    else { console.log('FAIL: ' + name); process.exitCode = 1; }
  }

  var mod = await import(urlMod.pathToFileURL(path.join(__dirname, '..', 'worker', 'room-do.js')).href);
  var RoomDO = mod.RoomDO;
  var RELAY = 'https://relay.example';

  // --- 1. host creates a room: must get a lobby, not "Room not found" ---
  var hostDO = new RoomDO(fakeState(), {});
  var hostSock = makeSocket();
  // emulate fetch(): pair the stub socket as the server side
  var realPair = global.WebSocketPair;
  global.WebSocketPair = function () { return { 0: makeSocket(), 1: hostSock }; };
  var res = await hostDO.fetch(upgradeRequest(RELAY + '/room/ABC234/ws?name=HostA'));
  global.WebSocketPair = realPair;
  ok(res.status === 101, 'websocket upgrade accepted');

  await hostDO.webSocketMessage(hostSock, JSON.stringify({ t: 'create', config: { maxPlayers: 6 }, name: 'HostA' }));
  var errs = hostSock.sent.filter(function (m) { return m.t === 'error'; });
  ok(errs.length === 0, 'create produces no error (got: ' + JSON.stringify(errs.map(function (e) { return e.message; })) + ')');
  var lobby = hostSock.sent.filter(function (m) { return m.code === 'ABC234'; })[0];
  ok(!!lobby, 'host receives lobby for the requested code ABC234');
  ok(lobby && lobby.players.length === 1 && lobby.players[0].name === 'HostA', 'host is seated as player 1');

  // --- 2. second player joins the SAME code on a fresh DO handle (same room) ---
  // (idFromName routes both to one instance; here we reuse the instance.)
  var joinSock = makeSocket();
  global.WebSocketPair = function () { return { 0: makeSocket(), 1: joinSock }; };
  await hostDO.fetch(upgradeRequest(RELAY + '/room/ABC234/ws?name=GuestB'));
  global.WebSocketPair = realPair;
  await hostDO.webSocketMessage(joinSock, JSON.stringify({ t: 'join', name: 'GuestB' }));
  var jerrs = joinSock.sent.filter(function (m) { return m.t === 'error'; });
  ok(jerrs.length === 0, 'join produces no error');
  var lobby2 = joinSock.sent.filter(function (m) { return m.code === 'ABC234'; })[0];
  ok(!!lobby2 && lobby2.players.length === 2, 'joiner sees 2 players in lobby');

  // --- 3. joining a bogus code still errors correctly ---
  var badDO = new RoomDO(fakeState(), {});
  var badSock = makeSocket();
  global.WebSocketPair = function () { return { 0: makeSocket(), 1: badSock }; };
  await badDO.fetch(upgradeRequest(RELAY + '/room/ZZZ999/ws?name=Stranger'));
  global.WebSocketPair = realPair;
  await badDO.webSocketMessage(badSock, JSON.stringify({ t: 'join', name: 'Stranger' }));
  var berrs = badSock.sent.filter(function (m) { return m.t === 'error'; });
  ok(berrs.length === 1 && /not found/i.test(berrs[0].message), 'join of nonexistent room errors "not found"');

  // --- 4. eviction: room survives, dropped players reclaim their seats ---
  // Both sockets die (phones sleep); the DO is evicted (fresh instance, same
  // disk). HostA reopens the page and rejoins with the same name.
  await hostDO.webSocketClose(hostSock, 1006, 'drop', false);
  await hostDO.webSocketClose(joinSock, 1006, 'drop', false);
  var store = hostDO.state._store;
  var evictedDO = new RoomDO(fakeState(store), {});
  var rejoinSock = makeSocket();
  global.WebSocketPair = function () { return { 0: makeSocket(), 1: rejoinSock }; };
  await evictedDO.fetch(upgradeRequest(RELAY + '/room/ABC234/ws?name=HostA'));
  global.WebSocketPair = realPair;
  await evictedDO.webSocketMessage(rejoinSock, JSON.stringify({ t: 'join', name: 'HostA' }));
  var rerrs = rejoinSock.sent.filter(function (m) { return m.t === 'error'; });
  ok(rerrs.length === 0, 'join after eviction produces no error (got: ' + JSON.stringify(rerrs.map(function (e) { return e.message; })) + ')');
  var rlobby = rejoinSock.sent.filter(function (m) { return m.code === 'ABC234'; })[0];
  ok(!!rlobby && rlobby.players.length === 2, 'room restored from storage with both players');

  // --- 5. mid-game eviction: engine state round-trips, play continues ---
  // GuestB also reconnects, then the host starts the game.
  var rejoinSockB = makeSocket();
  global.WebSocketPair = function () { return { 0: makeSocket(), 1: rejoinSockB }; };
  await evictedDO.fetch(upgradeRequest(RELAY + '/room/ABC234/ws?name=GuestB'));
  global.WebSocketPair = realPair;
  await evictedDO.webSocketMessage(rejoinSockB, JSON.stringify({ t: 'join', name: 'GuestB' }));
  await evictedDO.webSocketMessage(rejoinSock, JSON.stringify({ t: 'start' }));
  var serrs = rejoinSock.sent.filter(function (m) { return m.t === 'error'; });
  ok(serrs.length === 0, 'start after restore produces no error');
  await evictedDO.webSocketClose(rejoinSock, 1006, 'drop', false);
  await evictedDO.webSocketClose(rejoinSockB, 1006, 'drop', false);
  var evicted2 = new RoomDO(fakeState(store), {});
  var actSock = makeSocket();
  global.WebSocketPair = function () { return { 0: makeSocket(), 1: actSock }; };
  await evicted2.fetch(upgradeRequest(RELAY + '/room/ABC234/ws?name=GuestB'));
  global.WebSocketPair = realPair;
  await evicted2.webSocketMessage(actSock, JSON.stringify({ t: 'join', name: 'GuestB' }));
  var aerrs = actSock.sent.filter(function (m) { return m.t === 'error'; });
  ok(aerrs.length === 0, 'rejoin mid-game after eviction produces no error');
  var snap = actSock.sent.filter(function (m) { return m.t === 'state'; })[0];
  ok(!!snap && snap.state === 'playing', 'rejoiner gets a live game snapshot after mid-game restore');
  ok(!!snap && Array.isArray(snap.hole) && snap.hole.length === 2, 'rejoiner sees their own hole cards');

  // --- 6. hibernated socket across DO restart: the serialized attachment must
  // carry the room code. Regression: after a restart the sessions map is
  // empty, _meta() falls back to deserializeAttachment(), and without `code`
  // every message on the surviving socket failed "Room not found" — the host
  // saw a live lobby, then Start died with "Room not found. The host creates
  // it first." (live incident 2026-10-07, room UPCD57).
  var hibHost = makeSocket();
  var doA = new RoomDO(fakeState(), {});
  global.WebSocketPair = function () { return { 0: makeSocket(), 1: hibHost }; };
  await doA.fetch(upgradeRequest(RELAY + '/room/HBCDEF/ws?name=HostH'));
  global.WebSocketPair = realPair;
  await doA.webSocketMessage(hibHost, JSON.stringify({ t: 'create', config: { maxPlayers: 6 } }));
  var hibGuest = makeSocket();
  global.WebSocketPair = function () { return { 0: makeSocket(), 1: hibGuest }; };
  await doA.fetch(upgradeRequest(RELAY + '/room/HBCDEF/ws?name=GuestH'));
  global.WebSocketPair = realPair;
  await doA.webSocketMessage(hibGuest, JSON.stringify({ t: 'join', name: 'GuestH' }));
  ok(hibGuest.sent.filter(function (m) { return m.t === 'error'; }).length === 0, 'hibernation setup: 2 players seated');
  // DO restarts: fresh instance, same storage. Both sockets hibernate — no new
  // fetch(), no sessions entries; only their serialized attachments survive.
  var storeH = doA.state._store;
  var doB = new RoomDO(fakeState(storeH), {});
  hibHost.sent.length = 0;
  await doB.webSocketMessage(hibHost, JSON.stringify({ t: 'start' }));
  var hibErrs = hibHost.sent.filter(function (m) { return m.t === 'error'; });
  ok(!hibErrs.some(function (e) { return /not found/i.test(e.message); }),
    'hibernated socket after restart: no "Room not found" (got: ' + JSON.stringify(hibErrs.map(function (e) { return e.message; })) + ')');
  var hibState = hibHost.sent.filter(function (m) { return m.t === 'state'; })[0];
  ok(!!hibState && hibState.state === 'playing', 'hibernated host can still start the game after restart');

  // --- sitout message routes through the DO to Room.setSitOut ---
  hibGuest.sent.length = 0;
  await doB.webSocketMessage(hibGuest, JSON.stringify({ t: 'sitout', out: true }));
  var soErrs = hibGuest.sent.filter(function (m) { return m.t === 'error'; });
  ok(soErrs.length === 0, 'sitout routes without error (got: ' + JSON.stringify(soErrs.map(function (e) { return e.message; })) + ')');
  var soState = hibGuest.sent.filter(function (m) { return m.t === 'state'; }).pop();
  var guestSeat = soState.players.filter(function (p) { return p.name === 'GuestH'; })[0];
  ok(!!guestSeat && guestSeat.sittingOut === true, 'sitout flag visible in snapshot after DO route');
  await doB.webSocketMessage(hibGuest, JSON.stringify({ t: 'sitout', out: false }));
  ok(doB.room.playerBySeat(guestSeat.seat).sittingOut === false, 'back-in clears the flag');


  console.log(pass + ' worker assertions passed');
})().catch(function (e) { console.log('FAIL: ' + (e && e.stack || e)); process.exitCode = 1; });
