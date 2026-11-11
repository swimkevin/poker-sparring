// Stale Call-button label: at a new hand the disabled Call button kept the
// previous hand's amount (observed live 2026-11-12: "Call 65" with pot 15,
// blinds 5/10) until the hero's turn re-rendered it. The same mechanism
// hits hand 1, where the button shows the index.html default "Check" even
// when the hero owes the big blind. Disabled buttons must always show the
// CURRENT hand's price, so this test samples the label whenever the button
// is disabled and it is not the hero's turn, and compares it against the
// live legal price from coachState().
'use strict';
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
// real-time hands take ~30 minutes. Same cap as live-loop-test.js.
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
function expectedLabel() {
  var st = w.coachState();
  return st.toCall > 0 ? 'Call ' + w.UI.fmt(st.toCall) : 'Check';
}
(async function () {
  var fails = 0;
  function ok(cond, msg) {
    console.log((cond ? 'ok' : 'FAIL') + ': ' + msg);
    if (!cond) fails++;
  }
  $('btn-start').click();
  var samples = 0;
  var handsPlayed = 0;
  for (var hand = 1; hand <= 4 && samples < 8; hand++) {
    var handDone = false, guard = 0;
    while (!handDone && guard++ < 600) {
      var nx = $('btn-next-hand');
      if (nx) { handDone = true; break; }
      var status = ($('turn-status') || {}).textContent || '';
      var cc = $('btn-checkcall');
      if (cc && cc.disabled && status.indexOf('Your turn') !== 0) {
        var got = cc.textContent;
        var want = expectedLabel();
        samples++;
        if (got !== want) ok(false, 'disabled Call label "' + got + '" but current price says "' + want + '" (sample ' + samples + ')');
      }
      if (status.indexOf('Your turn') === 0 && cc && !cc.disabled) {
        cc.click();
        await sleep(120);
      } else {
        var felted = d.querySelector('#modal-root .modal[aria-label^="You are felted"]');
        if (felted) {
          var rb = felted.querySelector('button.primary');
          if (rb) { rb.click(); await sleep(150); }
        }
        await sleep(25);
      }
    }
    handsPlayed = hand;
    if (!handDone) { ok(false, 'hand ' + hand + ' did not finish'); break; }
    var nx2 = $('btn-next-hand');
    if (nx2) { nx2.click(); await sleep(400); }
    if (samples >= 8) break;
  }
  ok(samples >= 1, 'sampled the disabled Call label at least once (' + samples + ' samples over ' + handsPlayed + ' hands)');
  ok(errors.length === 0, 'no js errors' + (errors.length ? ' :: ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(samples + ' disabled-label samples checked, ' + fails + ' failed');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('EXCEPTION: ' + e.message); process.exit(1); });
