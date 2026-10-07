// Headless tests: node tests/netplay.test.js
// DOM-free: Room state machine, protocol, and MockRoomServer. The worker/
// Cloudflare path is the documented production route and is not executed here.
var path = require('path');
var js = function (f) { return require(path.join(__dirname, '..', 'js', f)); };
js('cards.js'); js('evaluator.js'); // loaded for engine's transitive requires
var EN = js('engine.js');
var RS = js('room-server.js');
var NP = js('netplay.js');

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}

function testClock(start) {
  return { t: start || 1000000, now: function () { return this.t; } };
}
function mockServer(clock) {
  return new NP.MockRoomServer({ manualTick: true, now: function () { return clock.t; } });
}
// The mock delivers every message (state, lobby, timer, error) through
// client.last — this helper tracks only state snapshots for assertions.
function watchStates(client) {
  client.stateLog = [];
  var prev = client.onmessage;
  client.onmessage = function (m) {
    if (m && m.t === 'state') client.stateLog.push(m);
    if (prev) prev(m);
  };
}
function lastState(client) {
  var log = client.stateLog || [];
  return log.length ? log[log.length - 1] : client.last;
}

// ---------- room codes ----------
(function () {
  var a = RS.makeRoomCode(), b = RS.makeRoomCode();
  ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(a), 'room code is 6 unambiguous chars, got ' + a);
  ok(a !== b, 'room codes differ');
  ok(RS.isValidRoomCode('A3F9K2'), 'valid code accepted');
  ok(!RS.isValidRoomCode('a3f9k2'), 'lowercase rejected');
  ok(!RS.isValidRoomCode('A3F9K'), 'short code rejected');
  ok(!RS.isValidRoomCode('A3F9K!'), 'bad char rejected');
  ok(!RS.isValidRoomCode('A3F9O2'), 'ambiguous O rejected');
})();

// ---------- join / seating ----------
(function () {
  var clock = testClock();
  var srv = mockServer(clock);
  var created = srv.createRoom({ maxPlayers: 3, startingStack: 1000, sb: 5, bb: 10, turnTimerSec: 0 }, 'Ann');
  ok(!created.error, 'host creates room');
  ok(RS.isValidRoomCode(created.code), 'returned code is valid');
  var code = created.code;
  var host = created.client;
  ok(host.seat === 0, 'host gets seat 0');
  var bob = srv.connect(code, 'Bob');
  ok(!bob.error && bob.client.seat === 1, 'second player gets seat 1');
  var cid = srv.connect(code, 'Cid');
  ok(!cid.error && cid.client.seat === 2, 'third player gets seat 2');
  var dan = srv.connect(code, 'Dan');
  ok(dan.error && /full/i.test(dan.error), 'fourth player rejected at maxPlayers=3');
  var dup = srv.connect(code, 'Ann');
  // Same name takes over the session: a fast redial before the server has
  // processed the old socket's close must rebind the seat, not strand the
  // player with "name taken".
  ok(!dup.error && dup.rejoined && dup.client.seat === 0, 'duplicate name takes over the seat');
  var bad = srv.connect('ZZZZZ9', 'Zed');
  ok(bad.error, 'unknown room code rejected');
  var lob = host.last;
  ok(lob.t === 'lobby' && lob.players.length === 3, 'lobby lists 3 players');
  ok(lob.players[0].isHost && lob.code === code, 'lobby marks host and code');
  srv.close();
})();

// ---------- session takeover on fast redial ----------
(function () {
  var clock = testClock();
  var srv = mockServer(clock);
  var created = srv.createRoom({ maxPlayers: 6, startingStack: 1000, sb: 5, bb: 10, turnTimerSec: 0 }, 'Ann');
  var code = created.code;
  var ann = created.client;
  var bob = srv.connect(code, 'Bob').client;
  ann.send({ t: 'start' });
  ok(lastState(ann).state === 'playing', 'game started');
  // Ann's old socket is still "connected" (server hasn't seen the drop yet).
  // A fast redial with the same name takes over the seat instead of erroring.
  var ann2 = srv.connect(code, 'Ann');
  ok(!ann2.error, 'fast redial with same name is not rejected');
  ok(ann2.rejoined && ann2.client.seat === 0, 'redial rebinds to seat 0');
  var st = ann2.client.last;
  ok(st && (st.t === 'state' || st.t === 'lobby'), 'takeover receives a snapshot');
  // The stale socket's clientId no longer maps to a player: its actions are ignored.
  var room = srv.rooms[code].room;
  ok(!room.playerByClientId(ann.id), 'stale clientId no longer maps to a player');
  ok(room.playerByClientId(ann2.client.id).name === 'Ann', 'new clientId owns the seat');
  srv.close();
})();

// ---------- start needs 2+ players; host-only ----------
(function () {
  var clock = testClock();
  var srv = mockServer(clock);
  var created = srv.createRoom({ maxPlayers: 6, startingStack: 500, sb: 5, bb: 10, turnTimerSec: 0 }, 'Solo');
  var code = created.code, solo = created.client;
  solo.send({ t: 'start' });
  ok(solo.last.t === 'error', 'start with 1 player is rejected');
  var bob = srv.connect(code, 'Bob').client;
  bob.send({ t: 'start' });
  ok(bob.last.t === 'error', 'non-host start is rejected');
  solo.send({ t: 'start' });
  var st = solo.last;
  ok(st.t === 'state' && st.state === 'playing' && st.handNo === 1, 'host starts with 2 players');
  ok(st.config.startingStack === 500 && st.config.sb === 5, 'config reaches the table');
  srv.close();
})();

// ---------- full hand: convergence + chip conservation ----------
(function () {
  var clock = testClock();
  var srv = mockServer(clock);
  var created = srv.createRoom({ maxPlayers: 8, startingStack: 1000, sb: 5, bb: 10, turnTimerSec: 0 }, 'Ann');
  var code = created.code;
  var ann = created.client;
  var bob = srv.connect(code, 'Bob').client;
  var cid = srv.connect(code, 'Cid').client;
  var clients = [ann, bob, cid];
  ann.send({ t: 'start' });

  function policy(legal) {
    if (legal.canCheck) return { action: 'check' };
    if (legal.callAmount <= 20) return { action: 'call' };
    return { action: 'fold' };
  }
  var guard = 0, handsDone = 0;
  while (guard++ < 600) {
    var st = ann.last;
    if (!st || st.t !== 'state' || st.state !== 'playing') break;
    if (st.winners) { handsDone++; break; }
    var seat = st.acting;
    var cl = clients.filter(function (c) { return c.seat === seat; })[0];
    var legal = cl.last.legal;
    if (!legal) break;
    var mv = policy(legal);
    cl.send({ t: 'action', action: mv.action, amount: mv.amount });
  }
  ok(handsDone === 1, 'a full 3-player hand completes through the mock server');
  var finals = clients.map(function (c) { return c.last; });
  var comm0 = JSON.stringify(finals[0].community);
  ok(finals.every(function (f) { return JSON.stringify(f.community) === comm0; }), 'all clients converge on the same board');
  ok(finals.every(function (f) { return f.handNo === finals[0].handNo; }), 'all clients agree on hand number');
  var room = srv.rooms[code].room;
  var total = room.table.players.reduce(function (s, p) { return s + p.stack; }, 0);
  ok(total === 3000, 'chips conserved across the hand, got ' + total);
  ok(finals[0].winners.length >= 1, 'winners announced');
  srv.close();
})();

// ---------- turn timer auto-folds; pause freezes it ----------
(function () {
  var clock = testClock(2000000);
  var srv = mockServer(clock);
  var created = srv.createRoom({ maxPlayers: 6, startingStack: 1000, sb: 5, bb: 10, turnTimerSec: 1 }, 'Ann');
  var code = created.code;
  var ann = created.client;
  var bob = srv.connect(code, 'Bob').client;
  watchStates(ann); watchStates(bob);
  ann.send({ t: 'start' });
  var acting0 = lastState(ann).acting;
  ok(acting0 >= 0, 'someone is to act after start');

  // Host pauses before the deadline: the clock must not matter while paused.
  ann.send({ t: 'pause' });
  ok(lastState(ann).paused === true, 'pause acknowledged');
  clock.t += 30000;
  srv.tickAll(clock.t);
  ok(lastState(ann).acting === acting0, 'paused timer does not advance action');
  ok(lastState(ann).paused === true, 'still paused after frozen ticks');

  // Resume: the deadline extends by the frozen duration, then expiry auto-folds.
  ann.send({ t: 'resume' });
  ok(lastState(ann).paused === false, 'resume acknowledged');
  clock.t += 500; // not yet past the (extended) deadline
  srv.tickAll(clock.t);
  ok(lastState(ann).acting === acting0, 'no auto-action before extended deadline');
  clock.t += 2000;
  srv.tickAll(clock.t);
  var st = lastState(ann);
  var acted = st.acting !== acting0 || st.winners;
  ok(acted, 'timer expiry auto-acts after resume');
  var foldedSeat = st.players.filter(function (p) { return p.seat === acting0; })[0];
  ok(!foldedSeat || foldedSeat.folded || st.acting !== acting0, 'expired seat folded or action moved on');
  srv.close();
})();

// ---------- hole-card privacy ----------
(function () {
  var clock = testClock();
  var srv = mockServer(clock);
  var created = srv.createRoom({ maxPlayers: 6, startingStack: 1000, sb: 5, bb: 10, turnTimerSec: 0 }, 'Ann');
  var code = created.code;
  var ann = created.client;
  var bob = srv.connect(code, 'Bob').client;
  ann.send({ t: 'start' });
  var sa = ann.last, sb = bob.last;
  ok(sa.hole && sa.hole.length === 2, 'host sees own hole cards');
  ok(sb.hole && sb.hole.length === 2, 'joiner sees own hole cards');
  ok(JSON.stringify(sa.hole) !== JSON.stringify(sb.hole), 'hole cards differ per seat');
  ok(sa.players.every(function (p) { return !('hole' in p); }), 'public player list carries no hole cards');
  ok(sb.players.every(function (p) { return !('hole' in p); }), 'joiner public list carries no hole cards');
  srv.close();
})();

// ---------- demo bots can fill a table ----------
(function () {
  var clock = testClock();
  var srv = mockServer(clock);
  var created = srv.createRoom({ maxPlayers: 6, startingStack: 1000, sb: 5, bb: 10, turnTimerSec: 0 }, 'Ann');
  var code = created.code;
  var ann = created.client;
  var botRes = srv.addDemoBot(code, 'Botty');
  ok(!botRes.error, 'demo bot joins');
  var bot = botRes.client;
  ann.send({ t: 'start' });
  ok(ann.last.state === 'playing', 'game starts with host + demo bot');
  // Ann is seat 0 and acts first heads-up (SB). Call the blind, then let the bot act.
  ann.send({ t: 'action', action: 'call' });
  var acted = srv.botActNow(bot);
  ok(acted, 'demo bot takes its turn via botActNow');
  srv.close();
})();

// ---------- host migration on lobby leave ----------
(function () {
  var clock = testClock();
  var srv = mockServer(clock);
  var created = srv.createRoom({ maxPlayers: 6, startingStack: 1000, sb: 5, bb: 10, turnTimerSec: 0 }, 'Ann');
  var code = created.code;
  var bob = srv.connect(code, 'Bob').client;
  created.client.close(); // host leaves the lobby
  var lob = bob.last;
  ok(lob.t === 'lobby' && lob.players.length === 1 && lob.players[0].isHost, 'host migrates to remaining player');
  srv.close();
})();

// ---------- illegal actions are rejected, not applied ----------
(function () {
  var clock = testClock();
  var srv = mockServer(clock);
  var created = srv.createRoom({ maxPlayers: 6, startingStack: 1000, sb: 5, bb: 10, turnTimerSec: 0 }, 'Ann');
  var code = created.code;
  var ann = created.client;
  var bob = srv.connect(code, 'Bob').client;
  watchStates(ann);
  ann.send({ t: 'start' });
  // It's Ann's turn (seat 0). Bob tries to act out of turn.
  bob.send({ t: 'action', action: 'fold' });
  ok(bob.last.t === 'error' && /turn/i.test(bob.last.message), 'out-of-turn action rejected');
  // Ann tries to check facing a blind bet.
  ann.send({ t: 'action', action: 'check' });
  ok(ann.last.t === 'error', 'illegal check rejected');
  ok(lastState(ann).acting === 0, 'turn did not advance on illegal action');
  srv.close();
})();

// ---------- NetClient auto-reconnect (stubbed WebSocket) ----------
// Regression: a dropped socket used to leave the client on a stale lobby
// forever ("Disconnected from the relay." with no redial). The client must
// redial with backoff and re-send its join on every (re)connect so the Room
// reclaims the seat and the snapshot resyncs it (lobby or mid-game).
(function () {
  function FakeWS(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeWS.instances.push(this);
  }
  FakeWS.instances = [];
  FakeWS.prototype.send = function (d) { this.sent.push(d); };
  FakeWS.prototype.close = function () { this._drop(); };
  FakeWS.prototype._open = function () { this.readyState = 1; if (this.onopen) this.onopen(); };
  FakeWS.prototype._drop = function () { this.readyState = 3; if (this.onclose) this.onclose(); };

  var realWS = global.WebSocket, realST = global.setTimeout;
  var delays = [];
  global.WebSocket = FakeWS;
  // Run redial timers immediately, but record the backoff delays.
  global.setTimeout = function (fn, ms) { delays.push(ms); fn(); return 0; };

  function freshClient(maxTries) {
    var nc = new NP.NetClient();
    var events = [];
    nc.onopen = function () { events.push('open'); nc.send({ t: 'join', name: 'G' }); };
    nc.onreconnecting = function (n) { events.push('reconnecting' + n); };
    nc.onclose = function () { events.push('close'); };
    nc.onerror = function () { events.push('error'); };
    nc.connect('ws://relay/room/ABC123/ws?name=G', { autoReconnect: true, maxTries: maxTries });
    return { nc: nc, events: events };
  }

  // Drop -> redial -> reopen re-sends join on the new socket.
  FakeWS.instances = []; delays = [];
  var c1 = freshClient(3);
  FakeWS.instances[0]._open();
  FakeWS.instances[0]._drop();          // network drop; redial runs immediately
  FakeWS.instances[1]._open();          // redialled socket opens
  ok(FakeWS.instances.length === 2, 'reconnect redials after a drop');
  ok(FakeWS.instances[1].url === 'ws://relay/room/ABC123/ws?name=G', 'redial targets the same room URL');
  ok(c1.events.join(',') === 'open,reconnecting1,open', 'reconnecting fires, then open again');
  ok(FakeWS.instances[0].sent.length === 1 && FakeWS.instances[1].sent.length === 1 &&
     JSON.parse(FakeWS.instances[1].sent[0]).t === 'join',
     'join re-sent on the redialled socket (seat reclaim + resync)');
  ok(delays.length === 1 && delays[0] === 2000, 'first redial backs off 2s');

  // Backoff caps at 8s (consecutive drops without a successful open).
  FakeWS.instances = []; delays = [];
  var c2 = freshClient(12);
  FakeWS.instances[0]._open();
  for (var i = 0; i < 5; i++) {
    FakeWS.instances[FakeWS.instances.length - 1]._drop();
  }
  ok(delays.slice(0, 3).join(',') === '2000,4000,8000' &&
     Math.max.apply(null, delays) === 8000, 'backoff grows, then caps at 8s');

  // Retries exhausted -> onclose fires once (give-up), no more redials.
  FakeWS.instances = []; delays = [];
  var c3 = freshClient(2);
  FakeWS.instances[0]._open();
  FakeWS.instances[0]._drop();          // try 1 redials
  FakeWS.instances[1]._drop();          // try 2 redials
  FakeWS.instances[2]._drop();          // exhausted -> give up
  ok(c3.events.join(',') === 'open,reconnecting1,reconnecting2,close', 'give-up fires onclose after maxTries');
  ok(FakeWS.instances.length === 3, 'no redial after give-up');

  // Intentional close() is silent: no redial, no onclose.
  FakeWS.instances = []; delays = [];
  var c4 = freshClient(3);
  FakeWS.instances[0]._open();
  c4.nc.close();
  ok(c4.events.join(',') === 'open', 'intentional close fires nothing');
  ok(FakeWS.instances.length === 1, 'intentional close does not redial');

  global.WebSocket = realWS;
  global.setTimeout = realST;
})();

// ---------- sit out / back in ----------
(function () {
  var clock = testClock();
  var srv = mockServer(clock);
  var created = srv.createRoom({ maxPlayers: 6, startingStack: 1000, sb: 5, bb: 10, turnTimerSec: 0 }, 'Ann');
  var code = created.code;
  var ann = created.client, bob = srv.connect(code, 'Bob').client, cid = srv.connect(code, 'Cid').client;
  var clients = [ann, bob, cid];
  watchStates(ann); watchStates(bob); watchStates(cid);
  ann.send({ t: 'start' });
  var room = srv.rooms[code].room;
  ok(lastState(ann).state === 'playing', 'game started for sitout test');

  // Bob sits out mid-hand: his live hand dies, flag visible to everyone.
  bob.send({ t: 'sitout', out: true });
  ok(room.playerByClientId(bob.id).sittingOut === true, 'room flags bob sitting out');
  var bseat = lastState(cid).players.filter(function (p) { return p.seat === 1; })[0];
  ok(bseat && bseat.sittingOut === true, 'snapshot exposes sittingOut to others');
  ok(room.table.players[1].folded === true, 'bob folded out of the live hand');
  bob.send({ t: 'sitout', out: true });
  ok(bob.last.t !== 'error', 'repeat sitout is idempotent');

  // Finish the hand with folds.
  var guard = 0;
  while (room.table && !room.table.handOver && guard++ < 100) {
    var seat = room.table.acting;
    var cli = clients.filter(function (c) { return c.seat === seat; })[0];
    room.applyAction(cli.id, 'fold');
  }
  ok(room.table.handOver === true, 'hand finished after folds');

  // Next hand: the sitter is skipped entirely (no cards, no blinds).
  clock.t = room.nextHandAt + 1;
  srv.tickAll(clock.t);
  var st = lastState(ann);
  ok(st.handNo === 2, 'next hand dealt, got hand #' + st.handNo);
  var bs = st.players.filter(function (p) { return p.seat === 1; })[0];
  ok(bs.hasCards === false, 'sitter is not dealt in');
  ok(bs.bet === 0, 'sitter posts no blinds');

  // Bob returns: dealt back in on the following hand.
  bob.send({ t: 'sitout', out: false });
  ok(room.playerByClientId(bob.id).sittingOut === false, 'room clears sittingOut');
  guard = 0;
  while (room.table && !room.table.handOver && guard++ < 100) {
    var seat2 = room.table.acting;
    var cli2 = clients.filter(function (c) { return c.seat === seat2; })[0];
    room.applyAction(cli2.id, 'fold');
  }
  clock.t = room.nextHandAt + 1;
  srv.tickAll(clock.t);
  var bs2 = lastState(ann).players.filter(function (p) { return p.seat === 1; })[0];
  ok(bs2.hasCards === true, 'returned player is dealt in again');
  srv.close();
})();

// ---------- all-in sitter keeps pot eligibility ----------
(function () {
  var clock = testClock();
  var srv = mockServer(clock);
  var created = srv.createRoom({ maxPlayers: 6, startingStack: 100, sb: 5, bb: 10, turnTimerSec: 0 }, 'Ann');
  var code = created.code;
  var ann = created.client, bob = srv.connect(code, 'Bob').client, cid = srv.connect(code, 'Cid').client;
  watchStates(ann); watchStates(bob);
  ann.send({ t: 'start' });
  var room = srv.rooms[code].room;
  // Whoever acts first shoves.
  var seat = room.table.acting;
  var cli = [ann, bob, cid].filter(function (c) { return c.seat === seat; })[0];
  var p = room.table.players[seat];
  var r = room.applyAction(cli.id, 'raise', p.bet + p.stack);
  ok(r.ok, 'shove accepted, ' + (r.error || 'ok'));
  ok(room.table.players[seat].allIn === true, 'shover is all-in');
  // Sitting out now must not kill their live hand or pot eligibility.
  cli.send({ t: 'sitout', out: true });
  var ep = room.table.players[seat];
  ok(ep.folded === false, 'all-in sitter is not folded');
  ok(ep.sittingOut === false, 'engine sittingOut untouched mid-hand for all-in');
  ok(room.playerByClientId(cli.id).sittingOut === true, 'room flag set for next hand');
  srv.close();
})();



// ---------- sit out / back in ----------
(function () {
  var clock = testClock();
  var srv = mockServer(clock);
  var created = srv.createRoom({ maxPlayers: 6, startingStack: 1000, sb: 5, bb: 10, turnTimerSec: 0 }, 'Ann');
  var code = created.code;
  var ann = created.client, bob = srv.connect(code, 'Bob').client, cid = srv.connect(code, 'Cid').client;
  var clients = [ann, bob, cid];
  watchStates(ann); watchStates(bob); watchStates(cid);
  ann.send({ t: 'start' });
  var room = srv.rooms[code].room;
  ok(lastState(ann).state === 'playing', 'game started for sitout test');

  // Bob sits out mid-hand: his live hand dies, flag visible to everyone.
  bob.send({ t: 'sitout', out: true });
  ok(room.playerByClientId(bob.id).sittingOut === true, 'room flags bob sitting out');
  var bseat = lastState(cid).players.filter(function (p) { return p.seat === 1; })[0];
  ok(bseat && bseat.sittingOut === true, 'snapshot exposes sittingOut to others');
  ok(room.table.players[1].folded === true, 'bob folded out of the live hand');
  bob.send({ t: 'sitout', out: true });
  ok(bob.last.t !== 'error', 'repeat sitout is idempotent');

  // Finish the hand with folds.
  var guard = 0;
  while (room.table && !room.table.handOver && guard++ < 100) {
    var seat = room.table.acting;
    var cli = clients.filter(function (c) { return c.seat === seat; })[0];
    room.applyAction(cli.id, 'fold');
  }
  ok(room.table.handOver === true, 'hand finished after folds');

  // Next hand: the sitter is skipped entirely (no cards, no blinds).
  clock.t = room.nextHandAt + 1;
  srv.tickAll(clock.t);
  var st = lastState(ann);
  ok(st.handNo === 2, 'next hand dealt, got hand #' + st.handNo);
  var bs = st.players.filter(function (p) { return p.seat === 1; })[0];
  ok(bs.hasCards === false, 'sitter is not dealt in');
  ok(bs.bet === 0, 'sitter posts no blinds');

  // Bob returns: dealt back in on the following hand.
  bob.send({ t: 'sitout', out: false });
  ok(room.playerByClientId(bob.id).sittingOut === false, 'room clears sittingOut');
  guard = 0;
  while (room.table && !room.table.handOver && guard++ < 100) {
    var seat2 = room.table.acting;
    var cli2 = clients.filter(function (c) { return c.seat === seat2; })[0];
    room.applyAction(cli2.id, 'fold');
  }
  clock.t = room.nextHandAt + 1;
  srv.tickAll(clock.t);
  var bs2 = lastState(ann).players.filter(function (p) { return p.seat === 1; })[0];
  ok(bs2.hasCards === true, 'returned player is dealt in again');
  srv.close();
})();

// ---------- all-in sitter keeps pot eligibility ----------
(function () {
  var clock = testClock();
  var srv = mockServer(clock);
  var created = srv.createRoom({ maxPlayers: 6, startingStack: 100, sb: 5, bb: 10, turnTimerSec: 0 }, 'Ann');
  var code = created.code;
  var ann = created.client, bob = srv.connect(code, 'Bob').client, cid = srv.connect(code, 'Cid').client;
  watchStates(ann); watchStates(bob);
  ann.send({ t: 'start' });
  var room = srv.rooms[code].room;
  // Whoever acts first shoves.
  var seat = room.table.acting;
  var cli = [ann, bob, cid].filter(function (c) { return c.seat === seat; })[0];
  var p = room.table.players[seat];
  var r = room.applyAction(cli.id, 'raise', p.bet + p.stack);
  ok(r.ok, 'shove accepted, ' + (r.error || 'ok'));
  ok(room.table.players[seat].allIn === true, 'shover is all-in');
  // Sitting out now must not kill their live hand or pot eligibility.
  cli.send({ t: 'sitout', out: true });
  var ep = room.table.players[seat];
  ok(ep.folded === false, 'all-in sitter is not folded');
  ok(ep.sittingOut === false, 'engine sittingOut untouched mid-hand for all-in');
  ok(room.playerByClientId(cli.id).sittingOut === true, 'room flag set for next hand');
  srv.close();
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed (netplay)');

(function () {
  // v1.8: chat, rebuy, host migration on disconnect.
  var RS2 = js('room-server.js');
  function mkRoom() {
    var r = new RS2.Room({ code: 'ABCDEF', config: { maxPlayers: 6, startingStack: 1000, sb: 5, bb: 10 } });
    r.addPlayer('c1', 'Host');
    r.addPlayer('c2', 'Guest');
    return r;
  }
  // Chat: message stored and broadcast, capped at 200 chars, empty rejected.
  var r = mkRoom();
  var cr = r.sendChat('c1', 'hello table');
  ok(cr.ok, 'chat send ok');
  ok(r.chat.length === 1 && r.chat[0].from === 'Host' && r.chat[0].text === 'hello table', 'chat stored with sender');
  var cr2 = r.sendChat('c1', '   ');
  ok(!cr2.ok, 'empty chat rejected');
  var long = new Array(300).join('x');
  r.sendChat('c1', long);
  ok(r.chat[r.chat.length - 1].text.length === 200, 'chat capped at 200 chars');
  var snap = r.getSnapshot(0);
  ok(snap.chat && snap.chat.length === 2, 'chat included in snapshot');
  // Rebuy: busted player tops back up to starting stack, buyins tracked.
  var r2 = mkRoom();
  r2.start('c1');
  var guest = r2.players.filter(function (p) { return p.name === 'Guest'; })[0];
  guest.stack = 0;
  if (r2.table && r2.table.players[guest.seat]) r2.table.players[guest.seat].stack = 0;
  var rr = r2.rebuy('c2');
  ok(rr.ok, 'rebuy ok when busted');
  ok(guest.stack === 1000 && guest.buyins === 2, 'rebuy restores stack, increments buyins');
  var rr2 = r2.rebuy('c2');
  ok(!rr2.ok, 'rebuy rejected when already topped up');
  var snap2 = r2.getSnapshot(guest.seat);
  var gp = snap2.players.filter(function (p) { return p.seat === guest.seat; })[0];
  ok(gp.buyins === 2, 'buyins visible in snapshot for ledger');
  // Host migration: lazy — host keeps the crown across transient drops; a
  // connected non-host who tries to start while the host is gone takes over.
  var r3 = new RS2.Room({ code: 'ABCDEF', config: { maxPlayers: 6, startingStack: 1000, sb: 5, bb: 10 } });
  r3.addPlayer('c1', 'Host');
  r3.addPlayer('c2', 'Guest');
  r3.addPlayer('c3', 'Third');
  ok(r3.host().name === 'Host', 'host starts as Host');
  r3.setConnected('c1', false);
  ok(r3.host().name === 'Host', 'host keeps crown across transient disconnect');
  var sr = r3.start('c2');
  ok(sr.ok && r3.host().name === 'Guest', 'connected guest takes host on start when host is gone');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
