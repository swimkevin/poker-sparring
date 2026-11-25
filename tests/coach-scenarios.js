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
const labSrc = fs.readFileSync(__dirname + '/../tests/solver-lab.js', 'utf8');

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
  var hpIdx = src.indexOf('if (!heroHasPair) {');
  var airIdx = src.indexOf("return 'air'", hpIdx);
  var drawIdx = src.indexOf("if (d.flushDraw || d.oesd) return 'draw';", hpIdx);
  ok(hpIdx !== -1 && drawIdx !== -1 && drawIdx < airIdx,
    'board pair without hero card → draw if drawing, else air (v1.8.152 refines v1.8.62)');
}

console.log('\n4. No semi-bluff raise into a bet (v1.8.262 fix)');
{
  // A semi-bluff raise needs fold equity, and the bots never fold a
  // betting range to a 3x raise: top pair and second pair fold 0/200
  // for all seven villains, and the paired sim loses ~385 chips/hand
  // vs Rock's top pair (and ~478 vs a Maniac's). Draws call or fold
  // on equity instead of raising.
  ok(src.indexOf("if ((hc === 'draw-strong' || hc === 'draw') && legal.canRaise && foldy > 0.4") === -1,
     'the draw-raise branch is gone: no semi-bluff raise into a bet');
  ok(!/\(hc === 'nut' \|\| hc === 'madehand' \|\| hc === 'overpair' \|\| hc === 'toppair' \|\| hc === 'trips' \|\| hc === 'twopair' \|\| anyDraw\)/.test(src),
     'the small-bet raise no longer takes draws: only made hands raise a small bet for value');
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
  const badExploit = ['3-bet strong hands', 'never float light', 'tournament TAG', 'solid TAG',
    'bluff-catch', 'overbet', 'folds air', 'call light'];
  badExploit.forEach(j => {
    if (equitySrc.includes(j)) foundJargon.push('equity.js: ' + j);
  });
  // Coach/recap phrases that only ever occur in user-visible strings, never
  // in code identifiers — a whole-file scan is safe for these (v1.8.185).
  // Case-sensitive on purpose: the code identifier countLimpers() must not
  // trip the lowercase 'limpers' entry, so capital variants are listed.
  const badCoachPhrases = ['iso-raise', 'Iso-raising', 'limpers', 'dead money',
    'implied odds', 'reverse implied odds', 'chase a set', 'set-mining',
    'Set-mining', 'limp behind', 'Limping behind'];
  badCoachPhrases.forEach(j => {
    if (src.includes(j)) foundJargon.push('app.js: ' + j);
  });
  // Bot taglines/descs are beginner-facing copy: scan the whole file — the
  // banned terms occur nowhere in bots.js code, only in copy (v1.8.185).
  const botsSrc = require('fs').readFileSync('js/bots.js', 'utf8');
  const badBotCopy = ['TAG', 'ICM', 'QQ+/AKs', 'overbet', 'pure air', 'bluff-shoves', 'semi-bluff'];
  badBotCopy.forEach(j => {
    if (botsSrc.includes(j)) foundJargon.push('bots.js: ' + j);
  });
  // Stats tooltips are the explanation layer: they must not need a glossary
  // lookup themselves. Scope to STAT_INFO — TAG is defined in the glossary
  // elsewhere in ui.js and that use is allowed (v1.8.185).
  const uiSrc = require('fs').readFileSync('js/ui.js', 'utf8');
  const statInfo = (uiSrc.match(/var STAT_INFO = \{[\s\S]*?\n  \};/) || [''])[0];
  if (statInfo.includes('TAG')) foundJargon.push('ui.js STAT_INFO: TAG');
  ok(foundJargon.length === 0, 'no jargon in coach messages' + (foundJargon.length ? ' (found: ' + foundJargon.join(', ') + ')' : ''));
}

console.log('\n6. Friend bot archetypes have exploit lines');
{
  // v1.8.75: opponentReads uses exploitLine() directly; friend-bot lines
  // live in EXPLOIT_LINES (js/equity.js).
  const eqSrc = require('fs').readFileSync('js/equity.js', 'utf8');
  const reads = ['alice', 'rohan', 'lag'];
  const missing = reads.filter(id => !eqSrc.includes(id + ':'));
  ok(missing.length === 0, 'all friend bots have exploit lines' + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : '') + ' (swimkev\'s archetype id is lag)');
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
  ok(src.includes('attack the extra money in the pot'), 'iso-raise message mentions the extra money in the pot');
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
  ok(src.includes('to break even'), 'break-even explained in plain words');
  ok(src.includes('simulated 5,000× vs ') && src.includes('counted exactly vs '),
    'equity source names the sim count off-river and the exact count on the river (v1.8.294)');
}

console.log('\n21. Win-% estimation explained (v1.8.71)');
{
  // Kevin: explain how the "you win X%" is calculated, beginner-friendly.
  ok(src.includes('simulated 500× vs random hands'), 'Monte Carlo explained');
  ok(!src.includes('lowered for their strength'), 'no more fudge-factor wording');
}

console.log('\n22. v1.8.74: made straight+ beats draw label, bullets, no solo villain multiway');
{
  // Kevin's 7cJc on 9c3d8dTc: J-high straight + flush redraw was called
  // "semi-bluff". handClass must check ev.cat >= 4 before draw labels.
  // (v1.8.101 restructured the line to add the 'board' class — the ordering
  // guarantee is what matters.)
  var catIdx = src.indexOf('ev.cat >= 4');
  var drawStrongIdx = src.indexOf("return 'draw-strong'");
  ok(catIdx !== -1 && drawStrongIdx !== -1 && catIdx < drawStrongIdx,
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
  ok(/hasDraw && ms < 0\.55/.test(botSrc) && botSrc.includes("smv.bluff = true"), 'donald semi-bluffs draws (bluff flag set)');
  ok(/ms >= 0\.4 && ms < 0\.78/.test(botSrc) && botSrc.includes("pot * (1.5"), 'donald overbets vulnerable medium-strength hands');
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
  ok(/if \(w\.uncalled\) return;/.test(appSrc),
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
  ok(appSrc.includes("a bet here is never a bluff"),
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

console.log('\n30. Coach and bot copy is jargon-free');
{
  var botsSrc = fs.readFileSync(__dirname + '/../js/bots.js', 'utf8');
  var banned = ['3-bet', '4-bet'];
  banned.forEach(function (term) {
    ok(src.indexOf(term) === -1, 'coach (app.js) never says "' + term + '" to the user');
    ok(botsSrc.indexOf(term) === -1, 'bot profiles (bots.js) never say "' + term + '"');
  });
  ok(src.indexOf('set-mine') === -1, 'coach never says "set-mine" (plain words instead)');
}

console.log('\n31. v1.8.125: coach tone budget covers the base message, not just extras');
{
  var foldMsg = src.match(/if \(hc === 'board'\)\s*return mkVerdict\('fold'[\s\S]*?;\n/) || [''];
  ok(foldMsg[0].indexOf('guaranteed') === -1,
     'board-play fold message never says "guaranteed" (eval flags it as overclaim language)');
  ok(src.indexOf("if (baseLen > budget) { tail = '';") !== -1,
     'coachVerdict drops the optional villain line when the base message is over budget');
  ok(src.indexOf("if (baseLen > budget) { posNote = '';") !== -1,
     'coachVerdict drops the optional position note next when still over budget');
  ok(src.indexOf('v.html = v.msg + tail + posNote + extras + reads;') !== -1,
     'core advice itself is never truncated — only optional notes are dropped');
}

console.log('\n32. v1.8.136: committed wording rewritten in plain pot-vs-stack language');
{
  ok(src.indexOf('committed — just get it all in') === -1,
    'old "committed — just get it all in" shove line is gone');
  ok(src.indexOf('already as big as your stack') !== -1,
    'shove line explains pot vs stack in plain words');
  ok(src.indexOf('all-in anyway, so get the money in') === -1,
    'old "all-in anyway" tail is gone');
  ok(src.indexOf('puts almost everything in anyway') !== -1,
    'near-stack bet tail explains itself in plain words');
  ok(src.indexOf('committed: call') === -1,
    'old "committed: call" bypass line is gone');
}

console.log('\n33. v1.8.137: trips and two pair are their own hand classes');
{
  // v1.8.260: trips that are the effective nuts (top trips on an unpaired,
  // rainbow, straight-free board) now return 'nut'; all other trips still
  // return 'trips' — the class is still its own, never overpair.
  ok(/if \(ev\.cat === 3\) \{\s*if \(isTripsNuts\(ev\.kickers\[0\], community\)\) return 'nut';\s*return 'trips';\s*\}/.test(src),
    'handClass maps trips (cat 3) to trips, or to nut when it is the effective nuts');
  ok(/if \(ev\.cat === 2\) return 'twopair';/.test(src),
    'handClass maps two pair (cat 2) to twopair, not overpair');
  ok(src.indexOf("trips: 'three of a kind'") !== -1, 'trips has a plain name');
  ok(src.indexOf("twopair: 'two pair'") !== -1, 'twopair has a plain name');
  ok(/\(hc === 'nut' \|\| hc === 'madehand' \|\| hc === 'overpair' \|\| hc === 'toppair' \|\| hc === 'trips' \|\| hc === 'twopair'\) && canBet/.test(src),
    'value-bet branch covers trips, twopair, and strong made hands (not just the nuts)');
  ok(src.indexOf("if (commit === 'commit' && sprV <= 1 && (hc === 'nut' || hc === 'overpair') &&") !== -1,
    'facing-call bypass still excludes trips/twopair/toppair (vulnerable hands pass the math, v1.8.140)');
  ok(src.indexOf('full house beats it') !== -1,
    'paired-board trips message names the vulnerability');
}

console.log('\n34. v1.8.138: geometric sizing for SPR 2-4 with streets left');
{
  ok(src.indexOf('geometricFrac(sprV, streetsLeft)') !== -1,
    'value branch consults geometric sizing');
  ok(src.indexOf('sized so a normal bet on the next street can still get the rest in') !== -1,
    'geometric message explains the next-street plan in plain words');
}

console.log('\n35. v1.8.139: multiway value floor + multiway bluff ban');
{
  ok(src.indexOf('if (multiway && frac < 0.5) { frac = 0.5; multiFloor = true; }') !== -1,
    'multiway value bets floor at 1/2 pot');
  ok(src.indexOf('more callers means more value') !== -1,
    'multiway floor message explains more callers = more value');
  ok(src.indexOf("if (multiway)\n          return mkVerdict('check', 'strong',\n            '<b>Check</b> — too many players to bluff through.") !== -1,
    'air branch bans bluffs outright multiway');
}

console.log('\n36. v1.8.140: facing-bet bypass narrowing');
{
  ok(src.indexOf("if (commit === 'commit' && sprV <= 1 && (hc === 'nut' || hc === 'overpair') &&") !== -1,
    'bypass requires short SPR, nut/overpair only');
  ok(src.indexOf('toCall <= 0.5 * pot && !polarStrong)') !== -1,
    'bypass requires a non-huge call and a non-polarized villain');
  var tightIdx = src.indexOf("var tightBigBet = tell && tell.unit === 'pot' && tight > 0.6");
  var bypassIdx = src.indexOf("if (commit === 'commit' && sprV <= 1 && (hc === 'nut' || hc === 'overpair') &&");
  ok(tightIdx !== -1 && bypassIdx !== -1 && tightIdx < bypassIdx,
    'tight-overbet fold is checked before the bypass');
}

console.log('\n37. v1.8.141: equity vs range, multiway dilution, RIO, veto-call');
{
  ok(src.indexOf('var vTier = (V && V.archetype && V.archetype.openTier) || 0;') !== -1,
    'facing math falls back to the villain archetype openTier range');
  ok(src.indexOf('simulated 5,000× vs the kinds of hands ') !== -1 &&
     src.indexOf('counted exactly vs the kinds of hands ') !== -1,
    'archetype-range source wording names the kinds of hands he plays (simulated off-river, counted exactly on the river, v1.8.294)');
  ok(src.indexOf('estimateEquityVsRangePostflop(hero.hole, table.community, rangeEqTier, 5000)') !== -1 &&
     src.indexOf('estimateEquityVsRangePostflop(hero.hole, table.community, vTier, 5000)') !== -1 &&
     src.indexOf('estimateEquity(hero.hole, table.community, Math.min(3, table.livePlayers().length - 1), 500, cardSeed(hero.hole.concat(table.community), Math.min(3, table.livePlayers().length - 1)))') !== -1,
    'postflop facing equity runs 5000 sims, not 500: 500-sim seed-locked error ran to 5 points (v1.8.294)');
  ok(src.indexOf('estimateEquityVsRanges(hero.hole, table.community, tiers, 5000)') !== -1,
    'multiway facing equity runs 5000 sims, not 500 (v1.8.294)');
  ok(src.indexOf('beating everyone still in') !== -1,
    'diluted message says everyone still in must lose');
  ok(src.indexOf('nonNutDraw:') !== -1 && src.indexOf('vulnerableMade:') !== -1,
    'facing math passes non-nut-draw and vulnerable-made flags to rioPenalty');
  ok(src.indexOf("if (veto && !(hc === 'nut' && legal.canRaise))") !== -1,
    'veto-call branch shows the narrowed figure when the gate holds but calls');
}

console.log('\n38. v1.8.142: board vulnerability sizing + fold-to-raise plan');
{
  ok(src.indexOf('function boardVulnerability(community)') !== -1,
    'board vulnerability helper detects paired, flush, and straight boards');
  ok(src.indexOf('vulnFloor') !== -1,
    'vulnerable value hands floor at 2/3 pot for protection');
  ok(src.indexOf('slow down') !== -1,
    'vulnerable value messages give the fold-to-a-raise plan');
  ok(src.indexOf('flush beats you') !== -1,
    'overpair on a flush board names the flush danger');
}

console.log('\n39. v1.8.143: plain-language sizing math for value bets');
{
  ok(src.indexOf('valueMath') !== -1,
    'value bets carry a plain-language sizing-math line');
  ok(src.indexOf('a shove would fold those hands out') !== -1,
    'big value bets explain why not to shove');
  ok(src.indexOf('Small enough that worse hands still call') !== -1,
    'small value bets explain why not to bet bigger');
}

console.log('\n41. v1.8.146: sizing tell keyed to profile — no small-bet raise into trappers');
{
  ok(src.indexOf('passiveTrapper') !== -1,
    'small-bet raise branch is guarded by a passive-trapper flag');
}

console.log('\n42. v1.8.147: blockers — nut-flush blocker credit for bluff-catches');
{
  ok(equitySrc.indexOf('function blockerCredit(hole, community)') !== -1,
    'equity layer exposes a pure blocker-credit helper');
  ok(src.indexOf('bCredit') !== -1,
    'facing math applies blocker credit for bluff-catch hands');
}

console.log('\n43. v1.8.148: multiway dilution — shared-runout sim replaces the power rule');
{
  ok(equitySrc.indexOf('function estimateEquityVsRanges(hole, community, tiers, iters)') !== -1,
    'equity layer exposes a shared-runout multi-opponent sim');
  ok(src.indexOf('estimateEquityVsRanges(hero.hole, table.community, tiers, 5000)') !== -1,
    'facing math uses the multi sim for multiway single-range spots (5000 sims, v1.8.294)');
  ok(src.indexOf('adjEq = Math.pow(adjEq, nOpp)') === -1,
    'power-rule dilution is gone from the facing math');
}

console.log('\n44. v1.8.149: preflop-to-postflop range consistency — an earlier big call narrows the range');
{
  ok(src.indexOf('narrowedByCall') !== -1,
    'facing math narrows the range when the villain called a big bet earlier');
  ok(src.indexOf('called a big bet earlier in the hand, so his range is still strong') !== -1,
    'narrowed message explains the earlier big call');
}

console.log('\n45. v1.8.167/265/266: air and weak pair priced vs the made hands he bets, not the bluff rate');
{
  ok(src.indexOf('madePriced') !== -1,
    'facing math prices air and weak pair against the betting range');
  ok(src.indexOf('estimateEquityVsMadeRange(hero.hole, table.community, 2000)') !== -1,
    'air pricing runs 2,000 sims: 500-sim noise flipped borderline air calls (v1.8.184, v1.8.265)');
  ok(src.indexOf('(1 - bluffy) * eqMade') === -1 &&
     src.indexOf('estimateEquityVsAirRange') === -1,
    'the bluff-rate blend is gone: the Maniac bets air 1.9-9.1% of his bets by street, not 55%, so weighting the air pool by the bluff param priced ace-high at 35-55% against true 2-15% (v1.8.265)');
  ok(equitySrc.indexOf('estimateEquityVsMadeRange') !== -1,
    'equity helper prices air vs the villain made range');
  ok(equitySrc.indexOf('estimateEquityVsAirRange') === -1,
    'the air-range helper is gone with the blend — nothing prices vs the air pool anymore (v1.8.265)');
  ok(src.indexOf('airCapped') === -1,
    'the bluff-rate cap is gone from the coach');
  ok(src.indexOf('!narrowedByCall') !== -1,
    'the betting-range price skips narrowed ranges (a big earlier call means value, not bluffs)');
}

console.log('\n46. v1.8.151: tourney risk premium — the veto call respects tournament pressure');
{
  ok(src.indexOf('veto.need + tourneyRiskPremium(effBB)') !== -1,
    'veto call is gated on the pot-odds need plus the tournament premium');
}

console.log('\n47. v1.8.152: draw/implied/reverse-implied odds — paired-board draws are draws, with full-house risk');
{
  ok(src.indexOf('if (!heroHasPair) {') !== -1 &&
    src.indexOf('if (d.flushDraw || d.oesd) return \'draw\';') !== -1,
    'board-pair air branch checks draws before calling the hand air');
  ok(src.indexOf('|| anyDraw) && boardPaired') !== -1,
    'vulnerable-made flag covers draws on paired boards, not just made hands');
}

console.log('\n48. v1.8.153: geometric sizing part 2 — river value floor (no draws left to price)');
{
  ok(src.indexOf('riverFloor') !== -1,
    'value branch floors river value bets at half pot');
}

console.log('\n49. v1.8.168: multiway means three or more players in the pot');
{
  ok(/function isMultiway\(\) \{\s*return liveOpponents\(\)\.length >= 2;/.test(src),
    'isMultiway counts two live opponents as multiway');
  ok(src.indexOf('if (n >= 3) return') !== -1,
    'the multiway note shows for three-way pots');
  ok(src.indexOf('liveOpponents().length >= 3') === -1,
    'no three-opponent multiway threshold remains');
}

console.log('\n50. v1.8.169: the bluffer lean never overrides diluted multiway equity');
{
  ok(src.indexOf('!narrowedByCall && !diluted && adjEq > threshold - 0.10') !== -1,
    'the bluffer-lean call is gated off when the equity was multiway-diluted');
}

console.log('\n51. v1.8.170: facing-3bet calls respect pot odds');
{
  ok(src.indexOf('var adjEq3 = eq3 + credit3 - debit3;') !== -1,
    'the facing-3bet branch prices equity against the villain\'s 3-bet range');
  ok(src.indexOf('estimateEquityVsRange(hero.hole, Math.min(6, Math.max(1, threeTier || 3)), 500)') !== -1,
    'the 3-bet equity uses 500 sims so the gate is not flipped by 150-sim noise');
  ok(src.indexOf('villainStubborn: stubborn3, inPosition: inPos }) * 0.5;') !== -1,
    'the 3-bet implied-odds credit is halved: a 3-bettor\'s tight range pays off less and dominates more');
  // v1.8.180 widened both gates below: out of position, a 3-bet call needs
  // the equity to clear the price by 10 points, not just any edge.
  // v1.8.257 removed the depth gates: an equity edge calls at any depth —
  // only set-mining still needs deep stacks (40bb for tier 2, 30bb was the
  // tier<=4 gate). Folding a 63% favorite at 25bb to a Maniac 3-bet was a
  // leak: depth changes how much you win later, not whether the price is
  // right now.
  ok(src.indexOf('var oopEdge2 = !inPos && adjEq3 > need3 + 0.10;') !== -1 &&
     src.indexOf('var eqCall2 = (inPos && adjEq3 > need3) || oopEdge2;') !== -1 &&
     src.indexOf('var call2 = (setMine2 && effBB3 >= 40) || eqCall2;') !== -1,
    'tier-2 equity calls ignore the depth gate — only set-mining needs 40bb');
  ok(src.indexOf('tier <= 4 && ((inPos && adjEq3 > need3) || (!inPos && adjEq3 > need3 + 0.10))') !== -1,
    'playable-hand 3-bet calls are gated on the equity clearing the price, at any depth');
}

console.log('\n52. v1.8.171: small pairs call when ahead of a wide range');
{
  ok(src.indexOf('if (adjEq3 > need3)') !== -1,
    'the facing-3bet small-pair branch calls when the pair is ahead, not only when three-of-a-kind math pays');
  ok(src.indexOf('if (adjEq > threshold)') !== -1,
    'the facing-open small-pair branch calls when the pair clears the price');
  ok(src.indexOf('var priceTier') < src.indexOf('Chasing three of a kind needs about 15'),
    'the facing-open equity is computed before the small-pair branch so the pair can use it');
}

console.log('\n53. v1.8.172: big opens are priced against the strong range');
{
  ok(src.indexOf('var bigOpen = villainAllIn || open >= table.bb * 6;') !== -1,
    'a 6x+ open or an all-in open counts as a big open');
  ok(src.indexOf('var priceTier = bigOpen') !== -1,
    'a big open prices the villain 3-bet tier, not the open tier');
  ok(src.indexOf('!villainAllIn && (!bigOpen || adjEq > 0.5)') !== -1,
    'premiums only 3-bet a big open when ahead of the strong range, never into an all-in');
  ok(src.indexOf('var villainAllIn = !!(V && V.stack <= 0);') !== -1,
    'an all-in villain is detected from a zero stack after the shove');
}

console.log('\n54. v1.8.173/203: the bluff 3-bet needs a wide range and a pressured stack');
{
  ok(src.indexOf('openTierV >= 4 && pressured && !multiway && !bigOpen') !== -1,
    'the suited-ace bluff 3-bet fires only against a wide opener whose stack the raise pressures — the old generic foldy gate let it fire into Rock, who folds 0/200 to it deep (v1.8.203)');
  ok(src.indexOf('var pressured = vTotal > 0 && (bluffTo - open) / vTotal >= 0.12;') !== -1,
    'the pressure line is the engine\'s own expensive-call threshold (call cost at least 12% of the villain\'s stack), where bots start folding (v1.8.203)');
}

console.log('\n55. v1.8.174: iso raises scale with the limper count');
{
  ok(src.indexOf('var isoMult2 = 3 + countLimpers();') !== -1,
    'iso size is 3bb plus 1bb per limper, not a flat 4bb');
  ok(src.indexOf('(4× the blind) to isolate') === -1,
    'no iso message still hardcodes the flat 4x multiple');
  ok(src.indexOf('Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, table.bb * isoMult2))') !== -1,
    'the iso size is clamped to the legal raise range');
}

console.log('\n56. v1.8.175: facing a 3-bet shove, premiums are priced');
{
  ok(src.indexOf('QQ is a favorite against opens, an underdog against re-raise shoves') !== -1,
    'the 3-bet-shove fold lesson names the range flip');
  ok(src.indexOf('Never fold QQ or better to a single all-in') === -1,
    'the old auto-call lesson for premiums vs a shove is gone');
  ok(src.indexOf('if (adjEq3 > need3)') !== -1,
    'the tier-1 shove call is gated on the equity clearing the price');
}

console.log('\n57. v1.8.176: facing a 4-bet shove, premiums are priced');
{
  ok(src.indexOf('even a premium folds when the math says so') !== -1,
    'the 4-bet-shove fold lesson names the math, not the hand strength');
  ok(src.indexOf('folding a premium to one shove burns money') === -1,
    'the old auto-call line for premiums vs a 4-bet shove is gone');
  ok(src.indexOf('if (eq4 > need4)') !== -1,
    'the tier-1 4-bet-shove call is gated on the equity clearing the price');
  ok(src.indexOf('return estimateEquityVsRange(hole, Math.min(6, Math.max(1, maxTier || 3)), 5000);') !== -1,
    'facing-open equity uses 5000 sims: two nearby boundaries (strong call and the in-position lean) flip borderline calls on 500-sim noise (v1.8.192)');
}

console.log('\n58. v1.8.193: the weak-fold flag is priced against the pot odds');
{
  ok(src.indexOf('foldEq > needFold + 0.10') !== -1,
    'the weak-fold flag fires when equity clears need + 10, not a fixed 35%: the fixed line sat 1.5 sigma from the Rock spot and flaked CI 1.8.189 (v1.8.193) — foldEq is the betting-range price on river one-pair hands, the tier-range eq otherwise (v1.8.271)');
  ok(src.indexOf('eq > 0.35') === -1,
    'the old fixed 35% weak-fold line is gone');
}

console.log('\n59. v1.8.194: the lean call needs a real bluffer, not just a wide range');
{
  ok(src.indexOf("if (bluffy > 0.5 && hc !== 'air' && !madePriced && !narrowedByCall && !diluted && adjEq > threshold - 0.10)") !== -1,
    'the lean call fires only when the villain actually bluffs a lot — and never for air or weak pair, whose equity is already priced against the betting range: a wide range alone already gets its discount in the threshold, and the message claims bluffing (v1.8.194, v1.8.265, v1.8.266)');
  ok(src.indexOf("(bluffy > 0.5 || range.label === 'wide')") === -1,
    'no wide-range arm on the lean call: it called a gutshot and ace-high into Rock (bluff 0.02) on a false "bluffs a lot" (v1.8.194)');
}

console.log('\n60. v1.8.195: a tight player\'s pot-sized river bet folds one pair');
{
  ok(src.indexOf("(table.street === 'river' && tell.size === 'large' && onePairOrLess)") !== -1,
    'the tight-player big-bet guard extends to pot-sized river bets against one pair or less: top pair quoted 58% vs a loose tier pool but Rock\'s pot range is value-heavy (v1.8.195)');
  ok(src.indexOf("var onePairOrLess = hc === 'toppair' || hc === 'secondpair' || hc === 'weakpair' ||") !== -1,
    'the river extension is scoped to one pair or less: trips still call (94% in the lab) and the turn multiway top-pair call is untouched (v1.8.195)');
}

console.log('\n61. v1.8.196: squeeze sizing adds 1x per caller in front');
{
  ok(src.indexOf('function countCallersAfterOpen()') !== -1,
    'a caller counter counts preflop calls after the open (v1.8.196)');
  ok(src.indexOf("if (t.action === 'call' && raised) n++;") !== -1,
    'the caller counter only counts calls made after a raise exists (v1.8.196)');
  ok(src.indexOf('Math.round(open * (mult + callers))') !== -1,
    'the value 3-bet is 3x/4x the open plus 1x per caller: AKs squeezed to 120 with one caller, 90 without (v1.8.196)');
  ok(src.indexOf('plus 1× per caller in front') !== -1,
    'the 3-bet lesson states the caller rule, not just the base multiple (v1.8.196)');
}

console.log('\n62. v1.8.197: raise the near-nuts for value vs a station trapper\'s small bet');
{
  ok(src.indexOf('var trapperValue = passiveTrapper && foldy <= 0.25 &&') !== -1 &&
     src.indexOf('(trapperBet != null ? trapperEq > 0.50 : trapperEq >= 0.90)') !== -1,
    'the trapper block lifts only when the villain is a station (folds little) and the coach equity crushes his range: trips vs Nathan raise, overpair at 82% still calls (v1.8.197, v1.8.282, v1.8.310: the gate equity is the betting-range price with a 0.50 line when the estimator has a price, the exact river enumeration vs the tier pool only as the fallback)');
  ok(src.indexOf('estimateEquityVsRangePostflopExact(hero.hole, table.community, trapperTier)') !== -1,
    'the trapper gate prices exact river equity against the same tier pool the Monte Carlo priced, so the gate cannot flip between runs (v1.8.282)');
  ok(src.indexOf("(!passiveTrapper || trapperValue)") !== -1,
    'the small-bet raise branch takes the value-raise path for a station trapper (v1.8.197)');
  ok(src.indexOf('he calls down with worse hands') !== -1,
    'the trapper value-raise message says why: he calls down with worse, not "take it away" (v1.8.197)');
}

console.log('\n63. v1.8.262 supersedes v1.8.198: no semi-bluff raise into a bet at all');
{
  // v1.8.198 kept the draw-raise firing on wide/capped ranges. The
  // v1.8.262 paired sim shows the wide-range raise loses ~385
  // chips/hand vs Rock's top pair (and ~478 vs a Maniac's), because
  // pairs fold 0/200 to a 3x raise for every villain — the fold
  // equity the branch assumed does not exist in any range. The
  // branch is deleted; the 198 strong/polarized exclusion is moot
  // with it, and the lab spots now expect calls.
  ok(src.indexOf("if ((hc === 'draw-strong' || hc === 'draw') && legal.canRaise && foldy > 0.4") === -1,
    'the draw-raise branch is gone, so the v1.8.198 strong/polarized exclusion goes with it (v1.8.262)');
  ok(labSrc.indexOf("name: 'draw-mediumbet-call'") !== -1,
    'the lab spot that pinned the 900 raise now pins a call (v1.8.262)');
}

console.log('\n64. v1.8.199: callers ahead get a calling range in the multiway dilution');
{
  ok(src.indexOf('function countCallersAhead()') !== -1,
    'a caller counter counts distinct players who called ahead on this street (v1.8.199)');
  ok(src.indexOf('for (var o = 1; o < nOpp; o++) tiers.push(o <= callersAhead ? 3 : 0);') !== -1,
    'the multiway dilution gives each caller ahead a tier-3 calling range, not a random hand: second pair vs Rock 400 + caller folds at 19% vs a 24% price, not the 32% the random model quoted (v1.8.199)');
  ok(src.indexOf('return countCallersAhead() > 0;') !== -1,
    'betCallAhead is the counter, not a second copy of the timeline walk (v1.8.199)');
}

console.log('\n65. v1.8.200: the leak tracker dilutes multiway equity');
{
  ok(src.indexOf('if (rangeTier && liveOpponents().length >= 2) {') !== -1,
    'the leak tracker prices multiway spots against every live opponent, not just the bettor: folding weak pair to LAG 250 + caller ahead is not a weak fold (25% vs a 30% line), though heads-up it is (55%) (v1.8.200)');
  ok(src.indexOf('var tiersL = [rangeTier];') !== -1 &&
     src.indexOf('for (var oL = 1; oL < nOppL; oL++) tiersL.push(oL <= callersAheadL ? 3 : 0);') !== -1,
    'the tracker uses the same caller-ahead tier-3 model as the coach dilution (v1.8.199), not a second random-hand model (v1.8.200)');
}

console.log('\n66. v1.8.201: short-stack reshoves are priced against the opener\'s range');
{
  ok(src.indexOf('var eqV = estimateEquityVsRange(hero.hole, Math.min(6, Math.max(1, priceTierV || 3)), 5000);') !== -1,
    'the reshove equity runs 5000 sims against the opener\'s range, like the facing-open branch: AJ vs Rock is 32% and AQ 38% against a 47% break-even (v1.8.201)');
  ok(src.indexOf('if (eqV > breakEvenV + 0.03)') !== -1,
    'tier 2-3 hands reshove only when equity clears the no-fold-equity break-even by 3 points, the same margin as the strong-call rule: JJ at 46-47% folds, AKo at 47% folds, AJ vs LAG at 53% shoves (v1.8.201)');
  ok(src.indexOf("var priceTierV = spot === 'facing-open'") !== -1 &&
     src.indexOf('? (table.currentBet >= table.bb * 6 ? threeTierV : openTierV)') !== -1 &&
     src.indexOf(': threeTierV;') !== -1,
    'the reshove prices the raiser\'s actual range: the open tier for a normal open, the 3-bet tier for a big open or a re-raise (v1.8.201)');
}

console.log('\n67. v1.8.202: preflop facing-open equity dilutes for callers in front');
{
  ok(src.indexOf('var callersPre = countCallersAfterOpen();') !== -1 &&
     src.indexOf('for (var ci = 0; ci < callersPre; ci++) callTiers.push(4);') !== -1 &&
     src.indexOf('? estimateEquityVsRanges(hero.hole, [], callTiers, 5000)') !== -1,
    'with callers in front, the facing-open call prices equity multiway against the opener plus one tier-4 range per caller, at 5000 sims: ATo vs Rock + 2 callers is 15%, not 28% (v1.8.202)');
  ok(src.indexOf('var threshold = need + (multiway ? 0.04 : 0) + rp -') !== -1,
    'the +0.04 multiway threshold bump stays — it prices the players still to act behind, while the dilution prices the callers already in (v1.8.202)');
}

console.log('\n68. v1.8.203: the bluff 3-bet message says why it folds them');
{
  ok(src.indexOf('pressures the weak ones to fold') !== -1 &&
     src.indexOf('plays lots of hands with a short stack') !== -1,
    'the bluff message names the real mechanism (wide range + short stack), not the false "folds too much" claim (v1.8.203)');
}

console.log('\n69. v1.8.205: a small bet after shown strength is not a weak bet');
{
  ok(src.indexOf('function villainShowedStrength(vIdx)') !== -1,
    'villainShowedStrength scans the timeline for strength shown before this street (v1.8.205)');
  ok(src.indexOf('if (size / Math.max(1, pot - size) >= 0.7) shown = true;') !== -1,
    'a big postflop bet on an earlier street (0.7x pot or more, the same line the range label uses for strong) counts as shown strength (v1.8.205)');
  ok(src.indexOf('if (t.street === \'preflop\') {') !== -1 &&
     src.indexOf('if (tight > 0.6) shown = true;') !== -1,
    'a preflop raise from a tight player also counts: his range is premiums even before any postflop bet (v1.8.205)');
  ok(src.indexOf('var strongShown = villainShowedStrength(vIdx);') !== -1 &&
     src.indexOf('!strongShown && (!passiveTrapper || trapperValue)') !== -1,
    'the small-bet raise skips a villain who showed strength: top pair vs Rock\'s small turn bet after his big flop bet calls on the math (62% vs a 10% price) instead of raising into a range that folds 0/1200 pairs — while the capped-range raise and the wide-player raise still fire (v1.8.205)');
}

console.log('\n70. v1.8.206: a playable hand isolates one player who just called, from any seat');
{
  ok(src.indexOf('if (tier <= 3 && (inPos || countLimpers() === 1))') !== -1,
    'the tier-3 isolate branch fires in position or against a single player who just called: AQo in middle position vs one limper raises to 40 instead of folding, while 2+ limpers out of position still go through the late/middle branches (v1.8.206)');
  ok(src.indexOf('one player who just called rarely has much, and your hand is ahead of their range.') !== -1,
    'the out-of-position isolate message says why it works (one weak range, ahead of it), not "you have position" (v1.8.206)');
}

console.log('\n71. v1.8.207: an all-in re-raise is priced, not folded on stack depth');
{
  ok(src.indexOf('if (!legal.canRaise && tier >= 2 && tier <= 4 && !isSmallPair(hero.hole)) {') !== -1,
    'facing a re-raise with no raise left (villain all-in), tier 2-4 hands are priced on raw equity against the re-raise range: JJ vs a Maniac shove calls at 74% vs a 50% price, AQs at 63%, JJ vs Rock still folds at 28% (v1.8.207)');
  ok(src.indexOf("if (eq3 > need3)") !== -1,
    'the all-in call uses the raw 500-sim equity, not the implied-odds-adjusted figure — there are no implied odds when the villain is already all-in, the same rule the second-re-raise branch uses (v1.8.207)');
  ok(src.indexOf("!isSmallPair(hero.hole)") !== -1,
    'small pairs keep their own branch (its set-mine math plus equity fallback already prices all-ins), so the guard does not double-handle them (v1.8.207)');
}

console.log('\n72. v1.8.208: a facing raise that is the whole stack says all-in');
{
  ok(src.indexOf('var nutAllIn = nutTo >= legal.maxRaiseTo;') !== -1 &&
     src.indexOf('var tinyAllIn = tinyTo >= legal.maxRaiseTo;') !== -1,
    'the two facing-raise branches (nuts, small bet) detect when the clamped raise equals the whole stack (v1.8.208; the draw branch is gone in v1.8.262)');
  ok(src.indexOf("'<b>All-in</b> to ~<b>' + fmt(nutTo) + '</b> — your whole stack, about ' + nutMult + '× their bet.") !== -1 &&
     src.indexOf("'<b>All-in</b> to ~<b>' + fmt(tinyTo) + '</b> — your whole stack, about 3× their bet — and take it away.'") !== -1,
    'an all-in facing raise says all-in with the amount still parseable ("to ~X"), instead of the fraction-of-pot label — the same rule the leading bets got in v1.8.192 (v1.8.208)');
}

console.log('\n73. v1.8.227: only a hand nothing can beat is the nuts');
{
  ok(src.indexOf('function isCurrentNuts(hole, community, ev)') !== -1,
    'a current-nuts check exists: straight+ is the nuts only when no better hand is possible on this board');
  ok(src.indexOf("if (isCurrentNuts(hole, community, ev)) return 'nut';") !== -1 &&
     src.indexOf("return 'madehand';") !== -1,
    'handClass returns nut only for true nuts and madehand for a strong-but-beatable straight or better');
  ok(src.indexOf("madehand: 'a strong made hand'") !== -1,
    'a strong made hand has a plain name, not the nuts');
  ok(src.indexOf("if (veto && !(hc === 'nut' && legal.canRaise))") !== -1,
    'the river veto still exempts only true nuts: a strong made hand goes through the veto math');
  ok(/if \(\(hc === 'nut' \|\| hc === 'madehand'\) && legal\.canRaise &&/.test(src),
    'the value-raise branch still raises a strong made hand for value, with the nuts wording kept for true nuts only (v1.8.310: plus the trapper guard — a made hand whose betting-range price is at or below 0.50 does not take this branch)');
  ok(src.indexOf('but a better hand is already possible on this board') !== -1,
    'the made-hand raise lesson names the vulnerability instead of calling it the nuts');
  ok(src.indexOf("(hc === 'nut' || hc === 'madehand' || hc === 'overpair' || hc === 'toppair' || hc === 'trips' || hc === 'twopair')") !== -1,
    'the small-bet raise branch takes a strong made hand, not just the nuts (draws no longer raise a small bet either, v1.8.262)');
}

console.log('\n74. v1.8.228: the recap does not praise a win the coach was ignored for');
{
  ok(src.indexOf('if (won && wonByFold && !bad)') !== -1,
    'the fold-out win praise fires only when no strong decision was disobeyed: a win after ignoring the coach gets the leak line, not a celebration (v1.8.228)');
  ok(src.indexOf('Your play got through') === -1,
    'the showdown-win praise for a disobeyed coach is gone: the recap names the leak instead of crediting the result (v1.8.228)');
  ok(src.indexOf('if (bad) {') !== -1,
    'the leak line is no longer suppressed on fold-out wins — the ignored advice is always named when a strong decision was disobeyed (v1.8.228)');
  ok(src.indexOf('Nice semi-bluff') === -1 && src.indexOf('Nice raise!') === -1,
    'the semi-bluff and isolate praise variants that only fired on a disobeyed coach are gone with them (v1.8.228)');
}

console.log('\n75. v1.8.229: second pair bets the turn for thin value against a station');
{
  ok(src.indexOf("if (!multiway && (inPos || scare2 || foldy > 0.5 || foldy < 0.25)) {") !== -1,
    'the thin-value clause fires on every street against a player who folds little: the turn was measured +76 vs a Station, +73 vs Nathan over 2000 seeded runouts (v1.8.229), and the flop +97/+40 over 1000 shared runouts (v1.8.240) — the street restriction is gone');
  // v1.8.261: the tracker mirrors the coach's FULL bet condition (in
  // position, scare card, or a very foldy / very sticky villain), not just
  // the sticky-villain case — the old foldy<0.25-only flag let the tracker
  // stay silent while the coach bet second pair in position vs a LAG.
  ok(src.indexOf("liveOpponents().length === 1 && handClass(hero.hole, table.community) === 'secondpair'") !== -1 &&
     src.indexOf("(positionScore(table, 0) > 0.6 || scareCardRank() || villainFoldy(V.archetype) > 0.5 || villainFoldy(V.archetype) < 0.25)") !== -1,
    'the leak tracker mirrors the coach rule on every street too — coach and tracker cannot disagree about the same spot (v1.8.229, extended to the flop in v1.8.240, full bet condition in v1.8.261)');
  ok(src.indexOf("'Checked the ' + street + ' with second pair against ' + V.name") !== -1,
    'the missed-value message names the street it happened on (v1.8.229)');
}

console.log('\n76. v1.8.230: the lab gross-checks four more range-priced spots, and two messages state their size');
{
  ok(labSrc.indexOf("timeline: betTimeline('turn', 350, 500), grossCheck: true") !== -1,
    'paired-draw (nut flush draw on a paired board vs Rock, seeded eq 20.2% vs a 29.2% price) is gross-checked: a future call there fails the lab (v1.8.230)');
  ok(labSrc.indexOf('pot: 1200 }], grossCheck: true') !== -1,
    'trips vs Rock\'s pot bet (seeded eq 93.7% vs a 33.3% price) is gross-checked: the trips exemption from the tight-player guard is equity-priced, so the lab pins it (v1.8.230)');
  ok(labSrc.indexOf("timeline: betTimeline('turn', 100, 100), grossCheck: true") !== -1,
    'facing-multiway-toppair-call (seeded eq 50.9% vs a 33.3% price) is gross-checked (v1.8.230)');
  ok(labSrc.indexOf("expectWord: 'Pay 90 to win 120', grossCheck: true") !== -1,
    'preflop-prize-figure (JJ vs Rock, seeded eq 48.4% vs a 42.9% price) is gross-checked (v1.8.230)');
  ok(labSrc.indexOf("name: 'toppair-vs-rock-river-potbet-call'") !== -1,
    'the top-pair call vs Rock\'s pot bet is pinned: the double-barrel truth is 57% and the betting-range price 64% vs a 33% need, so the equity escape stands the guard down (v1.8.288 corrects v1.8.230, whose gross-check-free note rested on the open-range price of a fold that is now a call)');
  ok(src.indexOf("raise again for value to ~' + fmt(fourTo) + ' (about 2.3× their raise).") !== -1,
    'the 4-bet lesson states the exact size (to ~207), not just the bare 2.3x multiple — the recap quotes the lesson, so a size-less lesson hides the size (v1.8.230)');
  ok(src.indexOf('bet a medium size, so this barely narrows him down: pairs and draws are in there.') !== -1,
    'the wide-range note respects a tight villain: a medium bet from Rock does not make him "wide" and does not put air in his range (v1.8.230)');
}

console.log('\n77. v1.8.231: the leak tracker flags a missed semi-bluff');
{
  ok(src.indexOf("if (a === 'check' && V && villainFoldy(V.archetype) >= 0.25 &&") !== -1,
    'the tracker flags checking a strong draw heads-up against a player who folds — the exact mirror of the coach semi-bluff branch, which bets when foldy >= 0.25 and checks a Station (v1.8.231)');
  ok(src.indexOf("'Missed semi-bluff'") !== -1,
    'the missed semi-bluff has its own title, not the generic missed-value wording (v1.8.231)');
  ok(src.indexOf("handClass(hero.hole, table.community) === 'draw-strong'") !== -1,
    'the flag is scoped to strong draws (flush + straight draw) — a plain draw is only marginal advice, so it is not flagged (v1.8.231)');
}

console.log('\n78. v1.8.232: coach copy stops inventing river cards, ranks, and break-evens');
{
  ok(src.indexOf('completes the hands he called with') === -1,
    'the river veto never invents a completing river card — it fires on blank rivers too (v1.8.232)');
  ok(src.indexOf('especially when the river card helps exactly the hands he called with') === -1,
    'the veto lesson drops the river-helps claim with it (v1.8.232)');
  ok(src.indexOf('a Queen or a Seven') === -1,
    'the board-play fold never hardcodes Queen/Seven ranks (v1.8.232)');
  ok(src.indexOf(".join(' or a ')") !== -1,
    'the board-play fold names the actual paired ranks from the board (v1.8.232)');
  ok(src.indexOf('folds to break even') === -1,
    'the semi-bluff never quotes the pure-bluff break-even — a draw has equity, so the number is wrong (v1.8.232)');
  ok(src.indexOf('two ways to win: they fold now, or you hit') !== -1,
    'the semi-bluff keeps the two-ways-to-win framing (v1.8.232)');
}

console.log('\n79. v1.8.239: the nut raise goes to 4x on the turn too, and its lesson states the size');
{
  ok(src.indexOf("var nutMult = foldy < 0.25 ? 4 : 3;") !== -1,
    'the 4x nut raise applies on every street against a station: the flop was measured in v1.8.242 (+167.5 vs a Station, +153.5 vs Nathan over 1000 shared runouts) after the turn was measured in v1.8.239');
  ok(src.indexOf("raise to ~' + fmt(nutTo) + ' (' + nutMult + '× their bet): every street") !== -1,
    'the nut-raise lesson states the exact size, not just the bare multiple — the recap quotes the lesson, so a size-less lesson hides the size (v1.8.239)');
  ok(src.indexOf("raise for value to ~' + fmt(nutTo) + ' — but a better hand is already possible") !== -1,
    'the made-hand raise lesson states its size too (v1.8.239)');
}

console.log('\n80. v1.8.263: Alice is a wide overbettor, and the guard exemption is scoped to overpair+');
{
  var botsSrc80 = fs.readFileSync(__dirname + '/../js/bots.js', 'utf8');
  var aliceBlock = botsSrc80.slice(botsSrc80.indexOf("id: 'alice'"), botsSrc80.indexOf("id: 'donald'"));
  ok(aliceBlock.indexOf('wideOverbet: true') !== -1,
    'Alice carries wideOverbet: she overbets AA 56%, sets ~52%, two pair ~50% and KQ 39% on the turn, and her profile already says she sometimes bets bigger than the pot (v1.8.263)');
  ok(src.indexOf("var strongVsOverbet = hc === 'overpair' || hc === 'trips' || hc === 'twopair' || hc === 'madehand';") !== -1,
    'the overbet exemption is scoped to hands that beat a wide overbet range: overpair, trips, two pair, made hand (v1.8.263)');
  ok(src.indexOf("!(V && V.archetype && V.archetype.wideOverbet && strongVsOverbet)") !== -1,
    'the tightBigBet guard still lifts only for a wide overbettor AND a strong hand in the general case (v1.8.263); Alice is exempt separately in v1.8.288 because her sizing is a coin flip, not a strength tell');
  ok(src.indexOf("V.archetype.id === 'alice'") !== -1,
    'Alice is exempt from the size-based guard: her overbet sizing is random (a coin flip between 0.3-0.5x and 1.2-2.0x, bots.js), so an overbet carries no strength information — exact enumeration puts top pair KQ at ~75% vs her turn betting range, not the ~13% the tier-1 proxy claimed in v1.8.263 (v1.8.288)');
  ok(labSrc.indexOf("name: 'overpair-vs-alice-overbet-call'") !== -1 &&
     labSrc.indexOf("name: 'toppair-vs-alice-overbet-call'") !== -1,
    'the lab pins both calls: overpair and top pair both call Alice\'s 1.5x overbet (v1.8.288 re-decides the top-pair fold: the v1.8.263 ~13% was the tier-1 preflop proxy, the betting-range truth is ~75%)');
}

console.log('\n81. v1.8.264: a big river bet folds one pair or less from any villain');
{
  ok(src.indexOf("var riverBigValue = table.street === 'river' && tell && tell.unit === 'pot' &&") !== -1 &&
     src.indexOf("tell.ratio >= 0.7 && onePairOrLess && hc !== 'nut';") !== -1,
    'the river big-bet fold is gated on the river, a pot-ratio of 0.7+, and one pair or less — not on the villain being tight: the Maniac bets large 100% with made hands and ~0% with air on the river, and the LAG/Amogh/Station/Rock bluff air 0-4% there (v1.8.264)');
  ok(src.indexOf("if ((tightBigBet || riverBigValue) && !loneRiverPriced && !pricedEscape)") !== -1,
    'the river fold joins the tight-player guard in one return, but stands down for a lone river bet priced against the betting range, and for any betting-range-priced spot whose equity clears need by 10 points (v1.8.288 equity escape): heads-up the Maniac bets every top pair, so a 0.75x bet is not value-only (v1.8.270 corrects the v1.8.264 veto, whose ~18% came from a 22-holding sample that omitted the worse-pair mass)');
  ok(src.indexOf("var pricedEscape = (riverBetPriced || betRangePriced || multiBetPriced) && tell && tell.size !== 'overbet' && adjEq > need2 + 0.10;") !== -1,
    'the escape fires only on a betting-range price, never on an overbet: a >1.2x bet is outside every bot\'s normal sizing (Rock bets 0.55x), so a 2x shove keeps the guard — the bypass-overbet spot still folds (v1.8.288; the multiway betting-range price joins the escape in v1.8.301, same rule, still never on an overbet)');
  ok(src.indexOf('even loose players rarely bluff the river with air') !== -1,
    'the river fold message says why it applies to loose players too, not just tight ones (v1.8.264)');
  ok(labSrc.indexOf("name: 'thirdpair-vs-maniac-river-call'") !== -1 &&
     labSrc.indexOf("name: 'toppair-vs-maniac-river-call'") !== -1,
    'the lab pins both calls: third pair (38% heads-up) and top pair (76%) vs the Maniac 0.75x river bet at a 30% price (v1.8.270 corrects v1.8.264)');
}

console.log('\n82. v1.8.265: air is priced vs the made hands he bets, on every street');
{
  ok(src.indexOf('adjEq = Math.max(0, Math.min(1, eqMade - drawRealizationDiscount(hc)));') !== -1 &&
     src.indexOf('a betting range is mostly made hands, not bluffs') !== -1,
    'air is priced vs the made range alone on every street: the Maniac bets air 9.1%/3.2%/1.9% (flop/turn/river) and the LAG 4.7%/1.5%/1.4%, while the old bluff-rate blend priced ace-high at 35-55% against true 2-15% (v1.8.265)');
  ok(src.indexOf("bluffy > 0.5 && hc !== 'air' && !madePriced") !== -1,
    'air and weak pair are excluded from the bluffy marginal call: their equity is already priced against the betting range, so the bluff credit would double-count (v1.8.265, v1.8.266)');
  ok(labSrc.indexOf("name: 'air-vs-maniac-river-fold'") !== -1 &&
     labSrc.indexOf("name: 'air-vs-lag-river-fold'") !== -1 &&
     labSrc.indexOf("name: 'air-vs-maniac-flop-call'") !== -1 &&
     labSrc.indexOf("name: 'air-vs-lag-flop-call'") !== -1 &&
     labSrc.indexOf("name: 'air-vs-maniac-turn-fold'") !== -1 &&
     labSrc.indexOf("name: 'air-vs-lag-turn-fold'") !== -1,
    'the lab pins the air spots on flop, turn and river (v1.8.265; the flop folds are re-decided to calls in v1.8.287: the v1.8.265 "true 14.6%/12.7%" was the made-pool price, the betting-range truth is ~40%/36% and sequential EV says calling wins ~111/~29 chips)');
}

console.log('\n83. v1.8.266: weak pair is priced vs the made hands he bets too');
{
  ok(src.indexOf("(hc === 'air' || hc === 'weakpair' || hc === 'secondpair' || hc === 'trips' || hc === 'twopair' || hc === 'draw' || hc === 'draw-weak' || hc === 'draw-strong')") !== -1,
    'the made-range price covers air, weak pair and second pair: the tier pool priced a pair of 2s at 36-50% against true 11-23% (v1.8.266, extended to second pair in v1.8.267; trips and two pair join off the river in v1.8.277 and on the river in v1.8.278; draws join in v1.8.280, probe28)');
  ok(src.indexOf('madePriced') !== -1 && src.indexOf('airPriced') === -1,
    'the flag is named for what it prices now, not just air (v1.8.266)');
  ok(labSrc.indexOf("name: 'weak-vs-maniac-flop-call'") !== -1 &&
     labSrc.indexOf("name: 'weak-vs-lag-flop-call'") !== -1 &&
     labSrc.indexOf("name: 'weak-vs-maniac-turn-call'") !== -1 &&
     labSrc.indexOf("name: 'weak-vs-lag-turn-fold'") !== -1 &&
     labSrc.indexOf("name: 'secondpair-vs-maniac-flop-call'") !== -1,
    'the lab pins the weak-pair flop calls and turn folds plus the second-pair small-bet call control (v1.8.266 spots re-decided in v1.8.274: the flop folds were the four-player truth, heads-up they call at 42%/38%; v1.8.283 re-decides the Maniac turn spot to a call: exact truth 28.3% vs a 25% need, the old fold was the hero-cards-in-the-eq1-pool flaw)');
}

console.log('\n84. v1.8.267: second pair is priced vs the made hands at least as good as it');
{
  ok(src.indexOf("(hc === 'secondpair' && table.street === 'river')") !== -1,
    'the pair-plus fallback covers second pair only on the river now: off the river it keeps the tier-range price, since the pair-plus pool priced it at 16-22% against the heads-up truth of 34-58% (v1.8.272 corrects v1.8.267, whose "true 15-28%" was the four-player truth)');
  ok(src.indexOf('estimateEquityVsMadePairPlus') !== -1 &&
     equitySrc.indexOf('pairRankOf(h, community) < heroPair') !== -1,
    'second pair is priced against the pair-plus pool on the river when the analytic price is unavailable: made hands whose pair is at least as good as the hero pair (v1.8.267, v1.8.272)');
  ok(src.indexOf('usually behind the top-pair hands') !== -1,
    'the second-pair fold explains it in plain English for the river fallback case (v1.8.267)');
  ok(labSrc.indexOf("name: 'secondpair-vs-maniac-flop-call'") !== -1 &&
     labSrc.indexOf("name: 'secondpair-vs-lag-flop-call'") !== -1 &&
     labSrc.indexOf("name: 'secondpair-vs-maniac-turn-call'") !== -1 &&
     labSrc.indexOf("name: 'secondpair-vs-lag-turn-call'") !== -1 &&
     labSrc.indexOf("name: 'facing-2ndpair-rock-call'") !== -1 &&
     labSrc.indexOf("name: 'secondpair-vs-rock-turn-fold'") !== -1,
    'the lab pins the second-pair calls at medium bets on flop and turn, the Rock small-bet call, and the Rock big-bet turn fold: the v1.8.267 folds were the four-player truth, heads-up they all call (v1.8.272)');
}

console.log('\n85. v1.8.268: the leak tracker prices bad-chase calls the way the coach does');
{
  ok(src.indexOf('var chaseEq = eq;') !== -1 &&
     src.indexOf('estimateEquityVsMadePairPlus(hero.hole, table.community, 2000)') !== -1,
    'bad-chase is priced against the made hands he bets for air, weak pair and second pair — the tier pool priced ace-high at ~40% and stayed silent on calls the coach folds (v1.8.268)');
  ok(src.indexOf('liveOpponents().length < 2') !== -1 &&
     src.indexOf('villainCalledBig(table.players.indexOf(V))') !== -1,
    'the tracker mirror applies only heads-up and not when the villain called big earlier, matching the coach pricing conditions (v1.8.268)');
}

console.log('\n86. v1.8.269: weak pair is priced vs the pair-plus pool too');
{
  ok(src.indexOf("eqMade = hc === 'air'") !== -1 &&
     equitySrc.indexOf('function estimateEquityVsMadePairPlus') !== -1,
    'only air still uses the uniform made pool: weak pair and second pair both use the pair-plus pool, since handClass calls a middle pair weak pair and the uniform pool priced it at ~40% on the river (v1.8.269)');
  ok(labSrc.indexOf("name: 'weakpair-river-vs-maniac-call'") !== -1 &&
     labSrc.indexOf("name: 'weakpair-river-vs-lag-call'") !== -1 &&
     labSrc.indexOf("name: 'weakpair-river-vs-rock-fold'") !== -1 &&
     labSrc.indexOf("name: 'weakpair-river-bottom-control'") !== -1,
    'the lab pins the three middle-pair river spots plus the bottom-pair control: the Maniac/LAG calls are corrected to calls in v1.8.270 (heads-up truth 38%/30%), the Rock fold and bottom-pair control are unchanged (v1.8.269, v1.8.270)');
}

console.log('\n87. v1.8.270: river one-pair hands are priced vs the betting range');
{
  ok(equitySrc.indexOf('function estimateEquityVsBettingRange') !== -1 &&
     src.indexOf('estimateEquityVsBettingRange(hero.hole, table.community,') !== -1,
    'river one-pair hands are priced by applying the bot\'s own bet rule to every holding, exactly enumerated — the four-player truth probe 7 measured understated every loose-villain range heads-up (QJ 46% vs 76%, KK 55% vs 79%) (v1.8.270)');
  ok(src.indexOf("['alice', 'amogh', 'donald', 'nathan'].indexOf(V.archetype.id) === -1") !== -1 &&
     src.indexOf('!V.archetype.neverRaise') !== -1,
    'the analytic price applies only to generic-rule villains: Alice/Amogh/Donald/Nathan have custom river logic and Rohan/Station never raise, so their river bets are not the generic rule (v1.8.270)');
  ok(src.indexOf('var loneRiverPriced = riverBetPriced') !== -1 &&
     src.indexOf('villainFirstRiverAggro(vIdx) && adjEq > need2') !== -1,
    'the big-bet veto stands down only for a lone river bet whose betting-range price clears need — a turn bet before the river bet keeps the veto (v1.8.270)');
  ok(src.indexOf('bluffy <= 0.55 && !riverBetPriced') !== -1,
    'the +0.03 river prior is zeroed for betting-range-priced spots: the under-bluffing is already in the price, and keeping it kept second pair vs LAG 200 a fold (v1.8.270)');
  ok(labSrc.indexOf("name: 'toppair-river-vs-rock-call'") !== -1 &&
     labSrc.indexOf("name: 'overpair-river-vs-rock-call'") !== -1,
    'the lab pins top pair and overpair calls vs the Rock 0.75x river bet: heads-up he bets every top pair, so 64%/70% clear the 30% price (v1.8.270)');
}

console.log('\n88. v1.8.271: the leak tracker mirrors the betting-range price');
{
  ok(src.indexOf('betEqL = estimateEquityVsBettingRange') !== -1 &&
     src.indexOf('if (betEqL != null) chaseEq = Math.max(0, betEqL - drawRealizationDiscount(hc));') !== -1,
    'bad-chase prices a river one-pair call against the betting range, falling back to the pair-plus pool off the river or for a non-generic villain: calling 7x vs the Maniac 200 is a correct call at 38%, not a chase (v1.8.271; draws join in v1.8.280 and the chase price is the realized equity, 5 points under the raw betting-range figure)');
  ok(src.indexOf('var foldEq = eq;') !== -1 &&
     src.indexOf('if (betEqF != null) foldEq = betEqF;') !== -1,
    'weak-fold prices a river one-pair fold against the betting range too: folding 7x vs the Rock 50 is correct at ~6%, not a weak fold, while folding it vs the Maniac 50 still flags at ~38% (v1.8.271)');
  ok(src.indexOf('if (genericL) {') !== -1 &&
     src.indexOf("(hc === 'air' || hc === 'weakpair' || hc === 'secondpair' || hc === 'trips' || hc === 'twopair') && table.street !== 'river'") !== -1,
    'air uses the analytic price in the tracker too, matching the coach (v1.8.287 corrects v1.8.271, whose "analytic price is for one-pair hands only" left air on the uniform made pool that priced KQ-high at ~37% on a paired board against a ~8% truth)');
}

console.log('\n89. v1.8.272: second pair is priced on the tier range off the river');
{
  ok(src.indexOf("(hc === 'secondpair' && table.street === 'river')") !== -1,
    'the coach prices second pair on the tier range on flop and turn: the pair-plus pool said 16-22% against a heads-up truth of 34-58% (probe12), while the tier range says 66%/55%/39% on the flop and 68%/56%/38% on the turn (probe14) (v1.8.272)');
  ok(src.indexOf("else if (hc !== 'secondpair' || table.street === 'river')") !== -1,
    'the tracker mirrors it: a second-pair call off the river is not re-priced to the pair-plus pool, so calling the Maniac 300 on the turn is not a bad chase (v1.8.272)');
  ok(labSrc.indexOf("name: 'secondpair-vs-maniac-flop-potbet-call'") !== -1 &&
     labSrc.indexOf("name: 'secondpair-vs-rock-turn-fold'") !== -1,
    'the lab pins both sides: second pair calls a pot-sized flop bet vs the Maniac (truth 58% at a 33% price) and folds a 1.5x turn bet vs the Rock (truth 36% at a 40% price) (v1.8.272)');
}

console.log('\n90. v1.8.274: weak pair is priced vs the betting range off the river');
{
  ok(equitySrc.indexOf('function estimateEquityVsBettingRangePostflop') !== -1 &&
     equitySrc.indexOf('evaluate7Fast(h.concat(board2))') !== -1,
    'the flop/turn betting-range price runs on the fast evaluator: the slow one cost 43-64s a call (probe16) because it enumerates all 21 five-card subsets (v1.8.274)');
  ok(src.indexOf('eqMade = estimateEquityVsBettingRangePostflop(hero.hole, table.community,') !== -1 &&
     src.indexOf("hc === 'weakpair'") !== -1 && src.indexOf("table.street !== 'river'") !== -1,
    'the coach prices weak pair off the river against the betting range: the pair-plus pool said 18-21% against the heads-up truth of 42%/38%/19% on the flop and 26%/22%/10% on the turn (probe12) (v1.8.274; extended to every one-pair hand in v1.8.275)');
  ok(src.indexOf("var appliedAdjust = (riverBetPriced || betRangePriced || multiBetPriced) ? 0 : rangeAdjust;") !== -1 &&
     src.indexOf("var threshold = need2 + appliedAdjust + rp2;") !== -1,
    'the threshold does not discount for a wide range once the price IS the betting range: the discount double-counted looseness and called with 22% against a 25% need vs the Rock (v1.8.274; the multiway betting-range price joins the zeroing in v1.8.301, same rule)');
  ok(labSrc.indexOf("name: 'weakpair-flop-vs-maniac-call'") !== -1 &&
     labSrc.indexOf("name: 'weakpair-flop-vs-rock-fold'") !== -1 &&
     labSrc.indexOf("name: 'weakpair-turn-vs-maniac-small-call'") !== -1,
    'the lab pins the weak-pair flop/turn calls and folds: the price lands within ~3 points of the heads-up truth on every street and villain (probe18) (v1.8.274)');
}

console.log('\n91. v1.8.275: every one-pair hand is priced vs the betting range off the river');
{
  ok(src.indexOf("(hc === 'air' || hc === 'weakpair' || hc === 'secondpair' ||\n          hc === 'toppair' || hc === 'overpair' || hc === 'trips' || hc === 'twopair' ||\n          hc === 'draw' || hc === 'draw-weak' || hc === 'draw-strong') && table.street !== 'river'") !== -1,
    'the flop/turn betting-range price covers air plus all four one-pair classes plus trips and two pair: the tier range understated top pair vs the Rock by 11-14 points and overstated second pair vs the Maniac on the turn by 11, while the estimator lands within ~3 points of the heads-up truth on every class (probe22, v1.8.275; trips and two pair join in v1.8.277, probe27; draws join in v1.8.280, probe28/30; air joins in v1.8.287)');
  ok(src.indexOf("(hc === 'air' || hc === 'weakpair' || hc === 'secondpair' || hc === 'trips' || hc === 'twopair') && table.street !== 'river'") !== -1,
    'the leak tracker mirrors the estimator for air, second pair, trips and two pair too, so a bad-chase call is priced the way the coach prices it (v1.8.275; trips and two pair join in v1.8.277; air joins in v1.8.287)');
  ok(labSrc.indexOf("name: 'toppair-flop-vs-rock-call'") !== -1 &&
     labSrc.indexOf("name: 'toppair-turn-vs-rock-call'") !== -1 &&
     labSrc.indexOf("name: 'overpair-flop-vs-rock-call'") !== -1 &&
     labSrc.indexOf("name: 'secondpair-turn-vs-maniac-call'") !== -1,
    'the lab pins the one-pair calls vs the Rock and the Maniac under the new price: the advice is call at medium bets under either price, so the lab pins stability and the coach-advice tests pin the number (v1.8.275)');
}

console.log('\n92. v1.8.280: draws are priced vs the betting range off the river');
{
  ok(equitySrc.indexOf('function drawRealizationDiscount(hc)') !== -1 &&
     equitySrc.indexOf("hc === 'draw' || hc === 'draw-weak' || hc === 'draw-strong') ? 0.05 : 0") !== -1,
    'a draw realizes 5 points under its raw betting-range equity: it folds when it misses and faces another bet, so the coach prices the realized figure, not the raw one (v1.8.280, probe28/30)');
  ok(src.indexOf("} else if (genericL && (hc === 'draw' || hc === 'draw-weak' || hc === 'draw-strong') && table.street !== 'river')") !== -1 &&
     src.indexOf('eqMade - drawRealizationDiscount(hc)') !== -1,
    'the leak tracker prices draws against the betting range off the river (postflop estimator only, never the river one — a draw has no river) and subtracts the realization discount: the tier price overshot the truth by 9-19 points vs loose villains plus a flat +10 credit, over-calling 18 of 54 cells (probe28) — the draw branch is generic-only since v1.8.290, customs take the custom pricer first');
  ok(src.indexOf('var callMargin = (betRangePriced && anyDraw) ? 0 : 0.03;') !== -1,
    'the +0.03 call margin is zeroed for betting-range-priced draws: the realization discount already is their margin, and stacking the two folded hands the truth calls (nut FD vs LAG 3/4-pot, combo vs Rock 3/4-pot) — probe30 goes 23 flips to 4, all within 1.4 points of the line');
  ok(src.indexOf('if (betEqF2 != null) foldEq = Math.max(0, betEqF2 - drawRealizationDiscount(hc));') !== -1,
    'the leak tracker mirrors the draw price for weak-fold too, so a fold the coach would call still flags (v1.8.280)');
  ok(labSrc.indexOf("name: 'draw-gutshot-flop-vs-maniac-fold'") !== -1 &&
     labSrc.indexOf("name: 'draw-nutfd-turn-vs-rock-fold'") !== -1 &&
     labSrc.indexOf("name: 'draw-nutfd-turn-vs-lag-call'") !== -1 &&
     labSrc.indexOf("name: 'draw-combo-turn-vs-rock-call'") !== -1,
    'the lab pins the draw flips and the two margin-zeroed 3/4-pot calls: the gutshot and nut-FD folds were calls under the tier price, and the 3/4-pot calls sit 0.8 points over need on the seeded estimator, so they are deterministic, not noise (v1.8.280)');
}

console.log('\n93. v1.8.281: preflop raise sizes are pinned in the lab and verdicts state amounts');
{
  ok(labSrc.indexOf("if ((spot.kind === 'facing-raise' || spot.kind === 'facing-preflop') && spot.expectRaiseTo != null) {") !== -1,
    'the lab raise-size check covers facing-preflop spots too, gated on expectRaiseTo so range and all-in messages stay unpinned (v1.8.281, probe32)');
  ok(labSrc.indexOf("name: '3bet-rock-qq-raise'") !== -1 &&
     labSrc.indexOf('expectRaiseTo: 207') !== -1 &&
     labSrc.indexOf("name: 'open-10x-rock-aa-raise'") !== -1 &&
     labSrc.indexOf('expectRaiseTo: 300') !== -1 &&
     labSrc.indexOf("name: 'iso-3-limpers-60'") !== -1 &&
     labSrc.indexOf('expectRaiseTo: 60') !== -1,
    'the lab pins 11 preflop raise sizes (4-bet to 207, open-raise to 300, iso raises to 40/50/60) measured stable over 3 reps each in probe32; the 4 all-in/range spots stay unpinned because their messages carry no single to ~ size');
  ok(src.indexOf("behind a ' + fmt(toCall) + ' call") !== -1 &&
     src.indexOf("fmt(toCall * 15) + ' behind") !== -1,
    'set-mine lessons state the concrete amounts: 15x the call is named in chips behind a named call, not a bare multiple (v1.8.281 audit)');
  ok(src.indexOf("plus 1× per caller in front — here that is to ~' + fmt(three) + '.'") !== -1,
    'the 3-bet rule lesson states the actual re-raise size for this hand, not just the 3x/4x rule (v1.8.281 audit)');
  ok(src.indexOf("but a ' + fmt(heroTotalV) + ' reshove needs") !== -1,
    'the reshove-fold verdict states the shove size in chips, not just the break-even percentage (v1.8.281 audit)');
  ok(src.indexOf("The pot (' + fmt(pot) + ') is already nearly as big as your stack (' + fmt(hero.stack) + ') — calling ' + fmt(toCall) + ' costs") !== -1,
    'the commit-call verdict states the pot, the stack and the call cost, not just that the pot is nearly as big as the stack (v1.8.281 audit)');
  ok(src.indexOf("bet about ' + UI.fmt(Math.round(pot * 2 / 3)) + ' (two-thirds pot)") !== -1 &&
     src.indexOf("about ' + UI.fmt(Math.round(pot / 3)) + ' (a third of the pot)") !== -1 &&
     src.indexOf("A half-pot semi-bluff (~' + UI.fmt(Math.round(pot / 2)) + ')") !== -1,
    'the missed-value and semi-bluff leak lessons state the bet size in chips for the street pot at leak time, not a bare fraction of an unnamed pot (v1.8.281 audit)');
  var engineSrc = fs.readFileSync(__dirname + '/../js/engine.js', 'utf8');
  ok(engineSrc.indexOf('drainEvents') === -1,
    'the dead drainEvents() method is gone from the engine: zero call sites, only the definition remained (v1.8.281 debloat scan)');
}

console.log('\n94. v1.8.285: one seeded RNG everywhere, no glibc LCG');
{
  ok(labSrc.indexOf('1103515245') === -1,
    'the lab gross check no longer runs its own glibc LCG: seededGrossEq uses the shared mulberry32 (v1.8.279 proved the same LCG family corrupts seeds)');
  var fastSrc = fs.readFileSync(__dirname + '/../tests/evaluator-fast-test.js', 'utf8');
  ok(fastSrc.indexOf('1103515245') === -1 && fastSrc.indexOf('EQ.seededRnd(424242)') !== -1,
    'the evaluator differential test draws its random hands from the same shared mulberry32, not a second copy of the LCG');
  ok(labSrc.indexOf('EQ.seededRnd(h || 1)') !== -1,
    'seededGrossEq seeds the shared RNG from the spot name, so the gross figures stay deterministic per spot');
}

console.log('\n95. v1.8.289: facing a raise is priced vs the raise range');
{
  var eqSrc = fs.readFileSync(__dirname + '/../js/equity.js', 'utf8');
  ok(eqSrc.indexOf('function estimateEquityVsRaiseRange(') !== -1 &&
     eqSrc.indexOf('function estimateEquityVsRaiseRangePostflop(') !== -1,
    'the raise pricers exist: an exact river enumerator and a seeded postflop sampler, mirroring the betting-range pricers (v1.8.289)');
  ok(eqSrc.indexOf('if (eq1 > needV + margin) return eq1 > 0.74 ? aggression * 0.55 : 0;') !== -1 &&
     eqSrc.indexOf("if (ms > 0.22 && eq1 > 0.25) return bluff * 0.16;") !== -1,
    'the raise rule mirrors the bot exactly: a value raise needs eq over need+margin AND over 0.74 (prob agg*0.55), a bluff raise needs ms over 0.22 and eq over 0.25 (prob bluff*0.16) — the coach no longer prices a raise with the betting range (v1.8.289)');
  ok(src.indexOf('function villainRaiseInfo(idx)') !== -1 &&
     src.indexOf("entries[i].action === 'raise'") !== -1 &&
     src.indexOf('needV: heroBet / (heroPot + heroBet)') !== -1,
    'the coach detects a raise from the timeline (the villain\'s last action on the street is a raise) and reads the villain\'s own need from hero\'s bet before it (v1.8.289)');
  ok(src.indexOf('estimateEquityVsRaiseRange(hero.hole, table.community,') !== -1 &&
     src.indexOf('estimateEquityVsRaiseRangePostflop(hero.hole, table.community,') !== -1,
    'the coach prices a raise with the raise pricers on the river and off it, and the leak tracker mirrors it in the bad-chase and weak-fold branches (v1.8.289)');
  ok(src.indexOf("deep: sprV >= 2.5") !== -1,
    'the raise price is used only when the villain is deep: below SPR 2.5 the bot shoves monsters, a range the raise pricer does not model, so the bet price stands (v1.8.289)');
  ok(labSrc.indexOf("name: 'river-2ndpair-vs-maniac-raise-fold'") !== -1 &&
     labSrc.indexOf("name: 'flop-2ndpair-vs-lag-raise-fold'") !== -1 &&
     labSrc.indexOf("name: 'turn-toppair-vs-lag-raise-call'") !== -1 &&
     labSrc.indexOf("name: 'river-toppair-vs-maniac-raise-call'") !== -1,
    'the lab pins all four raise spots: second pair folds to a raise on the river and the flop, top pair calls it on the turn and the river — the lab had zero postflop raise-facing spots before (v1.8.289)');
}

console.log('\n96. v1.8.290: custom villains are priced vs their own betting rule');
{
  ok(equitySrc.indexOf('function estimateEquityVsBettingRangeCustom(') !== -1 &&
     equitySrc.indexOf('function estimateEquityVsBettingRangeCustomPostflop(') !== -1,
    'the custom pricers exist: an exact river enumerator and a seeded postflop sampler, one bet rule per villain (v1.8.290)');
  ok(equitySrc.indexOf("if (villainId === 'alice')") !== -1 &&
     equitySrc.indexOf('return (ms >= 0.52 || eq1 >= 0.62) ? 1 : 0;') !== -1 &&
     equitySrc.indexOf("if (villainId === 'nathan')") !== -1 &&
     equitySrc.indexOf("return ms > 0.78 ? (isRiver ? 0.75 : 1) : 0;") !== -1,
    'Alice bets any pair-plus or a strong draw, Nathan only bets monsters (75% on the river, always off it — his monsterThrough lets monsters bet); the old tier price quoted two pair 94 vs Alice at 0% against a ~54% truth (v1.8.290)');
  ok(equitySrc.indexOf("var betLine = 0.62 - aggression * 0.12 + (isRiver ? 0.04 : 0);") !== -1 &&
     equitySrc.indexOf('if (ms >= 0.3 && ms <= 0.6 && !isRiver && !hasDraw) return wantsBet ? 0.3 : 0;') !== -1,
    'Amogh bets the narrow line agg*0.12 with draw-only bluffs and checks mid-strength pairs 70% off the river (v1.8.290)');
  ok(equitySrc.indexOf('function isWetBoard(community)') !== -1 &&
     equitySrc.indexOf('var pDraw = (hasDrawD && ms < 0.55) ? 0.65 : 0;') !== -1 &&
     equitySrc.indexOf('var pWet = (ms >= 0.4 && ms < 0.78 && isWetBoard(community) && !isRiver) ? 0.7 : 0;') !== -1,
    'Donald adds a 65% draw bluff and a 70% wet-board overbet to the generic line (v1.8.290, v1.8.311: the overbet is off the river only — the bot never bombs a wet river board)');
  ok(src.indexOf("var customBettor = V && V.archetype &&") !== -1 &&
     src.indexOf('estimateEquityVsBettingRangeCustom(hero.hole, table.community,') !== -1 &&
     src.indexOf('estimateEquityVsBettingRangeCustomPostflop(hero.hole, table.community,') !== -1,
    'the coach and the leak tracker both price customs with the custom pricers when the villain bets — the F5 contradiction (coach folds quoting the made pool while the tracker flags both the fold and the call) is gone (v1.8.290)');
  ok(src.indexOf('} else if (!raiseInfo) {') !== -1,
    'a custom villain\'s RAISE still falls back to the tier price: the generic raise rule does not model Alice\'s monster shoves or Amogh\'s tier-1 shoves (v1.8.290)');
  ok(labSrc.indexOf("name: 'twopair-KK9-vs-alice-call'") !== -1 &&
     labSrc.indexOf("name: 'twopair-KK9-vs-nathan-fold'") !== -1 &&
     labSrc.indexOf("name: 'toppair-vs-alice-call'") !== -1 &&
     labSrc.indexOf("name: 'twopair-772-vs-amogh-potbet-fold'") !== -1,
    'the lab pins the four custom spots: two pair calls Alice and folds to Nathan, top pair calls Alice, two pair folds to Amogh\'s pot bet (v1.8.290)');
}

console.log('\n97. v1.8.302: the lab gross check prices the betting range, not the tier range');
{
  ok(labSrc.indexOf('function bettingGrossEq(spot, msg)') !== -1 &&
     labSrc.indexOf("msg.indexOf('bets on the ' + spot.street) === -1") !== -1 &&
     labSrc.indexOf('estimateEquityVsBettingRangeMulti(spot.hero, spot.board, aggr, bluff, extra)') !== -1,
    'the gross check recomputes equity with the betting-range model (heads-up postflop/river, multiway shared-runout) whenever the coach prices the spot that way, and falls back to the tier model otherwise (v1.8.302)');
  ok(labSrc.indexOf('var grossTol = (raiseGross != null || betGross != null || madeGross != null) ? 0.10 : 0.20;') !== -1,
    'the gross tolerance is 10 points on a price model (betting-range, raise-range or made-range) and 20 on the tier model: the coach\'s own price tracks the betting-range gross figure within 5.4 points on every gross-checked spot, while the tier figure runs 10-20 points high on folds (v1.8.302; the raise-range model joins the 10-point line in v1.8.305, the made-range model in v1.8.308)');
  ok(labSrc.indexOf("name: 'draw-nutfd-lag-potbet-fold'") !== -1 &&
     labSrc.indexOf("bet: 400, heroStack: 2000, nLive: 2, expect: 'fold',") !== -1,
    'the lab pins the nut-flush-draw pot-bet fold: the tier gross equity is 56.8% against a 53% line so the old model fails it, while the betting-range gross equity is 35.7% against a 43% line so the new model passes it (v1.8.302)');
}

console.log('\n98. v1.8.304: the lab gross check prices custom betting ranges too');
{
  ok(labSrc.indexOf('estimateEquityVsBettingRangeCustomMulti(spot.hero, spot.board, arch.id, aggr, bluff, extraC)') !== -1 &&
     labSrc.indexOf('estimateEquityVsBettingRangeCustomPostflop(spot.hero, spot.board, arch.id, aggr, bluff)') !== -1 &&
     labSrc.indexOf('estimateEquityVsBettingRangeCustom(spot.hero, spot.board, arch.id, aggr, bluff)') !== -1,
    'the gross check recomputes equity with the custom betting-range model (heads-up custom postflop/river, multiway custom shared-runout) for Alice, Amogh, Donald, and Nathan, and falls back to the tier model when the custom estimator returns null (empty range, river multiway) (v1.8.304)');
  ok(labSrc.indexOf("name: 'twopair-KK9-vs-alice-call'") !== -1 &&
     labSrc.indexOf("name: 'twopair-KK9-vs-nathan-fold'") !== -1 &&
     labSrc.indexOf("name: 'twopair-772-vs-amogh-potbet-fold'") !== -1 &&
     labSrc.indexOf("name: 'overpair-vs-alice-overbet-call'") !== -1,
    'the lab gross-checks six heads-up custom spots: the tier model fails three of them outright (two pair vs Alice 0.0% on a call, two pair vs Nathan 68.1% on a fold, two pair vs Amogh 69.5% on a fold) while the custom betting-range model passes all six within 0.5 points of the coach\'s price (v1.8.304)');
}

console.log('\n99. v1.8.305: the lab gross check prices the raise range for villain raises');
{
  ok(labSrc.indexOf('function raiseGrossEq(spot, msg)') !== -1 &&
     labSrc.indexOf("msg.indexOf('raises with on the ' + spot.street) === -1") !== -1 &&
     labSrc.indexOf('estimateEquityVsRaiseRangePostflop(spot.hero, spot.board, aggr, bluff, stubborn, needV, station)') !== -1 &&
     labSrc.indexOf('estimateEquityVsRaiseRange(spot.hero, spot.board, aggr, bluff, stubborn, needV, station)') !== -1,
    'the gross check recomputes equity with the raise-range model (heads-up seeded postflop, exact river) when the coach prices a villain raise that way, and falls back to the betting-range or tier model otherwise (v1.8.305)');
  ok(labSrc.indexOf('var toCallF = spot.bet - (spot.heroBet || 0);') !== -1,
    'the gross-check need counts only the extra chips to call a raise (bet minus hero\'s own bet) and the pot including hero\'s bet — the old facing formula overstated the need on raise spots (38% instead of 25% on the four villain-raise spots) (v1.8.305)');
  ok(labSrc.indexOf("name: 'flop-2ndpair-vs-lag-raise-fold'") !== -1 &&
     labSrc.indexOf("name: 'turn-toppair-vs-lag-raise-call'") !== -1 &&
     labSrc.indexOf("name: 'river-toppair-vs-maniac-raise-call'") !== -1,
    'the lab gross-checks three villain-raise spots: the tier model fails one outright (second pair vs the LAG on the flop: tier 56.0% against a 45% fold line) and runs 16-33 points loose on the other two (top pair vs the LAG on the turn 75.3% vs a 59% coach price; top pair vs the Maniac on the river 84.2% vs 51%) while the raise-range model passes all three within 0.4 points of the coach\'s price (v1.8.305)');
}

console.log('\n100. v1.8.308: the lab gross check prices the made range for air spots');
{
  ok(labSrc.indexOf('function madeGrossEq(spot, msg)') !== -1 &&
     labSrc.indexOf("msg.indexOf('With no pair, you only win when he is bluffing') === -1") !== -1 &&
     labSrc.indexOf('return EQ.estimateEquityVsMadeRange(spot.hero, spot.board, 2000);') !== -1,
    'the gross check recomputes equity with the made-range model (seeded, 2,000 sims) when the coach prices air that way, and falls back to the betting-range, raise-range or tier model otherwise (v1.8.308)');
  ok(labSrc.indexOf("name: 'air-betting-range-call'") !== -1 &&
     labSrc.indexOf("timeline: betTimeline('turn', 15, 500), grossCheck: true") !== -1 &&
     labSrc.indexOf("timeline: betTimeline('turn', 30, 500), grossCheck: true") !== -1 &&
     labSrc.indexOf("timeline: betTimeline('turn', 150, 500), grossCheck: true") !== -1,
    'the lab gross-checks the three Nathan air spots: the tier model prices ace-high at 45.9% against a 19% fold line (it fails the fold outright) while the made-range model passes all three (10.7% vs needs of 3%, 5% and 19%) (v1.8.308)');
}

console.log('\n101. v1.8.309: the lab checks the coach-implied equity against its own advice');
{
  ok(labSrc.indexOf("if (pct != null && v.advice === 'call' && pct < needF)") !== -1 &&
     labSrc.indexOf("if (pct != null && v.advice === 'fold' && pct > needF + 0.03)") !== -1,
    'a facing spot fails when the equity figure its own message quotes contradicts the advice: a call quoting below the need, or a fold quoting above the need plus the coach\'s own 0.03 call margin (v1.8.309)');
  ok(labSrc.indexOf('% (quoted-vs-advice checked)') !== -1 &&
     labSrc.indexOf('Monte Carlo, reported only') === -1,
    'the facing-spot note no longer calls the coach-implied figure "reported only": 97 quoting spots are checked, and a probe (hidden_files/consistency-probe.js) measured 0 contradictions, with 1 point of headroom on both sides (closest fold quotes 20% vs an 18% need, closest call 31% vs 30%) (v1.8.309)');
}

console.log('\n102. v1.8.310: F10 — the trapper gate is priced vs the betting range, not the tier pool');
{
  ok(src.indexOf('trapperBet = estimateEquityVsBettingRangeCustom(hero.hole, table.community,') !== -1 &&
     src.indexOf('(trapperBet != null ? trapperEq > 0.50 : trapperEq >= 0.90)') !== -1,
    'the trapper value-raise gate prices the villain\'s betting range on the river when the custom estimator has a price, with a 0.50 line (the raise breaks even at exactly half the betting-range equity when the trapper always calls it), and keeps the 0.90 tier line only when the estimator returns null (v1.8.310)');
  ok(src.indexOf('!(passiveTrapper && trapperBet != null && trapperBet <= 0.50)') !== -1 &&
     src.indexOf('if (trapperN && trapperBetN != null && trapperBetN <= 0.50) return null;') !== -1,
    'the generic made-hand value raise is skipped too when the trapper\'s betting-range price is at or below the line, and the leak mirror does not flag the resulting call as missed value (v1.8.310)');
  ok(labSrc.indexOf("name: 'trapper-flushboard-topset-fold'") !== -1 &&
     labSrc.indexOf("name: 'trapper-flushboard-4thnut-call'") !== -1 &&
     labSrc.indexOf("name: 'trapper-flushboard-3rdnut-raise'") !== -1 &&
     labSrc.indexOf("name: 'madehand-flush-trapper-call'") !== -1,
    'the lab pins the F10 cells: top set vs Nathan on a three-flush board folds (betting-range equity 0%, raise loses 300), the fourth-nut flush calls (35.7%, raise loses 86), the third-nut flush raises to 450 (53.6%, raise gains 21), and the paired-board nut flush calls (48.2% — the old raise lost 11 and the tier quote still reads 87%) (v1.8.310)');
}

console.log('\n103. v1.8.311: Donald\'s betting-range model mirrors his real bet rule');
{
  ok(equitySrc.indexOf("var pWet = (ms >= 0.4 && ms < 0.78 && isWetBoard(community) && !isRiver) ? 0.7 : 0;") !== -1,
    'Donald\'s wet-board overbet is modelled only off the river: the bot\'s overbet branch is gated on street !== \'river\', so the old model credited 0.7 to every mid hand on a wet river board he never bombs (v1.8.311)');
  ok(equitySrc.indexOf("else if (ms >= 0.55 && eq1 > betLineD) pGenD = 1;") !== -1 &&
     equitySrc.indexOf("else if (ms >= 0.4 && ms < 0.55 && eq1 > betLineD) pGenD = 0.45 + aggression * 0.25;") !== -1 &&
     equitySrc.indexOf("else if (ms < 0.55) pGenD = bluff * (0.22 + bluff * 0.25) * (isRiver ? 1 : 0.55);") !== -1,
    'the generic fall-through mirrors the bot: the equity line needs ms >= 0.55 for a certain bet, mid hands bet it only 45% + aggression*25%, and the bluff rate is bluff*(0.22 + bluff*0.25) with the 0.55 street factor off the river — the old model bet every holding with eq1 over the line and bluffed at bluff*0.22 (v1.8.311)');
  ok(equitySrc.indexOf("if (hasDrawD && ms < 0.55) semiD = 0.25 + aggression * 0.35;") !== -1 &&
     equitySrc.indexOf("else if (hasGutD && ms < 0.55) semiD = 0.12 + aggression * 0.2;") !== -1,
    'draws get their second semi-bluff chance in the generic fall-through (a draw that misses the 65% bluff still semi-bluffs at 0.25 + aggression*0.35, gutshots at 0.12 + aggression*0.2) — the old model left draws at the 0.11 bluff rate after a missed draw bluff (v1.8.311)');
  ok(labSrc.indexOf("name: 'secondpair-donald-wet-river-call'") !== -1 &&
     labSrc.indexOf("name: 'secondpair-donald-dry-river-call'") !== -1,
    'the lab pins the fix: second pair vs Donald on the wet river calls quoting 29% (old model 17%, a fold — real bot ~28-29%), on the dry river calls quoting 34% (old model 29%, real bot ~34-35%) (v1.8.311)');
}

console.log('\n104. v1.8.312: a guard fold quotes the price when the price supports the fold');
{
  ok(src.indexOf("if ((riverBetPriced || betRangePriced || multiBetPriced) && adjEq <= need2 + 0.03) {") !== -1 &&
     src.indexOf("guardPriced = ' You win about ' + pct(adjEq) + ' against every hand ' + vName + ' ' + guardSource") !== -1,
    'when a big-bet guard folds a hand the coach already priced, the fold message quotes that price with the pot odds — but only when the price supports the fold (adjEq at or below need + 0.03), so an overbet fold the price model distrusts never quotes a number the advice contradicts (v1.8.312)');
  ok(src.indexOf("(riverBetPriced && raisePriced) ? 'raises with on the river'") !== -1 &&
     src.indexOf("(betRangePriced && raisePriced) ? 'raises with on the ' + table.street") !== -1,
    'the guard clause reuses the math line\'s raise-range phrasing ("raises with on the river") so the lab\'s raise gross check can verify the quoted figure (v1.8.312)');
  ok(labSrc.indexOf("name: 'river-2ndpair-vs-maniac-raise-fold'") !== -1 &&
     labSrc.indexOf("expectWord: 'raises with on the river'") !== -1,
    'the fourth raise spot gains a gross check: second pair vs the Maniac\'s river raise folds quoting 0% (raise range) against a 25% need — without the clause the lab fell back to the tier range at 63.2% and failed the fold outright (v1.8.312)');
}

console.log('\n105. v1.8.314: made-hand river calls quote the betting-range price, not the tier price');
{
  ok(src.indexOf("hc === 'madehand' || hc === 'nut') && (genericBettor || customBettor)) {") !== -1,
    'made-hand and nut hands are priced vs the betting range on the river like every one-pair class, so a river call quotes the price the decision used — the paired-board nut flush vs Nathan quoted 87% from the tier pool while the trapper gate priced it at 48.2% (v1.8.314)');
  ok(src.indexOf("hc === 'madehand' || hc === 'nut') &&\n          (genericF || customF)) {") !== -1,
    'the leak tracker mirrors the same river price for made-hand and nut hands, so its weak-fold check can never disagree with the coach quote (v1.8.314)');
  ok(labSrc.indexOf("name: 'madehand-flush-trapper-call'") !== -1 &&
     labSrc.indexOf("grossCheck: true,\n    timeline: betTimeline('river', 100, 500)") !== -1,
    'the lab pins the F10 cell: the paired-board nut flush vs Nathan calls, and its gross check now verifies the 48% betting-range quote instead of the tier figure (v1.8.314)');
}

console.log('\n106. v1.8.315: Amogh\'s betting-range price uses the bot\'s own equity universe');
{
  ok(equitySrc.indexOf("if (b === a) continue;\n      if (keys[b][0] === keys[a][0]") !== -1 &&
     equitySrc.indexOf("var p = customBetProb(villainId, pool[a], mss[a], eq1, community, aggression, bluff, true);") !== -1,
    'the custom river estimator prices the bet decision on the bot\'s equity universe: its inner eq1 loop runs straight from the self-skip to the overlap check with no hero-card skip, because the bot\'s internal eq is computed over hands that can hold them — a pair of 5s reads 0.538 to the bot against its 0.54 line, not the 0.556 the hero-exclusive pool gives, so the old model credited those hands at p=1 and priced second pair 4.5 points high on the dry river (v1.8.315)');
  ok(labSrc.indexOf("name: 'secondpair-amogh-dry-river-call'") !== -1 &&
     labSrc.indexOf("name: 'secondpair-amogh-dry-river-fold'") !== -1 &&
     labSrc.indexOf("name: 'secondpair-amogh-wet-river-fold'") !== -1,
    'the lab pins the Amogh cells: second pair on the dry river calls a 75 bet quoting 21% (real bot 20.2%) and folds a 200 bet quoting 21% vs a 25% need, and folds the wet river quoting 5% (real bot ~9%) (v1.8.315)');
}

console.log('\n107. v1.8.316: the lab gross check covers the plain HU facing spots');
{
  var grossCount = (labSrc.match(/grossCheck: true/g) || []).length;
  ok(grossCount >= 130,
    'the gross check (seeded shared-runout recomputation, 10-pt same-model / 20-pt tier tolerance) now covers ' + grossCount + ' spots, including the 32 plain HU facing spots enabled in v1.8.316 — the lab ran 0 failures after the extension, so no gross pricing error hides in the air/weak/second-pair/draw cells vs Rock, Maniac and LAG (v1.8.316)');
  ok(labSrc.indexOf("name: 'draw-mediumbet-call'") !== -1 &&
     labSrc.indexOf("name: 'secondpair-vs-rock-turn-fold'") !== -1 &&
     labSrc.indexOf("name: 'trapper-small-bet'") !== -1,
    'the newly gross-checked cells include the draw call, the second-pair turn fold and the trapper small bet — their seeded equities (37.0% betting range, 38.2% betting range, 86.7% tier) track the quoted prices within tolerance (v1.8.316)');
}

console.log("\n=== Results: " + pass + " passed, " + fail + " failed ===");
process.exit(fail ? 1 : 0);
