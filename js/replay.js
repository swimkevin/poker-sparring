// replay.js — Hand history capture, storage, and replay state machine.
// DOM-free. The engine emits events as a hand plays; app.js feeds them here.
// Records are plain JSON in localStorage (key ps_hands_v1, last 50), so the
// replayer works offline and survives reloads. v1.4.

var HANDS_KEY = 'ps_hands_v1';
var HANDS_CAP = 50;

function rpCard(c) { return { r: c.r, s: c.s }; }

function playerLabel(table, i) {
  var p = table.players[i];
  return {
    name: p.isHero ? 'You' : p.name,
    emoji: p.isHero ? '🧑' : (p.archetype ? p.archetype.emoji : '🤖')
  };
}

// Build the record skeleton from the handStart event. Blinds/antes are posted
// by the engine without action events, so we synthesize them here in emission
// order (antes, then small blind, then big blind) to make the replay read
// naturally. totalBet right after startHand() holds exactly what each player
// has committed so far, so the synthesized pots are exact.
function startHandRecord(table, evt, mode) {
  var rec = {
    v: 1,
    id: 'h' + evt.handNo + '-' + Date.now().toString(36),
    handNo: evt.handNo,
    date: new Date().toISOString(),
    mode: mode || 'cash',
    sb: evt.sb, bb: evt.bb, ante: evt.ante || 0,
    button: evt.button,
    players: table.players.map(function (p, i) {
      var l = playerLabel(table, i);
      return { name: l.name, emoji: l.emoji, isHero: !!p.isHero, stack: p.stack + p.totalBet };
    }),
    heroHole: table.players[0].hole.map(rpCard),
    timeline: []
  };
  var pot = 0;
  function pushSyn(i, kind, amount) {
    if (amount <= 0) return;
    pot += amount;
    var l = playerLabel(table, i);
    rec.timeline.push({
      t: 'action', street: 'preflop', player: i,
      name: l.name, emoji: l.emoji, action: kind, amount: amount, pot: pot
    });
  }
  // Antes first (engine order: every live player, seat order).
  table.players.forEach(function (p, i) {
    var blind = (i === evt.sbIdx) ? Math.min(evt.sb, p.totalBet)
      : (i === evt.bbIdx) ? Math.min(evt.bb, p.totalBet) : 0;
    var ante = Math.max(0, p.totalBet - blind);
    if (ante > 0) pushSyn(i, 'ante', ante);
  });
  // Then the blinds.
  var sbBlind = Math.min(evt.sb, table.players[evt.sbIdx].totalBet);
  var bbBlind = Math.min(evt.bb, table.players[evt.bbIdx].totalBet);
  if (sbBlind > 0) pushSyn(evt.sbIdx, 'sb', sbBlind);
  if (bbBlind > 0) pushSyn(evt.bbIdx, 'bb', bbBlind);
  return rec;
}

// Record one played action. evt is the engine's actionTaken event (which
// carries street, amount, bet, and the running pot).
function recordHandAction(rec, table, evt) {
  var l = playerLabel(table, evt.player);
  rec.timeline.push({
    t: 'action', street: evt.street || 'preflop', player: evt.player,
    name: l.name, emoji: l.emoji, action: evt.action,
    amount: evt.amount || 0, bet: evt.bet || 0, pot: evt.pot || 0
  });
}

// Record a dealt street. evt is the engine's street event.
function recordHandStreet(rec, table, evt) {
  rec.timeline.push({
    t: 'street', street: evt.street,
    community: (evt.community || []).map(rpCard), pot: evt.pot || 0
  });
}

// Close out the record at handEnd. heroProfitChips is the hero's stack delta
// for the hand (app.js already computes it for stats).
function finishHandRecord(rec, table, evt, heroProfitChips) {
  var winners = (evt.winners || []).map(function (w) {
    var ids = w.winners || [w.idx];
    return {
      names: ids.map(function (i) { return playerLabel(table, i).name; }),
      amount: (w.each != null ? w.each : w.amount),
      hand: w.hand || null,
      uncalled: !!w.uncalled,
      byFold: !!w.byFold,
      potIndex: w.potIndex == null ? 0 : w.potIndex
    };
  });
  rec.timeline.push({
    t: 'end', pot: evt.pot || 0,
    community: (evt.community || []).map(rpCard), winners: winners
  });
  rec.heroNet = Math.round(heroProfitChips);
  rec.heroNetBB = Math.round((heroProfitChips / rec.bb) * 10) / 10;
  // Human-readable one-liner mirroring the winner banner.
  var main = null;
  winners.forEach(function (w) { if (!main && !w.uncalled) main = w; });
  main = main || winners[0];
  if (main) {
    var nm = main.names.join(' & ');
    rec.result = nm + (nm === 'You' ? ' win ' : ' wins ') + main.amount +
      (main.hand ? ' (' + main.hand + ')' : '');
  } else rec.result = '';
  return rec;
}

// ---------- replay state machine ----------
// upto = how many timeline entries are applied (0..timeline.length).
// Returns { street, community, actions, pot, winners, done, idx, total }.
function replayState(rec, upto) {
  var tl = rec.timeline || [];
  upto = Math.max(0, Math.min(upto == null ? tl.length : upto, tl.length));
  var st = {
    street: 'preflop', community: [], actions: [], pot: 0,
    winners: null, done: upto >= tl.length, idx: upto, total: tl.length
  };
  for (var i = 0; i < upto; i++) {
    var f = tl[i];
    if (f.t === 'street') {
      st.street = f.street;
      st.community = (f.community || []).slice();
      st.pot = f.pot;
    } else if (f.t === 'action') {
      st.actions.push(f);
      st.pot = f.pot;
    } else if (f.t === 'end') {
      st.pot = f.pot;
      st.winners = f.winners;
      st.done = true;
    }
  }
  return st;
}

// Frame index (as an `upto` count) where a street's cards are first visible.
// 'preflop' -> 0. Streets never reached (hand ended early) -> end of timeline.
function frameIndexForStreet(rec, street) {
  if (street === 'preflop') return 0;
  var tl = rec.timeline || [];
  for (var i = 0; i < tl.length; i++) {
    if (tl[i].t === 'street' && tl[i].street === street) return i + 1;
  }
  return tl.length;
}

// ---------- storage (guarded: works in Node, private mode, file://) ----------
function loadHandRecords() {
  try {
    if (typeof localStorage === 'undefined') return [];
    var raw = localStorage.getItem(HANDS_KEY);
    if (!raw) return [];
    var list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

function saveHandRecord(rec) {
  try {
    if (typeof localStorage === 'undefined') return;
    var list = loadHandRecords();
    list.unshift(rec);
    localStorage.setItem(HANDS_KEY, JSON.stringify(list.slice(0, HANDS_CAP)));
  } catch (e) { /* storage full/blocked: replayer is best-effort */ }
}

function clearHandRecords() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(HANDS_KEY);
  } catch (e) {}
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HANDS_KEY: HANDS_KEY, HANDS_CAP: HANDS_CAP,
    startHandRecord: startHandRecord, recordHandAction: recordHandAction,
    recordHandStreet: recordHandStreet, finishHandRecord: finishHandRecord,
    replayState: replayState, frameIndexForStreet: frameIndexForStreet,
    loadHandRecords: loadHandRecords, saveHandRecord: saveHandRecord,
    clearHandRecords: clearHandRecords
  };
}
