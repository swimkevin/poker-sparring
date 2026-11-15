// Coach dot + advice persistence + hand-end Show hands.
// Boots the REAL app in jsdom. Kevin's iPhone report, 2026-11-15: the Coach
// tab lit up for the first-run intro (written off-turn), advice vanished
// between turns, and folded hands stayed mucked at hand end with no way to
// see them for practice.
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
  w.confirm = function () { return true; };
  ['cards', 'evaluator', 'equity', 'engine', 'bots', 'names', 'pushfold', 'stats', 'replay', 'room-server', 'netplay', 'ui', 'online', 'app']
    .forEach(function (f) { var s = d.createElement('script'); s.textContent = fs.readFileSync(path.join(dir, 'js', f + '.js'), 'utf8'); d.head.appendChild(s); });
  d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return { w: w, d: d };
}

function coachTab(d) { return d.querySelector('.mtab[data-tab="coach"]'); }
function tableTab(d) { return d.querySelector('.mtab[data-tab="table"]'); }
function openCoach(d) {
  tableTab(d).click();
  coachTab(d).click();
}
function closeCoach(d) { tableTab(d).click(); }

var t = boot();
t.w.localStorage.clear();
var ct = coachTab(t.d);

t.w.UI.coachTip('<p>off-turn note</p>');
check(!ct.classList.contains('has-new'), 'dot: an off-turn tip does not light the Coach dot');

t.w.UI.coachTip('<p>fresh advice</p>', { fresh: true });
check(ct.classList.contains('has-new'), 'dot: fresh advice for hero turn lights the Coach dot');

openCoach(t.d);
check(!ct.classList.contains('has-new'), 'dot: opening the Coach tab clears the dot');
check(t.d.getElementById('mp-body').innerHTML.indexOf('fresh advice') !== -1, 'persist: Coach tab shows the fresh advice');

closeCoach(t.d);
t.w.UI.coachTip(null);
openCoach(t.d);
check(t.d.getElementById('mp-body').innerHTML.indexOf('fresh advice') !== -1, 'persist: advice stays in the Coach tab after the turn passes');

closeCoach(t.d);
t.w.UI.coachTip('<p>new advice</p>');
openCoach(t.d);
var bodyAfterNew = t.d.getElementById('mp-body').innerHTML;
check(bodyAfterNew.indexOf('new advice') !== -1 && bodyAfterNew.indexOf('fresh advice') === -1, 'persist: new advice replaces the old advice');

closeCoach(t.d);
t.w.UI.coachTip('New here? This is your <b>coach</b> — it explains every spot. <button id="coach-intro-ok" class="ghost">Got it</button>');
check(!ct.classList.contains('has-new'), 'dot: the first-run intro does not light the Coach dot');
openCoach(t.d);
check(t.d.getElementById('mp-body').innerHTML.indexOf('New here?') !== -1, 'persist: Coach tab shows the intro');
closeCoach(t.d);
t.w.UI.coachTip(null);
openCoach(t.d);
check(t.d.getElementById('mp-body').innerHTML.indexOf('New here?') !== -1, 'persist: intro stays until the first real advice replaces it');

// History tab -> "Open full hand replayer" must populate the hand list
// (v1.8.247). The button only called showScreen('hands') without rendering,
// so on mobile — where the tab is the way in — the History screen was empty.
(function () {
  var recs = [7, 8].map(function (n) {
    return {
      v: 1, id: 'h' + n + '-hist', handNo: n, date: '2026-10-04T12:00:00.000Z', mode: 'cash',
      sb: 5, bb: 10, ante: 0, button: 1,
      players: [{ name: 'You', emoji: '🧑', isHero: true, stack: 1000 }],
      heroHole: [{ r: 14, s: 0 }, { r: 13, s: 0 }],
      timeline: [{ t: 'end', pot: 80, community: [], winners: [{ names: ['You'], amount: 80, hand: 'Pair of Kings', uncalled: false, byFold: false, potIndex: 0 }] }],
      heroNet: 40, heroNetBB: 4, result: 'You win 80 (Pair of Kings)'
    };
  });
  t.w.localStorage.setItem('ps_hands_v1', JSON.stringify(recs));
  var histTab = t.d.querySelector('.mtab[data-tab="history"]');
  check(!!histTab, 'history: History tab exists');
  histTab.click();
  var openBtn = null;
  Array.prototype.forEach.call(t.d.getElementById('mp-body').querySelectorAll('button'), function (b) {
    if (b.textContent.indexOf('Open full hand replayer') !== -1) openBtn = b;
  });
  check(!!openBtn, 'history: History tab offers "Open full hand replayer"');
  openBtn.click();
  check(!t.d.getElementById('screen-hands').hidden, 'history: replayer button shows the hands screen');
  var rows = t.d.querySelectorAll('#hand-list .hrow');
  check(rows.length === 2, 'history: replayer button populates the hand list (got ' + rows.length + ' rows)');
  var nums = Array.prototype.map.call(rows, function (r) { return r.querySelector('.hnum').textContent; }).join(',');
  check(nums.indexOf('Hand #7') !== -1 && nums.indexOf('Hand #8') !== -1, 'history: list shows the seeded hands (' + nums + ')');
})();

function faceUpCount(d, seat) {
  var box = d.getElementById('seat-' + seat);
  if (!box) return -1;
  var pc = box.querySelector('.pcards');
  if (!pc) return -1;
  return pc.querySelectorAll('.card:not(.back)').length;
}

function runHandEndScenario() {
  var t2 = boot();
  t2.w.localStorage.clear();
  t2.w.localStorage.setItem('ps_coach_intro_seen', '1');
  var d2 = t2.d;
  var quick = d2.getElementById('btn-quick');
  check(!!quick, 'reveal: quick deal button exists');
  quick.click();
  var waited = 0;
  var iv = setInterval(function () {
    waited += 500;
    try {
      var next = d2.getElementById('btn-next-hand');
      if (next) {
        clearInterval(iv);
        var pause = d2.getElementById('btn-pause-auto');
        if (pause) pause.click();
        var showBtn = d2.getElementById('btn-show-hands');
        if (showBtn) {
          check(true, 'reveal: Show hands button appears at hand end when hands are mucked');
          var muckedBefore = 0;
          for (var i = 1; i <= 7; i++) if (faceUpCount(d2, i) === 0) muckedBefore++;
          check(muckedBefore >= 1, 'reveal: at least one opponent hand is mucked by default at hand end (' + muckedBefore + ')');
          showBtn.click();
          check(showBtn.disabled && showBtn.textContent === 'Hands shown', 'reveal: tapping Show hands confirms it');
          var allUp = true;
          for (var j = 1; j <= 7; j++) if (faceUpCount(d2, j) !== 2) allUp = false;
          check(allUp, 'reveal: after tapping, every opponent shows 2 face-up cards');
        } else {
          var allUpAlready = true;
          for (var k = 1; k <= 7; k++) if (faceUpCount(d2, k) !== 2) allUpAlready = false;
          check(allUpAlready, 'reveal: no Show hands button because every opponent already shows (all-showdown hand)');
        }
        next.click();
        finish();
        return;
      }
      var foldBtn = d2.getElementById('btn-fold');
      if (foldBtn && !foldBtn.disabled) foldBtn.click();
      if (waited > 150000) {
        clearInterval(iv);
        check(false, 'reveal: hand did not reach hand end in 150s');
        finish();
      }
    } catch (e) {
      clearInterval(iv);
      check(false, 'reveal: exception while waiting for hand end: ' + e.message);
      finish();
    }
  }, 500);
}

function finish() {
  if (failures) { console.log(failures + ' coach dot/reveal failures'); }
  else { console.log('COACH DOT/REVEAL TEST PASSED'); }
  process.exit(failures ? 1 : 0);
}

// Chat tab is hidden in offline play (v1.8.248): the tab was a dead end
// offline — fillChat only says "Chat is available in online games."
(async function () {
  function tick() { return new Promise(function (r) { setTimeout(r, 30); }); }
  var t3 = boot();
  t3.w.localStorage.clear();
  var d3 = t3.d;
  var chatTab = d3.querySelector('.mtab[data-tab="chat"]');
  check(!!chatTab, 'chat: Chat tab exists');
  check(chatTab.style.display === 'none', 'chat: Chat tab hidden on setup (not in an online game)');
  d3.getElementById('btn-quick').click();
  await tick(); await tick();
  check(chatTab.style.display === 'none', 'chat: Chat tab stays hidden on the offline table');
  check(d3.getElementById('mobile-tabs').style.display !== 'none', 'chat: tab bar is shown on the offline table');
  d3.getElementById('screen-table').hidden = true;
  d3.getElementById('screen-online').hidden = false;
  await tick(); await tick();
  check(chatTab.style.display === '', 'chat: Chat tab appears in an online game');
  chatTab.click();
  await tick();
  check(!d3.getElementById('mobile-panel').hidden, 'chat: Chat tab opens its panel online');
  d3.getElementById('screen-online').hidden = true;
  d3.getElementById('screen-table').hidden = false;
  await tick(); await tick();
  check(chatTab.style.display === 'none', 'chat: Chat tab hides again back on the offline table');
  check(d3.getElementById('mobile-panel').hidden, 'chat: leaving the online game closes the open Chat panel');

  // Preflop hero hand name (v1.8.249): hero-hand-desc was blank preflop
  // unless paired, so AK showed nothing under the cards.
  var t4 = boot();
  t4.w.localStorage.clear();
  var d4 = t4.d;
  d4.getElementById('btn-quick').click();
  var heroCards = null;
  for (var pi = 0; pi < 100; pi++) {
    var hc = d4.querySelectorAll('#hero-cards .card');
    if (hc.length === 2) { heroCards = hc; break; }
    await tick(); await tick();
  }
  check(!!heroCards, 'preflop-name: hero is dealt 2 cards');
  if (heroCards) {
    var RN = { Ace: 14, King: 13, Queen: 12, Jack: 11, Ten: 10, Nine: 9, Eight: 8, Seven: 7, Six: 6, Five: 5, Four: 4, Three: 3, Two: 2 };
    var parsed = Array.prototype.map.call(heroCards, function (el) {
      var parts = (el.getAttribute('aria-label') || '').split(' of ');
      return { rank: parts[0], suit: parts[1] };
    });
    var expected;
    if (parsed[0].rank === parsed[1].rank) {
      expected = 'Pair of ' + parsed[0].rank + 's';
    } else {
      var srt = parsed.slice().sort(function (a, b) { return RN[b.rank] - RN[a.rank]; });
      expected = srt[0].rank + ' ' + srt[1].rank + (srt[0].suit === srt[1].suit ? ' suited' : '');
    }
    await tick();
    var got = (d4.getElementById('hero-hand-desc') || {}).textContent || '';
    check(got === expected, 'preflop-name: hero hand name shows preflop (got "' + got + '", want "' + expected + '")');
  }
  runHandEndScenario();
})();
