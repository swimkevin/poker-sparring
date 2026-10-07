// online.js — UI controller for the Online (multiplayer prototype) screen.
// Talks to MockRoomServer (local, no backend) or a NetClient WebSocket to the
// Cloudflare Worker relay. Renders with the same CSS classes as the offline
// table (.felt/.seat/.card/.pot/.ctl) for visual consistency.
//
// This module never computes game legality: the server snapshot carries the
// legal actions for the current seat, and every click just forwards an intent.

var Online = (function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function esc(s) { return UI.escapeHtml(String(s == null ? '' : s)); }
  function fmt(n) { n = Math.round(n); return n.toLocaleString('en-US'); }

  var inited = false;
  var view = 'home';            // home | lobby | table
  var mode = 'mock';            // 'mock' | 'live'
  var server = null;            // MockRoomServer (mock mode)
  var client = null;            // mock rec or live adapter {send,close,onmessage}
  var wsUrl = '';
  var WSURL_KEY = 'ps_wsurl_v1';
  // Default public relay (Kevin's Cloudflare worker). The workers.dev URL is
  // stable — it only changes if the worker is renamed or recreated. Nothing
  // secret lives in it; rooms are still gated by their 6-letter codes.
  // Users can override per session in the Advanced field; clearing the field
  // falls back to local mock mode.
  var DEFAULT_WS_URL = 'https://poker-sparring-relay.swimkevin1735.workers.dev';
  // The dashboard shows an https:// URL but WebSockets need wss://.
  // Normalize pasted values so either form works.
  function normalizeWsUrl(u) {
    u = (u || '').trim().replace(/\/+$/, '');
    if (/^https:\/\//i.test(u)) return 'wss://' + u.slice(8);
    if (/^http:\/\//i.test(u)) return 'ws://' + u.slice(7);
    return u;
  }
  // Remembered relay URL: paste once, not every game night. Guarded storage
  // (same pattern as names.js) so tests/Node get a memory fallback.
  var _wsMem = '';
  function loadWsUrl() {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.getItem(WSURL_KEY) || '';
    } catch (e) { /* fall through */ }
    return _wsMem;
  }
  function saveWsUrl(u) {
    try {
      if (typeof localStorage !== 'undefined') { localStorage.setItem(WSURL_KEY, u); return; }
    } catch (e) { /* fall through */ }
    _wsMem = u;
  }
  var mySeat = -1, isHost = false, myName = '';
  var roomCode = '';
  var lastState = null, lastLobby = null;
  var betOpen = false;

  // ---------------- entry ----------------

  // Called from the app.js nav hook. Switches to the Online screen and renders
  // whatever view the session is currently in.
  function show() {
    if (!inited) { inited = true; buildSkeleton(); wireNavAway(); }
    document.querySelectorAll('main .screen').forEach(function (s) { s.hidden = true; });
    $('screen-online').hidden = false;
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.nav === 'online');
    });
    window.scrollTo(0, 0);
    render();
  }

  // UI.showScreen (used by the offline tabs) doesn't know about screen-online,
  // so hide it on any other nav click. Capture phase runs before app.js's handler.
  function wireNavAway() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      var b = t && t.closest ? t.closest('.nav-btn') : null;
      if (b && b.dataset.nav !== 'online') {
        var sc = $('screen-online');
        if (sc) sc.hidden = true;
      }
    }, true);
  }

  function buildSkeleton() {
    $('online-root').innerHTML =
      '<div class="online-wrap">' +
      '<h1>Play online <span class="beta-tag">BETA</span></h1>' +
      '<p class="subtitle">Host a table, share the room code, and play real hands with friends — up to 8 players. ' +
      'Turn timers and host pause included.</p>' +
      '<div class="conn-pill"><span class="dot">●</span> <span id="online-conn-text"></span></div>' +
      '<div id="online-view"></div>' +
      '</div>';
  }

  // The home screen's connection pill must describe the CURRENT default: the
  // relay URL is prefilled, so hosting/joining uses the live relay unless the
  // user clears the field (mock mode). It used to hardcode "Local mock", which
  // contradicted the prefilled relay and killed trust in friend invites.
  function updateHomeConn() {
    var wu = $('on-wsurl');
    var live = !wu || wu.value.trim() !== '';
    var txt = $('online-conn-text');
    if (txt) txt.textContent = live ? 'Live relay — friends join over the internet' : 'Local mock — this page only';
    var pill = txt && txt.closest('.conn-pill');
    if (pill) pill.classList.toggle('mock', !live);
  }

  function setConn(text) {
    var el = $('online-conn-text');
    if (el) el.textContent = text;
  }

  // ---------------- backend plumbing ----------------

  function ensureMock() {
    if (!server) server = new MockRoomServer();
    return server;
  }

  function attachClient(c) {
    client = c;
    c.onmessage = onServerMessage;
    // createRoom/connect broadcast the lobby synchronously on attach, before
    // onmessage existed — the snapshot waits in rec.last. Replay it so the
    // lobby renders immediately (otherwise renderLobby falls back to home).
    if (c.last) onServerMessage(c.last);
  }

  function onServerMessage(m) {
    if (!m) return;
    if (m.t === 'lobby') {
      lastLobby = m;
      if (typeof m.you === 'number') mySeat = m.you;
      isHost = !!m.isHost;
      if (view !== 'table' || m.state === 'lobby') view = 'lobby';
      render();
    } else if (m.t === 'state') {
      lastState = m;
      mySeat = m.mySeat;
      isHost = !!m.isHost;
      view = (m.state === 'lobby') ? 'lobby' : 'table';
      render();
    } else if (m.t === 'timer') {
      updateTimerBar(m.msLeft);
    } else if (m.t === 'error') {
      showError(m.message);
    }
  }

  var lastAction = null; // 'host' | 'join' — routes async server errors to the right form
  function showError(msg) {
    // Server/connection errors belong to the form that triggered them:
    // a failed join ("Room not found") must not appear under the host form.
    var el = $(lastAction === 'join' ? 'online-error2' : 'online-error') || $('online-error');
    if (el) { el.textContent = msg; el.hidden = false; }
  }
  function clearErrors() {
    ['online-error', 'online-error2'].forEach(function (id) {
      var el = $(id);
      if (el) { el.textContent = ''; el.hidden = true; }
    });
  }

  function leave() {
    if (client) { try { client.close(); } catch (e) {} client = null; }
    view = 'home'; lastState = null; lastLobby = null;
    mySeat = -1; isHost = false; roomCode = ''; betOpen = false;
    render();
  }

  // ---------------- home view ----------------

  function fieldVal(id, dflt) {
    var el = $(id);
    return el ? el.value : dflt;
  }

  function renderHome() {
    var v = $('online-view');
    v.innerHTML =
      '<div class="online-cards">' +
      '<div class="online-card"><h3>Host a table</h3>' +
      '<label>Your name<input type="text" id="on-host-name" maxlength="18" placeholder="e.g. Kevin"></label>' +
      '<label>Table name<input id="on-table-name" maxlength="30" value="Poker Night"></label>' +
      '<div class="online-row">' +
      '<label>Players (2–8)<input id="on-max" type="number" min="2" max="8" value="6"></label>' +
      '<label>Starting stack<input id="on-stack" type="number" min="200" step="100" value="1000"></label>' +
      '</div><div class="online-row">' +
      '<label>Small blind<input id="on-sb" type="number" min="1" value="5"></label>' +
      '<label>Big blind<input id="on-bb" type="number" min="2" value="10"></label>' +
      '<label>Turn timer<select id="on-timer">' +
      '<option value="0">Off</option><option value="15">15s</option>' +
      '<option value="30" selected>30s</option><option value="45">45s</option>' +
      '<option value="60">60s</option></select></label>' +
      '</div>' +
      '<button id="on-create" class="primary">Create table →</button>' +
      '<div id="online-error" class="on-error" hidden></div>' +
      '<p class="hint">You\'ll get a 6-letter room code to share. You\'re the host: you start the game and can pause it.</p>' +
      '</div>' +
      '<div class="online-card"><h3>Join a table</h3>' +
      '<label>Room code<input id="on-code" class="code-input" maxlength="6" placeholder="A3F9K2" autocapitalize="characters"></label>' +
      '<label>Your name<input type="text" id="on-join-name" maxlength="18" placeholder="e.g. Sam"></label>' +
      '<button id="on-join" class="primary">Join →</button>' +
      '<div id="online-error2" class="on-error" hidden></div>' +
      '<details class="settings-details"><summary>Advanced: live server</summary>' +
      '<label>WebSocket URL<input id="on-wsurl" placeholder="wss://your-worker.workers.dev"></label>' +
      '<p class="hint">Prefilled with the public relay — clear the field for local mock mode (this page only).</p>' +
      '</details>' +
      '</div></div>';

    $('on-create').onclick = hostGame;
    $('on-join').onclick = joinGame;

    // Prefill with the saved username from the offline setup screen,
    // and the saved relay URL (paste once, reused every session).
    if (typeof NamePrefs !== 'undefined' && NamePrefs) {
      var un = NamePrefs.getUsername();
      if (un) {
        var hn = $('on-host-name'), jn = $('on-join-name');
        if (hn && !hn.value) hn.value = un;
        if (jn && !jn.value) jn.value = un;
      }
    }
    var wu = $('on-wsurl'), savedWu = loadWsUrl();
    if (wu && !wu.value) wu.value = savedWu || DEFAULT_WS_URL;
    updateHomeConn();
    if (wu) wu.addEventListener('input', updateHomeConn);
  }

  function readConfig() {
    return {
      tableName: fieldVal('on-table-name', 'Poker Night'),
      maxPlayers: parseInt(fieldVal('on-max', '6'), 10),
      startingStack: parseInt(fieldVal('on-stack', '1000'), 10),
      sb: parseInt(fieldVal('on-sb', '5'), 10),
      bb: parseInt(fieldVal('on-bb', '10'), 10),
      turnTimerSec: parseInt(fieldVal('on-timer', '30'), 10)
    };
  }

  function hostGame() {
    var name = fieldVal('on-host-name', '').trim();
    var errBox = $('online-error');
    clearErrors();
    lastAction = 'host';
    if (!name) { errBox.textContent = 'Enter your name to host.'; errBox.hidden = false; return; }
    wsUrl = normalizeWsUrl(fieldVal('on-wsurl', ''));
    saveWsUrl(fieldVal('on-wsurl', '').trim().replace(/\/+$/, ''));
    myName = name;
    if (wsUrl) { hostLive(readConfig(), name); return; }
    mode = 'mock';
    setConn('Local mock — no server needed');
    var res = ensureMock().createRoom(readConfig(), name);
    if (res.error) { errBox.textContent = res.error; errBox.hidden = false; return; }
    roomCode = res.code;
    attachClient(res.client);
    mySeat = res.client.seat;
    view = 'lobby';
    render();
  }

  function joinGame() {
    var code = fieldVal('on-code', '').toUpperCase().trim();
    var name = fieldVal('on-join-name', '').trim();
    var errBox = $('online-error2');
    clearErrors();
    lastAction = 'join';
    if (!isValidRoomCode(code)) { errBox.textContent = 'Enter the 6-letter room code.'; errBox.hidden = false; return; }
    if (!name) { errBox.textContent = 'Enter your name to join.'; errBox.hidden = false; return; }
    wsUrl = normalizeWsUrl(fieldVal('on-wsurl', ''));
    saveWsUrl(fieldVal('on-wsurl', '').trim().replace(/\/+$/, ''));
    myName = name;
    if (wsUrl) { joinLive(code, name); return; }
    mode = 'mock';
    setConn('Local mock — no server needed');
    var res = ensureMock().connect(code, name);
    if (res.error) { errBox.textContent = res.error; errBox.hidden = false; return; }
    roomCode = code;
    attachClient(res.client);
    mySeat = res.client.seat;
    view = 'lobby';
    render();
  }

  // Live (WebSocket) path. The worker relay owns the Room; this just adapts
  // NetClient to the same {send, close, onmessage} shape the UI expects.
  function liveAdapter(url, code, name, firstMsg) {
    var nc = new NetClient();
    var relayHost = url.replace(/^wss?:\/\//, '');
    var everConnected = false;
    var adapter = {
      send: function (m) { nc.send(m); },
      close: function () { nc.close(); },
      onmessage: null, seat: -1
    };
    // Re-sent on every (re)connect: the Room reclaims our seat by name and
    // the snapshot resyncs us to the current state, lobby or mid-game.
    nc.onopen = function () {
      everConnected = true;
      nc.send(firstMsg);
      setConn('Live relay — ' + relayHost);
      clearErrors();
    };
    nc.onmessage = function (m) { if (adapter.onmessage) adapter.onmessage(m); };
    nc.onerror = function () { /* onreconnecting/onclose own the status UX */ };
    nc.onreconnecting = function () { setConn('Reconnecting…'); };
    nc.onclose = function () {
      // Only fires after auto-reconnect gives up (intentional closes are silent).
      setConn('Disconnected');
      showError(everConnected
        ? 'Connection lost. Leave and rejoin to get back in.'
        : 'Could not reach the relay. Check the URL.');
    };
    nc.connect(url + '/room/' + code + '/ws?name=' + encodeURIComponent(name),
               { autoReconnect: true, maxTries: 12 });
    mode = 'live';
    setConn('Live relay — ' + relayHost);
    roomCode = code;
    attachClient(adapter);
    view = 'lobby';
    render();
  }

  function hostLive(config, name) {
    var code = makeRoomCode();
    liveAdapter(wsUrl, code, name, { t: 'create', config: config, name: name });
  }

  function joinLive(code, name) {
    liveAdapter(wsUrl, code, name, { t: 'join', name: name });
  }

  // ---------------- lobby view ----------------

  function renderLobby() {
    var v = $('online-view');
    var lob = lastLobby;
    if (!lob) { renderHome(); return; }
    var cfg = lob.config;
    var players = lob.players.slice().sort(function (a, b) { return a.seat - b.seat; });
    var rows = players.map(function (p) {
      return '<div class="player-row"><span class="avatar">' + (p.seat === mySeat ? '🧑' : '👤') + '</span>' +
        '<span class="pname">' + esc(p.name) + '</span>' +
        (p.isHost ? '<span class="host-crown" title="Host">👑</span>' : '') +
        (!p.connected ? '<span class="hint">reconnecting…</span>' : '') +
        '<span class="seat-tag">Seat ' + (p.seat + 1) + '</span></div>';
    }).join('');

    v.innerHTML =
      '<h2>' + esc(cfg.tableName) + ' <span class="beta-tag">BETA</span></h2>' +
      (lob.champion ? '<p class="subtitle">🏆 Last game won by <b>' + esc(lob.champion) + '</b></p>' : '') +
      '<div class="lobby-code-row"><div class="lobby-code" id="on-code-big">' + esc(lob.code) + '</div>' +
      '<button id="on-copy" class="ghost">Copy invite</button></div>' +
      '<p class="hint">Share the code — friends open the <b>Online</b> tab here and join. ' +
      (mode === 'mock' ? 'Prototype runs in this page only; cross-device play needs the worker relay.' : 'Connected via live relay.') + '</p>' +
      '<div class="settings-summary">' + cfg.maxPlayers + ' max · ' + fmt(cfg.startingStack) + ' starting stack · ' +
      'blinds ' + fmt(cfg.sb) + '/' + fmt(cfg.bb) +
      (cfg.turnTimerSec > 0 ? ' · ' + cfg.turnTimerSec + 's turn timer' : ' · no turn timer') + '</div>' +
      '<h3>Players (' + players.length + '/' + cfg.maxPlayers + ')</h3>' +
      '<div class="player-list">' + rows + '</div>' +
      '<div class="online-row">' +
      (isHost ? '<button id="on-start" class="primary"' + (players.length < 2 ? ' disabled' : '') + '>Start game →</button>' : '<span class="hint">Waiting for the host to start…</span>') +
      (isHost && mode === 'mock' ? '<button id="on-addbot" class="ghost">+ Add demo bot</button>' : '') +
      '<button id="on-leave" class="ghost">Leave</button>' +
      '</div>' +
      '<div id="online-error" class="on-error" hidden></div>';

    $('on-copy').onclick = function () {
      var code = lob.code;
      var done = function () { $('on-copy').textContent = 'Copied ✓'; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done, function () { window.prompt('Copy room code:', code); });
      } else { window.prompt('Copy room code:', code); }
    };
    var startBtn = $('on-start');
    if (startBtn) startBtn.onclick = function () { client.send({ t: 'start' }); };
    var botBtn = $('on-addbot');
    if (botBtn) botBtn.onclick = function () {
      var r = server.addDemoBot(roomCode);
      if (r.error) showError(r.error);
    };
    $('on-leave').onclick = leave;
  }

  // ---------------- table view ----------------

  function seatPos(i, n) {
    // Ellipse around the felt, seat 0 at the bottom (hero position).
    var ang = (360 / n) * i - 90;
    if (n > 2) ang = (360 / n) * i + 90; // seat 0 bottom for 3+
    var rad = ang * Math.PI / 180;
    return { x: 50 + 42 * Math.cos(rad), y: 50 + 42 * Math.sin(rad) };
  }

  function renderTableView() {
    var v = $('online-view');
    var s = lastState;
    if (!s) { renderHome(); return; }
    var n = s.players.length;

    var html =
      '<div class="online-table-top">' +
      '<div class="conn-pill"><span class="dot">●</span> ' + (mode === 'mock' ? 'Local mock' : 'Live') + '</div>' +
      '<div class="hand-info">' + esc(s.config.tableName) + (s.handNo ? ' · Hand #' + s.handNo : '') + '</div>' +
      '<div class="blinds-info">' + fmt(s.config.sb) + '/' + fmt(s.config.bb) + '</div>' +
      (s.isHost && s.state === 'playing' ? '<button id="on-pause" class="ghost">' + (s.paused ? 'Resume' : 'Pause') + '</button>' : '') +
      (s.state === 'playing' ? '<button id="on-sitout" class="ghost">' + (meSittingOut(s) ? 'Back in' : 'Sit out') + '</button>' : '') +
      '<button id="on-tleave" class="ghost">Leave</button>' +
      '</div>' +
      '<div class="felt online-felt" id="online-felt">' +
      '<div class="board-area"><div class="pot" id="on-pot"></div>' +
      '<div class="community" id="on-community"></div>' +
      '<div class="street-label" id="on-street"></div></div>' +
      '<div id="online-seats"></div>' +
      '<div class="online-paused" id="on-paused" hidden><div>⏸ Paused<span class="hint" id="on-paused-by"></span></div></div>' +
      '<div class="winner-banner" id="on-banner" hidden></div>' +
      '</div>' +
      '<div class="hero-bar"><div class="hero-cards" id="on-hero"></div>' +
      '<div class="controls online-controls-row" id="on-controls"></div></div>' +
      '<div class="online-feed" id="on-feed"></div>' +
      '<div id="online-error" class="on-error" hidden></div>';

    v.innerHTML = html;
    updateTableState(s);

    $('on-tleave').onclick = leave;
    var sob = $('on-sitout');
    if (sob) sob.onclick = function () { client.send({ t: 'sitout', out: !meSittingOut(lastState) }); };
    var pb = $('on-pause');
    if (pb) pb.onclick = function () { client.send({ t: s.paused ? 'resume' : 'pause' }); };
  }

  function updateTableState(s) {
    // Board
    $('on-pot').textContent = 'Pot: ' + fmt(s.pot);
    var comm = $('on-community');
    comm.innerHTML = '';
    s.community.forEach(function (c) { comm.appendChild(UI.cardEl(c, true)); });
    $('on-street').textContent = s.street === 'preflop' ? '' : (s.street || '');

    // Seats
    var wrap = $('online-seats');
    wrap.innerHTML = '';
    var n = s.players.length;
    s.players.forEach(function (p) {
      var pos = seatPos(p.seat, n);
      var d = document.createElement('div');
      d.className = 'seat' + (p.folded ? ' folded' : '') + (s.acting === p.seat ? ' to-act' : '');
      d.style.left = pos.x + '%';
      d.style.top = pos.y + '%';
      var cardsHtml = '';
      var who = '<div class="who"><span class="avatar">' + (p.seat === s.mySeat ? '🧑' : '👤') + '</span>' +
        '<span class="pname">' + esc(p.name) + '</span>' +
        (p.isHost ? '<span class="host-crown">👑</span>' : '') + '</div>';
      d.innerHTML = who +
        '<div class="pstack">' + fmt(p.stack) + '</div>' +
        '<div class="pbet">' + (p.bet > 0 ? 'bet ' + fmt(p.bet) : '') + '</div>' +
        '<div class="pcards"></div><div class="pact"></div>' +
        '<div class="timer-bar"><div class="timer-fill"></div></div>' +
        '<div class="timer-secs"></div>';
      var pc = d.querySelector('.pcards');
      if (p.hasCards) {
        var revealed = s.showdown && s.showdown.some(function (r) { return r.seat === p.seat; });
        var sd = revealed ? s.showdown.filter(function (r) { return r.seat === p.seat; })[0] : null;
        // Hero's own seat shows their real cards (like the offline table);
        // everyone else shows backs until the showdown reveals them.
        var mine = !sd && p.seat === s.mySeat && s.hole && s.hole.length === 2;
        if (sd) { sd.hole.forEach(function (c) { pc.appendChild(UI.cardEl(c, true)); }); }
        else if (mine) { s.hole.forEach(function (c) { pc.appendChild(UI.cardEl(c, true)); }); }
        else { pc.appendChild(UI.cardBackEl(true)); pc.appendChild(UI.cardBackEl(true)); }
      }
      if (!p.connected) d.classList.add('disconnected');
      if (p.sittingOut) {
        d.classList.add('sitting-out');
        var so = document.createElement('div');
        so.className = 'sitout-badge';
        so.textContent = 'Sitting out';
        d.appendChild(so);
      }
      wrap.appendChild(d);
    });

    // Hero cards
    var hero = $('on-hero');
    hero.innerHTML = '';
    if (s.hole && s.hole.length === 2) {
      s.hole.forEach(function (c) { hero.appendChild(UI.cardEl(c, false)); });
    }

    // Timer bar on the to-act seat
    updateTimerBar(s.timerMsLeft);

    // Paused overlay
    var pausedEl = $('on-paused');
    pausedEl.hidden = !s.paused;
    if (s.paused) $('on-paused-by').textContent = 'by ' + s.pausedBy;

    // Winner banner
    var banner = $('on-banner');
    if (s.winners && s.winners.length) {
      var w = s.winners[0];
      var pl = s.players.filter(function (p) { return p.seat === w.idx; })[0];
      banner.innerHTML = '<div class="wtitle">' + esc(pl ? pl.name : 'Seat ' + w.idx) + ' wins ' + fmt(w.amount) + '</div>' +
        (w.hand ? '<div class="wsub">' + esc(w.hand) + '</div>' : '') +
        (s.nextHandInMs > 0 ? '<div class="wsub">Next hand soon…</div>' : '');
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }

    // Feed
    var feed = $('on-feed');
    feed.innerHTML = '';
    s.recent.forEach(function (line) {
      var div = document.createElement('div');
      div.textContent = line;
      feed.appendChild(div);
    });

    renderControls(s);
  }

  function updateTimerBar(msLeft) {
    var s = lastState;
    if (!s || s.turnTimerSec <= 0) return;
    var total = s.turnTimerSec * 1000;
    var pct = msLeft == null ? 0 : Math.max(0, Math.min(1, msLeft / total));
    var fills = document.querySelectorAll('#online-seats .seat.to-act .timer-fill');
    for (var i = 0; i < fills.length; i++) {
      fills[i].style.width = (pct * 100) + '%';
      fills[i].classList.toggle('low', pct < 0.25);
    }
    var secs = document.querySelectorAll('#online-seats .seat.to-act .timer-secs');
    for (var j = 0; j < secs.length; j++) {
      secs[j].textContent = msLeft == null ? '' : Math.ceil(msLeft / 1000) + 's';
    }
  }

  function meSittingOut(s) {
    if (!s || s.mySeat == null) return false;
    var me = s.players.filter(function (p) { return p.seat === s.mySeat; })[0];
    return !!(me && me.sittingOut);
  }

  function renderControls(s) {
    var c = $('on-controls');
    c.innerHTML = '';
    betOpen = false;
    function status(text) {
      var d = document.createElement('div');
      d.className = 'online-status';
      d.textContent = text;
      c.appendChild(d);
    }
    if (s.paused) { status('Paused by ' + s.pausedBy + ' — hang tight.'); return; }
    if (s.state !== 'playing') { status('Waiting…'); return; }
    if (meSittingOut(s)) { status('You are sitting out — tap "Back in" up top to rejoin.'); return; }
    if (!s.legal) {
      if (s.acting >= 0) {
        var ap = s.players.filter(function (p) { return p.seat === s.acting; })[0];
        status(ap && ap.seat === s.mySeat ? 'Your turn…' : 'Waiting for ' + (ap ? ap.name : 'player') + '…');
      } else {
        status(s.winners ? 'Hand complete.' : 'Dealing…');
      }
      return;
    }
    var legal = s.legal;
    function btn(label, cls, fn) {
      var b = document.createElement('button');
      b.className = 'ctl ' + cls;
      b.textContent = label;
      b.onclick = fn;
      c.appendChild(b);
      return b;
    }
    btn('Fold', 'danger', function () { client.send({ t: 'action', action: 'fold' }); });
    if (legal.canCheck) btn('Check', 'is-check', function () { client.send({ t: 'action', action: 'check' }); });
    else btn('Call ' + fmt(legal.callAmount), 'is-call', function () { client.send({ t: 'action', action: 'call' }); });
    var canBet = !!legal.canBet, canRaise = !!legal.canRaise;
    if (canBet || canRaise) {
      btn(canBet ? 'Bet' : 'Raise', 'is-raise', function () { openBetRow(s, canBet ? 'bet' : 'raise'); });
    }
  }

  function openBetRow(s, kind) {
    var c = $('on-controls');
    var legal = s.legal;
    var lo = legal.minBetTo || legal.minRaiseTo;
    var hi = legal.maxRaiseTo;
    var pot = s.pot;
    // Amounts are TOTAL street bet targets (engine convention). Quick buttons
    // scale off the pot on top of the minimum target.
    function targetFor(frac) {
      return Math.max(lo, Math.min(hi, Math.round(lo + frac * pot)));
    }
    c.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'bet-inline';
    var slider = document.createElement('input');
    slider.type = 'range'; slider.min = lo; slider.max = hi; slider.value = lo; slider.step = 1;
    var amt = document.createElement('span');
    amt.className = 'bet-amount';
    function refresh() { amt.textContent = fmt(parseInt(slider.value, 10)); }
    slider.oninput = refresh;
    refresh();
    wrap.appendChild(slider);
    wrap.appendChild(amt);
    [['Min', 0], ['½ Pot', 0.5], ['Pot', 1], ['Max', 99]].forEach(function (q) {
      var b = document.createElement('button');
      b.className = 'chip-btn';
      b.textContent = q[0];
      b.onclick = function () {
        slider.value = q[1] === 99 ? hi : targetFor(q[1]);
        refresh();
      };
      wrap.appendChild(b);
    });
    var okB = document.createElement('button');
    okB.className = 'ctl primary';
    okB.textContent = 'Confirm';
    okB.onclick = function () {
      client.send({ t: 'action', action: kind, amount: parseInt(slider.value, 10) });
    };
    var cancel = document.createElement('button');
    cancel.className = 'ctl ghost';
    cancel.textContent = 'Cancel';
    cancel.onclick = function () { renderControls(s); };
    c.appendChild(wrap);
    c.appendChild(okB);
    c.appendChild(cancel);
  }

  // ---------------- render root ----------------

  function render() {
    if (view === 'lobby') renderLobby();
    else if (view === 'table') renderTableView();
    else renderHome();
  }

  return { show: show };
})();
