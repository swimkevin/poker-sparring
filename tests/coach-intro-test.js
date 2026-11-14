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
  ['cards', 'evaluator', 'equity', 'engine', 'bots', 'names', 'pushfold', 'stats', 'replay', 'room-server', 'netplay', 'ui', 'online', 'app']
    .forEach(function (f) { var s = d.createElement('script'); s.textContent = fs.readFileSync(path.join(dir, 'js', f + '.js'), 'utf8'); d.head.appendChild(s); });
  d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return { w: w, d: d };
}

var t = boot();
t.w.localStorage.clear();
var quick = t.d.getElementById('btn-quick');
check(!!quick, 'quick deal button exists');
quick.click();

setTimeout(function () {
  var tip = t.d.getElementById('coach-tip');
  check(!tip.hidden && tip.innerHTML.indexOf('coach-intro-ok') !== -1, 'first session shows coach intro with dismiss button');
  var btn = t.d.getElementById('coach-intro-ok');
  check(!!btn, 'dismiss button present');
  btn.click();
  check(tip.hidden, 'dismiss hides the intro');
  check(t.w.localStorage.getItem('ps_coach_intro_seen') === '1', 'dismiss persists the seen flag');

  var t2 = boot();
  t2.w.localStorage.setItem('ps_coach_intro_seen', '1');
  var quick2 = t2.d.getElementById('btn-quick');
  quick2.click();
  setTimeout(function () {
    var tip2 = t2.d.getElementById('coach-tip');
    check(tip2.innerHTML.indexOf('coach-intro-ok') === -1, 'second session does not re-show the intro');
    runMobileScenario();
  }, 1200);
}, 1200);

function waitFor(fn, timeoutMs, done) {
  var start = Date.now();
  var iv = setInterval(function () {
    if (fn() || Date.now() - start > timeoutMs) { clearInterval(iv); done(fn()); }
  }, 400);
}

function runMobileScenario() {
  var t3 = boot();
  t3.w.matchMedia = function (q) {
    return { matches: q.indexOf('900px') !== -1, media: q,
      addEventListener: function () {}, removeEventListener: function () {} };
  };
  t3.w.localStorage.clear();
  var quick3 = t3.d.getElementById('btn-quick');
  check(!!quick3, 'mobile: quick deal button exists');
  quick3.click();
  setTimeout(function () {
    var tip3 = t3.d.getElementById('coach-tip');
    var coachTab = t3.d.querySelector('.mtab[data-tab="coach"]');
    check(!tip3.hidden && tip3.innerHTML.indexOf('coach-intro-ok') !== -1, 'mobile: first session shows coach intro');
    check(!!coachTab && !coachTab.classList.contains('has-new'), 'mobile: Coach tab does NOT light up for the off-turn intro (only fresh advice on hero turn lights it)');
    waitFor(function () { return tip3.innerHTML.indexOf('coach-intro-ok') === -1; }, 25000, function (verdictArrived) {
      check(verdictArrived, 'mobile: a hero turn replaced the intro with a verdict (a hero action happened)');
      check(t3.w.localStorage.getItem('ps_coach_intro_seen') !== '1', 'mobile: intro is NOT marked seen when the Coach panel was never opened');
      check(coachTab.classList.contains('has-new'), 'mobile: dot is still there after the verdict, until the tab is opened');
      coachTab.click();
      check(!coachTab.classList.contains('has-new'), 'mobile: opening the Coach tab clears the dot');
      check(t3.w.localStorage.getItem('ps_coach_intro_seen') === '1', 'mobile: opening the Coach tab marks the intro seen (the player found the coach)');
      runDesktopScenario();
    });
  }, 1200);
}

function runDesktopScenario() {
  var t4 = boot();
  t4.w.localStorage.clear();
  t4.d.getElementById('btn-quick').click();
  setTimeout(function () {
    var tip4 = t4.d.getElementById('coach-tip');
    waitFor(function () { return tip4.innerHTML.indexOf('coach-intro-ok') === -1; }, 25000, function (verdictArrived) {
      check(verdictArrived, 'desktop: a hero turn replaced the intro with a verdict');
      check(t4.w.localStorage.getItem('ps_coach_intro_seen') === '1', 'desktop: intro IS marked seen at the first hero action (side panel is visible)');
      if (failures) { console.log(failures + ' intro failures'); }
      else { console.log('COACH INTRO TEST PASSED'); }
      process.exit(failures ? 1 : 0);
    });
  }, 1200);
}
