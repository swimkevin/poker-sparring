// Component tests: node tests/component.test.js
// Renders real UI functions in jsdom and asserts on the DOM they produce.
// Requires the devDependency jsdom (npm install). Skips cleanly without it.
var path = require('path');
var fs = require('fs');

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}

var jsdom;
try { jsdom = require('jsdom'); }
catch (e) {
  console.log('SKIP: jsdom not installed — run `npm install` for component tests.');
  process.exit(0);
}

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body>' +
  '<div id="pf-actions"></div><div id="pf-feedback" hidden></div>' +
  '<button id="pf-next" hidden></button>' +
  '<div id="stat-cards"></div><div id="arch-table"></div><div id="history-list"></div>' +
  '<canvas id="sparkline" width="640" height="160"></canvas>' +
  '<div id="glossary"></div><div id="leak-list"></div><div id="bot-roster"></div>' +
  '<div id="book-list"></div><div id="site-list"></div>' +
  '<div id="preset-list"></div><div id="custom-list"></div>' +
  '<div id="hand-list"></div><div id="replay-view" hidden></div>' +
  '<div id="pot-display"></div><div id="community"></div><div id="street-label"></div><div id="seats"></div>' +
  '</body></html>');

global.window = dom.window;
global.document = dom.window.document;
dom.window.scrollTo = function () {};

// Canvas is not implemented in jsdom: absorb all 2d calls.
function nullCtx() {
  return new Proxy({}, {
    get: function (t, k) { return function () {}; },
    set: function () { return true; }
  });
}
dom.window.HTMLCanvasElement.prototype.getContext = function () { return nullCtx(); };

// In-memory localStorage for stats.js.
var mem = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
  setItem: function (k, v) { mem[k] = String(v); },
  removeItem: function (k) { delete mem[k]; }
};

// ui.js speaks in globals in the browser; mirror that here.
var cards = require(path.join(__dirname, '..', 'js', 'cards.js'));
var stats = require(path.join(__dirname, '..', 'js', 'stats.js'));
var bots = require(path.join(__dirname, '..', 'js', 'bots.js'));
var replay = require(path.join(__dirname, '..', 'js', 'replay.js'));
global.ARCHETYPES = bots.ARCHETYPES;
global.loadStats = stats.loadStats;
global.derivedStats = stats.derivedStats;
global.rankChar = cards.rankChar;
global.rankName = cards.rankName;
global.SUIT_NAMES = cards.SUIT_NAMES;
global.isRed = cards.isRed;
global.SUITS = cards.SUITS;
global.replayState = replay.replayState;
global.frameIndexForStreet = replay.frameIndexForStreet;

var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui.js'), 'utf8');
eval(src); // exposes `var UI` in this module scope
if (typeof UI === 'undefined') { console.log('FAIL: UI did not load'); process.exit(1); }

// ---------- escaping ----------
(function () {
  var evil = '<img src=x onerror=alert(1)>';
  var out = UI.escapeHtml(evil);
  ok(out.indexOf('<') === -1 && out.indexOf('&lt;') !== -1, 'escapeHtml neutralizes tags');
  ok(UI.escapeHtml(null) === '' && UI.escapeHtml(undefined) === '', 'escapeHtml handles null/undefined');

  // Custom-bot emoji goes through innerHTML: must be escaped (stored XSS guard).
  UI.renderRoster(
    [{ id: 'evil', name: 'Evil', emoji: evil, tagline: 'x' }],
    new Set(['evil'])
  );
  var html = document.getElementById('bot-roster').innerHTML;
  ok(html.indexOf('<img src=x') === -1, 'roster emoji is escaped');
  ok(html.indexOf('&lt;img') !== -1, 'escaped emoji present in roster');

  UI.renderArchetypes(
    [{ id: 'c1', name: 'Bad', emoji: '<svg onload=x>', tagline: '', desc: '', custom: true }],
    function () {}
  );
  var chtml = document.getElementById('custom-list').innerHTML;
  ok(chtml.indexOf('<svg') === -1, 'custom archetype card escapes emoji');
})();

// ---------- push/fold feedback renders exactly once ----------
(function () {
  UI.renderPFFeedback({ right: true, explain: 'Great call.' });
  var box = document.getElementById('pf-feedback');
  ok(box.hidden === false, 'feedback shown');
  ok(box.querySelectorAll('.verdict').length === 1, 'exactly one verdict element (no duplicate feedback)');
  ok(box.className.indexOf('correct') !== -1, 'correct styling applied');
  ok(document.getElementById('pf-actions').style.display === 'none', 'actions hidden after answer');
  ok(document.getElementById('pf-next').hidden === false, 'next button revealed');

  UI.renderPFFeedback({ right: false, explain: 'Too loose.' });
  ok(box.querySelectorAll('.verdict').length === 1, 'still exactly one verdict on second render');
  ok(box.className.indexOf('wrong') !== -1, 'wrong styling applied');
})();

// ---------- learn screen: glossary as collapsed accordions ----------
(function () {
  UI.renderLearn();
  var terms = document.querySelectorAll('#glossary details.gloss-card');
  ok(terms.length === 29, '29 glossary accordions rendered, got ' + terms.length);
  var allClosed = Array.prototype.every.call(terms, function (d) { return !d.open; });
  ok(allClosed, 'glossary terms start collapsed (less text at once)');
  var first = terms[0].querySelector('summary.gloss-term');
  ok(first && first.textContent.length > 0, 'glossary summary shows the term');
  ok(document.querySelectorAll('#book-list .book-card').length === 3, '3 book cards');
  var links = document.querySelectorAll('#book-list .book-card');
  var extOk = Array.prototype.every.call(links, function (a) {
    return a.target === '_blank' && a.rel === 'noopener';
  });
  ok(extOk, 'external links open safely (target=_blank, rel=noopener)');
})();

// ---------- stats: bb/100 hidden until 20+ hands ----------
(function () {
  mem = {}; // reset storage
  UI.renderStats();
  var vals = {};
  document.querySelectorAll('#stat-cards .stat-card').forEach(function (el) {
    vals[el.querySelector('.sk').textContent.replace('ⓘ', '')] = el.querySelector('.sv').textContent;
  });
  ok(vals['bb / 100'] === '—', 'bb/100 shows dash below 20 hands, got "' + vals['bb / 100'] + '"');
  ok(vals['Hands'] === '0', 'hands starts at 0');

  // Record 25 hands, then the rate appears.
  for (var i = 0; i < 25; i++) {
    stats.recordHand({
      mode: 'cash', bb: 10, heroHole: [], community: [], profitChips: 20,
      wonHand: true, vpip: true, pfr: false, postBet: 0, postCall: 0,
      opponents: [], heroStackBB: 100, potBB: 5, resultText: ''
    });
  }
  UI.renderStats();
  var vals2 = {};
  document.querySelectorAll('#stat-cards .stat-card').forEach(function (el) {
    vals2[el.querySelector('.sk').textContent.replace('ⓘ', '')] = el.querySelector('.sv').textContent;
  });
  ok(vals2['Hands'] === '25', '25 hands recorded');
  ok(vals2['bb / 100'] !== '—' && parseFloat(vals2['bb / 100']) === 200,
    'bb/100 appears at 25 hands, got "' + vals2['bb / 100'] + '"');
})();

// ---------- leak tracker empty + populated states ----------
(function () {
  mem = {};
  UI.renderStats();
  var empty = document.getElementById('leak-list').textContent;
  ok(empty.indexOf('No leaks') !== -1, 'leak tracker empty state');

  stats.recordLeak({
    hand: 7, hole: 'As Ks', street: 'flop', type: 'bad-chase',
    title: 'Chasing without the odds', spot: 'Called 100', why: 'Math says no.'
  });
  UI.renderStats();
  var cards = document.querySelectorAll('#leak-list .leak-card');
  ok(cards.length === 1, 'one leak card rendered');
  var why = cards[0].querySelector('details.leak-why');
  ok(why && !why.open, 'leak explanation collapsed behind <details>');
  ok(document.querySelector('#leak-list .leak-chip').textContent.indexOf('×1') !== -1,
    'leak summary chip counts by type');
})();

// ---------- hand history list + replayer ----------
(function () {
  function C(r, s) { return { r: r, s: s }; }
  var rec = {
    v: 1, id: 'h7-abc', handNo: 7, date: '2026-10-04T12:00:00.000Z', mode: 'cash',
    sb: 5, bb: 10, ante: 0, button: 1,
    players: [
      { name: 'You', emoji: '🧑', isHero: true, stack: 1000 },
      { name: 'The Rock', emoji: '🪨', isHero: false, stack: 1000 }
    ],
    heroHole: [C(14, 0), C(13, 0)],
    timeline: [
      { t: 'action', street: 'preflop', player: 0, name: 'You', emoji: '🧑', action: 'sb', amount: 5, pot: 5 },
      { t: 'action', street: 'preflop', player: 1, name: 'The Rock', emoji: '🪨', action: 'bb', amount: 10, pot: 15 },
      { t: 'action', street: 'preflop', player: 0, name: 'You', emoji: '🧑', action: 'raise', amount: 40, bet: 40, pot: 50 },
      { t: 'action', street: 'preflop', player: 1, name: 'The Rock', emoji: '🪨', action: 'call', amount: 30, bet: 40, pot: 80 },
      { t: 'street', street: 'flop', community: [C(2, 2), C(7, 1), C(11, 0)], pot: 80 },
      { t: 'end', pot: 80, community: [C(2, 2), C(7, 1), C(11, 0)],
        winners: [{ names: ['You'], amount: 80, hand: 'Pair of Kings', uncalled: false, byFold: false, potIndex: 0 }] }
    ],
    heroNet: 40, heroNetBB: 4, result: 'You win 80 (Pair of Kings)'
  };

  // list
  var opened = null;
  UI.renderHandList([rec], function (id) { opened = id; });
  var rows = document.querySelectorAll('#hand-list .hrow');
  ok(rows.length === 1, 'hand list renders one row');
  ok(rows[0].querySelector('.hnum').textContent === 'Hand #7', 'row shows hand number');
  ok(rows[0].querySelector('.hres').classList.contains('pos'), 'positive net styled pos');
  ok(rows[0].querySelectorAll('.hcards .card').length === 2, 'hero hole cards rendered in row');
  rows[0].querySelector('.rp-open').click();
  ok(opened === 'h7-abc', 'replay button opens record by id');
  UI.renderHandList([], function () {});
  ok(document.getElementById('hand-list').textContent.indexOf('No saved hands') !== -1, 'empty list state');

  // viewer: start
  UI.renderReplay(rec, 0);
  ok(document.querySelectorAll('#replay-view .rp-community .card').length === 0, 'no community cards at frame 0');
  ok(document.getElementById('rp-prev').disabled, 'prev disabled at start');
  ok(!document.getElementById('rp-next').disabled, 'next enabled at start');
  ok(document.getElementById('rp-back'), 'back button present');
  ok(document.getElementById('rp-street-flop').dataset.street === 'flop', 'street jump button carries street');

  // viewer: mid-hand
  UI.renderReplay(rec, 2);
  ok(document.querySelectorAll('#replay-view .rp-act').length === 2, 'two actions shown at frame 2');
  ok(document.getElementById('replay-view').textContent.indexOf('Pot:') !== -1, 'pot shown in viewer');

  // viewer: flop dealt
  UI.renderReplay(rec, 5);
  ok(document.querySelectorAll('#replay-view .rp-community .card').length === 3, 'three flop cards shown after street frame');
  ok(document.getElementById('replay-view').textContent.indexOf('Flop') !== -1, 'street label shows Flop');

  // viewer: end
  UI.renderReplay(rec, 6);
  ok(document.getElementById('rp-next').disabled && document.getElementById('rp-end').disabled,
    'next/end disabled at final frame');
  ok(!document.getElementById('rp-prev').disabled, 'prev enabled at final frame');
  var res = document.querySelector('#replay-view .rp-result');
  ok(res && res.textContent.indexOf('You win') !== -1, 'result shown at end');
  ok(document.querySelector('#replay-view .rp-progress').textContent === 'Step 6 of 6', 'progress text');

  // XSS: hostile name inside the timeline must render escaped
  var evil = JSON.parse(JSON.stringify(rec));
  evil.timeline[2].name = '<img src=x onerror=alert(1)>';
  UI.renderReplay(evil, 3);
  var rvHtml = document.getElementById('replay-view').innerHTML;
  ok(rvHtml.indexOf('<img src=x') === -1, 'replay action names escaped');
  ok(rvHtml.indexOf('&lt;img') !== -1, 'escaped name present as text');

  // Chip deltas, not BB: the hand-list row must show +40 chips, not "+4 bb".
  UI.renderHandList([rec], function () {});
  var hres = document.querySelector('#hand-list .hres');
  ok(hres && hres.textContent === '+40', 'hand list shows chip delta "+40", got "' + (hres && hres.textContent) + '"');
})();

// ---------- chip amounts instead of BB in stats/history ----------
(function () {
  mem = {}; // reset storage
  stats.recordHand({
    mode: 'cash', bb: 10, heroHole: [], community: [], profitChips: 125,
    wonHand: true, vpip: true, pfr: false, postBet: 0, postCall: 0,
    opponents: [{ id: 'shark', name: 'Shark', emoji: '🦈' }],
    heroStackBB: 100, potBB: 12.5, resultText: 'Won 125'
  });
  UI.renderStats();
  var rows = document.querySelectorAll('#history-list .hist-row');
  ok(rows.length === 1, 'one history row recorded');
  var delta = rows[0].querySelector('.pos, .neg');
  ok(delta && delta.textContent === '+125',
    'history row shows chip delta "+125", got "' + (delta && delta.textContent) + '"');
  var arch = document.getElementById('arch-table').textContent;
  ok(arch.indexOf('+125') !== -1 && arch.indexOf('bb') === -1,
    'per-archetype row shows chips not bb, got "' + arch.trim().slice(0, 80) + '"');
  var vals = {};
  document.querySelectorAll('#stat-cards .stat-card').forEach(function (el) {
    vals[el.querySelector('.sk').textContent.replace('ⓘ', '')] = el.querySelector('.sv').textContent;
  });
  ok(vals['Biggest pot'] === '125', 'biggest pot shows chips, got "' + vals['Biggest pot'] + '"');

  // Legacy records without chip fields fall back to BB text instead of NaN.
  mem['ps_stats_v1'] = JSON.stringify({
    hands: 1, won: 0, profitBB: -2, vpipHands: 1, vpip: 0, pfr: 0, postBet: 0, postCall: 0,
    biggestPotBB: 10, perArchetype: { shark: { hands: 1, won: 0, profitBB: -2, name: 'Shark', emoji: '🦈' } },
    history: [{ n: 1, hole: [], board: 0, profitBB: -2, won: false, mode: 'cash', result: '' }]
  });
  UI.renderStats();
  var legacy = document.querySelector('#history-list .hist-row .neg');
  ok(legacy && legacy.textContent === '-2 bb', 'legacy history falls back to bb, got "' + (legacy && legacy.textContent) + '"');
})();

// ---------- hand story view ----------
(function () {
  function C(r, s) { return { r: r, s: s }; }
  var rec = {
    id: 'story1', handNo: 3, date: new Date().toISOString(), mode: 'cash', sb: 5, bb: 10,
    heroHole: [C(14, 0), C(13, 1)],
    timeline: [
      { t: 'action', street: 'preflop', player: 0, name: 'You', emoji: '🧑', action: 'sb', amount: 5, pot: 5 },
      { t: 'action', street: 'preflop', player: 1, name: 'Maniac', emoji: '🤪', action: 'bb', amount: 10, pot: 15 },
      { t: 'action', street: 'preflop', player: 0, name: 'You', emoji: '🧑', action: 'call', amount: 5, bet: 10, pot: 20 },
      { t: 'street', street: 'flop', community: [C(2, 2), C(7, 1), C(11, 0)], pot: 20 },
      { t: 'action', street: 'flop', player: 0, name: 'You', emoji: '🧑', action: 'check', pot: 20 },
      { t: 'action', street: 'flop', player: 1, name: 'Maniac', emoji: '🤪', action: 'fold', pot: 20 },
      { t: 'end', pot: 20, community: [C(2, 2), C(7, 1), C(11, 0)],
        winners: [{ names: ['You'], amount: 20, hand: null, uncalled: false, byFold: true, potIndex: 0 }] }
    ],
    heroNet: 10, heroNetBB: 1
  };
  UI.renderHandStory(rec);
  var view = document.getElementById('replay-view');
  ok(!view.hidden, 'story view visible');
  ok(document.getElementById('rp-back'), 'story has back button');
  ok(document.getElementById('rp-steps'), 'story has step-through toggle');
  var secs = view.querySelectorAll('.rp-story-sec');
  ok(secs.length === 2, 'two street sections, got ' + secs.length);
  ok(secs[0].textContent.indexOf('Pre-flop') !== -1, 'first section is pre-flop');
  ok(secs[1].textContent.indexOf('Flop') !== -1, 'second section is flop');
  ok(view.textContent.indexOf('posts small blind 5') !== -1, 'blind action narrated');
  ok(view.textContent.indexOf('Maniac 🤪 folds') !== -1 || view.textContent.indexOf('folds') !== -1, 'fold narrated');
  ok(view.textContent.indexOf('A♠') !== -1 && view.textContent.indexOf('K♥') !== -1, 'hero hole cards shown');
  var net = view.querySelector('.rp-story-net');
  ok(net && net.textContent.indexOf('+10') !== -1, 'story shows hero net +10, got "' + (net && net.textContent) + '"');
  // hostile names stay escaped in story view
  var evil = JSON.parse(JSON.stringify(rec));
  evil.timeline[1].name = '<script>alert(1)</script>';
  UI.renderHandStory(evil);
  ok(document.getElementById('replay-view').innerHTML.indexOf('<script>') === -1, 'story escapes hostile names');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed (component)');

// ---------- audit-driven UI fixes ----------
// Cards must announce themselves to screen readers; the new one-tap start,
// skip, turn-status, and last-result elements must exist in the markup.
(function () {
  ok(UI.cardEl({ r: 14, s: 0 }, true).getAttribute('aria-label') === 'Ace of spades',
    'card aria-label: Ace of spades');
  ok(UI.cardEl({ r: 11, s: 1 }, true).getAttribute('aria-label') === 'Jack of hearts',
    'card aria-label: Jack of hearts');
  ok(UI.cardEl({ r: 9, s: 2 }, true).getAttribute('aria-label') === 'Nine of diamonds',
    'card aria-label: Nine of diamonds');
  ok(UI.cardBackEl(true).getAttribute('aria-label') === 'Face-down card',
    'card back aria-label');

  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ['btn-quick', 'btn-skip', 'turn-status', 'last-result'].forEach(function (id) {
    ok(html.indexOf('id="' + id + '"') !== -1, 'index.html contains #' + id);
  });
  ok(/id="bet-slider"[^>]*aria-label="Raise amount"/.test(html), 'raise slider has accessible name');
})();

// ---------- smooth table fx ----------
// Cards must be diff-synced (same DOM nodes across renders) so the deal
// animation only plays for newly dealt cards — never a full-table flash.
(function () {
  function fakeTable() {
    return {
      players: [
        { isHero: true, name: 'You', stack: 990, bet: 10, folded: false, sittingOut: false,
          hole: [{ r: 14, s: 0 }, { r: 13, s: 1 }] },
        { isHero: false, name: 'Bot', archetype: { emoji: '🤖' }, stack: 1000, bet: 0,
          folded: false, sittingOut: false, hole: [{ r: 2, s: 2 }, { r: 7, s: 3 }] }
      ],
      community: [], street: 'preflop', acting: 1, button: 0, handOver: false,
      potTotal: function () { return 10; }
    };
  }
  var d = dom.window.document;
  UI.buildSeats(2);
  var t = fakeTable();
  UI.renderTable(t, {});
  var heroCards1 = Array.prototype.slice.call(d.querySelector('#seat-0 .pcards').children);
  var botCards1 = Array.prototype.slice.call(d.querySelector('#seat-1 .pcards').children);
  ok(heroCards1.length === 2 && botCards1.length === 2, 'hole cards rendered (hero face-up, bot face-down)');
  ok(botCards1[0].classList.contains('back'), 'bot hole cards are face-down');

  // Re-render with identical state: the SAME nodes must survive (no rebuild).
  UI.renderTable(t, {});
  var heroCards2 = Array.prototype.slice.call(d.querySelector('#seat-0 .pcards').children);
  var botCards2 = Array.prototype.slice.call(d.querySelector('#seat-1 .pcards').children);
  ok(heroCards2[0] === heroCards1[0] && heroCards2[1] === heroCards1[1], 'hero cards not rebuilt on re-render');
  ok(botCards2[0] === botCards1[0] && botCards2[1] === botCards1[1], 'bot cards not rebuilt on re-render');

  // Flop: 3 new community cards appear; a second render keeps them stable.
  t.community = [{ r: 14, s: 2 }, { r: 8, s: 2 }, { r: 6, s: 3 }];
  t.street = 'flop';
  UI.renderTable(t, {});
  var flop1 = Array.prototype.slice.call(d.querySelector('#community').children);
  ok(flop1.length === 3, 'flop dealt (3 community cards)');
  UI.renderTable(t, {});
  var flop2 = Array.prototype.slice.call(d.querySelector('#community').children);
  ok(flop2[0] === flop1[0] && flop2[2] === flop1[2], 'community cards stable across renders');
  // Turn: only the 4th card is new; the flop trio is untouched.
  t.community.push({ r: 2, s: 1 }); t.street = 'turn';
  UI.renderTable(t, {});
  var turn = Array.prototype.slice.call(d.querySelector('#community').children);
  ok(turn.length === 4 && turn[0] === flop1[0] && turn[2] === flop1[2], 'turn adds one card, flop untouched');

  // Fold: bot cards are removed (not left stale).
  t.players[1].folded = true;
  UI.renderTable(t, {});
  ok(d.querySelector('#seat-1 .pcards').children.length === 0, 'folded player cards removed');

  // Action badge pops when the action text changes.
  UI.renderTable(t, { lastActions: { 0: 'bets 20' } });
  var pact = d.querySelector('#seat-0 .pact');
  ok(pact.textContent === 'bets 20' && pact.classList.contains('pop'), 'action badge pops on new action');
  var clsBefore = pact.className;
  UI.renderTable(t, { lastActions: { 0: 'bets 20' } });
  ok(pact.className === clsBefore, 'same action leaves badge untouched (no re-pop)');

  // Chip fly: a chip element arcs from seat to pot (mocked geometry).
  var seat0 = d.querySelector('#seat-0'), pot = d.querySelector('#pot-display');
  seat0.getBoundingClientRect = function () { return { left: 100, top: 400, width: 80, height: 60 }; };
  pot.getBoundingClientRect = function () { return { left: 400, top: 200, width: 120, height: 30 }; };
  UI.chipFly(0);
  ok(!!d.querySelector('.chip-fly'), 'chip-fly element spawned');
  UI.resetTableFx();
  ok(!d.querySelector('.chip-fly'), 'resetTableFx clears stray chips');
})();

// ---------- update-check.js (separate jsdom, stubbed fetch/timers) ----------
// The page must notice a new release without a hard refresh: a version bump
// on the server shows a calm toast with a Refresh button; matching versions
// and fetch failures stay silent.
(function () {
  var fs = require('fs');
  var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'update-check.js'), 'utf8');

  function loadUpdateCheck(pageVersion, serverVersion, fetchOk) {
    var d = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>',
      { runScripts: 'outside-only', pretendToBeVisual: true });
    var win = d.window;
    win.APP_VERSION = pageVersion;
    var timers = [];
    win.setInterval = function (fn) { timers.push({ fn: fn, every: true }); return timers.length; };
    win.setTimeout = function (fn) { timers.push({ fn: fn, every: false }); return timers.length; };
    win.fetch = function () {
      return Promise.resolve({
        ok: fetchOk !== false,
        text: function () { return Promise.resolve(serverVersion + '\n'); }
      });
    };
    win.eval(src);
    return { win: win, timers: timers, fire: function () { timers.forEach(function (t) { t.fn(); }); } };
  }

  function tick() { return new Promise(function (res) { setTimeout(res, 10); }); }

  (async function () {
    // New version on server -> toast appears with Refresh button.
    var t1 = loadUpdateCheck('1.5.1', '1.5.2', true);
    t1.fire();
    await tick();
    var toast = t1.win.document.querySelector('.update-toast');
    ok(!!toast, 'update toast appears when server version differs');
    ok(toast && toast.textContent.indexOf('1.5.2') !== -1, 'toast names the new version');
    var btn = toast && toast.querySelector('.update-toast-btn');
    ok(!!btn && btn.textContent === 'Refresh', 'toast has a Refresh button');

    // Same version -> silent.
    var t2 = loadUpdateCheck('1.5.1', '1.5.1', true);
    t2.fire();
    await tick();
    ok(!t2.win.document.querySelector('.update-toast'), 'no toast when versions match');

    // Fetch failure (offline) -> silent, no crash.
    var t3 = loadUpdateCheck('1.5.1', '9.9.9', false);
    t3.fire();
    await tick();
    ok(!t3.win.document.querySelector('.update-toast'), 'no toast when version fetch fails');

    // Version string is escaped (no HTML injection via version.txt).
    var t4 = loadUpdateCheck('1.5.1', '<img src=x onerror=alert(1)>', true);
    t4.fire();
    await tick();
    var evil = t4.win.document.querySelector('.update-toast');
    ok(!!evil && evil.innerHTML.indexOf('<img src=x') === -1, 'server version escaped in toast');

    console.log('\n' + pass + ' passed, ' + fail + ' failed (component)');
    process.exit(fail ? 1 : 0);
  })();
})();

// ---------- hand end: results pause, bot reveal, hero show/muck ----------
// Bots always show their hole cards at hand end (practice mode); a folded
// hero sees backs with a Show choice; the banner carries Next-hand controls.
(function () {
  var d = dom.window.document;
  var wb = d.createElement('div');
  wb.id = 'winner-banner'; wb.hidden = true;
  d.body.appendChild(wb);

  function endTable(heroFolded, botFolded) {
    return {
      players: [
        { isHero: true, name: 'You', stack: 1010, bet: 0, folded: heroFolded, sittingOut: false,
          hole: [{ r: 14, s: 0 }, { r: 13, s: 1 }] },
        { isHero: false, name: 'Maniac', archetype: { emoji: '🤪' }, stack: 990, bet: 0,
          folded: botFolded, sittingOut: false, hole: [{ r: 2, s: 2 }, { r: 7, s: 3 }] }
      ],
      community: [{ r: 5, s: 0 }, { r: 9, s: 1 }, { r: 11, s: 2 }], street: 'river',
      acting: -1, button: 0, handOver: true,
      potTotal: function () { return 0; }
    };
  }
  UI.buildSeats(2);

  // Folded bot's cards are revealed face-up at hand end.
  var t = endTable(false, true);
  UI.renderTable(t, { handEnd: true, winners: [0], revealed: {}, button: 0 });
  var botCards = d.querySelectorAll('#seat-1 .pcards .card');
  ok(botCards.length === 2, 'folded bot shows 2 cards at hand end');
  ok(!!botCards[0].querySelector('.crank'), 'folded bot cards are face-up');

  // Folded hero sees backs until Show.
  t = endTable(true, true);
  UI.renderTable(t, { handEnd: true, winners: [1], revealed: {}, button: 0 });
  var heroCards = d.querySelectorAll('#seat-0 .pcards .card');
  ok(heroCards.length === 2, 'folded hero shows 2 cards at hand end');
  ok(!heroCards[0].querySelector('.crank'), 'folded hero cards are face-down (mucked)');
  UI.renderTable(t, { handEnd: true, winners: [1], revealed: {}, button: 0, heroShow: true });
  heroCards = d.querySelectorAll('#seat-0 .pcards .card');
  ok(!!heroCards[0].querySelector('.crank'), 'hero cards flip face-up after Show');

  // Mid-hand behavior unchanged: folded cards stay hidden.
  UI.renderTable(t, { winners: [], revealed: {}, button: 0 });
  ok(d.querySelectorAll('#seat-0 .pcards .card').length === 0, 'folded hero cards hidden mid-hand');
  ok(d.querySelectorAll('#seat-1 .pcards .card').length === 0, 'folded bot cards hidden mid-hand');

  // Hand-end controls: Next button + countdown + Show button.
  var nextFired = false, showFired = false;
  UI.winnerBanner('<div class="wtitle">x</div>');
  UI.showHandEndControls({
    autoMs: 60000,
    onNext: function () { nextFired = true; },
    onShowHero: function () { showFired = true; }
  });
  ok(!!d.getElementById('btn-next-hand'), 'Next hand button rendered');
  ok(!!d.getElementById('btn-show-hero'), 'Show my hand button rendered');
  ok(d.getElementById('handend-row').textContent.indexOf('auto-dealing') !== -1, 'countdown shown');
  d.getElementById('btn-show-hero').click();
  ok(showFired, 'Show button fires onShowHero');
  d.getElementById('btn-next-hand').click();
  ok(nextFired, 'Next button fires onNext');
  ok(!d.getElementById('handend-row'), 'controls removed after Next');
  UI.hideHandEndControls();
  d.body.removeChild(wb);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed (component)');

// ---------- handWinAmount: banner shows the pot won, never the stack ----------
(function () {
  // Simple win-by-fold: hero takes the whole pot.
  ok(UI.handWinAmount({ pot: 50, winners: [{ idx: 0, amount: 50, byFold: true }] }) === 50,
    'win-by-fold amounts to the pot');
  // Showdown, hero wins main pot only; side pot goes to a bot.
  ok(UI.handWinAmount({ pot: 450, winners: [
    { potIndex: 0, amount: 50, winners: [0], each: 50 },
    { potIndex: 1, amount: 400, winners: [2], each: 400 }
  ] }) === 50, 'side-pot win counts only the hero\'s pot');
  // Split pot.
  ok(UI.handWinAmount({ pot: 100, winners: [
    { potIndex: 0, amount: 100, winners: [0, 1], each: 50 }
  ] }) === 50, 'split pot counts the hero\'s share');
  // Uncalled returns don't inflate winnings; fall back to pot when only takes-back.
  ok(UI.handWinAmount({ pot: 80, winners: [{ idx: 1, amount: 80, byFold: true }] }) === 80,
    'hero loss falls back to pot total');
  ok(UI.handWinAmount({ pot: 0, winners: [] }) === 0, 'empty winners -> 0');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed (component)');

// ---------- firstWinnersTotal: topbar never understates a multi-pot win ----------
(function () {
  // Hero sweeps main + two side pots: total, not just the first entry.
  ok(UI.firstWinnersTotal({ winners: [
    { potIndex: 0, amount: 40, winners: [0], each: 40 },
    { potIndex: 1, amount: 75, winners: [0], each: 75 },
    { potIndex: 2, amount: 570, winners: [0], each: 570 }
  ] }) === 685, 'multi-pot sweep totals to 685');
  // Split pots between different winners: fall back to the first entry.
  ok(UI.firstWinnersTotal({ winners: [
    { potIndex: 0, amount: 50, winners: [0], each: 50 },
    { potIndex: 1, amount: 400, winners: [2], each: 400 }
  ] }) === 50, 'split winners fall back to first entry');
  ok(UI.firstWinnersTotal({ winners: [] }) === 0, 'no winners -> 0');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed (component)');

// ---------- QA follow-ups: uncalled entries, float BB fallback, chip bankroll ----------
(function () {
  // Uncalled "takes back" entries must not break the multi-pot total.
  ok(UI.firstWinnersTotal({ winners: [
    { potIndex: 0, amount: 40, winners: [0], each: 40 },
    { potIndex: 1, amount: 45, winners: [0], each: 45 },
    { potIndex: 2, amount: 1058, winners: [0], each: 1058 },
    { potIndex: 3, amount: 1241, winners: [1], uncalled: true }
  ] }) === 1143, 'uncalled takes-back ignored in winners total');

  // Legacy BB fallback never prints float garbage.
  var d = dom.window.document;
  var wb = d.createElement('div'); wb.id = 'winner-banner'; wb.hidden = true;
  d.body.appendChild(wb);
  // Exercise chipDelta indirectly via a legacy history row.
  mem = {};
  mem['ps_stats_v1'] = JSON.stringify({
    hands: 1, won: 0, profitBB: -13.437999999999999, vpipHands: 1, vpip: 0, pfr: 0,
    postBet: 0, postCall: 0, biggestPotBB: 10, perArchetype: {},
    history: [{ n: 1, hole: [], board: 0, profitBB: -13.437999999999999, won: false, mode: 'cash', result: '' }]
  });
  UI.renderStats();
  var legacy = document.querySelector('#history-list .hist-row .neg');
  ok(legacy && legacy.textContent === '-13.4 bb',
    'legacy BB fallback rounded, got "' + (legacy && legacy.textContent) + '"');
  d.body.removeChild(wb);

  // Bankroll chip shows chips, not bb.
  var bc = d.createElement('div'); bc.id = 'bankroll-chip'; d.body.appendChild(bc);
  UI.setBankroll(1250);
  ok(bc.textContent === '+1,250 session', 'bankroll shows chips, got "' + bc.textContent + '"');
  ok(bc.className.indexOf('pos') !== -1, 'bankroll pos class');
  UI.setBankroll(-340);
  ok(bc.textContent === '-340 session', 'bankroll negative chips, got "' + bc.textContent + '"');
  d.body.removeChild(bc);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed (component)');

// ---------- Roster selection: caps, min, order badges, named-first ----------
(function () {
  var testBots = [
    { id: 'lag', name: 'swimkev', emoji: 'E1', tagline: 't1' },
    { id: 'rohan', name: 'Rohan', emoji: 'E2', tagline: 't2' },
    { id: 'shark', name: 'Shark', emoji: 'E3', tagline: 't3' }
  ];
  var hints = [];
  var sel = new Set(['lag']);
  // Heads-up: max 1 — adding another is refused, removing the last is refused.
  UI.renderRoster(testBots, sel, 1, function (m) { hints.push(m); });
  var cards = document.querySelectorAll('#bot-roster .roster-card');
  ok(cards.length === 3, 'roster renders all bots');
  ok(cards[0].className.indexOf('selected') !== -1, 'swimkev selected');
  ok(cards[0].querySelector('.sel-num').textContent === '1', 'pick-order badge shown');
  cards[1].click(); // try to add Rohan at max 1
  ok(!sel.has('rohan'), 'over-selection refused in heads-up');
  ok(hints.length === 1 && /Heads-up/.test(hints[0]), 'hint explains the cap, got "' + hints[0] + '"');
  cards[0].click(); // try to deselect the only pick
  ok(sel.has('lag'), 'last pick cannot be deselected');
  ok(/at least 1/.test(hints[1]), 'hint explains the minimum');
  // Cash: max 5 — toggle works within bounds.
  UI.renderRoster(testBots, sel, 5, function (m) { hints.push(m); });
  document.querySelectorAll('#bot-roster .roster-card')[1].click();
  ok(sel.has('rohan') && sel.size === 2, 'adding within cap works');
  var badges = Array.prototype.map.call(
    document.querySelectorAll('#bot-roster .roster-card.selected .sel-num'),
    function (el) { return el.textContent; });
  ok(badges.join(',') === '1,2', 'badges follow roster order, got ' + badges.join(','));

  // Named bots come first in the built-in order.
  var ids = global.ARCHETYPES.map(function (a) { return a.id; });
  ok(ids.slice(0, 4).join(',') === 'lag,rohan,amogh,nathan',
    'named bots lead the roster, got ' + ids.slice(0, 4).join(','));
  // Fallback still resolves to the shark by id, not by position.
  ok(bots.getArchetype('nope').id === 'shark', 'unknown id falls back to shark');
  ok(bots.getArchetype('lag').id === 'lag', 'known id resolves');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed (component)');

// ---------- stats: ⓘ popovers explain each stat inline ----------
(function () {
  mem = {};
  UI.renderStats();
  var cards = document.querySelectorAll('#stat-cards .stat-card');
  ok(cards.length === 7, '7 stat cards, got ' + cards.length);
  var withInfo = 0;
  cards.forEach(function (el) {
    var btn = el.querySelector('.stat-info');
    var tip = el.querySelector('.stat-tip');
    if (btn && tip) {
      withInfo++;
      ok(btn.getAttribute('aria-label').indexOf('What does') === 0, 'info button has aria-label');
      // Toggle open.
      btn.click();
      ok(tip.classList.contains('show'), 'tip opens on tap: ' + btn.getAttribute('aria-label'));
      // Toggle closed.
      btn.click();
      ok(!tip.classList.contains('show'), 'tip closes on second tap');
    }
  });
  ok(withInfo === 7, 'every stat card has an ⓘ explainer, got ' + withInfo);
  // Content spot-checks: definitions + formulas.
  var html = document.getElementById('stat-cards').innerHTML;
  ok(html.indexOf('Voluntarily Put money In Pot') !== -1, 'VPIP defined inline');
  ok(html.indexOf('(postflop bets + raises)') !== -1, 'Aggression Factor formula inline');
  ok(html.indexOf('(profit in BB') !== -1, 'bb/100 formula inline');
  ok(html.indexOf('blinds don\'t count') !== -1 || html.indexOf('blinds don&#39;t count') !== -1 ||
     html.indexOf("blinds don't count") !== -1, 'VPIP blinds exclusion noted');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed (component)');

// ---------- seats: rebuy counter + tilt badge ----------
(function () {
  var d = dom.window.document;
  function fakeTable2() {
    return {
      players: [
        { isHero: true, name: 'You', archetype: null, stack: 1000, bet: 0,
          folded: false, sittingOut: false, rebuys: 1, tilt: 0, hole: [] },
        { isHero: false, name: 'Maniac', archetype: { emoji: '🤪' }, stack: 1000, bet: 0,
          folded: false, sittingOut: false, rebuys: 2, tilt: 0.8, hole: [] }
      ],
      community: [], street: 'preflop', acting: -1, button: 0, handOver: true,
      potTotal: function () { return 0; }
    };
  }
  UI.buildSeats(2);
  UI.renderTable(fakeTable2(), { handEnd: true });
  var b0 = d.querySelector('#seat-0 .badges').innerHTML;
  var b1 = d.querySelector('#seat-1 .badges').innerHTML;
  ok(b0.indexOf('×1') !== -1, 'hero rebuy count shown, got "' + b0 + '"');
  ok(b0.indexOf('🌡️') === -1, 'no tilt badge when calm');
  ok(b1.indexOf('×2') !== -1, 'bot rebuy count shown, got "' + b1 + '"');
  ok(b1.indexOf('🌡️') !== -1, 'tilt badge shown when steaming');
  // Calm bot with no rebuys: no badges.
  var t = fakeTable2();
  t.players[1].rebuys = 0; t.players[1].tilt = 0.2;
  UI.renderTable(t, { handEnd: true });
  var b2 = d.querySelector('#seat-1 .badges').innerHTML;
  ok(b2 === '', 'no badges when calm with no rebuys, got "' + b2 + '"');
})();


// ---------- Raise panel defaults to the minimum legal raise ----------
(function () {
  var d = dom.window.document;
  // Build the bet panel DOM the same shape as index.html.
  var panel = d.createElement('div'); panel.id = 'bet-panel'; panel.hidden = true;
  panel.innerHTML =
    '<div class="bet-row"><input id="bet-slider" type="range" min="0" max="100" value="50">' +
    '<span id="bet-amount" class="bet-amount">0</span></div>' +
    '<div class="bet-row quicks">' +
    '<button class="chip-btn" data-frac="0">Min</button>' +
    '<button class="chip-btn" data-frac="0.5">\u00bd Pot</button>' +
    '<button class="chip-btn" data-frac="0.75">\u00be Pot</button>' +
    '<button class="chip-btn" data-frac="1">Pot</button>' +
    '<button class="chip-btn" data-frac="1.5">1.5\u00d7</button></div>' +
    '<div class="bet-row"><button id="btn-bet-confirm">Confirm</button>' +
    '<button id="btn-bet-cancel">Cancel</button></div>';
  d.body.appendChild(panel);

  // Raise: facing a 20 bet with lastRaiseSize 20 -> min raise to 40.
  var got = null;
  UI.openBetPanel(40, 1000, 150, true, function (amt) { got = amt; });
  ok(document.getElementById('bet-amount').textContent === '40',
    'raise panel opens at min raise, got "' + document.getElementById('bet-amount').textContent + '"');
  ok(document.getElementById('bet-slider').value === '0', 'raise slider starts at min position');
  document.getElementById('btn-bet-confirm').click();
  ok(got === 40, 'confirming untouched raise panel bets the min, got ' + got);

  // Opening bet: keeps the 3/4-pot default (pot 200 -> 150).
  got = null;
  UI.openBetPanel(10, 1000, 200, false, function (amt) { got = amt; });
  ok(document.getElementById('bet-amount').textContent === '150',
    'bet panel keeps 3/4-pot default, got "' + document.getElementById('bet-amount').textContent + '"');

  // Min quick button jumps a raise back to the floor.
  var minBtn = panel.querySelector('[data-frac="0"]');
  minBtn.click();
  ok(document.getElementById('bet-amount').textContent === '10',
    'Min button targets the floor, got "' + document.getElementById('bet-amount').textContent + '"');
  d.body.removeChild(panel);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed (component)');

// ---------- In-game history modal + extracted story HTML ----------
(function () {
  var d = dom.window.document;
  // Modal shell like index.html.
  var ov = d.createElement('div'); ov.id = 'hands-modal'; ov.hidden = true;
  ov.innerHTML = '<div class="modal-panel"><div class="modal-head">' +
    '<div class="modal-title">History</div>' +
    '<button id="hands-modal-close" class="ghost">Close</button></div>' +
    '<div id="hands-modal-list" class="modal-list"></div></div>';
  d.body.appendChild(ov);

  var rec = {
    id: 'r1', handNo: 7, date: Date.now(), mode: 'cash', sb: 5, bb: 10,
    heroHole: [{ r: 'A', s: 's' }, { r: 'K', s: 's' }],
    heroNet: 250, heroNetBB: 25,
    timeline: [
      { t: 'street', street: 'preflop', pot: 15 },
      { t: 'action', action: 'raises', street: 'preflop', amount: 30, pot: 45 },
      { t: 'street', street: 'flop', community: [{ r: 'Q', s: 's' }, { r: 'J', s: 'h' }, { r: '2', s: 'd' }], pot: 60 },
      { t: 'end', winners: [{ names: ['You'], amount: 250, hand: 'Pair of Aces' }] }
    ]
  };
  UI.openHandsModal([rec]);
  ok(ov.hidden === false, 'modal opens');
  var rows = ov.querySelectorAll('#hands-modal-list .hrow');
  ok(rows.length === 1, 'one hand row rendered');
  ok(rows[0].textContent.indexOf('Hand #7') !== -1, 'row shows hand number');
  ok(rows[0].textContent.indexOf('+250') !== -1, 'row shows chip net');
  // Expand the story inline.
  rows[0].click();
  var story = rows[0].querySelector('.hm-story');
  ok(story.hidden === false, 'story expands on tap');
  ok(story.innerHTML.indexOf('Pre-flop') !== -1, 'story has preflop section');
  ok(story.innerHTML.indexOf('Pair of Aces') !== -1, 'story shows result');
  // Second tap collapses.
  rows[0].click();
  ok(story.hidden === true, 'story collapses on second tap');
  UI.closeHandsModal();
  ok(ov.hidden === true, 'modal closes');
  d.body.removeChild(ov);

  // Empty state.
  var ov2 = d.createElement('div'); ov2.id = 'hands-modal'; ov2.hidden = true;
  ov2.innerHTML = '<div id="hands-modal-list"></div>';
  d.body.appendChild(ov2);
  UI.openHandsModal([]);
  ok(ov2.querySelector('#hands-modal-list').textContent.indexOf('No saved hands') !== -1,
    'modal shows empty state');
  d.body.removeChild(ov2);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed (component)');

console.log('\n' + pass + ' passed, ' + fail + ' failed (component)');

// ---------- Feedback modal: opens, selects type, builds GitHub issue URL ----------
(function () {
  var d = dom.window.document;
  d.body.innerHTML =
    '<div id="feedback-modal" class="modal-overlay" hidden>' +
    '<div class="modal-panel"><div class="modal-head">' +
    '<button id="feedback-modal-close" class="ghost">x</button></div>' +
    '<div class="modal-list fb-form">' +
    '<div class="fb-types">' +
    '<button class="chip-btn fb-type" data-fbtype="bug">Bug</button>' +
    '<button class="chip-btn fb-type" data-fbtype="idea">Idea</button>' +
    '<button class="chip-btn fb-type" data-fbtype="general">General</button>' +
    '</div>' +
    '<input id="fb-title" maxlength="120">' +
    '<textarea id="fb-body" rows="5"></textarea>' +
    '<button id="fb-submit" class="primary">Open</button>' +
    '</div></div></div>';
  var opened = null;
  dom.window.open = function (url) { opened = url; };
  UI.openFeedbackModal();
  var ov = d.getElementById('feedback-modal');
  ok(ov.hidden === false, 'feedback modal opens');
  ok(ov.querySelector('.fb-type[data-fbtype="general"]').classList.contains('sel'), 'general selected by default');
  // Pick bug type.
  ov.querySelector('.fb-type[data-fbtype="bug"]').click();
  ok(ov.querySelector('.fb-type[data-fbtype="bug"]').classList.contains('sel'), 'bug type selects');
  // Empty title: submit does nothing.
  UI.submitFeedback();
  ok(opened === null, 'empty title does not open an issue');
  // Fill and submit.
  d.getElementById('fb-title').value = 'Raise slider jumps';
  d.getElementById('fb-body').value = 'On mobile the slider jumps.';
  UI.submitFeedback();
  ok(opened !== null && opened.indexOf('https://github.com/swimkevin/poker-sparring/issues/new?title=') === 0, 'opens GitHub new-issue URL');
  ok(opened.indexOf(encodeURIComponent('[Bug] Raise slider jumps')) !== -1, 'title carries [Bug] prefix');
  ok(opened.indexOf(encodeURIComponent('On mobile the slider jumps.')) !== -1, 'body text included');
  ok(opened.indexOf('App%20version') !== -1, 'version metadata appended');
  ok(ov.hidden === true, 'modal closes after submit');
  UI.openFeedbackModal();
  UI.closeFeedbackModal();
  ok(d.getElementById('feedback-modal').hidden === true, 'modal closes via close fn');
})();
