// Kevin's screenshot hand (2026-11-02): hero on the button, 4d 9c, turn board
// 7d 4c Qd 4s, pot 355, stacks ~935, 5 players still in, nothing to call.
// The old coach said "All-in (935)" — a 263% pot shove that folds every worse
// hand and only gets called by better. This test drives the real coachVerdict
// on a real PokerTable set to that exact state and requires a value bet,
// never an all-in. Iterations 1, 4 and 10 of the 2026-11-02 coach program.
'use strict';
var path = require('path');
var fs = require('fs');
var jsdom = require('jsdom');
var JSDOM = jsdom.JSDOM;
var dir = path.join(__dirname, '..');
var dom = new JSDOM(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'),
  { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
var w = dom.window, d = w.document;
w.scrollTo = function () {};
w.confirm = function () { return true; };
w.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: function () { return function () {}; }, set: function () { return true; } });
};
['cards', 'evaluator', 'equity', 'engine', 'bots', 'names', 'pushfold', 'stats',
 'replay', 'room-server', 'netplay', 'ui', 'online', 'app'].forEach(function (f) {
  var s = d.createElement('script');
  s.textContent = fs.readFileSync(path.join(dir, 'js', f + '.js'), 'utf8');
  d.head.appendChild(s);
});
d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

function buildShotTable() {
  var s = d.createElement('script');
  s.textContent = [
    'window.__shotTable = new PokerTable({ players: [',
    '  { name: "hero", isHero: true }, { name: "A" }, { name: "B" },',
    '  { name: "C" }, { name: "D" }, { name: "E" }, { name: "F" }, { name: "G" }',
    '], sb: 5, bb: 10, startingStack: 935 });',
    'var t = window.__shotTable;',
    't.button = 0; t.street = "turn"; t.currentBet = 0; t.pot = 355;',
    't.players[0].hole = [{ r: 4, s: 1 }, { r: 9, s: 0 }];',
    't.community = [{ r: 7, s: 1 }, { r: 4, s: 0 }, { r: 12, s: 1 }, { r: 4, s: 3 }];',
    't.players[1].stack = 990; t.players[2].stack = 935;',
    't.players[3].stack = 935; t.players[4].stack = 935;',
    't.players[5].folded = true; t.players[6].folded = true; t.players[7].folded = true;'
  ].join('\n');
  d.head.appendChild(s);
  return w.__shotTable;
}

function strip(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildLowSprTable() {
  var s = d.createElement('script');
  s.textContent = [
    'window.__lowTable = new PokerTable({ players: [',
    '  { name: "hero", isHero: true }, { name: "A" },',
    '  { name: "E" }, { name: "F" }, { name: "G" }, { name: "H" }, { name: "I" }, { name: "J" }',
    '], sb: 5, bb: 10, startingStack: 400 });',
    'var t = window.__lowTable;',
    't.button = 0; t.street = "turn"; t.currentBet = 0; t.pot = 500;',
    't.players[0].hole = [{ r: 13, s: 1 }, { r: 13, s: 0 }];',
    't.community = [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }];',
    't.players[1].stack = 400;',
    'for (var i = 2; i < 8; i++) t.players[i].folded = true;'
  ].join('\n');
  d.head.appendChild(s);
  return w.__lowTable;
}

setTimeout(function () {
  var fails = 0;
  function ok(c, m) { console.log((c ? 'ok' : 'FAIL') + ': ' + m); if (!c) fails++; }
  var H = w.__coachTestHooks;
  ok(!!H && typeof H.setTable === 'function', 'setTable hook exposed');
  var t = buildShotTable();
  ok(t.livePlayers().length === 5, 'screenshot state is 5-way (got ' + t.livePlayers().length + ')');
  ok(t.potTotal() === 355, 'screenshot pot is 355 (got ' + t.potTotal() + ')');
  H.setTable(t);
  H.setHandRec(null);
  H.setDecisions([]);
  var v = w.coachVerdict();
  var txt = strip(v.html);
  console.log('  coach says: ' + txt.slice(0, 220));
  ok(!v.error, 'coach verdict has no error' + (v.error ? ' (' + v.error + ')' : ''));
  ok(v.advice === 'bet', 'screenshot hand advice is bet (got ' + v.advice + ')');
  ok(txt.indexOf('Bet for value') !== -1, 'screenshot advice is a value bet, not a shove');
  ok(txt.indexOf('All-in') === -1, 'screenshot advice never says All-in');
  var m = /pot \(([\d,]+)\)/.exec(txt);
  var size = m ? parseInt(m[1].replace(/,/g, ''), 10) : -1;
  ok(size > 0 && size <= 355, 'screenshot bet size is within the pot (got ' + size + ')');
  ok(size < 935, 'screenshot bet size is far below the full stack (got ' + size + ')');
  ok(txt.indexOf('committed') === -1, 'screenshot message never says committed (v1.8.136 wording)');
  var low = buildLowSprTable();
  ok(low.livePlayers().length === 2, 'low-SPR spot is heads-up (got ' + low.livePlayers().length + ')');
  H.setTable(low);
  H.setHandRec(null);
  H.setDecisions([]);
  var vLow = w.coachVerdict();
  var txtLow = strip(vLow.html);
  console.log('  low-SPR coach says: ' + txtLow.slice(0, 200));
  ok(vLow.advice === 'bet', 'low-SPR advice is bet (got ' + vLow.advice + ')');
  ok(txtLow.indexOf('All-in') !== -1, 'low-SPR spot still shoves (SPR 0.8 is genuinely committed)');
  ok(txtLow.indexOf('already as big as your stack') !== -1, 'low-SPR shove uses the new plain wording');
  ok(txtLow.indexOf('committed') === -1, 'low-SPR shove never says committed (v1.8.136 wording)');
  function C(r, s) { return { r: r, s: s }; }
  ok(H.handClass([C(4, 1), C(9, 0)], [C(7, 1), C(4, 0), C(12, 1), C(4, 3)]) === 'trips',
    'screenshot trips hand class is trips, not overpair (v1.8.137)');
  ok(H.handClass([C(12, 1), C(7, 0)], [C(12, 2), C(7, 1), C(2, 0)]) === 'twopair',
    'two-pair hand class is twopair, not overpair (v1.8.137)');
  ok(H.handClass([C(4, 0), C(4, 1)], [C(4, 2), C(12, 1), C(7, 0)]) === 'trips',
    'pocket-pair set class is trips too (v1.8.137)');
  ok(H.handClass([C(13, 1), C(13, 0)], [C(12, 2), C(7, 1), C(2, 0), C(5, 3)]) === 'overpair',
    'pocket pair above the board stays overpair (v1.8.137)');
  ok(txt.indexOf('full house beats it') !== -1,
    'paired-board trips message names what beats it (v1.8.137)');
  console.log(fails === 0 ? 'COACH SCREENSHOT TEST PASSED' : 'COACH SCREENSHOT TEST FAILED (' + fails + ')');
  process.exit(fails ? 1 : 0);
}, 800);
