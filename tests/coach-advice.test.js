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
    var r = H.recap(7);
    ok(!!r, 'recap built when strong decisions exist');
    ok(r.html.indexOf('Hand #7 recap') !== -1, 'recap names the hand');
    ok(r.html.indexOf('coach-recap-good') !== -1, 'recap has a praise line');
    ok(r.html.indexOf('coach-recap-bad') !== -1, 'recap has a leak line');
    ok(r.html.indexOf('coach-head') === -1, 'recap has no duplicate Coach header');
    ok(r.lines.length === 2 && r.lines[0][0] === '+' && r.lines[1][0] === '-',
      'plain-text lines for history use +/- prefixes');
    ok(r.html.indexOf('<script') === -1, 'recap HTML has no script tags');

    // Marginal-only decisions -> no recap (avoid noise).
    H.setDecisions([{ street: 'flop', advice: 'call', strength: 'marginal',
      lesson: 'x', action: 'call', followed: true }]);
    ok(H.recap(8) === null, 'no recap when nothing strong happened');
    H.setDecisions([]);
    ok(H.recap(9) === null, 'no recap with zero decisions');

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
    var r2 = H.recap(10);
    ok(r2.html.indexOf('<img src=x>') === -1, 'recap escapes lesson text');

    var jsErrs = errors.filter(function (m) { return m.indexOf('navigation') === -1; });
    ok(!jsErrs.length, 'no js errors (' + jsErrs.join('; ') + ')');
  } catch (e) {
    fail++;
    console.log('FAIL: exception ' + (e && e.message));
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed (coach-advice)');
  process.exit(fail ? 1 : 0);
}, 1500);
