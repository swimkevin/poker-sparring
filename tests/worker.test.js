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

function fakeState() {
  return {
    acceptWebSocket: function () {},
    storage: { setAlarm: function () { return Promise.resolve(); } }
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

  console.log(pass + ' worker assertions passed');
})().catch(function (e) { console.log('FAIL: ' + (e && e.stack || e)); process.exitCode = 1; });
