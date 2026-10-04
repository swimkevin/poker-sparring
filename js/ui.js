// ui.js — DOM rendering for Poker Sparring. No game decisions here; app.js conducts.

var UI = (function () {
  function $(id) { return document.getElementById(id); }

  function showScreen(name) {
    ['setup', 'table', 'pf', 'archetypes', 'stats'].forEach(function (s) {
      $('screen-' + s).hidden = (s !== name);
    });
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.nav === name || (name === 'pf' && b.dataset.nav === 'setup'));
    });
    window.scrollTo(0, 0);
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
      btn.innerHTML = '<span class="emoji">' + b.emoji + '</span>' +
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
    d.innerHTML = '<div class="ah"><span class="aemoji">' + a.emoji + '</span>' +
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
    var cards = [
      ['Hands', d.hands], ['Win %', d.winRate.toFixed(1)],
      ['bb / 100', d.bbPer100.toFixed(1)], ['VPIP %', d.vpip.toFixed(1)],
      ['PFR %', d.pfr.toFixed(1)], ['Aggr. factor', d.af >= 99 ? '∞' : d.af.toFixed(2)],
      ['Biggest pot', d.biggestPotBB.toFixed(0) + ' bb']
    ];
    var box = $('stat-cards');
    box.innerHTML = '';
    cards.forEach(function (c) {
      var el = document.createElement('div');
      el.className = 'stat-card';
      el.innerHTML = '<div class="sk">' + c[0] + '</div><div class="sv">' + c[1] + '</div>';
      box.appendChild(el);
    });
    drawSparkline(s.graph);
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
    renderArchetypes: renderArchetypes, renderStats: renderStats,
    renderPFScenario: renderPFScenario, renderPFFeedback: renderPFFeedback,
    fmt: fmt, escapeHtml: escapeHtml, setBankroll: setBankroll
  };
})();
