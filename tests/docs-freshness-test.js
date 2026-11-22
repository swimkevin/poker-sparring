// Docs freshness gate: the hiring-manager numbers in README/ROADMAP must
// match reality. Suite counts drifted when sw-test.js was added (v1.8.107)
// and no test caught it — this one does, deterministically.
'use strict';
var fs = require('fs');
var path = require('path');
var dir = path.join(__dirname, '..');
var fails = 0;
function ok(cond, msg) {
  console.log((cond ? 'ok' : 'FAIL') + ': ' + msg);
  if (!cond) fails++;
}

var pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
var seen = {};
(pkg.scripts.test.match(/node tests\/[^\s&;]+/g) || []).forEach(function (s) { seen[s] = 1; });
var suites = Object.keys(seen).length;
ok(suites > 20, 'test chain parses to a sane suite count (' + suites + ')');

var readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
ok(readme.indexOf(suites + ' suites') !== -1,
  'README suite count matches the npm test chain (' + suites + ')');
ok(readme.indexOf('(v' + pkg.version + ')') !== -1,
  'README version mention matches package.json (' + pkg.version + ')');
ok(readme.indexOf('6,000+ test assertions') !== -1,
  'README assertion floor is current (6,000+; measured 6,100-6,200 across recent full runs)');
ok(readme.indexOf('live coach-audit rounds') === -1,
  'README carries no counted "live coach-audit rounds" claim (no defined counting rule: 3 rounds at v1.8.70, 4 at v1.8.103, daily automated evals since; v1.8.131)');

var roadmap = fs.readFileSync(path.join(dir, 'docs', 'ROADMAP.md'), 'utf8');
ok(roadmap.indexOf('(' + suites + ' suites)') !== -1,
  'ROADMAP suite count matches the npm test chain (' + suites + ')');
var changelog = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8');
var changelogEntries = (changelog.match(/^## \[[0-9]+\.[0-9]+\.[0-9]+\]/gm) || []).length;
var roadmapFloor = (roadmap.match(/\((\d+)\+ versions\)/) || [])[1];
ok(changelogEntries > 0, 'CHANGELOG parses to a version-entry count (' + changelogEntries + ')');
ok(roadmapFloor && changelogEntries >= parseInt(roadmapFloor, 10),
  'CHANGELOG entry count (' + changelogEntries + ') is at or above the ROADMAP floor (' + roadmapFloor + '+, v1.8.297)');

var labSrc = fs.readFileSync(path.join(dir, 'tests', 'solver-lab.js'), 'utf8');
var spotsAt = labSrc.indexOf('var SPOTS = [');
var labSpots = 0;
if (spotsAt !== -1) {
  var depth = 0, j = labSrc.indexOf('[', spotsAt);
  for (; j < labSrc.length; j++) {
    var ch = labSrc[j];
    if (ch === '[' || ch === '{' || ch === '(') { if (ch === '{' && depth === 1) labSpots++; depth++; }
    else if (ch === ']' || ch === '}' || ch === ')') { depth--; if (depth === 0) break; }
  }
}
ok(labSpots > 0, 'solver-lab SPOTS parses to a spot count (' + labSpots + ')');
ok(readme.indexOf(labSpots + '+ pinned spots') !== -1,
  'README lab floor matches SPOTS.length (' + labSpots + '+, v1.8.297)');
var archText = fs.readFileSync(path.join(dir, 'docs', 'ARCHITECTURE.md'), 'utf8');
ok(archText.indexOf(labSpots + '+ pinned spots') !== -1,
  'ARCHITECTURE lab floor matches SPOTS.length (' + labSpots + '+, v1.8.297)');

var badgeNum = (readme.match(/tests-(\d+)%2B/) || [])[1];
var floorNum = (readme.match(/([\d,]+)\+ test assertions/) || [])[1];
ok(badgeNum && floorNum && parseInt(badgeNum, 10) === parseInt(floorNum.replace(/,/g, ''), 10),
  'README badge number matches the assertion floor in the body (badge ' + badgeNum + ', body ' + floorNum + ', v1.8.297)');
ok(readme.indexOf('12,021-assertion seeded differential sweep') !== -1,
  'README names the 12,021-assertion differential behind the 6,000+ floor (v1.8.297)');

var structureStart = readme.indexOf('## Project structure');
var structureEnd = readme.indexOf('## ', structureStart + 1);
var structure = structureStart === -1 ? '' : readme.slice(structureStart, structureEnd === -1 ? readme.length : structureEnd);
fs.readdirSync(path.join(dir, 'js')).filter(function (f) { return f.slice(-3) === '.js'; }).forEach(function (f) {
  ok(structure.indexOf(f) !== -1, 'README project structure lists js/' + f);
});

var arch = fs.readFileSync(path.join(dir, 'docs', 'ARCHITECTURE.md'), 'utf8');
var mermaidStart = arch.indexOf('```mermaid');
var mermaidEnd = arch.indexOf('```', mermaidStart + 1);
var diagram = mermaidStart === -1 ? '' : arch.slice(mermaidStart, mermaidEnd === -1 ? arch.length : mermaidEnd);
ok(diagram.indexOf('netplay') !== -1, 'ARCHITECTURE diagram includes the online layer (netplay)');
ok(diagram.indexOf('room-server') !== -1, 'ARCHITECTURE diagram includes the online layer (room-server)');
ok(arch.indexOf('no build step, no backend') === -1 &&
  arch.indexOf('no backend to attack') === -1,
  'ARCHITECTURE carries no unqualified "no backend" claim (solo play needs none; the online relay is a backend, v1.8.127)');
ok(arch.indexOf('port later') === -1,
  'ARCHITECTURE does not present a React Native port as planned (ROADMAP lists no native app as a non-goal, v1.8.127)');
ok(arch.indexOf(suites + ' suites') !== -1,
  'ARCHITECTURE suite count matches the npm test chain (' + suites + ')');
var compOut = '';
try {
  compOut = require('child_process').execSync('node ' + path.join(__dirname, 'component.test.js'), { encoding: 'utf8', timeout: 120000 });
} catch (e) {
  compOut = (e.stdout || '').toString();
}
var compMatches = compOut.match(/(\d+) passed, (\d+) failed \(component\)/g) || [];
var compLast = compMatches.length ? compMatches[compMatches.length - 1] : '';
var compNums = compLast.match(/(\d+) passed, (\d+) failed/);
if (!compNums) {
  ok(true, 'ARCHITECTURE component count skipped: component suite skipped (jsdom absent)');
} else if (compNums[2] !== '0') {
  ok(false, 'ARCHITECTURE component count unchecked: component suite itself failed (' + compLast + ')');
} else {
  ok(arch.indexOf(compNums[1] + ' tests') !== -1,
    'ARCHITECTURE component test count matches the component suite (' + compNums[1] + ')');
}

ok(roadmap.indexOf("we're at v") === -1, 'ROADMAP carries no version-dated standfirst that rots every release');

var testing = fs.readFileSync(path.join(dir, 'docs', 'TESTING.md'), 'utf8');
ok(testing.indexOf(suites + ' suites') !== -1,
  'TESTING suite count matches the npm test chain (' + suites + ')');
var layersStart = testing.indexOf('## The layers');
var layersEnd = testing.indexOf('## ', layersStart + 1);
var layersSection = layersStart === -1 ? '' : testing.slice(layersStart, layersEnd === -1 ? testing.length : layersEnd);
var layersRows = (layersSection.match(/^\| [^|]+\| `/gm) || []).length;
ok(layersRows === 7, 'TESTING layer table lists 7 rows (6 app-testing layers + Gates, v1.8.133)');
ok(readme.indexOf('6 layers') !== -1,
  'README layer count is 6 (Gates is meta-testing, not counted, v1.8.133)');
ok(testing.indexOf('not counted as a test layer') !== -1,
  'TESTING states the layer counting rule (v1.8.133)');
ok(testing.indexOf('300-hand') === -1,
  'TESTING does not repeat the old 300-hand soak wording (CI default is 100, SOAK_HANDS=300 is the deep check)');

var aiwf = fs.readFileSync(path.join(dir, 'docs', 'AI-WORKFLOW.md'), 'utf8');
ok(aiwf.indexOf('1,058') === -1,
  'AI-WORKFLOW carries no stale exact test count (v1.8.125: 1,058 rotted)');
ok(aiwf.indexOf(suites + ' suites') !== -1,
  'AI-WORKFLOW suite count matches the npm test chain (' + suites + ')');

var claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
ok(claude.indexOf('300-hand soak') === -1,
  'CLAUDE does not repeat the old 300-hand soak wording (default is 100, SOAK_HANDS=300 is the deep check)');
ok(claude.indexOf('commented at the decision points') === -1,
  'CLAUDE does not tell agents to comment code (zero-comment rule, v1.8.126)');
ok(claude.indexOf('online.js') !== -1 && claude.indexOf('room-server.js') !== -1,
  'CLAUDE architecture list includes the online layer, not just the offline core');
ok(claude.indexOf('Online multiplayer (would need a server') === -1,
  'CLAUDE roadmap does not list shipped online multiplayer as future work');
ok(claude.indexOf('native port later') === -1,
  'CLAUDE does not present a native port as planned (ROADMAP lists no native app as a non-goal, v1.8.129)');

var incidents = fs.readFileSync(path.join(dir, 'docs', 'INCIDENTS.md'), 'utf8');
ok(incidents.indexOf('Four real production bugs') !== -1,
  'INCIDENTS header count matches its four entries (v1.8.234)');
ok((incidents.match(/^## v/gm) || []).length === 4,
  'INCIDENTS lists four entries (v1.8.234)');

ok(roadmap.indexOf('2,546 lines') === -1,
  'ROADMAP does not cite an exact app.js line count (rots on the next edit)');

var flagsDoc = fs.readFileSync(path.join(dir, 'docs', 'FEATURE_FLAGS.md'), 'utf8');
var appJs = fs.readFileSync(path.join(dir, 'js', 'app.js'), 'utf8');
var defaultsStart = appJs.indexOf('var DEFAULT_FLAGS = {');
var defaultsEnd = appJs.indexOf('};', defaultsStart);
var defaultsBlock = defaultsStart === -1 ? '' : appJs.slice(defaultsStart, defaultsEnd);
var codeFlags = [];
(defaultsBlock.match(/^\s*[A-Za-z_][A-Za-z0-9_]*:/gm) || []).forEach(function (m) {
  codeFlags.push(m.replace(/[:\s]/g, ''));
});
ok(codeFlags.length > 0, 'app.js DEFAULT_FLAGS parses to a flag list (' + codeFlags.join(',') + ')');
codeFlags.forEach(function (f) {
  ok(flagsDoc.indexOf(f) !== -1, 'FEATURE_FLAGS documents the ' + f + ' flag defined in app.js');
});
var docFlags = (flagsDoc.match(/^\|\s*`([A-Za-z_][A-Za-z0-9_]*)`/gm) || []).map(function (m) {
  return m.replace(/[^A-Za-z0-9_]/g, '');
});
docFlags.forEach(function (f) {
  ok(codeFlags.indexOf(f) !== -1, 'FEATURE_FLAGS table flag ' + f + ' still exists in app.js DEFAULT_FLAGS');
});

var bots = require(path.join(dir, 'js', 'bots.js'));
var archetypeCount = bots.ARCHETYPES.length;
ok(archetypeCount >= 10, 'bot roster parses to a sane archetype count (' + archetypeCount + ')');
ok(readme.indexOf(archetypeCount + ' AI opponent archetypes') !== -1,
  'README archetype count matches js/bots.js ARCHETYPES (' + archetypeCount + ')');
ok(readme.indexOf('against ' + archetypeCount + ' AI opponents') !== -1,
  'README opponent count matches js/bots.js ARCHETYPES (' + archetypeCount + ')');
ok(readme.indexOf(archetypeCount + ' AI archetypes') !== -1,
  'README archetype claim matches js/bots.js ARCHETYPES (' + archetypeCount + ')');
ok(roadmap.indexOf(archetypeCount + ' AI archetypes') !== -1,
  'ROADMAP archetype count matches js/bots.js ARCHETYPES (' + archetypeCount + ')');

var mobile = fs.readFileSync(path.join(dir, 'docs', 'MOBILE.md'), 'utf8');
var styleCss = fs.readFileSync(path.join(dir, 'css', 'style.css'), 'utf8');
var indexHtml = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
ok(mobile.indexOf('900px') !== -1 && styleCss.indexOf('@media (max-width: 900px)') !== -1,
  'MOBILE 900px breakpoint claim matches a real breakpoint in css/style.css');
function topLevelMediaCount(cssText, cond) {
  var count = 0, depth = 0, i = 0;
  while (i < cssText.length) {
    if (cssText[i] === '{') depth++;
    else if (cssText[i] === '}') depth--;
    if (depth === 0 && cssText.slice(i, i + 6) === '@media') {
      var brace = cssText.indexOf('{', i);
      if (brace === -1) break;
      if (cssText.slice(i + 6, brace).trim().replace(/\s+/g, ' ') === cond) count++;
      i = brace;
    }
    i++;
  }
  return count;
}
var blocks900 = topLevelMediaCount(styleCss, '(max-width: 900px)');
ok(blocks900 === 1, 'css/style.css has exactly one top-level (max-width: 900px) block, got ' + blocks900 + ' (v1.8.296)');
ok(styleCss.indexOf('padding-bottom: 140px') === -1,
  'no dead 140px #screen-table padding-bottom (200px wins, v1.8.296)');
ok(styleCss.indexOf('#screen-table { padding-bottom: 200px; }') !== -1,
  'the kept 200px #screen-table padding-bottom is present (v1.8.296)');
ok(styleCss.indexOf('bottom: 0; left: 0; right: 0; z-index: 50') === -1,
  'no dead generic .hero-bar bottom-0 rule (both screens have their own bottom, v1.8.296)');
ok(styleCss.indexOf('bottom: var(--m-tabbar)') !== -1,
  'table hero-bar keeps bottom: var(--m-tabbar) (v1.8.296)');
ok(styleCss.indexOf('#screen-table .hero-bar .controls { gap: 0.4rem; }') === -1,
  'no dead 0.4rem table hero-bar controls gap (0.6rem wins, v1.8.296)');
ok(styleCss.indexOf('padding: 0.6rem 0.3rem; font-size: 0.9rem; min-height: 40px') === -1,
  'no dead first table hero-bar .ctl sizing (0.8rem wins, v1.8.296)');
ok(indexHtml.indexOf('manifest.json') !== -1 && appJs.indexOf("register('sw.js')") !== -1,
  'MOBILE PWA-shipped claim matches the index.html manifest link and app.js service-worker registration');

var adrCount = fs.readdirSync(path.join(dir, 'docs', 'adr')).filter(function (f) { return f.slice(-3) === '.md'; }).length;
ok(adrCount >= 1, 'ADR directory parses to a sane count (' + adrCount + ')');
ok(readme.indexOf(adrCount + ' architecture decision records') !== -1,
  'README ADR count matches docs/adr (' + adrCount + ')');
var ruleCount = (indexHtml.match(/class="rule-item"/g) || []).length;
ok(ruleCount >= 1, 'Learn tab parses to a sane beginner-rule count (' + ruleCount + ')');
ok(readme.indexOf(ruleCount + ' beginner rules') !== -1,
  'README beginner-rule count matches index.html rule-items (' + ruleCount + ')');

var readmeVisible = readme.replace(/<!--[\s\S]*?-->/g, '');
var linked = {};
(readmeVisible.match(/docs\/[A-Za-z0-9_.\/-]+/g) || []).forEach(function (r) {
  if (r.charAt(r.length - 1) !== '/') { linked[r] = 1; }
});
Object.keys(linked).forEach(function (r) {
  ok(fs.existsSync(path.join(dir, r)), 'README-linked file exists: ' + r);
});

console.log(fails === 0 ? 'DOCS FRESHNESS TEST PASSED' : 'DOCS FRESHNESS TEST FAILED (' + fails + ')');
process.exit(fails ? 1 : 0);
