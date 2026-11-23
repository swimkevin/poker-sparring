// Winner highlight (v1.8.97, Kevin): at showdown the winning best-5 cards
// lift (board cards + winner's hole cards), the rest dim, and the winner's
// seat gets the gold ring. Plays call-down hands in the real app (jsdom)
// until a showdown occurs, then asserts the DOM classes.
'use strict';
var path = require('path');
var fs = require('fs');
var JSDOM = require('jsdom').JSDOM;
var dir = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
var dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
var w = dom.window, d = w.document;
w.scrollTo = function () {};
w.confirm = function () { return true; };
w.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: function () { return function () {}; }, set: function () { return true; } });
};
var realST = w.setTimeout.bind(w);
w.setTimeout = function (fn, ms) {
  var rest = Array.prototype.slice.call(arguments, 2);
  return realST.apply(null, [fn, Math.min(ms || 0, 60)].concat(rest));
};
var errors = [];
w.addEventListener('error', function (e) { errors.push(e.message || String(e.error)); });
['cards', 'evaluator', 'equity', 'engine', 'bots', 'names', 'pushfold', 'stats',
 'replay', 'room-server', 'netplay', 'ui', 'online', 'app'].forEach(function (f) {
  var s = d.createElement('script');
  s.textContent = fs.readFileSync(path.join(dir, 'js', f + '.js'), 'utf8');
  d.head.appendChild(s);
});
d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
function $(id) { return d.getElementById(id); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// Board 2d 7c 9h Jd 8s: no straight, no flush, no board pair, so AA beats KK beats
// QQ as plain pairs (a board King would give Bob trips and sweep both pots).
var board = [{ r: 2, s: 2 }, { r: 7, s: 3 }, { r: 9, s: 1 }, { r: 11, s: 2 }, { r: 8, s: 0 }];
var qq = [{ r: 12, s: 0 }, { r: 12, s: 1 }];
var aa = [{ r: 14, s: 0 }, { r: 14, s: 1 }];
var kk = [{ r: 13, s: 3 }, { r: 13, s: 1 }];

function rig(key, players, bets) {
  var s = d.createElement('script');
  var lines = [
    'window.__rig' + key + ' = new PokerTable({ players: ' + JSON.stringify(players) +
      ', sb: 5, bb: 10, startingStack: 1000 });',
    'var t = window.__rig' + key + ';',
    't.handNo = 1; t.handOver = false; t.button = 1; t.pot = 0;',
    't.community = ' + JSON.stringify(board) + ';'
  ];
  bets.forEach(function (b, i) {
    lines.push('t.players[' + i + '].hole = ' + JSON.stringify(b.hole) +
      '; t.players[' + i + '].totalBet = ' + b.totalBet +
      '; t.players[' + i + '].bet = ' + b.totalBet +
      '; t.players[' + i + '].stack = ' + b.stack + ';');
  });
  lines.push('t._showdown();');
  lines.push('window.__end' + key + ' = t.eventQueue.filter(function (e) { return e.t === "handEnd"; })[0];');
  s.textContent = lines.join('\n');
  d.head.appendChild(s);
  return { table: w['__rig' + key], end: w['__end' + key] };
}

async function drive(rigged, handNo, sbIdx, bbIdx) {
  var H = w.__coachTestHooks;
  H.setTable(rigged.table);
  H.setDecisions([]);
  H.emitEvent({ t: 'handStart', handNo: handNo, button: 1, sb: 5, bb: 10, ante: 0,
    sbIdx: sbIdx, bbIdx: bbIdx,
    stacks: rigged.table.players.map(function (p) { return p.stack; }) });
  await sleep(150);
  H.emitEvent(rigged.end);
  await sleep(250);
}

function titleText() {
  var el = d.querySelector('#winner-banner .wtitle');
  return el ? el.textContent : '';
}
(async function () {
  var fails = 0;
  function ok(c, m) { console.log((c ? 'ok' : 'FAIL') + ': ' + m); if (!c) fails++; }
  var cs = $('cfg-stack'); if (cs) cs.value = '100000'; // hero cannot bust mid-test
  $('btn-start').click();
  var found = null;
  for (var hand = 0; hand < 6 && !found; hand++) {
    var guard = 0, ended = false;
    while (!ended && guard++ < 250) {
      if ($('btn-next-hand')) { ended = true; break; }
      var st = ($('turn-status') || {}).textContent || '';
      var cc = $('btn-checkcall');
      if (st.indexOf('Your turn') === 0 && cc && !cc.disabled) { cc.click(); await sleep(120); }
      else await sleep(100);
    }
    var banner = ($('hero-hand-desc') || {}).textContent || '';
    if (/won with/.test(banner)) {
      found = {
        seatWinners: d.querySelectorAll('.seat.winner').length,
        boardWin: d.querySelectorAll('#community .card-win').length,
        boardDim: d.querySelectorAll('#community .card-dim').length,
        holeWin: d.querySelectorAll('.pcards .card-win, #hero-cards .card-win').length,
        banner: banner.slice(0, 60)
      };
    }
    var nx = $('btn-next-hand');
    if (nx) { nx.click(); await sleep(500); }
  }
  ok(!!found, 'a showdown hand occurred within 6 hands');
  if (found) {
    console.log('  banner: ' + found.banner);
    ok(found.seatWinners >= 1, 'winner seat has the gold ring (' + found.seatWinners + ')');
    ok(found.boardWin >= 3, 'at least 3 board cards lifted (' + found.boardWin + ')');
    ok(found.holeWin >= 1 || found.boardWin === 5, 'winner hole cards lifted (' + found.holeWin + ')');
  }
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors[0] : ''));

  // Play out the hand the sweep left in flight (its last Next-hand click
  // started a new hand and the hero may be waiting): while the pump waits
  // on the hero, queued events never run. Must run BEFORE the fold-win
  // block below — that block calls onHandEnd directly, which paints a
  // Next-hand button for a hand that is not over and would fool this loop
  // into exiting at once. Guard is 500 (v1.8.307): the 250 bound expired
  // in CI twice (v1.8.297 locally, v1.8.306 CI) on slow timer-driven
  // play-outs — the hand still finishes, the loop just needs more wall
  // time on a loaded runner.
  var guard2 = 0, over = false;
  while (!over && guard2++ < 500) {
    if ($('btn-next-hand')) { over = true; break; }
    var st2 = ($('turn-status') || {}).textContent || '';
    var cc2 = $('btn-checkcall');
    if (st2.indexOf('Your turn') === 0 && cc2 && !cc2.disabled) { cc2.click(); await sleep(120); }
    else await sleep(100);
  }
  ok(over, 'in-flight hand played out before rigged scenarios');

  // Fold-win line carries the amount (v1.8.223): drive onHandEnd with a
  // fabricated fold-win event for the live table and read the hero line.
  var hasHook = w.__coachTestHooks && typeof w.__coachTestHooks.handEnd === 'function';
  ok(hasHook, 'handEnd test hook is exposed');
  if (hasHook) {
    w.__coachTestHooks.setHandRec(null);
    w.__coachTestHooks.handEnd({ t: 'handEnd', handNo: 999, winners: [{ idx: 0, amount: 55, byFold: true }], pot: 55, revealed: [] });
    var foldLine = ($('hero-hand-desc') || {}).textContent || '';
    ok(/You won 55/.test(foldLine) && /everyone else folded/.test(foldLine), 'fold-win line carries the amount (got "' + foldLine.slice(0, 60) + '")');
    var mucked = d.querySelectorAll('#seats .seat.cards-up').length;
    ok(mucked === 0, 'fold-win hand end shows no opponent cards (' + mucked + ' cards-up seats)');
  }

  // Bankroll chip carries a visible P/L label (v1.8.223, mobile has no hover).
  ok(d.querySelector('.bankroll-label') && d.querySelector('.bankroll-label').textContent === 'P/L', 'bankroll chip carries a P/L label');

  // Winner banner vs uncalled take-backs (v1.8.210, Kevin): the engine is correct —
  // one contested winner plus one uncalled take-back — but the app banner used to
  // union ALL handEnd winners entries, so a short all-in winning the main pot while
  // the hero's overbet came back uncalled read as two winners taking the whole pot
  // ("Alice & You take 700"). Rigged real-engine handEnds through the real event
  // pump (hooks.emitEvent), then assert the banner title, the Last: line, and the
  // gold seat rings. Runs LAST: the sweep leaves a hand in flight (Next hand was
  // clicked), so play it out first — while the pump waits on the hero, queued
  // events never run. Also runs last because a rigged handEnd leaves a stale
  // Next-hand button behind that would trick the sweep into dealing mid-hand.
  w.UI.buildSeats();

  // Scenario A: hero QQ bets 600, Alice AA all-in 100 wins the only contested
  // pot (main, 200); hero's 500 comes back uncalled. Stacks end 900/200.
  var a = rig('A', [{ name: 'You', isHero: true }, { name: 'Alice' }], [
    { hole: qq, totalBet: 600, stack: 400 },
    { hole: aa, totalBet: 100, stack: 0 }
  ]);
  await drive(a, 1, 1, 0);
  ok(titleText() === '😤 Alice takes 200', 'A banner names only Alice taking 200, got "' + titleText() + '"');
  ok(titleText().indexOf('You') === -1, 'A banner title never names the hero (refund is not a win)');
  ok(($('last-result') || {}).textContent === 'Last: Alice +200 · Pair of Aces',
    'A Last line is Alice +200 with her hand, got "' + (($('last-result') || {}).textContent || '') + '"');
  ok(d.querySelectorAll('.seat.winner').length === 1, 'A exactly one gold ring (' +
    d.querySelectorAll('.seat.winner').length + ')');
  ok(!$('seat-0').classList.contains('winner'), 'A hero seat has no gold ring');

  // Scenario B: Alice AA wins main 300, Bob KK wins side 400, hero QQ gets 300
  // back uncalled. Two true winners, one take-back.
  var b = rig('B', [{ name: 'You', isHero: true }, { name: 'Alice' }, { name: 'Bob' }], [
    { hole: qq, totalBet: 600, stack: 400 },
    { hole: aa, totalBet: 100, stack: 0 },
    { hole: kk, totalBet: 300, stack: 0 }
  ]);
  await drive(b, 2, 2, 0);
  ok(titleText() === '😤 Alice & Bob take 700', 'B banner names Alice & Bob taking 700, got "' + titleText() + '"');
  ok(($('last-result') || {}).textContent === 'Last: Alice +300 · Pair of Aces',
    'B Last line is Alice +300 with her hand, got "' + (($('last-result') || {}).textContent || '') + '"');
  ok(d.querySelectorAll('.seat.winner').length === 2, 'B exactly two gold rings (' +
    d.querySelectorAll('.seat.winner').length + ')');
  ok(!$('seat-0').classList.contains('winner'), 'B hero seat has no gold ring');
  ok(errors.length === 0, 'no JS errors after rigged scenarios' + (errors.length ? ': ' + errors[0] : ''));
  console.log(fails === 0 ? 'WINNER HIGHLIGHT TEST PASSED' : 'WINNER HIGHLIGHT TEST FAILED');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('EXCEPTION: ' + e.message); process.exit(1); });
