// Chip conservation with bot rebuys OFF (v1.8.300): a cash game must neither
// create nor destroy chips when no rebuy is possible. The sub-half-stack bot
// top-up used to ignore the bot-rebuys switch and mint chips (a bot at 228
// reappeared at 1,000: +772 per top-up, caught live at +516 and +1,544).
// Boots the REAL app in jsdom and plays 10 hands, check/call only.
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
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function num(s) { var m = String(s == null ? '' : s).replace(/,/g, '').match(/-?\d+/); return m ? parseInt(m[0], 10) : NaN; }

var dom = new JSDOM(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'),
  { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
var w = dom.window, d = w.document;
w.scrollTo = function () {};
w.confirm = function () { return true; };
w.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: function () { return function () {}; }, set: function () { return true; } });
};
var errors = [];
w.addEventListener('error', function (e) { errors.push(e.message || String(e.error)); });
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

function total() {
  var t = 0;
  d.querySelectorAll('#seats .seat .pstack').forEach(function (e) {
    var v = num(e.textContent);
    if (!isNaN(v)) t += v;
  });
  var p = num((d.getElementById('pot-display') || {}).textContent);
  return t + (isNaN(p) ? 0 : p);
}
function breakdown() {
  var out = [];
  d.querySelectorAll('#seats .seat').forEach(function (s) {
    var nm = (s.querySelector('.pname') || {}).textContent || '';
    if (nm && nm !== 'Open') out.push(nm + '=' + ((s.querySelector('.pstack') || {}).textContent || ''));
  });
  return out.join(' ');
}

(async function () {
  var rb = d.getElementById('cfg-botrebuys');
  if (rb) rb.checked = false;
  d.getElementById('btn-start').click();
  await sleep(400);
  var base = total();
  check(base === 8000, 'baseline is 8 x 1,000 chips (got ' + base + ')');
  var cur = base, banners = 0, rebuys = 0;
  for (var h = 1; h <= 10; h++) {
    var guard = 0, done = false, rebought = false;
    while (!done && guard++ < 400) {
      if (d.getElementById('btn-next-hand')) { done = true; break; }
      var st = ((d.getElementById('turn-status') || {}).textContent || '');
      var cc = d.getElementById('btn-checkcall');
      if (st.indexOf('Your turn') === 0 && cc && !cc.disabled) { cc.click(); await sleep(150); }
      else {
        var felted = d.querySelector('#modal-root .modal[aria-label^="You are felted"]');
        if (felted) {
          var rbb = felted.querySelector('button.primary');
          if (rbb) { rbb.click(); rebought = true; await sleep(150); }
        }
        await sleep(120);
      }
    }
    check(done, 'hand ' + h + ' finishes');
    if (!done) break;
    if ((d.getElementById('winner-banner') || {}).textContent) banners++;
    await sleep(300);
    if (d.querySelector('#modal-root .modal[aria-label^="You are felted"]')) {
      var rbb2 = d.querySelector('#modal-root .modal[aria-label^="You are felted"] button.primary');
      if (rbb2) { rbb2.click(); rebought = true; await sleep(300); }
    }
    var tot = total();
    if (rebought) { rebuys++; cur = tot; console.log('ok: hand ' + h + ' hero rebuy, re-baselined to ' + tot); }
    else check(tot === cur, 'hand ' + h + ' chips conserved (' + tot + ' vs ' + cur + ' :: ' + breakdown() + ')');
    if (h < 10) { var nx = d.getElementById('btn-next-hand'); if (nx) nx.click(); await sleep(600); }
  }
  check(banners === 10, 'winner banner on all 10 hands (' + banners + '/10)');
  check(rebuys <= 2, 'hero rebuys stay rare in a call-only loop (' + rebuys + ')');
  check(errors.length === 0, 'zero js errors (' + errors.length + (errors.length ? ': ' + errors.slice(0, 2).join(' ; ') : '') + ')');
  console.log(failures ? failures + ' chip conservation failures' : 'CHIP CONSERVATION OK');
  process.exit(failures ? 1 : 0);
})().catch(function (e) { console.log('EXCEPTION: ' + (e && e.stack || e)); process.exit(1); });
