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
  ok(size >= 230 && size <= 245,
    'screenshot size is ~2/3 pot: the paired-board protection floor lifts the 1/2-pot geometric size (got ' + size + ', v1.8.142)');
  ok(txt.indexOf('next street') !== -1,
    'screenshot geometric message explains the next-street plan (v1.8.138)');
  ok(txt.indexOf('Pot 355, bet 238') !== -1,
    'screenshot value message shows pot and bet size in plain words (v1.8.143)');
  ok(txt.indexOf('shove would fold') !== -1,
    'screenshot value message explains why not to shove (v1.8.143)');
  var dryBoard2 = [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }];
  var smallVal = valueVerdict([{ r: 13, s: 1 }, { r: 13, s: 0 }], dryBoard2, 400, 2000, 2);
  console.log('  small value coach says: ' + smallVal.txt.slice(0, 220));
  ok(smallVal.v.advice === 'bet' && smallVal.size === 100,
    'small dry value spot still bets 1/4 pot (got ' + smallVal.v.advice + ' ' + smallVal.size + ', v1.8.143)');
  ok(smallVal.txt.indexOf('Pot 400, bet 100') !== -1,
    'small value message shows pot and bet size in plain words (v1.8.143)');
  ok(smallVal.txt.indexOf('Small enough that worse hands still call') !== -1,
    'small value message explains why not to bet bigger (v1.8.143)');
  ok(typeof H.geometricFrac === 'function', 'geometricFrac hook exposed (v1.8.138)');
  function buildMultiwayTable(heroHole, villainArchId) {
    var s = d.createElement('script');
    var arch = villainArchId
      ? 'ARCHETYPES.filter(function (a) { return a.id === "' + villainArchId + '"; })[0]'
      : 'null';
    s.textContent = [
      'window.__mwTable = new PokerTable({ players: [',
      '  { name: "hero", isHero: true }, { name: "V", archetype: ' + arch + ' },',
      '  { name: "B" }, { name: "C" },',
      '  { name: "E" }, { name: "F" }, { name: "G" }, { name: "H" }',
      '], sb: 5, bb: 10, startingStack: 2000 });',
      'var t = window.__mwTable;',
      't.button = 0; t.street = "turn"; t.currentBet = 0; t.pot = 400;',
      't.players[0].hole = ' + JSON.stringify(heroHole) + ';',
      't.community = [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }];',
      'for (var i = 4; i < 8; i++) t.players[i].folded = true;'
    ].join('\n');
    d.head.appendChild(s);
    return w.__mwTable;
  }
  var mw = buildMultiwayTable([{ r: 13, s: 1 }, { r: 13, s: 0 }], null);
  ok(mw.livePlayers().length === 4, 'multiway value spot is 4-way (got ' + mw.livePlayers().length + ')');
  H.setTable(mw);
  H.setHandRec(null);
  H.setDecisions([]);
  var vMw = w.coachVerdict();
  var txtMw = strip(vMw.html);
  console.log('  multiway value coach says: ' + txtMw.slice(0, 200));
  var mMw = /pot \(([\d,]+)\)/.exec(txtMw);
  var sizeMw = mMw ? parseInt(mMw[1].replace(/,/g, ''), 10) : -1;
  ok(vMw.advice === 'bet', 'multiway value advice is bet (got ' + vMw.advice + ')');
  ok(sizeMw === 200, 'multiway value floor lifts dry 1/4 pot to 1/2 pot (got ' + sizeMw + ', v1.8.139)');
  ok(txtMw.indexOf('more callers means more value') !== -1,
    'multiway value message explains the floor (v1.8.139)');
  var air = buildMultiwayTable([{ r: 9, s: 0 }, { r: 3, s: 1 }], 'rock');
  H.setTable(air);
  H.setHandRec(null);
  H.setDecisions([]);
  var vAir = w.coachVerdict();
  var txtAir = strip(vAir.html);
  console.log('  multiway air coach says: ' + txtAir.slice(0, 200));
  ok(vAir.advice === 'check', 'multiway air advice is check, never a bluff (got ' + vAir.advice + ', v1.8.139)');
  ok(txtAir.indexOf('too many players to bluff through') !== -1,
    'multiway air message names the multiway bluff ban (v1.8.139)');
  function buildValueSpot(heroHole, board, potAmt, heroStack, nLive, street) {
    var s = d.createElement('script');
    s.textContent = [
      'window.__vsTable = new PokerTable({ players: [',
      '  { name: "hero", isHero: true }, { name: "V" },',
      '  { name: "B" }, { name: "C" },',
      '  { name: "E" }, { name: "F" }, { name: "G" }, { name: "H" }',
      '], sb: 5, bb: 10, startingStack: 2000 });',
      'var t = window.__vsTable;',
      't.button = 0; t.street = "' + (street || 'turn') + '"; t.currentBet = 0; t.pot = ' + potAmt + ';',
      't.players[0].hole = ' + JSON.stringify(heroHole) + ';',
      't.players[0].stack = ' + heroStack + ';',
      't.community = ' + JSON.stringify(board) + ';',
      'for (var i = ' + nLive + '; i < 8; i++) t.players[i].folded = true;'
    ].join('\n');
    d.head.appendChild(s);
    return w.__vsTable;
  }
  function valueVerdict(heroHole, board, potAmt, heroStack, nLive, street) {
    H.setTable(buildValueSpot(heroHole, board, potAmt, heroStack, nLive, street));
    H.setHandRec(null);
    H.setDecisions([]);
    var v = w.coachVerdict();
    var tx = strip(v.html);
    var m = /pot \(([\d,]+)\)/.exec(tx);
    return { v: v, txt: tx, size: m ? parseInt(m[1].replace(/,/g, ''), 10) : -1 };
  }
  var pairedDry = [{ r: 7, s: 1 }, { r: 4, s: 0 }, { r: 12, s: 1 }, { r: 4, s: 3 }];
  var tripsDry = valueVerdict([{ r: 4, s: 1 }, { r: 9, s: 0 }], pairedDry, 400, 2000, 2);
  console.log('  trips paired-dry coach says: ' + tripsDry.txt.slice(0, 220));
  ok(tripsDry.v.advice === 'bet', 'trips paired-dry advice is bet (got ' + tripsDry.v.advice + ')');
  ok(tripsDry.size === 268, 'trips paired-dry protection floor bets 2/3 pot, not 1/4 (got ' + tripsDry.size + ', v1.8.142)');
  ok(tripsDry.txt.indexOf('slow down') !== -1,
    'trips paired-dry message gives the fold-to-a-raise plan (v1.8.142)');
  var twoPairBoard = [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 7, s: 3 }, { r: 2, s: 0 }];
  var twoPair = valueVerdict([{ r: 12, s: 0 }, { r: 2, s: 1 }], twoPairBoard, 400, 2000, 2);
  console.log('  twopair paired coach says: ' + twoPair.txt.slice(0, 220));
  ok(twoPair.v.advice === 'bet', 'twopair paired advice is bet (got ' + twoPair.v.advice + ')');
  ok(twoPair.size === 268, 'twopair paired protection floor bets 2/3 pot (got ' + twoPair.size + ', v1.8.142)');
  ok(twoPair.txt.indexOf('full house beats it') !== -1,
    'twopair paired message names the full-house danger (v1.8.142)');
  ok(twoPair.txt.indexOf('slow down') !== -1,
    'twopair paired message gives the fold-to-a-raise plan (v1.8.142)');
  var toneTable = buildValueSpot([{ r: 4, s: 1 }, { r: 9, s: 0 }], pairedDry, 342, 2000, 4, 'turn');
  H.setTable(toneTable);
  H.setHandRec(null);
  H.setDecisions([{ street: 'preflop', advice: 'fold', strength: 'strong', lesson: 'x', action: 'fold', followed: true }]);
  var vTone = w.coachVerdict();
  var txtTone = strip(vTone.html);
  var msgTone = strip(vTone.msg);
  console.log('  multiway paired-board tone spot says: ' + txtTone.slice(0, 220));
  ok(vTone.advice === 'bet', 'multiway paired-board tone spot advice is bet (got ' + vTone.advice + ')');
  ok(msgTone.length <= 400, 'multiway paired-board value message fits the tone budget (got ' + msgTone.length + ' chars, v1.8.161)');
  ok(txtTone.length < 500, 'full multiway paired-board panel stays under the eval 500-char tone limit (got ' + txtTone.length + ', v1.8.161)');
  var dryRiver = [{ r: 2, s: 0 }, { r: 5, s: 1 }, { r: 8, s: 2 }, { r: 11, s: 3 }, { r: 13, s: 0 }];
  var riverDry = valueVerdict([{ r: 14, s: 2 }, { r: 14, s: 3 }], dryRiver, 400, 2000, 2, 'river');
  console.log('  river dry value says: ' + riverDry.txt.slice(0, 220));
  ok(riverDry.v.advice === 'bet', 'river dry value advice is bet (got ' + riverDry.v.advice + ')');
  ok(riverDry.size === 200, 'river dry value bets 1/2 pot, not 1/4 — no draws left to price (got ' + riverDry.size + ', v1.8.153)');
  ok(riverDry.txt.indexOf('last street') !== -1,
    'river dry value message names the last street (v1.8.153)');
  var wetRiver = [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 2 }, { r: 5, s: 3 }, { r: 9, s: 1 }];
  var riverWet = valueVerdict([{ r: 13, s: 1 }, { r: 13, s: 0 }], wetRiver, 400, 2000, 2, 'river');
  console.log('  river wet value says: ' + riverWet.txt.slice(0, 200));
  ok(riverWet.size === 268, 'river wet value keeps 2/3 pot (got ' + riverWet.size + ', v1.8.153)');
  var flushBoard = [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 2 }, { r: 5, s: 3 }];
  var overFlush = valueVerdict([{ r: 13, s: 1 }, { r: 13, s: 0 }], flushBoard, 400, 2000, 2);
  console.log('  overpair flush-board coach says: ' + overFlush.txt.slice(0, 220));
  ok(overFlush.txt.indexOf('flush beats you') !== -1,
    'overpair flush-board message names the flush danger (v1.8.142)');
  ok(overFlush.txt.indexOf('slow down') !== -1,
    'overpair flush-board message gives the fold-to-a-raise plan (v1.8.142)');
  ok(typeof H.boardVulnerability === 'function', 'boardVulnerability hook exposed (v1.8.142)');
  if (typeof H.boardVulnerability === 'function') {
    var bv1 = H.boardVulnerability(pairedDry);
    ok(bv1.paired && !bv1.flush && !bv1.straight, 'paired-dry board flags paired only');
    var bv2 = H.boardVulnerability(flushBoard);
    ok(bv2.flush && !bv2.paired, '3-flush board flags flush');
    var bv3 = H.boardVulnerability([{ r: 12, s: 2 }, { r: 11, s: 1 }, { r: 10, s: 0 }, { r: 9, s: 3 }]);
    ok(bv3.straight && !bv3.paired && !bv3.flush, '4-straight board flags straight only');
    var bv4 = H.boardVulnerability([{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }]);
    ok(!bv4.paired && !bv4.flush && !bv4.straight, 'dry rainbow board flags nothing');
  }
  if (typeof H.geometricFrac === 'function') {
    var g1 = H.geometricFrac(2.63, 1);
    ok(Math.abs(g1 - 0.543) < 0.01, 'geometric turn SPR 2.63 -> ~0.54 (got ' + g1 + ')');
    var g2 = H.geometricFrac(3, 2);
    ok(Math.abs(g2 - 0.2) < 0.01, 'geometric flop SPR 3 -> ~0.2 (got ' + g2 + ')');
    ok(H.geometricFrac(1.5, 1) === null, 'geometric null below SPR 2');
    ok(H.geometricFrac(5, 1) === null, 'geometric null above SPR 4');
    ok(H.geometricFrac(3, 0) === null, 'geometric null on river');
  }
  function buildSweepSpot(heroHole, board, street, potAmt, heroStack, nLive) {
    var s = d.createElement('script');
    s.textContent = [
      'window.__swTable = new PokerTable({ players: [',
      '  { name: "hero", isHero: true }, { name: "V" },',
      '  { name: "B" }, { name: "C" },',
      '  { name: "E" }, { name: "F" }, { name: "G" }, { name: "H" }',
      '], sb: 5, bb: 10, startingStack: 3000 });',
      'var t = window.__swTable;',
      't.button = 0; t.street = "' + street + '"; t.currentBet = 0; t.pot = ' + potAmt + ';',
      't.players[0].hole = ' + JSON.stringify(heroHole) + ';',
      't.players[0].stack = ' + heroStack + ';',
      't.players[1].stack = ' + heroStack + ';',
      't.community = ' + JSON.stringify(board) + ';',
      'for (var i = ' + nLive + '; i < 8; i++) t.players[i].folded = true;'
    ].join('\n');
    d.head.appendChild(s);
    return w.__swTable;
  }
  var sweepHands = [
    ['nut', [{ r: 4, s: 1 }, { r: 4, s: 2 }],
      [{ r: 4, s: 0 }, { r: 4, s: 3 }, { r: 12, s: 1 }, { r: 7, s: 0 }],
      [{ r: 4, s: 0 }, { r: 4, s: 3 }, { r: 12, s: 1 }, { r: 7, s: 0 }, { r: 9, s: 1 }]],
    ['overpair', [{ r: 13, s: 1 }, { r: 13, s: 0 }],
      [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }],
      [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }, { r: 9, s: 1 }]],
    ['toppair', [{ r: 12, s: 1 }, { r: 13, s: 0 }],
      [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }],
      [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }, { r: 9, s: 1 }]],
    ['trips', [{ r: 4, s: 1 }, { r: 9, s: 0 }],
      [{ r: 7, s: 1 }, { r: 4, s: 0 }, { r: 12, s: 1 }, { r: 4, s: 3 }],
      [{ r: 7, s: 1 }, { r: 4, s: 0 }, { r: 12, s: 1 }, { r: 4, s: 3 }, { r: 9, s: 2 }]],
    ['twopair', [{ r: 12, s: 0 }, { r: 2, s: 1 }],
      [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 7, s: 3 }, { r: 2, s: 0 }],
      [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 7, s: 3 }, { r: 2, s: 0 }, { r: 9, s: 1 }]],
    ['secondpair', [{ r: 7, s: 0 }, { r: 13, s: 1 }],
      [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }],
      [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }, { r: 9, s: 1 }]],
    ['draw', [{ r: 13, s: 2 }, { r: 6, s: 2 }],
      [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 0 }, { r: 5, s: 3 }],
      [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 0 }, { r: 5, s: 3 }, { r: 10, s: 0 }]],
    ['draw-strong', [{ r: 8, s: 2 }, { r: 6, s: 2 }],
      [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 0 }, { r: 5, s: 3 }],
      [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 0 }, { r: 5, s: 3 }, { r: 10, s: 0 }]],
    ['air', [{ r: 9, s: 0 }, { r: 3, s: 1 }],
      [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }],
      [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }, { r: 10, s: 0 }]]
  ];
  var sweepStacks = [200, 600, 1052, 2000];
  var sweepViolations = [];
  var sweepCount = 0;
  sweepHands.forEach(function (sh) {
    ['turn', 'river'].forEach(function (street) {
      var board = street === 'turn' ? sh[2] : sh[3];
      var hc = H.handClass(sh[1], board);
      sweepStacks.forEach(function (stk) {
        [2, 4].forEach(function (nLive) {
          H.setTable(buildSweepSpot(sh[1], board, street, 400, stk, nLive));
          H.setHandRec(null);
          H.setDecisions([]);
          var sv = w.coachVerdict();
          sweepCount++;
          if (sv.error) { sweepViolations.push(sh[0] + ' ' + street + ' stack ' + stk + ' live ' + nLive + ': error ' + sv.error); return; }
          if (sv.advice !== 'bet') return;
          var stx = strip(sv.html);
          var sm = /pot \(([\d,]+)\)/.exec(stx) || /All-in \(([\d,]+)\)/.exec(stx);
          if (!sm) { sweepViolations.push(sh[0] + ' ' + street + ' stack ' + stk + ' live ' + nLive + ': bet with no parsable size'); return; }
          var ratio = parseInt(sm[1].replace(/,/g, ''), 10) / 400;
          var sprV = stk / 400;
          var allowed = ratio <= 1.5 || sprV <= 1.05 || (street === 'river' && hc === 'nut') || stk <= 200;
          if (!allowed) sweepViolations.push(sh[0] + ' ' + street + ' stack ' + stk + ' live ' + nLive + ': bet ratio ' + ratio.toFixed(2) + 'x pot (hc ' + hc + ')');
        });
      });
    });
  });
  console.log('  guardrail sweep: ' + sweepCount + ' spots, violations: ' + sweepViolations.length +
    (sweepViolations.length ? ' — ' + sweepViolations.slice(0, 5).join(' | ') : ''));
  ok(sweepCount === 144, 'guardrail sweep covers 144 spots (got ' + sweepCount + ', v1.8.144)');
  ok(sweepViolations.length === 0,
    'guardrail sweep finds no bet above 1.5x pot outside short-SPR, river-nut, and short-stack spots (v1.8.144)');

  console.log(fails === 0 ? 'COACH SCREENSHOT TEST PASSED' : 'COACH SCREENSHOT TEST FAILED (' + fails + ')');
  process.exit(fails ? 1 : 0);
}, 800);
