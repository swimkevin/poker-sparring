var cp = require('child_process');
var path = require('path');
var suites = [
  'test.js', 'component.test.js', 'smoke.js', 'texture-sizing-test.js',
  'board-play-test.js', 'online-winners-test.js', 'online-winner-dom-test.js',
  'netplay.test.js', 'worker.test.js', 'update-flow.test.js',
  'coach-advice.test.js', 'coach-scenarios.js', 'session.test.js',
  'sidepot-stress.js', 'sidepot-reconcile.js', 'allin-stress.js',
  'hero-desc-test.js', 'away-freeze-test.js', 'alice-defense-test.js',
  'swimkev-iso-test.js', 'pot-merge-test.js', 'shark-discipline-test.js',
  'fold-realism-test.js', 'feature-sweep-test.js', 'winner-highlight-test.js',
  'no-comments-test.js', 'coach-intro-test.js'
];
var repo = path.join(__dirname, '..');
for (var i = 0; i < suites.length; i++) {
  var s = suites[i];
  console.log('::group::suite ' + s);
  var t0 = Date.now();
  try {
    cp.execFileSync(process.execPath, [path.join(repo, 'tests', s)], { stdio: 'inherit', cwd: repo });
  } catch (e) {
    console.log('::error::SUITE_FAILED::' + s);
    console.log('::endgroup::');
    process.exit(1);
  }
  console.log('::endgroup::');
  console.log('::notice::SUITE_OK::' + s + '::' + Math.round((Date.now() - t0) / 1000) + 's');
}
console.log('ALL SUITES PASSED');
