// Flagged-modes test: the feature-flagged modes (heads-up, push/fold trainer,
// custom bots) are hidden from the default UI, so nothing exercises them day
// to day. This boots the real app with all flags on and plays each mode end
// to end, so a regression can't rot behind a flag unnoticed.
'use strict';
var path = require('path');
var fs = require('fs');
var jsdom = require('jsdom');
var JSDOM = jsdom.JSDOM;
var dir = path.join(__dirname, '..');
var dom = new JSDOM(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'),
  { url: 'http://localhost/?flags=headsUpMode,pushFoldTrainer,customBots', pretendToBeVisual: true, runScripts: 'dangerously' });
var w = dom.window, d = w.document;
w.scrollTo = function () {}; w.confirm = function () { return true; };
w.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: function () { return function () {}; }, set: function () { return true; } });
};
var errors = [];
w.addEventListener('error', function (e) { errors.push(e.message || String(e.error)); });
['cards', 'evaluator', 'equity', 'engine', 'bots', 'names', 'pushfold', 'stats', 'replay', 'room-server', 'netplay', 'ui', 'online', 'app']
  .forEach(function (f) { var s = d.createElement('script'); s.textContent = fs.readFileSync(path.join(dir, 'js', f + '.js'), 'utf8'); d.head.appendChild(s); });
d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

var fails = 0;
function ok(c, m) { console.log((c ? 'ok' : 'FAIL') + ': ' + m); if (!c) fails++; }
function vis(id) { var el = d.getElementById(id); return !!(el && !el.hidden); }
function clickId(id) { var el = d.getElementById(id); if (el && !el.disabled && !el.hidden) { el.click(); return true; } return false; }
function handNo() { var hi = d.getElementById('hand-info'); var m = hi && hi.textContent.match(/Hand #(\d+)/); return m ? parseInt(m[1], 10) : 0; }
function modeCard(mode) {
  return Array.prototype.filter.call(d.querySelectorAll('.mode-card'), function (c) { return c.dataset.mode === mode; })[0];
}

var stage = 0, ticks = 0, pfRounds = 0, pfSaw = 0, huStart = 0;
setTimeout(function () {
  ok(w.PS_FLAGS.headsUpMode && w.PS_FLAGS.pushFoldTrainer && w.PS_FLAGS.customBots, 'all flags enabled via URL');
  var modes = Array.prototype.filter.call(d.querySelectorAll('.mode-card'), function (c) { return c.style.display !== 'none'; })
    .map(function (c) { return c.dataset.mode; });
  ok(modes.indexOf('hu') >= 0 && modes.indexOf('pushfold') >= 0, 'flagged mode cards visible (' + modes.join(',') + ')');
  var cbs = d.getElementById('custom-bot-section');
  ok(cbs && cbs.style.display !== 'none', 'custom bot section visible');
  var pf = modeCard('pushfold');
  pf.click();
  ok(pf.classList.contains('selected'), 'push/fold card selectable');
  clickId('btn-start');
  ok(vis('screen-pf'), 'push/fold start shows the trainer screen');
  var sit = d.getElementById('pf-situation');
  ok(sit && sit.textContent.trim().length > 20, 'trainer renders a scenario');
  stage = 1;
}, 1200);

var iv = setInterval(function () {
  try {
    ticks++;
    if (stage === 1 && vis('screen-pf')) {
      var fb = d.getElementById('pf-feedback');
      if (fb && !fb.hidden) {
        pfSaw++;
        if (!/Correct|Off the mark/.test(fb.textContent)) ok(false, 'trainer feedback has a verdict');
        var sc = d.getElementById('pf-score');
        if (!/Score: \d+ \/ \d+/.test(sc.textContent)) ok(false, 'trainer score format (' + sc.textContent + ')');
        if (clickId('pf-next')) pfRounds++;
      } else {
        clickId(pfRounds % 2 ? 'pf-fold' : 'pf-shove');
      }
      if (pfRounds >= 5 && pfSaw >= 5) {
        ok(true, 'push/fold trainer played 5 rounds with feedback each round');
        w.UI.showScreen('setup');
        ok(vis('screen-setup'), 'back to setup screen');
        var hu = modeCard('hu');
        hu.click();
        ok(hu.classList.contains('selected'), 'heads-up card selectable');
        clickId('btn-start');
        ok(vis('screen-table'), 'heads-up start shows the table');
        huStart = handNo() || 1;
        stage = 2;
      }
    } else if (stage === 2) {
      clickId('btn-next-hand');
      var mr = d.getElementById('modal-root');
      if (mr && /felted/i.test(mr.textContent || '')) {
        var bs = mr.querySelectorAll('button');
        for (var i = 0; i < bs.length; i++) if (/rebuy/i.test(bs[i].textContent)) { bs[i].click(); break; }
      }
      var f = d.getElementById('btn-fold');
      if (f && !f.disabled && vis('screen-table')) clickId('btn-checkcall');
      if (handNo() > huStart) {
        ok(true, 'heads-up completed a full hand (reached hand #' + handNo() + ')');
        var nav = d.querySelector('.nav-btn[data-nav="archetypes"]');
        if (nav) nav.click();
        ok(vis('screen-archetypes'), 'archetypes screen opens');
        d.getElementById('cust-name').value = 'Flagtest Felix';
        d.getElementById('cust-emoji').value = 'X';
        ok(clickId('btn-add-custom'), 'custom bot add button works');
        var list = d.getElementById('custom-list');
        ok(list && /Flagtest Felix/.test(list.textContent), 'custom bot appears in the list');
        var del = list.querySelector('.adel');
        ok(!!del, 'custom bot has a delete button');
        del.click();
        ok(!/Flagtest Felix/.test(d.getElementById('custom-list').textContent), 'custom bot deletes cleanly');
        stage = 3;
      }
    }
    if (ticks > 300) { ok(false, 'timed out in stage ' + stage); stage = 3; }
    if (stage === 3) {
      clearInterval(iv);
      console.log(fails === 0 ? 'FLAGGED MODES TEST PASSED' : 'FLAGGED MODES TEST: ' + fails + ' FAILURES');
      console.log('js errors: ' + (errors.length ? errors.slice(0, 5).join(' | ') : 'none'));
      process.exit(fails || errors.length ? 1 : 0);
    }
  } catch (e) { console.log('TEST ERR: ' + (e && e.stack || e)); clearInterval(iv); process.exit(1); }
}, 400);
