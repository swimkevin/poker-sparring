// Mobile bottom-seats regression test (v1.8.211): on phones the bottom
// seats' hole cards slid under the fixed hero bar, so the hero's own cards
// (seat 0, y=54%) and the ring seats (1/7, y=45%) were hidden behind the
// action panel, and folded/dimmed cards were unreadable (0.45 x 0.35).
// Locks in the fix: the hero bar is in-flow (position:static) so the felt
// ends where the bar begins, the table screen reserves the tab-bar height
// in its own padding, the topbar is hidden on the table screen, the felt
// starts below the floating Hand # pill, and folded/dimmed cards stay
// readable on mobile. Desktop rules are untouched.
var path = require('path');
var fs = require('fs');
var jsdom = require('jsdom');
var JSDOM = jsdom.JSDOM;

var dir = path.join(__dirname, '..');
var css = fs.readFileSync(path.join(dir, 'css', 'style.css'), 'utf8');
var uiSrc = fs.readFileSync(path.join(dir, 'js', 'ui.js'), 'utf8');
var html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
var dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
var d = dom.window.document;

var failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.log('FAIL: ' + msg); }
  else { console.log('ok: ' + msg); }
}

function firstBlock(re) {
  var m = css.match(re);
  return m ? m[0] : '';
}

var heroBar = firstBlock(/#screen-table \.hero-bar\s*\{[^}]*\}/);
check(/position:\s*static/.test(heroBar),
  'mobile hero bar is in-flow (position:static), so the felt ends where the bar begins');
check(!/bottom:\s*var\(--m-tabbar\)/.test(heroBar),
  'mobile hero bar no longer offsets by the tab-bar height');
var heroBarBlocks = css.match(/#screen-table \.hero-bar\s*\{[^}]*\}/g) || [];
check(heroBarBlocks.every(function (b) { return !/position:\s*fixed/.test(b); }),
  'no #screen-table hero-bar rule is position:fixed');
check(/flex:\s*0 0 auto/.test(heroBar),
  'mobile hero bar stays a flex child of the table column');
check(/body:has\(#screen-table:not\(\[hidden\]\)\) \.topbar\s*\{[^}]*display:\s*none/.test(css),
  'topbar is hidden on the table screen (removes the ~48px header offset)');
check(/#screen-table\s*\{[^}]*padding:\s*0\.5rem 0\.5rem var\(--m-tabbar\)/.test(css),
  '#screen-table reserves the tab-bar height in its own padding');
check(/#screen-table\s*\{[^}]*padding-bottom:\s*200px/.test(css) === false,
  'stale 200px padding-bottom reserve on #screen-table is gone');
var tableBlock = firstBlock(/#screen-table\s*\{[^}]*height:\s*100dvh[^}]*\}/);
check(/height:\s*100dvh/.test(tableBlock) && /display:\s*flex/.test(tableBlock) &&
  /flex-direction:\s*column/.test(tableBlock),
  '#screen-table is still a 100dvh flex column on mobile');
var layout = firstBlock(/#screen-table \.table-layout\s*\{[^}]*\}/);
check(/padding:\s*2\.25rem 0\.4rem 0/.test(layout),
  'table-layout top padding clears the floating Hand # pill');
check(/#screen-table \.seat\.folded\s*\{[^}]*opacity:\s*0\.75/.test(css),
  'mobile folded seats stay readable (opacity 0.75)');
check(/#screen-table \.card\.card-dim\s*\{[^}]*opacity:\s*0\.55/.test(css),
  'mobile dimmed cards stay readable (opacity 0.55)');
check(/\.seat\.folded\s*\{\s*opacity:\s*0\.45/.test(css),
  'desktop folded-seat opacity is untouched (0.45)');
check(/\.card\.card-dim\s*\{\s*opacity:\s*0\.35/.test(css),
  'desktop dimmed-card opacity is untouched (0.35)');
check(/--m-tabbar:\s*calc\(58px \+ env\(safe-area-inset-bottom/.test(css),
  'shared --m-tabbar height still defined');
check(/\.mobile-tabs\s*\{[^}]*height:\s*var\(--m-tabbar\)/.test(css),
  'tab bar intact (fixed, shared height)');
var pillBlocks = css.match(/#screen-table \.table-topbar\s*\{[^}]*\}/g) || [];
check(pillBlocks.some(function (b) { return /position:\s*absolute/.test(b); }),
  'floating Hand # pill is still absolutely positioned over the felt');
check(/{ x: 50, y: 54 }/.test(uiSrc) && /{ x: 22, y: 45 }/.test(uiSrc) &&
  /{ x: 78, y: 45 }/.test(uiSrc),
  'narrow-ring seat geometry pinned (hero y=54%, seats 1/7 y=45%)');

var screen = d.getElementById('screen-table');
var heroBarEl = screen ? screen.querySelector('.hero-bar') : null;
var layoutEl = screen ? screen.querySelector('.table-layout') : null;
check(!!screen && !!heroBarEl && !!layoutEl &&
  (screen.compareDocumentPosition(heroBarEl) & 4) !== 0 &&
  (layoutEl.compareDocumentPosition(heroBarEl) & 4) !== 0,
  'hero bar lives inside #screen-table, after the table layout');
check(!!d.querySelector('header.topbar') && !!d.querySelector('.mtab[data-tab="menu"]'),
  'topbar header and Menu tab exist in the DOM (navigation survives hiding the topbar)');

console.log(failures === 0 ? 'MOBILE BOTTOM SEATS TEST PASSED' : 'MOBILE BOTTOM SEATS TEST FAILED (' + failures + ')');
process.exit(failures ? 1 : 0);
