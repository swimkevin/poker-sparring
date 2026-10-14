// Feature sweep: boots the real app, plays hands, and exercises every tab,
// screen, and game mode. Reports empty panels and JS errors.
var path = require('path');
var fs = require('fs');
var jsdom = require('jsdom');
var JSDOM = jsdom.JSDOM;
var dir = path.join(__dirname, '..');
var dom = new JSDOM(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'),
  { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
var w = dom.window, d = w.document;
w.scrollTo = function () {}; w.confirm = function () { return true; };
w.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: function () { return function () {}; }, set: function () { return true; } });
};
var errors = [];
w.addEventListener('error', function (e) { errors.push(e.message || String(e.error)); });
['cards','evaluator','equity','engine','bots','names','pushfold','stats','replay','room-server','netplay','ui','online','app']
  .forEach(function (f) { var s = d.createElement('script'); s.textContent = fs.readFileSync(path.join(dir, 'js', f + '.js'), 'utf8'); d.head.appendChild(s); });
d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
function click(id) { var el = d.getElementById(id); if (el && !el.disabled) el.click(); }
function clickTab(tab) {
  var b = d.querySelector('.mtab[data-tab="' + tab + '"]');
  if (b) b.click(); else errors.push('sweep: tab ' + tab + ' missing');
}
function panelText() {
  var p = d.getElementById('mp-body');
  return p ? p.textContent.trim().slice(0, 60) : 'NO PANEL';
}
var fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('FAIL: ' + m); } else console.log('ok: ' + m); }
function visibleScreen() {
  var ids = ['setup','table','pf','archetypes','hands','stats','learn','online'];
  for (var i = 0; i < ids.length; i++) {
    var el = d.getElementById('screen-' + ids[i]);
    if (el && !el.hidden) return ids[i];
  }
  return 'none';
}
setTimeout(function () {
  ok(visibleScreen() === 'setup', 'boots to setup screen (got ' + visibleScreen() + ')');
  click('btn-quick');
}, 800);
var phase = 0;
var iv = setInterval(function () {
  try {
    phase++;
    // hero auto-play
    var foldBtn = d.getElementById('btn-fold');
    if (foldBtn && !foldBtn.disabled && visibleScreen() === 'table') {
      var r = Math.random();
      if (r < 0.75) click('btn-checkcall');
      else if (r < 0.9) click('btn-fold');
      else { click('btn-betraise'); setTimeout(function () { click('btn-bet-confirm'); }, 150); }
    }
    // felted modal
    var mr = d.getElementById('modal-root');
    if (mr && /felted/i.test(mr.textContent || '')) {
      var bs = mr.querySelectorAll('button');
      for (var i = 0; i < bs.length; i++) if (/rebuy/i.test(bs[i].textContent)) { bs[i].click(); break; }
    }
    if (phase === 40) {
      clickTab('coach'); ok(panelText().length > 20, 'coach tab renders (' + panelText().length + ' chars)');
      clickTab('coach'); // toggle closed
    }
    if (phase === 60) {
      clickTab('history');
      var t = panelText();
      ok(t.length > 20, 'history tab renders (' + t.length + ' chars)');
      clickTab('history');
    }
    if (phase === 80) {
      clickTab('chat'); ok(panelText().length > 5, 'chat tab renders');
      clickTab('chat');
    }
    if (phase === 100) {
      clickTab('menu'); ok(panelText().length > 10, 'menu tab renders');
      clickTab('menu');
    }
    if (phase === 120) {
      // stats screen via menu
      clickTab('menu');
      var stBtn = Array.prototype.filter.call(d.querySelectorAll('button'), function (b) { return /view stats/i.test(b.textContent); })[0];
      ok(!!stBtn, 'menu has View stats');
      if (stBtn) stBtn.click();
      setTimeout(function () {
        ok(visibleScreen() === 'stats', 'stats screen opens (got ' + visibleScreen() + ')');
        var back = d.querySelector('#screen-stats button');
        if (back) back.click();
      }, 800);
    }
    if (phase === 160) {
      // hand replayer screen
      w.UI.showScreen('hands');
      setTimeout(function () {
        ok(visibleScreen() === 'hands', 'replayer screen opens');
        var list = d.getElementById('screen-hands').textContent;
        ok(list.length > 50, 'replayer lists hands (' + list.length + ' chars)');
      }, 800);
    }
    if (phase === 200) {
      // learn screen
      w.UI.showScreen('learn');
      setTimeout(function () {
        ok(visibleScreen() === 'learn', 'learn screen opens');
        ok(d.getElementById('screen-learn').textContent.length > 100, 'learn has book content');
      }, 500);
    }
    if (phase === 230) {
      console.log(fails === 0 ? 'FEATURE SWEEP PASSED' : 'FEATURE SWEEP: ' + fails + ' FAILURES');
      console.log('js errors: ' + (errors.length ? errors.slice(0, 5).join(' | ') : 'none'));
      clearInterval(iv);
      process.exit(fails || errors.length ? 1 : 0);
    }
  } catch (e) { console.log('SWEEP ERR: ' + e.message); clearInterval(iv); process.exit(1); }
}, 500);
