#!/usr/bin/env node
// Coach scenario verification — tests specific poker spots without a browser.
// Usage: node tests/coach-scenarios.js
//
// Each scenario sets up a specific situation and verifies the coach:
// 1. Renders (not null/blank)
// 2. Gives the expected advice type
// 3. Contains no jargon
// 4. Has no contradictions

// We verify the pure functions and static code patterns that don't need DOM.
// The coach logic is in app.js but requires table, handRec, etc.

console.log('=== Coach Scenario Verification ===\n');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ FAIL: ' + msg); }
}

// Load app.js source for static analysis
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
const equitySrc = fs.readFileSync(__dirname + '/../js/equity.js', 'utf8');

console.log('1. Limpers branch condition (v1.8.63 critical bug)');
{
  // The fix: nRaises === 0 && countLimpers() > 0
  // NOT: spot === 'open' (wrong — limpers are 'facing-open')
  const hasCorrectCondition = src.includes('nRaises === 0 && countLimpers() > 0');
  ok(hasCorrectCondition, 'limpers branch uses nRaises===0 check');
  
  const hasWrongCondition = /if \(spot === 'open' && countLimpers\(\)/.test(src);
  ok(!hasWrongCondition, 'no stale spot==="open" limpers check');
}

console.log('\n1. posName destructured in coachPreflop (v1.8.65 critical bug)');
{
  // The fix: var V = c.V, vIdx = c.vIdx, vName = c.vName, tier = c.tier, posName = c.posName;
  const match = src.match(/function coachPreflop\(c\) \{[^}]*var V = c\.V[^;]*;/s);
  const hasPosName = match && match[0].includes('posName = c.posName');
  ok(hasPosName, 'posName destructured in coachPreflop');
}

console.log('\n2. countLimpers only counts pre-raise calls (v1.8.62 fix)');
{
  const fnMatch = src.match(/function countLimpers\(\) \{[\s\S]*?\n  \}/);
  const fn = fnMatch ? fnMatch[0] : '';
  ok(fn.includes('!raised'), 'countLimpers tracks raised flag');
  ok(fn.includes("t.action === 'call' && !raised"), 'only counts calls before raise');
}

console.log('\n3. handClass: board pair ≠ hero pair (v1.8.62 fix)');
{
  ok(src.includes('heroHasPair'), 'handClass checks heroHasPair');
  ok(src.includes("if (!heroHasPair) return 'air'"), 'board pair without hero card → air');
}

console.log('\n4. No multiway semi-bluffs (v1.8.62 fix)');
{
  // Should check multiway before suggesting semi-bluff
  const drawSection = src.match(/Draws: semi-bluff[\s\S]*?if \(multiway\)/);
  ok(!!drawSection, 'multiway check before semi-bluff');
}

console.log('\n5. Jargon-free coach');
{
  const jargon = ['3-bet range', 'TAG poker', 'solid TAG', 'unreadable — play'];
  const coachLines = src.match(/mkVerdict\([^)]*'[^']*'/g) || [];
  let foundJargon = [];
  jargon.forEach(j => {
    if (src.includes("'" + j + "'") || src.includes('"' + j + '"')) {
      // Check if it's in a coach message (not a comment)
      const inMkVerdict = coachLines.some(l => l.includes(j));
      if (inMkVerdict) foundJargon.push(j);
    }
  });
  // Also check equity.js exploit lines
  const badExploit = ['3-bet strong hands', 'never float light', 'tournament TAG', 'solid TAG'];
  badExploit.forEach(j => {
    if (equitySrc.includes(j)) foundJargon.push('equity.js: ' + j);
  });
  ok(foundJargon.length === 0, 'no jargon in coach messages' + (foundJargon.length ? ' (found: ' + foundJargon.join(', ') + ')' : ''));
}

console.log('\n6. Friend bot archetypes have exploit lines');
{
  // v1.8.75: opponentReads uses exploitLine() directly; friend-bot lines
  // live in EXPLOIT_LINES (js/equity.js).
  const eqSrc = require('fs').readFileSync('js/equity.js', 'utf8');
  const reads = ['alice', 'rohan', 'swimkev'];
  const missing = reads.filter(id => !eqSrc.includes(id + ':'));
  ok(missing.length === 0, 'all friend bots have exploit lines' + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''));
}

console.log('\n7. Debug mode and test hooks (v1.8.64 hardening)');
{
  ok(src.includes('window.__coachDebug'), 'coach debug flag exists');
  ok(src.includes('coachdebug=1'), 'URL param debug support');
  ok(src.includes('testScenario'), 'testScenario hook exists');
  ok(src.includes('enableDebug'), 'enableDebug hook exists');
  ok(src.includes('[coach] verdict failed'), 'error logging in debug mode');
}

console.log('\n8. posName destructured in coachPostflop (v1.8.68 critical bug)');
{
  // The fix: var V = c.V, vIdx = c.vIdx, vName = c.vName, posName = c.posName;
  // Without it, the air-bluff branch (checkedAround) throws ReferenceError
  // when currentBet === 0, the try/catch swallows it, and the coach panel
  // goes blank on checked-around streets.
  const match = src.match(/function coachPostflop\(c\) \{[^}]*var V = c\.V[^;]*;/s);
  const hasPosName = match && match[0].includes('posName = c.posName');
  ok(hasPosName, 'posName destructured in coachPostflop');
  ok(!/var checkedAround = table\.currentBet === 0 && \(posName/.test(src) ||
     hasPosName, 'checkedAround posName read is guarded by destructure');
}

console.log('\n9. Iso-raise option for 2+ limpers in late/middle (v1.8.71)');
{
  // Kevin's spot: A4o (tier 5) in MP with 2 limpers + dead money got a flat
  // "fold" because the iso-raise gate required 3+ limpers on button/cutoff.
  // Now 2+ limpers in button/cutoff/middle with a playable hand offers the
  // iso-raise as an option instead of a bare fold.
  ok(src.includes("countLimpers() >= 2 && (posName === 'button' || posName === 'cutoff' || posName === 'middle position')"),
    'iso-raise branch covers 2+ limpers in button/cutoff/middle');
  ok(src.includes('attack the dead money'), 'iso-raise message mentions dead money');
}

console.log('\n10. No single-villain read in limped multiway pots (v1.8.71)');
{
  // Kevin's spot showed "vs Amogh" with 4+ players in a limped pot — the
  // read is noise when nobody has raised. The tail must be suppressed for
  // limped multiway pots, not just 3+ limpers.
  ok(src.includes('limpedMulti'), 'limpedMulti suppression exists');
  ok(/limpedMulti = table\.street === 'preflop' && table\.currentBet <= table\.bb && isMultiway\(\)/.test(src),
    'limpedMulti requires preflop, no raise, and multiway');
  ok(/var tail = \(isMultiLimp \|\| limpedMulti \|\| multiwayNoAggro\)/.test(src),
    'tail suppressed for limped multiway pots');
}

console.log('\n11. Engine: no betting round with 0-1 actors (v1.8.71)');
{
  // Kevin's hand: Amogh all-in on the turn, hero has 5 chips left. River was
  // dealt and hero was asked to act with nobody to bet against — hand stuck.
  // _bettingComplete must skip the round when the sole actor has no bet to
  // match (but NOT when they still must call/fold vs a shove).
  const engineSrc = fs.readFileSync('js/engine.js', 'utf8');
  ok(/if \(actors\.length === 1 && actors\[0\]\.bet >= self\.currentBet\) return true;/.test(engineSrc),
    '_bettingComplete skips round for solo actor with no bet to match');
}

console.log('\n12. Range ratio uses pot-before-bet (v1.8.71)');
{
  // t.pot includes the bet just made (engine emits post-action). Amogh's
  // 225-into-135 flop overbet read as 225/360=0.625 → 'wide' → coach said
  // call with ace-high. True ratio is 225/135=1.67 → polarized.
  ok(src.includes('var ratio = size / Math.max(1, pot - size);'),
    'estimateVillainRange divides by pot-before-bet');
}

console.log('\n13. Polarized range from non-bluffer treated as strong (v1.8.71, v1.8.99)');
{
  // Amogh (bluff 0.15) shoving polarized = strong, not bluffy. v1.8.99:
  // equity is simulated vs the villain's actual tier-bounded range instead
  // of vs random hands with a x0.75 fudge — the fudge's number is what
  // Kevin disputed (52% shown for J4 vs Amogh's bomb).
  ok(src.includes('polarStrong'), 'polarStrong flag exists');
  ok(/polarStrong = range\.label === 'polarized' && \(tight > 0\.6 \|\| bluffy < 0\.25\)/.test(src),
    'polarized + tight or non-bluffer counts as strong');
  ok(src.includes('estimateEquityVsRangePostflop'), 'range-based postflop equity used');
  ok(src.includes('var rangeEqTier = polarStrong ? 2 : (range.label === \'strong\' ? 3 : 0);'),
    'polarized-strong maps to tier 2, strong to tier 3');
  ok(!src.includes('eq2 *= 0.75'), 'x0.75 fudge removed');
  ok(!src.includes('rangeAdjust += (polarStrong ? 0.12'), 'strength bar-bump removed (range priced into equity)');
}

console.log('\n14. Recap never says "well played" for a losing hand (v1.8.71)');
{
  // Kevin's hand: lost 980 following the flop call, recap still praised it.
  ok(!/else if \(good\) \{/.test(src), 'no unconditional "well played" on good');
  ok(src.includes("} else if (good && won) {"), 'praise gated on winning the hand');
  ok(src.includes("Tough loss \u2014 you stuck to the plan"), 'neutral process note for followed-plan losses');
}

console.log('\n15. Beginner-friendly pot odds and bluff-catching (v1.8.71)');
{
  ok(src.includes("Pot odds: calling <b>' + fmt(toCall) + '</b> to win <b>' + fmt(pot)"),
    'math line explains pot odds as price vs prize');
  ok(src.includes('to break even'), 'math line states the break-even meaning');
  ok(src.includes('bluffCatchNote'), 'bluff-catching concept note exists');
  ok(src.includes("Bluff-catching = calling hoping they're bluffing"), 'bluff-catching explained in plain English');
}

console.log('\n16. Hand log records ALL hole cards incl. folded (v1.8.71)');
{
  // Kevin: hand history shows every player's hand, even folded early.
  // Training app — no hidden info after the hand is over.
  const replaySrc = fs.readFileSync('js/replay.js', 'utf8');
  ok(replaySrc.includes('rec.allHands = '), 'finishHandRecord writes rec.allHands');
  ok(replaySrc.includes('tp.hole.map(rpCard)'), 'opponent cards read from table (incl. folded)');
  ok(/hole: hole, isHero/.test(replaySrc), 'allHands entries carry name/emoji/hole/isHero');
}

console.log('\n17. Opponent reads shown once per hand (v1.8.72, v1.8.103)');
{
  // The static reads block repeated on every street's first verdict → 900+
  // char messages (10-hand loop). Now shown on the hand's first verdict only,
  // using short taglines instead of full exploit lines.
  ok(src.includes("coachDecisions.length === 0 ? opponentReads()"),
    'reads shown on first verdict of the hand only');
  ok(!src.includes("isNewStreet"), 'no per-street reads trigger');
  ok(src.includes("String(A.tagline)"), 'reads use short taglines');
}

console.log('\n18. Cash/tourney rosters top up to 7 bots (v1.8.71)');
{
  // Kevin's cash game showed 6 bots; default is 7. Stale saves persist.
  ok(src.includes('function topUpRoster()'), 'topUpRoster exists');
  ok(src.includes("if (mode === 'hu') return;"), 'heads-up untouched (stays 1)');
  // v1.8.88: ensures ALL defaults present, swaps out non-defaults.
  ok(src.includes('var missing = defaults.filter'), 'tops up missing defaults');
}

console.log('\n19. Hand-end pause button + 13s auto-deal (v1.8.71)');
{
  const uiSrc = fs.readFileSync('js/ui.js', 'utf8');
  ok(uiSrc.includes("id = 'btn-pause-auto'"), 'pause button rendered');
  ok(/paused = !paused/.test(uiSrc), 'pause toggles countdown');
  ok(src.includes('autoMs: 13000'), 'auto-deal is 13s (was 10s)');
}

console.log('\n20. Honest equity vs strong ranges (v1.8.71, v1.8.99)');
{
  // Kevin's J4 vs Amogh: the old message showed 52%-vs-random then said
  // "fold" (contradictory). v1.8.99: the win-% is simulated vs the
  // villain's actual strong range on this board, so the number shown is the
  // number the advice is based on — no inflated figure, no fudge factor.
  ok(src.includes("s strong range'"), 'range named in the math line vs strong ranges');
  ok(src.includes('(pays for itself)'), 'break-even explained');
  ok(src.includes("'simulated 150× vs ' + vName + '\\'s strong range'") ||
     src.includes("simulated 150× vs ' + vName + '"), 'equity source names the strong range');
}

console.log('\n21. Win-% estimation explained (v1.8.71)');
{
  // Kevin: explain how the "you win X%" is calculated, beginner-friendly.
  ok(src.includes('simulated 150× vs random hands'), 'Monte Carlo explained');
  ok(!src.includes('lowered for their strength'), 'no more fudge-factor wording');
}

console.log('\n22. v1.8.74: made straight+ beats draw label, bullets, no solo villain multiway');
{
  // Kevin's 7cJc on 9c3d8dTc: J-high straight + flush redraw was called
  // "semi-bluff". handClass must check ev.cat >= 4 before draw labels.
  // (v1.8.101 restructured the line to add the 'board' class — the ordering
  // guarantee is what matters.)
  var catIdx = src.indexOf('ev.cat >= 4');
  var drawIdx = src.indexOf("return 'draw-strong'");
  ok(catIdx !== -1 && drawIdx !== -1 && catIdx < drawIdx,
    'made straight+ classified before draw labels');
  ok(src.includes("if (boardOnly) return 'board';"),
    'board-play (no hole card in best 5) classified separately');
  // Table reads back to bullet points (Kevin).
  ok(src.includes("reads.join('<br>\u2022 ')"),
    'table reads use bullet points');
  // Multiway with no aggressor: no single-villain range note or vs-line.
  ok(src.includes("var noAggro = isMultiway()"),
    'rangeNote suppressed multiway with no aggressor');
  ok(src.includes("multiwayNoAggro"),
    'vs-line suppressed multiway with no aggressor');
}

console.log('\n23. v1.8.75: no "great spot to raise" after a raise; exploit vs-line');
{
  // Kevin: 3 limps then Shark raised to 55 — coach said Fold but the note
  // said "great spot to raise and take it down". Contradiction.
  ok(src.includes("limps >= 3 && table.currentBet <= table.bb"),
    'multiway raise note suppressed once someone raises');
  // v1.8.103: the per-villain vs-line still uses the full exploit line;
  // the table bullets use short taglines (see section 17).
  ok(src.includes("exploitLine(V.archetype)"),
    'vs-line uses full exploit line');
}

console.log('\n24. v1.8.76: Rohan bluffs sometimes, Donald bot exists');
{
  const botSrc = require('fs').readFileSync('js/bots.js', 'utf8');
  // Rohan: 15% bluff (bluff 0.68 * 0.22), bluffs pass neverRaise gate
  ok(botSrc.includes("bluffThrough: 1.0"), 'rohan bluffs pass gate');
  ok(botSrc.includes("mv.bluff && A.bluffThrough"),
    'neverRaise gate checks bluff flag');
  // Donald: air bluffs toned down v1.8.102 (bluff 0.5 * 0.22 = 11%
  // heads-up river; was 1.0). Draw semi-bluffs stay at hardcoded 65%.
  var dBluff = (botSrc.match(/id: 'donald'[\s\S]{0,1500}?bluff: ([0-9.]+)/) || [])[1];
  ok(dBluff === '0.5', 'donald bluff param is 0.5 (got ' + dBluff + ')');
  // Donald: right below Alice, tighter than Rohan, sticky + semi-bluffs
  var aliceIdx = botSrc.indexOf("id: 'alice'");
  var donaldIdx = botSrc.indexOf("id: 'donald'");
  var lagIdx = botSrc.indexOf("id: 'lag'");
  ok(donaldIdx > aliceIdx && donaldIdx < lagIdx, 'donald sits below alice');
  ok(botSrc.includes("stubborn: 0.90") && botSrc.includes("id: 'donald'"),
    'donald is sticky (stubborn 0.90)');
  const eqSrc = require('fs').readFileSync('js/equity.js', 'utf8');
  ok(eqSrc.includes("donald:"), 'donald has exploit line');
}

console.log('\n25. v1.8.78: Donald semi-bluffs + Amogh-style bombs');
{
  const botSrc = require('fs').readFileSync('js/bots.js', 'utf8');
  ok(botSrc.includes("function donaldPostflop"), 'donaldPostflop exists');
  ok(/A\.id === 'donald'/.test(botSrc) && botSrc.includes("donaldPostflop(table, p,"),
     'donaldPostflop dispatched internally by archetype id');
  ok(botSrc.includes("Semi-bluff: Donald"), 'semi-bluff logic present');
  ok(botSrc.includes("Ahead but vulnerable"), 'big-bet-when-vulnerable logic present');
}

console.log('\n26. v1.8.80: Donald overbet not auto-folded as nuts');
{
  const botSrc = require('fs').readFileSync('js/bots.js', 'utf8');
  ok(botSrc.includes("wideOverbet: true"), 'donald has wideOverbet flag');
  ok(src.includes("V.archetype.wideOverbet"), 'coach exempts wideOverbet from nuts fold');
}

console.log('\n27. v1.8.83: uncalled refund is not a "win"');
{
  const appSrc = require('fs').readFileSync('js/app.js', 'utf8');
  ok(appSrc.includes("if (w.uncalled) return; // refund, not a win"),
     'heroWon skips uncalled pots');
}

console.log('\n28. v1.8.84: default rosters include Donald, use lag id, no station');
{
  const appSrc = require('fs').readFileSync('js/app.js', 'utf8');
  ok(appSrc.includes("['alice', 'donald', 'lag', 'rohan', 'amogh', 'nathan', 'shark']"),
     'cash defaults: donald in, lag (swimkev) by id, station out');
  ok(!appSrc.includes("'swimkev', 'rohan'"),
     'no stale swimkev id in defaults');
}

console.log('\n29. v1.8.101: hero plays the board (Kevin\'s QQQ77 river)');
{
  const appSrc = require('fs').readFileSync('js/app.js', 'utf8');
  // Classifier: straight+ with no hole card in the best 5 is 'board', not 'nut'.
  ok(appSrc.includes("if (boardOnly) return 'board';"),
     'handClass returns board when no hole card plays');
  // Facing a bet: fold — raising for value is impossible (no worse hand
  // exists) and a bet is never a bluff on a self-playing board.
  ok(/if \(hc === 'board'\)\s*\n?\s*return mkVerdict\('fold'/.test(appSrc),
     'board-play facing a bet advises fold');
  ok(appSrc.includes("a bet on this board is never a bluff"),
     'fold message explains why bets are never bluffs');
  // Checked to hero: check — nothing to value-bet, no fold to win.
  ok(/if \(hc === 'board'\)\s*\n?\s*return mkVerdict\('check'/.test(appSrc),
     'board-play with no bet to face advises check');
  var boardBranches = [];
  var bre = /if \(hc === 'board'\)\s*return mkVerdict\('(\w+)'/g, bm;
  while ((bm = bre.exec(appSrc))) boardBranches.push(bm[1]);
  ok(boardBranches.length === 2, 'two board-play branches (got ' + boardBranches.length + ')');
  ok(boardBranches.every(function (b) { return b === 'fold' || b === 'check'; }),
     'board-play advises only fold or check (got ' + boardBranches.join(',') + ')');
}

console.log("\n=== Results: " + pass + " passed, " + fail + " failed ===");
process.exit(fail ? 1 : 0);
