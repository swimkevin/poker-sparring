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
    if (failures) { console.log(failures + ' intro failures'); }
    else { console.log('COACH INTRO TEST PASSED'); }
    process.exit(failures ? 1 : 0);
  }, 1200);
}, 1200);
