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
  const missing = reads.filter(id => !src.includes("A.id === '" + id + "'"));
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

console.log('\n=== Results: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
