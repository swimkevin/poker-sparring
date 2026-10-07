// app.js — Game flow conductor: screens, event pump, hero controls, tournament,
// push/fold trainer, coach tips, and stats recording.

(function () {
  'use strict';

  /** App version — single source of truth, mirrored in package.json and CHANGELOG.md. */
  var APP_VERSION = '1.6.0';
  // Read-only copy for update-check.js (this file's scope is an IIFE).
  try { window.APP_VERSION = APP_VERSION; } catch (e) {}

  // Last-resort error boundary: a UI glitch must never take down the table or
  // lose the player's stats. Surfaces a calm notice instead of failing silently.
  window.addEventListener('error', function (ev) {
    try {
      if (typeof UI !== 'undefined' && UI.log && document.getElementById('hand-log')) {
        UI.log('⚠️ Something glitched, but the table is safe and your stats are saved.', 'hl-leak');
      }
    } catch (e) { /* error handler must never throw */ }
  });

  function $(id) { return document.getElementById(id); }

  // ---------- custom bots ----------
  var CUSTOM_KEY = 'ps_custom_bots_v1';
  function loadCustomBots() {
    try {
      var raw = localStorage.getItem(CUSTOM_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveCustomBots(list) {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function allBots() { return ARCHETYPES.concat(loadCustomBots()); }
  function botById(id) { return getArchetype(id, loadCustomBots()); }

  // ---------- setup state ----------
  var mode = 'cash';
  var oppCount = 3; // opponents at the table (1..5)
  var selectedBots = new Set(['shark', 'station', 'maniac']);
  // Balanced default mix used when the opponent count changes.
  var DEFAULT_MIX = ['shark', 'station', 'maniac', 'rock', 'lag'];

  // ---------- game state ----------
  var table = null;
  var evtQueue = [];
  var pumping = false;
  var fastForward = false; // skip: collapse all hand-animation delays to ~instant
  var waitingForHero = false;
  var lastActions = {};
  var handCtx = null;
  var handRec = null; // in-progress hand record for the replayer (js/replay.js)
  var replay = null;  // { rec, idx } while the replay viewer is open
  var sessionStartBB = 0;
  var tourney = null; // { levelIdx }
  var gameMode = 'cash';
  var cfg = { stack: 10000, sb: 50, bb: 100 };

  var TOUR_LEVELS = [
    { sb: 10, bb: 20, ante: 0 }, { sb: 15, bb: 30, ante: 0 },
    { sb: 20, bb: 40, ante: 0 }, { sb: 30, bb: 60, ante: 5 },
    { sb: 40, bb: 80, ante: 10 }, { sb: 60, bb: 120, ante: 10 },
    { sb: 80, bb: 160, ante: 20 }, { sb: 120, bb: 240, ante: 30 },
    { sb: 160, bb: 320, ante: 40 }, { sb: 200, bb: 400, ante: 50 }
  ];

  // ================= event pump =================
  function onTableEvent(e) {
    evtQueue.push(e);
    pump();
  }

  function pump() {
    if (pumping || waitingForHero || !evtQueue.length) return;
    pumping = true;
    var e = evtQueue.shift();
    var delay = handleEvent(e);
    if (fastForward) delay = Math.min(delay, 60);
    setTimeout(function () {
      pumping = false;
      pump();
    }, delay);
  }

  function pauseForHero() { waitingForHero = true; }
  function resumeFromHero() { waitingForHero = false; pump(); }

  // Explicit turn status so it's never ambiguous why the buttons are dead.
  function setTurnStatus(text, yours) {
    var el = $('turn-status');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('yours', !!yours);
  }

  function handleEvent(e) {
    switch (e.t) {
      case 'handStart': onHandStart(e); return 700;
      case 'action': onAction(e); return 200;
      case 'actionTaken': onActionTaken(e); return 450;
      case 'street': onStreet(e); return 1100;
      case 'handEnd': onHandEnd(e); return 3200;
      case 'tableBroken': onTableBroken(); return 500;
      default: return 200;
    }
  }

  // ================= event handlers =================
  function onHandStart(e) {
    lastActions = {};
    fastForward = false; // a new hand always starts at full speed
    setTurnStatus('', false);
    UI.resetTableFx(); // drop per-hand fx state (card diff cache, stray chips)
    var skipBtn = $('btn-skip');
    if (skipBtn) skipBtn.hidden = false;
    UI.winnerBanner(null);
    UI.coachTip(null);
    UI.clearLog();
    var hero = table.players[0];
    handCtx = {
      startStack: hero.stack, vpip: false, pfr: false,
      postBet: 0, postCall: 0, preflopActed: false
    };
    handRec = startHandRecord(table, e, gameMode);
    $('hand-info').textContent = 'Hand #' + e.handNo + (gameMode === 'tourney' ? ' · Level ' + (tourney.levelIdx + 1) : '');
    updateBlindsInfo();
    UI.log('— Hand #' + e.handNo + ' · blinds ' + UI.fmt(e.sb) + '/' + UI.fmt(e.bb) +
      (e.ante ? ' (ante ' + UI.fmt(e.ante) + ')' : '') + ' —', 'hl-pot');
    UI.disableControls();
    UI.renderTable(table, { acting: -1, button: table.button });
  }

  function onAction(e) {
    var p = table.players[e.player];
    if (p.isHero) {
      pauseForHero();
      enableHeroControls();
      setTurnStatus('Your turn — action is on you.', true);
      UI.coachTip(coachTip());
      UI.renderTable(table, { lastActions: lastActions, acting: e.player, button: table.button });
    } else {
      // Bot thinks, then acts.
      pumping = true; // hold the pump until the bot moves
      setTurnStatus('Waiting for ' + p.name + '…', false);
      UI.renderTable(table, { lastActions: lastActions, acting: e.player, button: table.button });
      setTimeout(function () {
        var mv = botDecide(table, p);
        pumping = false;
        if (mv) table.act(e.player, mv.a, mv.amount);
        else pump();
      }, fastForward ? 0 : 650 + Math.random() * 750);
    }
  }

  function describeAction(e, p) {
    var who = p.isHero ? 'You' : (p.archetype ? p.archetype.emoji + ' ' : '') + p.name;
    switch (e.action) {
      case 'fold': return p.isHero ? 'You fold' : who + ' folds';
      case 'check': return p.isHero ? 'You check' : who + ' checks';
      case 'call': return (p.isHero ? 'You call ' : who + ' calls ') + UI.fmt(e.bet || p.bet);
      case 'bet': return (p.isHero ? 'You bet ' : who + ' bets ') + UI.fmt(e.amount);
      case 'raise': return (p.isHero ? 'You raise to ' : who + ' raises to ') + UI.fmt(e.amount);
      default: return who + ' ' + e.action;
    }
  }

  function onActionTaken(e) {
    var p = table.players[e.player];
    lastActions[e.player] = describeAction(e, p);
    if (p.isHero) trackHeroAction(e);
    if (handRec) recordHandAction(handRec, table, e);
    // Chip-commit actions fly a chip from the bettor's seat to the pot.
    if (e.action === 'bet' || e.action === 'raise' || e.action === 'call') UI.chipFly(e.player);
    UI.log(UI.escapeHtml(describeAction(e, p)), p.isHero ? 'hl-hero' : '');
    UI.renderTable(table, { lastActions: lastActions, acting: table.acting, button: table.button });
  }

  function trackHeroAction(e) {
    if (table.street === 'preflop' && !handCtx.preflopActed) {
      handCtx.preflopActed = true;
      if (e.action === 'call' || e.action === 'raise' || e.action === 'bet') handCtx.vpip = true;
      if (e.action === 'raise' || e.action === 'bet') handCtx.pfr = true;
    }
    if (table.street !== 'preflop') {
      if (e.action === 'bet' || e.action === 'raise') handCtx.postBet++;
      if (e.action === 'call') handCtx.postCall++;
    }
  }

  function onStreet(e) {
    lastActions = {};
    if (handRec) recordHandStreet(handRec, table, e);
    var names = { flop: 'Flop', turn: 'Turn', river: 'River' };
    UI.log((names[e.street] || e.street) + ': ' +
      e.community.map(function (c) { return cardName(c); }).join(' ') +
      ' <span class="hl-pot">(pot ' + UI.fmt(e.pot) + ')</span>');
    UI.renderTable(table, { lastActions: lastActions, acting: table.acting, button: table.button });
  }

  function heroWon(e) {
    // e.winners: winByFold -> [{idx...}]; showdown -> [{winners:[idx]}]
    var ids = [];
    e.winners.forEach(function (w) {
      if (w.idx !== undefined) ids.push(w.idx);
      else (w.winners || []).forEach(function (i) { ids.push(i); });
    });
    return ids.indexOf(0) !== -1;
  }

  function onHandEnd(e) {
    UI.disableControls();
    UI.coachTip(null);
    var hero = table.players[0];
    var won = heroWon(e);
    var revealed = {};
    (e.revealed || []).forEach(function (r) { revealed[r.idx] = true; });
    var winnerIdx = [];
    e.winners.forEach(function (w) {
      (w.winners || [w.idx]).forEach(function (i) { if (winnerIdx.indexOf(i) === -1) winnerIdx.push(i); });
    });

    // Banner
    var bits = [];
    e.winners.forEach(function (w) {
      var names = (w.winners || [w.idx]).map(function (i) {
        return table.players[i].isHero ? 'You' : table.players[i].name;
      }).join(' & ');
      var potLabel = (w.potIndex == null || w.potIndex === 0) ? 'Main pot' : 'Side pot ' + w.potIndex;
      var verb = names === 'You' ? 'win' : (names.indexOf('You') === 0 ? 'win' : 'wins');
      if (w.uncalled) bits.push(names + ' takes ' + UI.fmt(w.amount) + ' back (uncalled bet)');
      else if (w.byFold) bits.push(names + ' ' + verb + ' ' + UI.fmt(w.amount));
      else bits.push(potLabel + ': ' + names + ' ' + verb + ' ' + UI.fmt(w.each || w.amount) +
        ' <span class="wsub">' + UI.escapeHtml(w.hand || '') + '</span>');
    });
    var title;
    if (won) {
      // Title shows what the hero actually won (not the total pot when side
      // pots went elsewhere, and never the hero's stack).
      title = '🏆 You win ' + UI.fmt(UI.handWinAmount(e)) + '!';
    } else {
      title = '😤 ' + winnerIdx.map(function (i) { return table.players[i].isHero ? 'You' : table.players[i].name; }).join(' & ') + ' take' + (winnerIdx.length > 1 ? '' : 's') + ' ' + UI.fmt(e.pot);
    }
    UI.winnerBanner('<div class="wtitle">' + title + '</div><div class="wsub">' + bits.join('<br>') + '</div>');
    UI.log('<span class="hl-win">' + bits.join(' · ') + '</span>');
    // Compact persistent result in the topbar — the banner flashes by, but this
    // stays glanceable until the next hand ends.
    try {
      var lr = $('last-result');
      if (lr && e.winners.length) {
        var w0 = e.winners[0];
        var wn = (w0.winners || [w0.idx]).map(function (i) {
          return table.players[i].isHero ? 'You' : table.players[i].name;
        }).join(' & ');
        lr.textContent = w0.uncalled
          ? 'Last: ' + wn + ' takes back ' + UI.fmt(w0.amount)
          : 'Last: ' + wn + ' +' + UI.fmt(UI.firstWinnersTotal(e)) + (w0.hand ? ' · ' + w0.hand : '');
      }
    } catch (err) {}

    // Results beat: every bot's hole cards are revealed face-up (practice
    // mode — study how they played), and a folded hero sees card backs with a
    // "Show my hand" choice. renderEndTable re-runs when hero taps Show.
    var heroShow = false;
    function renderEndTable() {
      if (!table) return;
      UI.renderTable(table, {
        lastActions: {}, winners: winnerIdx, revealed: revealed,
        acting: -1, button: table.button, handEnd: true, heroShow: heroShow
      });
    }
    renderEndTable();

    // Stats
    var profit = hero.stack - handCtx.startStack;
    if (handRec) {
      finishHandRecord(handRec, table, e, profit);
      saveHandRecord(handRec);
      handRec = null;
    }
    var resultText = won ? ('Won ' + UI.fmt(e.pot)) : 'Lost';
    if (!won && e.winners.length && e.winners[0].hand) resultText = e.winners[0].hand;
    recordHand({
      mode: gameMode, bb: table.bb, heroHole: hero.hole, community: table.community,
      profitChips: profit, wonHand: won, vpip: handCtx.vpip, pfr: handCtx.pfr,
      postBet: handCtx.postBet, postCall: handCtx.postCall,
      opponents: table.players.slice(1)
        .filter(function (p) { return !p.sittingOut && p.hole.length === 2; })
        .map(function (p) {
          var a = p.archetype || { id: 'unknown', name: p.name, emoji: '🤖' };
          return { id: a.id, name: p.name, emoji: a.emoji }; // p.name is the display name (custom rename or default)
        }),
      heroStackBB: hero.stack / table.bb, potBB: e.pot / table.bb, resultText: resultText
    });
    UI.setBankroll(sessionProfitBB(hero.stack, sessionStartBB, table.bb));

    // Give the result room to breathe: a Next-hand button plus a 6s auto-deal
    // countdown, so the banner, board, and revealed hands can actually be read.
    // Skipped (fast-forward) hands stay instant.
    if (fastForward) {
      setTimeout(function () { if (table) prepareNextHand(); }, 600);
    } else {
      UI.showHandEndControls({
        autoMs: 6000,
        onNext: function () { if (table) prepareNextHand(); },
        onShowHero: hero.folded ? function () { heroShow = true; renderEndTable(); } : null
      });
    }
  }

  // ⏩ Skip: fold the hero's live hand (if it's their turn), then collapse all
  // remaining hand-animation delays so bot-vs-bot streets resolve ~instantly.
  function skipHand() {
    if (!table) return;
    var hero = table.players[0];
    if (waitingForHero && hero && !hero.folded && hero.hole.length === 2) {
      try { table.act(0, 'fold'); } catch (e) { /* already unplayable; just fast-forward */ }
      waitingForHero = false;
    }
    // Results pause showing? Skip it immediately via the Next-hand button.
    var nx = document.getElementById('btn-next-hand');
    if (nx) { nx.click(); return; }
    fastForward = true;
    pump();
  }

  function onTableBroken() {
    UI.modal({
      title: 'Table broke', body: 'Not enough players left.',
      buttons: [{ label: 'Back to lobby', primary: true, cb: leaveToLobby }]
    });
  }

  // ================= between hands =================
  function prepareNextHand() {
    if (gameMode === 'tourney') {
      // Eliminations
      table.players.forEach(function (p, i) {
        if (i !== 0 && !p.isHero && p.stack === 0 && !p.sittingOut) {
          p.sittingOut = true;
          UI.log('💀 ' + UI.escapeHtml(p.name) + ' is eliminated!');
        }
      });
      var hero = table.players[0];
      var alive = table.players.filter(function (p) { return !p.sittingOut && p.stack > 0; });
      if (hero.stack === 0) {
        var place = alive.length + 1;
        UI.modal({
          title: 'Eliminated — ' + ordinal(place) + ' place',
          body: 'Tough run. ' + alive.length + ' players remain. Review your stats and run it back!',
          buttons: [
            { label: 'View stats', cb: function () { UI.showScreen('stats'); UI.renderStats(); } },
            { label: 'New tournament', primary: true, cb: startGame }
          ]
        });
        return;
      }
      if (alive.length === 1) {
        UI.modal({
          title: '🏆 Champion!',
          body: 'You outlasted the whole table. Tournament winner!',
          buttons: [
            { label: 'View stats', cb: function () { UI.showScreen('stats'); UI.renderStats(); } },
            { label: 'New tournament', primary: true, cb: startGame }
          ]
        });
        return;
      }
      // Blind escalation every 8 hands
      if (table.handNo % 8 === 0) {
        tourney.levelIdx = Math.min(tourney.levelIdx + 1, TOUR_LEVELS.length - 1);
        var lv = TOUR_LEVELS[tourney.levelIdx];
        table.setBlinds(lv.sb, lv.bb, lv.ante);
        UI.log('⏫ Blinds up! Now ' + UI.fmt(lv.sb) + '/' + UI.fmt(lv.bb) + (lv.ante ? ' ante ' + lv.ante : ''), 'hl-pot');
      }
    } else {
      // Cash: bots top up, hero rebuy if felted
      table.players.forEach(function (p, i) {
        // Felted bots (0 chips) top up too — otherwise they sit out every future
        // hand as cardless zombies and distort live-player counts.
        if (i !== 0 && p.stack < cfg.stack * 0.5) {
          p.stack = cfg.stack;
          UI.log(UI.escapeHtml(p.name) + ' tops up to ' + UI.fmt(cfg.stack));
        }
      });
      var h = table.players[0];
      if (h.stack < table.bb) {
        UI.modal({
          title: 'You are felted!',
          body: 'Rebuy to ' + UI.fmt(cfg.stack) + ' and keep training?',
          buttons: [
            { label: 'Leave', cb: leaveToLobby },
            { label: 'Rebuy', primary: true, cb: function () { h.stack = cfg.stack; dealNext(); } }
          ]
        });
        return;
      }
    }
    dealNext();
  }

  function dealNext() {
    UI.winnerBanner(null);
    if (!table.startHand()) onTableBroken();
  }

  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function updateBlindsInfo() {
    var t = 'Blinds ' + UI.fmt(table.sb) + '/' + UI.fmt(table.bb);
    if (table.ante) t += ' (ante ' + UI.fmt(table.ante) + ')';
    if (gameMode === 'tourney') t = 'Level ' + (tourney.levelIdx + 1) + ' · ' + t;
    $('blinds-info').textContent = t;
  }

  // ================= hero controls =================
  function enableHeroControls() {
    var legal = table.legalActions(0);
    var toCall = legal.toCall;
    var cfgCtl = {
      fold: true,
      checkCall: toCall > 0
        ? { label: 'Call ' + UI.fmt(legal.callAmount), enabled: true }
        : { label: 'Check', enabled: true },
      betRaise: (legal.canBet || legal.canRaise)
        ? { label: table.currentBet === 0 ? 'Bet' : 'Raise', enabled: true }
        : { label: 'Bet', enabled: false },
      allin: { enabled: table.players[0].stack > 0 }
    };
    // Facing an all-in for less than a full call handled by engine via callAmount
    UI.setControls(cfgCtl);

    $('btn-fold').onclick = function () { heroAct('fold'); };
    $('btn-checkcall').onclick = function () { heroAct(toCall > 0 ? 'call' : 'check'); };
    $('btn-betraise').onclick = function () {
      var isRaise = table.currentBet > 0;
      var minTo = isRaise ? legal.minRaiseTo : legal.minBetTo;
      UI.openBetPanel(minTo, legal.maxRaiseTo, table.potTotal(), isRaise, function (amt) {
        heroAct(isRaise ? 'raise' : 'bet', amt);
      });
    };
    $('btn-allin').onclick = function () {
      var p = table.players[0];
      var to = p.bet + p.stack;
      if (to <= table.currentBet) heroAct('call'); // short all-in is just a call
      else heroAct(table.currentBet === 0 ? 'bet' : 'raise', to);
    };
  }

  function heroAct(a, amount) {
    if (!waitingForHero) return;
    var leak = detectLeak(a);
    if (leak) {
      recordLeak(leak);
      UI.log('🩹 <b>Leak spotted:</b> ' + UI.escapeHtml(leak.title) + ' — ' + UI.escapeHtml(leak.spot) + ' <span class="hl-leak-more">(see Stats → Leak tracker)</span>', 'hl-leak');
    }
    UI.disableControls();
    UI.coachTip(null);
    resumeFromHero();
    table.act(0, a, amount);
  }

  // Spot common hero mistakes and explain them with the underlying math.
  // Runs before the action is applied; uses the pre-action table state.
  function detectLeak(a) {
    try {
      var hero = table.players[0];
      var hole = hero.hole.map(function (c) { return cardName(c); }).join(' ');
      var street = table.street;
      var legal = table.legalActions(0);
      var pot = table.potTotal();
      function base(type, title, spot, why) {
        return { hand: table.handNo, hole: hole, street: street, type: type, title: title, spot: spot, why: why };
      }
      if (street === 'preflop') {
        // Flag genuinely loose calls, not defensible marginals: tier-6 trash
        // vs any raise, or tier-5 marginals facing real heat (4bb+). A tier-5
        // like TQo vs a standard 2.5-3bb open is a reasonable defend, not a leak.
        var tier = holeTier(hero.hole);
        if (a === 'call' && table.currentBet > table.bb &&
            (tier >= 6 || (tier >= 5 && table.currentBet >= 4 * table.bb))) {
          return base('loose-call', 'Calling too loose preflop',
            'Called ' + UI.fmt(legal.callAmount) + ' with ' + hole,
            'Hands like this win roughly 1 in 3 against a raiser\'s range. Poker profit comes from repeating small edges hundreds of times — one loose call is nothing, but a hundred of them is a bankroll leak no lucky streak can fix, because variance only evens out around your true (negative) expectation.');
        }
        return null;
      }
      var eq = estimateEquity(hero.hole, table.community, Math.min(3, table.livePlayers().length - 1), 120);
      if (a === 'call' && legal.toCall > 0) {
        var need = legal.callAmount / (pot + legal.callAmount);
        if (eq < need - 0.12) {
          return base('bad-chase', 'Chasing without the odds',
            'Called ' + UI.fmt(legal.callAmount) + ' with ~' + Math.round(eq * 100) + '% equity (needed ' + Math.round(need * 100) + '%)',
            'You needed ' + Math.round(need * 100) + '% equity to break even but had about ' + Math.round(eq * 100) + '%. Every such call quietly loses chips on average. Draws feel exciting, but bankroll discipline means chasing only when the math — pot odds plus what you might win later — says yes.');
        }
      }
      if (a === 'check' && street === 'river' && madeStrength(hero.hole, table.community) > 0.88) {
        return base('missed-value', 'Missed value bet',
          'Checked the river with a monster (' + hole + ')',
          'With a near-nut hand, checking leaves money on the table every single time. Value betting is the lowest-variance way to grow a stack: you were already winning the pot — the bet just makes it bigger. Unclaimed value is poker\'s quietest leak.');
      }
      if (a === 'fold' && legal.toCall > 0 && legal.toCall < pot * 0.35 && eq > 0.35) {
        return base('weak-fold', 'Folding too often',
          'Folded to a small bet of ' + UI.fmt(legal.toCall) + ' with ~' + Math.round(eq * 100) + '% equity',
          'Small bets have to work very often to be profitable bluffs — most of the time the math says look them up. Habitually folding here doesn\'t just lose this pot; it teaches observant opponents they can bluff you forever.');
      }
    } catch (e) { /* leak detection never breaks the game */ }
    return null;
  }

  // ================= coach =================
  function coachTip() {
    var hero = table.players[0];
    var legal = table.legalActions(0);
    var toCall = legal.toCall;
    var pot = table.potTotal();
    try {
      if (table.street === 'preflop') {
        var tier = holeTier(hero.hole);
        // Name high-card first ("Ace King", "Jack Nine") — deal order is random
        // and "Nine Jack" reads like a different hand.
        var nm = hero.hole.slice().sort(function (a, b) { return b.r - a.r; })
          .map(function (c) { return rankName(c.r); }).join(' ');
        if (toCall === 0) {
          return '<b>' + UI.escapeHtml(nm) + '</b> — ' + tierName(tier) + '. ' +
            (tier <= 3 ? 'Strong. Open it up.' : tier <= 4 ? 'Playable — open in late position, fold early.' : 'Just fold and wait.');
        }
        var need = toCall / (pot + toCall);
        var eq = estimateEquity(hero.hole, [], Math.min(3, table.livePlayers().length - 1), 150);
        return 'Call <b>' + UI.fmt(toCall) + '</b> to win <b>' + UI.fmt(pot + toCall) + '</b> — you need <b>' +
          Math.round(need * 100) + '%</b> equity. ' + UI.escapeHtml(nm) + ' has ~<b>' + Math.round(eq * 100) +
          '%</b>. ' + (eq > need + 0.03 ? 'The math says call.' : eq > need - 0.05 ? 'Close — consider position and opponent.' : 'Math says fold.');
      }
      var eq2 = estimateEquity(hero.hole, table.community, Math.min(3, table.livePlayers().length - 1), 150);
      if (toCall > 0) {
        var need2 = toCall / (pot + toCall);
        return 'Need <b>' + Math.round(need2 * 100) + '%</b>, you have ~<b>' + Math.round(eq2 * 100) +
          '%</b>. ' + (eq2 > need2 + 0.03 ? 'Call.' : 'Leaning fold unless you have a read.');
      }
      var d = detectDraws(hero.hole, table.community);
      if (d.flushDraw || d.oesd) return 'You have a <b>strong draw</b> (~' + Math.round(eq2 * 100) + '% equity) — great semi-bluff spot if checked to.';
      var pos = positionScore(table, 0);
      if (pos > 0.7) return 'You are <b>in position</b> — you can play a wider range and control the pot size.';
      return null;
    } catch (err) { return null; }
  }

  // ================= game setup =================
  function startGame() {
    cfg.stack = Math.max(200, parseInt($('cfg-stack').value, 10) || 1000);
    cfg.sb = Math.max(1, parseInt($('cfg-sb').value, 10) || 5);
    cfg.bb = Math.max(cfg.sb + 1, parseInt($('cfg-bb').value, 10) || 10);

    if (mode === 'pushfold') { startPushFold(); return; }

    var bots = allBots().filter(function (b) { return selectedBots.has(b.id); });
    if (!bots.length) bots = [botById('shark')];
    if (mode === 'hu') bots = bots.slice(0, 1);
    else bots = bots.slice(0, oppCount);

    gameMode = mode;
    var players = [{ name: NamePrefs.heroName(), isHero: true }].concat(bots.map(function (b) {
      return { name: NamePrefs.displayName(b), archetype: b };
    }));

    table = new PokerTable({
      players: players, sb: cfg.sb, bb: cfg.bb,
      startingStack: gameMode === 'tourney' ? 1000 : cfg.stack,
      ante: 0, onEvent: onTableEvent
    });
    if (gameMode === 'tourney') {
      tourney = { levelIdx: 0 };
      table.setBlinds(TOUR_LEVELS[0].sb, TOUR_LEVELS[0].bb, 0);
    } else tourney = null;

    sessionStartBB = table.players[0].stack / table.bb;
    UI.setBankroll(0);
    evtQueue = []; pumping = false; waitingForHero = false;
    UI.buildSeats(players.length);
    UI.showScreen('table');
    setTimeout(dealNext, 400);
  }

  function leaveToLobby() {
    table = null; evtQueue = []; pumping = false; waitingForHero = false;
    UI.winnerBanner(null);
    UI.showScreen('setup');
  }

  // ================= hand replayer =================
  function openHandList() {
    replay = null;
    UI.renderHandList(loadHandRecords(), openReplay);
    UI.showScreen('hands');
  }

  function openReplay(id) {
    var rec = loadHandRecords().filter(function (r) { return r.id === id; })[0];
    if (!rec) return;
    replay = { rec: rec, idx: 0 };
    showReplay();
  }

  function showReplay() {
    if (!replay) return;
    showReplaySteps();
  }

  function showReplaySteps() {
    if (!replay) return;
    var total = replay.rec.timeline.length;
    replay.idx = Math.max(0, Math.min(replay.idx, total));
    UI.renderReplay(replay.rec, replay.idx);
    $('rp-back').onclick = openHandList;
    $('rp-story').onclick = showReplayStory;
    $('rp-start').onclick = function () { replay.idx = 0; showReplaySteps(); };
    $('rp-prev').onclick = function () { replay.idx--; showReplaySteps(); };
    $('rp-next').onclick = function () { replay.idx++; showReplaySteps(); };
    $('rp-end').onclick = function () { replay.idx = total; showReplaySteps(); };
    document.querySelectorAll('#replay-view [data-street]').forEach(function (b) {
      b.onclick = function () {
        replay.idx = frameIndexForStreet(replay.rec, b.dataset.street);
        showReplaySteps();
      };
    });
  }

  function showReplayStory() {
    if (!replay) return;
    UI.renderHandStory(replay.rec);
    $('rp-back').onclick = openHandList;
    $('rp-steps').onclick = showReplaySteps;
  }

  // ================= push/fold trainer =================
  var pf = { scn: null, score: 0, total: 0 };

  function startPushFold() {
    pf.score = 0; pf.total = 0;
    UI.showScreen('pf');
    nextPFScenario();
  }
  function nextPFScenario() {
    // Train against the user's actual roster selection, with their renames.
    // Falls back to the full roster inside newPushFoldScenario when the
    // selection is smaller than the scenario needs.
    var pool = allBots().filter(function (b) { return selectedBots.has(b.id); })
      .map(function (b) {
        return { id: b.id, name: NamePrefs.displayName(b), emoji: b.emoji, pushTier: b.pushTier };
      });
    pf.scn = newPushFoldScenario(pool);
    UI.renderPFScenario(pf.scn);
    $('pf-score').textContent = 'Score: ' + pf.score + ' / ' + pf.total;
  }
  function pfAnswer(action) {
    var fb = evaluatePushFold(pf.scn, action);
    pf.total++;
    if (fb.right) pf.score++;
    UI.renderPFFeedback(fb);
    $('pf-score').textContent = 'Score: ' + pf.score + ' / ' + pf.total;
  }

  // ================= wiring =================
  function wire() {
    // Theme: remembered light/dark preference, default dark. Visual only.
    var THEME_KEY = 'ps_theme';
    function applyTheme(t) {
      document.documentElement.dataset.theme = t;
      try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    }
    try {
      var savedTheme = localStorage.getItem(THEME_KEY);
      document.documentElement.dataset.theme =
        (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'dark';
    } catch (e) { document.documentElement.dataset.theme = 'dark'; }
    var themeBtn = $('theme-toggle');
    if (themeBtn) themeBtn.onclick = function () {
      applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
    };
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.onclick = function () {
        var dest = b.dataset.nav;
        if (dest === 'setup') UI.showScreen('setup');
        else if (dest === 'archetypes') { UI.renderArchetypes(loadCustomBots(), deleteCustom); UI.showScreen('archetypes'); }
        else if (dest === 'hands') { openHandList(); }
        else if (dest === 'stats') { UI.renderStats(); UI.showScreen('stats'); }
        else if (dest === 'learn') { UI.renderLearn(); UI.showScreen('learn'); }
        else if (dest === 'online') { Online.show(); }
      };
    });
    document.querySelectorAll('.mode-card').forEach(function (c) {
      c.onclick = function () {
        document.querySelectorAll('.mode-card').forEach(function (x) { x.classList.remove('selected'); });
        c.classList.add('selected');
        mode = c.dataset.mode;
        // Heads-up is always 1 opponent; other modes use the stepper.
        $('opp-count').textContent = mode === 'hu' ? 1 : oppCount;
        syncQuickHint();
      };
    });
    $('btn-start').onclick = startGame;
    // One-tap start: a live mirror of the configuration below — no forcing,
    // no hardcoded "3 bots". The hint always describes exactly what one tap
    // does, so the stepper and the hero button can never contradict.
    function syncQuickHint() {
      var q = $('quick-hint');
      if (!q) return;
      var modeName = { cash: 'cash game', hu: 'heads-up', tourney: 'tournament', pushfold: 'push/fold drills' }[mode] || 'cash game';
      if (mode === 'pushfold') { q.textContent = 'One tap: ' + modeName + '.'; return; }
      var n = mode === 'hu' ? 1 : oppCount;
      var stack = Math.max(200, parseInt($('cfg-stack').value, 10) || 1000);
      var sb = Math.max(1, parseInt($('cfg-sb').value, 10) || 5);
      var bb = Math.max(sb + 1, parseInt($('cfg-bb').value, 10) || 10);
      q.textContent = 'One tap: ' + modeName + ' vs ' + (n === 1 ? '1 bot' : n + ' bots') +
        ', ' + stack + '-chip stacks, ' + sb + '/' + bb + ' blinds. Customize below if you like.';
    }
    var bq = $('btn-quick');
    if (bq) bq.onclick = function () { startGame(); };
    $('btn-leave').onclick = leaveToLobby;
    var sk = $('btn-skip');
    if (sk) sk.onclick = skipHand;
    $('btn-pf-leave').onclick = leaveToLobby;

    // username: persisted, applied to the hero seat at game start
    var unameInput = $('cfg-username');
    if (unameInput) {
      unameInput.value = NamePrefs.getUsername();
      unameInput.addEventListener('change', function () {
        NamePrefs.setUsername(unameInput.value);
        unameInput.value = NamePrefs.getUsername(); // trimmed to max length
      });
    }

    // opponent count stepper
    function syncRosterToCount() {      var ids = [];
      DEFAULT_MIX.forEach(function (id) { if (botById(id)) ids.push(id); });
      loadCustomBots().forEach(function (a) { ids.push(a.id); });
      selectedBots = new Set(ids.slice(0, oppCount));
      $('opp-count').textContent = oppCount;
      UI.renderRoster(allBots(), selectedBots);
      syncQuickHint();
    }
    $('opp-minus').onclick = function () {
      if (mode === 'hu') return;
      oppCount = Math.max(1, oppCount - 1);
      syncRosterToCount();
    };
    $('opp-plus').onclick = function () {
      if (mode === 'hu') return;
      oppCount = Math.min(5, oppCount + 1);
      syncRosterToCount();
    };
    // push/fold buttons
    $('pf-shove').onclick = function () { pfAnswer(pf.scn.facingShove ? 'call' : 'shove'); };
    $('pf-fold').onclick = function () { pfAnswer('fold'); };
    $('pf-next').onclick = nextPFScenario;

    // custom bot builder
    [['cust-loose', 'v-loose'], ['cust-aggr', 'v-aggr'], ['cust-bluff', 'v-bluff'], ['cust-stub', 'v-stub']]
      .forEach(function (pair) {
        $(pair[0]).oninput = function () { $(pair[1]).textContent = $(pair[0]).value; };
      });
    $('btn-add-custom').onclick = function () {
      var name = $('cust-name').value.trim() || 'My Bot';
      var emoji = $('cust-emoji').value.trim() || '🤖';
      var a = customArchetype({
        name: name, emoji: emoji,
        desc: $('cust-desc').value.trim(),
        looseness: +$('cust-loose').value, aggression: +$('cust-aggr').value,
        bluff: +$('cust-bluff').value, stubborn: +$('cust-stub').value
      });
      var list = loadCustomBots();
      list.push(a);
      saveCustomBots(list);
      selectedBots.add(a.id);
      $('cust-name').value = ''; $('cust-desc').value = '';
      UI.renderArchetypes(list, deleteCustom);
      UI.renderRoster(allBots(), selectedBots);
    };

    // stats
    $('btn-export').onclick = function () {
      var blob = new Blob([exportStatsJSON()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'poker-sparring-hands.json';
      a.click();
    };
    $('btn-reset-stats').onclick = function () {
      if (confirm('Reset all training stats?')) { clearStats(); UI.renderStats(); }
    };

    UI.renderRoster(allBots(), selectedBots);
    // Stack/blind tweaks update the quick-start hint live.
    ['cfg-stack', 'cfg-sb', 'cfg-bb'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', syncQuickHint);
    });
    syncQuickHint();
    var vv = $('app-version');
    if (vv) vv.textContent = 'v' + APP_VERSION + ' · offline · stats stay in this browser';
  }

  function deleteCustom(id) {
    saveCustomBots(loadCustomBots().filter(function (a) { return a.id !== id; }));
    selectedBots.delete(id);
    UI.renderArchetypes(loadCustomBots(), deleteCustom);
    UI.renderRoster(allBots(), selectedBots);
  }

  document.addEventListener('DOMContentLoaded', wire);
})();
