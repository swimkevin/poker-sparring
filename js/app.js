// app.js — Game flow conductor: screens, event pump, hero controls, tournament,
// push/fold trainer, coach tips, and stats recording.

(function () {
  'use strict';

  /** App version — single source of truth, mirrored in package.json and CHANGELOG.md. */
  var APP_VERSION = '1.8.44';
  // Read-only copy for the footer "Check for updates" button (this file's scope is an IIFE).
  try { window.APP_VERSION = APP_VERSION; } catch (e) {}

  // Builds the URL to load after an update: we NAVIGATE instead of calling
  // location.reload(), because a reload keeps the stale ?v= query param in
  // the address bar (bug reported 2026-10-08). Pure function for testability.
  function updateReloadURL(pathname, v, hash) {
    return pathname + '?v=' + encodeURIComponent(v) + hash;
  }
  // Exposed for tests (tests/update-flow.test.js); the IIFE keeps the rest private.
  try { window.updateReloadURL = updateReloadURL; } catch (e) {}

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
  var coachDecisions = []; // hero decisions vs coach advice this hand (for the recap)
  var pendingAdvice = null; // coach verdict awaiting the hero's action
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
    coachDecisions = [];
    pendingAdvice = null;
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
      var vd = coachVerdict();
      UI.coachTip(vd.html);
      // Remember the advice so the hero's actual action can be graded for
      // the post-hand recap.
      pendingAdvice = vd.advice ? {
        advice: vd.advice, strength: vd.strength, lesson: vd.lesson, street: table.street
      } : null;
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
    if (p.isHero) {
      trackHeroAction(e);
      if (pendingAdvice) {
        coachDecisions.push({
          street: pendingAdvice.street, advice: pendingAdvice.advice,
          strength: pendingAdvice.strength, lesson: pendingAdvice.lesson,
          action: e.action, followed: adviceFollowed(pendingAdvice.advice, e.action)
        });
        pendingAdvice = null;
      }
    }
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
    // Post-hand coach recap (lives in the coach tab until the next hand).
    var recap = null;
    try { recap = coachRecap(e.handNo); } catch (err) {}
    UI.coachTip(recap ? recap.html : null);
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
      if (recap) handRec.coachNotes = recap.lines; // plain-text recap for history
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

    // Give the result room to breathe: a Next-hand button plus a 10s auto-deal
    // countdown, so the splash, board, and revealed hands can actually be read.
    // Skipped (fast-forward) hands stay instant.
    if (fastForward) {
      setTimeout(function () { if (table) prepareNextHand(); }, 600);
    } else {
      // Give the result room to breathe: a Next-hand button plus a 10s auto-deal
      // countdown, so the board and revealed hands stay readable.
      UI.showHandEndControls({
        autoMs: 10000,
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

  // ---------------- coach: range reading + situation classifiers ----------------
  // All DOM-free; they read table + handRec.timeline only. handRec may be
  // null in tests — every helper degrades to the archetype prior.

  // Preflop situation: 'open' | 'facing-open' | 'facing-3bet' | 'facing-4bet+'.
  // Counts re-raises from the timeline (blinds are recorded as sb/bb, so an
  // open is raise #1 and a re-raise is #2).
  function preflopSpot() {
    var legal = table.legalActions(0);
    if (legal.toCall === 0) return 'open';
    var raises = 0;
    if (handRec && handRec.timeline) handRec.timeline.forEach(function (t) {
      if (t.t === 'action' && t.street === 'preflop' &&
          (t.action === 'bet' || t.action === 'raise')) raises++;
    });
    if (raises <= 1) return 'facing-open';
    if (raises === 2) return 'facing-3bet';
    return 'facing-4bet+';
  }

  // How tight a villain is, from their opening range (1=rock .. 6=any two).
  function villainTighty(A) {
    A = A || {};
    var t = A.openTier || 3;
    return 1 - (t - 1) / 5;
  }

  // Effective stack in chips between hero and a villain (or the shortest live
  // opponent when villainIdx is null). SPR math uses this, not hero's stack.
  function effStackChips(villainIdx) {
    var eff = table.players[0].stack;
    table.players.forEach(function (p, i) {
      if (i === 0 || p.folded || p.sittingOut) return;
      if (villainIdx == null || i === villainIdx) eff = Math.min(eff, p.stack);
    });
    return eff;
  }
  function effStackBB(villainIdx) {
    return table.bb > 0 ? effStackChips(villainIdx) / table.bb : 99;
  }

  // Read a villain's range from this hand's actions + their archetype.
  // Returns {label, strength, words}. Labels are honest buckets, never fake
  // percentages: wide | capped | strong | polarized | unknown.
  function estimateVillainRange(idx) {
    var p = table.players[idx];
    var A = (p && p.archetype) || {};
    var label = 'unknown', strength = 0.5, actions = 0;
    var neverRaises = (A.id === 'nathan' || A.id === 'rohan');
    if (handRec && handRec.timeline) handRec.timeline.forEach(function (t) {
      if (t.t !== 'action' || t.player !== idx) return;
      actions++;
      var size = t.bet || t.amount || 0, pot = t.pot || 1;
      var ratio = size / pot;
      if (t.street === 'preflop') {
        if (t.action === 'raise' || t.action === 'bet') {
          label = 'strong'; strength = Math.max(strength, 0.75);
        } else if (t.action === 'call') {
          // Callers are capped: premiums would have re-raised.
          if (label !== 'strong') { label = 'capped'; strength = Math.min(strength, 0.45); }
        }
      } else if (t.action === 'bet' || t.action === 'raise') {
        if (neverRaises) { label = 'strong'; strength = 0.85; }
        else if (ratio > 1.0) { label = 'polarized'; strength = 0.7; }
        else if (ratio >= 0.7) { label = 'strong'; strength = Math.max(strength, 0.7); }
        else if (ratio <= 0.35) {
          if (label !== 'strong' && label !== 'polarized') { label = 'capped'; strength = Math.min(strength, 0.4); }
        } else if (label === 'unknown') label = 'wide';
      } else if (t.action === 'check' && label === 'strong') {
        label = 'capped'; strength = 0.45; // gave up the betting lead: weakness
      }
    });
    var words = {
      wide: 'playing a lot of hands',
      capped: 'capped — mostly medium hands, no big premiums',
      strong: 'showing real strength',
      polarized: 'polarized — the nuts or nothing',
      unknown: 'no read yet'
    }[label];
    return { label: label, strength: strength, actions: actions, words: words };
  }

  // The villain's last aggressive sizing this street. Preflop it's measured
  // in big blinds (a 3x open is standard); postflop as a true fraction of
  // the pot before the bet (reconstructed from the timeline).
  function villainSizingTell(idx) {
    var entries = [];
    if (handRec && handRec.timeline) handRec.timeline.forEach(function (t) {
      if (t.t === 'action' && t.player === idx && t.street === table.street) entries.push(t);
    });
    var li = -1;
    for (var i = entries.length - 1; i >= 0; i--) {
      if (entries[i].action === 'bet' || entries[i].action === 'raise') { li = i; break; }
    }
    if (li < 0) return null;
    var last = entries[li];
    var total = last.bet || last.amount || 0;
    if (table.street === 'preflop') {
      var bbMult = table.bb > 0 ? total / table.bb : 0;
      return {
        size: bbMult <= 2.5 ? 'small' : bbMult <= 3.5 ? 'medium' : bbMult <= 6 ? 'large' : 'overbet',
        ratio: bbMult, unit: 'bb'
      };
    }
    var betBefore = 0;
    for (var j = li - 1; j >= 0; j--) {
      if (typeof entries[j].bet === 'number') { betBefore = entries[j].bet; break; }
    }
    var added = total - betBefore, potBefore = (last.pot || 0) - added;
    if (!(added > 0) || !(potBefore > 0)) return null;
    var ratio = added / potBefore;
    return {
      size: ratio <= 0.4 ? 'small' : ratio <= 0.8 ? 'medium' : ratio <= 1.2 ? 'large' : 'overbet',
      ratio: ratio, unit: 'pot'
    };
  }

  // Blind-steal spot: folded to the hero preflop in a steal seat, blinds live.
  function isStealSpot() {
    if (table.street !== 'preflop') return null;
    var posName = heroPositionName();
    if (posName !== 'button' && posName !== 'cutoff' && posName !== 'small blind') return null;
    var acted = false;
    if (handRec && handRec.timeline) handRec.timeline.forEach(function (t) {
      if (t.t !== 'action' || t.street !== 'preflop' || t.player === 0) return;
      if (t.action === 'call' || t.action === 'raise' || t.action === 'bet') acted = true;
    });
    if (acted) return null;
    var targets = [];
    [table.sbIdx, table.bbIdx].forEach(function (i) {
      var pl = table.players[i];
      if (pl && !pl.isHero && !pl.folded && !pl.sittingOut) targets.push(pl);
    });
    if (!targets.length) return null;
    return { canSteal: true, pos: posName, targets: targets };
  }

  // Made-hand class for SPR commitment decisions, from the evaluator directly:
  // nut (straight+) | overpair (trips+, two pair, or a pair above the board) |
  // toppair | secondpair | draw-strong (combo) | draw | draw-weak | air.
  function handClass(hole, community) {
    var d = detectDraws(hole, community);
    if (d.flushDraw && d.oesd) return 'draw-strong';
    var ev = (hole.length + community.length >= 5) ? evaluate7(hole.concat(community)) : null;
    if (ev) {
      if (ev.cat >= 4) return 'nut';
      if (ev.cat === 3 || ev.cat === 2) return 'overpair';
      if (ev.cat === 1) {
        var pr = ev.kickers[0];
        var bmax = Math.max.apply(null, community.map(function (c) { return c.r; }));
        return pr > bmax ? 'overpair' : (pr === bmax ? 'toppair' : 'secondpair');
      }
    }
    if (d.flushDraw || d.oesd) return 'draw';
    if (d.gutshot) return 'draw-weak';
    return 'air';
  }

  // Plain-language name for a hand class (SPR/commitment messages).
  function handClassName(hc) {
    return { nut: 'the nuts', overpair: 'an overpair', toppair: 'top pair',
      secondpair: 'second pair', 'draw-strong': 'a monster draw', draw: 'a draw',
      'draw-weak': 'a weak draw', air: 'nothing' }[hc] || 'your hand';
  }

  // Bet AND a call ahead of the hero this street — a reliable strength tell.
  function betCallAhead() {
    var sawAggro = false, sawCall = false;
    if (handRec && handRec.timeline) handRec.timeline.forEach(function (t) {
      if (t.t !== 'action' || t.street !== table.street || t.player === 0) return;
      if (t.action === 'bet' || t.action === 'raise') sawAggro = true;
      else if (t.action === 'call' && sawAggro) sawCall = true;
    });
    return sawAggro && sawCall;
  }

  // Limpers ahead of the hero preflop (calls, no raises yet).
  function countLimpers() {
    var n = 0;
    if (handRec && handRec.timeline) handRec.timeline.forEach(function (t) {
      if (t.t === 'action' && t.street === 'preflop' && t.action === 'call') n++;
    });
    return n;
  }

  // True if the hero's flush draw is to the nuts (holds the ace of the suit).
  function isNutFlushDraw(hole, community) {
    var suits = [0, 0, 0, 0];
    hole.concat(community).forEach(function (c) { suits[c.s]++; });
    var ds = suits.indexOf(4);
    if (ds < 0) return false;
    return hole.some(function (c) { return c.s === ds && c.r === 14; });
  }

  function isSmallPair(hole) {
    return hole.length === 2 && hole[0].r === hole[1].r && hole[0].r <= 9;
  }

  // Board texture for value-bet sizing: wet boards need bigger, protective bets.
  function boardTexture(community) {
    if (community.length < 3) return 'dry';
    var suits = [0, 0, 0, 0];
    community.forEach(function (c) { suits[c.s]++; });
    if (suits.some(function (n) { return n >= 3; })) return 'wet';
    var rs = community.map(function (c) { return c.r; }).sort(function (a, b) { return a - b; });
    return (rs[rs.length - 1] - rs[0] <= 4) ? 'wet' : 'dry';
  }

  // Equity vs the villain's likely range (not random hands) — preflop only,
  // since estimateEquityVsRange deals fresh boards. maxTier bounds the range.
  function rangeAwareEquityPreflop(hole, maxTier) {
    return estimateEquityVsRange(hole, Math.min(6, Math.max(1, maxTier || 3)), 150);
  }

  // One verdict per hero decision: machine-readable advice (for post-hand
  // feedback) plus the HTML tip. advice in fold|check|call|bet|raise|null.
  function mkVerdict(advice, strength, msg, lesson) {
    return { advice: advice, strength: strength, msg: msg, lesson: lesson || '', html: null };
  }

  // Entry point: builds the verdict, then composes the full tip HTML in the
  // long-standing shape (message + villain read + position + opponent reads).
  function coachVerdict() {
    var hero = table.players[0];
    var legal = table.legalActions(0);
    try {
      var V = pickVillain();
      var vIdx = V ? table.players.indexOf(V) : -1;
      var esc = UI.escapeHtml;
      var vName = V ? esc(V.name) : 'they';
      var posName = heroPositionName();
      var nm = hero.hole.slice().sort(function (a, b) { return b.r - a.r; })
        .map(function (c) { return rankName(c.r); }).join(' ');
      var ctx = {
        hero: hero, legal: legal, toCall: legal.toCall, pot: table.potTotal(),
        V: V, vIdx: vIdx, vName: vName, posName: posName,
        tier: holeTier(hero.hole),
        nmHtml: '<b>' + esc(nm) + '</b>', esc: esc, fmt: UI.fmt
      };
      var v = (table.street === 'preflop') ? coachPreflop(ctx) : coachPostflop(ctx);
      var tail = villainLine(V);
      var posNote = ' <span class="coach-pos">📍 You\'re on the ' + esc(posName) + '.</span>';
      v.html = v.msg ? v.msg + tail + posNote + opponentReads() : null;
      return v;
    } catch (err) { return { advice: null, strength: 'marginal', msg: '', lesson: '', html: null }; }
  }

  function coachTip() {
    return coachVerdict().html;
  }
  // Test/eval hooks (not used by the UI).
  try {
    window.coachVerdict = coachVerdict;
    window.coachState = function () {
      var l = table.legalActions(0);
      return { toCall: l.toCall, canBet: !!l.canBet, canRaise: !!l.canRaise,
               street: table.street, pot: table.potTotal(),
               stack: table.players[0].stack };
    };
    window.__coachTestHooks = {
      recap: coachRecap,
      setDecisions: function (ds) { coachDecisions = ds; },
      adviceFollowed: adviceFollowed,
      estimateVillainRange: estimateVillainRange,
      preflopSpot: preflopSpot
    };
  } catch (e) {}

  // Did the hero's action match the coach's advice? bet/raise are interchangeable.
  function adviceFollowed(advice, action) {
    switch (advice) {
      case 'fold': return action === 'fold';
      case 'check': return action === 'check';
      case 'call': return action === 'call';
      case 'bet': return action === 'bet' || action === 'raise';
      case 'raise': return action === 'raise' || action === 'bet';
      default: return true;
    }
  }

  // Post-hand recap: at most one line of praise + one leak to fix, drawn
  // from this hand's strong (non-marginal) decisions vs the coach's advice.
  // Shown in the coach tab after the hand; plain-text lines are also stored
  // on the hand record for history.
  function coachRecap(handNo) {
    var good = null, bad = null;
    coachDecisions.forEach(function (d) {
      if (d.strength !== 'strong' || !d.lesson) return;
      if (d.followed && !good) good = d;
      else if (!d.followed && !bad) bad = d;
    });
    if (!good && !bad) return null;
    var lines = [];
    if (good) lines.push({ kind: 'good', text: 'Well played — ' + good.lesson });
    if (bad) lines.push({ kind: 'bad', text: 'Leak to fix: coach said ' + bad.advice +
      ', you went ' + bad.action + '. ' + bad.lesson });
    var h = '<div class="coach-recap-title">Hand #' + UI.escapeHtml(String(handNo)) + ' recap</div>';
    lines.forEach(function (l) {
      h += '<div class="coach-recap-' + l.kind + '">' +
        (l.kind === 'good' ? '✅ ' : '📌 ') + UI.escapeHtml(l.text) + '</div>';
    });
    return { html: h, lines: lines.map(function (l) { return (l.kind === 'good' ? '+ ' : '- ') + l.text; }) };
  }

  function coachPreflop(c) {
    var esc = c.esc, fmt = c.fmt;
    var hero = c.hero, legal = c.legal, toCall = c.toCall, pot = c.pot;
    var V = c.V, vIdx = c.vIdx, vName = c.vName, tier = c.tier;
    var spot = preflopSpot();
    var inPos = positionScore(table, 0) > 0.6;

    // ---- first to act (usually the big blind option): raise premiums,
    // otherwise take the free card.
    if (spot === 'open') {
      if (tier <= 2)
        return mkVerdict('raise', 'strong',
          c.nmHtml + ' — a premium and no one raised. <b>Raise</b> 2.5–3× the blind and build a pot while you\'re ahead.',
          'Raise premiums first-in: checking lets worse hands see free cards.');
      return mkVerdict('check', 'marginal',
        '<b>Check</b> and take the free flop' +
        (tier <= 4 ? ' — ' + c.nmHtml + ' is playable but not worth inflating the pot' : '') + '.',
        '');
    }

    // ---- folded to the hero in a steal seat
    var steal = isStealSpot();
    if (steal) {
      var folders = steal.targets.filter(function (p) { return villainFoldy(p.archetype) > 0.5; });
      if (tier <= 2)
        return mkVerdict('raise', 'strong',
          c.nmHtml + ' on the ' + steal.pos + ' — <b>raise 2.5×</b> for value. Best hand, best seat.',
          'Late position plus a premium: raise every time.');
      if (tier <= 4)
        return mkVerdict('raise', 'strong',
          'Folded to you on the ' + steal.pos + '. <b>Raise 2.5×</b> — a clean steal spot' +
          (folders.length ? '; ' + esc(folders[0].name) + ' folds too much' : '') + '.',
          'Steal blinds when it folds to you late: uncontested pots are pure profit.');
      if (tier === 5 && folders.length === steal.targets.length)
        return mkVerdict('raise', 'marginal',
          'Both blinds fold too much — <b>raise 2.5×</b> as a steal, but give it up if they fight back.',
          'Steals work because folds are instant profit — don\'t marry the hand.');
      return mkVerdict('fold', 'strong',
        '<b>Fold</b> — ' + c.nmHtml + ' isn\'t worth playing, even on the ' + steal.pos + '. Discipline is the edge.',
        'Folding trash on the button feels wrong, but bad hands lose money from every seat.');
    }

    // ---- facing a 3-bet: 4-bet premiums, fold the marginal middle
    if (spot === 'facing-3bet') {
      var effBB3 = effStackBB(vIdx);
      if (tier === 1) {
        if (legal.canRaise) {
          var fourTo = Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round(table.currentBet * 2.3)));
          return mkVerdict('raise', 'strong',
            'That\'s a <b>3-bet</b> in front of you. With ' + c.nmHtml + ', <b>4-bet</b> to ~<b>' + fmt(fourTo) + '</b> — build the pot while you\'re likely ahead.',
            'Facing a 3-bet with a premium: 4-bet for value, about 2.3× their raise.');
        }
        return mkVerdict('call', 'strong',
          'They shoved. With ' + c.nmHtml + ', <b>call</b> — you\'re ahead of a 3-bet shoving range far too often to fold a premium.',
          'Never fold QQ+ to a single shove: their range holds plenty of worse hands.');
      }
      if (tier === 2)
        return mkVerdict(inPos && effBB3 >= 40 ? 'call' : 'fold', inPos && effBB3 >= 40 ? 'marginal' : 'strong',
          inPos && effBB3 >= 40
            ? '<b>Call</b> in position — ' + c.nmHtml + ' flops well and you\'re deep. Fold to more heat.'
            : '<b>Fold</b> — ' + c.nmHtml + ' doesn\'t play well against a 3-bet range' + (inPos ? '' : ' out of position') + '.',
          'Medium pairs and broadways shrink fast against 3-bets — call only deep and in position.');
      if (isSmallPair(hero.hole)) {
        if (toCall * 15 <= effStackChips(vIdx))
          return mkVerdict('call', 'marginal',
            '<b>Call</b> to set-mine — stacks are deep enough that one set pays for all the misses.',
            'You can call 3-bets with small pairs only when ~15× the call sits behind.');
        return mkVerdict('fold', 'strong',
          '<b>Fold</b> — too shallow to set-mine a 3-bet. The implied odds aren\'t there.',
          'Folding small pairs to 3-bets when shallow is disciplined, not weak.');
      }
      if (tier <= 4 && inPos && effBB3 >= 30)
        return mkVerdict('call', 'marginal',
          '<b>Call</b> in position — your hand flops well and you\'re deep. Re-evaluate on the flop.',
          'Calling 3-bets in position with playable hands is fine when deep.');
      return mkVerdict('fold', 'strong',
        '<b>Fold</b> — ' + c.nmHtml + ' plays terribly against a 3-bet range. TAG poker folds these.',
        'Fold hands like AJo and KQo to 3-bets: when called, you\'re usually dominated.');
    }

    // ---- facing a 4-bet or worse: only the nuts continue
    if (spot === 'facing-4bet+') {
      if (tier === 1)
        return mkVerdict(legal.canRaise ? 'raise' : 'call', 'strong',
          legal.canRaise
            ? 'They 4-bet. With ' + c.nmHtml + ' you\'re committed — <b>shove</b> or call it off.'
            : 'They shoved. With ' + c.nmHtml + ', <b>call</b> — folding a premium to one shove burns money.',
          'Against a 4-bet only the very best hands continue — everything else folds.');
      return mkVerdict('fold', 'strong',
        '<b>Fold</b> — 4-bets at these stakes are almost always the nuts.',
        'Respect 4-bets: players don\'t bluff them often enough to call light.');
    }

    // ---- limpers ahead, no raise yet
    if (countLimpers() > 0) {
      if (tier <= 2)
        return mkVerdict('raise', 'strong',
          c.nmHtml + ' — limpers are weak. <b>Raise 4×</b> to isolate one of them and play for stacks.',
          'Isolate limpers with premiums: raise big, play heads-up, stack them.');
      if (tier <= 3 && inPos)
        return mkVerdict('raise', 'marginal',
          '<b>Raise 4×</b> to isolate — limpers rarely have much, and you have position.',
          'Attack limpers from late position; they fold or play bloated pots out of position.');
      if (tier === 4 && inPos && effStackBB(vIdx) >= 20)
        return mkVerdict('call', 'marginal',
          '<b>Call</b> behind — speculative hand, deep stacks, great implied odds if you crack a limper.',
          'Calling behind with speculative hands in position is fine when stacks are deep.');
      return mkVerdict('fold', 'strong',
        '<b>Fold</b> — don\'t limp behind with ' + c.nmHtml + '. Wait for a real hand.',
        'Limping behind with weak hands is a slow leak — fold and stay disciplined.');
    }

    // ---- facing a single open: 3-bet premiums, otherwise the call/fold math
    var open = table.currentBet;
    var need = toCall / (pot + toCall);
    var multiway = isMultiway();
    var suited = isSuited(hero.hole);

    // Value 3-bet with position-aware sizing: 3x in position, 4x out of position.
    if (tier <= 2 && legal.canRaise) {
      var mult = inPos ? 3 : 4;
      var three = Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round(open * mult)));
      return mkVerdict('raise', 'strong',
        '<b>3-bet</b> ' + c.nmHtml + ' to ~<b>' + fmt(three) + '</b> (' + mult + '× their open' +
        (inPos ? ') — you have position' : ') — out of position, size up to charge them') +
        '. You\'re usually ahead, so build the pot now.',
        '3-bet premiums for value: 3× in position, 4× out of position.');
    }

    // Small pairs: set-mine only with ~15:1 implied odds behind.
    if (isSmallPair(hero.hole)) {
      if (toCall * 15 <= effStackChips(vIdx) && effStackBB(vIdx) >= 12)
        return mkVerdict('call', 'marginal',
          'Call <b>' + fmt(toCall) + '</b> to set-mine — ' + Math.round(effStackBB(vIdx)) + 'bb deep is plenty to get paid when you hit.',
          'Set-mining needs about 15× the call behind: you miss the set most flops.');
      return mkVerdict('fold', 'strong',
        '<b>Fold</b> the small pair — only ' + Math.round(effStackBB(vIdx)) + 'bb deep, not enough behind to get paid on the rare set.',
        'Don\'t set-mine short-stacked: the math only works with deep money behind.');
    }

    // Bluff 3-bet: suited-ace blocker vs a folder, heads-up only.
    var hasAce = hero.hole.some(function (x) { return x.r === 14; });
    if (tier >= 4 && hasAce && suited && legal.canRaise && V &&
        villainFoldy(V.archetype) > 0.5 && !multiway)
      return mkVerdict('raise', 'marginal',
        'Mix in a <b>bluff 3-bet</b> sometimes: your ace makes aces and ace-king less likely for them, and ' + vName + ' folds too much.',
        'Bluff 3-bets need a blocker plus a folder — never into multiple players.');

    // Equity vs the opener's actual range (not random hands), then adjust
    // for implied odds, reverse implied odds, and player type.
    var vOpenTier = (V && V.archetype && V.archetype.openTier) || 3;
    var eq = rangeAwareEquityPreflop(hero.hole, vOpenTier);
    var effBB = effStackBB(vIdx);
    var stubborn = V && V.archetype ? (V.archetype.stubborn || 0.5) : 0.5;
    var credit = impliedCredit({
      draw: suited && tier <= 4, smallPair: false, effStackBB: effBB,
      villainStubborn: stubborn, inPosition: inPos
    });
    var tight = V ? villainTighty(V.archetype) : 0.4;
    var debit = (tier === 3 && !suited && tight > 0.6) ? 0.05 : 0; // dominated broadways
    var adjEq = eq + credit - debit;
    var threshold = need + (multiway ? 0.04 : 0) -
      ((V && villainBluffy(V.archetype) > 0.55) ? 0.05 : 0);

    var handDesc = c.nmHtml + (suited ? ' suited' : '');
    var mathLine = 'Call <b>' + fmt(toCall) + '</b> to win <b>' + fmt(pot + toCall) + '</b> — you need <b>' +
      pct(need) + '</b> equity' + (credit > 0 ? ' (plus implied odds)' : '') + '. ' +
      handDesc + ' has ~<b>' + pct(adjEq) + '</b> vs ' + vName + '\'s range. ';
    if (adjEq > threshold + 0.03)
      return mkVerdict('call', 'strong', mathLine + 'The math says <b>call</b>.',
        'Call when your equity beats the price — the single most important poker math skill.');
    if (adjEq > threshold - 0.05)
      return mkVerdict(inPos ? 'call' : 'fold', 'marginal',
        mathLine + (inPos ? 'Close — with position, lean <b>call</b>.' : 'Close — out of position, lean <b>fold</b>.'),
        'Marginal spots are position-dependent: position makes close calls profitable.');
    var rioNote = debit > 0 ? ' Against a tight range your broadway is often dominated — that\'s reverse implied odds.' : '';
    return mkVerdict('fold', 'strong', mathLine + 'Math says <b>fold</b>.' + rioNote,
      'Folding when the price is wrong saves more money than hero-calling ever wins.');
  }

  function coachPostflop(c) {
    var esc = c.esc, fmt = c.fmt;
    var hero = c.hero, legal = c.legal, toCall = c.toCall, pot = c.pot;
    var V = c.V, vIdx = c.vIdx, vName = c.vName;
    var hc = handClass(hero.hole, table.community);
    var d = detectDraws(hero.hole, table.community);
    var pos = positionScore(table, 0);
    var inPos = pos > 0.6;
    var multiway = isMultiway();
    var effChips = effStackChips(vIdx);
    var sprV = spr(effChips, pot);
    var commit = sprVerdict(sprV, hc);
    var foldy = V ? villainFoldy(V.archetype) : 0.5;
    var canBet = legal.canBet || legal.canRaise;
    var range = V ? estimateVillainRange(vIdx)
      : { label: 'unknown', strength: 0.5, words: 'no read yet', actions: 0 };
    var rangeNote = (V && range.label !== 'unknown')
      ? ' ' + vName + '\'s range looks ' + range.words + '.' : '';
    var anyDraw = (hc === 'draw-strong' || hc === 'draw' || hc === 'draw-weak');

    // ---------------- no bet to face ----------------
    if (toCall === 0) {
      var vManiac = V && villainBluffy(V.archetype) > 0.6;
      // Strong made hands: bet for value — but trap maniacs.
      if ((hc === 'nut' || hc === 'overpair' || hc === 'toppair') && canBet) {
        if (vManiac)
          return mkVerdict('check', 'marginal',
            '<b>Check</b> your monster — ' + vName + ' bluffs constantly. Let them bet into you, then raise.' + rangeNote,
            'Against maniacs, trap strong hands: they build the pot for you.');
        var tex = boardTexture(table.community);
        var frac = (tex === 'wet' || foldy < 0.25) ? 0.75 : 0.5;
        var betSize = Math.max(1, Math.round(pot * frac));
        var sprLine = (commit === 'commit')
          ? ' The pot\'s already big next to the stacks (SPR ~' + sprV.toFixed(1) + ') — you\'re committed, so get the money in.'
          : '';
        return mkVerdict('bet', 'strong',
          '<b>Bet for value</b> ~' + (frac === 0.75 ? '¾' : '½') + ' pot (' + fmt(betSize) + ')' +
          (tex === 'wet' ? ' — draws everywhere, charge them' : '') + '.' + sprLine + rangeNote,
          'Bet strong hands for value; size up on draw-heavy boards to charge draws.');
      }
      // Draws: semi-bluff the strong ones, check weak ones and vs stations.
      if (anyDraw && canBet) {
        if (foldy < 0.25)
          return mkVerdict('check', 'strong',
            'Nice draw, but ' + vName + ' never folds. <b>Check</b> and take the free card.' + rangeNote,
            'Never semi-bluff a calling station — with no fold equity, take the free card.');
        if (hc === 'draw-weak')
          return mkVerdict('check', 'marginal',
            'Just a gutshot — <b>check</b>. One way to win isn\'t enough to bet on.',
            '');
        var halfBet = Math.max(1, Math.round(pot / 2));
        return mkVerdict('bet', hc === 'draw-strong' ? 'strong' : 'marginal',
          '<b>Semi-bluff</b> ~½ pot (' + fmt(halfBet) + ') — two ways to win: they fold now, or you hit. Needs only <b>' +
          pct(bluffBE(halfBet, pot)) + '</b> folds to break even.' + rangeNote,
          'Semi-bluff strong draws: fold equity plus real equity is a profitable combo.');
      }
      // Second pair: thin value/protection — not a bluff, it has real
      // showdown value. Bet heads-up with a reason; otherwise pot control.
      if (hc === 'secondpair' && canBet) {
        var scare2 = scareCardRank();
        if (!multiway && (inPos || scare2 || foldy > 0.5)) {
          var b3 = Math.max(1, Math.round(pot / 2));
          return mkVerdict('bet', 'marginal',
            '<b>Bet</b> ~½ pot (' + fmt(b3) + ') — ' + handClassName(hc) +
            ' is usually best here. Worse pairs call, draws pay to chase, and you charge overcards.' + rangeNote,
            'Bet second pair for thin value and protection — but keep the pot small.');
        }
        return mkVerdict('check', 'marginal',
          '<b>Check</b> — ' + handClassName(hc) + ' has showdown value. Take the pot-control line' +
          (multiway ? ', especially multiway.' : '.') + rangeNote,
          'Second pair often wins unimproved — no need to inflate the pot to find out.');
      }
      // Air: bluff only with a real story behind it.
      if (canBet) {
        var scare = scareCardRank();
        var spot = (inPos ? 1 : 0) + (scare ? 1 : 0) + (foldy > 0.55 ? 1 : 0) -
          (foldy < 0.3 ? 2 : 0) - (multiway ? 2 : 0);
        if (spot >= 2 && foldy >= 0.4 && !multiway) {
          var why = [];
          if (scare) why.push('the ' + esc(scare) + ' is a scare card');
          if (inPos) why.push('you have position');
          if (foldy > 0.55) why.push(vName + ' overfolds');
          var b2 = Math.max(1, Math.round(pot / 2));
          return mkVerdict('bet', 'marginal',
            '<b>Bluff</b> ~½ pot (' + fmt(b2) + ') — needs <b>' + pct(bluffBE(b2, pot)) + '</b> folds (' + why.join(', ') +
            ').' + rangeNote,
            'Bluff with a story — position, a scare card, or a folder — never just because. Mix bluffs in, or your value bets never get paid.');
        }
        return mkVerdict('check', multiway ? 'strong' : 'marginal',
          '<b>Check</b> — ' + (multiway ? 'too many players to bluff through.' : 'no value, no fold equity.') +
          ' Save it for a better spot.' + rangeNote,
          multiway ? 'Multiway pots kill bluffs: everyone has to fold, and someone usually won\'t.' : '');
      }
      return mkVerdict(null, 'marginal', '', '');
    }

    // ---------------- facing a bet ----------------
    var need2 = toCall / (pot + toCall);
    var tell = V ? villainSizingTell(vIdx) : null;

    // Range-based threshold shifts: strong/tight ranges demand more equity,
    // wide or bluffy ones demand less.
    var tight = V ? villainTighty(V.archetype) : 0.4;
    var bluffy = V ? villainBluffy(V.archetype) : 0.3;
    var rangeAdjust = 0;
    if (range.label === 'strong' && tight > 0.6) rangeAdjust += 0.08;
    if (range.label === 'polarized') rangeAdjust += (tight > 0.6 ? 0.12 : -0.02);
    if (range.label === 'wide' || bluffy > 0.55) rangeAdjust -= 0.06;
    if (range.label === 'capped') rangeAdjust -= 0.03;
    if (multiway && betCallAhead()) rangeAdjust += 0.05;

    // Equity vs a strong/tight range runs lower than vs random hands.
    var eq2 = estimateEquity(hero.hole, table.community, Math.min(3, table.livePlayers().length - 1), 150);
    if (range.label === 'strong' || (range.label === 'polarized' && tight > 0.6)) eq2 *= 0.75;

    var effBB = effStackBB(vIdx);
    var stubborn = V && V.archetype ? (V.archetype.stubborn || 0.5) : 0.5;
    var credit = impliedCredit({ draw: anyDraw, smallPair: false, effStackBB: effBB,
      villainStubborn: stubborn, inPosition: inPos });
    var debit = rioPenalty({ nutDraw: isNutFlushDraw(hero.hole, table.community) || !anyDraw,
      villainTight: tight, multiway: multiway });
    var adjEq = Math.max(0, Math.min(1, eq2 + credit - debit));

    // SPR commitment: big pot, small stacks, strong hand — no folding.
    if (commit === 'commit' && (hc === 'nut' || hc === 'overpair' || hc === 'toppair') && toCall < effChips)
      return mkVerdict('call', 'strong',
        'SPR is only ~' + sprV.toFixed(1) + ' — the pot\'s huge next to what\'s left. With ' + handClassName(hc) +
        ' you\'re <b>committed: call</b>.' + rangeNote,
        'Low SPR means commitment: once the pot is big relative to stacks, strong hands don\'t fold.');

    // Sizing tells: tiny bets invite raises, overbets from nits mean the nuts.
    if (tell && tell.unit === 'pot') {
      if (tell.size === 'small' && legal.canRaise && !multiway &&
          (hc === 'nut' || hc === 'overpair' || hc === 'toppair' || anyDraw))
        return mkVerdict('raise', 'marginal',
          'That\'s a tiny bet — usually a marginal hand begging for a cheap showdown. <b>Raise</b> and take it away.' + rangeNote,
          'Small bets often mean weakness: attack them.');
      if (tell.size === 'overbet' && tight > 0.6 && hc !== 'nut')
        return mkVerdict('fold', 'strong',
          '<b>Fold</b> — an overbet from a tight player is almost always the nuts. Don\'t pay it off.' + rangeNote,
          'Respect overbets from tight players: it\'s the nuts far more often than a bluff.');
    }

    // Raise monsters for value; semi-bluff-raise strong draws.
    if (hc === 'nut' && legal.canRaise)
      return mkVerdict('raise', 'strong',
        '<b>Raise for value</b> (~3× their bet) — charge the draws and worse hands now, don\'t slow-play.' + rangeNote,
        'With the near-nuts, raise: every street you don\'t build the pot costs money.');
    if ((hc === 'draw-strong' || hc === 'draw') && legal.canRaise && foldy > 0.4 && !multiway)
      return mkVerdict('raise', 'marginal',
        '<b>Semi-bluff raise</b> sometimes: fold equity plus ~' + pct(adjEq) + ' to hit. Otherwise call ' +
        fmt(toCall) + ', needing ' + pct(need2) + '.' + rangeNote,
        '');

    // The call/fold math, adjusted for range, implied odds, and player type.
    // (The range read is already named in the parenthetical, so rangeNote is
    // skipped here to avoid repeating it.)
    var threshold = need2 + rangeAdjust;
    var mathLine = 'You need <b>' + pct(need2) + '</b>' +
      (rangeAdjust > 0.005 ? ' (more — ' + vName + '\'s range is strong)'
        : rangeAdjust < -0.005 ? ' (less — ' + vName + ' is wide or bluffy)' : '') +
      ', you have ~<b>' + pct(adjEq) + '</b>' +
      (credit > 0 ? ' (counting implied odds)' : '') +
      (debit > 0 ? ' (docked for reverse implied odds)' : '') + '. ';
    if (adjEq > threshold + 0.03)
      return mkVerdict('call', 'strong', mathLine + 'The math says <b>call</b>.',
        'Calling when your equity beats the price is how winning poker works.');
    if ((bluffy > 0.5 || range.label === 'wide') && adjEq > threshold - 0.10)
      return mkVerdict('call', 'marginal',
        mathLine + 'Close — but ' + vName + ' bluffs a lot, so lean <b>call</b>.',
        'Against heavy bluffers, call lighter: their range holds more air than usual.');
    if (debit > 0 && adjEq <= threshold)
      return mkVerdict('fold', 'strong',
        mathLine + 'Math says <b>fold</b> — and even hitting might not win (reverse implied odds).',
        'Non-nut draws against tight ranges are trap hands: hitting can still lose.');
    return mkVerdict('fold', adjEq > threshold - 0.06 ? 'marginal' : 'strong',
      mathLine + 'Math says <b>fold</b>.',
      'Folding when the price is wrong is a skill — most money is saved, not won.');
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
            // Navigate instead of reloading in place: a plain reload keeps the
            // stale ?v= query param in the address bar, so the URL still
            // shows the old version after the refresh (bug reported 2026-10-08).
            // Navigating with the new version also guarantees a fresh
            // index.html, since the changed URL bypasses the HTTP cache.
            window.location.href = updateReloadURL(window.location.pathname, v, window.location.hash);
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
