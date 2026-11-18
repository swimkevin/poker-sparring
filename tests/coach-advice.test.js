// Coach advice unit tests (2026-10-08): deterministic checks for the post-hand
// recap builder and the range-narrowing helper, booted in jsdom with the
// real app. The 10-hand eval (tests/coach-eval.js) covers end-to-end behavior.
var path = require('path');
var fs = require('fs');
var jsdom = require('jsdom');
var JSDOM = jsdom.JSDOM;

var dir = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
var dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
var w = dom.window;
var d = w.document;
w.scrollTo = function () {};
w.confirm = function () { return true; };
w.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: function () { return function () {}; }, set: function () { return true; } });
};
var errors = [];
w.addEventListener('error', function (e) { errors.push(e.message || String(e.error)); });

['cards', 'evaluator', 'equity', 'engine', 'bots', 'names', 'pushfold', 'stats',
 'replay', 'room-server', 'netplay', 'ui', 'online', 'app']
  .forEach(function (f) {
    var s = d.createElement('script');
    s.textContent = fs.readFileSync(path.join(dir, 'js', f + '.js'), 'utf8');
    d.head.appendChild(s);
  });
d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}

function stripAdvice(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function preflopVerdict(hero, villainId, open, timeline, liveCount, bet1, bet2, heroStack, villainStack, button, heroBet) {
  var btn = button == null ? 0 : button;
  var s = d.createElement('script');
  var arch = villainId
    ? 'ARCHETYPES.filter(function (a) { return a.id === "' + villainId + '"; })[0]'
    : 'null';
  s.textContent = [
    'window.__pfTable = new PokerTable({ players: [',
    '  { name: "hero", isHero: true }, { name: "V", archetype: ' + arch + ' }, { name: "S" },',
    '  { name: "B" }, { name: "E" }, { name: "F" }, { name: "G" }, { name: "H" }',
    '], sb: 5, bb: 10, startingStack: 2000 });',
    'var t = window.__pfTable;',
    't.button = ' + btn + '; t.street = "preflop"; t.currentBet = ' + open + '; t.pot = 0; t.sbIdx = ' + ((btn + 1) % 8) + '; t.bbIdx = ' + ((btn + 2) % 8) + ';',
    't.players[0].hole = ' + JSON.stringify(hero) + ';',
    't.players[0].stack = ' + (heroStack == null ? 2000 : heroStack) + '; t.players[0].bet = ' + (heroBet == null ? 0 : heroBet) + ';',
    't.players[1].stack = ' + (villainStack == null ? 2000 : villainStack) + '; t.players[1].bet = ' + bet1 + ';',
    't.players[2].stack = 2000; t.players[2].bet = ' + bet2 + ';',
    't.community = [];',
    'for (var i = ' + liveCount + '; i < 8; i++) t.players[i].folded = true;'
  ].join('\n');
  d.head.appendChild(s);
  var t = w.__pfTable;
  w.__coachTestHooks.setTable(t);
  w.__coachTestHooks.setHandRec({ timeline: timeline });
  w.__coachTestHooks.setDecisions([]);
  return w.coachVerdict();
}

function postflopVerdict(hero, villainId, street, currentBet, pot, board, heroStack, villainStack, timeline, liveCount, button) {
  var btn = button == null ? 0 : button;
  var s = d.createElement('script');
  var arch = villainId
    ? 'ARCHETYPES.filter(function (a) { return a.id === "' + villainId + '"; })[0]'
    : 'null';
  s.textContent = [
    'window.__pfTable = new PokerTable({ players: [',
    '  { name: "hero", isHero: true }, { name: "V", archetype: ' + arch + ' }, { name: "S" },',
    '  { name: "B" }, { name: "E" }, { name: "F" }, { name: "G" }, { name: "H" }',
    '], sb: 5, bb: 10, startingStack: 3000 });',
    'var t = window.__pfTable;',
    't.button = ' + btn + '; t.street = "' + street + '"; t.currentBet = ' + currentBet + '; t.pot = ' + pot + ';',
    't.players[0].hole = ' + JSON.stringify(hero) + ';',
    't.players[0].stack = ' + heroStack + '; t.players[0].bet = 0;',
    't.players[1].stack = ' + villainStack + '; t.players[1].bet = ' + currentBet + ';',
    't.community = ' + JSON.stringify(board) + ';',
    'for (var i = ' + liveCount + '; i < 8; i++) t.players[i].folded = true;'
  ].join('\n');
  d.head.appendChild(s);
  var t = w.__pfTable;
  w.__coachTestHooks.setTable(t);
  w.__coachTestHooks.setHandRec({ timeline: timeline || [] });
  w.__coachTestHooks.setDecisions([]);
  return w.coachVerdict();
}

setTimeout(function () {
  try {
    var H = w.__coachTestHooks;
    ok(!!H, 'coach test hooks exposed');

    // ---- recap builder ----
    H.setDecisions([
      { street: 'preflop', advice: 'raise', strength: 'strong', lesson: 'Raise premiums first-in.',
        action: 'raise', followed: true },
      { street: 'flop', advice: 'fold', strength: 'strong', lesson: 'Folding when the price is wrong saves money.',
        action: 'call', followed: false },
      { street: 'turn', advice: 'call', strength: 'marginal', lesson: 'x',
        action: 'call', followed: true }
    ]);
    var r = H.recap(7, true);
    ok(!!r, 'recap built when strong decisions exist');
    ok(r.html.indexOf('Hand #7 recap') !== -1, 'recap names the hand');
    ok(r.html.indexOf('coach-recap-good') !== -1, 'recap has a praise line');
    ok(r.html.indexOf('coach-recap-bad') !== -1, 'recap has a leak line');
    ok(r.html.indexOf('coach-head') === -1, 'recap has no duplicate Coach header');
    ok(r.lines.length === 2 && r.lines[0][0] === '+' && r.lines[1][0] === '-',
      'plain-text lines for history use +/- prefixes');
    ok(r.html.indexOf('<script') === -1, 'recap HTML has no script tags');

    // Marginal-only / zero decisions: coach STILL speaks (v1.8.90, Kevin —
    // an empty recap after a hand was a bug, never a feature).
    H.setDecisions([{ street: 'flop', advice: 'call', strength: 'marginal',
      lesson: 'x', action: 'call', followed: true }]);
    var rMarg = H.recap(8);
    ok(!!rMarg && rMarg.html.indexOf('recap') !== -1, 'recap speaks even when nothing strong happened');
    H.setDecisions([]);
    var rZero = H.recap(9);
    ok(!!rZero && rZero.html.indexOf('Tough loss') !== -1, 'recap speaks with zero decisions (tough-loss line)');

    // adviceFollowed: bet/raise interchangeable, everything else exact.
    ok(H.adviceFollowed('bet', 'raise') && H.adviceFollowed('raise', 'bet'),
      'bet/raise advice interchangeable');
    ok(H.adviceFollowed('fold', 'fold') && !H.adviceFollowed('fold', 'call'),
      'fold advice is exact');
    ok(H.adviceFollowed('check', 'check') && !H.adviceFollowed('check', 'bet'),
      'check advice is exact');
    ok(H.adviceFollowed(null, 'fold'), 'null advice never counts as a deviation');

    // Lesson text is escaped (no HTML injection via lesson strings).
    H.setDecisions([{ street: 'flop', advice: 'fold', strength: 'strong',
      lesson: '<img src=x>', action: 'call', followed: false }]);
    var r2 = H.recap(10);    ok(r2.html.indexOf('<img src=x>') === -1, 'recap escapes lesson text');

    // Win-aware recap (v1.8.228): ignoring the coach and winning anyway is
    // not praised — the win is luck, the leak is the lesson. The recap names
    // the ignored advice instead of celebrating the result.
    H.setDecisions([{ street: 'river', advice: 'fold', strength: 'strong',
      lesson: 'Folding saves chips.', action: 'raise', followed: false }]);
    var rWin = H.recap(11, true, true);
    ok(rWin.html.indexOf('Everyone folded') === -1, 'bluff win with ignored coach: no praise for the fold-out');
    ok(rWin.html.indexOf('tighten up') !== -1, 'bluff win with ignored coach: the leak is named');
    ok(rWin.html.indexOf('coach said fold, you went raise (river)') !== -1, 'bluff win recap quotes the ignored advice');
    var rWin2 = H.recap(12, true, false);
    ok(rWin2.html.indexOf('Your play got through') === -1, 'showdown win with ignored coach: no praise for the play');
    ok(rWin2.html.indexOf('tighten up') !== -1, 'showdown win with ignored coach: the leak is named');
    var rLoss = H.recap(13, false, false);
    ok(rLoss.html.indexOf('To improve') !== -1 && rLoss.html.indexOf('won the hand') === -1,
      'loss with ignored coach: leak only, no false praise');

    // Praise survives when the coach was followed — or when no strong
    // decision was recorded at all (v1.8.228 controls).
    H.setDecisions([{ street: 'river', advice: 'raise', strength: 'strong',
      lesson: 'Raise for value.', action: 'raise', followed: true }]);
    var rWinGood = H.recap(14, true, true);
    ok(rWinGood.html.indexOf('Everyone folded') !== -1, 'fold-out win praised when the coach was followed');
    ok(rWinGood.html.indexOf('tighten up') === -1, 'no leak line when the coach was followed');
    var rWinGood2 = H.recap(15, true, false);
    ok(rWinGood2.html.indexOf('Well played') !== -1, 'showdown win praised when the coach was followed');
    H.setDecisions([]);
    var rZeroWin = H.recap(16, true);
    ok(rZeroWin.html.indexOf('You won the hand') !== -1, 'win with no strong decision still gets the fallback praise');

    // handClass: only a hand no better hand can beat is 'the nuts' (v1.8.227).
    // A straight or better that a flush, a full house, or a higher straight
    // can already beat is a strong made hand, and the coach must say so.
    var HC = H.handClass;
    function C2(r, s) { return { r: r, s: s }; }
    ok(HC([C2(10, 0), C2(5, 0)], [C2(9, 1), C2(8, 1), C2(7, 2), C2(6, 3), C2(3, 1)]) === 'madehand',
      'T-high straight on a 3-flush board is a strong made hand, not the nuts (a flush beats it)');
    ok(HC([C2(5, 0), C2(2, 1)], [C2(9, 0), C2(8, 1), C2(7, 2), C2(6, 3)]) === 'madehand',
      '9-high straight on a 4-straight turn board is a strong made hand, not the nuts (a Ten makes a higher straight)');
    ok(HC([C2(14, 0), C2(13, 0)], [C2(12, 2), C2(11, 3), C2(10, 1), C2(9, 0), C2(2, 1)]) === 'nut',
      'broadway on a rainbow unpaired board is the nuts');
    ok(HC([C2(5, 3), C2(4, 0)], [C2(14, 2), C2(2, 1), C2(3, 3), C2(7, 0), C2(8, 1)]) === 'nut',
      'wheel on a rainbow unpaired board is the nuts (no higher straight, no flush possible)');
    ok(HC([C2(12, 3), C2(12, 0)], [C2(12, 2), C2(12, 1), C2(7, 1), C2(2, 0), C2(9, 1)]) === 'nut',
      'quad Queens with both Queens in hand is the nuts (no quads or straight flush left for a villain)');
    ok(HC([C2(12, 2), C2(12, 3)], [C2(13, 1), C2(13, 3), C2(12, 0), C2(7, 2), C2(2, 1)]) === 'madehand',
      'Queens full of Kings is a strong made hand, not the nuts (Kings full and quad Kings are still out there)');
    ok(HC([C2(13, 2), C2(12, 2)], [C2(13, 1), C2(13, 3), C2(12, 1), C2(12, 0), C2(9, 3)]) === 'nut',
      'Kings full of Queens with the board paired twice is the nuts (no quads left, no higher full house)');
    ok(HC([C2(14, 1), C2(13, 1)], [C2(12, 1), C2(11, 1), C2(9, 1), C2(7, 3), C2(7, 2)]) === 'madehand',
      'ace-high flush on a paired board is a strong made hand, not the nuts (a full house beats it)');
    ok(HC([C2(14, 1), C2(13, 1)], [C2(12, 1), C2(11, 3), C2(9, 1), C2(7, 0), C2(2, 1)]) === 'nut',
      'ace-high flush on an unpaired board with no straight-flush window is the nuts');
    ok(HC([C2(5, 1), C2(4, 1)], [C2(9, 1), C2(8, 1), C2(7, 1), C2(6, 1), C2(13, 2)]) === 'madehand',
      '9-high straight flush is a strong made hand, not the nuts (a Ten of hearts makes a higher one)');
    ok(HC([C2(10, 1), C2(9, 1)], [C2(8, 1), C2(7, 1), C2(6, 1), C2(13, 2), C2(2, 3)]) === 'nut',
      'Ten-high straight flush with no higher one possible is the nuts');
    ok(HC([C2(11, 2), C2(10, 3)], [C2(9, 0), C2(8, 3), C2(7, 1)]) === 'nut',
      'flopped Jack-high straight on a rainbow unpaired flop is the nuts right now');
    ok(HC([C2(10, 0), C2(6, 0)], [C2(9, 1), C2(8, 1), C2(7, 1)]) === 'madehand',
      'flopped Ten-high straight on a 3-flush flop is a strong made hand, not the nuts');

    // A strong made hand still raises for value, but the lesson never calls
    // it the nuts; true nuts keep the near-nuts lesson (v1.8.227).
    var madeRaise = postflopVerdict([{ r: 14, s: 1 }, { r: 13, s: 1 }], 'lag', 'river', 250, 500,
      [{ r: 12, s: 1 }, { r: 11, s: 1 }, { r: 9, s: 1 }, { r: 7, s: 3 }, { r: 7, s: 2 }], 2000, 2000,
      [{ t: 'action', street: 'river', player: 1, action: 'bet', bet: 250, pot: 750 }], 2);
    ok(!madeRaise.error, 'made-hand raise verdict has no error' + (madeRaise.error ? ' (' + madeRaise.error + ')' : ''));
    ok(madeRaise.advice === 'raise', 'ace-high flush on a paired board still raises for value (got ' + madeRaise.advice + ')');
    ok(stripAdvice(madeRaise.html).indexOf('to ~ 750') !== -1, 'made-hand raise states the size to ~750');
    ok(madeRaise.lesson.indexOf('nuts') === -1, 'made-hand raise lesson never says nuts');
    ok(madeRaise.lesson.indexOf('better hand is already possible') !== -1, 'made-hand raise lesson names the vulnerability');
    var nutRaise = postflopVerdict([{ r: 14, s: 1 }, { r: 13, s: 1 }], 'lag', 'river', 250, 500,
      [{ r: 12, s: 1 }, { r: 11, s: 3 }, { r: 9, s: 1 }, { r: 7, s: 0 }, { r: 2, s: 1 }], 2000, 2000,
      [{ t: 'action', street: 'river', player: 1, action: 'bet', bet: 250, pot: 750 }], 2);
    ok(!nutRaise.error, 'true-nut raise verdict has no error' + (nutRaise.error ? ' (' + nutRaise.error + ')' : ''));
    ok(nutRaise.advice === 'raise', 'true nut flush still raises for value (got ' + nutRaise.advice + ')');
    ok(nutRaise.lesson.indexOf('near-nuts') !== -1, 'true-nut raise lesson keeps the near-nuts wording');

    // Trips that are the effective nuts count as the nuts (v1.8.260): top
    // trips on an unpaired, rainbow, straight-free board — no higher set,
    // flush or straight is possible — so the coach raises for value instead
    // of just calling. The turn case is NOT the probe's 7-2-5-9 (a set of
    // 9s and a 6-8 straight both beat trip 7s there — that board is a call
    // control below); it is trip Kings on K-9-2-5, where the King is the
    // board's top rank and no straight is possible.
    var tripsBet = [{ t: 'action', street: 'flop', player: 1, action: 'bet', bet: 250, pot: 750 }];
    var tripsNutFlop = postflopVerdict([{ r: 7, s: 1 }, { r: 7, s: 0 }], 'lag', 'flop', 250, 500,
      [{ r: 7, s: 2 }, { r: 2, s: 0 }, { r: 5, s: 3 }], 2000, 2000, tripsBet, 2);
    ok(tripsNutFlop.advice === 'raise', 'trip 7s on 7-2-5 raises for value (got ' + tripsNutFlop.advice + ')');
    ok(stripAdvice(tripsNutFlop.html).indexOf('to ~ 750') !== -1, 'trip 7s on 7-2-5 raises to ~750 (3x)');
    ok(tripsNutFlop.lesson.indexOf('near-nuts') !== -1, 'trips-nuts raise lesson keeps the near-nuts wording');
    var tripsBetTurn = [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 250, pot: 750 }];
    var tripsNutTurn = postflopVerdict([{ r: 13, s: 1 }, { r: 13, s: 0 }], 'lag', 'turn', 250, 500,
      [{ r: 13, s: 2 }, { r: 9, s: 0 }, { r: 2, s: 3 }, { r: 5, s: 1 }], 2000, 2000, tripsBetTurn, 2);
    ok(tripsNutTurn.advice === 'raise', 'trip Kings on K-9-2-5 raises for value (got ' + tripsNutTurn.advice + ')');
    ok(stripAdvice(tripsNutTurn.html).indexOf('to ~ 750') !== -1, 'trip Kings on K-9-2-5 raises to ~750 (3x)');
    var tripsLow = postflopVerdict([{ r: 2, s: 1 }, { r: 2, s: 0 }], 'lag', 'flop', 250, 500,
      [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 3 }], 2000, 2000, tripsBet, 2);
    ok(tripsLow.advice === 'call', 'trip 2s on Q-7-2 still calls — a higher set is possible (got ' + tripsLow.advice + ')');
    var tripsFlush = postflopVerdict([{ r: 7, s: 1 }, { r: 7, s: 0 }], 'lag', 'flop', 250, 500,
      [{ r: 7, s: 2 }, { r: 2, s: 2 }, { r: 5, s: 2 }], 2000, 2000, tripsBet, 2);
    ok(tripsFlush.advice === 'call', 'trip 7s on a 3-flush board still calls — a flush is possible (got ' + tripsFlush.advice + ')');
    var tripsStraight = postflopVerdict([{ r: 7, s: 1 }, { r: 7, s: 0 }], 'lag', 'flop', 250, 500,
      [{ r: 7, s: 2 }, { r: 6, s: 1 }, { r: 5, s: 3 }], 2000, 2000, tripsBet, 2);
    ok(tripsStraight.advice === 'call', 'trip 7s on 7-6-5 still calls — a straight is possible (got ' + tripsStraight.advice + ')');
    var tripsTurnHigh = postflopVerdict([{ r: 7, s: 1 }, { r: 7, s: 0 }], 'lag', 'turn', 250, 500,
      [{ r: 7, s: 2 }, { r: 2, s: 0 }, { r: 5, s: 3 }, { r: 9, s: 1 }], 2000, 2000, tripsBetTurn, 2);
    ok(tripsTurnHigh.advice === 'call', 'trip 7s on 7-2-5-9 still calls — a set of 9s or a 6-8 straight beats it (got ' + tripsTurnHigh.advice + ')');
    // The trap branch never fired: its bluff gate was 0.6 and the Maniac
    // bluffs 0.55 (v1.8.246). Measured trap-vs-bet on this exact spot,
    // 2000 paired hands: trap +353 chips/hand (SE 11.5).
    var trapManiac = postflopVerdict([{ r: 14, s: 2 }, { r: 13, s: 2 }], 'maniac', 'flop', 0, 500,
      [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 2 }], 2000, 2000, [], 2, 1);
    ok(!trapManiac.error, 'maniac-trap verdict has no error' + (trapManiac.error ? ' (' + trapManiac.error + ')' : ''));
    ok(trapManiac.advice === 'check', 'nut flush vs Maniac traps instead of betting (got ' + trapManiac.advice + ')');
    ok(stripAdvice(trapManiac.html).indexOf('bluffs constantly') !== -1, 'maniac-trap message says he bluffs constantly');
    var trapRock = postflopVerdict([{ r: 14, s: 2 }, { r: 13, s: 2 }], 'rock', 'flop', 0, 500,
      [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 2 }], 2000, 2000, [], 2, 1);
    ok(trapRock.advice === 'bet', 'nut flush vs Rock bets for value (got ' + trapRock.advice + ')');
    var trapGambler = postflopVerdict([{ r: 14, s: 2 }, { r: 13, s: 2 }], 'gambler', 'flop', 0, 500,
      [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 2 }], 2000, 2000, [], 2, 1);
    ok(trapGambler.advice === 'bet', 'nut flush vs Gambler bets for value, 0.45 stays below the 0.5 gate (got ' + trapGambler.advice + ')');
    // Commit-call (v1.8.252): with the nuts, SPR <= 1 and a cheap call, the
    // coach calls instead of raising — the pot is already nearly the stack.
    // The deep-stack control raises, so the call is the SPR, not the hand.
    var commitCall = postflopVerdict([{ r: 14, s: 2 }, { r: 13, s: 2 }], 'lag', 'flop', 200, 500,
      [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 2 }], 600, 600,
      [{ t: 'action', street: 'flop', player: 1, action: 'bet', bet: 200, pot: 700 }], 2);
    ok(!commitCall.error, 'commit-call verdict has no error' + (commitCall.error ? ' (' + commitCall.error + ')' : ''));
    ok(commitCall.advice === 'call', 'nut flush calls when committed at SPR <= 1 (got ' + commitCall.advice + ')');
    ok(stripAdvice(commitCall.html).indexOf('calling costs almost nothing') !== -1, 'commit-call message names the cheap call');
    var commitCallDeep = postflopVerdict([{ r: 14, s: 2 }, { r: 13, s: 2 }], 'lag', 'flop', 200, 500,
      [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 2 }], 2000, 2000,
      [{ t: 'action', street: 'flop', player: 1, action: 'bet', bet: 200, pot: 700 }], 2);
    ok(commitCallDeep.advice === 'raise', 'same nut flush raises with a deep stack (got ' + commitCallDeep.advice + ')');
    // River-veto nut carve-out (v1.8.253): the veto fires for a made hand
    // vs a trapper who called big and bet first on the river — but it never
    // diverts the nuts, so quad Queens still raise 4x on this timeline.
    var vetoNut = postflopVerdict([{ r: 12, s: 3 }, { r: 12, s: 0 }], 'nathan', 'river', 250, 500,
      [{ r: 12, s: 2 }, { r: 12, s: 1 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 9, s: 1 }], 2000, 2000,
      [{ t: 'action', street: 'turn', player: 0, action: 'bet', bet: 266, pot: 621 },
       { t: 'action', street: 'turn', player: 1, action: 'call', bet: 266, pot: 887 },
       { t: 'action', street: 'river', player: 1, action: 'bet', bet: 250, pot: 750 }], 2);
    ok(!vetoNut.error, 'veto-nut verdict has no error' + (vetoNut.error ? ' (' + vetoNut.error + ')' : ''));
    ok(vetoNut.advice === 'raise', 'quad Queens raise through the veto timeline (got ' + vetoNut.advice + ')');
    ok(stripAdvice(vetoNut.html).indexOf('to ~ 1,000') !== -1, 'veto-nut raise goes to 1,000 (4x)');
    // Small-bet 3x (v1.8.254): a small bet from a station gets 3x, not the
    // 4x the nut branch would give — the small-bet branch fires first.
    var smallBet = postflopVerdict([{ r: 12, s: 3 }, { r: 12, s: 0 }], 'station', 'river', 150, 500,
      [{ r: 12, s: 2 }, { r: 12, s: 1 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 9, s: 1 }], 2000, 2000,
      [{ t: 'action', street: 'river', player: 1, action: 'bet', bet: 150, pot: 650 }], 2);
    ok(!smallBet.error, 'small-bet verdict has no error' + (smallBet.error ? ' (' + smallBet.error + ')' : ''));
    ok(smallBet.advice === 'raise', 'quad Queens raise a small station bet (got ' + smallBet.advice + ')');
    ok(stripAdvice(smallBet.html).indexOf('to ~ 450') !== -1, 'small-bet raise goes to 450 (3x)');
    ok(stripAdvice(smallBet.html).indexOf('3× their bet') !== -1, 'small-bet message names the 3x');
    var smallBetBig = postflopVerdict([{ r: 12, s: 3 }, { r: 12, s: 0 }], 'station', 'river', 250, 500,
      [{ r: 12, s: 2 }, { r: 12, s: 1 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 9, s: 1 }], 2000, 2000,
      [{ t: 'action', street: 'river', player: 1, action: 'bet', bet: 250, pot: 750 }], 2);
    ok(smallBetBig.advice === 'raise', 'same hand raises the medium station bet (got ' + smallBetBig.advice + ')');
    ok(stripAdvice(smallBetBig.html).indexOf('to ~ 1,000') !== -1, 'medium station bet raises to 1,000 (4x)');
    // Fake nuts facing a trapper's river bet: the veto prices it instead of
    // raising into the trap (v1.8.227). The old code shoved here.
    var fakeNut = postflopVerdict([{ r: 10, s: 0 }, { r: 5, s: 0 }], 'nathan', 'river', 669, 887,
      [{ r: 9, s: 1 }, { r: 8, s: 1 }, { r: 7, s: 2 }, { r: 6, s: 3 }, { r: 3, s: 1 }], 2000, 2000,
      [{ t: 'action', street: 'turn', player: 0, action: 'bet', bet: 266, pot: 621 },
       { t: 'action', street: 'turn', player: 1, action: 'call', bet: 266, pot: 887 },
       { t: 'action', street: 'river', player: 1, action: 'bet', bet: 669, pot: 1556 }], 2);
    ok(!fakeNut.error, 'fake-nut veto verdict has no error' + (fakeNut.error ? ' (' + fakeNut.error + ')' : ''));
    ok(fakeNut.advice === 'call', 'vulnerable straight vs trapper river bet calls on veto math, not raises (got ' + fakeNut.advice + ')');
    ok(stripAdvice(fakeNut.html).indexOf('62%') !== -1, 'veto call quotes the exact equity (62%)');

    // Regression: 3+ limpers preflop must render (v1.8.63 critical bug).
    // The limpers branch previously required spot==='open', but limpers are
    // 'facing-open' — coach returned null and the panel stayed blank.
    // We verify the branch condition directly: nRaises===0 && limpers>0.
    (function () {
      // Simulate: 3 limpers, 0 raises → limpers branch should fire.
      var fakeTimeline = [
        { t: 'action', street: 'preflop', action: 'call' },
        { t: 'action', street: 'preflop', action: 'call' },
        { t: 'action', street: 'preflop', action: 'call' }
      ];
      var nRaises = 0, nLimps = 0, raised = false;
      fakeTimeline.forEach(function (t) {
        if (t.action === 'raise' || t.action === 'bet') { nRaises++; raised = true; }
        if (t.action === 'call' && !raised) nLimps++;
      });
      ok(nRaises === 0 && nLimps === 3, 'limpers branch fires with 3 limps, 0 raises');
      // With a raise, limpers branch must NOT fire.
      var fakeTimeline2 = [
        { t: 'action', street: 'preflop', action: 'call' },
        { t: 'action', street: 'preflop', action: 'raise' },
        { t: 'action', street: 'preflop', action: 'call' }
      ];
      var nR2 = 0, nL2 = 0, r2 = false;
      fakeTimeline2.forEach(function (t) {
        if (t.action === 'raise' || t.action === 'bet') { nR2++; r2 = true; }
        if (t.action === 'call' && !r2) nL2++;
      });
      ok(nR2 === 1 && nL2 === 1, 'raise blocks limpers branch (1 limp counted, not 2)');
    })();

    // Preflop raise advice states exact chip amounts (v1.8.158).
    var pfBluff = preflopVerdict([{ r: 14, s: 0 }, { r: 5, s: 0 }], 'maniac', 30,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 45 }], 2, 30, 10, 2000, 470);
    ok(!pfBluff.error, 'bluff re-raise verdict has no error' + (pfBluff.error ? ' (' + pfBluff.error + ')' : ''));
    ok(pfBluff.advice === 'raise', 'bluff re-raise advice is raise (got ' + pfBluff.advice + ')');
    ok(stripAdvice(pfBluff.html).indexOf('to ~ 90') !== -1,
      'bluff re-raise states the exact size to ~90 (3x open in position, v1.8.158)');
    var pfRock = preflopVerdict([{ r: 14, s: 0 }, { r: 5, s: 0 }], 'rock', 30,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 45 }], 2, 30, 10);
    ok(pfRock.advice !== 'raise', 'no bluff re-raise into Rock deep — his range never folds to a small 3-bet (v1.8.203)');
    var pfSteal = preflopVerdict([{ r: 13, s: 1 }, { r: 13, s: 0 }], 'rock', 10, [], 3, 5, 10);
    ok(pfSteal.advice === 'raise', 'steal advice is raise (got ' + pfSteal.advice + ')');
    ok(stripAdvice(pfSteal.html).indexOf('to ~ 25') !== -1,
      'steal raise states the exact size to ~25 (2.5x blind, v1.8.158)');

    // Facing-3bet calls show pot-odds math (v1.8.159).
    var pf3bet = preflopVerdict([{ r: 11, s: 1 }, { r: 11, s: 0 }], 'rock', 90,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 45 },
       { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 90, pot: 135 }], 3, 30, 90);
    ok(pf3bet.advice === 'call', 'facing-3bet medium pair in position calls (got ' + pf3bet.advice + ')');
    ok(stripAdvice(pf3bet.html).indexOf('Pay 90 to win 120') !== -1 &&
      stripAdvice(pf3bet.html).indexOf('need 43%') !== -1,
      'facing-3bet call states pot-odds math: Pay 90 to win 120, need 43% (v1.8.159, prize figure unified v1.8.165)');

    // Facing-3bet equity calls ignore the stack-depth gate (v1.8.257): an
    // equity edge calls at any depth — only set-mining needs deep stacks.
    // AKo vs a Maniac 3-bet at 25bb is a ~63% favorite at a 43% price, so it
    // calls; before the fix the 40bb gate folded it. Same for AQs and JJ,
    // and for AKo vs the LAG and AQo vs the Maniac (tier<=4 branch).
    // liveCount 2 (not 3): with 3 live, pickVillain takes the archetype-less
    // player 2 (bigger bet) and the hand prices against tier 3, not the
    // named villain's 3-bet tier — the Rock control would call. liveCount 2
    // folds player 2, so the named villain prices the hand.
    var threeBet25 = [
      { t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 45 },
      { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 90, pot: 135 }
    ];
    var pf3ako25 = preflopVerdict([{ r: 14, s: 0 }, { r: 13, s: 1 }], 'maniac', 90, threeBet25, 2, 30, 90, 220, 220);
    ok(pf3ako25.advice === 'call', 'facing-3bet AKo vs Maniac at 25bb calls on the equity edge (got ' + pf3ako25.advice + ')');
    ok(stripAdvice(pf3ako25.html).indexOf('Pay 90 to win 120') !== -1,
      'facing-3bet AKo 25bb call states the price (Pay 90 to win 120)');
    var pf3aqs25 = preflopVerdict([{ r: 14, s: 0 }, { r: 12, s: 0 }], 'maniac', 90, threeBet25, 2, 30, 90, 220, 220);
    ok(pf3aqs25.advice === 'call', 'facing-3bet AQs vs Maniac at 25bb calls (got ' + pf3aqs25.advice + ')');
    var pf3jj25 = preflopVerdict([{ r: 11, s: 1 }, { r: 11, s: 0 }], 'maniac', 90, threeBet25, 2, 30, 90, 220, 220);
    ok(pf3jj25.advice === 'call', 'facing-3bet JJ vs Maniac at 25bb calls (got ' + pf3jj25.advice + ')');
    var pf3akoLag25 = preflopVerdict([{ r: 14, s: 0 }, { r: 13, s: 1 }], 'lag', 90, threeBet25, 2, 30, 90, 220, 220);
    ok(pf3akoLag25.advice === 'call', 'facing-3bet AKo vs LAG at 25bb calls (got ' + pf3akoLag25.advice + ')');
    var pf3aqo25 = preflopVerdict([{ r: 14, s: 0 }, { r: 12, s: 1 }], 'maniac', 90, threeBet25, 2, 30, 90, 220, 220);
    ok(pf3aqo25.advice === 'call', 'facing-3bet AQo vs Maniac at 25bb calls (tier<=4 branch, got ' + pf3aqo25.advice + ')');
    var pf3kqsRock25 = preflopVerdict([{ r: 13, s: 1 }, { r: 12, s: 1 }], 'rock', 90, threeBet25, 2, 30, 90, 220, 220);
    ok(pf3kqsRock25.advice === 'fold', 'facing-3bet KQs vs Rock at 25bb still folds (got ' + pf3kqsRock25.advice + ')');
    ok(stripAdvice(pf3kqsRock25.html).indexOf('Pay 90 to win 120') !== -1,
      'facing-3bet fold states the price too (Pay 90 to win 120, v1.8.257)');

    // Facing-4bet equity calls ignore the 30bb gate (v1.8.258): same pattern
    // as the 3-bet gate — an equity edge calls at any depth, only set-mining
    // needs 30bb. AKo vs a Maniac 4-bet is a ~65% favorite at a 41% price
    // with 25bb effective, so it calls; before the fix the gate folded it
    // while its own message quoted the winning math. The helper hardcodes
    // hero bet 0, so the spot is re-framed with the hero yet to act: 4-bet
    // to 200, hero stack 250 (can still raise), pot 290, need 41%.
    // liveCount 2 again so the named villain (not the archetype-less player
    // 2) prices the hand.
    var fourBet25 = [
      { t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 15 },
      { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 90, pot: 45 },
      { t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 200, pot: 135 }
    ];
    var pf4ako25 = preflopVerdict([{ r: 14, s: 0 }, { r: 13, s: 1 }], 'maniac', 200, fourBet25, 2, 200, 90, 250, 2000);
    ok(pf4ako25.advice === 'call', 'facing-4bet AKo vs Maniac at 25bb calls on the equity edge (got ' + pf4ako25.advice + ')');
    ok(stripAdvice(pf4ako25.html).indexOf('Pay 200 to win 290') !== -1,
      'facing-4bet AKo 25bb call states the price (Pay 200 to win 290)');
    var pf4aqoRock25 = preflopVerdict([{ r: 14, s: 0 }, { r: 12, s: 1 }], 'rock', 200, fourBet25, 2, 200, 90, 250, 2000);
    ok(pf4aqoRock25.advice === 'fold', 'facing-4bet AQo vs Rock at 25bb still folds (got ' + pf4aqoRock25.advice + ')');

    // BB premiums iso-raise over limpers (v1.8.259): the 'open' branch's
    // tier<=2 case raised a flat 2.5-3x and ignored limpers, so BB AA with 3
    // limpers got 25-30 instead of the 60 the limpers' money demands. The
    // premium now uses the same (3 + nLimp)x iso sizing as the tier<=3
    // branch. button 6 puts the hero on the BB; the 11th preflopVerdict
    // argument sets hero bet 10 (the posted blind) so toCall is 0.
    var limp3 = [
      { t: 'action', street: 'preflop', player: 1, action: 'call', bet: 10, pot: 15 },
      { t: 'action', street: 'preflop', player: 2, action: 'call', bet: 10, pot: 25 },
      { t: 'action', street: 'preflop', player: 3, action: 'call', bet: 10, pot: 35 }
    ];
    var pfBbAa3 = preflopVerdict([{ r: 14, s: 0 }, { r: 14, s: 1 }], 'rock', 10, limp3, 4, 10, 10, 2000, 2000, 6, 10);
    ok(pfBbAa3.advice === 'raise', 'BB AA with 3 limpers raises (got ' + pfBbAa3.advice + ')');
    ok(stripAdvice(pfBbAa3.html).indexOf('to ~ 60') !== -1,
      'BB AA with 3 limpers iso-raises to ~60 (6x the blind, v1.8.259)');
    var limp1 = [{ t: 'action', street: 'preflop', player: 1, action: 'call', bet: 10, pot: 15 }];
    var pfBbAks1 = preflopVerdict([{ r: 14, s: 0 }, { r: 12, s: 0 }], 'rock', 10, limp1, 3, 10, 0, 2000, 2000, 6, 10);
    ok(pfBbAks1.advice === 'raise' && stripAdvice(pfBbAks1.html).indexOf('to ~ 40') !== -1,
      'BB AKs with 1 limper iso-raises to ~40 (got ' + pfBbAks1.advice + ')');
    var limp2 = [
      { t: 'action', street: 'preflop', player: 1, action: 'call', bet: 10, pot: 15 },
      { t: 'action', street: 'preflop', player: 2, action: 'call', bet: 10, pot: 25 }
    ];
    var pfBbJj2 = preflopVerdict([{ r: 11, s: 0 }, { r: 11, s: 1 }], 'rock', 10, limp2, 4, 10, 10, 2000, 2000, 6, 10);
    ok(pfBbJj2.advice === 'raise' && stripAdvice(pfBbJj2.html).indexOf('to ~ 50') !== -1,
      'BB JJ with 2 limpers iso-raises to ~50 (got ' + pfBbJj2.advice + ')');
    var pfBbAa0 = preflopVerdict([{ r: 14, s: 0 }, { r: 14, s: 1 }], 'rock', 10, [], 2, 0, 0, 2000, 2000, 6, 10);
    ok(pfBbAa0.advice === 'raise' && stripAdvice(pfBbAa0.html).indexOf('no one raised') !== -1,
      'BB AA with no limpers still raises 25-30 (got ' + pfBbAa0.advice + ')');

    // Out of position, a re-raise call needs a big edge, not just any edge (v1.8.180):
    // JJ vs a Maniac 3-bet is a 74% favorite at a 47% price out of position, so it
    // calls; the identical hand vs Rock (about 25%) still folds. The 15x set-mine
    // escape is off here (200 x 15 > 2000 behind), so the call pins the equity path.
    var pfOopJJ = preflopVerdict([{ r: 11, s: 1 }, { r: 11, s: 0 }], 'maniac', 200,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 45 },
       { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 200, pot: 245 }], 2, 30, 200, 2000, 2000, 5);
    ok(!pfOopJJ.error, 'OOP 3-bet verdict has no error' + (pfOopJJ.error ? ' (' + pfOopJJ.error + ')' : ''));
    ok(pfOopJJ.advice === 'call', 'OOP JJ vs Maniac 3-bet calls on a big edge (got ' + pfOopJJ.advice + ')');
    ok(stripAdvice(pfOopJJ.html).indexOf('out of position') !== -1,
      'OOP equity call says so in plain words');
    var pfOopJJRock = preflopVerdict([{ r: 11, s: 1 }, { r: 11, s: 0 }], 'rock', 200,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 45 },
       { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 200, pot: 245 }], 2, 30, 200, 2000, 2000, 5);
    ok(pfOopJJRock.advice === 'fold', 'OOP JJ vs Rock 3-bet still folds (got ' + pfOopJJRock.advice + ')');

    // Facing-4bet shove states the amount (v1.8.163).
    var pf4bet = preflopVerdict([{ r: 14, s: 0 }, { r: 14, s: 1 }], 'rock', 270,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 45 },
       { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 90, pot: 135 },
       { t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 270, pot: 405 }], 3, 270, 90);
    ok(!pf4bet.error, 'facing-4bet verdict has no error' + (pf4bet.error ? ' (' + pf4bet.error + ')' : ''));
    ok(pf4bet.advice === 'raise', 'facing-4bet premium advice is raise (got ' + pf4bet.advice + ')');
    ok(stripAdvice(pf4bet.html).indexOf('2,000') !== -1,
      'facing-4bet shove states the all-in amount 2,000 (v1.8.163)');

    // Facing a second re-raise, every tier is priced, not auto-played (v1.8.188):
    // a premium shoves only when its equity clears the shove break-even
    // (QQ vs Rock's tight range is ~29% vs a ~49% break-even, so it folds
    // instead of shoving into the nuts), and strong hands call a wide
    // re-raiser instead of auto-folding (AKo vs Maniac is ~63% at a 43% price).
    var pf4betQQrock = preflopVerdict([{ r: 12, s: 0 }, { r: 12, s: 1 }], 'rock', 270,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 45 },
       { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 90, pot: 135 },
       { t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 270, pot: 405 }], 3, 270, 90);
    ok(pf4betQQrock.advice === 'fold', 'QQ vs Rock second re-raise folds instead of shoving into a tight range (got ' + pf4betQQrock.advice + ')');
    var pf4betAKmaniac = preflopVerdict([{ r: 14, s: 0 }, { r: 13, s: 1 }], 'maniac', 270,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 45 },
       { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 90, pot: 135 },
       { t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 270, pot: 405 }], 3, 270, 90);
    ok(pf4betAKmaniac.advice === 'call', 'AKo vs Maniac second re-raise calls on a big edge (got ' + pf4betAKmaniac.advice + ')');
    var pf4betJJmaniac = preflopVerdict([{ r: 11, s: 0 }, { r: 11, s: 1 }], 'maniac', 270,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 45 },
       { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 90, pot: 135 },
       { t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 270, pot: 405 }], 3, 270, 90);
    ok(pf4betJJmaniac.advice === 'call', 'JJ vs Maniac second re-raise calls on a big edge (got ' + pf4betJJmaniac.advice + ')');
    var pf4betAQrock = preflopVerdict([{ r: 14, s: 0 }, { r: 12, s: 1 }], 'rock', 270,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 45 },
       { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 90, pot: 135 },
       { t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 270, pot: 405 }], 3, 270, 90);
    ok(pf4betAQrock.advice === 'fold', 'AQo vs Rock second re-raise still folds (got ' + pf4betAQrock.advice + ')');
    var pf4betShoveAKmaniac = preflopVerdict([{ r: 14, s: 0 }, { r: 13, s: 1 }], 'maniac', 2000,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 45 },
       { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 90, pot: 135 },
       { t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 2000, pot: 2135 }], 2, 2000, 90, 2000, 0);
    ok(pf4betShoveAKmaniac.advice === 'call', 'AKo vs Maniac second re-raise shove calls when the equity clears the price (got ' + pf4betShoveAKmaniac.advice + ')');
    var pf4betShoveAKrock = preflopVerdict([{ r: 14, s: 0 }, { r: 13, s: 1 }], 'rock', 2000,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 45 },
       { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 90, pot: 135 },
       { t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 2000, pot: 2135 }], 2, 2000, 90, 2000, 0);
    ok(pf4betShoveAKrock.advice === 'fold', 'AKo vs Rock second re-raise shove still folds (got ' + pf4betShoveAKrock.advice + ')');

    // Big opens are priced against the strong range, not the open range (v1.8.172).
    // A shove or a 6x+ open from a tight player is a tier-1 range, not a tier-2 open.
    var pfShoveQQ = preflopVerdict([{ r: 12, s: 0 }, { r: 12, s: 1 }], 'rock', 2000,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 2000, pot: 15 }], 2, 2000, 0, 2000, 0);
    ok(!pfShoveQQ.error, 'open-shove verdict has no error' + (pfShoveQQ.error ? ' (' + pfShoveQQ.error + ')' : ''));
    ok(pfShoveQQ.advice === 'fold', 'Rock open-shove, QQ folds (got ' + pfShoveQQ.advice + ')');
    ok(stripAdvice(pfShoveQQ.html).indexOf('need to win 50%') !== -1,
      'open-shove fold states the 50% price');
    var pfShoveManiac = preflopVerdict([{ r: 12, s: 0 }, { r: 12, s: 1 }], 'maniac', 2000,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 2000, pot: 15 }], 2, 2000, 0, 2000, 0);
    ok(pfShoveManiac.advice === 'call', 'Maniac open-shove, QQ still calls (got ' + pfShoveManiac.advice + ')');
    var pfBigQQ = preflopVerdict([{ r: 12, s: 0 }, { r: 12, s: 1 }], 'rock', 100,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 100, pot: 15 }], 2, 100, 0, 2000, 1900);
    ok(pfBigQQ.advice === 'fold', 'Rock 10x open, QQ folds (got ' + pfBigQQ.advice + ')');
    var pfBigAA = preflopVerdict([{ r: 14, s: 0 }, { r: 14, s: 1 }], 'rock', 100,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 100, pot: 15 }], 2, 100, 0, 2000, 1900);
    ok(pfBigAA.advice === 'raise', 'Rock 10x open, AA still re-raises (got ' + pfBigAA.advice + ')');
    ok(stripAdvice(pfBigAA.html).indexOf('to ~ 300') !== -1,
      'AA vs 10x open states the exact size to ~300');
    var pfSmallQQ = preflopVerdict([{ r: 12, s: 0 }, { r: 12, s: 1 }], 'rock', 30,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 15 }], 2, 30, 0, 2000, 1970);
    ok(pfSmallQQ.advice === 'raise', 'Rock 3x open, QQ still re-raises (got ' + pfSmallQQ.advice + ')');

    // No bluff 3-bet into a big open (v1.8.173): an 8x open is a strong range
    // with little left to fold, and 240 risked to win 95 needs folds it will not get.
    // Hero is 10bb here on purpose: the implied-odds credit is 0 at 10bb, so the
    // fold is deterministic instead of a close-band coin flip on 150-sim noise.
    var pfBluffBig = preflopVerdict([{ r: 14, s: 0 }, { r: 5, s: 0 }], 'rock', 80,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 80, pot: 15 }], 2, 80, 0, 100, 1920);
    ok(!pfBluffBig.error, 'bluff vs big open verdict has no error' + (pfBluffBig.error ? ' (' + pfBluffBig.error + ')' : ''));
    ok(pfBluffBig.advice === 'fold', 'Rock 8x open, A5s folds instead of bluff 3-betting (got ' + pfBluffBig.advice + ')');

    // Iso raises scale with the limper count: 3bb + 1bb per limper (v1.8.174).
    var limpThree = [1, 2, 3].map(function (p) {
      return { t: 'action', street: 'preflop', player: p, action: 'call', bet: 10, pot: 15 };
    });
    var pfIso3 = preflopVerdict([{ r: 14, s: 0 }, { r: 14, s: 1 }], 'rock', 10, limpThree, 8, 10, 10);
    ok(!pfIso3.error, 'iso verdict has no error' + (pfIso3.error ? ' (' + pfIso3.error + ')' : ''));
    ok(pfIso3.advice === 'raise', '3 limpers, AA iso-raises (got ' + pfIso3.advice + ')');
    ok(stripAdvice(pfIso3.html).indexOf('to ~ 60') !== -1,
      'iso vs 3 limpers sizes 3bb + 1bb per limper = 60');
    ok(stripAdvice(pfIso3.html).indexOf('(6× the blind)') !== -1,
      'iso message states the 6x multiple');
    var pfIso1 = preflopVerdict([{ r: 14, s: 0 }, { r: 14, s: 1 }], 'rock', 10,
      [{ t: 'action', street: 'preflop', player: 1, action: 'call', bet: 10, pot: 15 }], 8, 10, 0);
    ok(pfIso1.advice === 'raise', '1 limper, AA iso-raises (got ' + pfIso1.advice + ')');
    ok(stripAdvice(pfIso1.html).indexOf('to ~ 40') !== -1,
      'iso vs 1 limper is still 40 (3bb + 1bb)');

    // Facing a 3-bet shove, premiums are priced, not auto-called (v1.8.175).
    // QQ is ~28% vs Rock's tier-1 3-bet range at a 50% price; AA is ~80%.
    var shove3Tl = [
      { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 30, pot: 15 },
      { t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 3000, pot: 45 }
    ];
    var pf3ShoveQQ = preflopVerdict([{ r: 12, s: 0 }, { r: 12, s: 1 }], 'rock', 3000, shove3Tl, 3, 3000, 30, 3000, 0);
    ok(!pf3ShoveQQ.error, '3-bet shove verdict has no error' + (pf3ShoveQQ.error ? ' (' + pf3ShoveQQ.error + ')' : ''));
    ok(pf3ShoveQQ.advice === 'fold', 'Rock 3-bet shove, QQ folds (got ' + pf3ShoveQQ.advice + ')');
    ok(stripAdvice(pf3ShoveQQ.html).indexOf('need 50%') !== -1,
      '3-bet shove fold states the 50% price');
    var pf3ShoveAA = preflopVerdict([{ r: 14, s: 0 }, { r: 14, s: 1 }], 'rock', 3000, shove3Tl, 3, 3000, 30, 3000, 0);
    ok(pf3ShoveAA.advice === 'call', 'Rock 3-bet shove, AA calls (got ' + pf3ShoveAA.advice + ')');
    var pf3Ctl = preflopVerdict([{ r: 12, s: 0 }, { r: 12, s: 1 }], 'rock', 90,
      [{ t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 30, pot: 15 },
       { t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 90, pot: 45 }], 3, 90, 30, 2000, 1910);
    ok(pf3Ctl.advice === 'raise', 'Rock 3-bet to 90, QQ still 4-bets (got ' + pf3Ctl.advice + ')');
    ok(stripAdvice(pf3Ctl.html).indexOf('to ~ 207') !== -1,
      'QQ 4-bet states the exact size to ~207 (2.3x the 3-bet)');
    ok(pf3Ctl.lesson.indexOf('207') !== -1,
      'QQ 4-bet lesson states the exact size (207) too, not just the bare 2.3x multiple (v1.8.230)');

    // The semi-bluff raise is gone (v1.8.262): the nut flush draw calls
    // instead of raising — Rock folds top pair 0/200 to a 3x raise, so
    // raising a draw into his betting range loses ~385 chips/hand vs
    // calling (paired N=2000).
    var drawRock = postflopVerdict([{ r: 14, s: 1 }, { r: 13, s: 1 }], 'rock', 'turn', 250, 500,
      [{ r: 12, s: 1 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }], 2000, 2000,
      [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 250, pot: 750 }], 2);
    ok(drawRock.advice === 'call', 'nut flush draw calls vs Rock medium bet (got ' + drawRock.advice + ')');

    // Range note respects a tight villain (v1.8.230): a medium bet from Rock
    // does not make him "wide" — the note says the bet barely narrows him
    // instead of claiming pairs, draws, and air are all in there.
    // (A set raises here, so the note appears in the raise message.)
    var wideRock = postflopVerdict([{ r: 12, s: 0 }, { r: 12, s: 3 }], 'rock', 'turn', 250, 500,
      [{ r: 12, s: 1 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }], 2000, 2000,
      [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 250, pot: 750 }], 2);
    ok(wideRock.advice === 'raise', 'set of Queens raises vs Rock medium bet (got ' + wideRock.advice + ')');
    ok(stripAdvice(wideRock.html).indexOf('bet a medium size') !== -1,
      'range note for a tight villain names the medium bet, not a wide range');
    ok(stripAdvice(wideRock.html).indexOf('plays a wide range') === -1,
      'range note for a tight villain never claims he plays a wide range');

    // Alice is a wide overbettor (v1.8.263): she overbets AA 56%, sets ~52%,
    // two pair ~50% and KQ 39% on the turn, so the tightBigBet guard's
    // exemption lifts only for hands that beat her overbet range. Exact
    // enumeration (44 river cards, frequency-weighted over her tier-1
    // overbet range): overpair AA ~64% vs a 37.5% price (call, +421 EV),
    // top pair KQ ~13% (fold, calling loses ~392). 20-run stability:
    // AA calls 20/20, KQ folds 20/20.
    var aliceAA = postflopVerdict([{ r: 14, s: 0 }, { r: 14, s: 3 }], 'alice', 'turn', 600, 400,
      [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 0 }, { r: 5, s: 3 }], 2000, 2000,
      [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 600, pot: 1000 }], 2);
    ok(aliceAA.advice === 'call', 'overpair calls Alice 1.5x overbet — the guard no longer folds it (got ' + aliceAA.advice + ')');
    var aliceKQ = postflopVerdict([{ r: 13, s: 1 }, { r: 12, s: 1 }], 'alice', 'turn', 600, 400,
      [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 0 }, { r: 5, s: 3 }], 2000, 2000,
      [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 600, pot: 1000 }], 2);
    ok(aliceKQ.advice === 'fold', 'top pair still folds Alice 1.5x overbet — the exemption is scoped to overpair+, not one pair (got ' + aliceKQ.advice + ')');

    // A big river bet is value-heavy from every villain (v1.8.264): the
    // Maniac bets large 100% with made hands and ~0% with air on the
    // river, and the LAG/Amogh/Station/Rock bluff air 0-4% there — yet
    // the coach called third pair at 41-44% vs a tier-6 pool. Frequency-
    // weighted exact equity vs the Maniac's large-bet range: third pair
    // 0.0%, top pair ~18% — both below the 30% price, so both fold.
    var maniac76 = postflopVerdict([{ r: 7, s: 0 }, { r: 6, s: 0 }], 'maniac', 'river', 300, 400,
      [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 0 }, { r: 5, s: 3 }, { r: 9, s: 1 }], 2000, 2000,
      [{ t: 'action', street: 'river', player: 1, action: 'bet', bet: 300, pot: 700 }], 2);
    ok(maniac76.advice === 'fold', 'third pair folds the Maniac 0.75x river bet — the tier-pool call at 41-44% was priced against air he never bets (got ' + maniac76.advice + ')');
    var maniacQJ = postflopVerdict([{ r: 12, s: 0 }, { r: 11, s: 0 }], 'maniac', 'river', 300, 400,
      [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 0 }, { r: 5, s: 3 }, { r: 9, s: 1 }], 2000, 2000,
      [{ t: 'action', street: 'river', player: 1, action: 'bet', bet: 300, pot: 700 }], 2);
    ok(maniacQJ.advice === 'fold', 'top pair folds the Maniac 0.75x river bet too — its true equity vs his large-bet range is ~18% (got ' + maniacQJ.advice + ')');

    // Air on the river is priced vs the made hands he bets, not the bluff
    // rate (v1.8.265): the Maniac's river betting range is 98% made hands
    // (air share 1.9%) and the LAG's 99% (1.4%), yet the old blend priced
    // ace-high at 54%/35% and called a 200-into-400 bet at a 25% price.
    // True equity is ~2% — calling loses ~185 chips.
    var riverBoard = [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 0 }, { r: 5, s: 3 }, { r: 9, s: 1 }];
    var airManiac = postflopVerdict([{ r: 14, s: 1 }, { r: 13, s: 0 }], 'maniac', 'river', 200, 400,
      riverBoard, 2000, 2000,
      [{ t: 'action', street: 'river', player: 1, action: 'bet', bet: 200, pot: 600 }], 2);
    ok(airManiac.advice === 'fold', 'ace-high folds the Maniac medium river bet — his betting range is ~98% made hands, not 55% air (got ' + airManiac.advice + ')');
    ok(stripAdvice(airManiac.html).indexOf('mostly made hands') !== -1,
      'river air fold says a betting range is mostly made hands');
    var airLag = postflopVerdict([{ r: 14, s: 1 }, { r: 13, s: 0 }], 'lag', 'river', 200, 400,
      riverBoard, 2000, 2000,
      [{ t: 'action', street: 'river', player: 1, action: 'bet', bet: 200, pot: 600 }], 2);
    ok(airLag.advice === 'fold', 'ace-high folds the LAG medium river bet too — his betting range is ~99% made hands (got ' + airLag.advice + ')');

    // The same mispricing held on earlier streets (v1.8.265): the flop
    // blend said 50.6%/40.5% vs true 14.6%/12.7%, the turn 50.0%/35.9%
    // vs true 7.8%/6.3% — the betting range is ~91-98% made hands on
    // every street. Flop spots use a 0.75x bet: the 0.5x flop spot still
    // wobbles (2/25 calls at 2,000 sims on a 1-point margin), so the lab
    // pins the wide-margin variant.
    var flopBoard = [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 0 }];
    var airFlopManiac = postflopVerdict([{ r: 14, s: 1 }, { r: 13, s: 0 }], 'maniac', 'flop', 300, 400,
      flopBoard, 2000, 2000,
      [{ t: 'action', street: 'flop', player: 1, action: 'bet', bet: 300, pot: 700 }], 2);
    ok(airFlopManiac.advice === 'fold', 'ace-high folds the Maniac 0.75x flop bet — true equity ~15%, not the 51% the old blend claimed (got ' + airFlopManiac.advice + ')');
    var airFlopLag = postflopVerdict([{ r: 14, s: 1 }, { r: 13, s: 0 }], 'lag', 'flop', 300, 400,
      flopBoard, 2000, 2000,
      [{ t: 'action', street: 'flop', player: 1, action: 'bet', bet: 300, pot: 700 }], 2);
    ok(airFlopLag.advice === 'fold', 'ace-high folds the LAG 0.75x flop bet too (got ' + airFlopLag.advice + ')');
    var turnBoard = [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 0 }, { r: 5, s: 3 }];
    var airTurnManiac = postflopVerdict([{ r: 14, s: 1 }, { r: 13, s: 0 }], 'maniac', 'turn', 200, 400,
      turnBoard, 2000, 2000,
      [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 200, pot: 600 }], 2);
    ok(airTurnManiac.advice === 'fold', 'ace-high folds the Maniac medium turn bet — true equity ~8%, not 50% (got ' + airTurnManiac.advice + ')');
    var airTurnLag = postflopVerdict([{ r: 14, s: 1 }, { r: 13, s: 0 }], 'lag', 'turn', 200, 400,
      turnBoard, 2000, 2000,
      [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 200, pot: 600 }], 2);
    ok(airTurnLag.advice === 'fold', 'ace-high folds the LAG medium turn bet too (got ' + airTurnLag.advice + ')');

    // Weak pair is priced vs the made hands he bets too (v1.8.266): the tier
    // pool priced a pair of 2s at 36-50% against true 11-23%, calling medium
    // bets at 25-33% prices. The made range prices it at 12-19% — and the
    // bluffy marginal call no longer fires for it, since its equity is
    // already priced against the betting range.
    var weakFlopBoard = [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 0 }];
    var weakFlopManiac = postflopVerdict([{ r: 2, s: 1 }, { r: 6, s: 0 }], 'maniac', 'flop', 300, 400,
      weakFlopBoard, 2000, 2000,
      [{ t: 'action', street: 'flop', player: 1, action: 'bet', bet: 300, pot: 700 }], 2);
    ok(weakFlopManiac.advice === 'fold', 'weak pair folds the Maniac 0.75x flop bet — true equity ~23%, not the 36% the tier pool claimed (got ' + weakFlopManiac.advice + ')');
    ok(stripAdvice(weakFlopManiac.html).indexOf('mostly made hands') !== -1,
      'weak-pair fold says a betting range is mostly made hands');
    var weakFlopLag = postflopVerdict([{ r: 2, s: 1 }, { r: 6, s: 0 }], 'lag', 'flop', 200, 400,
      weakFlopBoard, 2000, 2000,
      [{ t: 'action', street: 'flop', player: 1, action: 'bet', bet: 200, pot: 600 }], 2);
    ok(weakFlopLag.advice === 'fold', 'weak pair folds the LAG medium flop bet too — true equity ~21% at a 25% price (got ' + weakFlopLag.advice + ')');
    var weakTurnBoard = [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 0 }, { r: 5, s: 3 }];
    var weakTurnManiac = postflopVerdict([{ r: 2, s: 1 }, { r: 6, s: 0 }], 'maniac', 'turn', 200, 400,
      weakTurnBoard, 2000, 2000,
      [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 200, pot: 600 }], 2);
    ok(weakTurnManiac.advice === 'fold', 'weak pair folds the Maniac medium turn bet — true equity ~13%, not 50% (got ' + weakTurnManiac.advice + ')');
    var weakTurnLag = postflopVerdict([{ r: 2, s: 1 }, { r: 6, s: 0 }], 'lag', 'turn', 200, 400,
      weakTurnBoard, 2000, 2000,
      [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 200, pot: 600 }], 2);
    ok(weakTurnLag.advice === 'fold', 'weak pair folds the LAG medium turn bet too (got ' + weakTurnLag.advice + ')');
    var secondSmallManiac = postflopVerdict([{ r: 7, s: 0 }, { r: 6, s: 3 }], 'maniac', 'flop', 100, 400,
      weakFlopBoard, 2000, 2000,
      [{ t: 'action', street: 'flop', player: 1, action: 'bet', bet: 100, pot: 500 }], 2);
    ok(secondSmallManiac.advice === 'call', 'second pair still calls the Maniac small flop bet — true equity ~28% at a 17% price (got ' + secondSmallManiac.advice + ')');
    // Second pair is priced vs the made hands at least as good as it (v1.8.267):
    // the uniform made pool is bottom-pair heavy — the villain bets weak pairs
    // only 1-6% of the time — so it priced second pair at 42-49% against true
    // 15-28%. The pair-plus pool prices it at 16-22%, right on the truth.
    var secondFlopManiac = postflopVerdict([{ r: 7, s: 0 }, { r: 6, s: 3 }], 'maniac', 'flop', 400, 400,
      weakFlopBoard, 2000, 2000,
      [{ t: 'action', street: 'flop', player: 1, action: 'bet', bet: 400, pot: 800 }], 2);
    ok(secondFlopManiac.advice === 'fold', 'second pair folds the Maniac pot-sized flop bet — true equity ~28% at a 33% price (got ' + secondFlopManiac.advice + ')');
    ok(stripAdvice(secondFlopManiac.html).indexOf('usually behind the top-pair hands') !== -1,
      'second-pair fold says it is usually behind the top-pair hands he bets with');
    var secondFlopLag = postflopVerdict([{ r: 7, s: 0 }, { r: 6, s: 3 }], 'lag', 'flop', 300, 400,
      weakFlopBoard, 2000, 2000,
      [{ t: 'action', street: 'flop', player: 1, action: 'bet', bet: 300, pot: 700 }], 2);
    ok(secondFlopLag.advice === 'fold', 'second pair folds the LAG 0.75x flop bet too — true equity ~25% at a 30% price (got ' + secondFlopLag.advice + ')');
    var secondTurnManiac = postflopVerdict([{ r: 7, s: 0 }, { r: 6, s: 3 }], 'maniac', 'turn', 200, 400,
      weakTurnBoard, 2000, 2000,
      [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 200, pot: 600 }], 2);
    ok(secondTurnManiac.advice === 'fold', 'second pair folds the Maniac medium turn bet — true equity ~19%, not 49% (got ' + secondTurnManiac.advice + ')');
    var secondTurnLag = postflopVerdict([{ r: 7, s: 0 }, { r: 6, s: 3 }], 'lag', 'turn', 200, 400,
      weakTurnBoard, 2000, 2000,
      [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 200, pot: 600 }], 2);
    ok(secondTurnLag.advice === 'fold', 'second pair folds the LAG medium turn bet too (got ' + secondTurnLag.advice + ')');
    var wideLag = postflopVerdict([{ r: 9, s: 0 }, { r: 3, s: 1 }], 'lag', 'turn', 0, 500,
      [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 9, s: 3 }], 2000, 2000,
      [{ t: 'action', street: 'flop', player: 1, action: 'bet', bet: 250, pot: 750 }], 2);
    ok(wideLag.advice === 'bet', 'second pair leads vs LAG after his medium flop bet (got ' + wideLag.advice + ')');
    ok(stripAdvice(wideLag.html).indexOf('plays a wide range') !== -1,
      'range note for a loose villain still says he plays a wide range');

    // Facing a 4-bet shove, premiums are priced, not auto-called (v1.8.176).
    // QQ is ~28% vs Rock's strong range at a 48% price; AA is ~80%.
    var shove4Tl = [
      { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 30, pot: 15 },
      { t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 90, pot: 45 },
      { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 300, pot: 135 },
      { t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 3000, pot: 435 }
    ];
    var pf4ShoveQQ = preflopVerdict([{ r: 12, s: 0 }, { r: 12, s: 1 }], 'rock', 3000, shove4Tl, 3, 3000, 300, 3000, 0);
    ok(!pf4ShoveQQ.error, '4-bet shove verdict has no error' + (pf4ShoveQQ.error ? ' (' + pf4ShoveQQ.error + ')' : ''));
    ok(pf4ShoveQQ.advice === 'fold', 'Rock 4-bet shove, QQ folds (got ' + pf4ShoveQQ.advice + ')');
    var pf4ShoveAA = preflopVerdict([{ r: 14, s: 0 }, { r: 14, s: 1 }], 'rock', 3000, shove4Tl, 3, 3000, 300, 3000, 0);
    ok(pf4ShoveAA.advice === 'call', 'Rock 4-bet shove, AA calls (got ' + pf4ShoveAA.advice + ')');
    // v1.8.188: the non-all-in 4-bet is priced too — QQ no longer shoves into
    // Rock's tight range (it folds), but still shoves over a wide re-raiser.
    var pf4Ctl = preflopVerdict([{ r: 12, s: 0 }, { r: 12, s: 1 }], 'rock', 300,
      shove4Tl.slice(0, 3), 3, 300, 300, 2700, 2700);
    ok(pf4Ctl.advice === 'fold', 'Rock 4-bet to 300, QQ folds instead of shoving into a tight range (got ' + pf4Ctl.advice + ')');
    var pf4CtlManiac = preflopVerdict([{ r: 12, s: 0 }, { r: 12, s: 1 }], 'maniac', 300,
      shove4Tl.slice(0, 3), 3, 300, 300, 2700, 2700);
    ok(pf4CtlManiac.advice === 'raise', 'Maniac 4-bet to 300, QQ still shoves (got ' + pf4CtlManiac.advice + ')');
    ok(stripAdvice(pf4CtlManiac.html).indexOf('2,700') !== -1,
      'QQ 4-bet shove states the all-in amount 2,700');

    // v1.8.192: a leading bet is never advised above the hero's stack.
    // Trips on a paired board at SPR 0.5 used to advise a 1,340 bet with
    // a 1,000 stack; now it says all-in for 1,000.
    var lowSprV = (function () {
      var s = d.createElement('script');
      s.textContent = [
        'window.__lowSprTable = new PokerTable({ players: [',
        '  { name: "hero", isHero: true }, { name: "V", archetype: ARCHETYPES.filter(function (a) { return a.id === "rock"; })[0] },',
        '  { name: "B" }, { name: "C" }, { name: "E" }, { name: "F" }, { name: "G" }, { name: "H" }',
        '], sb: 5, bb: 10, startingStack: 3000 });',
        'var t = window.__lowSprTable;',
        't.button = 0; t.street = "turn"; t.currentBet = 0; t.pot = 2000;',
        't.players[0].hole = [{ r: 4, s: 1 }, { r: 9, s: 0 }];',
        't.players[0].stack = 1000; t.players[0].bet = 0;',
        't.players[1].stack = 1000; t.players[1].bet = 0;',
        't.community = [{ r: 7, s: 1 }, { r: 4, s: 0 }, { r: 12, s: 1 }, { r: 4, s: 3 }];',
        'for (var i = 2; i < 8; i++) t.players[i].folded = true;'
      ].join('\n');
      d.head.appendChild(s);
      var t = w.__lowSprTable;
      w.__coachTestHooks.setTable(t);
      w.__coachTestHooks.setHandRec({ timeline: [] });
      w.__coachTestHooks.setDecisions([]);
      return w.coachVerdict();
    })();
    ok(lowSprV.advice === 'bet', 'trips at SPR 0.5 still bets for value (got ' + lowSprV.advice + ')');
    ok(stripAdvice(lowSprV.html).indexOf('All-in (1,000)') !== -1,
      'trips at SPR 0.5 says all-in for the 1,000 stack, not a fraction-of-pot bet above it');
    ok(stripAdvice(lowSprV.html).indexOf('1,340') === -1,
      'trips at SPR 0.5 never advises the impossible 1,340 bet (v1.8.192)');

    // Short-stack branch keys on the hero's stack, not the effective stack (v1.8.164).
    (function () {
      var s = d.createElement('script');
      s.textContent = [
        'window.__ssTable = new PokerTable({ players: [',
        '  { name: "hero", isHero: true }, { name: "V", archetype: ARCHETYPES.filter(function (a) { return a.id === "rock"; })[0] }, { name: "S" },',
        '  { name: "B" }, { name: "E" }, { name: "F" }, { name: "G" }, { name: "H" }',
        '], sb: 5, bb: 10, startingStack: 2000 });',
        'var t = window.__ssTable;',
        't.button = 0; t.street = "preflop"; t.currentBet = 0; t.pot = 0; t.sbIdx = 1; t.bbIdx = 2;',
        't.players[0].hole = [{ r: 14, s: 0 }, { r: 14, s: 1 }];',
        't.players[0].stack = 2000; t.players[0].bet = 0;',
        't.players[1].stack = 100; t.players[1].bet = 0;',
        't.players[2].stack = 2000; t.players[2].bet = 0;',
        't.community = [];',
        'for (var i = 2; i < 8; i++) t.players[i].folded = true;'
      ].join('\n');
      d.head.appendChild(s);
      var t = w.__ssTable;
      H.setTable(t);
      H.setHandRec({ timeline: [] });
      H.setDecisions([]);
      H.setGameMode('tourney');
      var vSs = w.coachVerdict();
      H.setGameMode('cash');
      var txtSs = stripAdvice(vSs.html);
      ok(!vSs.error, 'deep hero vs short villain verdict has no error' + (vSs.error ? ' (' + vSs.error + ')' : ''));
      ok(vSs.advice === 'raise', 'deep hero vs short villain advice is raise (got ' + vSs.advice + ')');
      ok(txtSs.indexOf('Shove') === -1, 'deep hero is not told to shove-or-fold on a short villain stack (v1.8.164)');
      ok(txtSs.indexOf('25') !== -1, 'deep hero gets the normal steal raise to 25 (v1.8.164)');
    })();

    // Coach never advises raise when raise is illegal (v1.8.166).
    (function () {
      function illegalTable(heroStack, vBet, currentBet, timeline, mode) {
        var s = d.createElement('script');
        s.textContent = [
          'window.__ilTable = new PokerTable({ players: [',
          '  { name: "hero", isHero: true }, { name: "V", archetype: ARCHETYPES.filter(function (a) { return a.id === "rock"; })[0] }, { name: "S" },',
          '  { name: "B" }, { name: "E" }, { name: "F" }, { name: "G" }, { name: "H" }',
          '], sb: 5, bb: 10, startingStack: 2000 });',
          'var t = window.__ilTable;',
          't.button = 0; t.street = "preflop"; t.currentBet = ' + currentBet + '; t.pot = 0; t.sbIdx = 1; t.bbIdx = 2;',
          't.players[0].hole = [{ r: 14, s: 0 }, { r: 14, s: 1 }];',
          't.players[0].stack = ' + heroStack + '; t.players[0].bet = 0;',
          't.players[1].stack = 2000; t.players[1].bet = ' + vBet + ';',
          't.players[2].stack = 2000; t.players[2].bet = 10;',
          't.community = [];',
          'for (var i = 2; i < 8; i++) t.players[i].folded = true;'
        ].join('\n');
        d.head.appendChild(s);
        var t = w.__ilTable;
        H.setTable(t);
        H.setHandRec({ timeline: timeline });
        H.setDecisions([]);
        if (mode) H.setGameMode(mode);
        var v = w.coachVerdict();
        if (mode) H.setGameMode('cash');
        return v;
      }
      var vSteal = illegalTable(10, 5, 10, []);
      ok(vSteal.advice === 'call', 'steal spot with 10 chips facing 10 advice is call, not an illegal raise (got ' + vSteal.advice + ', v1.8.166)');
      var vLimp = illegalTable(10, 10, 10,
        [{ t: 'action', street: 'preflop', player: 1, action: 'call', bet: 10, pot: 25 }]);
      ok(vLimp.advice === 'call', 'limpers spot with 10 chips facing 10 advice is call, not an illegal raise (got ' + vLimp.advice + ', v1.8.166)');
      var vShove = illegalTable(50, 100, 100,
        [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 100, pot: 115 }], 'tourney');
      ok(vShove.advice === 'call', 'short hero facing a shove advice is call, not an illegal raise (got ' + vShove.advice + ', v1.8.166)');
    })();

    // Leak tracker uses range equity, not random-hand equity (v1.8.181):
    // random equity hid bad calls against tight ranges (second pair is ~64%
    // vs a random hand but ~21% vs Rock's strong range) and flagged correct
    // folds to tight players as weak. The tracker now prices the villain's
    // range the same way the coach does.
    (function () {
      function postflopLeak(hero, villainId, board, street, pot, currentBet, villainBet, timeline, action, callerBet, amount, heroStack, button) {
        var s = d.createElement('script');
        var arch = villainId
          ? 'ARCHETYPES.filter(function (a) { return a.id === "' + villainId + '"; })[0]'
          : 'null';
        s.textContent = [
          'window.__lkTable = new PokerTable({ players: [',
          '  { name: "hero", isHero: true }, { name: "V", archetype: ' + arch + ' }, { name: "S" },',
          '  { name: "B" }, { name: "E" }, { name: "F" }, { name: "G" }, { name: "H" }',
          '], sb: 5, bb: 10, startingStack: 2000 });',
          'var t = window.__lkTable;',
          't.button = ' + (button == null ? 0 : button) + '; t.street = "' + street + '"; t.currentBet = ' + currentBet + '; t.pot = ' + pot + ';',
          't.players[0].hole = ' + JSON.stringify(hero) + ';',
          't.players[0].stack = ' + (heroStack == null ? 2000 : heroStack) + '; t.players[0].bet = 0;',
          't.players[1].stack = 2000; t.players[1].bet = ' + villainBet + ';',
          't.community = ' + JSON.stringify(board) + ';',
          'for (var i = ' + (callerBet ? 3 : 2) + '; i < 8; i++) t.players[i].folded = true;'
        ].join('\n');
        d.head.appendChild(s);
        if (callerBet) {
          var s2 = d.createElement('script');
          s2.textContent = 'window.__lkTable.players[2].bet = ' + callerBet + ';';
          d.head.appendChild(s2);
        }
        var t = w.__lkTable;
        H.setTable(t);
        H.setHandRec({ timeline: timeline });
        H.setDecisions([]);
        return H.detectLeak(action, amount);
      }
      var Q725 = [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }];
      var leakBad = postflopLeak([{ r: 11, s: 0 }, { r: 9, s: 1 }], 'rock', Q725, 'turn', 200, 150, 150,
        [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 150, pot: 350 }], 'call');
      ok(leakBad && leakBad.type === 'bad-chase',
        'J9 overcards calling Rock\'s turn bet flags bad-chase (range eq ~6% vs 30% need; random eq ~30% hid it)');
      var Q7259 = Q725.concat([{ r: 9, s: 1 }]);
      // Alice opens the tightest range (openTier 1), so her capped small bet
      // prices second pair at ~22% vs a 20% need: below the need + 10 flag
      // line (30%), so folding is correct, no flag. Rock opens tier 2, so
      // the same fold against him IS a weak fold (eq ~38%).
      var leakWeakAlice = postflopLeak([{ r: 8, s: 0 }, { r: 7, s: 0 }], 'alice', Q7259, 'river', 150, 50, 50,
        [{ t: 'action', street: 'river', player: 1, action: 'bet', bet: 50, pot: 200 }], 'fold');
      ok(!leakWeakAlice,
        'folding second pair to Alice\'s small river bet is NOT a weak fold (range eq ~22%; random eq ~62% used to flag it)');
      var leakWeakRock = postflopLeak([{ r: 8, s: 0 }, { r: 7, s: 0 }], 'rock', Q7259, 'river', 150, 50, 50,
        [{ t: 'action', street: 'river', player: 1, action: 'bet', bet: 50, pot: 200 }], 'fold');
      ok(leakWeakRock && leakWeakRock.type === 'weak-fold',
        'folding second pair to Rock\'s small river bet still flags weak-fold (range eq ~38% vs 20% need, flags above need + 10)');
      var leakWeakManiac = postflopLeak([{ r: 8, s: 0 }, { r: 7, s: 0 }], 'maniac', Q7259, 'river', 150, 50, 50,
        [{ t: 'action', street: 'river', player: 1, action: 'bet', bet: 50, pot: 200 }], 'fold');
      ok(leakWeakManiac && leakWeakManiac.type === 'weak-fold',
        'folding second pair to a Maniac\'s small river bet still flags weak-fold (range eq ~60%)');
      // Leak tracker dilutes multiway equity (v1.8.200): the same weak-pair
      // fold against LAG's 250-into-500 turn bet flags weak-fold heads-up
      // (range eq ~55% vs a 35% line) but NOT with a caller ahead (true
      // multiway eq ~25% vs a 30% line) — the fold is correct there.
      var leakWeakMulti = postflopLeak([{ r: 9, s: 1 }, { r: 5, s: 0 }], 'lag', Q725, 'turn', 500, 250, 250,
        [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 250, pot: 750 },
         { t: 'action', street: 'turn', player: 2, action: 'call', bet: 250, pot: 1000 }], 'fold', 250);
      ok(!leakWeakMulti,
        'folding weak pair to LAG 250 + caller ahead is NOT a weak fold (multiway eq ~25% vs need + 10 = 30%)');
      var leakWeakHeadsUp = postflopLeak([{ r: 9, s: 1 }, { r: 5, s: 0 }], 'lag', Q725, 'turn', 500, 250, 250,
        [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 250, pot: 750 }], 'fold');
      ok(leakWeakHeadsUp && leakWeakHeadsUp.type === 'weak-fold',
        'the same weak-pair fold heads-up still flags weak-fold (range eq ~55% vs need + 10 = 35%)');
      // Leak tracker mirrors the v1.8.220 thin-value rule: checking second
      // pair on the river against a Station is a missed value bet (the coach
      // bets 1/2 pot there). v1.8.261: the same check against a LAG flags
      // too — the old "coach checks there too" premise was wrong: the coach
      // bets second pair in position vs a LAG (foldy 0.40 is neither foldy
      // nor sticky enough to matter; position is what bets). Out of position
      // the coach checks vs a LAG, so the OOP check is the no-flag control.
      var leakMissedThin = postflopLeak([{ r: 9, s: 0 }, { r: 3, s: 1 }], 'station', Q7259, 'river', 500, 0, 0, [], 'check');
      ok(leakMissedThin && leakMissedThin.type === 'missed-value',
        'checking second pair on the river vs a Station flags missed-value (coach bets 1/2 pot for thin value there)');
      var leakMissedThinLag = postflopLeak([{ r: 9, s: 0 }, { r: 3, s: 1 }], 'lag', Q7259, 'river', 500, 0, 0, [], 'check');
      ok(leakMissedThinLag && leakMissedThinLag.type === 'missed-value' &&
          leakMissedThinLag.why.indexOf('Bet second pair for thin value and protection') !== -1,
        'checking second pair on the river vs LAG flags missed-value in position (coach bets there, v1.8.261)');
      var leakMissedThinLagOop = postflopLeak([{ r: 9, s: 0 }, { r: 3, s: 1 }], 'lag', Q7259, 'river', 500, 0, 0, [], 'check', undefined, undefined, undefined, 1);
      ok(!leakMissedThinLagOop,
        'checking second pair on the river vs LAG out of position is NOT a missed value (coach checks there too)');
      // Leak tracker mirrors the v1.8.229 turn extension: checking second
      // pair on the turn against a Station is a missed value bet too (the
      // coach bets 1/2 pot there). Same v1.8.261 correction for the LAG:
      // in position it flags, out of position it does not.
      var Q729 = [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 9, s: 3 }];
      var leakMissedThinTurn = postflopLeak([{ r: 9, s: 0 }, { r: 3, s: 1 }], 'station', Q729, 'turn', 500, 0, 0, [], 'check');
      ok(leakMissedThinTurn && leakMissedThinTurn.type === 'missed-value',
        'checking second pair on the turn vs a Station flags missed-value (coach bets 1/2 pot for thin value there)');
      var leakMissedThinTurnLag = postflopLeak([{ r: 9, s: 0 }, { r: 3, s: 1 }], 'lag', Q729, 'turn', 500, 0, 0, [], 'check');
      ok(leakMissedThinTurnLag && leakMissedThinTurnLag.type === 'missed-value',
        'checking second pair on the turn vs LAG flags missed-value in position (coach bets there, v1.8.261)');
      var leakMissedThinTurnLagOop = postflopLeak([{ r: 9, s: 0 }, { r: 3, s: 1 }], 'lag', Q729, 'turn', 500, 0, 0, [], 'check', undefined, undefined, undefined, 1);
      ok(!leakMissedThinTurnLagOop,
        'checking second pair on the turn vs LAG out of position is NOT a missed value (coach checks there too)');
      // Leak tracker mirrors the v1.8.240 flop extension: checking second
      // pair on the flop against a Station is a missed value bet too (the
      // coach bets 1/2 pot there). Same v1.8.261 correction for the LAG.
      var Q72 = [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }];
      var leakMissedThinFlop = postflopLeak([{ r: 7, s: 0 }, { r: 11, s: 1 }], 'station', Q72, 'flop', 500, 0, 0, [], 'check');
      ok(leakMissedThinFlop && leakMissedThinFlop.type === 'missed-value',
        'checking second pair on the flop vs a Station flags missed-value (coach bets 1/2 pot for thin value there)');
      var leakMissedThinFlopLag = postflopLeak([{ r: 7, s: 0 }, { r: 11, s: 1 }], 'lag', Q72, 'flop', 500, 0, 0, [], 'check');
      ok(leakMissedThinFlopLag && leakMissedThinFlopLag.type === 'missed-value',
        'checking second pair on the flop vs LAG flags missed-value in position (coach bets there, v1.8.261)');
      var leakMissedThinFlopLagOop = postflopLeak([{ r: 7, s: 0 }, { r: 11, s: 1 }], 'lag', Q72, 'flop', 500, 0, 0, [], 'check', undefined, undefined, undefined, 1);
      ok(!leakMissedThinFlopLagOop,
        'checking second pair on the flop vs LAG out of position is NOT a missed value (coach checks there too)');
      // Leak tracker mirrors the coach's semi-bluff branch (v1.8.231):
      // checking a strong draw (flush + straight draw) heads-up against a
      // player who folds is a missed semi-bluff — the coach bets half pot
      // there, and the bet is worth ~180 chips over checking (2000 seeded
      // runouts, combo draw vs a loose range). Against a Station the coach
      // checks too, so no flag; a plain draw is only marginal advice, so
      // no flag either; multiway the coach checks too.
      var drawStrong = [{ r: 12, s: 1 }, { r: 11, s: 1 }];
      var T92 = [{ r: 10, s: 1 }, { r: 9, s: 1 }, { r: 2, s: 0 }];
      var leakMissedBluff = postflopLeak(drawStrong, 'lag', T92, 'flop', 500, 0, 0, [], 'check');
      ok(leakMissedBluff && leakMissedBluff.type === 'missed-value',
        'checking a strong draw on the flop vs LAG flags missed semi-bluff (coach semi-bluffs half pot there)');
      var leakMissedBluffStation = postflopLeak(drawStrong, 'station', T92, 'flop', 500, 0, 0, [], 'check');
      ok(!leakMissedBluffStation,
        'checking a strong draw vs a Station is NOT a missed semi-bluff (coach checks there too)');
      var leakMissedBluffPlain = postflopLeak([{ r: 14, s: 1 }, { r: 13, s: 1 }], 'lag',
        [{ r: 12, s: 1 }, { r: 7, s: 1 }, { r: 2, s: 0 }], 'flop', 500, 0, 0, [], 'check');
      ok(!leakMissedBluffPlain,
        'checking a plain flush draw vs LAG is NOT a missed semi-bluff (coach advice there is only marginal)');
      // Missed-value monster threshold (v1.8.237): a checked river with a full
      // house (madeStrength exactly 0.88) or a flush (0.80) is missed value —
      // the coach bets both for value when first to act. A straight (0.72) or
      // trips (~0.65) is not a monster, so no flag.
      var FH = [{ r: 14, s: 0 }, { r: 13, s: 1 }, { r: 13, s: 2 }, { r: 7, s: 3 }, { r: 2, s: 0 }];
      var leakMonsterFH = postflopLeak([{ r: 14, s: 1 }, { r: 14, s: 2 }], 'station', FH, 'river', 500, 0, 0, [], 'check');
      ok(leakMonsterFH && leakMonsterFH.type === 'missed-value',
        'checking a full house on the river flags missed-value (madeStrength 0.88, coach bets it for value)');
      var FL = [{ r: 12, s: 1 }, { r: 7, s: 1 }, { r: 2, s: 1 }, { r: 9, s: 0 }, { r: 3, s: 2 }];
      var leakMonsterFlush = postflopLeak([{ r: 14, s: 1 }, { r: 13, s: 1 }], 'station', FL, 'river', 500, 0, 0, [], 'check');
      ok(leakMonsterFlush && leakMonsterFlush.type === 'missed-value',
        'checking a flush on the river flags missed-value (madeStrength 0.80, coach bets it for value)');
      var ST = [{ r: 7, s: 3 }, { r: 6, s: 2 }, { r: 5, s: 0 }, { r: 13, s: 1 }, { r: 2, s: 2 }];
      var leakMonsterStraight = postflopLeak([{ r: 9, s: 0 }, { r: 8, s: 1 }], 'station', ST, 'river', 500, 0, 0, [], 'check');
      ok(!leakMonsterStraight,
        'checking a straight on the river is NOT a missed value (madeStrength 0.72, below the monster line)');
      var TR = [{ r: 12, s: 2 }, { r: 7, s: 3 }, { r: 2, s: 0 }, { r: 9, s: 1 }, { r: 3, s: 2 }];
      var leakMonsterTrips = postflopLeak([{ r: 12, s: 0 }, { r: 12, s: 1 }], 'station', TR, 'river', 500, 0, 0, [], 'check');
      ok(!leakMonsterTrips,
        'checking trips on the river is NOT a missed value (madeStrength ~0.65, below the monster line)');
      // Missed-value monster threshold, turn extension (v1.8.241): the coach
      // bets a monster for value on the turn too when first to act, so
      // checking one there is the same leak as on the river. Same line
      // (flush or better), same controls. The trap exception never fires
      // for any shipped bot (it needs bluff above 0.6 with aggression
      // above 0.5; the Maniac bluffs 0.55, Rohan bluffs 0.68 but never
      // raises), so the coach bets monsters on the turn against everyone.
      var FHT = [{ r: 14, s: 0 }, { r: 13, s: 1 }, { r: 13, s: 2 }, { r: 7, s: 3 }];
      var leakMonsterFHTurn = postflopLeak([{ r: 14, s: 1 }, { r: 14, s: 2 }], 'station', FHT, 'turn', 500, 0, 0, [], 'check');
      ok(leakMonsterFHTurn && leakMonsterFHTurn.type === 'missed-value',
        'checking a full house on the turn flags missed-value (madeStrength 0.88, coach bets it for value)');
      var FLT = [{ r: 12, s: 1 }, { r: 7, s: 1 }, { r: 2, s: 1 }, { r: 9, s: 0 }];
      var leakMonsterFlushTurn = postflopLeak([{ r: 14, s: 1 }, { r: 13, s: 1 }], 'station', FLT, 'turn', 500, 0, 0, [], 'check');
      ok(leakMonsterFlushTurn && leakMonsterFlushTurn.type === 'missed-value',
        'checking a flush on the turn flags missed-value (madeStrength 0.80, coach bets it for value)');
      var STT = [{ r: 7, s: 3 }, { r: 6, s: 2 }, { r: 5, s: 0 }, { r: 13, s: 1 }];
      var leakMonsterStraightTurn = postflopLeak([{ r: 9, s: 0 }, { r: 8, s: 1 }], 'station', STT, 'turn', 500, 0, 0, [], 'check');
      ok(!leakMonsterStraightTurn,
        'checking a straight on the turn is NOT a missed value (madeStrength 0.72, below the monster line)');
      var TRT = [{ r: 12, s: 2 }, { r: 7, s: 3 }, { r: 2, s: 0 }, { r: 9, s: 1 }];
      var leakMonsterTripsTurn = postflopLeak([{ r: 12, s: 0 }, { r: 12, s: 1 }], 'station', TRT, 'turn', 500, 0, 0, [], 'check');
      ok(!leakMonsterTripsTurn,
        'checking trips on the turn is NOT a missed value (madeStrength ~0.65, below the monster line)');
      var leakMissedBluffMulti = postflopLeak(drawStrong, 'lag', T92, 'flop', 500, 0, 0, [], 'check', 10);
      ok(!leakMissedBluffMulti,
        'checking a strong draw multiway is NOT a missed semi-bluff (coach checks multiway too)');
      // Leak tracker mirrors the v1.8.238/242 value rules: checking a monster
      // on the FLOP against a Station is a missed value bet (the coach bets
      // the full pot there), but a board flush on the river is not — the
      // coach checks it too, since the hero plays the board.
      var flopFlush = [{ r: 2, s: 2 }, { r: 7, s: 2 }, { r: 12, s: 2 }];
      var leakMonsterFlop = postflopLeak([{ r: 14, s: 2 }, { r: 13, s: 2 }], 'station', flopFlush, 'flop', 500, 0, 0, [], 'check');
      ok(leakMonsterFlop && leakMonsterFlop.type === 'missed-value',
        'checking a flopped flush vs a Station flags missed-value (coach bets the full pot there)');
      // Maniac trap (v1.8.246/256): checking the same flopped flush vs the
      // Maniac is the coach's advice (trap), so the tracker must NOT flag
      // it — the mirror is villain-aware. The tracker only knows the advice
      // through pendingAdvice (set by onAction in the live app), so the test
      // sets it explicitly; vs a LAG the coach bets, so the same check
      // still flags. Pending advice is reset after, so later leak tests
      // see the default null.
      H.setPendingAdvice({ advice: 'check', strength: 'marginal', lesson: '', street: 'flop' });
      var leakTrapManiac = postflopLeak([{ r: 14, s: 2 }, { r: 13, s: 2 }], 'maniac', flopFlush, 'flop', 500, 0, 0, [], 'check');
      ok(!leakTrapManiac,
        'checking a flopped flush vs the Maniac is NOT a missed value (coach traps — he bets into the check)');
      H.setPendingAdvice({ advice: 'bet', strength: 'strong', lesson: '', street: 'flop' });
      var leakMonsterLag = postflopLeak([{ r: 14, s: 2 }, { r: 13, s: 2 }], 'lag', flopFlush, 'flop', 500, 0, 0, [], 'check');
      ok(leakMonsterLag && leakMonsterLag.type === 'missed-value',
        'checking a flopped flush vs a LAG flags missed-value (coach bets there, no trap)');
      H.setPendingAdvice(null);
      var boardFlush = [{ r: 14, s: 2 }, { r: 13, s: 2 }, { r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 2 }];
      var leakBoardFlush = postflopLeak([{ r: 3, s: 0 }, { r: 4, s: 1 }], 'station', boardFlush, 'river', 500, 0, 0, [], 'check');
      ok(!leakBoardFlush,
        'checking a board flush on the river vs a Station is NOT a missed value (coach checks — the board plays itself)');
      // Nut-raise rule (v1.8.239/242): calling with a nut or strong made
      // hand against a bet is a missed value bet — the coach raises 4x
      // against a Station and 3x against everyone else. A call is a leak
      // even when the coach says all-in (short stack) or a small-bet 3x.
      var quads = [{ r: 12, s: 2 }, { r: 12, s: 1 }];
      var quadsTurn = [{ r: 12, s: 3 }, { r: 7, s: 2 }, { r: 2, s: 0 }, { r: 2, s: 1 }];
      var bet250 = [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 250, pot: 750 }];
      var leakNutCallStation = postflopLeak(quads, 'station', quadsTurn, 'turn', 500, 250, 250, bet250, 'call');
      ok(leakNutCallStation && leakNutCallStation.title === 'Didn\'t raise the nuts' &&
          leakNutCallStation.spot.indexOf('1,000') !== -1,
        'calling quads vs a Station\'s turn bet flags missed-value (coach raises to 1,000, 4x)');
      var leakNutCallRock = postflopLeak(quads, 'rock', quadsTurn, 'turn', 500, 250, 250, bet250, 'call');
      ok(leakNutCallRock && leakNutCallRock.title === 'Didn\'t raise the nuts' &&
          leakNutCallRock.spot.indexOf('750') !== -1,
        'calling quads vs a Rock\'s turn bet flags missed-value too (coach raises to 750, 3x)');
      var bet100 = [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 100, pot: 600 }];
      var leakNutCallNathanSmall = postflopLeak(quads, 'nathan', quadsTurn, 'turn', 500, 100, 100, bet100, 'call');
      ok(leakNutCallNathanSmall && leakNutCallNathanSmall.title === 'Didn\'t raise the nuts' &&
          leakNutCallNathanSmall.spot.indexOf('300') !== -1,
        'calling quads vs Nathan\'s small turn bet flags missed-value (coach raises to 300, 3x)');
      // Trips that are the effective nuts (v1.8.260) mirror the same way:
      // calling trip 7s on 7-2-5 vs a LAG bet flags, because the coach
      // raises to 750 there now. Trip 2s on Q-7-2 is the control — a higher
      // set is possible, the coach calls, so calling is not a leak.
      var tripsFlop = [{ r: 7, s: 2 }, { r: 2, s: 0 }, { r: 5, s: 3 }];
      var bet250flop = [{ t: 'action', street: 'flop', player: 1, action: 'bet', bet: 250, pot: 750 }];
      var leakTripsNutCall = postflopLeak([{ r: 7, s: 1 }, { r: 7, s: 0 }], 'lag', tripsFlop, 'flop', 500, 250, 250, bet250flop, 'call');
      ok(leakTripsNutCall && leakTripsNutCall.title === 'Didn\'t raise the nuts' &&
          leakTripsNutCall.spot.indexOf('750') !== -1,
        'calling trip 7s on 7-2-5 vs a LAG bet flags missed-value (coach raises to 750, 3x, v1.8.260)');
      var tripsLowFlop = [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 3 }];
      var leakTripsLowCall = postflopLeak([{ r: 2, s: 1 }, { r: 2, s: 0 }], 'lag', tripsLowFlop, 'flop', 500, 250, 250, bet250flop, 'call');
      ok(!leakTripsLowCall,
        'calling trip 2s on Q-7-2 vs a LAG bet is NOT a missed value (coach calls — a higher set is possible)');
      // Controls: the coach says call here, so calling is not a leak.
      // Commit-call: the nut flush with a 400 stack and a 100 bet — the pot
      // is nearly as big as the stack, so the coach calls. Veto: a made
      // hand on the river against a trapper who called a big bet earlier
      // and bet first on the river — the coach calls the narrowed range.
      var nutFlushTurn = [{ r: 2, s: 2 }, { r: 7, s: 2 }, { r: 12, s: 2 }, { r: 9, s: 0 }];
      var leakNutCallCommit = postflopLeak([{ r: 14, s: 2 }, { r: 13, s: 2 }], 'station', nutFlushTurn, 'turn', 500, 100, 100, bet100, 'call', undefined, undefined, 400);
      ok(!leakNutCallCommit,
        'calling the nut flush at SPR under 1 with a cheap price is NOT a missed value (coach calls — commit-call)');
      var vetoTimeline = [
        { t: 'action', street: 'flop', player: 0, action: 'bet', bet: 300, pot: 700 },
        { t: 'action', street: 'flop', player: 1, action: 'call', bet: 300, pot: 1000 },
        { t: 'action', street: 'river', player: 1, action: 'bet', bet: 250, pot: 1250 }
      ];
      var vetoRiver = [{ r: 12, s: 2 }, { r: 7, s: 2 }, { r: 2, s: 2 }, { r: 2, s: 0 }, { r: 11, s: 1 }];
      var leakNutCallVeto = postflopLeak([{ r: 13, s: 2 }, { r: 9, s: 2 }], 'nathan', vetoRiver, 'river', 1000, 250, 250, vetoTimeline, 'call');
      ok(!leakNutCallVeto,
        'calling a made flush on the river vs a trapper who called big earlier is NOT a missed value (coach calls — river veto)');
      // Nut-raise sizing (v1.8.239/242): raising the nuts below the
      // coach's target is a missed value bet — 4x against a Station, 3x
      // against a Rock or on a small bet. At the target there is no flag.
      var leakNutSmallStation = postflopLeak(quads, 'station', quadsTurn, 'turn', 500, 250, 250, bet250, 'raise', undefined, 750);
      ok(leakNutSmallStation && leakNutSmallStation.title === 'Under-raised the nuts' &&
          leakNutSmallStation.spot.indexOf('1,000') !== -1,
        'raising quads to 750 vs a Station\'s 250 bet flags under-raised (coach raises to 1,000, 4x)');
      var leakNutFullStation = postflopLeak(quads, 'station', quadsTurn, 'turn', 500, 250, 250, bet250, 'raise', undefined, 1000);
      ok(!leakNutFullStation,
        'raising quads to 1,000 vs a Station is NOT under-raised (coach target met)');
      var leakNutSmallRock = postflopLeak(quads, 'rock', quadsTurn, 'turn', 500, 250, 250, bet250, 'raise', undefined, 750);
      ok(!leakNutSmallRock,
        'raising quads to 750 vs a Rock is NOT under-raised (coach raises 3x there)');
      var leakNutSmallBetStation = postflopLeak(quads, 'station', quadsTurn, 'turn', 500, 100, 100, bet100, 'raise', undefined, 300);
      ok(!leakNutSmallBetStation,
        'raising quads to 300 on a small bet vs a Station is NOT under-raised (coach raises 3x on small bets)');
      var leakNutSmallBetNathan = postflopLeak(quads, 'nathan', quadsTurn, 'turn', 500, 100, 100, bet100, 'raise', undefined, 300);
      ok(!leakNutSmallBetNathan,
        'raising quads to 300 on a small bet vs Nathan is NOT under-raised (trapper carve-out: 3x or 4x both plausible)');
      // Under-bet value (v1.8.238): betting less than the full pot for
      // value against a Station heads-up is a missed value bet — the coach
      // bets the full pot there. At the full pot, against a LAG, multiway,
      // or all-in, there is no flag.
      var tpFlop = [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }];
      var leakUnderBet = postflopLeak([{ r: 13, s: 0 }, { r: 12, s: 0 }], 'station', tpFlop, 'flop', 500, 0, 0, [], 'bet', undefined, 250);
      ok(leakUnderBet && leakUnderBet.title === 'Under-bet for value' &&
          leakUnderBet.spot.indexOf('500') !== -1,
        'betting half pot with top pair vs a Station flags under-bet for value (coach bets the full pot)');
      var leakFullBet = postflopLeak([{ r: 13, s: 0 }, { r: 12, s: 0 }], 'station', tpFlop, 'flop', 500, 0, 0, [], 'bet', undefined, 500);
      ok(!leakFullBet,
        'betting the full pot with top pair vs a Station is NOT under-bet (coach target met)');
      var leakUnderBetLag = postflopLeak([{ r: 13, s: 0 }, { r: 12, s: 0 }], 'lag', tpFlop, 'flop', 500, 0, 0, [], 'bet', undefined, 250);
      ok(!leakUnderBetLag,
        'betting half pot with top pair vs LAG is NOT under-bet (coach bets about a third there)');
      var leakUnderBetMulti = postflopLeak([{ r: 13, s: 0 }, { r: 12, s: 0 }], 'station', tpFlop, 'flop', 500, 0, 0, [], 'bet', 10, 250);
      ok(!leakUnderBetMulti,
        'betting half pot with top pair multiway is NOT under-bet (coach bets about half multiway)');
      var leakUnderBetAllIn = postflopLeak([{ r: 13, s: 0 }, { r: 12, s: 0 }], 'station', tpFlop, 'flop', 500, 0, 0, [], 'bet', undefined, 400, 400);
      ok(!leakUnderBetAllIn,
        'betting all-in (400 stack) with top pair vs a Station is NOT under-bet (coach shoves there)');
    })();

    var jsErrs = errors.filter(function (m) { return m.indexOf('navigation') === -1; });
    ok(!jsErrs.length, 'no js errors (' + jsErrs.join('; ') + ')');
  } catch (e) {
    fail++;
    console.log('FAIL: exception ' + (e && e.message));
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed (coach-advice)');
  process.exit(fail ? 1 : 0);
}, 1500);
