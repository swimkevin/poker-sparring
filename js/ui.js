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
    return d;
  }

  // ---------- setup screen ----------
  function renderRoster(allBots, selected) {
    var box = $('bot-roster');
    box.innerHTML = '';
    allBots.forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'roster-card' + (selected.has(b.id) ? ' selected' : '');
      btn.innerHTML = '<span class="emoji">' + escapeHtml(b.emoji) + '</span>' +
        '<span><div class="nm">' + escapeHtml(b.name) + '</div>' +
        '<div class="tg">' + escapeHtml(b.tagline) + '</div></span>' +
        '<span class="check">✓</span>';
      btn.onclick = function () {
        if (selected.has(b.id)) selected.delete(b.id); else selected.add(b.id);
        btn.classList.toggle('selected');
      };
      box.appendChild(btn);
    });
  }

  // ---------- table ----------
  function seatPos(i, n) {
    if (i === 0) return { x: 50, y: 88 };
    var theta = (90 + i * (360 / n)) * Math.PI / 180;
    return { x: 50 + 42 * Math.cos(theta), y: 50 + 40 * Math.sin(theta) };
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

  // opts: { lastActions: {idx: str}, winners: [idx], revealed: {idx: true}, acting: idx, button: idx }
  function renderTable(table, opts) {
    opts = opts || {};
    var n = table.players.length;
    // pot + community
    $('pot-display').textContent = 'Pot: ' + fmt(table.potTotal());
    var comm = $('community');
    comm.innerHTML = '';
    table.community.forEach(function (c) { comm.appendChild(cardEl(c)); });
    $('street-label').textContent = table.street === 'preflop' ? '' : table.street;

    table.players.forEach(function (p, i) {
      var s = $('seat-' + i);
      if (!s) return;
      s.querySelector('.avatar').textContent = p.isHero ? '🧑' : (p.archetype ? p.archetype.emoji : '🤖');
      s.querySelector('.pname').textContent = p.isHero ? 'You' : p.name;
      s.querySelector('.pstack').textContent = fmt(p.stack);
      s.querySelector('.pbet').textContent = p.bet > 0 ? 'bet ' + fmt(p.bet) : '';
      var pact = s.querySelector('.pact');
      pact.textContent = (opts.lastActions && opts.lastActions[i]) || '';
      var pc = s.querySelector('.pcards');
      pc.innerHTML = '';
      var showCards = p.isHero || (opts.revealed && opts.revealed[i]);
      if (!p.folded && p.hole.length === 2 && !p.sittingOut) {
        for (var k = 0; k < 2; k++) {
          pc.appendChild(showCards ? cardEl(p.hole[k], true) : cardBackEl(true));
        }
      }
      s.classList.toggle('folded', p.folded);
      s.classList.toggle('to-act', opts.acting === i && !table.handOver);
      s.classList.toggle('thinking', opts.acting === i && !p.isHero && !table.handOver);
      s.classList.toggle('winner', !!(opts.winners && opts.winners.indexOf(i) !== -1));
      s.classList.toggle('out', p.sittingOut || p.stack === 0);
      var old = s.querySelector('.dealer-btn');
      if (old) old.remove();
      if (table.button === i) {
        var db = document.createElement('div');
        db.className = 'dealer-btn'; db.textContent = 'D';
        s.appendChild(db);
      }
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

  function winnerBanner(html) {
    var w = $('winner-banner');
    if (!html) { w.hidden = true; return; }
    w.hidden = false;
    w.innerHTML = html;
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
      '<span class="aname">' + escapeHtml(a.name) + '</span></div>' +
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
      ['Biggest pot', d.biggestPotBB.toFixed(0) + ' bb']
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
        '<span class="an">' + escapeHtml(a.name || id) + '</span>' +
        '<span class="as">' + a.hands + ' hands · won ' + a.won + ' · ' +
        (a.profitBB >= 0 ? '+' : '') + a.profitBB.toFixed(1) + ' bb</span>';
      at.appendChild(row);
    });
    var hl = $('history-list');
    hl.innerHTML = '';
    if (!s.history.length) hl.innerHTML = '<p class="subtitle">No hands yet.</p>';
    s.history.slice(0, 20).forEach(function (h) {
      var row = document.createElement('div');
      row.className = 'hist-row';
      var p = h.profitBB >= 0 ? 'pos' : 'neg';
      row.innerHTML = '<span>#' + h.n + '</span><span class="hc">' + h.hole.join(' ') + '</span>' +
        '<span>' + escapeHtml(h.result || '') + '</span>' +
        '<span class="' + p + '">' + (h.profitBB >= 0 ? '+' : '') + h.profitBB + ' bb</span>';
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
      var net = (r.heroNetBB > 0 ? '+' : '') + r.heroNetBB + ' bb';
      var netCls = r.heroNetBB > 0 ? 'pos' : r.heroNetBB < 0 ? 'neg' : '';
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
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function setBankroll(bb) {
    var el = $('bankroll-chip');
    el.textContent = (bb >= 0 ? '+' : '') + Math.round(bb) + ' bb session';
    el.className = 'bankroll ' + (bb > 0 ? 'pos' : bb < 0 ? 'neg' : '');
  }

  return {
    showScreen: showScreen, renderRoster: renderRoster,
    buildSeats: buildSeats, renderTable: renderTable,
    cardEl: cardEl, cardBackEl: cardBackEl,
    setControls: setControls, disableControls: disableControls, openBetPanel: openBetPanel,
    log: log, clearLog: clearLog, coachTip: coachTip, winnerBanner: winnerBanner, modal: modal,
    renderArchetypes: renderArchetypes, renderStats: renderStats, renderLearn: renderLearn,
    renderPFScenario: renderPFScenario, renderPFFeedback: renderPFFeedback,
    renderHandList: renderHandList, renderReplay: renderReplay,
    fmt: fmt, escapeHtml: escapeHtml, setBankroll: setBankroll
  };
})();
