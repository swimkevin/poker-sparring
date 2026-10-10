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

console.log('\n2. posName destructured in coachPreflop (v1.8.65 critical bug)');
{
  // The fix: var V = c.V, vIdx = c.vIdx, vName = c.vName, tier = c.tier, posName = c.posName;
  const match = src.match(/function coachPreflop\(c\) \{[^}]*var V = c\.V[^;]*;/s);
  const hasPosName = match && match[0].includes('posName = c.posName');
  ok(hasPosName, 'posName destructured in coachPreflop');
}

console.log('\n3. countLimpers only counts pre-raise calls (v1.8.62 fix)');
{
  const fnMatch = src.match(/function countLimpers\(\) \{[\s\S]*?\n  \}/);
  const fn = fnMatch ? fnMatch[0] : '';
  ok(fn.includes('!raised'), 'countLimpers tracks raised flag');
  ok(fn.includes("t.action === 'call' && !raised"), 'only counts calls before raise');
}

console.log('\n4. handClass: board pair ≠ hero pair (v1.8.62 fix)');
{
  ok(src.includes('heroHasPair'), 'handClass checks heroHasPair');
  ok(src.includes("if (!heroHasPair) return 'air'"), 'board pair without hero card → air');
}

console.log('\n5. No multiway semi-bluffs (v1.8.62 fix)');
{
  // Should check multiway before suggesting semi-bluff
  const drawSection = src.match(/Draws: semi-bluff[\s\S]*?if \(multiway\)/);
  ok(!!drawSection, 'multiway check before semi-bluff');
}

console.log('\n6. Jargon-free coach');
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

console.log('\n7. Friend bot archetypes in opponentReads');
{
  const reads = ['alice', 'rohan', 'swimkev'];
  const missing = reads.filter(id => !src.includes(id + ':'));
  ok(missing.length === 0, 'all friend bots have reads' + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''));
}

console.log('\n8. Debug mode and test hooks (v1.8.64 hardening)');
{
  ok(src.includes('window.__coachDebug'), 'coach debug flag exists');
  ok(src.includes('coachdebug=1'), 'URL param debug support');
  ok(src.includes('testScenario'), 'testScenario hook exists');
  ok(src.includes('enableDebug'), 'enableDebug hook exists');
  ok(src.includes('[coach] verdict failed'), 'error logging in debug mode');
}

console.log('\n9. posName destructured in coachPostflop (v1.8.68 critical bug)');
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

console.log('\n10. Iso-raise option for 2+ limpers in late/middle (v1.8.71)');
{
  // Kevin's spot: A4o (tier 5) in MP with 2 limpers + dead money got a flat
  // "fold" because the iso-raise gate required 3+ limpers on button/cutoff.
  // Now 2+ limpers in button/cutoff/middle with a playable hand offers the
  // iso-raise as an option instead of a bare fold.
  ok(src.includes("countLimpers() >= 2 && (posName === 'button' || posName === 'cutoff' || posName === 'middle position')"),
    'iso-raise branch covers 2+ limpers in button/cutoff/middle');
  ok(src.includes('attack the dead money'), 'iso-raise message mentions dead money');
}

console.log('\n11. No single-villain read in limped multiway pots (v1.8.71)');
{
  // Kevin's spot showed "vs Amogh" with 4+ players in a limped pot — the
  // read is noise when nobody has raised. The tail must be suppressed for
  // limped multiway pots, not just 3+ limpers.
  ok(src.includes('limpedMulti'), 'limpedMulti suppression exists');
  ok(/limpedMulti = table\.street === 'preflop' && table\.currentBet <= table\.bb && isMultiway\(\)/.test(src),
    'limpedMulti requires preflop, no raise, and multiway');
  ok(/var tail = \(isMultiLimp \|\| limpedMulti\)/.test(src),
    'tail suppressed for limped multiway pots');
}

console.log('\n12. Engine: no betting round with 0-1 actors (v1.8.71)');
{
  // Kevin's hand: Amogh all-in on the turn, hero has 5 chips left. River was
  // dealt and hero was asked to act with nobody to bet against — hand stuck.
  // _bettingComplete must skip the round when the sole actor has no bet to
  // match (but NOT when they still must call/fold vs a shove).
  const engineSrc = fs.readFileSync('js/engine.js', 'utf8');
  ok(/if \(actors\.length === 1 && actors\[0\]\.bet >= self\.currentBet\) return true;/.test(engineSrc),
    '_bettingComplete skips round for solo actor with no bet to match');
}

console.log('\n13. Range ratio uses pot-before-bet (v1.8.71)');
{
  // t.pot includes the bet just made (engine emits post-action). Amogh's
  // 225-into-135 flop overbet read as 225/360=0.625 → 'wide' → coach said
  // call with ace-high. True ratio is 225/135=1.67 → polarized.
  ok(src.includes('var ratio = size / Math.max(1, pot - size);'),
    'estimateVillainRange divides by pot-before-bet');
}

console.log('\n14. Polarized range from non-bluffer treated as strong (v1.8.71)');
{
  // Amogh (bluff 0.15) shoving polarized = strong, not bluffy. Threshold must
  // go up (+0.12) and equity discounted (×0.75), not the reverse.
  ok(src.includes('polarStrong'), 'polarStrong flag exists');
  ok(/polarStrong = range\.label === 'polarized' && \(tight > 0\.6 \|\| bluffy < 0\.25\)/.test(src),
    'polarized + tight or non-bluffy counts as strong');
  ok(src.includes("if (range.label === 'strong' || polarStrong) eq2 *= 0.75;"),
    'equity discounted for polarized-strong ranges');
}

console.log('\n15. Recap never says "well played" for a losing hand (v1.8.71)');
{
  // Kevin's hand: lost 980 following the flop call, recap still praised it.
  ok(!/else if \(good\) \{/.test(src), 'no unconditional "well played" on good');
  ok(src.includes("} else if (good && won) {"), 'praise gated on winning the hand');
  ok(src.includes("Tough loss \u2014 you stuck to the plan"), 'neutral process note for followed-plan losses');
}

console.log('\n16. Beginner-friendly pot odds and bluff-catching (v1.8.71)');
{
  ok(src.includes("Pot odds: calling <b>' + fmt(toCall) + '</b> to win <b>' + fmt(pot)"),
    'math line explains pot odds as price vs prize');
  ok(src.includes('to break even'), 'math line states the break-even meaning');
  ok(src.includes('bluffCatchNote'), 'bluff-catching concept note exists');
  ok(src.includes("Bluff-catching = calling hoping they're bluffing"), 'bluff-catching explained in plain English');
}

console.log('\n17. Hand log records ALL hole cards incl. folded (v1.8.71)');
{
  // Kevin: hand history shows every player's hand, even folded early.
  // Training app — no hidden info after the hand is over.
  const replaySrc = fs.readFileSync('js/replay.js', 'utf8');
  ok(replaySrc.includes('rec.allHands = '), 'finishHandRecord writes rec.allHands');
  ok(replaySrc.includes('tp.hole.map(rpCard)'), 'opponent cards read from table (incl. folded)');
  ok(/hole: hole, isHero/.test(replaySrc), 'allHands entries carry name/emoji/hole/isHero');
}

console.log('\n18. Opponent reads shown once per hand (v1.8.71)');
{
  // The static reads block repeated on every decision → 600+ char messages.
  // Now gated on first verdict of the hand (coachDecisions empty).
  ok(src.includes("var reads = coachDecisions.length === 0 ? opponentReads() : '';"),
    'opponent reads gated on first verdict');
  ok(src.includes("+ tail + posNote + stageNote + multiNote + reads"),
    'reads appended via gated variable');
}

console.log('\n20. Cash/tourney rosters top up to 7 bots (v1.8.71)');
{
  // Kevin's cash game showed 6 bots; default is 7. Stale saves persist.
  ok(src.includes('function topUpRoster()'), 'topUpRoster exists');
  ok(src.includes("if (mode === 'hu') return;"), 'heads-up untouched (stays 1)');
  ok(src.includes('selectedBots.size < 7 && botById(id)'), 'tops up from mode defaults');
}

console.log('\n21. Hand-end pause button + 13s auto-deal (v1.8.71)');
{
  const uiSrc = fs.readFileSync('js/ui.js', 'utf8');
  ok(uiSrc.includes("id = 'btn-pause-auto'"), 'pause button rendered');
  ok(/paused = !paused/.test(uiSrc), 'pause toggles countdown');
  ok(src.includes('autoMs: 13000'), 'auto-deal is 13s (was 10s)');
}

console.log('\n22. Adjusted threshold shown vs strong ranges (v1.8.71)');
{
  // Kevin's J4 vs Amogh: raw 41% needed but real bar 53% — message showed
  // 41% then said "fold" vs 52% equity (contradictory). Now shows adjusted bar.
  ok(src.includes("s strong range'"), 'adjusted threshold displayed vs strong range');
  ok(src.includes('(the call pays for itself)'), 'break-even explained');
}

console.log('\n23. Win-% estimation explained (v1.8.71)');
{
  // Kevin: explain how the "you win X%" is calculated, beginner-friendly.
  ok(src.includes('played out vs random hands 150 times'), 'Monte Carlo explained');
  ok(src.includes('lowered for their strength'), 'adjustment direction stated');
}

console.log('\n=== Results: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
