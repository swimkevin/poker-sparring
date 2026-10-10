// Coach evaluation harness (2026-10-08): plays 10 full hands in jsdom with a
// mixed hero policy (50% follow the coach, 50% deviate), captures every
// coachVerdict() at every hero decision, and flags:
//   (a) self-contradictions across decisions on the same street
//   (b) advice recommending illegal actions (cross-checked vs legalActions)
//   (c) pot-odds math errors (independent recompute of need vs stated %)
//   (d) tone problems (over-long messages, unexplained jargon, solver claims)
// Also reports per-hand results and whether following advice made money.
// Usage: node tests/coach-eval.js  (takes a few minutes; exits non-zero on flags)
var path = require('path');
var fs = require('fs');
var jsdom = require('jsdom');
var JSDOM = jsdom.JSDOM;

var HANDS = 10;

var dir = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
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

['cards', 'evaluator', 'equity', 'engine', 'bots', 'names', 'pushfold', 'stats',
 'replay', 'room-server', 'netplay', 'ui', 'online', 'app']
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
function strip(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function handNo() {
  var m = /#(\d+)/.exec(d.getElementById('hand-info').textContent || '');
  return m ? +m[1] : 0;
}

var decisions = [];   // every hero decision with verdict + action
var recaps = [];      // per-hand recap presence/content
var flags = [];
var handStartStack = {};
var handProfit = {};
var seenHands = {};
var done = false;

function flag(kind, detail) { flags.push({ kind: kind, detail: detail }); }

function legalActionsFor(st) {
  var out = ['fold'];
  if (st.toCall === 0) out.push('check'); else out.push('call');
  if (st.canBet || st.canRaise) out.push('bet');
  if (st.canRaise) out.push('raise');
  return out;
}
function adviceLegal(advice, st) {
  switch (advice) {
    case 'fold': return true;
    case 'check': return st.toCall === 0;
    case 'call': return st.toCall > 0;
    case 'bet': return !!(st.canBet || st.canRaise);
    case 'raise': return !!st.canRaise;
    default: return true; // null advice: no recommendation
  }
}
// 'bet' advice while facing a bet is really a raise — the engine treats
// bet/raise interchangeably for the hero, so only flag truly illegal ones.

function checkMath(dec) {
  var txt = dec.msgText;
  var mNeed = /need to win <b>(\d+)%/.exec(dec.msgHtml) || /need <b>(\d+)%/.exec(dec.msgHtml) || /need (\d+)%/.exec(txt);
  if (mNeed && dec.toCall > 0) {
    var stated = +mNeed[1] / 100;
    var actual = dec.toCall / (dec.pot + dec.toCall);
    if (Math.abs(stated - actual) > 0.015)
      flag('math', 'hand ' + dec.hand + ' ' + dec.street + ': stated need ' +
        mNeed[1] + '% but price is ' + (actual * 100).toFixed(1) + '% — "' +
        txt.slice(0, 90) + '"');
  }
  var mEq = /has ~<b>(\d+)%/.exec(dec.msgHtml) || /~\s*(\d+)%/.exec(txt);
  if (mEq && (+mEq[1] < 0 || +mEq[1] > 100))
    flag('math', 'hand ' + dec.hand + ': impossible equity ' + mEq[1] + '%');
}

var JARGON = ['SPR', 'implied odds', 'reverse implied', 'polarized', 'capped', 'blocker'];
function checkTone(dec) {
  var txt = dec.msgText;
  if (txt.length > 500)
    flag('tone', 'hand ' + dec.hand + ' ' + dec.street + ': message too long (' +
      txt.length + ' chars) — "' + txt.slice(0, 80) + '..."');
  if (/GTO|solver|guaranteed|always win/i.test(txt))
    flag('tone', 'hand ' + dec.hand + ': solver-grade/overclaim language — "' +
      txt.slice(0, 90) + '"');
  JARGON.forEach(function (j) {
    if (txt.indexOf(j) !== -1) {
      // explained if an em-dash, colon, paren, or "means/is" gloss follows nearby
      var i = txt.indexOf(j);
      var near = txt.slice(i, i + 120);
      if (!/[—:\(]/.test(near) && !/means|is the|refers to/.test(near))
        flag('tone', 'hand ' + dec.hand + ': jargon "' + j + '" without explanation — "' +
          txt.slice(Math.max(0, i - 30), i + 60) + '"');
    }
  });
}

function checkContradictions() {
  // Group by hand+street+facing-bet; flag fold<->bet/raise flips between
  // consecutive hero decisions in the SAME situation. A bet->fold after
  // getting raised is correct coaching (situation changed), not a
  // contradiction (v1.8.71: chaotic hero found this false positive).
  var byKey = {};
  decisions.forEach(function (dec, i) {
    var k = dec.hand + '|' + dec.street + '|' + (dec.toCall > 0 ? 'facing' : 'open');
    (byKey[k] = byKey[k] || []).push(i);
  });
  Object.keys(byKey).forEach(function (k) {
    var idxs = byKey[k];
    for (var n = 1; n < idxs.length; n++) {
      var a = decisions[idxs[n - 1]].advice, b = decisions[idxs[n]].advice;
      var strong = function (x) { return x === 'fold' || x === 'bet' || x === 'raise'; };
      if (strong(a) && strong(b) &&
          ((a === 'fold') !== (b === 'fold')))
        flag('contradiction', 'hand ' + decisions[idxs[n]].hand + ' ' +
          decisions[idxs[n]].street + ': advice flipped ' + a + ' -> ' + b +
          ' with no new cards');
    }
  });
}

function heroAct(dec) {
  // Round 2 (v1.8.71): 30% follow the coach, 70% random legal action — more
  // chaotic hero drives edge cases (weird calls, spewy bets, nitty folds)
  // and exercises the deviation path of the recap.
  var st = dec.state;
  var legal = legalActionsFor(st);
  var action;
  if (dec.advice && Math.random() < 0.3) {
    action = dec.advice === 'bet' ? 'bet' : dec.advice === 'raise' ? 'raise' :
      dec.advice === 'check' ? 'check' : dec.advice === 'call' ? 'call' : 'fold';
    if (legal.indexOf(action) === -1) action = legal[Math.floor(Math.random() * legal.length)];
  } else {
    action = legal[Math.floor(Math.random() * legal.length)];
  }
  dec.followIntended = (action === dec.advice) ||
    ((dec.advice === 'bet' || dec.advice === 'raise') && (action === 'bet' || action === 'raise'));
  dec.action = action;
  if (action === 'fold') click('btn-fold');
  else if (action === 'check' || action === 'call') click('btn-checkcall');
  else if (action === 'bet' || action === 'raise') {
    click('btn-betraise');
    setTimeout(function () { click('btn-bet-confirm'); }, 250);
  }
}

// ---- drive the game ----
if (d.getElementById('btn-quick')) click('btn-quick'); else click('btn-start');
var lastHand = 0, ticks = 0, confirmPending = false;

var iv = setInterval(function () {
  if (ticks % 40 === 0) console.log("tick", ticks, "hand", handNo());
  ticks++;
  try {
    var hn = handNo();
    if (hn > 0 && !seenHands[hn]) {
      seenHands[hn] = true;
      var st0 = w.coachState();
      handStartStack[hn] = st0.stack;
      if (hn > HANDS) { finish(); return; }
      console.log('--- hand #' + hn + ' ---');
    }
    // Skip the results pause quickly so 10 hands don't take forever.
    var nx = d.getElementById('btn-next-hand');
    if (nx && !nx.hidden && nx.offsetParent !== null) { nx.click(); }
    var foldBtn = d.getElementById('btn-fold');
    var heroLive = foldBtn && !foldBtn.disabled;
    if (heroLive && !confirmPending) {
      var vd = w.coachVerdict();
      var st = w.coachState();
      var dec = {
        hand: hn, street: st.street, toCall: st.toCall, pot: st.pot,
        canBet: st.canBet, canRaise: st.canRaise,
        advice: vd.advice, strength: vd.strength, lesson: vd.lesson,
        msgHtml: vd.html || '', msgText: strip(vd.html),
        state: st, stackBefore: st.stack
      };
      decisions.push(dec);
      if (!adviceLegal(dec.advice, st))
        flag('illegal', 'hand ' + hn + ' ' + st.street + ': advice "' + dec.advice +
          '" illegal (toCall=' + st.toCall + ', canBet=' + st.canBet +
          ', canRaise=' + st.canRaise + ')');
      checkMath(dec);
      checkTone(dec);
      heroAct(dec);
      if (dec.advice === 'bet' || dec.advice === 'raise' || dec.action === 'bet' || dec.action === 'raise') {
        confirmPending = true;
        setTimeout(function () { confirmPending = false; }, 600);
      }
    }
    // Hand just ended: the recap lands in #coach-tip. Sample it once.
    if (lastHand && hn > lastHand) {
      var tipHtml = d.getElementById('coach-tip').innerHTML || '';
      recaps.push({ hand: lastHand, hasRecap: tipHtml.indexOf('recap') !== -1,
        text: strip(tipHtml).slice(0, 160) });
      var stE = w.coachState();
      handProfit[lastHand] = stE.stack - (handStartStack[lastHand] || stE.stack);
    }
    lastHand = hn;
  } catch (e) { errors.push('tick: ' + e.message); }
  if (ticks > 2400) { console.log('TIMEOUT waiting for 10 hands'); finish(); }
}, 250);

function finish() {
  if (done) return;
  done = true;
  clearInterval(iv);
  checkContradictions();
  setTimeout(function () {
    var followed = decisions.filter(function (x) { return x.followIntended; }).length;
    console.log('\n===== COACH EVAL REPORT =====');
    console.log('hands played: ' + Object.keys(seenHands).length +
      ', hero decisions: ' + decisions.length +
      ', followed advice: ' + followed + ' (' +
      Math.round(100 * followed / Math.max(1, decisions.length)) + '%)');
    var adv = {};
    decisions.forEach(function (x) { adv[x.advice || 'none'] = (adv[x.advice || 'none'] || 0) + 1; });
    console.log('advice distribution: ' + JSON.stringify(adv));
    var withRecap = recaps.filter(function (r) { return r.hasRecap; }).length;
    console.log('post-hand recaps shown: ' + withRecap + '/' + recaps.length);
    recaps.slice(0, 3).forEach(function (r) {
      console.log('  hand ' + r.hand + ' recap: ' + (r.hasRecap ? r.text : '(none)'));
    });
    var prof = Object.keys(handProfit).map(function (h) { return handProfit[h]; });
    var tot = prof.reduce(function (a, b) { return a + b; }, 0);
    console.log('hero net over eval: ' + tot + ' chips across ' + prof.length + ' hands');
    var kinds = {};
    flags.forEach(function (f) { kinds[f.kind] = (kinds[f.kind] || 0) + 1; });
    console.log('flags: ' + flags.length + ' ' + JSON.stringify(kinds));
    flags.slice(0, 25).forEach(function (f) { console.log('  [' + f.kind + '] ' + f.detail); });
    var jsErrs = errors.filter(function (m) { return m.indexOf('navigation') === -1; });
    console.log('js errors: ' + (jsErrs.length ? jsErrs.join(' | ').slice(0, 300) : 'none'));
    var fail = flags.length > 0 || jsErrs.length > 0;
    console.log(fail ? 'EVAL FAILED' : 'EVAL CLEAN');
    process.exit(fail ? 1 : 0);
  }, 1500);
}
