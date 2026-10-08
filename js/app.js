// app.js — Game flow conductor: screens, event pump, hero controls, tournament,
// push/fold trainer, coach tips, and stats recording.

(function () {
  'use strict';

  /** App version — single source of truth, mirrored in package.json and CHANGELOG.md. */
  var APP_VERSION = '1.8.33';
  // Read-only copy for update-check.js (this file's scope is an IIFE).
  try { window.APP_VERSION = APP_VERSION; } catch (e) {}

  /**
   * Feature flags — Flappy Bird simplicity by default.
   * Advanced features are preserved in code but hidden until enabled.
   * Enable via console: PS_FLAGS.tournamentMode = true (then refresh).
   * Or via URL: ?flags=tournamentMode,pushFoldTrainer
   */
  var DEFAULT_FLAGS = {
    tournamentMode: false,  // Tournament mode card
    headsUpMode: false,     // Heads-Up mode card
    pushFoldTrainer: false, // Push/Fold trainer mode card
    customBots: false,      // Custom bot builder section
    advancedStats: false    // Leak tracker, detailed per-archetype stats
  };
  var PS_FLAGS = Object.assign({}, DEFAULT_FLAGS);
  // URL override: ?flags=a,b
  try {
    var flagParam = new URLSearchParams(window.location.search).get('flags');
    if (flagParam) {
      flagParam.split(',').forEach(function (f) {
        f = f.trim();
        if (f in PS_FLAGS) PS_FLAGS[f] = true;
      });
    }
    // localStorage persistence for console-enabled flags
    var savedFlags = JSON.parse(localStorage.getItem('ps_feature_flags') || '{}');
    Object.keys(savedFlags).forEach(function (f) {
      if (f in PS_FLAGS && savedFlags[f]) PS_FLAGS[f] = true;
    });
  } catch (e) {}
  // Expose for console toggling with persistence
  window.PS_FLAGS = PS_FLAGS;
  window.enableFlag = function (name) {
    if (!(name in PS_FLAGS)) return 'Unknown flag: ' + name;
    PS_FLAGS[name] = true;
    try {
      var s = JSON.parse(localStorage.getItem('ps_feature_flags') || '{}');
      s[name] = true;
      localStorage.setItem('ps_feature_flags', JSON.stringify(s));
    } catch (e) {}
    return name + ' enabled — refresh to see it.';
  };

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
  // Opponent selection: a Set of bot ids, the single source of truth.
  // Invariants: 1 <= size <= maxOpp() (1 for heads-up, 7 otherwise).
  // The stepper, mode cards, and roster cards all mutate this set; the count
  // display derives from it, so the number and the highlighted cards can
  // never disagree. Persisted across reloads (stale ids are dropped).
  var ROSTER_KEY = 'ps_roster_v1';
  function loadRoster() {
    try {
      var raw = localStorage.getItem(ROSTER_KEY);
      if (!raw) return null;
      var ids = JSON.parse(raw).filter(function (id) { return botById(id); });
      return ids.length ? ids : null;
    } catch (e) { return null; }
  }
  function saveRoster() {
    try { localStorage.setItem(ROSTER_KEY, JSON.stringify(Array.from(selectedBots))); }
    catch (e) {}
  }
  var selectedBots = new Set(loadRoster() || ['lag', 'rohan', 'amogh']);
  var preHuSelection = null; // full table remembered across a heads-up detour
  function maxOpp() { return mode === 'hu' ? 1 : 7; }
  function rosterOrderIds() { return allBots().map(function (b) { return b.id; }); }
  // Transient hint under the bot roster ("Only 1 opponent for heads-up", …).
  var rosterHintTimer = null;
  function rosterHint(msg) {
    var el = $('roster-hint');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (rosterHintTimer) clearTimeout(rosterHintTimer);
    rosterHintTimer = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

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
  var sessionStartChips = 0;
  // Exact hero stack at the end of the previous hand. The engine posts
  // antes/blinds BEFORE emitting handStart, so snapshotting hero.stack in
  // onHandStart would exclude blind postings from per-hand P/L (daily QA
  // 2026-10-08: folding the BB showed 0 instead of -10). The previous hand's
  // end stack IS the next hand's pre-blind stack; sessionStartChips covers
  // hand 1 of a session and post-rebuy hands.
  var lastHeroEndStack;
  // Bankroll chip shows LIFETIME profit from persistent stats, so it survives
  // refreshes. (Session-only profit reset to 0 on every page load.)
  function refreshBankroll() {
    try {
      var st = (typeof loadStats === 'function') ? loadStats() : null;
      UI.setBankroll(st ? (st.profitChips || 0) : 0);
    } catch (e) { UI.setBankroll(0); }
  }
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
      startStack: (typeof lastHeroEndStack === 'number') ? lastHeroEndStack
        : (sessionStartChips || hero.stack),
      vpip: false, pfr: false,
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
    setTurnStatus('', false); // drop any stale "Waiting for X…" during the results pause
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
      var takeVerb = names.indexOf('You') === 0 ? 'take' : 'takes'; // "You take", not "You takes"
      if (w.uncalled) bits.push(names + ' ' + takeVerb + ' ' + UI.fmt(w.amount) + ' back (uncalled bet)');
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
          ? 'Last: ' + wn + ' ' + (wn.indexOf('You') === 0 ? 'take' : 'takes') + ' back ' + UI.fmt(w0.amount)
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

    // ---- tilt: bad beats steam players, wins cool them off ----
    // Losers at showdown holding a strong hand just took a bad beat; big-pot
    // losers and felted players steam too. Winners and time decay it.
    try {
      var wonSet = {};
      winnerIdx.forEach(function (i) { wonSet[i] = true; });
      var showdown = !e.winners.some(function (w) { return w.byFold; });
      table.players.forEach(function (p, i) {
        if (p.isHero) return;
        var arch = p.archetype || {};
        var prone = (typeof arch.tiltProne === 'number') ? arch.tiltProne : 0.5;
        var t = p.tilt || 0;
        t = Math.max(0, t - 0.12); // time heals
        if (wonSet[i]) t = Math.max(0, t - 0.25); // winning cools off fast
        else {
          if (showdown && revealed[i] && p.hole.length === 2) {
            // Lost at showdown — how strong was the beaten hand?
            var ms = madeStrength(p.hole, table.community);
            if (ms >= 0.72) t += 0.38 * prone; // bad beat: two pair+ cracked
            else if (ms >= 0.55) t += 0.15 * prone;
          }
          if (e.pot >= table.bb * 30) t += 0.15 * prone; // big pot lost
          if (p.stack <= 0) t += 0.30 * prone; // felted
        }
        p.tilt = Math.max(0, Math.min(1, t));
      });
    } catch (err) {}

    // ---- bot thinking: post-hand learning notes ----
    // Pick the 1-2 most teachable bot actions and explain the range logic
    // behind them, so each hand trains reading real player types.
    try { botThinkingNotes(e); } catch (err) {}

    // Stats
    var profit = hero.stack - handCtx.startStack;
    lastHeroEndStack = hero.stack; // pre-blind baseline for the next hand
    if (handRec) {
      finishHandRecord(handRec, table, e, profit);
      saveHandRecord(handRec);
      handRec = null;
    }
    // resultText is what Stats → Recent hands shows. Use what the hero
    // actually won, not the total pot (side-pot wins overstated it).
    var resultText = won ? ('Won ' + UI.fmt(UI.handWinAmount(e))) : 'Lost';
    if (!won && e.winners.length && e.winners[0].hand) resultText = e.winners[0].hand;
    // Capture everyone's cards for the hand history: hero always, opponents only if revealed
    var allHands = table.players.map(function (p, idx) {
      var show = idx === 0 || revealed[idx];
      return {
        name: idx === 0 ? 'You' : p.name,
        emoji: idx === 0 ? null : (p.archetype ? p.archetype.emoji : '🤖'),
        hole: show && p.hole.length === 2 ? p.hole.map(function (c) { return { r: c.r, s: c.s }; }) : null,
        isHero: idx === 0
      };
    });
    recordHand({
      mode: gameMode, bb: table.bb, heroHole: hero.hole, community: table.community,
      recId: handRec ? handRec.id : null,
      allHands: allHands,
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
    refreshBankroll();

    // Give the result room to breathe: a Next-hand button plus a 6s auto-deal
    // countdown, so the banner, board, and revealed hands can actually be read.
    // Skipped (fast-forward) hands stay instant.
    if (fastForward) {
      setTimeout(function () { if (table) prepareNextHand(); }, 600);
    } else {
      // Give the result room to breathe: a Next-hand button plus a 16s auto-deal
      // countdown, so the board and revealed hands stay readable.
      UI.showHandEndControls({
        autoMs: 16000,
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
      // Eliminations (or rebuys, if enabled)
      table.players.forEach(function (p, i) {
        if (i !== 0 && !p.isHero && p.stack === 0 && !p.sittingOut) {
          if (cfg.tourneyRebuys) {
            p.stack = 1000; p.rebuys = (p.rebuys || 0) + 1;
            UI.log('🔄 ' + UI.escapeHtml(p.name) + ' rebuys (1000 chips)');
          } else {
            p.sittingOut = true;
            UI.log('💀 ' + UI.escapeHtml(p.name) + ' is eliminated!');
          }
        }
      });
      var hero = table.players[0];
      var alive = table.players.filter(function (p) { return !p.sittingOut && p.stack > 0; });
      if (hero.stack === 0) {
        var place = alive.length + 1;
        var buttons = [
          { label: 'View stats', cb: function () { UI.showScreen('stats'); UI.renderStats(); } },
          { label: 'New tournament', primary: true, cb: startGame }
        ];
        if (cfg.tourneyRebuys) {
          buttons.unshift({
            label: '🔄 Rebuy (1000 chips)', primary: true,
            cb: function () {
              hero.stack = 1000; hero.rebuys = (hero.rebuys || 0) + 1;
              sessionStartChips = 1000; lastHeroEndStack = 1000;
              UI.log('🔄 You rebuy (1000 chips)');
              prepareNextHand();
            }
          });
          // New tournament is no longer the primary action when rebuy is available
          buttons[2].primary = false;
        }
        UI.modal({
          title: 'Eliminated — ' + ordinal(place) + ' place',
          body: 'Tough run. ' + alive.length + ' players remain.' +
            (cfg.tourneyRebuys ? ' Rebuy to stay in, or start fresh.' : ' Review your stats and run it back!'),
          buttons: buttons
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
      // Blind escalation every N hands (configurable, default 8)
      var blindEvery = Math.max(2, cfg.blindInterval || 8);
      if (table.handNo % blindEvery === 0) {
        tourney.levelIdx = Math.min(tourney.levelIdx + 1, TOUR_LEVELS.length - 1);
        var lv = TOUR_LEVELS[tourney.levelIdx];
        table.setBlinds(lv.sb, lv.bb, lv.ante);
        UI.log('⏫ Blinds up! Now ' + UI.fmt(lv.sb) + '/' + UI.fmt(lv.bb) + (lv.ante ? ' ante ' + lv.ante : ''), 'hl-pot');
      }
    } else {
      // Cash: bot rebuys (with counters, like PokerNow), then hero rebuy if felted.
      // A rebuying bot comes back steaming — fresh tilt, looser play.
      table.players.forEach(function (p, i) {
        if (i === 0 || p.sittingOut) return;
        if (p.stack <= 0) {
          if (cfg.botRebuys === false) { p.sittingOut = true; return; }
          var arch = p.archetype || {};
          var rp = (typeof arch.rebuy === 'number') ? arch.rebuy : 0.7;
          if (Math.random() < rp) {
            p.stack = cfg.stack;
            p.rebuys = (p.rebuys || 0) + 1;
            p.tilt = Math.min(1, (p.tilt || 0) + 0.25);
            UI.log(UI.escapeHtml(p.archetype ? p.archetype.emoji : '🤖') + ' ' +
              UI.escapeHtml(p.name) + ' rebuys to ' + UI.fmt(cfg.stack) +
              ' (' + ordinal(p.rebuys) + ' rebuy) — and is steaming');
          } else {
            p.sittingOut = true;
            UI.log(UI.escapeHtml(p.name) + ' busts out and leaves the table');
          }
        } else if (p.stack < cfg.stack * 0.5) {
          // Felted bots (0 chips) top up too — otherwise they sit out every future
          // hand as cardless zombies and distort live-player counts.
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
            { label: 'Rebuy', primary: true, cb: function () { h.stack = cfg.stack; h.rebuys = (h.rebuys || 0) + 1; sessionStartChips = cfg.stack; lastHeroEndStack = cfg.stack; UI.setBankroll(0); dealNext(); } }
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
      }, { roundBets: !!(cfg && cfg.roundBets) });
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
  // ================= coach: TAG fundamentals + fold-equity math =================
  // The coach teaches tight-aggressive poker: play fewer hands, play them
  // aggressively. Every tip carries the math — pot odds when calling, bluff
  // break-even when betting — and adjusts to the villain in the hand.
  // (bluffBE, villainFoldy/villainBluffy, exploitLine live in equity.js.)
  function pct(x) { return Math.round(x * 100) + '%'; }

  // All live opponents with their archetypes — the coach considers everyone,
  // not just one villain (Kevin 2026-10-08).
  function liveOpponents() {
    var live = [];
    for (var i = 1; i < table.players.length; i++) {
      var pl = table.players[i];
      if (!pl.folded && !pl.sittingOut) live.push(pl);
    }
    return live;
  }

  // Position name for the hero: BTN, CO, MP, UTG, BB, SB
  function heroPositionName() {
    var n = table.players.length, order = [], s = table.button;
    for (var k = 0; k < n; k++) {
      s = (s + 1) % n;
      var p = table.players[s];
      if (!p.sittingOut) order.push(s);
    }
    var pos = order.indexOf(0), m = order.length;
    if (m <= 2) return pos === m - 1 ? 'button' : 'big blind';
    if (pos === m - 1) return 'button';
    if (pos === m - 2) return 'cutoff';
    if (pos === 0) return 'small blind';
    if (pos === 1) return 'big blind';
    if (pos <= 2) return 'early position';
    return 'middle position';
  }

  // One-line read on each opponent: name + style + what it means for you.
  function opponentReads() {
    var live = liveOpponents();
    if (!live.length) return '';
    var reads = live.map(function (p) {
      var A = p.archetype, name = UI.escapeHtml(p.name);
      if (!A) return name + ' (unknown style)';
      var style = '';
      if (A.id === 'maniac') style = 'maniac — bluffs constantly, never fold to their bets without a hand';
      else if (A.id === 'station') style = 'calling station — never bluff them, value-bet relentlessly';
      else if (A.id === 'rock') style = 'rock — only plays premiums, fold when they show strength';
      else if (A.id === 'lag') style = 'loose-aggressive — wide range, 3-bet your strong hands';
      else if (A.id === 'shark') style = 'solid TAG — balanced, don\'t get fancy';
      else if (A.id === 'nathan') style = 'trapper — never raises without a monster';
      else if (A.id === 'amogh') style = 'sizing tell — big bets mean big hands';
      else if (A.id === 'bubble') style = 'super tight — this is the nuts when they bet';
      else if (A.id === 'grinder') style = 'tournament pro — polarized 3-bets, respect without a hand';
      else style = (A.name || 'tricky') + ' — play straightforward';
      return '<b>' + name + '</b> (' + style + ')';
    });
    return '<div class="coach-opps">🎯 ' + reads.join(' · ') + '</div>';
  }

  // Suitedness and multi-way are woven into the advice naturally, not as
  // separate badges (Kevin 2026-10-08). These helpers feed the reasoning.
  function isSuited(hole) {
    return hole.length === 2 && hole[0].s === hole[1].s;
  }
  function isMultiway() {
    return liveOpponents().length >= 3;
  }

  // Fold equity explainer: how often they need to fold for a bluff to profit.
  function foldEquityNote(betSize, potSize, V) {
    var be = bluffBE(betSize, potSize);
    var foldy = V ? villainFoldy(V.archetype) : 0.5;
    var vName = V ? UI.escapeHtml(V.name) : 'villain';
    return 'Fold equity: bluffing ' + UI.fmt(betSize) + ' into ' + UI.fmt(potSize) +
      ' needs <b>' + pct(be) + '</b> folds to break even. ' + vName +
      ' folds ~<b>' + pct(foldy) + '</b> — ' +
      (foldy > be + 0.1 ? 'profitable bluff.' : foldy > be - 0.1 ? 'marginal.' : 'not enough — skip the bluff.');
  }

  // The most relevant live opponent: the street's aggressor, else the lone
  // villain, else the first live seat. (Kept for single-villain math.)
  function pickVillain() {
    var live = [];
    for (var i = 1; i < table.players.length; i++) {
      var pl = table.players[i];
      if (!pl.folded && !pl.sittingOut) live.push(pl);
    }
    if (!live.length) return null;
    if (live.length === 1) return live[0];
    var agg = live[0], best = -1;
    live.forEach(function (p) { var b = p.bet || 0; if (b > best) { best = b; agg = p; } });
    return best > 0 ? agg : live[0];
  }

  function villainLine(V) {
    if (!V) return '';
    return ' <span class="coach-v">vs ' + UI.escapeHtml(V.name) + ': ' +
      UI.escapeHtml(exploitLine(V.archetype)) + '.</span>';
  }

  // A high overcard on the latest street — the classic bluff card.
  function scareCardRank() {
    var c = table.community;
    if (!c.length) return null;
    var last = c[c.length - 1], prevMax = 0;
    for (var i = 0; i < c.length - 1; i++) prevMax = Math.max(prevMax, c[i].r);
    return (last.r >= 11 && last.r > prevMax) ? rankName(last.r) : null;
  }

  // ---------------- post-hand bot thinking ----------------
  // After each hand, explain the range logic behind the 1-2 most teachable
  // bot actions, so every hand trains reading real player types.
  function botThinkingNotes(e) {
    if (!handRec || !handRec.timeline) return;
    var cands = [];
    handRec.timeline.forEach(function (t) {
      if (t.t !== 'action' || t.player === 0) return;
      if (t.action !== 'bet' && t.action !== 'raise') return;
      var p = table.players[t.player];
      if (!p || !p.archetype) return;
      var size = t.bet || t.amount || 0;
      if (!(size > 0) || !(t.pot > 0)) return;
      cands.push({ t: t, p: p, ratio: size / t.pot });
    });
    if (!cands.length) return;
    // Biggest bets relative to pot first; preflop 3-bets get a bonus.
    cands.sort(function (a, b) {
      var sa = a.ratio + (a.t.street === 'preflop' && a.t.action === 'raise' ? 0.5 : 0);
      var sb = b.ratio + (b.t.street === 'preflop' && b.t.action === 'raise' ? 0.5 : 0);
      return sb - sa;
    });
    var seen = {}, notes = [];
    cands.forEach(function (c) {
      if (notes.length >= 2) return;
      var id = c.p.archetype.id;
      if (seen[id]) return;
      seen[id] = true;
      var why = thinkingWhy(c.p.archetype, c.t);
      if (why) notes.push('💭 ' + UI.escapeHtml(c.p.archetype.emoji || '🤖') + ' <b>' +
        UI.escapeHtml(c.p.name) + '</b> ' + why);
    });
    notes.forEach(function (n) { UI.log(n, 'hl-think'); });
  }

  function thinkingWhy(A, t) {
    var verb = t.action === 'raise' ? 'raised' : 'bet';
    var where = t.street === 'preflop' ? 'preflop' : 'on the ' + t.street;
    var base = verb + ' ' + UI.fmt(t.bet || t.amount) + ' ' + where;
    switch (A.id) {
      case 'maniac': return base + ' — with ~65% of hands in range, any two cards qualify. Your exploit: trap with strong hands, never bluff.';
      case 'station': return base + ' — they almost never raise, so this is real strength. Believe it; fold your marginal hands.';
      case 'rock': return base + ' — they play ~10% of hands. This is premiums only.';
      case 'nathan': return base + ' — the trap springs. They never raise before the river without a monster.';
      case 'amogh': return base + ' — sizing is the weapon. Big bets mean big hands; don\'t bluff-catch light.';
      case 'bubble': return base + ' — they fold everything but the nuts. This IS the nuts.';
      case 'grinder': return base + ' — tournament 3-bet: polarized between premiums and blocker bluffs. Respect it without a hand.';
      case 'lag': return base + ' — constant pressure with ~30% of hands. Could be anything; 3-bet your strong hands back at them.';
      case 'shark': return base + ' — solid TAG aggression, balanced between value and bluffs. Don\'t get fancy.';
      default:
        var lo = Math.round(((A.openTier || 3) / 6) * 100);
        return base + ' — fits a ~' + lo + '%-range profile. Play your standard exploit.';
    }
  }

  function coachTip() {
    var hero = table.players[0];
    var legal = table.legalActions(0);
    var toCall = legal.toCall;
    var pot = table.potTotal();
    var esc = UI.escapeHtml, fmt = UI.fmt;
    try {
      var V = pickVillain();
      var tail = villainLine(V);
      var vName = V ? esc(V.name) : 'they';
      var posName = heroPositionName();
      var posNote = ' <span class="coach-pos">📍 You\'re on the ' + esc(posName) + '.</span>';
      var opps = opponentReads();
      var nm = hero.hole.slice().sort(function (a, b) { return b.r - a.r; })
        .map(function (c) { return rankName(c.r); }).join(' ');
      // ---------------- preflop ----------------
      if (table.street === 'preflop') {
        var tier = holeTier(hero.hole);
        if (toCall === 0) {
          var msg;
          if (tier <= 2) msg = '<b>' + esc(nm) + '</b> — premium. <b>Open-raise</b> 2.5–3× the blind. TAG poker is raise-or-fold; never limp.';
          else if (tier <= 4) msg = '<b>' + esc(nm) + '</b> — playable. Open it in late position, fold it early. If you play it, raise.';
          else msg = '<b>' + esc(nm) + '</b> — fold. TAG means folding ~80% of hands preflop; discipline is the edge.';
          if (tier <= 4 && V && villainFoldy(V && V.archetype) > 0.6)
            msg += ' Good steal spot — ' + vName + ' folds too much.';
          return msg + tail + posNote + opps;
        }
        var open = table.currentBet;
        var need = toCall / (pot + toCall);
        var eq = estimateEquity(hero.hole, [], Math.min(3, table.livePlayers().length - 1), 150);
        if (tier <= 2 && legal.canRaise) {
          // Value 3-bet: 3x the open in position is the standard TAG sizing.
          var three = Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round(open * 3)));
          return '<b>3-bet</b> ' + esc(nm) + ' to ~<b>' + fmt(three) + '</b> (3× their open). Best hand most of the time, fold equity the rest — the 3-bet is the TAG money-maker.' + tail + posNote + opps;
        }
        var hasAce = hero.hole.some(function (c) { return c.r === 14; });
        if (tier >= 4 && hasAce && legal.canRaise && V && villainFoldy(V && V.archetype) > 0.45) {
          return 'Mix in a <b>bluff 3-bet</b> sometimes: your Ace blocks their strongest continuing hands, and ' + vName + ' folds to pressure. Balanced ranges get paid.' + tail + posNote + opps;
        }
        var suited = isSuited(hero.hole);
        var multiway = isMultiway();
        // Suited hands play better multi-way (flush potential); offsuit
        // marginal hands get worse. Adjust the call threshold naturally.
        var threshold = need + (suited ? 0.0 : 0.02) + (multiway ? 0.04 : 0);
        var handDesc = esc(nm) + (suited ? ' suited' : '');
        var verdict;
        if (eq > threshold + 0.03) {
          verdict = 'The math says call' + (suited ? ' — being suited gives you extra ways to win' : '') + '.';
        } else if (eq > threshold - 0.05) {
          verdict = multiway ? 'Too thin multi-way — fold and wait for a better spot.'
            : 'Close — prefer it in position.';
        } else {
          verdict = 'Math says fold' + (multiway ? ' — too many players to overcome' : '') + '.';
        }
        return 'Call <b>' + fmt(toCall) + '</b> to win <b>' + fmt(pot + toCall) + '</b> — you need <b>' +
          pct(need) + '</b> equity. ' + handDesc + ' has ~<b>' + pct(eq) + '</b>. ' +
          verdict + tail + posNote + opps;
      }
      // ---------------- postflop ----------------
      var eq2 = estimateEquity(hero.hole, table.community, Math.min(3, table.livePlayers().length - 1), 150);
      var str = madeStrength(hero.hole, table.community);
      var d = detectDraws(hero.hole, table.community);
      var pos = positionScore(table, 0);
      var foldy = villainFoldy(V && V.archetype);
      if (toCall === 0) {
        var canBet = legal.canBet || legal.canRaise;
        var halfBet = Math.max(1, Math.round(pot / 2));
        var be = pct(bluffBE(halfBet, pot));
        if (str >= 0.60 || eq2 >= 0.62) {
          // Value: size up vs stations who never fold.
          var sizing = foldy < 0.25 ? '¾-pot' : '½–¾ pot';
          return '<b>Bet for value</b> (~' + sizing + ', ' + fmt(halfBet) + '). Ask: what worse hands call? Never slow-play — build the pot while ahead.' + tail + posNote + opps;
        }
        if ((d.flushDraw || d.oesd) && canBet) {
          if (foldy < 0.25)
            return 'Strong draw (~' + pct(eq2) + '), but ' + vName + ' never folds — <b>check</b> and take the free card.' + tail + posNote + opps;
          return '<b>Semi-bluff</b> the draw (~' + pct(eq2) + '): bet ~½ pot (' + fmt(halfBet) +
            '). Two ways to win — folds now, or you hit. Needs only <b>' + be + '</b> folds on fold equity alone.' + tail + posNote + opps;
        }
        if (canBet) {
          var scare = scareCardRank();
          var spot = (pos > 0.6 ? 1 : 0) + (scare ? 1 : 0) + (foldy > 0.55 ? 1 : 0) - (foldy < 0.3 ? 2 : 0);
          // Never suggest a pure bluff into a station: if they don't fold,
          // the "Bluff" line would contradict the per-opponent "never bluff" tail.
          // Multi-way: bluffs rarely get through multiple players.
          // Weave this into the reasoning naturally.
          var mw = isMultiway();
          if (mw) spot -= 2;
          if (spot >= 2 && foldy >= 0.4 && !mw) {
            var why = [];
            if (scare) why.push('the ' + esc(scare) + ' is a scare card');
            if (pos > 0.6) why.push('you have position');
            if (foldy > 0.55) why.push(vName + ' overfolds');
            return '<b>Bluff</b> ~½ pot (' + fmt(halfBet) + ') — needs <b>' + be + '</b> folds (' + why.join(', ') +
              '). Mix bluffs in, or your value bets never get paid.' + tail + posNote + opps;
          }
          if (mw) return '<b>Check</b> — too many players to bluff through. Wait for a real hand.' + tail + posNote + opps;
          return '<b>Check</b> — no value, no fold equity. Save the bluff for a better spot.' + tail + posNote + opps;
        }
        return null;
      }
      var need2 = toCall / (pot + toCall);
      if ((str >= 0.62 || eq2 >= 0.65) && legal.canRaise)
        return '<b>Raise for value</b> (~3× their bet). Don\'t slow-play monsters — charge the draws and worse hands now.' + tail + posNote + opps;
      if ((d.flushDraw || d.oesd) && legal.canRaise && foldy > 0.4)
        return '<b>Semi-bluff raise</b> sometimes: fold equity plus ~' + pct(eq2) + ' to hit. Otherwise call ' +
          fmt(toCall) + ' needing ' + pct(need2) + '.' + tail + posNote + opps;
      var vAggro = V && villainBluffy(V && V.archetype) > 0.4;
      var verdict = eq2 > need2 + 0.03 ? 'The math says call.'
        : (vAggro && eq2 > need2 - 0.12) ? 'Close — but ' + vName + ' bluffs a lot, so lean <b>call</b>.'
        : 'Math says fold.';
      return 'Need <b>' + pct(need2) + '</b>, you have ~<b>' + pct(eq2) + '</b>. ' + verdict + tail + posNote + opps;
    } catch (err) { return null; }
  }

  // ================= game setup =================
  function startGame() {
    cfg.stack = Math.max(200, parseInt($('cfg-stack').value, 10) || 1000);
    cfg.sb = Math.max(1, parseInt($('cfg-sb').value, 10) || 5);
    cfg.bb = Math.max(cfg.sb + 1, parseInt($('cfg-bb').value, 10) || 10);
    cfg.botRebuys = $('cfg-botrebuys') ? $('cfg-botrebuys').checked : true;
    cfg.roundBets = $('cfg-roundbets') ? $('cfg-roundbets').checked : false;
    cfg.blindInterval = Math.max(2, parseInt(($('cfg-blindint') || {}).value, 10) || 8);
    cfg.tourneyRebuys = $('cfg-tourneyrebuys') ? $('cfg-tourneyrebuys').checked : false;

    if (mode === 'pushfold') { startPushFold(); return; }

    var bots = allBots().filter(function (b) { return selectedBots.has(b.id); }).slice(0, maxOpp());
    if (!bots.length) bots = [botById('lag')]; // safety net; the UI enforces >= 1

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

    sessionStartChips = table.players[0].stack;
    lastHeroEndStack = undefined; // new session: hand 1 falls back to sessionStartChips
    refreshBankroll();
    evtQueue = []; pumping = false; waitingForHero = false;
    UI.buildSeats(); // fixed 8-seat layout; renderTable marks empties
    UI.showScreen('table');
    // Clear the previous session's "Last:" result — it would otherwise linger
    // in the topbar until the first new hand ends (daily QA 2026-10-07).
    try { var lr = document.getElementById('last-result'); if (lr) lr.textContent = ''; } catch (e) {}
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

  window.__openReplay = openReplay;
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
    var brandBtn = $('brand-home');
    if (brandBtn) brandBtn.onclick = function () { UI.showScreen('setup'); };
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
    // Feedback opens a modal, not a screen.
    var nfb = $('nav-feedback');
    if (nfb) nfb.onclick = function () { UI.openFeedbackModal(); };
    var fmc = $('feedback-modal-close');
    if (fmc) fmc.onclick = UI.closeFeedbackModal;
    var fmo = $('feedback-modal');
    if (fmo) fmo.addEventListener('click', function (e) { if (e.target === fmo) UI.closeFeedbackModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var m = $('feedback-modal');
        if (m && !m.hidden) UI.closeFeedbackModal();
      }
    });
    // Feature flags: hide custom bot builder by default.
    var cbs = document.getElementById('custom-bot-section');
    if (cbs && !PS_FLAGS.customBots) cbs.style.display = 'none';

    var fsb = $('fb-submit');
    if (fsb) fsb.onclick = UI.submitFeedback;
    // Feature flags: hide advanced mode cards by default.
    var flagForMode = { hu: 'headsUpMode', tourney: 'tournamentMode', pushfold: 'pushFoldTrainer' };
    document.querySelectorAll('.mode-card').forEach(function (c) {
      var flag = flagForMode[c.dataset.mode];
      if (flag && !PS_FLAGS[flag]) { c.style.display = 'none'; return; }
      c.onclick = function () {
        document.querySelectorAll('.mode-card').forEach(function (x) { x.classList.remove('selected'); });
        c.classList.add('selected');
        var prev = mode;
        mode = c.dataset.mode;
        if (mode === 'hu' && prev !== 'hu') {
          // Heads-up is exactly one bot: remember the full table, keep the
          // first pick (swimkev when the set is somehow empty).
          preHuSelection = Array.from(selectedBots);
          var first = rosterOrderIds().filter(function (id) { return selectedBots.has(id); })[0] || 'lag';
          selectedBots = new Set([first]);
        } else if (prev === 'hu' && mode !== 'hu' && preHuSelection) {
          // Restore the pre-heads-up table.
          selectedBots = new Set(preHuSelection.filter(function (id) { return botById(id); }).slice(0, 7));
          if (!selectedBots.size) selectedBots = new Set(['lag', 'rohan', 'amogh']);
          preHuSelection = null;
        }
        syncOppUI();
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
      var n = selectedBots.size;
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
    var bh = $('btn-hands');
    if (bh) bh.onclick = function () { UI.openHandsModal(loadHandRecords()); };
    var hmc = $('hands-modal-close');
    if (hmc) hmc.onclick = UI.closeHandsModal;
    var hmo = $('hands-modal');
    if (hmo) hmo.addEventListener('click', function (e) { if (e.target === hmo) UI.closeHandsModal(); });
    $('btn-pf-leave').onclick = leaveToLobby;

    // username + emoji: persisted, applied to the hero seat at game start
    var EMOJI_CHOICES = ['🧑','👩','👨','🧔','👵','👴','🐶','🐱','🦊','🐼','🦁','🐯','🦄','🐸','👻','🤖','👽','🎃','😎','🤠','🥷','🧙','🦸','👑','💀','🔥','⚡','🌊','🍀','🎲'];
    var emojiSel = $('cfg-emoji');
    if (emojiSel) {
      var curEm = '🧑';
      try { curEm = localStorage.getItem('ps_player_emoji') || '🧑'; } catch (e) {}
      EMOJI_CHOICES.forEach(function (em) {
        var o = document.createElement('option');
        o.value = em; o.textContent = em;
        if (em === curEm) o.selected = true;
        emojiSel.appendChild(o);
      });
      emojiSel.addEventListener('change', function () {
        try { localStorage.setItem('ps_player_emoji', emojiSel.value); } catch (e) {}
      });
    }
    var unameInput = $('cfg-username');
    if (unameInput) {
      unameInput.value = NamePrefs.getUsername();
      unameInput.addEventListener('change', function () {
        NamePrefs.setUsername(unameInput.value);
        unameInput.value = NamePrefs.getUsername(); // trimmed to max length
      });
    }

    // Opponent count display always derives from the selection — the number
    // and the highlighted cards can never disagree.
    function syncOppUI() {
      $('opp-count').textContent = selectedBots.size;
      UI.renderRoster(allBots(), selectedBots, maxOpp(), rosterHint, onRosterChange);
      syncQuickHint();
      saveRoster();
    }
    // Roster card clicks mutate the set inside UI; this keeps the count,
    // hint, and persisted selection in sync.
    function onRosterChange() {
      $('opp-count').textContent = selectedBots.size;
      syncQuickHint();
      saveRoster();
    }
    // Select a bot, enforcing the cap by swapping out the last-picked bot.
    // Used when a newly created custom bot should join the table immediately.
    function selectBot(id) {
      if (selectedBots.has(id)) return;
      if (selectedBots.size >= maxOpp()) {
        var ids = rosterOrderIds().filter(function (x) { return selectedBots.has(x); });
        selectedBots.delete(ids[ids.length - 1]);
      }
      selectedBots.add(id);
    }
    $('opp-minus').onclick = function () {
      if (mode === 'hu') return;
      if (selectedBots.size <= 1) { rosterHint('Pick at least 1 opponent'); return; }
      // Drop the last-picked bot (last in roster order).
      var ids = rosterOrderIds().filter(function (id) { return selectedBots.has(id); });
      selectedBots.delete(ids[ids.length - 1]);
      syncOppUI();
    };
    $('opp-plus').onclick = function () {
      if (mode === 'hu') return;
      if (selectedBots.size >= maxOpp()) { rosterHint('Only ' + maxOpp() + ' opponents for this mode'); return; }
      // Add the first unpicked bot in roster order.
      var id = rosterOrderIds().filter(function (x) { return !selectedBots.has(x); })[0];
      if (id) selectedBots.add(id);
      syncOppUI();
    };
    // push/fold buttons
    $('pf-shove').onclick = function () { pfAnswer(pf.scn.facingShove ? 'call' : 'shove'); };
    $('pf-fold').onclick = function () { pfAnswer('fold'); };
    $('pf-next').onclick = nextPFScenario;

    // custom bot builder
    [['cust-loose', 'v-loose'], ['cust-aggr', 'v-aggr'], ['cust-bluff', 'v-bluff'], ['cust-stub', 'v-stub'],
     ['cust-tilt', 'v-tilt'], ['cust-rebuy', 'v-rebuy']]
      .forEach(function (pair) {
        $(pair[0]).oninput = function () { $(pair[1]).textContent = $(pair[0]).value; };
      });
    $('btn-add-custom').onclick = function () {
      var name = $('cust-name').value.trim() || 'My Bot';
      // Reject duplicate display names — two "Doyle"s at one table is confusing.
      var low = name.toLowerCase();
      var taken = allBots().some(function (b) {
        var dn = (typeof UI !== 'undefined' && UI.dispName ? UI.dispName(b) : b.name) || '';
        return dn.trim().toLowerCase() === low;
      });
      if (taken) {
        var ne = $('cust-name');
        ne.classList.add('rename-dup');
        ne.setAttribute('aria-invalid', 'true');
        ne.title = 'That name is already taken — pick another';
        ne.focus();
        return;
      }
      var emoji = $('cust-emoji').value.trim() || '🤖';
      var a = customArchetype({
        name: name, emoji: emoji,
        desc: $('cust-desc').value.trim(),
        looseness: +$('cust-loose').value, aggression: +$('cust-aggr').value,
        bluff: +$('cust-bluff').value, stubborn: +$('cust-stub').value,
        tiltProne: +$('cust-tilt').value, rebuy: +$('cust-rebuy').value
      });
      var list = loadCustomBots();
      list.push(a);
      saveCustomBots(list);
      selectedBots.add(a.id);
      $('cust-name').value = ''; $('cust-desc').value = '';
      UI.renderArchetypes(list, deleteCustom);
      selectBot(a.id);
      syncOppUI();
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
      if (confirm('Reset all training stats?')) {
        clearStats();
        UI.renderStats();
        // The top-right session pill is a live session figure, not stored
        // stats: re-baseline it so it reads 0 immediately instead of going
        // stale until the next refresh.
        sessionStartChips = (table && table.players && table.players[0]) ? table.players[0].stack : 0;
        UI.setBankroll(0);
      }
    };

    UI.renderRoster(allBots(), selectedBots, maxOpp(), rosterHint);
    // Sync the counter on initial load — selectedBots may be restored from storage.
    var oc0 = document.getElementById('opp-count');
    if (oc0) oc0.textContent = selectedBots.size;
    // Stack/blind tweaks update the quick-start hint live.
    ['cfg-stack', 'cfg-sb', 'cfg-bb'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', syncQuickHint);
    });
    syncQuickHint();
    refreshBankroll();
    var vv = $('app-version');
    if (vv) vv.textContent = 'v' + APP_VERSION + ' · offline · stats stay in this browser';
    // Manual update check for live testing — fetches version.txt, reloads if newer.
    var cu = $('btn-check-update');
    if (cu) cu.onclick = function () {
      cu.textContent = 'Checking…';
      fetch('version.txt?v=' + Date.now()).then(function (r) { return r.text(); }).then(function (t) {
        var v = (t || '').trim();
        if (v && v !== APP_VERSION) {
          if (confirm('New version ' + v + ' available (you have ' + APP_VERSION + '). Reload now?')) {
            location.reload(true);
          }
        } else {
          cu.textContent = 'Up to date ✓';
          setTimeout(function () { cu.textContent = 'Check for updates'; }, 2000);
        }
      }).catch(function () {
        cu.textContent = 'Check failed';
        setTimeout(function () { cu.textContent = 'Check for updates'; }, 2000);
      });
    };
  }

  function deleteCustom(id) {
    saveCustomBots(loadCustomBots().filter(function (a) { return a.id !== id; }));
    selectedBots.delete(id);
    if (!selectedBots.size) selectedBots.add('lag'); // never drop to zero
    UI.renderArchetypes(loadCustomBots(), deleteCustom);
    UI.renderRoster(allBots(), selectedBots, maxOpp(), rosterHint, function () {
      var oc = document.getElementById('opp-count');
      if (oc) oc.textContent = selectedBots.size;
      saveRoster();
    });
    saveRoster();
  }

  document.addEventListener('DOMContentLoaded', wire);
})();
