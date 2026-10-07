// ui.js — DOM rendering for Poker Sparring. No game decisions here; app.js conducts.

var UI = (function () {
  function $(id) { return document.getElementById(id); }

  function showScreen(name) {
    ['setup', 'table', 'pf', 'archetypes', 'hands', 'stats', 'learn'].forEach(function (s) {
      $('screen-' + s).hidden = (s !== name);
    });
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.nav === name || (name === 'pf' && b.dataset.nav === 'setup'));
    });
    window.scrollTo(0, 0);
  }

  // ---------- learn screen ----------
  var LEARN_BOOKS = [
    { title: 'The Theory of Poker', author: 'David Sklansky',
      blurb: 'The math bible: expected value, the Fundamental Theorem of Poker, and why every decision is a math problem.',
      url: 'https://en.wikipedia.org/wiki/The_Theory_of_Poker' },
    { title: "Harrington on Hold 'em", author: 'Dan Harrington & Bill Robertie',
      blurb: 'The tournament bible: surviving rising blinds, inflection points, and endgame play — from a world champion.',
      url: 'https://en.wikipedia.org/wiki/Harrington_on_Hold_%27em' },
    { title: 'Super/System', author: 'Doyle Brunson',
      blurb: 'The book that launched modern no-limit strategy — aggressive "power poker" from a two-time world champion.',
      url: 'https://en.wikipedia.org/wiki/Super/System' }
  ];
  var LEARN_SITES = [
    { title: 'Upswing Poker', author: 'Free articles + courses',
      blurb: 'Strategy content from elite pros — great free articles on fundamentals.',
      url: 'https://www.upswingpoker.com/' },
    { title: 'PokerCoaching', author: 'Jonathan Little',
      blurb: 'Free quizzes and hand reviews that drill exactly the spots this app trains.',
      url: 'https://pokercoaching.com/' },
    { title: 'PokerStrategy', author: 'Free since 2005',
      blurb: 'Beginner-friendly strategy articles covering every concept in the glossary below.',
      url: 'https://www.pokerstrategy.com/' }
  ];
  var GLOSSARY = [
    ['Nit / Rock', 'An extremely tight player who only plays premium hands. Easy to bluff, impossible to get paid by — when they bet, believe them.'],
    ['Calling Station', 'A loose-passive player who calls with almost anything and rarely raises. Never bluff them; value bet relentlessly.'],
    ['Maniac', 'An extremely loose-aggressive player who bets and raises constantly. Trap them with strong hands and call down lighter.'],
    ['TAG', 'Tight-Aggressive: plays few hands but plays them aggressively. The classic winning style — solid, disciplined, hard to exploit.'],
    ['LAG', 'Loose-Aggressive: plays many hands with constant pressure. Tricky and dangerous when skilled, spewy when not.'],
    ['VPIP', 'Voluntarily Put money In Pot: % of hands a player plays. ~15% is tight, ~25% is standard, 40%+ is loose.'],
    ['PFR', 'Pre-Flop Raise: % of hands a player raises before the flop. The gap between VPIP and PFR shows how passive someone is.'],
    ['Pot Odds', 'The price the pot offers you: a 150 call to win 600 means you need 20% equity to break even. The single most important math in poker.'],
    ['Implied Odds', 'What you might win on later streets if you hit your hand. Justifies some calls that pure pot odds reject — but only against players who pay off.'],
    ['Equity', 'Your share of the pot based on how often your hand wins right now. A flush draw on the flop has ~35% equity against top pair.'],
    ['Expected Value (EV)', 'The average outcome of a decision repeated many times. Winning poker = making +EV decisions, even when individual results sting.'],
    ['Bankroll Management', 'Only risking a small fraction of your poker money in any game, so bad luck (variance) can\'t wipe you out. Pros use 20-50 buy-ins.'],
    ['Variance', 'Short-term luck. You can play perfectly and lose for weeks; you can play badly and win tonight. Skill shows over thousands of hands.'],
    ['Tilt', 'Emotional play after bad beats — the #1 bankroll killer. The bots never tilt. Learn from them.'],
    ['Position', 'Acting last is the biggest edge in poker: you see what everyone does first. Play tighter early, wider late.'],
    ['Blinds', 'Forced bets that start the action: the small blind and big blind. Stealing blinds is how tight players stay profitable.'],
    ['Ante', 'A small forced bet from everyone, used in later tournament stages to build pots and force action.'],
    ['3-Bet', 'The third bet preflop (re-raise). A 3-bet usually means real strength — or a player applying pressure.'],
    ['Continuation Bet', 'Betting the flop after raising preflop, whether you hit or not. Works because preflop raisers usually have the stronger range.'],
    ['Value Bet', 'Betting with a strong hand to get called by worse. Against calling stations, this is where all the money comes from.'],
    ['Bluff', 'Betting with a weak hand to make better hands fold. Works against tight players; lighting money on fire vs calling stations.'],
    ['Semi-Bluff', 'Betting with a draw: you win if they fold now OR if you hit later. The mathematically beautiful play.'],
    ['Slow Play', 'Checking a monster to trap. Great vs maniacs who bet for you; terrible vs passive players who\'ll never bet.'],
    ['Check-Raise', 'Checking to induce a bet, then raising. A power move that screams strength — use sparingly.'],
    ['Outs', 'Cards that improve your hand. A flush draw has 9 outs (~35% by the river). Rough rule: outs × 2 ≈ % per street.'],
    ['Draw', 'An unfinished hand needing one more card — flush draws, straight draws. Strong draws are often favorites over one pair.'],
    ['Push/Fold', 'Short-stack strategy (under ~13 big blinds): either shove all-in or fold. No calling, no small raises — the math demands it.'],
    ['ICM', 'Independent Chip Model: in tournaments, chips have diminishing value — survival near payouts matters more than accumulating.'],
    ['Bubble', 'The last spot before prize money. Medium stacks play terrified here; big stacks should attack relentlessly.']
  ];

  function renderLearn() {
    function cards(list, boxId) {
      var box = $(boxId);
      box.innerHTML = '';
      list.forEach(function (b) {
        var a = document.createElement('a');
        a.className = 'book-card';
        a.href = b.url; a.target = '_blank'; a.rel = 'noopener';
        a.innerHTML = '<div class="bk-title">' + escapeHtml(b.title) + '</div>' +
          '<div class="bk-author">' + escapeHtml(b.author) + '</div>' +
          '<div class="bk-blurb">' + escapeHtml(b.blurb) + '</div>' +
          '<div class="bk-link">Learn more ↗</div>';
        box.appendChild(a);
      });
    }
    cards(LEARN_BOOKS, 'book-list');
    cards(LEARN_SITES, 'site-list');
    var g = $('glossary');
    g.innerHTML = '';
    GLOSSARY.forEach(function (pair) {
      var d = document.createElement('details');
      d.className = 'gloss-card';
      d.innerHTML = '<summary class="gloss-term">' + escapeHtml(pair[0]) + '</summary>' +
        '<div class="gloss-def">' + escapeHtml(pair[1]) + '</div>';
      g.appendChild(d);
    });
  }

  // ---------- leak tracker ----------
  function renderLeaks() {
    var box = $('leak-list');
    box.innerHTML = '';
    var leaks = loadStats().leaks || [];
    if (!leaks.length) {
      box.innerHTML = '<p class="subtitle">No leaks spotted yet. Play some hands — the coach is watching. 👀</p>';
      return;
    }
    var byType = {};
    leaks.forEach(function (l) {
      byType[l.type] = byType[l.type] || { title: l.title, n: 0 };
      byType[l.type].n++;
    });
    var sum = document.createElement('div');
    sum.className = 'leak-summary';
    sum.innerHTML = Object.keys(byType).map(function (t) {
      return '<span class="leak-chip">' + escapeHtml(byType[t].title) + ' ×' + byType[t].n + '</span>';
    }).join('');
    box.appendChild(sum);
    leaks.slice(0, 12).forEach(function (l) {
      var d = document.createElement('div');
      d.className = 'leak-card';
      d.innerHTML = '<div class="leak-head"><span class="leak-title">🩹 ' + escapeHtml(l.title) + '</span>' +
        '<span class="leak-meta">Hand #' + l.hand + ' · ' + escapeHtml(l.street) + ' · ' + escapeHtml(l.hole) + '</span></div>' +
        '<div class="leak-spot">' + escapeHtml(l.spot) + '</div>' +
        '<details class="leak-why"><summary>Why this matters</summary><div>' + escapeHtml(l.why) + '</div></details>';
      box.appendChild(d);
    });
  }

  // ---------- cards ----------
  function cardEl(c, small) {
    var d = document.createElement('div');
    d.className = 'card' + (small ? ' small' : '') + (isRed(c) ? ' red' : '');
    // Screen readers: announce "Ace of spades", not silence.
    try { d.setAttribute('role', 'img'); d.setAttribute('aria-label', rankName(c.r) + ' of ' + SUIT_NAMES[c.s]); } catch (e) {}
    var crank = document.createElement('div');
    crank.className = 'crank'; crank.textContent = rankChar(c.r);
    var csuit = document.createElement('div');
    csuit.className = 'csuit'; csuit.textContent = SUITS[c.s];
    d.appendChild(crank); d.appendChild(csuit);
    return d;
  }
  function cardBackEl(small) {
    var d = document.createElement('div');
    d.className = 'card back' + (small ? ' small' : '');
    try { d.setAttribute('role', 'img'); d.setAttribute('aria-label', 'Face-down card'); } catch (e) {}
    return d;
  }

  // ---------- setup screen ----------
  // Bot display name: custom rename when set, otherwise the archetype default.
  // NamePrefs is a browser global (js/names.js); tests that load ui.js without
  // it fall back to default names.
  function dispName(a) {
    if (!a) return '';
    if (typeof NamePrefs !== 'undefined' && NamePrefs) return NamePrefs.displayName(a);
    return a.name || a.id || '';
  }

  function renderRoster(allBots, selected) {
    var box = $('bot-roster');
    box.innerHTML = '';
    box._bots = allBots;
    box._selected = selected;
    var overrides = (typeof NamePrefs !== 'undefined' && NamePrefs) ? NamePrefs.getBotOverrides() : {};
    allBots.forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'roster-card' + (selected.has(b.id) ? ' selected' : '');
      var renamed = !!overrides[b.id];
      btn.innerHTML = '<span class="emoji">' + escapeHtml(b.emoji) + '</span>' +
        '<span><div class="nm"><span class="nm-row"><span class="nm-text">' + escapeHtml(dispName(b)) + '</span>' +
        (renamed ? '<span class="renamed-tag" title="Default name: ' + escapeHtml(b.name) + '">renamed</span>' : '') +
        '<span class="rename-btn" role="button" tabindex="0" title="Rename ' + escapeHtml(b.name) + '">✎</span>' +
        '</span></div>' +
        '<div class="tg">' + escapeHtml(b.tagline) + '</div></span>' +
        '<span class="check">✓</span>';
      btn.onclick = function () {
        if (selected.has(b.id)) selected.delete(b.id); else selected.add(b.id);
        btn.classList.toggle('selected');
      };
      var rbtn = btn.querySelector('.rename-btn');
      rbtn.onclick = function (e) { e.stopPropagation(); openRename(btn, b); };
      rbtn.onkeydown = function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openRename(btn, b); }
      };
      box.appendChild(btn);
    });
  }

  // Inline rename: swaps the name row for an input. Enter/blur saves (empty
  // resets to the default name), Escape cancels. Duplicate names are rejected
  // inline — two "Doyle"s at one table is confusing. Re-renders the roster after.
  function openRename(cardBtn, b) {
    var nmRow = cardBtn.querySelector('.nm-row');
    if (!nmRow || nmRow.querySelector('input')) return;
    nmRow.innerHTML = '';
    var input = document.createElement('input');
    input.className = 'rename-input';
    input.value = dispName(b);
    input.maxLength = 18;
    input.setAttribute('aria-label', 'Rename ' + b.name + ' (empty resets)');
    var done = false;
    function nameTaken(v) {
      var low = v.trim().toLowerCase();
      if (!low) return false;
      var bots = ($('bot-roster') && $('bot-roster')._bots) || [];
      for (var i = 0; i < bots.length; i++) {
        if (bots[i].id !== b.id && dispName(bots[i]).toLowerCase() === low) return true;
      }
      if (typeof NamePrefs !== 'undefined' && NamePrefs) {
        var un = (NamePrefs.getUsername() || '').trim().toLowerCase();
        if (un && un === low) return true;
      }
      return false;
    }
    function finish(save) {
      if (done) return; done = true;
      if (save && typeof NamePrefs !== 'undefined' && NamePrefs) {
        if (nameTaken(input.value)) {
          done = false; // keep editing; flag the conflict
          input.classList.add('rename-dup');
          input.setAttribute('aria-invalid', 'true');
          input.title = 'That name is already taken at this table';
          input.focus();
          return;
        }
        NamePrefs.setBotOverride(b.id, input.value);
      }
      var box = $('bot-roster');
      renderRoster(box._bots || [], box._selected || new Set());
    }
    input.onclick = function (e) { e.stopPropagation(); };
    input.onkeydown = function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    };
    input.onblur = function () { finish(true); };
    nmRow.appendChild(input);
    input.focus();
    input.select();
  }

  // ---------- table ----------
  function seatPos(i, n) {
    // Phones: pull the ellipse in so side seats (min-width 84px) stay on the felt.
    // All screens: keep top/bottom seats fully inside (seats are ~110-150px tall,
    // so y=10%/88% clipped them under .felt{overflow:hidden}).
    var narrow = (typeof window !== 'undefined' && window.innerWidth < 640);
    var rx = narrow ? 35 : 42;
    if (i === 0) return { x: 50, y: 82 };
    var theta = (90 + i * (360 / n)) * Math.PI / 180;
    return { x: 50 + rx * Math.cos(theta), y: 50 + 32 * Math.sin(theta) };
  }

  function buildSeats(n) {
    var box = $('seats');
    box.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var pos = seatPos(i, n);
      var s = document.createElement('div');
      s.className = 'seat'; s.id = 'seat-' + i;
      s.style.left = pos.x + '%'; s.style.top = pos.y + '%';
      s.innerHTML = '<div class="who"><span class="avatar"></span><span class="pname"></span></div>' +
        '<div class="pstack"></div><div class="pcards"></div>' +
        '<div class="pbet"></div><div class="pact"></div>';
      box.appendChild(s);
    }
  }

  // ---------- smooth table fx ----------
  // The table used to rebuild every card on every action, replaying the deal
  // animation constantly (flashing/bouncing cards). Now cards are diff-synced:
  // only newly dealt cards are created (and animated); everything else is
  // patched in place. Value changes pulse subtly; action badges pop.
  var lastPact = {};

  function cardKey(c, faceUp) { return (faceUp ? 'U' : 'D') + c.r + '-' + c.s; }

  // Diff-sync a card row: the common prefix is left untouched, extras are
  // removed, new cards are appended (only appended cards play the deal anim).
  function syncCards(el, cards, faceUp, small) {
    var want = cards.map(function (c) { return cardKey(c, faceUp); });
    var p = 0;
    while (p < want.length && p < el.children.length && el.children[p]._ckey === want[p]) p++;
    while (el.children.length > p) el.removeChild(el.lastChild);
    for (var j = p; j < cards.length; j++) {
      var n = faceUp ? cardEl(cards[j], small) : cardBackEl(small);
      n._ckey = want[j];
      el.appendChild(n);
    }
  }

  // Set text only when changed; pulse so the update reads as motion, not a snap.
  function setTextFx(el, txt) {
    var s = String(txt);
    if (!el || el.textContent === s) return;
    el.textContent = s;
    el.classList.remove('bump');
    void el.offsetWidth; // restart the animation
    el.classList.add('bump');
  }

  // Action badge: pop when the action text changes.
  function setPact(el, seatIdx, txt) {
    var s = txt || '';
    if (lastPact[seatIdx] === s) { if (el.textContent !== s) el.textContent = s; return; }
    lastPact[seatIdx] = s;
    el.textContent = s;
    el.classList.remove('pop');
    void el.offsetWidth;
    if (s) el.classList.add('pop');
  }

  // Chip fly: a chip arcs from the bettor's seat to the pot.
  function chipFly(seatIdx) {
    try {
      var seat = $('seat-' + seatIdx);
      var pot = $('pot-display');
      if (!seat || !pot) return;
      var a = seat.getBoundingClientRect(), b = pot.getBoundingClientRect();
      if (!a.width || !b.width) return;
      var chip = document.createElement('div');
      chip.className = 'chip-fly';
      chip.setAttribute('aria-hidden', 'true');
      chip.style.left = (a.left + a.width / 2) + 'px';
      chip.style.top = (a.top + a.height / 2) + 'px';
      document.body.appendChild(chip);
      void chip.offsetWidth; // force layout so the transition runs
      var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
      var dy = (b.top + b.height / 2) - (a.top + a.height / 2);
      chip.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(0.55)';
      chip.style.opacity = '0.85';
      setTimeout(function () { if (chip.parentNode) chip.parentNode.removeChild(chip); }, 650);
    } catch (e) {}
  }

  // Call at hand start: drop per-hand fx state and stray fx elements.
  function resetTableFx() {
    lastPact = {};
    try {
      var dead = document.querySelectorAll('.chip-fly');
      for (var i = 0; i < dead.length; i++) dead[i].parentNode.removeChild(dead[i]);
    } catch (e) {}
  }

  // opts: { lastActions: {idx: str}, winners: [idx], revealed: {idx: true}, acting: idx,
  //         button: idx, handEnd: bool, heroShow: bool }
  // At hand end (handEnd), every bot's hole cards are revealed face-up — even
  // folded ones — so the player can study how each bot played (practice mode).
  // A folded hero sees card backs until they tap "Show my hand" (heroShow).
  function renderTable(table, opts) {
    opts = opts || {};
    var handEnd = !!opts.handEnd;
    var n = table.players.length;
    // pot + community (community is diff-synced: only new streets animate)
    setTextFx($('pot-display'), 'Pot: ' + fmt(table.potTotal()));
    syncCards($('community'), table.community, true, false);
    $('street-label').textContent = table.street === 'preflop' ? '' : table.street;

    // dealer button: one persistent element, moved between seats (no rebuild)
    var db = $('dealer-btn');
    if (!db) {
      db = document.createElement('div');
      db.id = 'dealer-btn'; db.className = 'dealer-btn'; db.textContent = 'D';
    }
    var bs = $('seat-' + table.button);
    if (bs && db.parentNode !== bs) bs.appendChild(db);

    table.players.forEach(function (p, i) {
      var s = $('seat-' + i);
      if (!s) return;
      s.querySelector('.avatar').textContent = p.isHero ? '🧑' : (p.archetype ? p.archetype.emoji : '🤖');
      s.querySelector('.pname').textContent = p.name; // hero name set at game start (username or 'You')
      setTextFx(s.querySelector('.pstack'), fmt(p.stack));
      setTextFx(s.querySelector('.pbet'), p.bet > 0 ? 'bet ' + fmt(p.bet) : '');
      setPact(s.querySelector('.pact'), i, (opts.lastActions && opts.lastActions[i]) || '');
      var hole = [], faceUp = false;
      if (!p.sittingOut && p.hole.length === 2 && (!p.folded || handEnd)) {
        hole = p.hole;
        if (p.isHero) faceUp = p.folded ? !!opts.heroShow : true;
        else faceUp = handEnd || (opts.revealed && opts.revealed[i]);
      }
      syncCards(s.querySelector('.pcards'), hole, faceUp, true);
      s.classList.toggle('folded', p.folded);
      s.classList.toggle('to-act', opts.acting === i && !table.handOver);
      s.classList.toggle('thinking', opts.acting === i && !p.isHero && !table.handOver);
      s.classList.toggle('winner', !!(opts.winners && opts.winners.indexOf(i) !== -1));
      s.classList.toggle('out', p.sittingOut || p.stack === 0);
    });
  }

  // ---------- controls ----------
  // cfg: { fold, checkCall: {label, enabled}, betRaise: {label, enabled}, allin: {enabled} }
  function setControls(cfg) {
    $('btn-fold').disabled = !cfg.fold;
    var cc = $('btn-checkcall');
    cc.textContent = cfg.checkCall.label; cc.disabled = !cfg.checkCall.enabled;
    var br = $('btn-betraise');
    br.textContent = cfg.betRaise.label; br.disabled = !cfg.betRaise.enabled;
    $('btn-allin').disabled = !cfg.allin.enabled;
    // Semantic color hooks: tint each action button by what it does.
    cc.classList.remove('is-check', 'is-call');
    if (cfg.checkCall.label.indexOf('Check') === 0) cc.classList.add('is-check');
    else if (cfg.checkCall.label.indexOf('Call') === 0) cc.classList.add('is-call');
    br.classList.remove('is-raise');
    if (cfg.betRaise.label === 'Bet' || cfg.betRaise.label === 'Raise') br.classList.add('is-raise');
    if (cfg.fold === false && !cfg.checkCall.enabled && !cfg.betRaise.enabled) {
      // nothing to do (shouldn't happen)
    }
  }
  function disableControls() {
    ['btn-fold', 'btn-checkcall', 'btn-betraise', 'btn-allin'].forEach(function (id) { $(id).disabled = true; });
    $('bet-panel').hidden = true;
  }

  // Bet panel: cb(amountChips). Range in chips [minTo, maxTo].
  function openBetPanel(minTo, maxTo, pot, isRaise, cb) {
    var panel = $('bet-panel');
    panel.hidden = false;
    var slider = $('bet-slider'), amtEl = $('bet-amount');
    function setFromFrac(f) {
      var target = isRaise ? (minTo + (pot * f)) : (pot * f);
      target = Math.max(minTo, Math.min(maxTo, Math.round(target)));
      slider.value = maxTo === minTo ? 0 : Math.round(1000 * (target - minTo) / (maxTo - minTo));
      paint(target);
    }
    function paint(v) { amtEl.textContent = fmt(v); }
    slider.oninput = function () {
      var t = minTo + (maxTo - minTo) * (slider.value / 1000);
      // round to 5s for sanity
      t = Math.round(t / 5) * 5;
      paint(Math.max(minTo, Math.min(maxTo, t)));
    };
    panel.querySelectorAll('.chip-btn').forEach(function (b) {
      b.onclick = function () { setFromFrac(parseFloat(b.dataset.frac)); };
    });
    setFromFrac(0.75);
    $('btn-bet-confirm').onclick = function () {
      var t = minTo + (maxTo - minTo) * (slider.value / 1000);
      t = Math.max(minTo, Math.min(maxTo, Math.round(t / 5) * 5));
      panel.hidden = true;
      cb(t);
    };
    $('btn-bet-cancel').onclick = function () { panel.hidden = true; };
  }

  // ---------- log / coach / banner ----------
  function log(html, cls) {
    var box = $('hand-log');
    var div = document.createElement('div');
    if (cls) div.className = cls;
    div.innerHTML = html;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }
  function clearLog() { $('hand-log').innerHTML = ''; }

  function coachTip(html) {
    var c = $('coach-tip');
    if (!html) { c.hidden = true; return; }
    c.hidden = false;
    c.innerHTML = '<div class="coach-head">Coach</div>' + html;
  }

  // Amount the hero (player 0) actually won in a handEnd event: sums each pot
  // they won, excluding uncalled returns ("takes back"). Falls back to the
  // total pot when the breakdown is missing.
  function handWinAmount(e) {
    var total = 0;
    (e.winners || []).forEach(function (w) {
      var ids = w.winners || [w.idx];
      if (ids.indexOf(0) !== -1 && !w.uncalled) total += (w.each || w.amount);
    });
    return total || e.pot;
  }

  // Total chips won by the winners of the FIRST winner entry across all pots
  // (side pots included). Used for the compact "Last:" topbar line so a
  // multi-pot win isn't understated. Uncalled "takes back" entries are not
  // winnings and don't affect the grouping. Falls back to the first entry
  // when different winners split the pots.
  function firstWinnersTotal(e) {
    var winners = (e.winners || []).filter(function (w) { return !w.uncalled; });
    var w0 = winners[0] || (e.winners || [])[0];
    if (!w0) return 0;
    var key = (w0.winners || [w0.idx]).slice().sort().join(',');
    var total = 0, same = true;
    winners.forEach(function (w) {
      var k = (w.winners || [w.idx]).slice().sort().join(',');
      if (k !== key) same = false;
      else total += (w.each || w.amount);
    });
    return same ? total : (w0.each || w0.amount);
  }

  function winnerBanner(html) {
    var w = $('winner-banner');
    hideHandEndControls();
    if (!html) { w.hidden = true; return; }
    w.hidden = false;
    w.innerHTML = html;
  }

  // Hand-end controls: a "Next hand" button plus an auto-deal countdown, and
  // optionally a "Show my hand" button when the hero folded. The row lives
  // inside the winner banner so it clears with it; the timer is owned here so
  // leaving the table (winnerBanner(null)) always cancels the auto-deal.
  var handEndTimer = null;
  function showHandEndControls(o) {
    hideHandEndControls();
    var w = $('winner-banner');
    if (!w) { o.onNext(); return; }
    var row = document.createElement('div');
    row.id = 'handend-row';
    if (o.onShowHero) {
      var sh = document.createElement('button');
      sh.className = 'ghost'; sh.id = 'btn-show-hero';
      sh.textContent = '👁 Show my hand';
      sh.onclick = function () { sh.disabled = true; sh.textContent = 'Hand shown'; o.onShowHero(); };
      row.appendChild(sh);
    }
    var btn = document.createElement('button');
    btn.className = 'primary'; btn.id = 'btn-next-hand';
    btn.textContent = 'Next hand ▸';
    row.appendChild(btn);
    var hint = document.createElement('span');
    hint.className = 'fineprint';
    row.appendChild(hint);
    w.appendChild(row);
    var ms = o.autoMs || 6000;
    var t0 = Date.now();
    function tick() {
      var s = Math.ceil((ms - (Date.now() - t0)) / 1000);
      if (s <= 0) { hideHandEndControls(); o.onNext(); return; }
      hint.textContent = 'auto-dealing in ' + s + 's';
    }
    btn.onclick = function () { hideHandEndControls(); o.onNext(); };
    tick();
    handEndTimer = setInterval(tick, 250);
  }
  function hideHandEndControls() {
    if (handEndTimer) { clearInterval(handEndTimer); handEndTimer = null; }
    var row = $('handend-row');
    if (row && row.parentNode) row.parentNode.removeChild(row);
  }

  function modal(o) {
    // o: { title, body, buttons: [{label, primary, cb}] }
    var root = $('modal-root');
    root.innerHTML = '';
    var back = document.createElement('div');
    back.className = 'modal-back';
    var m = document.createElement('div');
    m.className = 'modal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-label', o.title);
    m.innerHTML = '<h3>' + o.title + '</h3><p>' + o.body + '</p>';
    var row = document.createElement('div');
    row.className = 'mrow';
    o.buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = b.primary ? 'primary' : 'ghost';
      btn.textContent = b.label;
      btn.onclick = function () { root.innerHTML = ''; if (b.cb) b.cb(); };
      row.appendChild(btn);
    });
    m.appendChild(row);
    back.appendChild(m);
    root.appendChild(back);
  }

  // ---------- archetypes screen ----------
  function renderArchetypes(customs, onDelete) {
    var box = $('preset-list');
    box.innerHTML = '';
    ARCHETYPES.forEach(function (a) { box.appendChild(archCard(a, false, null)); });
    var cbox = $('custom-list');
    cbox.innerHTML = '';
    if (!customs.length) cbox.innerHTML = '<p class="subtitle">None yet — build one above.</p>';
    customs.forEach(function (a) { cbox.appendChild(archCard(a, true, onDelete)); });
  }
  function archCard(a, custom, onDelete) {
    var d = document.createElement('div');
    d.className = 'arch-card';
    d.innerHTML = '<div class="ah"><span class="aemoji">' + escapeHtml(a.emoji) + '</span>' +
      '<span class="aname">' + escapeHtml(dispName(a)) + '</span></div>' +
      '<div class="atag">' + escapeHtml(a.tagline || '') + '</div>' +
      '<div class="adesc">' + escapeHtml(a.desc || '') + '</div>' +
      (a.beat ? '<div class="abeat"><b>How to beat:</b> ' + escapeHtml(a.beat) + '</div>' : '');
    if (custom && onDelete) {
      var del = document.createElement('button');
      del.className = 'ghost danger-text adel'; del.textContent = 'Delete';
      del.onclick = function () { onDelete(a.id); };
      d.appendChild(del);
    }
    return d;
  }

  // ---------- stats screen ----------
  function renderStats() {
    var s = loadStats(), d = derivedStats(s);
    // bb/100 is noise below ~20 hands — show a dash instead of an alarming number.
    var bb100 = d.hands >= 20 ? d.bbPer100.toFixed(1) : '—';
    var cards = [
      ['Hands', d.hands], ['Win %', d.winRate.toFixed(1)],
      ['bb / 100', bb100], ['VPIP %', d.vpip.toFixed(1)],
      ['PFR %', d.pfr.toFixed(1)], ['Aggr. factor', d.af >= 99 ? '∞' : d.af.toFixed(2)],
      ['Biggest pot', d.biggestPotChips ? fmt(d.biggestPotChips) : d.biggestPotBB.toFixed(0) + ' bb']
    ];
    var box = $('stat-cards');
    box.innerHTML = '';
    cards.forEach(function (c) {
      var el = document.createElement('div');
      el.className = 'stat-card';
      var title = c[0] === 'bb / 100' && d.hands < 20 ? ' title="Play 20+ hands for a meaningful win rate"' : '';
      el.innerHTML = '<div class="sk"' + title + '>' + c[0] + '</div><div class="sv"' + title + '>' + c[1] + '</div>';
      box.appendChild(el);
    });
    drawSparkline(s.graph);
    renderLeaks();
    var at = $('arch-table');
    at.innerHTML = '';
    var ids = Object.keys(s.perArchetype);
    if (!ids.length) at.innerHTML = '<p class="subtitle">Play some hands to build your record.</p>';
    ids.forEach(function (id) {
      var a = s.perArchetype[id];
      var row = document.createElement('div');
      row.className = 'arch-table-row';
      row.innerHTML = '<span class="ae">' + (a.emoji || '🤖') + '</span>' +
        '<span class="an">' + escapeHtml(dispName(a) || id) + '</span>' +
        '<span class="as">' + a.hands + ' hands · won ' + a.won + ' · ' +
        chipDelta(a.profitChips, a.profitBB) + '</span>';
      at.appendChild(row);
    });
    var hl = $('history-list');
    hl.innerHTML = '';
    if (!s.history.length) hl.innerHTML = '<p class="subtitle">No hands yet.</p>';
    s.history.slice(0, 20).forEach(function (h) {
      var row = document.createElement('div');
      row.className = 'hist-row';
      var p = h.profitChips != null ? (h.profitChips > 0 ? 'pos' : h.profitChips < 0 ? 'neg' : '') : (h.profitBB >= 0 ? 'pos' : 'neg');
      row.innerHTML = '<span>#' + h.n + '</span><span class="hc">' + h.hole.join(' ') + '</span>' +
        '<span>' + escapeHtml(h.result || '') + '</span>' +
        '<span class="' + p + '">' + chipDelta(h.profitChips, h.profitBB) + '</span>';
      hl.appendChild(row);
    });
  }

  function drawSparkline(data) {
    var cv = $('sparkline');
    var ctx = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    if (!data.length) {
      ctx.fillStyle = '#8b96a5'; ctx.font = '14px sans-serif';
      ctx.fillText('Play hands to see your graph.', 20, H / 2);
      return;
    }
    var min = Math.min.apply(null, data.concat([0])), max = Math.max.apply(null, data.concat([0]));
    var range = (max - min) || 1;
    function X(i) { return 10 + (W - 20) * (i / Math.max(1, data.length - 1)); }
    function Y(v) { return H - 12 - (H - 24) * ((v - min) / range); }
    // zero line
    ctx.strokeStyle = '#2b3547'; ctx.beginPath();
    ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.stroke();
    ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 2; ctx.beginPath();
    data.forEach(function (v, i) { if (i === 0) ctx.moveTo(X(i), Y(v)); else ctx.lineTo(X(i), Y(v)); });
    ctx.stroke();
    ctx.fillStyle = '#8b96a5'; ctx.font = '12px sans-serif';
    ctx.fillText(max.toFixed(0) + ' bb', 6, 14);
    ctx.fillText(min.toFixed(0) + ' bb', 6, H - 6);
  }

  // ---------- push/fold ----------
  function renderPFScenario(scn) {
    var sit = $('pf-situation');
    sit.innerHTML =
      pfItem('Your stack', scn.stackBB + ' bb') +
      pfItem('Position', scn.pos) +
      pfItem('Blinds', '1 / 2 bb') +
      pfItem('Opponents', scn.opponents.length);
    var opp = $('pf-opponents');
    opp.innerHTML = '';
    scn.opponents.forEach(function (o) {
      var d = document.createElement('div');
      d.className = 'pf-opp';
      d.innerHTML = o.emoji + ' ' + escapeHtml(o.name) +
        ' <span class="stack">' + o.stackBB + 'bb</span>' +
        (o.shoving ? ' <b>SHOVES</b>' : '');
      opp.appendChild(d);
    });
    var hc = $('pf-hero-cards');
    hc.innerHTML = '';
    scn.heroHole.forEach(function (c) { hc.appendChild(cardEl(c)); });
    $('pf-shove').textContent = scn.facingShove ? 'CALL' : 'SHOVE';
    $('pf-shove').id = 'pf-shove';
    $('pf-fold').style.display = '';
    $('pf-actions').style.display = '';
    $('pf-feedback').hidden = true;
    $('pf-next').hidden = true;
  }
  function pfItem(k, v) {
    return '<div class="pf-sit-item"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';
  }
  function renderPFFeedback(fb) {
    $('pf-actions').style.display = 'none';
    var box = $('pf-feedback');
    box.hidden = false;
    box.className = 'pf-feedback ' + (fb.right ? 'correct' : 'wrong');
    box.innerHTML = '<div class="verdict">' + (fb.right ? '✓ Correct' : '✗ Off the mark') + '</div>' +
      '<div>' + escapeHtml(fb.explain) + '</div>';
    $('pf-next').hidden = false;
  }

  // ---------- hand history / replayer ----------
  function fmtReplayDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
        d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  // records: newest first. onOpen(id) opens the replay viewer.
  function renderHandList(records, onOpen) {
    var list = $('hand-list'), view = $('replay-view');
    view.hidden = true; view.innerHTML = '';
    list.hidden = false; list.innerHTML = '';
    if (!records.length) {
      list.innerHTML = '<p class="subtitle">No saved hands yet — play a few and they will appear here for replay.</p>';
      return;
    }
    records.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'hrow';
      var net = chipDelta(r.heroNet, r.heroNetBB);
      var netCls = r.heroNet > 0 ? 'pos' : r.heroNet < 0 ? 'neg' : '';
      var left = document.createElement('div');
      left.className = 'hrow-main';
      left.innerHTML = '<span class="hnum">Hand #' + r.handNo + '</span>' +
        '<span class="hdate">' + escapeHtml(fmtReplayDate(r.date)) + ' · ' + escapeHtml(r.mode) + '</span>' +
        '<span class="hres ' + netCls + '">' + escapeHtml(net) + '</span>';
      var hc = document.createElement('span');
      hc.className = 'hcards';
      (r.heroHole || []).forEach(function (c) { hc.appendChild(cardEl(c, true)); });
      left.appendChild(hc);
      var btn = document.createElement('button');
      btn.className = 'ghost rp-open';
      btn.textContent = 'Replay →';
      btn.setAttribute('aria-label', 'Replay hand ' + r.handNo);
      btn.onclick = function () { onOpen(r.id); };
      row.appendChild(left);
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  function describeReplayAction(a) {
    var who = a.name + (a.emoji ? ' ' + a.emoji : '');
    switch (a.action) {
      case 'fold': return who + ' folds';
      case 'check': return who + ' checks';
      case 'call': return who + ' calls ' + fmt(a.bet);
      case 'bet': return who + ' bets ' + fmt(a.amount);
      case 'raise': return who + ' raises to ' + fmt(a.amount);
      case 'sb': return who + ' posts small blind ' + fmt(a.amount);
      case 'bb': return who + ' posts big blind ' + fmt(a.amount);
      case 'ante': return who + ' posts ante ' + fmt(a.amount);
      default: return who + ' ' + a.action;
    }
  }

  // ---------- hand story ----------
  // A clean, phone-readable narrative of a finished hand (PokerStars-style
  // hand history). No stepping, no board chrome — just scroll and read what
  // happened. Built from the same timeline the stepper uses.
  function cardText(c) { return rankChar(c.r) + SUITS[c.s]; }

  function renderHandStory(rec) {
    var list = $('hand-list'), view = $('replay-view');
    list.hidden = true; view.hidden = false; view.innerHTML = '';
    var head = document.createElement('div');
    head.className = 'rp-head';
    head.innerHTML = '<div><div class="rp-title">Hand #' + rec.handNo + '</div>' +
      '<div class="fineprint">' + escapeHtml(fmtReplayDate(rec.date)) + ' · ' + escapeHtml(rec.mode) +
      ' · blinds ' + fmt(rec.sb) + '/' + fmt(rec.bb) + '</div></div>';
    var back = document.createElement('button');
    back.className = 'ghost'; back.id = 'rp-back'; back.textContent = '← Hands';
    head.appendChild(back);
    view.appendChild(head);

    var toggle = document.createElement('div');
    toggle.className = 'rp-controls';
    toggle.innerHTML = '<button class="ghost" id="rp-steps">▶️ Step through</button>' +
      '<span class="fineprint">story view</span>';
    view.appendChild(toggle);

    var story = document.createElement('div');
    story.className = 'rp-story';
    var html = '';
    if (rec.heroHole && rec.heroHole.length === 2) {
      html += '<div class="rp-story-hero">Your hand: <b>' +
        rec.heroHole.map(function (c) { return escapeHtml(cardText(c)); }).join(' ') + '</b></div>';
    }
    var streetNames = { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River' };
    var sections = [], sec = null;
    (rec.timeline || []).forEach(function (e) {
      if (e.t === 'street') {
        sec = { street: e.street, board: e.community || [], pot: e.pot || 0, lines: [] };
        sections.push(sec);
      } else if (e.t === 'action') {
        var st = e.street || 'preflop';
        if (!sec || sec.street !== st) { sec = { street: st, board: null, pot: e.pot || 0, lines: [] }; sections.push(sec); }
        sec.lines.push(describeReplayAction(e));
        if (e.pot) sec.pot = e.pot;
      }
    });
    sections.forEach(function (s) {
      html += '<div class="rp-story-sec"><div class="rp-story-street">' +
        escapeHtml(streetNames[s.street] || s.street);
      if (s.board && s.board.length) {
        html += ' ' + s.board.map(function (c) { return escapeHtml(cardText(c)); }).join(' ');
      }
      html += ' <span class="hint">· pot ' + fmt(s.pot) + '</span></div>';
      s.lines.forEach(function (ln) {
        html += '<div class="rp-story-line">' + escapeHtml(ln) + '</div>';
      });
      html += '</div>';
    });
    // Result
    var end = (rec.timeline || []).filter(function (e) { return e.t === 'end'; })[0];
    if (end && end.winners && end.winners.length) {
      html += '<div class="rp-story-result">' + end.winners.map(function (w) {
        var nm = w.names.map(escapeHtml).join(' & ');
        var label = w.uncalled ? ' takes back (uncalled)' : ' win';
        return '<div>' + nm + escapeHtml(label) + ' <b>' + fmt(w.amount) + '</b>' +
          (w.hand ? ' <span class="hint">' + escapeHtml(w.hand) + '</span>' : '') + '</div>';
      }).join('') + '</div>';
    }
    if (rec.heroNet != null) {
      var hn = rec.heroNet;
      html += '<div class="rp-story-net ' + (hn > 0 ? 'pos' : hn < 0 ? 'neg' : '') + '">You ' +
        chipDelta(hn, rec.heroNetBB) + '</div>';
    }
    if (!html) html = '<p class="hint">No actions recorded for this hand.</p>';
    story.innerHTML = html;
    view.appendChild(story);
  }

  // Render the replay viewer for record `rec` at frame `idx`
  // (idx = number of timeline entries applied). Buttons carry stable ids;
  // app.js wires them after each render.
  function renderReplay(rec, idx) {
    var list = $('hand-list'), view = $('replay-view');
    list.hidden = true; view.hidden = false; view.innerHTML = '';
    var st = replayState(rec, idx);
    var streetNames = { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River' };

    var head = document.createElement('div');
    head.className = 'rp-head';
    head.innerHTML = '<div><div class="rp-title">Hand #' + rec.handNo + '</div>' +
      '<div class="fineprint">' + escapeHtml(fmtReplayDate(rec.date)) + ' · ' + escapeHtml(rec.mode) +
      ' · blinds ' + fmt(rec.sb) + '/' + fmt(rec.bb) + (rec.ante ? ' (ante ' + fmt(rec.ante) + ')' : '') + '</div></div>';
    var back = document.createElement('button');
    back.className = 'ghost'; back.id = 'rp-back'; back.textContent = '← Hands';
    head.appendChild(back);
    view.appendChild(head);

    var board = document.createElement('div');
    board.className = 'rp-board';
    var heroRow = document.createElement('div');
    heroRow.className = 'rp-hero';
    var yl = document.createElement('span');
    yl.className = 'rp-you'; yl.textContent = 'You';
    heroRow.appendChild(yl);
    (rec.heroHole || []).forEach(function (c) { heroRow.appendChild(cardEl(c, true)); });
    board.appendChild(heroRow);
    var comm = document.createElement('div');
    comm.className = 'rp-community';
    if (!st.community.length) comm.innerHTML = '<span class="hint">no community cards yet</span>';
    st.community.forEach(function (c) { comm.appendChild(cardEl(c, true)); });
    board.appendChild(comm);
    var potLine = document.createElement('div');
    potLine.className = 'rp-pot';
    potLine.innerHTML = 'Pot: <b>' + fmt(st.pot) + '</b> <span class="hint">· ' +
      escapeHtml(streetNames[st.street] || st.street) + '</span>';
    board.appendChild(potLine);
    view.appendChild(board);

    var acts = document.createElement('div');
    acts.className = 'rp-actions';
    acts.setAttribute('aria-live', 'polite');
    if (!st.actions.length) {
      acts.innerHTML = '<div class="hint">No actions yet — step forward.</div>';
    } else {
      st.actions.forEach(function (a) {
        var line = document.createElement('div');
        line.className = 'rp-act';
        line.innerHTML = '<span class="rp-street">' + escapeHtml(a.street) + '</span> ' +
          escapeHtml(describeReplayAction(a));
        acts.appendChild(line);
      });
      acts.scrollTop = acts.scrollHeight;
    }
    view.appendChild(acts);

    if (st.done && st.winners && st.winners.length) {
      var res = document.createElement('div');
      res.className = 'rp-result';
      res.innerHTML = st.winners.map(function (w) {
        var nm = w.names.map(escapeHtml).join(' &amp; ');
        var label = w.uncalled ? ' takes back (uncalled)' : w.byFold ? ' win' : ' win';
        return '<div>' + nm + escapeHtml(label) + ' <b>' + fmt(w.amount) + '</b>' +
          (w.hand ? ' <span class="hint">' + escapeHtml(w.hand) + '</span>' : '') + '</div>';
      }).join('');
      view.appendChild(res);
    }

    var ctl = document.createElement('div');
    ctl.className = 'rp-controls';
    function mkBtn(id, label, disabled, title) {
      var b = document.createElement('button');
      b.className = 'ghost'; b.id = id; b.textContent = label;
      b.disabled = !!disabled;
      if (title) b.title = title;
      return b;
    }
    ctl.appendChild(mkBtn('rp-start', '⏮ Start', idx <= 0));
    ctl.appendChild(mkBtn('rp-prev', '◀ Prev', idx <= 0));
    ['preflop', 'flop', 'turn', 'river'].forEach(function (s) {
      var b = mkBtn('rp-street-' + s, streetNames[s], false, 'Jump to ' + streetNames[s]);
      b.dataset.street = s;
      ctl.appendChild(b);
    });
    ctl.appendChild(mkBtn('rp-next', 'Next ▶', st.done));
    ctl.appendChild(mkBtn('rp-end', 'End ⏭', st.done));
    ctl.appendChild(mkBtn('rp-story', '📖 Story', false, 'Read the full hand as a story'));
    view.appendChild(ctl);

    var prog = document.createElement('div');
    prog.className = 'fineprint rp-progress';
    prog.textContent = 'Step ' + st.idx + ' of ' + st.total;
    view.appendChild(prog);
  }

  // ---------- misc ----------
  function fmt(n) {
    n = Math.round(n);
    return n.toLocaleString('en-US');
  }
  // Chip delta: "+1,250" / "-340". Falls back to BB text for records saved
  // before chip amounts were stored (old localStorage entries).
  function chipDelta(chips, bb) {
    if (chips == null || isNaN(chips)) {
      var b = Math.round((bb || 0) * 10) / 10; // no float garbage like -13.437999999999999
      return (b >= 0 ? '+' : '') + b + ' bb';
    }
    var c = Math.round(chips);
    return (c > 0 ? '+' : '') + fmt(c);
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function setBankroll(chips) {
    var el = $('bankroll-chip');
    var c = Math.round(chips);
    el.textContent = (c > 0 ? '+' : '') + fmt(c) + ' session';
    el.className = 'bankroll ' + (c > 0 ? 'pos' : c < 0 ? 'neg' : '');
  }

  return {
    showScreen: showScreen, renderRoster: renderRoster,
    buildSeats: buildSeats, seatPos: seatPos, renderTable: renderTable,
    cardEl: cardEl, cardBackEl: cardBackEl,
    setControls: setControls, disableControls: disableControls, openBetPanel: openBetPanel,
    log: log, clearLog: clearLog, coachTip: coachTip, winnerBanner: winnerBanner, modal: modal,
    showHandEndControls: showHandEndControls, hideHandEndControls: hideHandEndControls,
    handWinAmount: handWinAmount, firstWinnersTotal: firstWinnersTotal,
    renderArchetypes: renderArchetypes, renderStats: renderStats, renderLearn: renderLearn,
    renderPFScenario: renderPFScenario, renderPFFeedback: renderPFFeedback,
    renderHandList: renderHandList, renderReplay: renderReplay,
    renderHandStory: renderHandStory,
    chipFly: chipFly, resetTableFx: resetTableFx,
    fmt: fmt, escapeHtml: escapeHtml, setBankroll: setBankroll
  };
})();
// Guarded Node export for headless geometry tests (browser: `module` is undefined).
if (typeof module !== 'undefined' && module.exports) module.exports = UI;
