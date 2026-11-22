// History replay buttons (v1.8.300): every Stats history row must carry a
// replay button that opens the right hand in the replayer. onHandEnd nulled
// handRec before recordHand read it, so recId was always null and the button
// never rendered. Boots the REAL app in jsdom, plays 2 hands, then drives the
// Stats history list into the replayer and back.
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
function txt(el) { return el ? (el.textContent || '') : ''; }

(async function () {
  var rb = d.getElementById('cfg-botrebuys');
  if (rb) rb.checked = false;
  d.getElementById('btn-start').click();
  await sleep(400);
  for (var h = 1; h <= 2; h++) {
    var guard = 0, done = false;
    while (!done && guard++ < 400) {
      if (d.getElementById('btn-next-hand')) { done = true; break; }
      var st = txt(d.getElementById('turn-status'));
      var cc = d.getElementById('btn-checkcall');
      if (st.indexOf('Your turn') === 0 && cc && !cc.disabled) { cc.click(); await sleep(150); }
      else {
        var felted = d.querySelector('#modal-root .modal[aria-label^="You are felted"]');
        if (felted) { var rbb = felted.querySelector('button.primary'); if (rbb) { rbb.click(); await sleep(150); } }
        await sleep(120);
      }
    }
    check(done, 'hand ' + h + ' finishes');
    if (!done) break;
    if (h < 2) { var nx = d.getElementById('btn-next-hand'); if (nx) nx.click(); await sleep(600); }
  }
  var nav = d.querySelector('.nav-btn[data-nav="stats"]');
  if (nav) nav.click();
  await sleep(400);
  var rows = d.querySelectorAll('#history-list .hist-row');
  check(rows.length >= 2, 'Stats history lists both hands (' + rows.length + ' rows)');
  if (rows.length === 0) { console.log(failures + ' history replay failures'); process.exit(1); }
  var row = rows[0];
  var nm = (txt(row.querySelector('.hist-main span')).match(/#(\d+)/) || [])[1];
  var main = row.querySelector('.hist-main');
  if (main) main.click();
  await sleep(300);
  var rp = row.querySelector('.hist-replay');
  check(!!rp, 'newest history row has a replay button (hand #' + nm + ')');
  if (!rp) { console.log(failures + ' history replay failures'); process.exit(1); }
  rp.click();
  await sleep(400);
  var title = txt(d.querySelector('#replay-view .rp-title'));
  check(title.indexOf('Hand #' + nm) === 0 && !d.getElementById('replay-view').hidden,
    'replay opens the right hand (title "' + title + '", want Hand #' + nm + ')');
  var prog0 = txt(d.querySelector('#replay-view .rp-progress'));
  var nx2 = d.getElementById('rp-next');
  if (nx2 && !nx2.disabled) nx2.click();
  await sleep(300);
  var prog1 = txt(d.querySelector('#replay-view .rp-progress'));
  check(prog1 !== prog0, 'Next steps forward (' + prog0 + ' -> ' + prog1 + ')');
  var pv = d.getElementById('rp-prev');
  if (pv && !pv.disabled) pv.click();
  await sleep(300);
  var prog2 = txt(d.querySelector('#replay-view .rp-progress'));
  check(prog2 === prog0, 'Prev steps back (' + prog1 + ' -> ' + prog2 + ')');
  var back = d.getElementById('rp-back');
  if (back) back.click();
  await sleep(300);
  check(!d.getElementById('hand-list').hidden, 'Back returns to the hand list');
  check(errors.length === 0, 'zero js errors (' + errors.length + (errors.length ? ': ' + errors.slice(0, 2).join(' ; ') : '') + ')');
  console.log(failures ? failures + ' history replay failures' : 'HISTORY REPLAY OK');
  process.exit(failures ? 1 : 0);
})().catch(function (e) { console.log('EXCEPTION: ' + (e && e.stack || e)); process.exit(1); });
