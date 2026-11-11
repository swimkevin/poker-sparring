// Seat-ring geometry: the phone table ring must not overlap itself or the board.
// Regression for Kevin's iPhone report 2026-11-12 (v1.8.215): Donald's seat
// overlapped Alice's, Nathan's cards overlapped Shark's seat, the hero seat
// was half-cut by the action panel, spacing uneven top-to-bottom.
// Run: node tests/seat-ring-geometry-test.js (also wired into `npm test`).
// Geometry model calibrated from Kevin's 440x956 iPhone screenshots
// (2026-11-12, files in ~/workspace/user/files/): the felt spans the
// viewport minus 29px wide and vh-211 tall (the 200px bottom reserve is dead:
// a later `#screen-table { padding: 0.5rem; }` shorthand resets it to 8px,
// so the felt runs near-full-height and percentage seats sit low). The seat
// box is 74x96: max-width 72px (border-box, final 900px block) plus a 2px
// margin, and 96 tall with hole cards shown (showdown, the binding state;
// during play bot seats are ~50 tall with cards hidden, so this is the
// conservative case). The board is centred at (50%, 32%) with a 78x22 pot
// pill and a 210x54 community row (38x54 cards, 5px gap, final cascade).
// The action panel top (preflop, controls visible) sits at vh-316 absolute,
// i.e. vh-502 felt-relative (measured: panel top ~640 abs at 956h). Under
// 900px height the hero bar compacts (one-row controls, 32x44 hero cards,
// hero-meta on one line, 32x46 community cards) and the panel top moves to
// vh-257 absolute, i.e. vh-443 felt-relative; the test reads css/style.css
// for the compaction block and only models the compact panel when the block
// is present, so this suite FAILS on the pre-fix tree. The community row's
// top edge is fixed by the pot plus the pot-community gap (boardTop+39);
// shrinking the cards eats from the row's bottom edge only.
// 375x667 (iPhone SE) is out of scope: the visible felt is only ~165px tall
// and no 8-seat ring fits under a 224px action bar; the hero bar still
// carries the hero's cards/name/stack, so the game stays playable.
'use strict';
var fs = require('fs');
var path = require('path');
var UI = require(path.join(__dirname, '..', 'js', 'ui.js'));

var CSS = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
var SHORT_BAR = CSS.indexOf('@media (max-width: 900px) and (max-height: 899px)') !== -1
  && CSS.indexOf('#screen-table .hero-bar .ctl { flex: 1 1 22%; }') !== -1;
var SHORT_COMMUNITY = CSS.indexOf('#screen-table .community .card { width: 32px; height: 46px; }') !== -1;

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); }
}

if (typeof window === 'undefined') global.window = { innerWidth: 1280, innerHeight: 800, scrollTo: function () {} };
if (typeof document === 'undefined') {
  global.document = {
    getElementById: function () { return null; },
    querySelectorAll: function () { return []; },
    createElement: function () { return { style: {}, dataset: {}, classList: { add: function () {}, toggle: function () {} } }; }
  };
}

var NAMES = ['hero', 'Alice', 'Donald', 'swimkev', 'Rohan', 'Amogh', 'Nathan', 'Shark'];
var SEAT_W = 74, SEAT_H = 96;
var RING = [0, 1, 2, 3, 4, 5, 6, 7];

function model(vw, vh) {
  var feltW = vw - 29, feltH = vh - 211;
  var boardTop = 0.32 * feltH - 54.5;
  var compact = vh < 900 && SHORT_BAR;
  var commW = (vh < 900 && SHORT_COMMUNITY) ? 180 : 210;
  var commH = (vh < 900 && SHORT_COMMUNITY) ? 46 : 54;
  return {
    feltW: feltW, feltH: feltH,
    pot: { cx: feltW / 2, cy: boardTop + 11, w: 78, h: 22 },
    community: { cx: feltW / 2, cy: boardTop + 39 + commH / 2, w: commW, h: commH },
    panelTop: compact ? vh - 443 : vh - 502
  };
}

function boxes(vw, vh) {
  global.window.innerWidth = vw;
  global.window.innerHeight = vh;
  var m = model(vw, vh);
  var b = [];
  for (var i = 0; i < 8; i++) {
    var p = UI.seatPos(i, 8);
    var cx = p.x / 100 * m.feltW, cy = p.y / 100 * m.feltH;
    b.push({ x0: cx - SEAT_W / 2, x1: cx + SEAT_W / 2, y0: cy - SEAT_H / 2, y1: cy + SEAT_H / 2 });
  }
  return { boxes: b, m: m };
}

function rectGap(a, b) {
  var dx = Math.max(b.x0 - a.x1, a.x0 - b.x1);
  var dy = Math.max(b.y0 - a.y1, a.y0 - b.y1);
  return Math.max(dx, dy);
}

function rectOf(cx, cy, w, h) {
  return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
}

function checkViewport(vw, vh, mode) {
  var r = boxes(vw, vh), b = r.boxes, m = r.m;
  var tag = vw + 'x' + vh;
  var worstPair = { pair: '', gap: 999 };
  var adj = [];
  for (var i = 0; i < 8; i++) {
    for (var j = i + 1; j < 8; j++) {
      var g = rectGap(b[i], b[j]);
      if (g < worstPair.gap) worstPair = { pair: NAMES[i] + '-' + NAMES[j], gap: g };
    }
  }
  for (var k = 0; k < 8; k++) {
    adj.push(rectGap(b[RING[k]], b[RING[(k + 1) % 8]]));
  }
  var adjMin = Math.min.apply(null, adj), adjMax = Math.max.apply(null, adj);
  var boardWorst = { what: '', gap: 999 };
  for (var s = 0; s < 8; s++) {
    var gp = rectGap(b[s], rectOf(m.pot.cx, m.pot.cy, m.pot.w, m.pot.h));
    var gc = rectGap(b[s], rectOf(m.community.cx, m.community.cy, m.community.w, m.community.h));
    if (gp < boardWorst.gap) boardWorst = { what: 'pot-' + NAMES[s], gap: gp };
    if (gc < boardWorst.gap) boardWorst = { what: 'community-' + NAMES[s], gap: gc };
  }
  var edgeMin = 999;
  b.forEach(function (x) {
    edgeMin = Math.min(edgeMin, x.x0, m.feltW - x.x1, x.y0, m.feltH - x.y1);
  });
  var heroPanel = m.panelTop - b[0].y1;
  console.log(tag + ' felt ' + m.feltW + 'x' + m.feltH +
    ' | worst pair ' + worstPair.pair + ' ' + worstPair.gap.toFixed(1) +
    ' | adj ' + adjMin.toFixed(1) + '..' + adjMax.toFixed(1) +
    ' | board ' + boardWorst.what + ' ' + boardWorst.gap.toFixed(1) +
    ' | edge ' + edgeMin.toFixed(1) + ' | heroPanel ' + heroPanel.toFixed(1));
  if (mode === 'strict') {
    ok(worstPair.gap >= 4, tag + ': every seat pair separated by >=4px (worst ' + worstPair.pair + ' ' + worstPair.gap.toFixed(1) + ')');
    ok(adjMax - adjMin <= 16, tag + ': adjacent gaps even within 16px (spread ' + (adjMax - adjMin).toFixed(1) + ')');
    ok(boardWorst.gap >= 2, tag + ': every seat clears the board by >=2px (worst ' + boardWorst.what + ' ' + boardWorst.gap.toFixed(1) + ')');
    ok(edgeMin >= 0, tag + ': every seat inside the felt (edge ' + edgeMin.toFixed(1) + ')');
    ok(heroPanel >= 4, tag + ': hero seat clears the action panel by >=4px (' + heroPanel.toFixed(1) + ')');
  } else if (mode === 'short') {
    ok(worstPair.gap >= -4, tag + ': no seat pair overlaps by more than 4px (worst ' + worstPair.pair + ' ' + worstPair.gap.toFixed(1) + ')');
    ok(boardWorst.gap >= -2, tag + ': no seat overlaps the board by more than 2px (worst ' + boardWorst.what + ' ' + boardWorst.gap.toFixed(1) + ')');
    ok(edgeMin >= -4, tag + ': no seat clipped by the felt by more than 4px (edge ' + edgeMin.toFixed(1) + ')');
    ok(heroPanel >= 4, tag + ': hero seat clears the compacted action panel by >=4px (' + heroPanel.toFixed(1) + ')');
  } else {
    ok(worstPair.gap >= -4, tag + ': no seat pair overlaps by more than 4px (worst ' + worstPair.pair + ' ' + worstPair.gap.toFixed(1) + ')');
    ok(boardWorst.gap >= -20, tag + ': no seat overlaps the board by more than 20px (worst ' + boardWorst.what + ' ' + boardWorst.gap.toFixed(1) + ')');
    ok(edgeMin >= -4, tag + ': no seat clipped by the felt by more than 4px (edge ' + edgeMin.toFixed(1) + ')');
    ok(heroPanel >= -55, tag + ': hero seat under the panel by at most 55px (' + heroPanel.toFixed(1) + ')');
  }
}

checkViewport(440, 956, 'strict');
checkViewport(430, 932, 'strict');
checkViewport(390, 844, 'short');
checkViewport(375, 812, 'short');

console.log('\n' + pass + ' passed, ' + fail + ' failed (seat-ring-geometry)');
process.exit(fail ? 1 : 0);
