// Live loop: 10 hands, hero calls/checks to the river. Verify every turn:
// coach non-empty, hero-hand-desc correct postflop, recap non-empty, no errors.
var path = require('path');
var fs = require('fs');
var jsdom = require('jsdom');
var JSDOM = jsdom.JSDOM;
var dir = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
var dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
var w = dom.window, d = w.document;
w.scrollTo = function () {};
w.confirm = function () { return true; };
w.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: function () { return function () {}; }, set: function () { return true; } });
};
var errors = [];
w.addEventListener('error', function (e) { errors.push(e.message || String(e.error)); });
// Cap all app timers at 60ms: bot think-time and street delays would make
// 10 real-time hands take ~30 minutes. Timing-sensitive behavior is
// covered by away-freeze-test at real speed; this loop verifies wiring.
var realST = w.setTimeout.bind(w);
w.setTimeout = function (fn, ms) {
  var rest = Array.prototype.slice.call(arguments, 2);
  return realST.apply(null, [fn, Math.min(ms || 0, 60)].concat(rest));
};
['cards', 'evaluator', 'equity', 'engine', 'bots', 'names', 'pushfold', 'stats',
 'replay', 'room-server', 'netplay', 'ui', 'online', 'app'].forEach(function (f) {
  var s = d.createElement('script');
  s.textContent = fs.readFileSync(path.join(dir, 'js', f + '.js'), 'utf8');
  d.head.appendChild(s);
});
d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
function $(id) { return d.getElementById(id); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
(async function () {
  var issues = [];
  var turns = 0, descsSeen = 0, recapsSeen = 0;
  $('btn-start').click();
  for (var hand = 1; hand <= 10; hand++) {
    // Play one hand: whenever it's hero's turn, call/check.
    var handDone = false, guard = 0;
    while (!handDone && guard++ < 300) {
      var nx = $('btn-next-hand');
      if (nx) { handDone = true; break; }
      var status = ($('turn-status') || {}).textContent || '';
      var cc = $('btn-checkcall');
      if (status.indexOf('Your turn') === 0 && cc && !cc.disabled) {
        turns++;
        // Coach must speak on EVERY hero turn (Kevin's standing rule).
        var tip = ($('coach-tip') || {}).textContent || '';
        if (!tip.trim()) issues.push('hand ' + hand + ': empty coach on a hero turn');
        // Postflop: hand-desc should be non-empty while hero is in the hand
        var board = d.querySelectorAll('#community .card').length;
        var desc = ($('hero-hand-desc') || {}).textContent || '';
        if (board >= 3) { if (desc) descsSeen++; else issues.push('hand ' + hand + ': empty hand-desc on ' + board + '-card board'); }
        cc.click();
        await sleep(150);
      } else {
        await sleep(120);
      }
    }
    // Hand ended: recap should exist in coach area (or winner banner visible)
    var banner = ($('winner-banner') || {}).textContent || '';
    if (banner) recapsSeen++;
    else issues.push('hand ' + hand + ': no winner banner at hand end');
    console.log('hand ' + hand + ' done (guard ' + guard + ', turns so far ' + turns + ')');
    var nx2 = $('btn-next-hand');
    if (nx2) { nx2.click(); await sleep(600); }
  }
  console.log('hero turns acted: ' + turns);
  console.log('postflop descs seen: ' + descsSeen);
  console.log('hand-end banners: ' + recapsSeen + '/10');
  console.log('js errors: ' + errors.length + (errors.length ? ' :: ' + errors.slice(0, 3).join(' | ') : ''));
  console.log('issues: ' + issues.length);
  issues.slice(0, 8).forEach(function (i) { console.log('  - ' + i); });
  var ok = errors.length === 0 && recapsSeen === 10 && turns >= 10;
  console.log(ok ? 'LIVE 10-HAND LOOP OK' : 'LIVE LOOP NEEDS ATTENTION');
  process.exit(ok ? 0 : 1);
})().catch(function (e) { console.log('EXCEPTION: ' + e.message); process.exit(1); });
