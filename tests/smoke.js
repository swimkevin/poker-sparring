// Gameplay smoke: boots the REAL app (all scripts, real DOM) in jsdom and
// auto-plays hero actions for ~40s. Catches wiring errors unit tests can't.
var path = require('path');
var fs = require('fs');
var jsdom = require('jsdom');
var JSDOM = jsdom.JSDOM;

var dir = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
// runScripts:dangerously so injected <script> tags execute in the real window context.
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

// Inject the app scripts in load order (synchronous execution on insertion).
['cards', 'evaluator', 'equity', 'engine', 'bots', 'pushfold', 'stats', 'ui', 'app']
  .forEach(function (f) {
    var s = d.createElement('script');
    s.textContent = fs.readFileSync(path.join(dir, 'js', f + '.js'), 'utf8');
    d.head.appendChild(s);
  });
d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

function click(id) {
  var el = d.getElementById(id);
  if (el && !el.disabled && typeof el.onclick === 'function') el.onclick();
  else if (el && !el.disabled) el.click();
}

// Start a cash game with default bots.
click('btn-start');

var handsSeen = {};
var ticks = 0;
var iv = setInterval(function () {
  ticks++;
  try {
    var hi = d.getElementById('hand-info').textContent;
    var m = hi.match(/#(\d+)/);
    if (m) handsSeen[m[1]] = 1;
    // Hero auto-play: prefer check/call, fold sometimes, bet rarely.
    var foldBtn = d.getElementById('btn-fold');
    if (foldBtn && !foldBtn.disabled) {
      var cc = d.getElementById('btn-checkcall').textContent;
      var r = Math.random();
      if (r < 0.7) click('btn-checkcall');
      else if (r < 0.9) click('btn-fold');
      else { click('btn-betraise'); setTimeout(function () { click('btn-bet-confirm'); }, 100); }
      console.log('hero: ' + (r < 0.7 ? cc : r < 0.9 ? 'fold' : 'bet') + ' | ' + hi);
    }
    // Spot-check: log lines should name actors now.
    var log = d.getElementById('hand-log');
    if (log && log.children.length > 4 && !w.__logChecked) {
      w.__logChecked = true;
      var txt = log.textContent;
      var hasNames = /folds|checks|calls|bets|raises/.test(txt);
      console.log('log sample: ' + log.children[log.children.length - 1].textContent.slice(0, 80));
      console.log('log has action words: ' + hasNames);
    }
  } catch (e) { errors.push('tick: ' + e.message); }
  if (ticks > 80 || Object.keys(handsSeen).length >= 3) {
    clearInterval(iv);
    // Push/fold screen: answer a few spots.
    try {
      w.eval('UI.showScreen("pf")');
      console.log('pf screen shown ok');
    } catch (e) { errors.push('pf: ' + e.message); }
    setTimeout(function () {
      console.log('hands completed: ' + Object.keys(handsSeen).join(','));
      console.log('js errors: ' + (errors.length ? errors.join(' | ') : 'none'));
      process.exit(errors.length ? 1 : 0);
    }, 1500);
  }
}, 500);
