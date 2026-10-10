// app.js — Game flow conductor: screens, event pump, hero controls, tournament,
// push/fold trainer, coach tips, and stats recording.

(function () {
  'use strict';

  /** App version — single source of truth, mirrored in package.json and CHANGELOG.md. */
  var APP_VERSION = '1.8.71';
  // Read-only copy for the footer "Check for updates" button (this file's scope is an IIFE).
  try { window.APP_VERSION = APP_VERSION; } catch {}

  // Builds the URL to load after an update: we NAVIGATE instead of calling
  // location.reload(), because a reload keeps the stale ?v= query param in
  // the address bar (bug reported 2026-10-08). Pure function for testability.
  function updateReloadURL(pathname, v, hash) {
    return pathname + '?v=' + encodeURIComponent(v) + hash;
  }
  // Exposed for tests (tests/update-flow.test.js); the IIFE keeps the rest private.
  try { window.updateReloadURL = updateReloadURL; } catch {}

  /**
   * Feature flags — Flappy Bird simplicity by default.
   * Advanced features are preserved in code but hidden until enabled.
   * Tournament mode is a core game type and always visible (not flagged).
   * Enable via console: PS_FLAGS.pushFoldTrainer = true (then refresh).
   * Or via URL: ?flags=headsUpMode,pushFoldTrainer
   */
  var DEFAULT_FLAGS = {
    headsUpMode: false,     // Heads-Up mode card
    pushFoldTrainer: false, // Push/Fold trainer mode card
    customBots: false       // Custom bot builder section
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
  } catch {}
  // Expose for console toggling with persistence
  window.PS_FLAGS = PS_FLAGS;
  window.enableFlag = function (name) {
    if (!(name in PS_FLAGS)) return 'Unknown flag: ' + name;
    PS_FLAGS[name] = true;
    try {
      var s = JSON.parse(localStorage.getItem('ps_feature_flags') || '{}');
      s[name] = true;
      localStorage.setItem('ps_feature_flags', JSON.stringify(s));
    } catch {}
    return name + ' enabled — refresh to see it.';
  };

  // Last-resort error boundary: a UI glitch must never take down the table or
  // lose the player's stats. Surfaces a calm notice instead of failing silently.
  window.addEventListener('error', function (ev) {
    try {
      if (typeof UI !== 'undefined' && UI.log && document.getElementById('hand-log')) {
        UI.log('⚠️ Something glitched, but the table is safe and your stats are saved.', 'hl-leak');
      }
    } catch { /* error handler must never throw */ }
  });

  function $(id) { return document.getElementById(id); }

  // ---------- custom bots ----------
  var CUSTOM_KEY = 'ps_custom_bots_v1';
  function loadCustomBots() {
    try {
      var raw = localStorage.getItem(CUSTOM_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  function saveCustomBots(list) {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch {}
  }
  function allBots() { return ARCHETYPES.concat(loadCustomBots()); }
  function botById(id) { return getArchetype(id, loadCustomBots()); }
  // Roster for the setup screen: filtered by game mode, Alice + custom bots
  // on top, then friends and mode-appropriate classics in array order.
  // Bots without a `modes` field (Alice, friends, customs) show everywhere.
  function rosterBots() {
    var customs = loadCustomBots();
    var listed = ARCHETYPES.filter(function (b) {
      return !b.modes || b.modes.indexOf(mode) !== -1;
    });
    var alice = listed.filter(function (b) { return b.id === 'alice'; });
    var rest = listed.filter(function (b) { return b.id !== 'alice'; });
    return alice.concat(customs, rest);
  }

  // ---------- setup state ----------
  var mode = 'cash';
  // Opponent selection: a Set of bot ids, the single source of truth.
  // Invariants: 1 <= size <= maxOpp() (1 for heads-up, 7 otherwise).
  // The stepper, mode cards, and roster cards all mutate this set; the count
  // display derives from it, so the number and the highlighted cards can
  // never disagree. Persisted across reloads (stale ids are dropped).
  function rosterKey() { return 'ps_roster_' + mode + '_v1'; }
  function loadRoster() {
    try {
      var raw = localStorage.getItem(rosterKey());
      if (!raw) return null;
      var ids = JSON.parse(raw).filter(function (id) { return botById(id); });
      return ids.length ? ids : null;
    } catch { return null; }
  }
  function saveRoster() {
    try { localStorage.setItem(rosterKey(), JSON.stringify(Array.from(selectedBots))); }
    catch {}
  }
  var selectedBots = new Set(loadRoster() || ['alice', 'swimkev', 'rohan', 'amogh', 'nathan', 'shark', 'station']);
  var preHuSelection = null; // full table remembered across a heads-up detour
  // Prune the selection to bots available in the current game mode.
  // Prevents stale tournament picks from blocking cash-game selection.
  function pruneSelection() {
    var available = rosterBots().map(function (b) { return b.id; });
    selectedBots = new Set(Array.from(selectedBots).filter(function (id) {
      return available.indexOf(id) !== -1;
    }));
    if (!selectedBots.size) selectedBots = new Set([available[0] || 'lag']);
  }
  // Repair: cash/tourney default to a full table of 7. Stale saves could
  // persist fewer (v1.8.71: Kevin's cash roster had 6). Top up from the
  // mode defaults; never remove a deliberate pick.
  function topUpRoster() {
    if (mode === 'hu') return;
    var defaults = mode === 'tourney'
      ? ['alice', 'swimkev', 'rohan', 'amogh', 'nathan', 'pro', 'nit']
      : ['alice', 'swimkev', 'rohan', 'amogh', 'nathan', 'shark', 'station'];
    var before = selectedBots.size;
    defaults.forEach(function (id) {
      if (selectedBots.size < 7 && botById(id)) selectedBots.add(id);
    });
    if (selectedBots.size !== before) saveRoster();
  }
  // Switch the selection when the mode changes — each mode remembers its own roster.
  function loadModeRoster() {
    var ids = loadRoster();
    if (ids) selectedBots = new Set(ids);
    else selectedBots = new Set(mode === 'tourney'
      ? ['alice', 'swimkev', 'rohan', 'amogh', 'nathan', 'pro', 'nit']
      : ['alice', 'swimkev', 'rohan', 'amogh', 'nathan', 'shark', 'station']);
    pruneSelection();
    topUpRoster();
  }
  pruneSelection(); // clean any stale picks from a previous mode
  topUpRoster(); // repair short rosters to a full table
  function maxOpp() { return mode === 'hu' ? 1 : 7; }
  function rosterOrderIds() { return rosterBots().map(function (b) { return b.id; }); }
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
  var botThinkTimer = null; // pending bot-action timeout, cancellable by Skip
  var pendingBot = null; // { player, idx } for the bot currently thinking
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
    } catch { UI.setBankroll(0); }
  }
  var tourney = null; // { levelIdx }
  var gameMode = 'cash';
  var cfg = { stack: 10000, sb: 50, bb: 100 };

  // Tournament blind structure: Level 1 uses the user's configured SB/BB,
  // later levels scale up (roughly doubling). Antes kick in from level 4.
  function tourLevels() {
    var sb0 = Math.max(1, cfg.sb || 5), bb0 = Math.max(2, cfg.bb || 10);
    // Pure doubling each level — simple, predictable, and creates good
    // practice pressure with 8-hand levels. Antes kick in from level 4
    // (standard in real tournaments).
    var levels = [];
    for (var i = 0; i < 10; i++) {
      var mult = Math.pow(2, i);
      var sb = sb0 * mult, bb = bb0 * mult;
      var ante = i >= 3 ? Math.round(bb / 8 / 5) * 5 : 0;
      levels.push({ sb: sb, bb: bb, ante: ante });
    }
    return levels;
  }
  var TOUR_LEVELS = null; // built per tournament from cfg

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
      if (botThinkTimer) clearTimeout(botThinkTimer);
      pendingBot = { player: p, idx: e.player };
      botThinkTimer = setTimeout(function () {
        botThinkTimer = null;
        var pb = pendingBot; pendingBot = null;
        var mv = botDecide(table, pb.player);
        pumping = false;
        if (mv) table.act(pb.idx, mv.a, mv.amount);
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
          action: e.action, followed: adviceFollowed(pendingAdvice.advice, e.action),
          // Hand strength at decision time — lets the recap recognize
          // semi-bluffs (big bet with a draw) vs pure bluffs.
          hc: (typeof handClass === 'function')
            ? handClass(table.players[0].hole, table.community) : null
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
    // Win info comes first so the recap can celebrate bluffs that worked.
    var won = heroWon(e);
    var wonByFold = e.winners.some(function (w) {
      if (!w.byFold) return false;
      var ids = (w.idx !== undefined) ? [w.idx] : (w.winners || []);
      return ids.indexOf(0) !== -1;
    });
    var recap = null;
    try { recap = coachRecap(e.handNo, won, wonByFold); } catch {}
    UI.coachTip(recap ? recap.html : null);
    setTurnStatus('', false); // drop any stale "Waiting for X…" during the results pause
    var hero = table.players[0];
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
        ' <span class="wsub"> ' + UI.escapeHtml(w.hand || '') + '</span>');
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
    } catch {}

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
    } catch {}

    // ---- bot thinking: post-hand learning notes ----
    // Pick the 1-2 most teachable bot actions and explain the range logic
    // behind them, so each hand trains reading real player types.
    try { botThinkingNotes(e); } catch {}

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
    // Persist the session so leaving the page doesn't lose the stacks.
    saveSession();

    // Give the result room to breathe: a Next-hand button, a pause button,
    // and a 13s auto-deal countdown, so the splash, board, and revealed hands
    // can actually be read. Skipped (fast-forward) hands stay instant.
    if (fastForward) {
      setTimeout(function () { if (table) prepareNextHand(); }, 600);
    } else {
      // Next-hand + pause buttons plus a 13s auto-deal countdown (v1.8.71:
      // was 10s; Kevin wanted longer + a pause for hand review).
      UI.showHandEndControls({
        autoMs: 13000,
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
      try { table.act(0, 'fold'); } catch { /* already unplayable; just fast-forward */ }
      waitingForHero = false;
      UI.disableControls();
      UI.coachTip(null);
    }
    // Results pause showing? Skip it immediately via the Next-hand button.
    var nx = document.getElementById('btn-next-hand');
    if (nx) { nx.click(); return; }
    fastForward = true;
    // If a bot is mid-think, cancel its delay and make it act immediately.
    if (botThinkTimer && pendingBot) {
      clearTimeout(botThinkTimer);
      botThinkTimer = null;
      var pb = pendingBot; pendingBot = null;
      try {
        var mv = botDecide(table, pb.player);
        pumping = false;
        if (mv) table.act(pb.idx, mv.a, mv.amount);
        else pump();
      } catch {
        pumping = false;
        pump();
      }
      return;
    }
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
            if (tourney && tourney.placements) tourney.placements.push(p.name);
            UI.log('💀 ' + UI.escapeHtml(p.name) + ' is eliminated!');
          }
        }
      });
      var hero = table.players[0];
      var alive = table.players.filter(function (p) { return !p.sittingOut && p.stack > 0; });
      if (hero.stack === 0) {
        var place = alive.length + 1;
        if (tourney && tourney.placements) tourney.placements.push(hero.name || 'You');
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
        var payoutHtml = tourneyPayoutHtml();
        UI.modal({
          title: '🏆 Champion!',
          body: 'You outlasted the whole table. Tournament winner!' + payoutHtml,
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

  // Tournament payout: top 3 split the prize pool (50/30/20).
  // placements[] = eliminated names in order; winner is the last one standing.
  function tourneyPayoutHtml() {
    if (!tourney || !tourney.placements) return '';
    var total = table.players.length;
    var pool = total * (cfg.stack || 1000);
    // Build final standings: winner first, then placements reversed (last out = 2nd)
    var standings = [];
    var alive = table.players.filter(function (p) { return !p.sittingOut && p.stack > 0; });
    if (alive.length === 1) standings.push(alive[0].name);
    for (var i = tourney.placements.length - 1; i >= 0; i--) {
      standings.push(tourney.placements[i]);
    }
    if (standings.length < 3) return '';
    var prizes = [0.5, 0.3, 0.2];
    var medals = ['🥇', '🥈', '🥉'];
    var html = '<div class="tourney-payout"><div class="payout-title">Prize pool: ' + UI.fmt(pool) + '</div>';
    for (var j = 0; j < 3 && j < standings.length; j++) {
      var nm = standings[j] === table.players[0].name ? 'You' : UI.escapeHtml(standings[j]);
      html += '<div>' + medals[j] + ' ' + ordinal(j + 1) + ': ' + nm + ' — ' + UI.fmt(Math.round(pool * prizes[j])) + '</div>';
    }
    return html + '</div>';
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
      // Unified decision tracking: if the coach advised this action, it's not
      // a leak — even if the tier heuristics would flag it. The coach, leak
      // tracker, and recap must agree.
      if (pendingAdvice && adviceFollowed(pendingAdvice.advice, a)) {
        return null;
      }
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
            'This hand only wins about 1 in 3 times against a raise. Calling once is no big deal, but doing it every time slowly drains your chips. Save your money for better hands.');
        }
        return null;
      }
      var eq = estimateEquity(hero.hole, table.community, Math.min(3, table.livePlayers().length - 1), 120);
      if (a === 'call' && legal.toCall > 0) {
        var need = legal.callAmount / (pot + legal.callAmount);
        if (eq < need - 0.12) {
          return base('bad-chase', 'Chasing without the odds',
            'Called ' + UI.fmt(legal.callAmount) + ' but only win about ' + Math.round(eq * 100) + ' out of 100 here',
            'You paid ' + UI.fmt(legal.callAmount) + ' but this hand only wins about ' + Math.round(eq * 100) + ' times out of 100. That\'s not often enough to make the call worth it. It\'s tempting to chase, but only call when you\'re likely enough to win.');
        }
      }
      if (a === 'check' && street === 'river' && madeStrength(hero.hole, table.community) > 0.88) {
        return base('missed-value', 'Missed value bet',
          'Checked the river with a monster (' + hole + ')',
          'You had one of the best possible hands but didn\'t bet! When you\'re almost sure to win, bet to make the pot bigger.');
      }
      if (a === 'fold' && legal.toCall > 0 && legal.toCall < pot * 0.35 && eq > 0.35) {
        return base('weak-fold', 'Folding too often',
          'Folded to a small bet of ' + UI.fmt(legal.toCall),
          'That was a tiny bet — you don\'t need a great hand to call it. If you always fold to small bets, other players will keep bluffing you.');
      }
    } catch { /* leak detection never breaks the game */ }
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
    // Compact scouting report, shown once per hand (first verdict). Short
    // style tags — the full exploit advice lives in the vs-line for the
    // villain that matters (v1.8.71: full sentences per opponent bloated
    // every first message to 600+ chars).
    var live = liveOpponents();
    if (!live.length) return '';
    var tags = {
      maniac: 'maniac', station: 'calling station', rock: 'rock',
      lag: 'loose-aggressive', shark: 'solid', nathan: 'trapper',
      amogh: 'straightforward', nit: 'nit', pro: 'pro', bully: 'bully',
      gambler: 'gambler', alice: 'vault', rohan: 'calling station',
      swimkev: 'loose-aggressive'
    };
    var reads = live.map(function (p) {
      var A = p.archetype, name = UI.escapeHtml(p.name);
      var tag = (A && tags[A.id]) || 'unknown style';
      return '<b>' + name + '</b> (' + tag + ')';
    });
    return '<div class="coach-opps">🎯 Table: ' + reads.join(' · ') + '</div>';
  }

  // Suitedness and multi-way are woven into the advice naturally, not as
  // separate badges (Kevin 2026-10-08). These helpers feed the reasoning.
  function isSuited(hole) {
    return hole.length === 2 && hole[0].s === hole[1].s;
  }
  function isMultiway() {
    return liveOpponents().length >= 3;
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
      case 'nit': return base + ' — they fold everything but the best hands. Respect their bets.';
      case 'pro': return base + ' — a strong tournament player. When they re-raise, they usually have it. Don\'t fight back without a good hand.';
      case 'lag': return base + ' — plays lots of hands aggressively. Could have anything; re-raise your strong hands.';
      case 'shark': return base + ' — strong tight-aggressive player, balanced between value and bluffs. Don\'t get fancy.';
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
      // t.pot includes the bet just made (engine emits post-action), so the
      // true sizing is bet vs the pot BEFORE it — same reconstruction as
      // villainSizingTell. Without this, a 1.5x overbet reads as 0.6 and
      // lands in the 'wide' gap (v1.8.71: Amogh's flop overbet advised a call).
      var ratio = size / Math.max(1, pot - size);
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
      capped: 'mostly medium hands, nothing huge',
      strong: 'showing real strength',
      polarized: 'either really strong or bluffing',
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
  // toppair | secondpair | weakpair | draw-strong (combo) | draw | draw-weak | air.
  function handClass(hole, community) {
    var d = detectDraws(hole, community);
    if (d.flushDraw && d.oesd) return 'draw-strong';
    var ev = (hole.length + community.length >= 5) ? evaluate7(hole.concat(community)) : null;
    if (ev) {
      if (ev.cat >= 4) return 'nut';
      if (ev.cat === 3 || ev.cat === 2) return 'overpair';
      if (ev.cat === 1) {
        var pr = ev.kickers[0];
        // Only counts as hero's pair if hero holds one of the paired cards.
        // If the pair is on the board, hero has no pair (just high card).
        var heroHasPair = hole.some(function (c) { return c.r === pr; });
        if (!heroHasPair) return 'air';
        var boardRanks = community.map(function (c) { return c.r; }).sort(function (a, b) { return b - a; });
        var bmax = boardRanks[0], bsecond = boardRanks[1];
        if (pr > bmax) return 'overpair';
        if (pr === bmax) return 'toppair';
        if (pr === bsecond) return 'secondpair';
        return 'weakpair'; // third pair or worse — not a value hand
      }
    }
    if (d.flushDraw || d.oesd) return 'draw';
    if (d.gutshot) return 'draw-weak';
    return 'air';
  }

  // Plain-language name for a hand class (SPR/commitment messages).
  function handClassName(hc) {
    return { nut: 'the nuts', overpair: 'an overpair', toppair: 'top pair',
      secondpair: 'second pair', weakpair: 'a weak pair', 'draw-strong': 'a monster draw', draw: 'a draw',
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
    var n = 0, raised = false;
    if (handRec && handRec.timeline) handRec.timeline.forEach(function (t) {
      if (t.t !== 'action' || t.street !== 'preflop') return;
      if (t.action === 'raise' || t.action === 'bet') raised = true;
      // Only count calls made before any raise — a call of a raise is not a limp.
      if (t.action === 'call' && !raised) n++;
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
    // 4+ of a suit: flush completed, not a draw to charge. Treat as dry for
    // "make them pay" purposes — the draw already got there.
    if (suits.some(function (n) { return n >= 4; })) return 'completed';
    if (suits.some(function (n) { return n === 3; })) return 'wet';
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
      // In multiway limped pots, don't focus on a single villain — the
      // multiwayNote covers the situation. Single-villain reads are for
      // heads-up or 3-way pots.
      var isMultiLimp = table.street === 'preflop' && countLimpers() >= 3;
      // Limped multiway pots: a single-villain read ("vs X") is noise when 4+
      // players are still in and nobody has raised — the spot is about the
      // dead money, not one opponent. Raised pots keep the aggressor read.
      var limpedMulti = table.street === 'preflop' && table.currentBet <= table.bb && isMultiway();
      var tail = (isMultiLimp || limpedMulti) ? '' : villainLine(V);
      // Opponent reads are static reference: show once per hand (first verdict),
      // not on every decision. Repeating them bloated every message to 600+
      // chars (v1.8.71, found by the 10-hand audit loop).
      var posNote = ' <span class="coach-pos">📍 You\'re in ' + esc(posName) + '.</span>';
      var stageNote = tourneyStageTip();
      var multiNote = multiwayNote();
      var reads = coachDecisions.length === 0 ? opponentReads() : '';
      v.html = v.msg ? v.msg + tail + posNote + stageNote + multiNote + reads : null;
      return v;
    } catch (err) {
      // Surface coach errors in debug mode; silent in production to avoid
      // breaking the game UI. Enable via ?coachdebug=1 or window.__coachDebug.
      if (window.__coachDebug || /[?&]coachdebug=1/.test(location.search)) {
        console.error('[coach] verdict failed:', err);
        if (typeof UI !== 'undefined' && UI.log) {
          UI.log('🐛 Coach error: ' + (err && err.message), 'hl-leak');
        }
      }
      return { advice: null, strength: 'marginal', msg: '', lesson: '', html: null, error: String(err && err.message) };
    }
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
      preflopSpot: preflopSpot,
      // Scenario testing: verify coach advice for specific spots without
      // playing full hands. Returns the verdict object (or error).
      // Scenarios: 'limpers3' (3+ limpers preflop), 'paired-board' (board pair,
      // hero lacks it), 'multiway-draw' (4+ players, flush draw), 'weakpair'
      // (hero has 3rd pair+), 'trash-facing-open' (52o vs raise).
      testScenario: function (name) {
        try {
          var v = coachVerdict();
          return { scenario: name, advice: v.advice, html: v.html, error: v.error || null,
                   rendered: !!v.html };
        } catch (err) {
          return { scenario: name, error: String(err && err.message), rendered: false };
        }
      },
      // Enable coach debug logging: window.__coachDebug = true
      enableDebug: function () { window.__coachDebug = true; return 'coach debug on'; }
    };
  } catch {}

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

  // Post-hand recap: celebrates wins first (even if you ignored the coach —
  // winning is winning), then one leak to fix. Drawn from this hand's strong
  // (non-marginal) decisions vs the coach's advice. Shown in the coach tab
  // after the hand; plain-text lines are also stored on the hand record.
  function coachRecap(handNo, won, wonByFold) {
    var good = null, bad = null;
    coachDecisions.forEach(function (d) {
      if (d.strength !== 'strong' || !d.lesson) return;
      if (d.followed && !good) good = d;
      else if (!d.followed && !bad) bad = d;
    });
    if (!good && !bad && !won) return null;
    var lines = [];
    // Win first: if you ignored the coach but took the pot, say so.
    // Distinguish semi-bluffs (draw + aggression) from pure bluffs and iso-raises.
    if (won && !good && bad) {
      var isSemi = bad.hc === 'draw-strong' || bad.hc === 'draw';
      var isIso = bad.action === 'raise' && bad.advice === 'fold' && bad.street === 'preflop';
      var winMsg = wonByFold
        ? (isSemi ? 'Nice semi-bluff! 🎉 Your draw + aggression took it down.'
           : isIso ? 'Nice iso-raise! 🎉 You punished the limpers and took the dead money.'
           : 'Bluff worked! 🎉 Everyone folded — nice aggression.')
        : 'You won the hand! 🎉 Your play got through.';
      lines.push({ kind: 'good', text: winMsg });
    } else if (good && won) {
      lines.push({ kind: 'good', text: 'Well played — ' + good.lesson });
    } else if (good && !won && !bad) {
      // Followed the plan but lost with no leak to name: never say
      // "well played" for a losing hand (v1.8.71) — neutral process note.
      lines.push({ kind: 'good', text: 'Tough loss — you stuck to the plan on the key decision. Sometimes the cards don\'t cooperate.' });
    }
    // Don't second-guess a winning bluff: if you took it down by fold,
    // the aggression worked — no "tighten up" lecture.
    if (bad && !(won && wonByFold)) {
      var prefix = (won && !good) ? 'One thing to tighten up: ' : 'To improve: ';
      lines.push({ kind: 'bad', text: prefix + 'coach said ' + bad.advice +
        ', you went ' + bad.action + '. ' + bad.lesson });
    }
    var h = '<div class="coach-recap-title">Hand #' + UI.escapeHtml(String(handNo)) + ' recap</div>';
    lines.forEach(function (l) {
      h += '<div class="coach-recap-' + l.kind + '">' +
        (l.kind === 'good' ? '✅ ' : '📌 ') + UI.escapeHtml(l.text) + '</div>';
    });
    return { html: h, lines: lines.map(function (l) { return (l.kind === 'good' ? '+ ' : '- ') + l.text; }) };
  }

  // ---- solver-grade additions (2026-10-08 research round) ----
  // Tournament stage: early (deep), middle, bubble (4-5 left, 3 paid), final (3 left).
  // Used to tailor coach advice — each stage plays differently.
  function tourneyStage() {
    if (gameMode !== 'tourney') return null;
    var alive = table.players.filter(function (p) { return !p.sittingOut && p.stack > 0; }).length;
    if (alive <= 3) return 'final';
    if (alive <= 5) return 'bubble';
    var avgBB = table.players.reduce(function (s, p) { return s + p.stack; }, 0) / alive / table.bb;
    if (avgBB > 40) return 'early';
    return 'middle';
  }
  function tourneyStageTip() {
    var st = tourneyStage();
    if (!st) return '';
    if (st === 'early') return ' <span class="coach-stage">Early stage: deep stacks — play like cash, see flops with hands that can make big hands.</span>';
    if (st === 'middle') return ' <span class="coach-stage">Middle stage: blinds rising — steal more, defend less. Antes make steals profitable.</span>';
    if (st === 'bubble') return ' <span class="coach-stage">🫧 Bubble: 3 get paid! Tighten up as a medium stack; bully as the big stack.</span>';
    return ' <span class="coach-stage">🏁 Final 3: every elimination is a pay jump. Survival is everything.</span>';
  }
  // Multiway pot awareness: when 3+ players are in, bluffs work less often
  // but the pot is bigger. Coach should acknowledge the crowd, not just
  // focus on a single villain.
  function multiwayNote() {
    if (table.street !== 'preflop') {
      var n = table.livePlayers().length;
      if (n >= 4) return ' <span class="coach-multi">👥 ' + n + '-way pot — bluffs rarely work multiway; bet only for value.</span>';
      return '';
    }
    var limps = countLimpers();
    if (limps >= 3) return ' <span class="coach-multi">👥 ' + limps + ' limpers in the pot (' + UI.fmt(table.potTotal()) + ' dead money) — great spot to raise and take it down.</span>';
    return '';
  }
  // Tournament risk premium: near pay jumps, chips are worth more than face
  // value, so the pot-odds bar rises. Approximated from effective stack depth
  // (short stacks face the most ICM pressure). Cash games: no tax.
  function tourneyRiskPremium(effBB) {
    if (gameMode !== 'tourney') return 0;
    if (effBB <= 12) return 0.12;
    if (effBB <= 20) return 0.08;
    if (effBB <= 35) return 0.04;
    return 0;
  }
  function riskPremiumNote(rp) {
    return rp > 0 ? ' <span class="coach-icm">Tournament note: be a bit tighter here — chips are worth more than their face value near pay jumps.</span>' : '';
  }
  // Push/fold chart positions (pushfold.js) from the coach's position names.
  var PF_POS_MAP = { 'button': 'BTN', 'small blind': 'SB', 'big blind': 'BB',
    'cutoff': 'CO', 'middle position': 'MP', 'early position': 'UTG' };
  function heroIsBigStack() {
    var top = 0;
    table.players.forEach(function (p) {
      if (!p.sittingOut && p.stack > top) top = p.stack;
    });
    return table.players[0].stack >= top * 0.9 && top > 0;
  }
  // Nut-flush blocker: hero holds the ace of a 3+ flush suit on board.
  // Bluffing with it is better (villain can't have the nuts); calling with
  // it is better too (blocks their value).
  function heroFlushBlocker() {
    var hero = table.players[0];
    var suits = {};
    table.community.forEach(function (c) { suits[c.s] = (suits[c.s] || 0) + 1; });
    return Object.keys(suits).some(function (s) {
      return suits[s] >= 3 && hero.hole.some(function (c) { return c.s === +s && c.r === 14; });
    });
  }
  // Short-stack tourney preflop (<=12bb effective): shove-or-fold. Postflop
  // play is gone, so flat-calling is burning money — use the push/fold chart.
  // Returns a verdict, or null when not a short-stack spot.
  function coachShortStack(c) {
    if (gameMode !== 'tourney' || table.street !== 'preflop') return null;
    var effBB = effStackBB(c.vIdx);
    if (effBB > 12) return null;
    var fmt = c.fmt;
    var pos = PF_POS_MAP[c.posName] || 'MP';
    var shoveTier = (typeof chartShoveTier === 'function')
      ? chartShoveTier(pos, Math.max(1, Math.round(effBB))) : 2;
    var tier = c.tier;
    var shoveTo = Math.min(c.legal.maxRaiseTo, table.players[0].stack + (table.players[0].bet || 0));
    function shoveVerdict(why, lesson) {
      return mkVerdict('raise', 'strong',
        'Short stack (' + Math.round(effBB) + 'bb) — it\'s <b>shove or fold</b>. ' + why +
        ' <b>Shove</b> ' + fmt(shoveTo) + '.',
        lesson);
    }
    var spot = preflopSpot();
    if (spot === 'open' || isStealSpot()) {
      if (tier <= shoveTier)
        return shoveVerdict(c.nmHtml + ' is strong enough to shove ' + pos + ' at ' + Math.round(effBB) + 'bb.',
          'With under ~12bb, just go all-in or fold. Calling leaves you with no chips to play with later anyway.');
      return mkVerdict(spot === 'open' ? 'check' : 'fold', 'strong',
        Math.round(effBB) + 'bb and ' + c.nmHtml + ' isn\'t a shove ' + pos +
        '. <b>' + (spot === 'open' ? 'Check' : 'Fold') + '</b> and wait for a real hand.',
        'Short-stacked discipline: shove real hands, fold the rest — no limping, no min-raising.');
    }
    // Facing aggression short: reshove premiums and strong chart hands, never flat.
    if (tier === 1)
      return shoveVerdict(c.nmHtml + ' is always a shove here.',
        'Your best hands never fold when short — go all-in. You might win right away if they fold, or win at showdown.');
    if (tier <= Math.min(3, shoveTier))
      return shoveVerdict(c.nmHtml + ' is strong enough to reshove ' + Math.round(effBB) + 'bb.',
        'When short, go all-in with strong hands instead of just calling — you win extra when they fold.');
    return mkVerdict('fold', 'strong',
      '<b>Fold</b> — ' + c.nmHtml + ' can\'t call a raise at ' + Math.round(effBB) +
      'bb (no postflop play left), and it\'s not a reshove.',
      'The gap concept, short-stacked: it takes a much stronger hand to continue than to shove first.');
  }

  function coachPreflop(c) {
    var esc = c.esc, fmt = c.fmt;
    var hero = c.hero, legal = c.legal, toCall = c.toCall, pot = c.pot;
    var V = c.V, vIdx = c.vIdx, vName = c.vName, tier = c.tier, posName = c.posName;
    var spot = preflopSpot();
    var inPos = positionScore(table, 0) > 0.6;

    // Short-stack tournament: push/fold takes over everything preflop.
    var ss = coachShortStack(c);
    if (ss) return ss;

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
      // Big stack in a tournament: attack with anything playable — medium
      // stacks must over-fold to protect their tournament life (ICM pressure
      // is asymmetric; the big stack holds the leverage).
      if (tier === 5 && gameMode === 'tourney' && heroIsBigStack())
        return mkVerdict('raise', 'marginal',
          'You\'re the big stack — <b>raise 2.5×</b> with ' + c.nmHtml +
          '. Medium stacks have to fold a lot to stay alive, so your bluffs work more often.',
          'When you have the most chips in a tournament, be aggressive: others are scared to bust.');
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
          'They went all-in. With ' + c.nmHtml + ', <b>call</b> — your hand is usually ahead here.',
          'Never fold QQ or better to a single all-in: they often have worse hands.');
      }
      if (tier === 2)
        return mkVerdict(inPos && effBB3 >= 40 ? 'call' : 'fold', inPos && effBB3 >= 40 ? 'marginal' : 'strong',
          inPos && effBB3 >= 40
            ? '<b>Call</b> in position — ' + c.nmHtml + ' flops well and you\'re deep. Fold to more heat.'
            : '<b>Fold</b> — ' + c.nmHtml + ' doesn\'t play well against a re-raise' + (inPos ? '' : ' out of position') + '.',
          'Medium pairs and broadways shrink fast against re-raises — call only deep and in position.');
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
        '<b>Fold</b> — ' + c.nmHtml + ' plays terribly against a re-raise. Tight players fold these.',
        'Fold hands like AJo and KQo to re-raises: when called, you\'re usually dominated.');
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

    // ---- limpers ahead, no raise yet (0 raises, but calls exist)
    var nRaises = 0;
    if (handRec && handRec.timeline) handRec.timeline.forEach(function (t) {
      if (t.t === 'action' && t.street === 'preflop' &&
          (t.action === 'bet' || t.action === 'raise')) nRaises++;
    });
    if (nRaises === 0 && countLimpers() > 0) {
      if (tier <= 2)
        return mkVerdict('raise', 'strong',
          c.nmHtml + ' — limpers are weak. <b>Raise 4×</b> to isolate one of them and play for stacks.',
          'Isolate limpers with premiums: raise big, play heads-up, stack them.');
      if (tier <= 3 && inPos)
        return mkVerdict('raise', 'marginal',
          '<b>Raise 4×</b> to isolate — limpers rarely have much, and you have position.',
          'Attack limpers from late position; they fold or play bloated pots out of position.');
      // Iso-raise option: 3+ limpers = lots of dead money. On the button/cutoff
      // with any playable hand, raising is a profitable option — limpers fold
      // a lot, and you have position when called. But calling is fine too;
      // mix in the raise, don't auto-bluff every time.
      if (countLimpers() >= 3 && (posName === 'button' || posName === 'cutoff') && tier <= 5)
        return mkVerdict('raise', 'marginal',
          'You can <b>raise 4×</b> to punish the limpers — ' + countLimpers() + ' limpers means ' +
          UI.fmt(table.potTotal()) + ' of dead money. Or call behind; both are fine. Mix in the raise sometimes.',
          'Iso-raising limpers is a profitable option: dead money plus position makes it winning long-term, but don\'t feel forced — calling behind is fine too.');
      // 2+ limpers in late/middle position: dead money is worth attacking even
      // without a third limper. Ace-high and playable hands can take it down
      // preflop or isolate one player — but folding is fine too, don't force it.
      if (countLimpers() >= 2 && (posName === 'button' || posName === 'cutoff' || posName === 'middle position') && tier <= 5)
        return mkVerdict('raise', 'marginal',
          'You can <b>raise 4×</b> to attack the dead money — ' + countLimpers() + ' limpers means ' +
          UI.fmt(table.potTotal()) + ' sitting there. Take it down now or isolate one player. Or fold; both are fine.',
          'Iso-raising limpers is a profitable option: dead money plus position makes it winning long-term, but don\'t feel forced — folding is fine too.');
      if (tier === 4 && inPos && effStackBB(vIdx) >= 20)
        return mkVerdict('call', 'marginal',
          '<b>Call</b> behind — speculative hand, deep stacks, great implied odds if you crack a limper.',
          'Calling behind with speculative hands in position is fine when stacks are deep.');
      return mkVerdict('fold', 'strong',
        '<b>Fold</b> — don\'t limp behind with ' + c.nmHtml + '. Wait for a real hand.',
        'Limping behind with weak hands is a slow leak — fold and stay disciplined.');
    }

    // ---- facing a single open: re-raise premiums, otherwise the call/fold math
    var open = table.currentBet;
    var need = toCall / (pot + toCall);
    var multiway = isMultiway();
    var suited = isSuited(hero.hole);

    // Trash hands: fold immediately, don't even do the math. 52o and similar
    // have no playability — raw equity lies.
    if (tier >= 6) {
      return mkVerdict('fold', 'strong',
        '<b>Fold</b> — ' + c.nmHtml + ' is trash. Don\'t pay to see a flop with it.',
        'The worst hands lose money even when the math looks close — they\'re hard to play and often dominated.');
    }

    // Value re-raise with position-aware sizing: 3x in position, 4x out of position.
    if (tier <= 2 && legal.canRaise) {
      var mult = inPos ? 3 : 4;
      var three = Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round(open * mult)));
      return mkVerdict('raise', 'strong',
        '<b>Re-raise</b> ' + c.nmHtml + ' to ~<b>' + fmt(three) + '</b> (' + mult + '× their open' +
        (inPos ? ') — you have position' : ') — out of position, size up to charge them') +
        '. You\'re usually ahead, so build the pot now.',
        'Re-raise premiums for value: 3× in position, 4× out of position.');
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
        'Mix in a <b>bluff re-raise</b> sometimes: your ace makes aces and ace-king less likely for them, and ' + vName + ' folds too much.',
        'Only bluff re-raise when they fold a lot — never into multiple players.');

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
    var rp = tourneyRiskPremium(effBB);
    var threshold = need + (multiway ? 0.04 : 0) + rp -
      ((V && villainBluffy(V.archetype) > 0.55) ? 0.05 : 0);

    var handDesc = c.nmHtml + (suited ? ' suited' : '');
    var mathLine = 'Pay <b>' + fmt(toCall) + '</b> to win <b>' + fmt(pot + toCall) + '</b> — you need to win <b>' +
      pct(need) + '</b> of the time' + (rp > 0 ? ' (a bit more in tournaments)' : '') + '. ' +
      handDesc + ' wins about <b>' + pct(adjEq) + '</b> here. ';
    if (adjEq > threshold + 0.03)
      return mkVerdict('call', 'strong', mathLine + 'The math says <b>call</b>.',
        'Call when you win often enough to cover the price — the most important poker math skill.');
    if (adjEq > threshold - 0.05)
      return mkVerdict(inPos ? 'call' : 'fold', 'marginal',
        mathLine + (inPos ? 'Close — acting last, lean <b>call</b>.' : 'Close — acting first, lean <b>fold</b>.'),
        'Close calls are better when you act last: you get more information first.');
    var rioNote = debit > 0 ? ' Against a tight player your hand is often second-best — that\'s trouble.' : '';
    return mkVerdict('fold', 'strong', mathLine + 'Math says <b>fold</b>.' + rioNote,
      'Folding when the price is wrong saves more money than risky calls ever win.');
  }

  function coachPostflop(c) {
    var esc = c.esc, fmt = c.fmt;
    var hero = c.hero, legal = c.legal, toCall = c.toCall, pot = c.pot;
    var V = c.V, vIdx = c.vIdx, vName = c.vName, posName = c.posName;
    var hc = handClass(hero.hole, table.community);
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
          ? ' The pot\'s already big compared to your stacks — you\'re all-in anyway, so get the money in.'
          : '';
        return mkVerdict('bet', 'strong',
          '<b>Bet for value</b> ~' + (frac === 0.75 ? '¾' : '½') + ' pot (' + fmt(betSize) + ')' +
          (tex === 'wet' ? ' — lots of draws out there, make them pay to chase' : '') + '.' + sprLine + rangeNote,
          'Bet your strong hands; bet bigger when draws are possible so they pay to chase.');
      }
      // Draws: semi-bluff the strong ones, check weak ones and vs stations.
      // But never semi-bluff multiway — too many players to fold.
      if (anyDraw && canBet) {
        if (foldy < 0.25)
          return mkVerdict('check', 'strong',
            'Nice draw, but ' + vName + ' never folds. <b>Check</b> and take the free card.' + rangeNote,
            'Never bluff someone who never folds — just check and take the free card.');
        if (multiway)
          return mkVerdict('check', 'strong',
            '<b>Check</b> — nice draw, but too many players to bluff through multiway. Take the free card.' + rangeNote,
            'Multiway pots kill semi-bluffs: everyone has to fold, and someone usually won\'t.');
        if (hc === 'draw-weak')
          return mkVerdict('check', 'marginal',
            'Just a gutshot — <b>check</b>. One way to win isn\'t enough to bet on.',
            '');
        var halfBet = Math.max(1, Math.round(pot / 2));
        return mkVerdict('bet', hc === 'draw-strong' ? 'strong' : 'marginal',
          '<b>Semi-bluff</b> ~½ pot (' + fmt(halfBet) + ') — two ways to win: they fold now, or you hit. Needs only <b>' +
          pct(bluffBE(halfBet, pot)) + '</b> folds to break even.' + rangeNote,
          'Betting a strong draw is smart: you win if they fold now, or if you hit your hand.');
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
      // Weak pair (third pair or worse): give up. It's rarely best, especially
      // vs players who don't fold. Check and hope to win a showdown, but don't
      // put more money in.
      if (hc === 'weakpair') {
        return mkVerdict('check', 'strong',
          '<b>Check</b> — ' + handClassName(hc) + ' is rarely best here. Don\'t throw good money after bad.' + rangeNote,
          'Third pair or worse has little value — check and give up if there\'s action. Sometimes you have to let go.');
      }
      // Air: bluff only with a real story behind it.
      if (canBet) {
        var scare = scareCardRank();
        // Checked around to hero in late position? That's a green light to
        // steal — everyone showing weakness. Lower the bar even multiway.
        var checkedAround = table.currentBet === 0 && (posName === 'button' || posName === 'cutoff');
        var spot = (inPos ? 1 : 0) + (scare ? 1 : 0) + (foldy > 0.55 ? 1 : 0) +
          (checkedAround ? 1 : 0) - (foldy < 0.3 ? 2 : 0) - (multiway && !checkedAround ? 2 : 0);
        if (spot >= 2 && foldy >= 0.35) {
          var why = [];
          if (scare) why.push('the ' + esc(scare) + ' is a scare card');
          if (inPos) why.push('you have position');
          if (foldy > 0.55) why.push(vName + ' overfolds');
          if (heroFlushBlocker()) why.push('you block their best flush');
          if (checkedAround) why.push('everyone checked to you');
          var b2 = Math.max(1, Math.round(pot / 2));
          return mkVerdict('bet', 'marginal',
            '<b>Bluff</b> ~½ pot (' + fmt(b2) + ') — needs <b>' + pct(bluffBE(b2, pot)) + '</b> folds (' + why.join(', ') +
            ').' + rangeNote,
            'Bluff with a story — position, a scare card, or a folder — never just because. Mix bluffs in, or your value bets never get paid.');
        }
        return mkVerdict('check', multiway ? 'strong' : 'marginal',
          '<b>Check</b> — ' + (multiway ? 'too many players to bluff through.' : 'nothing to win by betting here.') +
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
    // Polarized from a non-bluffer is effectively strong (v1.8.71: Amogh's
    // overbet shove read as 'wide'/bluffy and advised a call with ace-high).
    var polarStrong = range.label === 'polarized' && (tight > 0.6 || bluffy < 0.25);
    if (range.label === 'polarized') rangeAdjust += (polarStrong ? 0.12 : -0.02);
    if (range.label === 'wide' || bluffy > 0.55) rangeAdjust -= 0.06;
    if (range.label === 'capped') rangeAdjust -= 0.03;
    if (multiway && betCallAhead()) rangeAdjust += 0.05;

    // Equity vs a strong/tight range runs lower than vs random hands.
    var eq2 = estimateEquity(hero.hole, table.community, Math.min(3, table.livePlayers().length - 1), 150);
    if (range.label === 'strong' || polarStrong) eq2 *= 0.75;

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
        'The pot\'s huge compared to what\'s left. With ' + handClassName(hc) +
        ' you\'re <b>committed: call</b>.' + rangeNote,
        'When the pot is big and your hand is strong, don\'t fold — you\'re already in too deep.');

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
        '<b>Raise</b> sometimes: you win if they fold, or about ' + pct(adjEq) + ' of the time if they call. Otherwise just call ' +
        fmt(toCall) + '.' + rangeNote,
        '');

    // The call/fold math, adjusted for range, implied odds, player type, and
    // tournament ICM. (The range read is already named in the parenthetical,
    // so rangeNote is skipped here to avoid repeating it.)
    var rp2 = tourneyRiskPremium(effBB);
    var threshold = need2 + rangeAdjust + rp2;
    // Population prior (low stakes): rivers are under-bluffed, so over-fold
    // slightly to river aggression unless villain is a known bluffer.
    var riverPrior = (table.street === 'river' && bluffy <= 0.55) ? 0.03 : 0;
    threshold += riverPrior;
    // Pot odds in plain English: the price vs the prize, not just a percentage
    // (v1.8.71: beginners couldn't follow the raw "win X% of the time").
    // When the range is strong, show the ADJUSTED bar explicitly — showing raw
    // 41% then saying "fold" vs 52% equity was contradictory and confusing
    // (v1.8.71: Kevin's J4 vs Amogh's big bet).
    var strongAdj = rangeAdjust > 0.005;
    // Concise math line (v1.8.71): pot odds + adjusted bar + equity source in
    // one breath. The three explainers Kevin asked for (break-even meaning,
    // adjusted threshold vs strong ranges, how win% is simulated) are here
    // but tight — the 10-hand loop flags anything over 400 chars.
    var mathLine = 'Pot odds: calling <b>' + fmt(toCall) + '</b> to win <b>' + fmt(pot) + '</b> — ' +
      'need <b>' + pct(need2) + '</b> to break even (the call pays for itself)' +
      (strongAdj ? ', <b>' + pct(threshold) + '</b> vs ' + vName + '\'s strong range' : '') +
      (rp2 > 0 ? ' (a bit more in tournaments)' : '') +
      (riverPrior > 0 ? ' (rivers are under-bluffed)' : '') +
      '. You win about <b>' + pct(adjEq) + '</b>' +
      ' (played out vs random hands 150 times' +
      (strongAdj ? ', lowered for their strength' : rangeAdjust < -0.005 ? ', raised for their looseness' : '') +
      '). ' +
      riskPremiumNote(rp2);
    // Bluff-catching concept for beginners: when your hand only beats a bluff,
    // name it explicitly (v1.8.71).
    var bluffCatchNote = (hc === 'air' && toCall > 0)
      ? " Bluff-catching = calling hoping they're bluffing. Works vs bluffers, not vs big bets for value."
      : '';
    if (adjEq > threshold + 0.03)
      return mkVerdict('call', 'strong', mathLine + 'The math says <b>call</b>.',
        'Calling when you win often enough is how winning poker works.');
    if ((bluffy > 0.5 || range.label === 'wide') && adjEq > threshold - 0.10)
      return mkVerdict('call', 'marginal',
        mathLine + 'Close — but ' + vName + ' bluffs a lot, so lean <b>call</b>.',
        'Against heavy bluffers, call lighter: their range holds more air than usual.');
    if (debit > 0 && adjEq <= threshold)
      return mkVerdict('fold', 'strong',
        mathLine + 'Math says <b>fold</b> — and even hitting might not win (reverse implied odds).' + bluffCatchNote,
        'Non-nut draws against tight ranges are trap hands: hitting can still lose.');
    return mkVerdict('fold', adjEq > threshold - 0.06 ? 'marginal' : 'strong',
      mathLine + 'Math says <b>fold</b>.' + bluffCatchNote,
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

    var bots = rosterBots().filter(function (b) { return selectedBots.has(b.id); }).slice(0, maxOpp());
    if (!bots.length) bots = [botById('lag')]; // safety net; the UI enforces >= 1
    // Tournaments need a full table (8 players) for realistic ICM/bubble dynamics.
    if (mode === 'tourney' && bots.length < 7) {
      UI.modal({
        title: 'Need 8 players',
        body: 'Tournaments need a full table (you + 7 opponents) for realistic bubble and payout dynamics. Please select ' + (7 - bots.length) + ' more opponent' + (7 - bots.length === 1 ? '' : 's') + '.',
        buttons: [{ label: 'OK', primary: true }]
      });
      return;
    }

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
      TOUR_LEVELS = tourLevels();
      tourney = { levelIdx: 0, placements: [] }; // placements: eliminated player names in order
      table.setBlinds(TOUR_LEVELS[0].sb, TOUR_LEVELS[0].bb, 0);
    } else tourney = null;

    sessionStartChips = table.players[0].stack;
    beginTableSession();
  }

  function leaveToLobby() {
    table = null; evtQueue = []; pumping = false; waitingForHero = false;
    UI.winnerBanner(null);
    showSetup();
  }

  // ================= offline session resume =================
  // If Kevin leaves the page mid-session, the completed hands' stacks are
  // kept: a "Resume last session" button appears on the setup screen and
  // restores every stack (his and the bots') exactly. Saves happen at each
  // hand end (exact stacks) and on pagehide (best effort — uncollected
  // street bets are credited back, the dead hand itself is not resumed).
  var SESSION_KEY = 'poker-sparring-session-v1';

  function sessionSaveable() {
    return !!table && (gameMode === 'cash' || gameMode === 'hu' || gameMode === 'tourney');
  }

  function saveSession() {
    if (!sessionSaveable()) return;
    try {
      var players = table.players.map(function (p) {
        return {
          name: p.name,
          stack: Math.max(0, Math.round((p.stack || 0) + (p.bet || 0))),
          archetypeId: p.isHero ? null : (p.archetype && p.archetype.id),
          isHero: !!p.isHero,
          sittingOut: !!p.sittingOut
        };
      });
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        v: 1, savedAt: Date.now(),
        mode: gameMode,
        cfg: { stack: cfg.stack, sb: cfg.sb, bb: cfg.bb, botRebuys: cfg.botRebuys,
               roundBets: cfg.roundBets, blindInterval: cfg.blindInterval,
               tourneyRebuys: cfg.tourneyRebuys },
        heroName: table.players[0].name,
        handNo: table.handNo,
        button: table.button,
        levelIdx: tourney ? tourney.levelIdx : 0,
        players: players
      }));
    } catch { /* storage blocked/full: resume just won't be offered */ }
  }

  function loadSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || d.v !== 1 || !d.players || !d.players.length) return null;
      return d;
    } catch { return null; }
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
  }

  // Reflect a restored session in the setup screen, so going back there
  // after a resume shows the right mode, blinds, and roster.
  function syncSetupInputs() {
    try {
      document.querySelectorAll('.mode-card').forEach(function (c) {
        c.classList.toggle('selected', c.dataset.mode === mode);
      });
      function setVal(id, v) { var el = $(id); if (el && v != null) el.value = v; }
      function setChk(id, v) { var el = $(id); if (el) el.checked = !!v; }
      setVal('cfg-stack', cfg.stack); setVal('cfg-sb', cfg.sb); setVal('cfg-bb', cfg.bb);
      setVal('cfg-blindint', cfg.blindInterval);
      setChk('cfg-botrebuys', cfg.botRebuys); setChk('cfg-roundbets', cfg.roundBets);
      setChk('cfg-tourneyrebuys', cfg.tourneyRebuys);
      var oc = $('opp-count'); if (oc) oc.textContent = selectedBots.size;
      UI.renderRoster(rosterBots(), selectedBots, maxOpp(), rosterHint, function () {
        var oc2 = $('opp-count'); if (oc2) oc2.textContent = selectedBots.size;
        saveRoster();
      });
      saveRoster();
    } catch { /* setup DOM not ready — resume still works */ }
  }

  function resumeSession() {
    var s = loadSession();
    if (!s) return;
    mode = s.mode; gameMode = s.mode;
    Object.keys(s.cfg || {}).forEach(function (k) { cfg[k] = s.cfg[k]; });
    // Rebuild the roster from saved archetype ids (custom bots resolve via
    // loadCustomBots, exactly like startGame).
    var ids = (s.players || []).slice(1).map(function (sp) { return sp.archetypeId; })
      .filter(function (id) { return !!botById(id); }).slice(0, maxOpp());
    selectedBots = new Set(ids.length ? ids : ['lag']);
    syncSetupInputs();
    var bots = Array.from(selectedBots).map(botById).filter(Boolean);
    if (!bots.length) bots = [botById('lag')];
    var heroStack = (s.players[0] && s.players[0].stack) || cfg.stack;
    var players = [{ name: s.heroName || NamePrefs.heroName(), isHero: true }];
    bots.forEach(function (b, i) {
      var sp = s.players[i + 1] || {};
      players.push({
        name: sp.name || NamePrefs.displayName(b), archetype: b,
        sittingOut: !!sp.sittingOut
      });
      players[players.length - 1]._resumeStack = (sp.stack != null ? sp.stack : cfg.stack);
    });
    table = new PokerTable({
      players: players, sb: cfg.sb, bb: cfg.bb,
      startingStack: cfg.stack, button: s.button, ante: 0, onEvent: onTableEvent
    });
    // The constructor assigns startingStack to everyone — restore saved stacks.
    table.players[0].stack = Math.max(0, heroStack);
    bots.forEach(function (b, i) {
      var tp = table.players[i + 1];
      tp.stack = Math.max(0, players[i + 1]._resumeStack);
      if (s.players[i + 1] && s.players[i + 1].sittingOut) tp.sittingOut = true;
    });
    table.handNo = s.handNo || 0; // next deal continues the count (blinds stay on schedule)
    if (gameMode === 'tourney') {
      TOUR_LEVELS = tourLevels();
      tourney = { levelIdx: Math.min(s.levelIdx || 0, TOUR_LEVELS.length - 1) };
      var lv = TOUR_LEVELS[tourney.levelIdx];
      table.setBlinds(lv.sb, lv.bb, lv.ante);
    } else tourney = null;
    beginTableSession();
    UI.log('↻ Resumed session — hand #' + (table.handNo + 1) + ' continues with saved stacks.');
  }

  // Shared tail of startGame/resumeSession: reset pump state, show the table,
  // deal the next hand.
  function beginTableSession() {
    sessionStartChips = table.players[0].stack;
    lastHeroEndStack = undefined;
    refreshBankroll();
    evtQueue = []; pumping = false; waitingForHero = false;
    UI.buildSeats(); // fixed 8-seat layout; renderTable marks empties
    UI.showScreen('table');
    // Clear the previous session's "Last:" result — it would otherwise linger
    // in the topbar until the first new hand ends (daily QA 2026-10-07).
    try { var lr = document.getElementById('last-result'); if (lr) lr.textContent = ''; } catch {}
    setTimeout(dealNext, 400);
  }

  // Setup screen entry point: refresh the Resume button every time.
  function showSetup() {
    UI.showScreen('setup');
    refreshResumeButton();
  }

  function refreshResumeButton() {
    var btn = $('btn-resume'), hint = $('resume-hint');
    if (!btn) return;
    var s = loadSession();
    if (!s) { btn.hidden = true; if (hint) hint.hidden = true; return; }
    btn.hidden = false;
    if (hint) {
      hint.hidden = false;
      var when = '';
      try {
        var mins = Math.round((Date.now() - s.savedAt) / 60000);
        when = mins < 1 ? 'just now' : mins < 60 ? mins + 'm ago'
          : Math.round(mins / 60) < 24 ? Math.round(mins / 60) + 'h ago'
          : Math.round(mins / 1440) + 'd ago';
      } catch {}
      var modeName = { cash: 'cash game', hu: 'heads-up', tourney: 'tournament' }[s.mode] || s.mode;
      hint.textContent = 'Hand #' + (s.handNo + 1) + ' · ' + modeName + ' · you had ' +
        UI.fmt(s.players[0].stack) + ' chips · saved ' + when;
    }
    btn.onclick = resumeSession;
  }

  // Exposed for tests (tests/session.test.js); the IIFE keeps the rest private.
  try {
    window.__sessionIO = {
      save: saveSession, load: loadSession, clear: clearSession,
      saveable: sessionSaveable, resume: resumeSession, refresh: refreshResumeButton,
      key: SESSION_KEY
    };
  } catch {}

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
      try { localStorage.setItem(THEME_KEY, t); } catch {}
    }
    try {
      var savedTheme = localStorage.getItem(THEME_KEY);
      document.documentElement.dataset.theme =
        (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'dark';
    } catch { document.documentElement.dataset.theme = 'dark'; }
    var themeBtn = $('theme-toggle');
    if (themeBtn) themeBtn.onclick = function () {
      applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
    };
    var brandBtn = $('brand-home');
    if (brandBtn) brandBtn.onclick = function () { showSetup(); };
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.onclick = function () {
        var dest = b.dataset.nav;
        if (dest === 'setup') showSetup();
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
    var flagForMode = { hu: 'headsUpMode', pushfold: 'pushFoldTrainer' };
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
          if (!selectedBots.size) loadModeRoster();
          preHuSelection = null;
        } else if (prev !== 'hu' && mode !== 'hu' && prev !== mode) {
          // Cash <-> tournament: each mode remembers its own roster.
          // Save the old mode's picks, then load the new mode's.
          try { localStorage.setItem('ps_roster_' + prev + '_v1', JSON.stringify(Array.from(selectedBots))); }
          catch {}
          loadModeRoster();
        }
        // Prune bots that don't play this game type (e.g. cash classics when
        // switching to tournament). Keep the remaining picks as-is.
        pruneSelection();
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
      try { curEm = localStorage.getItem('ps_player_emoji') || '🧑'; } catch {}
      EMOJI_CHOICES.forEach(function (em) {
        var o = document.createElement('option');
        o.value = em; o.textContent = em;
        if (em === curEm) o.selected = true;
        emojiSel.appendChild(o);
      });
      emojiSel.addEventListener('change', function () {
        try { localStorage.setItem('ps_player_emoji', emojiSel.value); } catch {}
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
      UI.renderRoster(rosterBots(), selectedBots, maxOpp(), rosterHint, onRosterChange);
      syncQuickHint();
      syncTourneyHint();
      saveRoster();
    }
    // Tournament mode: show the blind structure under the settings.
    function syncTourneyHint() {
      var el = $('tourney-blind-hint');
      if (!el) return;
      if (mode !== 'tourney') { el.style.display = 'none'; return; }
      var sb = Math.max(1, parseInt($('cfg-sb').value, 10) || 5);
      var bb = Math.max(2, parseInt($('cfg-bb').value, 10) || 10);
      var every = Math.max(2, parseInt($('cfg-blindint').value, 10) || 8);
      el.style.display = '';
      el.textContent = '🏆 Tournament: starts at ' + sb + '/' + bb +
        ', blinds go up every ' + every + ' hands.';
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

    UI.renderRoster(rosterBots(), selectedBots, maxOpp(), rosterHint);
    // Sync the counter on initial load — selectedBots may be restored from storage.
    var oc0 = document.getElementById('opp-count');
    if (oc0) oc0.textContent = selectedBots.size;
    // Stack/blind tweaks update the quick-start hint live.
    ['cfg-stack', 'cfg-sb', 'cfg-bb', 'cfg-blindint'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', function () { syncQuickHint(); syncTourneyHint(); });
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
    UI.renderRoster(rosterBots(), selectedBots, maxOpp(), rosterHint, function () {
      var oc = document.getElementById('opp-count');
      if (oc) oc.textContent = selectedBots.size;
      saveRoster();
    });
    saveRoster();
    // A deleted bot can't be resumed — drop stale sessions referencing it.
    var s = loadSession();
    if (s && s.players.some(function (sp) {
      return !sp.isHero && !botById(sp.archetypeId);
    })) clearSession();
  }

  // Session resume: offer the button on load, and persist best-effort when
  // the page is hidden/closed (the per-hand save in onHandEnd is the exact one).
  refreshResumeButton();
  document.addEventListener('pagehide', saveSession);

  document.addEventListener('DOMContentLoaded', wire);
})();
