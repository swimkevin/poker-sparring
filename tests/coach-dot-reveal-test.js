// Coach dot + advice persistence + hand-end Show hands.
// Boots the REAL app in jsdom. Kevin's iPhone report, 2026-11-15: the Coach
// tab lit up for the first-run intro (written off-turn), advice vanished
// between turns, and folded hands stayed mucked at hand end with no way to
// see them for practice.
var path = require('path');
var fs = require('fs');
var jsdom = require('jsdom');
var JSDOM = jsdom.JSDOM;
var dir = path.join(__dirname, '..');

var failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.log('FAIL: ' + msg); }
  else { console.log('ok: ' + msg); }
}

function boot() {
  var dom = new JSDOM(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'),
    { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
  var w = dom.window, d = w.document;
  w.scrollTo = function () {};
  w.confirm = function () { return true; };
  ['cards', 'evaluator', 'equity', 'engine', 'bots', 'names', 'pushfold', 'stats', 'replay', 'room-server', 'netplay', 'ui', 'online', 'app']
    .forEach(function (f) { var s = d.createElement('script'); s.textContent = fs.readFileSync(path.join(dir, 'js', f + '.js'), 'utf8'); d.head.appendChild(s); });
  d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return { w: w, d: d };
}

function coachTab(d) { return d.querySelector('.mtab[data-tab="coach"]'); }
function tableTab(d) { return d.querySelector('.mtab[data-tab="table"]'); }
function openCoach(d) {
  tableTab(d).click();
  coachTab(d).click();
}
function closeCoach(d) { tableTab(d).click(); }

var t = boot();
t.w.localStorage.clear();
var ct = coachTab(t.d);

t.w.UI.coachTip('<p>off-turn note</p>');
check(!ct.classList.contains('has-new'), 'dot: an off-turn tip does not light the Coach dot');

t.w.UI.coachTip('<p>fresh advice</p>', { fresh: true });
check(ct.classList.contains('has-new'), 'dot: fresh advice for hero turn lights the Coach dot');

openCoach(t.d);
check(!ct.classList.contains('has-new'), 'dot: opening the Coach tab clears the dot');
check(t.d.getElementById('mp-body').innerHTML.indexOf('fresh advice') !== -1, 'persist: Coach tab shows the fresh advice');

closeCoach(t.d);
t.w.UI.coachTip(null);
openCoach(t.d);
check(t.d.getElementById('mp-body').innerHTML.indexOf('fresh advice') !== -1, 'persist: advice stays in the Coach tab after the turn passes');

closeCoach(t.d);
t.w.UI.coachTip('<p>new advice</p>');
openCoach(t.d);
var bodyAfterNew = t.d.getElementById('mp-body').innerHTML;
check(bodyAfterNew.indexOf('new advice') !== -1 && bodyAfterNew.indexOf('fresh advice') === -1, 'persist: new advice replaces the old advice');

closeCoach(t.d);
t.w.UI.coachTip('New here? This is your <b>coach</b> — it explains every spot. <button id="coach-intro-ok" class="ghost">Got it</button>');
check(!ct.classList.contains('has-new'), 'dot: the first-run intro does not light the Coach dot');
openCoach(t.d);
check(t.d.getElementById('mp-body').innerHTML.indexOf('New here?') !== -1, 'persist: Coach tab shows the intro');
closeCoach(t.d);
t.w.UI.coachTip(null);
openCoach(t.d);
check(t.d.getElementById('mp-body').innerHTML.indexOf('New here?') !== -1, 'persist: intro stays until the first real advice replaces it');

function faceUpCount(d, seat) {
  var box = d.getElementById('seat-' + seat);
  if (!box) return -1;
  var pc = box.querySelector('.pcards');
  if (!pc) return -1;
  return pc.querySelectorAll('.card:not(.back)').length;
}

function runHandEndScenario() {
  var t2 = boot();
  t2.w.localStorage.clear();
  t2.w.localStorage.setItem('ps_coach_intro_seen', '1');
  var d2 = t2.d;
  var quick = d2.getElementById('btn-quick');
  check(!!quick, 'reveal: quick deal button exists');
  quick.click();
  var waited = 0;
  var iv = setInterval(function () {
    waited += 500;
    try {
      var next = d2.getElementById('btn-next-hand');
      if (next) {
        clearInterval(iv);
        var pause = d2.getElementById('btn-pause-auto');
        if (pause) pause.click();
        var showBtn = d2.getElementById('btn-show-hands');
        if (showBtn) {
          check(true, 'reveal: Show hands button appears at hand end when hands are mucked');
          var muckedBefore = 0;
          for (var i = 1; i <= 7; i++) if (faceUpCount(d2, i) === 0) muckedBefore++;
          check(muckedBefore >= 1, 'reveal: at least one opponent hand is mucked by default at hand end (' + muckedBefore + ')');
          showBtn.click();
          check(showBtn.disabled && showBtn.textContent === 'Hands shown', 'reveal: tapping Show hands confirms it');
          var allUp = true;
          for (var j = 1; j <= 7; j++) if (faceUpCount(d2, j) !== 2) allUp = false;
          check(allUp, 'reveal: after tapping, every opponent shows 2 face-up cards');
        } else {
          var allUpAlready = true;
          for (var k = 1; k <= 7; k++) if (faceUpCount(d2, k) !== 2) allUpAlready = false;
          check(allUpAlready, 'reveal: no Show hands button because every opponent already shows (all-showdown hand)');
        }
        next.click();
        finish();
        return;
      }
      var foldBtn = d2.getElementById('btn-fold');
      if (foldBtn && !foldBtn.disabled) foldBtn.click();
      if (waited > 150000) {
        clearInterval(iv);
        check(false, 'reveal: hand did not reach hand end in 150s');
        finish();
      }
    } catch (e) {
      clearInterval(iv);
      check(false, 'reveal: exception while waiting for hand end: ' + e.message);
      finish();
    }
  }, 500);
}

function finish() {
  if (failures) { console.log(failures + ' coach dot/reveal failures'); }
  else { console.log('COACH DOT/REVEAL TEST PASSED'); }
  process.exit(failures ? 1 : 0);
}

runHandEndScenario();
