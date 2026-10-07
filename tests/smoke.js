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
['cards', 'evaluator', 'equity', 'engine', 'bots', 'names', 'pushfold', 'stats', 'replay', 'room-server', 'netplay', 'ui', 'online', 'app']
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

// Start via the one-tap quick-start button (exercises the btn-quick wiring);
// falls back to btn-start if the quick button is ever removed.
if (d.getElementById('btn-quick')) click('btn-quick');
else click('btn-start');

var handsSeen = {};
var ticks = 0;
var skipped = false;
var iv = setInterval(function () {
  ticks++;
  try {
    var hi = d.getElementById('hand-info').textContent;
    var m = hi.match(/#(\d+)/);
    if (m) handsSeen[m[1]] = 1;
    // Exercise ⏩ Skip once mid-run: fast-forwards the hand without errors.
    if (ticks === 15 && !skipped) {
      skipped = true;
      var skipBtn = d.getElementById('btn-skip');
      if (skipBtn && !skipBtn.hidden) { skipBtn.click(); console.log('skip clicked'); }
      else errors.push('smoke: btn-skip missing or hidden mid-hand');
    }
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
    // Hand replayer: finished hands must be recorded, listed, and steppable.
    try {
      var recCount = w.eval('loadHandRecords().length');
      console.log('hand records saved: ' + recCount);
      if (Object.keys(handsSeen).length >= 1 && recCount < 1)
        errors.push('replay: expected >=1 saved hand record');
      d.querySelector('.nav-btn[data-nav="hands"]').click();
      var rows = d.querySelectorAll('#hand-list .hrow').length;
      console.log('hand list rows: ' + rows);
      if (recCount >= 1 && rows < 1) errors.push('replay: hand list empty');
      var openBtn = d.querySelector('#hand-list .rp-open');
      if (openBtn && rows >= 1) {
        openBtn.click();
        // Street-jump buttons must actually move the replay (regression: the
        // wiring once queried a data attribute the buttons never had).
        var flopBtn = d.getElementById('rp-street-flop');
        if (!flopBtn) errors.push('replay: street jump button missing');
        else {
          var before = d.querySelector('.rp-progress').textContent;
          flopBtn.click();
          var after = d.querySelector('.rp-progress').textContent;
          var flopCards = d.querySelectorAll('#replay-view .rp-community .card').length;
          console.log('street jump: ' + before + ' -> ' + after + ', flop cards: ' + flopCards);
          if (before === after) errors.push('replay: street jump did not move');
          // A hand that ended preflop has no flop: the jump lands at the end.
          var m = /Step (\d+) of (\d+)/.exec(after || '');
          var atEnd = m && m[1] === m[2];
          if (flopCards !== 3 && !atEnd) errors.push('replay: street jump did not show flop, got ' + flopCards);
        }
        // Reset to the start: the street jump may have landed at the end,
        // which would leave nothing for the next-button walk below.
        var startBtn = d.getElementById('rp-start');
        if (startBtn && !startBtn.disabled) startBtn.click();
        var steps = 0, nb = d.getElementById('rp-next');
        while (nb && !nb.disabled && steps < 300) { nb.click(); steps++; nb = d.getElementById('rp-next'); }
        console.log('replay steps walked: ' + steps);
        if (steps < 1) errors.push('replay: could not step through');
        var prog = d.querySelector('.rp-progress');
        if (!prog || prog.textContent.indexOf(' of ') === -1) errors.push('replay: progress missing');
        var backBtn = d.getElementById('rp-back');
        if (backBtn) backBtn.click();
        if (d.querySelectorAll('#hand-list .hrow').length < 1) errors.push('replay: back button did not return to list');
      } else if (recCount >= 1) errors.push('replay: no open button');
    } catch (e) { errors.push('replay: ' + e.message); }
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
