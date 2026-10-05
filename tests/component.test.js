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
    vals[el.querySelector('.sk').textContent] = el.querySelector('.sv').textContent;
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
    vals2[el.querySelector('.sk').textContent] = el.querySelector('.sv').textContent;
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
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed (component)');
process.exit(fail ? 1 : 0);
