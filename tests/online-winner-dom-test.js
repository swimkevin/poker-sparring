// Online winner presentation (v1.8.98, Kevin): in the real Online UI (mock
// room + demo bot, jsdom) a finished showdown must show: the winner's seat
// with the gold 'winner' ring, the winner's cards FACE-UP, losing hands
// MUCKED (backs only), the winning best-5 board cards lifted (card-win),
// and a splash naming the winning hand.
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
  return realST.apply(null, [fn, Math.min(ms || 0, 50)].concat(rest));
};
var realSI = w.setInterval.bind(w);
w.setInterval = function (fn, ms) {
  var rest = Array.prototype.slice.call(arguments, 2);
  return realSI.apply(null, [fn, Math.min(ms || 0, 50)].concat(rest));
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
(async function () {
  var fails = 0;
  function ok(c, m) { console.log((c ? 'ok' : 'FAIL') + ': ' + m); if (!c) fails++; }
  w.Online.show();
  await sleep(300);
  $('on-host-name').value = 'Tester';
  var wu = $('on-wsurl'); if (wu) wu.value = ''; // force local mock mode
  $('on-create').click();
  await sleep(300);
  ok(!!$('on-addbot'), 'mock lobby rendered with demo-bot button');
  $('on-addbot').click();
  await sleep(300);
  $('on-start').click();
  await sleep(500);
  var HANDS = /Two Pair|Full House|Straight|Flush|Pair of|Three of a Kind|Four of a Kind|High Card/;
  var saw = { ring: false, faceUp: false, lift: 0, muck: false, showdown: false };
  // Winners persist in snapshots until the next hand deals (~5s window) —
  // poll for the gold seat ring, which (unlike the 3s splash) cannot be
  // missed between polls. Keep playing until BOTH outcomes are seen:
  // bot wins a showdown (face-up + lift) and hero wins a showdown with
  // the bot live (bot mucked to backs).
  for (var hand = 0; hand < 24 && !(saw.faceUp && saw.muck); hand++) {
    var guard = 0, captured = false;
    while (guard++ < 500) {
      var winnerSeats = d.querySelectorAll('#online-seats .seat.winner');
      if (winnerSeats.length && !captured) {
        captured = true;
        var feedText = ($('on-feed') || { textContent: '' }).textContent || '';
        var isShowdown = HANDS.test(feedText);
        saw.ring = true;
        if (isShowdown) saw.showdown = true;
        saw.lift = Math.max(saw.lift, d.querySelectorAll('#on-community .card-win').length);
        d.querySelectorAll('#online-seats .seat').forEach(function (seat) {
          var cards = seat.querySelectorAll('.pcards .card');
          var backs = seat.querySelectorAll('.pcards .card.back');
          var name = (seat.querySelector('.pname') || { textContent: '' }).textContent;
          var isBot = name !== 'Tester';
          if (seat.classList.contains('winner') && cards.length === 2 && backs.length === 0) saw.faceUp = true;
          if (isBot && isShowdown && !seat.classList.contains('winner') &&
              cards.length === 2 && backs.length === 2) saw.muck = true;
        });
      }
      if (!winnerSeats.length) captured = false;
      var btns = d.querySelectorAll('#on-controls button');
      var clicked = false;
      btns.forEach(function (b) {
        if (!clicked && /^(Check|Call)/.test(b.textContent || '')) { b.click(); clicked = true; }
      });
      await sleep(clicked ? 150 : 80);
      if (captured && !(saw.faceUp && saw.muck)) {
        // stay in this hand's window until the ring clears (next hand)
        continue;
      }
      if (captured && saw.faceUp && saw.muck) break;
    }
  }
  ok(saw.ring, 'a hand finished with a winner within 24 hands');
  ok(saw.faceUp, 'winner cards are face-up at showdown');
  ok(saw.muck, 'losing showdown hand (bot) is mucked to card backs');
  ok(!saw.showdown || saw.lift >= 3, 'winning board cards lifted (' + saw.lift + ')');
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors[0] : ''));
  console.log(fails === 0 ? 'ONLINE WINNER DOM TEST PASSED' : 'ONLINE WINNER DOM TEST FAILED');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('EXCEPTION: ' + e.message); process.exit(1); });
