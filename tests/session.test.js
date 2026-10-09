// Session-resume regression test (2026-10-08): leaving the page must not
// lose an offline session. Stacks are persisted at every hand end (and
// best-effort on pagehide); the setup screen offers "Resume last session"
// which restores every stack exactly.
var path = require('path');
var fs = require('fs');
var jsdom = require('jsdom');
var JSDOM = jsdom.JSDOM;

var dir = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
var dom = new JSDOM(html, {
  url: 'http://localhost/index.html',
  pretendToBeVisual: true,
  runScripts: 'dangerously'
});
var w = dom.window;
var d = w.document;
w.scrollTo = function () {};
w.confirm = function () { return true; };
w.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: function () { return function () {}; }, set: function () { return true; } });
};
var errors = [];
w.addEventListener('error', function (e) { errors.push(e.message || String(e.error)); });

['cards', 'evaluator', 'equity', 'engine', 'bots', 'names', 'pushfold', 'stats',
 'replay', 'room-server', 'netplay', 'ui', 'online', 'app']
  .forEach(function (f) {
    var s = d.createElement('script');
    s.textContent = fs.readFileSync(path.join(dir, 'js', f + '.js'), 'utf8');
    d.head.appendChild(s);
  });
d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

var failures = [];
function ok(cond, name) {
  if (cond) { console.log('ok: ' + name); }
  else { failures.push(name); console.log('FAIL: ' + name); }
}

function tick() { return new Promise(function (res) { setTimeout(res, 50); }); }

(async function () {
  var io = w.__sessionIO;
  ok(!!io, '__sessionIO is exposed');

  // 1. No save -> no resume button.
  io.clear();
  ok(io.load() === null, 'load returns null with no save');
  ok(io.saveable() === false, 'not saveable with no table');
  io.refresh();
  ok(d.getElementById('btn-resume').hidden === true, 'resume button hidden with no save');

  // 2. Seed a session: hero at 1345, two bots at 820/1110, hand 12 done.
  var seed = {
    v: 1, savedAt: Date.now() - 65 * 60000, mode: 'cash',
    cfg: { stack: 1000, sb: 5, bb: 10, botRebuys: true, roundBets: false,
           blindInterval: 8, tourneyRebuys: false },
    heroName: 'Kevin', handNo: 12, button: 2, levelIdx: 0,
    players: [
      { name: 'Kevin', stack: 1345, archetypeId: null, isHero: true, sittingOut: false },
      { name: 'Rohan', stack: 820, archetypeId: 'rohan', isHero: false, sittingOut: false },
      { name: 'Amogh', stack: 1110, archetypeId: 'amogh', isHero: false, sittingOut: false }
    ]
  };
  w.localStorage.setItem(io.key, JSON.stringify(seed));
  var loaded = io.load();
  ok(loaded && loaded.players[0].stack === 1345, 'saved stacks round-trip');
  io.refresh();
  await tick();
  var btn = d.getElementById('btn-resume');
  ok(btn.hidden === false, 'resume button shown with a save');
  var hint = d.getElementById('resume-hint');
  ok(hint.hidden === false && hint.textContent.indexOf('13') !== -1,
    'hint names the next hand number (' + hint.textContent + ')');

  // 3. Resume restores the table with exact stacks. The deal is deferred
  // ~400ms by beginTableSession, and hand #13 posts blinds immediately, so
  // wait for the dealt table: hero keeps 1,345, Rohan posts SB (820-5=815),
  // Amogh posts BB (1110-10=1,100).
  btn.click();
  await new Promise(function (res) { setTimeout(res, 1000); });
  ok(d.getElementById('screen-table').hidden === false, 'resume shows the table screen');
  var heroBar = d.querySelector('.hero-bar');
  ok(heroBar && heroBar.textContent.indexOf('1,345') !== -1,
    'hero stack restored (' + (heroBar && heroBar.textContent.replace(/\s+/g, ' ').slice(0, 40)) + ')');
  var seatText = Array.prototype.map.call(d.querySelectorAll('.seat'), function (s) {
    return s.textContent.replace(/\s+/g, '');
  }).join(' ');
  ok(seatText.indexOf('815') !== -1 && seatText.indexOf('1,100') !== -1,
    'bot stacks restored after blinds (' + seatText.slice(0, 80) + ')');

  // 4. A save written by the live session is picked up (save path runs
  // without throwing while a table exists).
  try { io.save(); ok(true, 'save runs without throwing mid-session'); }
  catch (e) { ok(false, 'save runs without throwing mid-session: ' + e.message); }
  var reloaded = io.load();
  ok(reloaded && reloaded.players.length === 3, 'live save persists 3 players');

  // 5. Corrupted save -> treated as no session.
  w.localStorage.setItem(io.key, 'not-json{{{');
  ok(io.load() === null, 'corrupted save loads as null');
  io.refresh();
  ok(d.getElementById('btn-resume').hidden === true, 'resume hidden on corrupted save');
  io.clear();

  var jsErrs = errors.filter(function (m) { return !/navigation/i.test(m); });
  ok(!jsErrs.length, 'no js errors (' + jsErrs.join('; ') + ')');
  console.log(failures.length ? failures.length + ' FAILED (session)' : 'session: all passed');
  process.exit(failures.length ? 1 : 0);
})();
