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

console.log(fails === 0 ? 'DOCS FRESHNESS TEST PASSED' : 'DOCS FRESHNESS TEST FAILED (' + fails + ')');
process.exit(fails ? 1 : 0);
