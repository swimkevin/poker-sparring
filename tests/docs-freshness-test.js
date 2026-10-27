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

var roadmap = fs.readFileSync(path.join(dir, 'docs', 'ROADMAP.md'), 'utf8');
ok(roadmap.indexOf('(' + suites + ' suites)') !== -1,
  'ROADMAP suite count matches the npm test chain (' + suites + ')');

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

ok(roadmap.indexOf("we're at v") === -1, 'ROADMAP carries no version-dated standfirst that rots every release');

var testing = fs.readFileSync(path.join(dir, 'docs', 'TESTING.md'), 'utf8');
ok(testing.indexOf(suites + ' suites') !== -1,
  'TESTING suite count matches the npm test chain (' + suites + ')');
ok(testing.indexOf('300-hand') === -1,
  'TESTING does not repeat the old 300-hand soak wording (CI default is 100, SOAK_HANDS=300 is the deep check)');

var aiwf = fs.readFileSync(path.join(dir, 'docs', 'AI-WORKFLOW.md'), 'utf8');
ok(aiwf.indexOf('1,058') === -1,
  'AI-WORKFLOW carries no stale exact test count (v1.8.125: 1,058 rotted)');

var claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
ok(claude.indexOf('300-hand soak') === -1,
  'CLAUDE does not repeat the old 300-hand soak wording (default is 100, SOAK_HANDS=300 is the deep check)');
ok(claude.indexOf('commented at the decision points') === -1,
  'CLAUDE does not tell agents to comment code (zero-comment rule, v1.8.126)');
ok(claude.indexOf('online.js') !== -1 && claude.indexOf('room-server.js') !== -1,
  'CLAUDE architecture list includes the online layer, not just the offline core');
ok(claude.indexOf('Online multiplayer (would need a server') === -1,
  'CLAUDE roadmap does not list shipped online multiplayer as future work');

var incidents = fs.readFileSync(path.join(dir, 'docs', 'INCIDENTS.md'), 'utf8');
ok(incidents.indexOf('Two real production bugs') === -1,
  'INCIDENTS header count matches its three entries (was "Two", v1.8.126)');

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

var mobile = fs.readFileSync(path.join(dir, 'docs', 'MOBILE.md'), 'utf8');
var styleCss = fs.readFileSync(path.join(dir, 'css', 'style.css'), 'utf8');
var indexHtml = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
ok(mobile.indexOf('900px') !== -1 && styleCss.indexOf('@media (max-width: 900px)') !== -1,
  'MOBILE 900px breakpoint claim matches a real breakpoint in css/style.css');
ok(indexHtml.indexOf('manifest.json') !== -1 && appJs.indexOf("register('sw.js')") !== -1,
  'MOBILE PWA-shipped claim matches the index.html manifest link and app.js service-worker registration');

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
