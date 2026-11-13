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
function preflopVerdict(hero, villainId, open, timeline, liveCount, bet1, bet2, heroStack, villainStack, button) {
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
    't.players[0].stack = ' + (heroStack == null ? 2000 : heroStack) + '; t.players[0].bet = 0;',
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
    var limp3 = [1, 2, 3].map(function (p) {
      return { t: 'action', street: 'preflop', player: p, action: 'call', bet: 10, pot: 15 };
    });
    var pfIso3 = preflopVerdict([{ r: 14, s: 0 }, { r: 14, s: 1 }], 'rock', 10, limp3, 8, 10, 10);
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

    // Range note respects a tight villain (v1.8.230): a medium bet from Rock
    // does not make him "wide" — the note says the bet barely narrows him
    // instead of claiming pairs, draws, and air are all in there.
    var wideRock = postflopVerdict([{ r: 14, s: 1 }, { r: 13, s: 1 }], 'rock', 'turn', 250, 500,
      [{ r: 12, s: 1 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 5, s: 3 }], 2000, 2000,
      [{ t: 'action', street: 'turn', player: 1, action: 'bet', bet: 250, pot: 750 }], 2);
    ok(wideRock.advice === 'raise', 'nut flush draw semi-bluff raises vs Rock medium bet (got ' + wideRock.advice + ')');
    ok(stripAdvice(wideRock.html).indexOf('bet a medium size') !== -1,
      'range note for a tight villain names the medium bet, not a wide range');
    ok(stripAdvice(wideRock.html).indexOf('plays a wide range') === -1,
      'range note for a tight villain never claims he plays a wide range');
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
      function postflopLeak(hero, villainId, board, street, pot, currentBet, villainBet, timeline, action, callerBet) {
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
          't.button = 0; t.street = "' + street + '"; t.currentBet = ' + currentBet + '; t.pot = ' + pot + ';',
          't.players[0].hole = ' + JSON.stringify(hero) + ';',
          't.players[0].stack = 2000; t.players[0].bet = 0;',
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
        return H.detectLeak(action);
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
      // bets 1/2 pot there), but against LAG the coach checks too, so no flag.
      var leakMissedThin = postflopLeak([{ r: 9, s: 0 }, { r: 3, s: 1 }], 'station', Q7259, 'river', 500, 0, 0, [], 'check');
      ok(leakMissedThin && leakMissedThin.type === 'missed-value',
        'checking second pair on the river vs a Station flags missed-value (coach bets 1/2 pot for thin value there)');
      var leakMissedThinLag = postflopLeak([{ r: 9, s: 0 }, { r: 3, s: 1 }], 'lag', Q7259, 'river', 500, 0, 0, [], 'check');
      ok(!leakMissedThinLag,
        'checking second pair on the river vs LAG is NOT a missed value (coach checks there too)');
      // Leak tracker mirrors the v1.8.229 turn extension: checking second
      // pair on the turn against a Station is a missed value bet too (the
      // coach bets 1/2 pot there), but against LAG the coach checks, so no flag.
      var Q729 = [{ r: 12, s: 2 }, { r: 7, s: 1 }, { r: 2, s: 0 }, { r: 9, s: 3 }];
      var leakMissedThinTurn = postflopLeak([{ r: 9, s: 0 }, { r: 3, s: 1 }], 'station', Q729, 'turn', 500, 0, 0, [], 'check');
      ok(leakMissedThinTurn && leakMissedThinTurn.type === 'missed-value',
        'checking second pair on the turn vs a Station flags missed-value (coach bets 1/2 pot for thin value there)');
      var leakMissedThinTurnLag = postflopLeak([{ r: 9, s: 0 }, { r: 3, s: 1 }], 'lag', Q729, 'turn', 500, 0, 0, [], 'check');
      ok(!leakMissedThinTurnLag,
        'checking second pair on the turn vs LAG is NOT a missed value (coach checks there too)');
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
      var leakMissedBluffMulti = postflopLeak(drawStrong, 'lag', T92, 'flop', 500, 0, 0, [], 'check', 10);
      ok(!leakMissedBluffMulti,
        'checking a strong draw multiway is NOT a missed semi-bluff (coach checks multiway too)');
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
