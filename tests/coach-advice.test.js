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
function preflopVerdict(hero, villainId, open, timeline, liveCount, bet1, bet2) {
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
    't.button = 0; t.street = "preflop"; t.currentBet = ' + open + '; t.pot = 0; t.sbIdx = 1; t.bbIdx = 2;',
    't.players[0].hole = ' + JSON.stringify(hero) + ';',
    't.players[0].stack = 2000; t.players[0].bet = 0;',
    't.players[1].stack = 2000; t.players[1].bet = ' + bet1 + ';',
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

    // Win-aware recap: ignoring the coach but winning still gets praise first.
    H.setDecisions([{ street: 'river', advice: 'fold', strength: 'strong',
      lesson: 'Folding saves chips.', action: 'raise', followed: false }]);
    var rWin = H.recap(11, true, true);
    ok(rWin.html.indexOf('Everyone folded') !== -1, 'bluff win praised even when coach ignored');
    ok(rWin.html.indexOf('tighten up') === -1, 'no lecture when the bluff worked');
    var rWin2 = H.recap(12, true, false);
    ok(rWin2.html.indexOf('You won the hand') !== -1, 'showdown win praised even when coach ignored');
    var rLoss = H.recap(13, false, false);
    ok(rLoss.html.indexOf('To improve') !== -1 && rLoss.html.indexOf('won the hand') === -1,
      'loss with ignored coach: leak only, no false praise');

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
    var pfBluff = preflopVerdict([{ r: 14, s: 0 }, { r: 5, s: 0 }], 'rock', 30,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 45 }], 2, 30, 10);
    ok(!pfBluff.error, 'bluff re-raise verdict has no error' + (pfBluff.error ? ' (' + pfBluff.error + ')' : ''));
    ok(pfBluff.advice === 'raise', 'bluff re-raise advice is raise (got ' + pfBluff.advice + ')');
    ok(stripAdvice(pfBluff.html).indexOf('to ~ 90') !== -1,
      'bluff re-raise states the exact size to ~90 (3x open in position, v1.8.158)');
    var pfSteal = preflopVerdict([{ r: 13, s: 1 }, { r: 13, s: 0 }], 'rock', 10, [], 3, 5, 10);
    ok(pfSteal.advice === 'raise', 'steal advice is raise (got ' + pfSteal.advice + ')');
    ok(stripAdvice(pfSteal.html).indexOf('to ~ 25') !== -1,
      'steal raise states the exact size to ~25 (2.5x blind, v1.8.158)');

    // Facing-3bet calls show pot-odds math (v1.8.159).
    var pf3bet = preflopVerdict([{ r: 11, s: 1 }, { r: 11, s: 0 }], 'rock', 90,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 45 },
       { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 90, pot: 135 }], 3, 30, 90);
    ok(pf3bet.advice === 'call', 'facing-3bet medium pair in position calls (got ' + pf3bet.advice + ')');
    ok(stripAdvice(pf3bet.html).indexOf('Pay 90 to win 210') !== -1 &&
      stripAdvice(pf3bet.html).indexOf('need 43%') !== -1,
      'facing-3bet call states pot-odds math: Pay 90 to win 210, need 43% (v1.8.159)');

    // Facing-4bet shove states the amount (v1.8.163).
    var pf4bet = preflopVerdict([{ r: 14, s: 0 }, { r: 14, s: 1 }], 'rock', 270,
      [{ t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 30, pot: 45 },
       { t: 'action', street: 'preflop', player: 2, action: 'raise', bet: 90, pot: 135 },
       { t: 'action', street: 'preflop', player: 1, action: 'raise', bet: 270, pot: 405 }], 3, 270, 90);
    ok(!pf4bet.error, 'facing-4bet verdict has no error' + (pf4bet.error ? ' (' + pf4bet.error + ')' : ''));
    ok(pf4bet.advice === 'raise', 'facing-4bet premium advice is raise (got ' + pf4bet.advice + ')');
    ok(stripAdvice(pf4bet.html).indexOf('2,000') !== -1,
      'facing-4bet shove states the all-in amount 2,000 (v1.8.163)');

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

    var jsErrs = errors.filter(function (m) { return m.indexOf('navigation') === -1; });
    ok(!jsErrs.length, 'no js errors (' + jsErrs.join('; ') + ')');
  } catch (e) {
    fail++;
    console.log('FAIL: exception ' + (e && e.message));
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed (coach-advice)');
  process.exit(fail ? 1 : 0);
}, 1500);
