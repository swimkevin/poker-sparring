(function () {
  'use strict';

  function quiet(e) { if (typeof window !== 'undefined' && window.__psDebug) console.error(e); }

  var APP_VERSION = '1.8.121';
  try { if (/[?&]psdebug=1/.test(location.search)) window.__psDebug = true; } catch (e) { quiet(e); }

  var COACH_INTRO_KEY = 'ps_coach_intro_seen';
  function coachIntroSeen() {
    try { return !!localStorage.getItem(COACH_INTRO_KEY); } catch (e) { quiet(e); return true; }
  }
  function markCoachIntroSeen() {
    try { localStorage.setItem(COACH_INTRO_KEY, '1'); } catch (e) { quiet(e); }
  }
  function maybeCoachIntro() {
    if (coachIntroSeen()) return;
    UI.coachTip('New here? This is your <b>coach</b> — it explains every spot in plain English before you act. ' +
      'Tap <b>Learn</b> anytime for hand rankings. ' +
      '<button id="coach-intro-ok" class="ghost">Got it</button>');
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'coach-intro-ok') { markCoachIntroSeen(); UI.coachTip(null); }
    });
  }

  try { window.APP_VERSION = APP_VERSION; } catch (e) { quiet(e); }

  function updateReloadURL(pathname, v, hash) {
    return pathname + hash;
  }

  try { window.updateReloadURL = updateReloadURL; } catch (e) { quiet(e); }

  var DEFAULT_FLAGS = {
    headsUpMode: false,
    pushFoldTrainer: false,
    customBots: false
  };
  var PS_FLAGS = Object.assign({}, DEFAULT_FLAGS);

  try {
    var flagParam = new URLSearchParams(window.location.search).get('flags');
    if (flagParam) {
      flagParam.split(',').forEach(function (f) {
        f = f.trim();
        if (f in PS_FLAGS) PS_FLAGS[f] = true;
      });
    }

    var savedFlags = JSON.parse(localStorage.getItem('ps_feature_flags') || '{}');
    Object.keys(savedFlags).forEach(function (f) {
      if (f in PS_FLAGS && savedFlags[f]) PS_FLAGS[f] = true;
    });
  } catch (e) { quiet(e); }

  window.PS_FLAGS = PS_FLAGS;
  window.enableFlag = function (name) {
    if (!(name in PS_FLAGS)) return 'Unknown flag: ' + name;
    PS_FLAGS[name] = true;
    try {
      var s = JSON.parse(localStorage.getItem('ps_feature_flags') || '{}');
      s[name] = true;
      localStorage.setItem('ps_feature_flags', JSON.stringify(s));
    } catch (e) { quiet(e); }
    return name + ' enabled — refresh to see it.';
  };

  window.addEventListener('error', function (ev) {
    try {
      if (typeof UI !== 'undefined' && UI.log && document.getElementById('hand-log')) {
        UI.log('⚠️ Something glitched, but the table is safe and your stats are saved.', 'hl-leak');
      }
    } catch {  }
  });

  function $(id) { return document.getElementById(id); }

  var CUSTOM_KEY = 'ps_custom_bots_v1';
  function loadCustomBots() {
    try {
      var raw = localStorage.getItem(CUSTOM_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  function saveCustomBots(list) {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch (e) { quiet(e); }
  }
  function allBots() { return ARCHETYPES.concat(loadCustomBots()); }
  function botById(id) { return getArchetype(id, loadCustomBots()); }

  function rosterBots() {
    var customs = loadCustomBots();
    var listed = ARCHETYPES.filter(function (b) {
      return !b.modes || b.modes.indexOf(mode) !== -1;
    });
    var alice = listed.filter(function (b) { return b.id === 'alice'; });
    var rest = listed.filter(function (b) { return b.id !== 'alice'; });
    return alice.concat(customs, rest);
  }

  var mode = 'cash';

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
    catch (e) { quiet(e); }
  }
  var selectedBots = new Set(loadRoster() || ['alice', 'donald', 'lag', 'rohan', 'amogh', 'nathan', 'shark']);
  var preHuSelection = null;

  function pruneSelection() {
    var available = rosterBots().map(function (b) { return b.id; });
    selectedBots = new Set(Array.from(selectedBots).filter(function (id) {
      return available.indexOf(id) !== -1;
    }));
    if (!selectedBots.size) selectedBots = new Set([available[0] || 'lag']);
  }

  function topUpRoster() {
    if (mode === 'hu') return;
    var defaults = mode === 'tourney'
      ? ['alice', 'donald', 'lag', 'rohan', 'amogh', 'nathan', 'pro']
      : ['alice', 'donald', 'lag', 'rohan', 'amogh', 'nathan', 'shark'];
    var before = selectedBots.size;

    var missing = defaults.filter(function (id) {
      return !selectedBots.has(id) && botById(id);
    });
    missing.forEach(function (id) {

      if (selectedBots.size >= 7) {
        var nonDefault = Array.from(selectedBots).filter(function (x) {
          return defaults.indexOf(x) === -1;
        })[0];
        if (nonDefault) selectedBots.delete(nonDefault);
      }
      if (selectedBots.size < 7) selectedBots.add(id);
    });
    if (selectedBots.size !== before) saveRoster();
  }

  function loadModeRoster() {
    var ids = loadRoster();
    if (ids) selectedBots = new Set(ids);
    else selectedBots = new Set(mode === 'tourney'
      ? ['alice', 'donald', 'lag', 'rohan', 'amogh', 'nathan', 'pro']
      : ['alice', 'donald', 'lag', 'rohan', 'amogh', 'nathan', 'shark']);
    pruneSelection();
    topUpRoster();
  }
  pruneSelection();
  topUpRoster();
  function maxOpp() { return mode === 'hu' ? 1 : 7; }
  function rosterOrderIds() { return rosterBots().map(function (b) { return b.id; }); }

  var rosterHintTimer = null;
  function rosterHint(msg) {
    var el = $('roster-hint');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (rosterHintTimer) clearTimeout(rosterHintTimer);
    rosterHintTimer = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  var table = null;
  var evtQueue = [];
  var pumping = false;

  var awayFromTable = false;
  var pendingNextHand = false;

  function setAwayFromTable(away) {
    if (!table) away = false;
    if (away === awayFromTable) return;
    awayFromTable = away;
    try { UI.setHandEndAway(away); } catch (e) { quiet(e); }
    if (away) return;

    try {
      UI.renderTable(table, { lastActions: lastActions, button: table.button });
    } catch (e) { quiet(e); }
    if (pendingNextHand) {
      pendingNextHand = false;
      prepareNextHand();
      return;
    }
    if (waitingForHero) {
      setTurnStatus('Your turn', true);
      enableHeroControls();
    }
    pump();
  }
  var fastForward = false;
  var waitingForHero = false;
  var lastActions = {};
  var botThinkTimer = null;
  var pendingBot = null;
  var handCtx = null;
  var handRec = null;
  var coachDecisions = [];
  var pendingAdvice = null;
  var replay = null;
  var sessionStartChips = 0;

  var lastHeroEndStack;

  function refreshBankroll() {
    try {
      var st = (typeof loadStats === 'function') ? loadStats() : null;
      UI.setBankroll(st ? (st.profitChips || 0) : 0);
    } catch { UI.setBankroll(0); }
  }
  var tourney = null;
  var gameMode = 'cash';
  var cfg = { stack: 10000, sb: 50, bb: 100 };

  function tourLevels() {
    var sb0 = Math.max(1, cfg.sb || 5), bb0 = Math.max(2, cfg.bb || 10);

    var levels = [];
    for (var i = 0; i < 10; i++) {
      var mult = Math.pow(2, i);
      var sb = sb0 * mult, bb = bb0 * mult;
      var ante = i >= 3 ? Math.round(bb / 8 / 5) * 5 : 0;
      levels.push({ sb: sb, bb: bb, ante: ante });
    }
    return levels;
  }
  var TOUR_LEVELS = null;

  function onTableEvent(e) {
    evtQueue.push(e);
    pump();
  }

  function pump() {
    if (pumping || waitingForHero || awayFromTable || !evtQueue.length) return;
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

  function onHandStart(e) {
    lastActions = {};
    fastForward = false;
    setTurnStatus('', false);
    UI.resetTableFx();
    var skipBtn = $('btn-skip');
    if (skipBtn) skipBtn.hidden = false;
    UI.winnerBanner(null);
    UI.coachTip(null);
    maybeCoachIntro();
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
      markCoachIntroSeen();
      UI.coachTip(vd.html);

      pendingAdvice = vd.advice ? {
        advice: vd.advice, strength: vd.strength, lesson: vd.lesson, street: table.street
      } : null;
      UI.renderTable(table, { lastActions: lastActions, acting: e.player, button: table.button });
    } else {

      pumping = true;
      setTurnStatus('Waiting for ' + p.name + '…', false);
      UI.renderTable(table, { lastActions: lastActions, acting: e.player, button: table.button });
      if (botThinkTimer) clearTimeout(botThinkTimer);
      pendingBot = { player: p, idx: e.player };
      var botActNow = function () {
        botThinkTimer = null;

        if (awayFromTable) { botThinkTimer = setTimeout(botActNow, 400); return; }
        var pb = pendingBot; pendingBot = null;
        if (!pb || !table) { pumping = false; pump(); return; }
        var mv = botDecide(table, pb.player);
        pumping = false;
        if (mv) table.act(pb.idx, mv.a, mv.amount);
        else pump();
      };
      botThinkTimer = setTimeout(botActNow, fastForward ? 0 : 650 + Math.random() * 750);
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

          pot: (function () { try { return table.potTotal(); } catch { return 0; } })(),

          hc: (typeof handClass === 'function')
            ? handClass(table.players[0].hole, table.community) : null
        });
        pendingAdvice = null;
      }
    }
    if (handRec) recordHandAction(handRec, table, e);

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

    var ids = [];
    e.winners.forEach(function (w) {
      if (w.uncalled) return;
      if (w.idx !== undefined) ids.push(w.idx);
      else (w.winners || []).forEach(function (i) { ids.push(i); });
    });
    return ids.indexOf(0) !== -1;
  }

  function onHandEnd(e) {
    UI.disableControls();

    var won = heroWon(e);
    var wonByFold = e.winners.some(function (w) {
      if (!w.byFold) return false;
      var ids = (w.idx !== undefined) ? [w.idx] : (w.winners || []);
      return ids.indexOf(0) !== -1;
    });
    var recap = null;
    try { recap = coachRecap(e.handNo, won, wonByFold); } catch (e) { quiet(e); }
    UI.coachTip(recap ? recap.html : null);
    setTurnStatus('', false);
    var hero = table.players[0];
    var revealed = {};
    (e.revealed || []).forEach(function (r) { revealed[r.idx] = true; });
    var winnerIdx = [];
    e.winners.forEach(function (w) {
      (w.winners || [w.idx]).forEach(function (i) { if (winnerIdx.indexOf(i) === -1) winnerIdx.push(i); });
    });

    var bits = [];
    e.winners.forEach(function (w) {
      var names = (w.winners || [w.idx]).map(function (i) {
        return table.players[i].isHero ? 'You' : table.players[i].name;
      }).join(' & ');
      var potLabel = (w.potIndex == null || w.potIndex === 0) ? 'Main pot' : 'Side pot ' + w.potIndex;
      var verb = names === 'You' ? 'win' : (names.indexOf('You') === 0 ? 'win' : 'wins');
      var takeVerb = names.indexOf('You') === 0 ? 'take' : 'takes';
      if (w.uncalled) bits.push(names + ' ' + takeVerb + ' ' + UI.fmt(w.amount) + ' back (uncalled bet)');
      else if (w.byFold) bits.push(names + ' ' + verb + ' ' + UI.fmt(w.amount));
      else bits.push(potLabel + ': ' + names + ' ' + verb + ' ' + UI.fmt(w.each || w.amount) +
        ' <span class="wsub"> ' + UI.escapeHtml(w.hand || '') + '</span>');
    });
    var title;
    if (won) {

      title = '🏆 You win ' + UI.fmt(UI.handWinAmount(e)) + '!';
    } else {
      title = '😤 ' + winnerIdx.map(function (i) { return table.players[i].isHero ? 'You' : table.players[i].name; }).join(' & ') + ' take' + (winnerIdx.length > 1 ? '' : 's') + ' ' + UI.fmt(e.pot);
    }
    UI.winnerBanner('<div class="wtitle">' + title + '</div><div class="wsub">' + bits.join('<br>') + '</div>');
    UI.log('<span class="hl-win">' + bits.join(' · ') + '</span>');

    var winnerLine = null;
    var mainWin = e.winners.filter(function (w) { return !w.uncalled; })[0];
    if (mainWin) {
      var mwNames = (mainWin.winners || [mainWin.idx]).map(function (i) {
        return table.players[i].isHero ? 'You' : table.players[i].name;
      }).join(' & ');
      if (mainWin.hand) winnerLine = '🏆 ' + mwNames + ' won with ' + mainWin.hand;
      else if (mainWin.byFold) winnerLine = '🏆 ' + mwNames + ' won — everyone else folded';
    }

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
    } catch (e) { quiet(e); }

    var heroShow = false;
    function renderEndTable() {
      if (!table) return;
      UI.renderTable(table, {
        lastActions: {}, winners: winnerIdx, revealed: revealed,
        acting: -1, button: table.button, handEnd: true, heroShow: heroShow
      });

      try { UI.highlightWin(table, e.winners); } catch (e) { quiet(e); }

      var hdEl = document.getElementById('hero-hand-desc');
      if (hdEl && winnerLine) hdEl.textContent = winnerLine;
    }
    renderEndTable();

    try {
      var wonSet = {};
      winnerIdx.forEach(function (i) { wonSet[i] = true; });
      var showdown = !e.winners.some(function (w) { return w.byFold; });
      table.players.forEach(function (p, i) {
        if (p.isHero) return;
        var arch = p.archetype || {};
        var prone = (typeof arch.tiltProne === 'number') ? arch.tiltProne : 0.5;
        var t = p.tilt || 0;
        t = Math.max(0, t - 0.12);
        if (wonSet[i]) t = Math.max(0, t - 0.25);
        else {
          if (showdown && revealed[i] && p.hole.length === 2) {

            var ms = madeStrength(p.hole, table.community);
            if (ms >= 0.72) t += 0.38 * prone;
            else if (ms >= 0.55) t += 0.15 * prone;
          }
          if (e.pot >= table.bb * 30) t += 0.15 * prone;
          if (p.stack <= 0) t += 0.30 * prone;
        }
        p.tilt = Math.max(0, Math.min(1, t));
      });
    } catch (e) { quiet(e); }

    try { botThinkingNotes(e); } catch (e) { quiet(e); }

    var profit = hero.stack - handCtx.startStack;
    lastHeroEndStack = hero.stack;
    if (handRec) {
      if (recap) handRec.coachNotes = recap.lines;
      finishHandRecord(handRec, table, e, profit);
      saveHandRecord(handRec);
      handRec = null;
    }

    var resultText = won ? ('Won ' + UI.fmt(UI.handWinAmount(e))) : 'Lost';
    if (!won && e.winners.length && e.winners[0].hand) resultText = e.winners[0].hand;

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
          return { id: a.id, name: p.name, emoji: a.emoji };
        }),
      heroStackBB: hero.stack / table.bb, potBB: e.pot / table.bb, resultText: resultText
    });
    refreshBankroll();

    saveSession();

    if (fastForward) {
      setTimeout(function () {
        if (!table) return;
        if (awayFromTable) { pendingNextHand = true; return; }
        prepareNextHand();
      }, 600);
    } else {

      UI.showHandEndControls({
        autoMs: 13000,
        onNext: function () { if (table) prepareNextHand(); },
        onShowHero: hero.folded ? function () { heroShow = true; renderEndTable(); } : null
      });
    }
  }

  function skipHand() {
    if (!table) return;
    var hero = table.players[0];
    if (waitingForHero && hero && !hero.folded && hero.hole.length === 2) {
      try { table.act(0, 'fold'); } catch {  }
      waitingForHero = false;
      UI.disableControls();
      UI.coachTip(null);
    }

    var nx = document.getElementById('btn-next-hand');
    if (nx) { nx.click(); return; }
    fastForward = true;

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

  function prepareNextHand() {
    if (gameMode === 'tourney') {

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

      var blindEvery = Math.max(2, cfg.blindInterval || 8);
      if (table.handNo % blindEvery === 0) {
        tourney.levelIdx = Math.min(tourney.levelIdx + 1, TOUR_LEVELS.length - 1);
        var lv = TOUR_LEVELS[tourney.levelIdx];
        table.setBlinds(lv.sb, lv.bb, lv.ante);
        UI.log('⏫ Blinds up! Now ' + UI.fmt(lv.sb) + '/' + UI.fmt(lv.bb) + (lv.ante ? ' ante ' + lv.ante : ''), 'hl-pot');
      }
    } else {

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

            { label: 'Rebuy', primary: true, cb: function () { h.stack = cfg.stack; h.rebuys = (h.rebuys || 0) + 1; sessionStartChips = cfg.stack; lastHeroEndStack = cfg.stack; refreshBankroll(); dealNext(); } }
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

  function tourneyPayoutHtml() {
    if (!tourney || !tourney.placements) return '';
    var total = table.players.length;
    var pool = total * (cfg.stack || 1000);

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

    UI.setControls(cfgCtl);

    $('btn-fold').onclick = function () { heroAct('fold'); };
    $('btn-checkcall').onclick = function () { heroAct(toCall > 0 ? 'call' : 'check'); };
    $('btn-betraise').onclick = function () {
      var isRaise = table.currentBet > 0;
      var minTo = isRaise ? legal.minRaiseTo : legal.minBetTo;
      UI.openBetPanel(minTo, legal.maxRaiseTo, table.potTotal(), isRaise, function (amt) {
        heroAct(isRaise ? 'raise' : 'bet', amt);
      }, { roundBets: !!(cfg && cfg.roundBets), currentBet: table.currentBet });
    };
    $('btn-allin').onclick = function () {
      var p = table.players[0];
      var to = p.bet + p.stack;
      if (to <= table.currentBet) heroAct('call');
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

    try {
      table.act(0, a, amount);
    } catch (err) {
      UI.log('⚠️ That amount didn\'t go through (' + UI.escapeHtml(err.message) + ') — try again.', 'hl-leak');
      waitingForHero = true;
      enableHeroControls();
    }
  }

  function detectLeak(a) {
    try {

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
    } catch {  }
    return null;
  }

  function pct(x) { return Math.round(x * 100) + '%'; }

  function liveOpponents() {
    var live = [];
    for (var i = 1; i < table.players.length; i++) {
      var pl = table.players[i];
      if (!pl.folded && !pl.sittingOut) live.push(pl);
    }
    return live;
  }

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

  function opponentReads() {

    var live = liveOpponents();
    if (!live.length) return '';
    var reads = live.map(function (p) {
      var A = p.archetype, name = UI.escapeHtml(p.name);
      var tag = (A && A.tagline) ? String(A.tagline) : 'unknown style';
      return '<b>' + name + '</b> — ' + UI.escapeHtml(tag);
    });

    return '<div class="coach-opps">🎯 Table:<br>• ' + reads.join('<br>• ') + '</div>';
  }

  function isSuited(hole) {
    return hole.length === 2 && hole[0].s === hole[1].s;
  }
  function isMultiway() {
    return liveOpponents().length >= 3;
  }

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

  function scareCardRank() {
    var c = table.community;
    if (!c.length) return null;
    var last = c[c.length - 1], prevMax = 0;
    for (var i = 0; i < c.length - 1; i++) prevMax = Math.max(prevMax, c[i].r);
    return (last.r >= 11 && last.r > prevMax) ? rankName(last.r) : null;
  }

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

  function preflopRaiseCount() {
    var raises = 0;
    if (handRec && handRec.timeline) handRec.timeline.forEach(function (t) {
      if (t.t === 'action' && t.street === 'preflop' &&
          (t.action === 'bet' || t.action === 'raise')) raises++;
    });
    return raises;
  }
  function preflopSpot() {
    var legal = table.legalActions(0);
    if (legal.toCall === 0) return 'open';
    var raises = preflopRaiseCount();
    if (raises <= 1) return 'facing-open';
    if (raises === 2) return 'facing-3bet';
    return 'facing-4bet+';
  }

  function villainTighty(A) {
    A = A || {};
    var t = A.openTier || 3;
    return 1 - (t - 1) / 5;
  }

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

  function estimateVillainRange(idx) {
    var p = table.players[idx];
    var A = (p && p.archetype) || {};
    var label = 'unknown', strength = 0.5, actions = 0;
    var neverRaises = (A.id === 'nathan' || A.id === 'rohan');
    if (handRec && handRec.timeline) handRec.timeline.forEach(function (t) {
      if (t.t !== 'action' || t.player !== idx) return;
      actions++;
      var size = t.bet || t.amount || 0, pot = t.pot || 1;

      var ratio = size / Math.max(1, pot - size);
      if (t.street === 'preflop') {
        if (t.action === 'raise' || t.action === 'bet') {
          label = 'strong'; strength = Math.max(strength, 0.75);
        } else if (t.action === 'call') {

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
        label = 'capped'; strength = 0.45;
      }
    });

    return { label: label, strength: strength, actions: actions };
  }

  function concreteRangeRead(V, range) {
    if (!V || !range || range.label === 'unknown') return '';
    var name = V.isHero ? 'You' : V.name;
    var A = V.archetype || {};
    var wet = false;
    try { wet = boardTexture(table.community) === 'wet'; } catch { wet = false; }
    var bluffy = villainBluffy(A), tight = villainTighty(A);
    switch (range.label) {
      case 'capped':
        return wet
          ? name + "'s range is capped: mostly one pair or a draw — a monster would usually raise on this draw-heavy board."
          : name + "'s range is capped: medium pairs and decent hands, no monster — premiums would have re-raised.";
      case 'strong':
        if (A.id === 'lag')
          return name + ' shows strength, but his big raises are wide — pressure plays are in there too, not just monsters.';
        return tight > 0.6
          ? name + ' shows strength — and from a tight player that almost always means a big hand: a strong pair or better.'
          : name + ' shows strength: likely a strong pair, two pair, or a big draw.';
      case 'polarized':
        return bluffy > 0.5
          ? name + "'s range is either a monster or a bluff — and he bluffs enough that you can't fold everything."
          : name + "'s range is either a monster or a bluff — but he rarely bluffs, so weight it heavily toward a monster.";
      case 'wide':
        return name + ' plays a wide range, so this barely narrows him down: pairs, draws, and some air are all in there.';
    }
    return '';
  }

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

  function handClass(hole, community) {
    var d = detectDraws(hole, community);
    var ev = (hole.length + community.length >= 5) ? evaluate7(hole.concat(community)) : null;
    if (ev && ev.cat >= 4) {

      var boardOnly = (ev.best5 || []).every(function (c) {
        return !hole.some(function (h) { return h.r === c.r && h.s === c.s; });
      });
      if (boardOnly) return 'board';
      return 'nut';
    }
    if (d.flushDraw && d.oesd) return 'draw-strong';
    if (ev) {
      if (ev.cat === 3 || ev.cat === 2) return 'overpair';
      if (ev.cat === 1) {
        var pr = ev.kickers[0];

        var heroHasPair = hole.some(function (c) { return c.r === pr; });
        if (!heroHasPair) return 'air';
        var boardRanks = community.map(function (c) { return c.r; }).sort(function (a, b) { return b - a; });
        var bmax = boardRanks[0], bsecond = boardRanks[1];
        if (pr > bmax) return 'overpair';
        if (pr === bmax) return 'toppair';
        if (pr === bsecond) return 'secondpair';
        return 'weakpair';
      }
    }
    if (d.flushDraw || d.oesd) return 'draw';
    if (d.gutshot) return 'draw-weak';
    return 'air';
  }

  function handClassName(hc) {
    return { nut: 'the nuts', overpair: 'an overpair', toppair: 'top pair',
      secondpair: 'second pair', weakpair: 'a weak pair', 'draw-strong': 'a monster draw', draw: 'a draw',
      'draw-weak': 'a weak draw', air: 'nothing',
      board: 'the board (your cards don\'t improve it)' }[hc] || 'your hand';
  }

  function betCallAhead() {
    var sawAggro = false, sawCall = false;
    if (handRec && handRec.timeline) handRec.timeline.forEach(function (t) {
      if (t.t !== 'action' || t.street !== table.street || t.player === 0) return;
      if (t.action === 'bet' || t.action === 'raise') sawAggro = true;
      else if (t.action === 'call' && sawAggro) sawCall = true;
    });
    return sawAggro && sawCall;
  }

  function countLimpers() {
    var n = 0, raised = false;
    if (handRec && handRec.timeline) handRec.timeline.forEach(function (t) {
      if (t.t !== 'action' || t.street !== 'preflop') return;
      if (t.action === 'raise' || t.action === 'bet') raised = true;

      if (t.action === 'call' && !raised) n++;
    });
    return n;
  }

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

  function boardTexture(community) {
    if (community.length < 3) return 'dry';
    var suits = [0, 0, 0, 0];
    community.forEach(function (c) { suits[c.s]++; });

    if (suits.some(function (n) { return n >= 4; })) return 'completed';
    if (suits.some(function (n) { return n === 3; })) return 'wet';

    var seen = {};
    community.forEach(function (c) { seen[c.r] = true; });
    var rs = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
    for (var i = 0; i + 2 < rs.length; i++) {
      if (rs[i + 2] - rs[i] <= 4) return 'wet';
    }
    return 'dry';
  }

  function rangeAwareEquityPreflop(hole, maxTier) {
    return estimateEquityVsRange(hole, Math.min(6, Math.max(1, maxTier || 3)), 150);
  }

  function mkVerdict(advice, strength, msg, lesson) {
    return { advice: advice, strength: strength, msg: msg, lesson: lesson || '', html: null };
  }

  function textLen(html) {
    return String(html).replace(/<[^>]*>/g, '').length;
  }

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

      var isMultiLimp = table.street === 'preflop' && countLimpers() >= 3;

      var limpedMulti = table.street === 'preflop' && table.currentBet <= table.bb && isMultiway();

      var multiwayNoAggro = isMultiway() && table.street !== 'preflop' &&
        !(V && (V.bet || 0) > 0);
      var tail = (isMultiLimp || limpedMulti || multiwayNoAggro) ? '' : villainLine(V);

      var posPhrase = { 'button': 'on the button', 'cutoff': 'in the cutoff', 'small blind': 'in the small blind', 'big blind': 'in the big blind', 'early position': 'in early position', 'middle position': 'in middle position' }[posName] || ('in ' + posName);
      var posNote = ' <span class="coach-pos">📍 You\'re ' + esc(posPhrase) + '.</span>';
      var stageNote = tourneyStageTip();
      var multiNote = multiwayNote();

      var reads = coachDecisions.length === 0 ? opponentReads() : '';
      if (v.msg) {
        var budget = reads ? 800 : 480;
        var extras = '';
        var baseLen = textLen(v.msg + tail + posNote + reads);
        if (baseLen + textLen(stageNote) <= budget) extras += stageNote;
        if (baseLen + textLen(extras + multiNote) <= budget) extras += multiNote;
        v.html = v.msg + tail + posNote + extras + reads;
      } else {
        v.html = null;
      }
      return v;
    } catch (err) {

      if (window.__coachDebug || /[?&]coachdebug=1/.test(location.search)) {
        console.error('[coach] verdict failed:', err);
        if (typeof UI !== 'undefined' && UI.log) {
          UI.log('🐛 Coach error: ' + (err && err.message), 'hl-leak');
        }
      }
      return { advice: null, strength: 'marginal', msg: '', lesson: '', html: null, error: String(err && err.message) };
    }
  }

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
      handClass: handClass,
      boardTexture: boardTexture,
      estimateVillainRange: estimateVillainRange,
      preflopSpot: preflopSpot,
      preflopRaises: preflopRaiseCount,

      testScenario: function (name) {
        try {
          var v = coachVerdict();
          return { scenario: name, advice: v.advice, html: v.html, error: v.error || null,
                   rendered: !!v.html };
        } catch (err) {
          return { scenario: name, error: String(err && err.message), rendered: false };
        }
      },

      enableDebug: function () { window.__coachDebug = true; return 'coach debug on'; }
    };
  } catch (e) { quiet(e); }

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

  function coachRecap(handNo, won, wonByFold) {
    var good = null, bad = null;
    coachDecisions.forEach(function (d) {
      if (d.strength !== 'strong' || !d.lesson) return;

      if (d.followed && (!good || (d.pot || 0) >= (good.pot || 0))) good = d;
      else if (!d.followed && (!bad || (d.pot || 0) >= (bad.pot || 0))) bad = d;
    });

    if (!good && !bad && !won) {
      var h0 = '<div class="coach-recap-title">Hand #' + UI.escapeHtml(String(handNo)) + ' recap</div>';
      h0 += '<div class="coach-recap-good">Tough loss — sometimes the cards don\'t cooperate. Review the hand history to spot where it slipped away.</div>';
      return { html: h0, lines: ['- tough loss, no specific leak recorded'] };
    }
    var lines = [];

    if (won && wonByFold) {
      var isSemi = bad && (bad.hc === 'draw-strong' || bad.hc === 'draw');
      var isIso = bad && bad.action === 'raise' && bad.advice === 'fold' && bad.street === 'preflop';
      var winMsg;
      if (good) winMsg = 'Well played — ' + good.lesson + ' Everyone folded. 🎉';
      else if (isSemi) winMsg = 'Nice semi-bluff! 🎉 Your draw + aggression took it down.';
      else if (isIso) winMsg = 'Nice iso-raise! 🎉 You punished the limpers and took the dead money.';
      else winMsg = 'Nice aggression! 🎉 Everyone folded — you took it down.';
      lines.push({ kind: 'good', text: winMsg });
    } else if (won && !good && bad) {

      lines.push({ kind: 'good', text: 'You won the hand! 🎉 Your play got through.' });
    } else if (good && won) {
      lines.push({ kind: 'good', text: 'Well played — ' + good.lesson });
    } else if (good && !won && !bad) {

      lines.push({ kind: 'good', text: 'Tough loss — you stuck to the plan on the key decision. Sometimes the cards don\'t cooperate.' });
    }

    if (bad && !(won && wonByFold)) {
      var prefix = (won && !good) ? 'One thing to tighten up: ' : 'To improve: ';
      lines.push({ kind: 'bad', text: prefix + 'coach said ' + bad.advice +
        ', you went ' + bad.action + (bad.street ? ' (' + bad.street + ')' : '') + '. ' + bad.lesson });
    }

    if (!lines.length) {
      lines.push({
        kind: 'good',
        text: won
          ? 'You won the hand! 🎉 Nice work taking down the pot.'
          : 'Hand over — review the history to spot the key decision.'
      });
    }
    var h = '<div class="coach-recap-title">Hand #' + UI.escapeHtml(String(handNo)) + ' recap</div>';
    lines.forEach(function (l) {
      h += '<div class="coach-recap-' + l.kind + '">' +
        (l.kind === 'good' ? '✅ ' : '📌 ') + UI.escapeHtml(l.text) + '</div>';
    });
    return { html: h, lines: lines.map(function (l) { return (l.kind === 'good' ? '+ ' : '- ') + l.text; }) };
  }

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

  function multiwayNote() {
    if (table.street !== 'preflop') {
      var n = table.livePlayers().length;
      if (n >= 4) return ' <span class="coach-multi">👥 ' + n + '-way pot — bluffs rarely work multiway; bet only for value.</span>';
      return '';
    }
    var limps = countLimpers();

    if (limps >= 3 && table.currentBet <= table.bb)
      return ' <span class="coach-multi">👥 ' + limps + ' limpers in the pot (' + UI.fmt(table.potTotal()) + ' dead money) — great spot to raise and take it down.</span>';
    return '';
  }

  function tourneyRiskPremium(effBB) {
    if (gameMode !== 'tourney') return 0;
    if (effBB <= 12) return 0.12;
    if (effBB <= 20) return 0.08;
    if (effBB <= 35) return 0.04;
    return 0;
  }
  function riskPremiumNote(rp) {
    return rp > 0 ? ' <span class="coach-icm">Tournament: tighten up — chips are worth more than face value near pay jumps.</span>' : '';
  }

  var PF_POS_MAP = { 'button': 'BTN', 'small blind': 'SB', 'big blind': 'BB',
    'cutoff': 'CO', 'middle position': 'MP', 'early position': 'UTG' };
  function heroIsBigStack() {
    var top = 0;
    table.players.forEach(function (p) {
      if (!p.sittingOut && p.stack > top) top = p.stack;
    });
    return table.players[0].stack >= top * 0.9 && top > 0;
  }

  function heroFlushBlocker() {
    var hero = table.players[0];
    var suits = {};
    table.community.forEach(function (c) { suits[c.s] = (suits[c.s] || 0) + 1; });
    return Object.keys(suits).some(function (s) {
      return suits[s] >= 3 && hero.hole.some(function (c) { return c.s === +s && c.r === 14; });
    });
  }

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

    var ss = coachShortStack(c);
    if (ss) return ss;

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

    if (spot === 'facing-3bet') {
      var effBB3 = effStackBB(vIdx);
      if (tier === 1) {
        if (legal.canRaise) {
          var fourTo = Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round(table.currentBet * 2.3)));
          return mkVerdict('raise', 'strong',
            'They <b>re-raised</b> in front of you. With ' + c.nmHtml + ', <b>raise again</b> to ~<b>' + fmt(fourTo) + '</b> — build the pot while you\'re likely ahead.',
            'Facing a re-raise with a premium: raise again for value, about 2.3× their raise.');
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
            '<b>Call</b> — you\'re hunting three of a kind, and stacks are deep enough that one hit pays for all the misses.',
            'You can call re-raises with small pairs only when ~15× the call sits behind.');
        return mkVerdict('fold', 'strong',
          '<b>Fold</b> — too shallow to chase a set against a re-raise. The implied odds aren\'t there.',
          'Folding small pairs to re-raises when shallow is disciplined, not weak.');
      }
      if (tier <= 4 && inPos && effBB3 >= 30)
        return mkVerdict('call', 'marginal',
          '<b>Call</b> in position — your hand flops well and you\'re deep. Re-evaluate on the flop.',
          'Calling re-raises in position with playable hands is fine when deep.');
      return mkVerdict('fold', 'strong',
        '<b>Fold</b> — ' + c.nmHtml + ' plays terribly against a re-raise. Tight players fold these.',
        'Fold hands like AJo and KQo to re-raises: when called, you\'re usually dominated.');
    }

    if (spot === 'facing-4bet+') {
      if (tier === 1)
        return mkVerdict(legal.canRaise ? 'raise' : 'call', 'strong',
          legal.canRaise
            ? 'They re-raised again. With ' + c.nmHtml + ' you\'re committed — <b>shove</b> or call it off.'
            : 'They shoved. With ' + c.nmHtml + ', <b>call</b> — folding a premium to one shove burns money.',
          'Against a second re-raise only the very best hands continue — everything else folds.');
      return mkVerdict('fold', 'strong',
        '<b>Fold</b> — a second re-raise at these stakes is almost always the nuts.',
        'Respect second re-raises: players don\'t bluff them often enough to call light.');
    }

    var nRaises = preflopRaiseCount();
    if (nRaises === 0 && countLimpers() > 0) {
      if (tier <= 2)
        return mkVerdict('raise', 'strong',
          c.nmHtml + ' — limpers are weak. <b>Raise 4×</b> to isolate one of them and play for stacks.',
          'Isolate limpers with premiums: raise big, play heads-up, stack them.');
      if (tier <= 3 && inPos)
        return mkVerdict('raise', 'marginal',
          '<b>Raise 4×</b> to isolate — limpers rarely have much, and you have position.',
          'Attack limpers from late position; they fold or play bloated pots out of position.');

      if (countLimpers() >= 3 && (posName === 'button' || posName === 'cutoff') && tier <= 5)
        return mkVerdict('raise', 'marginal',
          'You can <b>raise 4×</b> to punish the limpers — ' + countLimpers() + ' limpers means ' +
          UI.fmt(table.potTotal()) + ' of dead money. Or call behind; both are fine. Mix in the raise sometimes.',
          'Iso-raising limpers is a profitable option: dead money plus position makes it winning long-term, but don\'t feel forced — calling behind is fine too.');

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

    var open = table.currentBet;
    var need = toCall / (pot + toCall);
    var multiway = isMultiway();
    var suited = isSuited(hero.hole);

    if (tier >= 6) {
      return mkVerdict('fold', 'strong',
        '<b>Fold</b> — ' + c.nmHtml + ' is trash. Don\'t pay to see a flop with it.',
        'The worst hands lose money even when the math looks close — they\'re hard to play and often dominated.');
    }

    if (tier <= 2 && legal.canRaise) {
      var mult = inPos ? 3 : 4;
      var three = Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round(open * mult)));
      return mkVerdict('raise', 'strong',
        '<b>Re-raise</b> ' + c.nmHtml + ' to ~<b>' + fmt(three) + '</b> (' + mult + '× their open' +
        (inPos ? ') — you have position' : ') — out of position, size up to charge them') +
        '. You\'re usually ahead, so build the pot now.',
        'Re-raise premiums for value: 3× in position, 4× out of position.');
    }

    if (isSmallPair(hero.hole)) {
      if (toCall * 15 <= effStackChips(vIdx) && effStackBB(vIdx) >= 12)
        return mkVerdict('call', 'marginal',
          'Call <b>' + fmt(toCall) + '</b> — hunting three of a kind: ' + Math.round(effStackBB(vIdx)) + 'bb deep is plenty to get paid when you hit.',
          'Set-mining needs about 15× the call behind: you miss the set most flops.');
      return mkVerdict('fold', 'strong',
        '<b>Fold</b> the small pair — only ' + Math.round(effStackBB(vIdx)) + 'bb deep, not enough behind to get paid on the rare set.',
        'Don\'t chase sets short-stacked: the math only works with deep money behind.');
    }

    var hasAce = hero.hole.some(function (x) { return x.r === 14; });
    if (tier >= 4 && hasAce && suited && legal.canRaise && V &&
        villainFoldy(V.archetype) > 0.5 && !multiway)
      return mkVerdict('raise', 'marginal',
        'Mix in a <b>bluff re-raise</b> sometimes: your ace makes aces and ace-king less likely for them, and ' + vName + ' folds too much.',
        'Only bluff re-raise when they fold a lot — never into multiple players.');

    var vOpenTier = (V && V.archetype && V.archetype.openTier) || 3;
    var eq = rangeAwareEquityPreflop(hero.hole, vOpenTier);
    var effBB = effStackBB(vIdx);
    var stubborn = V && V.archetype ? (V.archetype.stubborn || 0.5) : 0.5;
    var credit = impliedCredit({
      draw: suited && tier <= 4, smallPair: false, effStackBB: effBB,
      villainStubborn: stubborn, inPosition: inPos
    });
    var tight = V ? villainTighty(V.archetype) : 0.4;
    var debit = (tier === 3 && !suited && tight > 0.6) ? 0.05 : 0;
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
      : { label: 'unknown', strength: 0.5, actions: 0 };

    var noAggro = isMultiway() && !(V && (V.bet || 0) > 0);
    var rangeNote = (V && range.label !== 'unknown' && !noAggro)
      ? ' ' + concreteRangeRead(V, range) : '';
    var anyDraw = (hc === 'draw-strong' || hc === 'draw' || hc === 'draw-weak');

    if (toCall === 0) {

      if (hc === 'board')
        return mkVerdict('check', 'strong',
          '<b>Check</b> — your cards don\'t improve the board at all, so everyone already has at least a split. ' +
          'Betting can\'t get called by a worse hand (none exists), and a bluff can\'t fold out a chop.' + rangeNote,
          'When you play the board, just check: there\'s no value to extract and no fold to win.');

      var vManiac = V && villainBluffy(V.archetype) > 0.6 &&
        (V.archetype.aggression || 0) > 0.5;

      if ((hc === 'nut' || hc === 'overpair' || hc === 'toppair') && canBet) {
        if (vManiac)
          return mkVerdict('check', 'marginal',
            '<b>Check</b> your monster — ' + vName + ' bluffs constantly. Let them bet into you, then raise.' + rangeNote,
            'Against maniacs, trap strong hands: they build the pot for you.');
        var tex = boardTexture(table.community);

        var frac = tex === 'wet' ? 0.67 : 0.25;
        if (foldy < 0.25) frac = 0.75;
        var betSize = Math.max(1, Math.round(pot * frac));

        var heroStack = hero.stack;
        var sprLine;
        if (commit === 'commit' && betSize < heroStack * 0.7) {
          betSize = heroStack;
          sprLine = ' You\'re committed — just get it all in.';
          return mkVerdict('bet', 'strong',
            '<b>All-in</b> (' + fmt(betSize) + ').' + sprLine + rangeNote,
            'When you\'re committed with a strong hand, shove — don\'t bet small and give free cards.');
        }
        sprLine = (commit === 'commit')
          ? ' The pot\'s already big compared to your stacks — you\'re all-in anyway, so get the money in.'
          : '';
        var fracLabel = frac === 0.75 ? '¾' : (frac === 0.67 ? '⅔' : '¼');
        var whyBet = tex === 'wet' ? ' — lots of draws out there, make them pay to chase'
          : (frac === 0.75 ? ' — they never fold, so size up for value'
          : ' — dry board, few draws: bet small to keep worse hands calling');
        return mkVerdict('bet', 'strong',
          '<b>Bet for value</b> ~' + fracLabel + ' pot (' + fmt(betSize) + ')' +
          whyBet + '.' + sprLine + rangeNote,
          'Bet your strong hands; bet bigger when draws are possible so they pay to chase.');
      }

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

      if (hc === 'weakpair') {
        return mkVerdict('check', 'strong',
          '<b>Check</b> — ' + handClassName(hc) + ' is rarely best here. Don\'t throw good money after bad.' + rangeNote,
          'Third pair or worse has little value — check and give up if there\'s action. Sometimes you have to let go.');
      }

      if (canBet) {
        var scare = scareCardRank();

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

    var need2 = toCall / (pot + toCall);
    var tell = V ? villainSizingTell(vIdx) : null;

    var tight = V ? villainTighty(V.archetype) : 0.4;
    var bluffy = V ? villainBluffy(V.archetype) : 0.3;
    var rangeAdjust = 0;

    var polarStrong = range.label === 'polarized' && (tight > 0.6 || bluffy < 0.25);
    if (range.label === 'polarized' && !polarStrong) rangeAdjust -= 0.02;
    if (range.label === 'wide' || bluffy > 0.55) rangeAdjust -= 0.06;
    if (range.label === 'capped') rangeAdjust -= 0.03;
    if (multiway && betCallAhead()) rangeAdjust += 0.05;

    var rangeEqTier = polarStrong ? 2 : (range.label === 'strong' ? 3 : 0);
    var eq2 = rangeEqTier
      ? estimateEquityVsRangePostflop(hero.hole, table.community, rangeEqTier, 150)
      : estimateEquity(hero.hole, table.community, Math.min(3, table.livePlayers().length - 1), 150);

    var effBB = effStackBB(vIdx);
    var stubborn = V && V.archetype ? (V.archetype.stubborn || 0.5) : 0.5;
    var credit = impliedCredit({ draw: anyDraw, smallPair: false, effStackBB: effBB,
      villainStubborn: stubborn, inPosition: inPos });
    var debit = rioPenalty({ nutDraw: isNutFlushDraw(hero.hole, table.community) || !anyDraw,
      villainTight: tight, multiway: multiway });
    var adjEq = Math.max(0, Math.min(1, eq2 + credit - debit));

    if (commit === 'commit' && (hc === 'nut' || hc === 'overpair' || hc === 'toppair') && toCall < effChips)
      return mkVerdict('call', 'strong',
        'The pot\'s huge compared to what\'s left. With ' + handClassName(hc) +
        ' you\'re <b>committed: call</b>.' + rangeNote,
        'When the pot is big and your hand is strong, don\'t fold — you\'re already in too deep.');

    if (tell && tell.unit === 'pot') {
      if (tell.size === 'small' && legal.canRaise && !multiway &&
          (hc === 'nut' || hc === 'overpair' || hc === 'toppair' || anyDraw))
        return mkVerdict('raise', 'marginal',
          'That\'s a tiny bet — usually a marginal hand begging for a cheap showdown. <b>Raise</b> and take it away.' + rangeNote,
          'Small bets often mean weakness: attack them.');

      if (tell.size === 'overbet' && tight > 0.6 && hc !== 'nut' &&
          !(V && V.archetype && V.archetype.wideOverbet))
        return mkVerdict('fold', 'strong',
          '<b>Fold</b> — an overbet from a tight player is almost always the nuts. Don\'t pay it off.' + rangeNote,
          'Respect overbets from tight players: it\'s the nuts far more often than a bluff.');
    }

    if (hc === 'board')
      return mkVerdict('fold', 'strong',
        '<b>Fold</b> — your cards don\'t improve the board at all: the best five are already out there, ' +
        'so everyone is guaranteed at least a split. Nobody can hold a worse hand than you, which means raising ' +
        'can never get called by worse — and a bet on this board is never a bluff, since a bluff can\'t fold out ' +
        'a chop.' + (tight > 0.6 ? ' From a tight player this is a Queen or a Seven far more often than a split.' : '') +
        ' Don\'t pay ' + fmt(toCall) + ' to usually lose.' + rangeNote,
        'When the board plays itself, your cards add nothing: at best you split, and anyone betting usually has you beat. Fold and save your chips.');

    if (hc === 'nut' && legal.canRaise)
      return mkVerdict('raise', 'strong',
        '<b>Raise for value</b> (~3× their bet) — charge the draws and worse hands now, don\'t slow-play.' + rangeNote,
        'With the near-nuts, raise: every street you don\'t build the pot costs money.');
    if ((hc === 'draw-strong' || hc === 'draw') && legal.canRaise && foldy > 0.4 && !multiway)
      return mkVerdict('raise', 'marginal',
        '<b>Raise</b> sometimes: you win if they fold, or about ' + pct(adjEq) + ' of the time if they call. Otherwise just call ' +
        fmt(toCall) + '.' + rangeNote,
        '');

    var rp2 = tourneyRiskPremium(effBB);
    var threshold = need2 + rangeAdjust + rp2;

    var riverPrior = (table.street === 'river' && bluffy <= 0.55) ? 0.03 : 0;
    threshold += riverPrior;

    var strongAdj = rangeAdjust > 0.005;

    var eqSource = rangeEqTier
      ? (strongAdj

        ? '150 Monte Carlo simulations'
        : 'simulated 150× vs ' + vName + '\'s strong range')
      : 'simulated 150× vs random hands' +
        (rangeAdjust < -0.005 ? ', raised for their looseness' : '');

    var mathLine = 'Pot odds: calling <b>' + fmt(toCall) + '</b> to win <b>' + fmt(pot) + '</b> — ' +
      'need <b>' + pct(need2) + '</b> to break even' +
      (strongAdj ? ', <b>' + pct(threshold) + '</b> vs ' + vName + '\'s strong range' : '') +
      (rp2 > 0 ? ' (a bit more in tournaments)' : '') +
      (riverPrior > 0 ? ' (rivers are under-bluffed)' : '') +
      '. You win about <b>' + pct(adjEq) + '</b>' +
      ' (' + eqSource + '). ' +
      riskPremiumNote(rp2);

    var bluffCatchNote = (hc === 'air' && toCall > 0)
      ? " Bluff-catching = calling hoping they're bluffing — only works vs bluffers."
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
    if (!bots.length) bots = [botById('lag')];

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
      tourney = { levelIdx: 0, placements: [] };
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
    } catch {  }
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
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { quiet(e); }
  }

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
    } catch {  }
  }

  function resumeSession() {
    var s = loadSession();
    if (!s) return;
    mode = s.mode; gameMode = s.mode;
    Object.keys(s.cfg || {}).forEach(function (k) { cfg[k] = s.cfg[k]; });

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

    table.players[0].stack = Math.max(0, heroStack);
    bots.forEach(function (b, i) {
      var tp = table.players[i + 1];
      tp.stack = Math.max(0, players[i + 1]._resumeStack);
      if (s.players[i + 1] && s.players[i + 1].sittingOut) tp.sittingOut = true;
    });
    table.handNo = s.handNo || 0;
    if (gameMode === 'tourney') {
      TOUR_LEVELS = tourLevels();
      tourney = { levelIdx: Math.min(s.levelIdx || 0, TOUR_LEVELS.length - 1) };
      var lv = TOUR_LEVELS[tourney.levelIdx];
      table.setBlinds(lv.sb, lv.bb, lv.ante);
    } else tourney = null;
    beginTableSession();
    UI.log('↻ Resumed session — hand #' + (table.handNo + 1) + ' continues with saved stacks.');
  }

  function beginTableSession() {
    sessionStartChips = table.players[0].stack;
    lastHeroEndStack = undefined;
    refreshBankroll();
    evtQueue = []; pumping = false; waitingForHero = false;
    UI.buildSeats();
    UI.showScreen('table');

    try { var lr = document.getElementById('last-result'); if (lr) lr.textContent = ''; } catch (e) { quiet(e); }
    setTimeout(dealNext, 400);
  }

  function showSetup() {
    UI.showScreen('setup');
    refreshResumeButton();
  }

  function refreshBackToGameButton() {
    var btn = $('btn-back-to-game');
    if (!btn) return;
    if (table) {
      btn.hidden = false;
      btn.textContent = '▶ Back to your game — Hand #' + (table.handNo || 1) + ' in progress';
      btn.onclick = function () { UI.showScreen('table'); };

      var rb = $('btn-resume'); if (rb) rb.hidden = true;
      var rh = $('resume-hint'); if (rh) rh.hidden = true;
    } else {
      btn.hidden = true;
    }
  }

  function refreshResumeButton() {
    if (table) { refreshBackToGameButton(); return; }
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
      } catch (e) { quiet(e); }
      var modeName = { cash: 'cash game', hu: 'heads-up', tourney: 'tournament' }[s.mode] || s.mode;
      hint.textContent = 'Hand #' + (s.handNo + 1) + ' · ' + modeName + ' · you had ' +
        UI.fmt(s.players[0].stack) + ' chips · saved ' + when;
    }
    btn.onclick = resumeSession;
  }

  try {
    window.__sessionIO = {
      save: saveSession, load: loadSession, clear: clearSession,
      saveable: sessionSaveable, resume: resumeSession, refresh: refreshResumeButton,
      key: SESSION_KEY
    };
  } catch (e) { quiet(e); }

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

  var pf = { scn: null, score: 0, total: 0 };

  function startPushFold() {
    pf.score = 0; pf.total = 0;
    UI.showScreen('pf');
    nextPFScenario();
  }
  function nextPFScenario() {

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

  function wire() {

    var THEME_KEY = 'ps_theme';
    function applyTheme(t) {
      document.documentElement.dataset.theme = t;
      try { localStorage.setItem(THEME_KEY, t); } catch (e) { quiet(e); }
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

    if (UI.setScreenListener) {
      UI.setScreenListener(function (name) {
        setAwayFromTable(name !== 'table' && name !== 'online');
        refreshBackToGameButton();
      });
    }
    var brandBtn = $('brand-home');
    if (brandBtn) brandBtn.onclick = function () { showSetup(); };
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.onclick = function () {
        var dest = b.dataset.nav;

        if (dest === 'setup') {
          if (table) UI.showScreen('table');
          else showSetup();
        }
        else if (dest === 'archetypes') { UI.renderArchetypes(loadCustomBots(), deleteCustom); UI.showScreen('archetypes'); }
        else if (dest === 'hands') { openHandList(); }
        else if (dest === 'stats') { UI.renderStats(); UI.showScreen('stats'); }
        else if (dest === 'learn') { UI.renderLearn(); UI.showScreen('learn'); }
        else if (dest === 'online') { setAwayFromTable(true); Online.show(); }
      };
    });

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

    var cbs = document.getElementById('custom-bot-section');
    if (cbs && !PS_FLAGS.customBots) cbs.style.display = 'none';

    var fsb = $('fb-submit');
    if (fsb) fsb.onclick = UI.submitFeedback;

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

          preHuSelection = Array.from(selectedBots);
          var first = rosterOrderIds().filter(function (id) { return selectedBots.has(id); })[0] || 'lag';
          selectedBots = new Set([first]);
        } else if (prev === 'hu' && mode !== 'hu' && preHuSelection) {

          selectedBots = new Set(preHuSelection.filter(function (id) { return botById(id); }).slice(0, 7));
          if (!selectedBots.size) loadModeRoster();
          preHuSelection = null;
        } else if (prev !== 'hu' && mode !== 'hu' && prev !== mode) {

          try { localStorage.setItem('ps_roster_' + prev + '_v1', JSON.stringify(Array.from(selectedBots))); }
          catch (e) { quiet(e); }
          loadModeRoster();
        }

        pruneSelection();
        syncOppUI();
      };
    });
    $('btn-start').onclick = startGame;

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

    var EMOJI_CHOICES = ['🧑','👩','👨','🧔','👵','👴','🐶','🐱','🦊','🐼','🦁','🐯','🦄','🐸','👻','🤖','👽','🎃','😎','🤠','🥷','🧙','🦸','👑','💀','🔥','⚡','🌊','🍀','🎲'];
    var emojiSel = $('cfg-emoji');
    if (emojiSel) {
      var curEm = '🧑';
      try { curEm = localStorage.getItem('ps_player_emoji') || '🧑'; } catch (e) { quiet(e); }
      EMOJI_CHOICES.forEach(function (em) {
        var o = document.createElement('option');
        o.value = em; o.textContent = em;
        if (em === curEm) o.selected = true;
        emojiSel.appendChild(o);
      });
      emojiSel.addEventListener('change', function () {
        try { localStorage.setItem('ps_player_emoji', emojiSel.value); } catch (e) { quiet(e); }
      });
    }
    var unameInput = $('cfg-username');
    if (unameInput) {
      unameInput.value = NamePrefs.getUsername();
      unameInput.addEventListener('change', function () {
        NamePrefs.setUsername(unameInput.value);
        unameInput.value = NamePrefs.getUsername();
      });
    }

    function syncOppUI() {
      $('opp-count').textContent = selectedBots.size;
      UI.renderRoster(rosterBots(), selectedBots, maxOpp(), rosterHint, onRosterChange);
      syncQuickHint();
      syncTourneyHint();
      saveRoster();
    }

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

    function onRosterChange() {
      $('opp-count').textContent = selectedBots.size;
      syncQuickHint();
      saveRoster();
    }

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

      var ids = rosterOrderIds().filter(function (id) { return selectedBots.has(id); });
      selectedBots.delete(ids[ids.length - 1]);
      syncOppUI();
    };
    $('opp-plus').onclick = function () {
      if (mode === 'hu') return;
      if (selectedBots.size >= maxOpp()) { rosterHint('Only ' + maxOpp() + ' opponents for this mode'); return; }

      var id = rosterOrderIds().filter(function (x) { return !selectedBots.has(x); })[0];
      if (id) selectedBots.add(id);
      syncOppUI();
    };

    $('pf-shove').onclick = function () { pfAnswer(pf.scn.facingShove ? 'call' : 'shove'); };
    $('pf-fold').onclick = function () { pfAnswer('fold'); };
    $('pf-next').onclick = nextPFScenario;

    [['cust-loose', 'v-loose'], ['cust-aggr', 'v-aggr'], ['cust-bluff', 'v-bluff'], ['cust-stub', 'v-stub'],
     ['cust-tilt', 'v-tilt'], ['cust-rebuy', 'v-rebuy']]
      .forEach(function (pair) {
        $(pair[0]).oninput = function () { $(pair[1]).textContent = $(pair[0]).value; };
      });
    $('btn-add-custom').onclick = function () {
      var name = $('cust-name').value.trim() || 'My Bot';

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

        sessionStartChips = (table && table.players && table.players[0]) ? table.players[0].stack : 0;
        UI.setBankroll(0);
      }
    };

    UI.renderRoster(rosterBots(), selectedBots, maxOpp(), rosterHint);

    var oc0 = document.getElementById('opp-count');
    if (oc0) oc0.textContent = selectedBots.size;

    ['cfg-stack', 'cfg-sb', 'cfg-bb', 'cfg-blindint'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', function () { syncQuickHint(); syncTourneyHint(); });
    });
    syncQuickHint();
    refreshBankroll();
    var vv = $('app-version');
    if (vv) vv.textContent = 'v' + APP_VERSION + ' · offline · stats stay in this browser';

    var cu = $('btn-check-update');
    if (cu) cu.onclick = function () {
      cu.textContent = 'Checking…';
      fetch('version.txt?v=' + Date.now()).then(function (r) { return r.text(); }).then(function (t) {
        var v = (t || '').trim();
        if (v && v !== APP_VERSION) {
          if (confirm('New version ' + v + ' available (you have ' + APP_VERSION + '). Reload now?')) {

            fetch(window.location.pathname, { cache: 'reload' }).catch(function () {}).then(function () {
              window.location.href = updateReloadURL(window.location.pathname, v, window.location.hash);
            });
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
    if (!selectedBots.size) selectedBots.add('lag');
    UI.renderArchetypes(loadCustomBots(), deleteCustom);
    UI.renderRoster(rosterBots(), selectedBots, maxOpp(), rosterHint, function () {
      var oc = document.getElementById('opp-count');
      if (oc) oc.textContent = selectedBots.size;
      saveRoster();
    });
    saveRoster();

    var s = loadSession();
    if (s && s.players.some(function (sp) {
      return !sp.isHero && !botById(sp.archetypeId);
    })) clearSession();
  }

  refreshResumeButton();
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(quiet);
    }
  } catch (e) { quiet(e); }
  document.addEventListener('pagehide', saveSession);

  document.addEventListener('DOMContentLoaded', wire);
})();
