var fs = require('fs');
var path = require('path');

var dir = path.join(__dirname, '..');
var failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.log('FAIL: ' + msg); }
  else { console.log('ok: ' + msg); }
}

function stripStrings(s) {
  return s
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

var jsFiles = fs.readdirSync(path.join(dir, 'js')).filter(function (f) { return f.slice(-3) === '.js'; });
jsFiles.forEach(function (f) {
  var code = stripStrings(fs.readFileSync(path.join(dir, 'js', f), 'utf8'));
  check(!/\/\/|\/\*/.test(code), 'js/' + f + ' ships with zero code comments');
});

var cssFiles = fs.readdirSync(path.join(dir, 'css')).filter(function (f) { return f.slice(-4) === '.css'; });
cssFiles.forEach(function (f) {
  var css = stripStrings(fs.readFileSync(path.join(dir, 'css', f), 'utf8'));
  check(!/\/\*/.test(css), 'css/' + f + ' ships with zero CSS comments');
});

var html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
check(!/<!--/.test(html), 'index.html ships with zero HTML comments');

if (failures) { console.log(failures + ' comment violations'); process.exit(1); }
console.log('NO COMMENTS TEST PASSED');
