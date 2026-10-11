// Online winners normalization (v1.8.98): the room's handEnd result must
// (1) expand split pots into per-winner entries with per-winner amounts,
// (2) drop uncalled refunds from the winners list, and (3) reveal ONLY the
// winners' cards — losing showdown hands stay mucked server-side too.
'use strict';
var path = require('path');
var RS = require(path.join(__dirname, '..', 'js', 'room-server.js'));
var fails = 0;
function ok(c, m) { console.log((c ? 'ok' : 'FAIL') + ': ' + m); if (!c) fails++; }
function C(r, s) { return { r: r, s: s }; }

var room = new RS.Room({ code: 'TEST98', config: {} });
room.addPlayer('c1', 'Ann', {});
room.addPlayer('c2', 'Bob', {});
room.addPlayer('c3', 'Cat', {});
room.state = 'playing';
room.table = {
  handNo: 7, street: 'river', community: [C(2, 0), C(7, 1), C(9, 3), C(11, 2), C(4, 0)],
  potTotal: function () { return 0; }, handOver: true, acting: -1, button: 0, sbIdx: 1, bbIdx: 2,
  players: [0, 1, 2].map(function (i) {
    return { idx: i, hole: [C(14, i), C(13, i)], stack: 1000, bet: 0, folded: false, allIn: false, acted: true, sittingOut: false };
  })
};
// Fabricated engine handEnd: main pot 500 split Ann/Bob (250 each), side
// pot 300 to Bob, hero... seat 2 (Cat) lost at showdown; seat 0 also got a
// 900 uncalled refund in a separate entry (not a win).
room._onEngineEvent({
  t: 'handEnd',
  winners: [
    { potIndex: 0, amount: 500, each: 250, winners: [0, 1], hand: 'Two Pair', uncalled: false },
    { potIndex: 1, amount: 300, each: 300, winners: [1], hand: 'Two Pair', uncalled: false },
    { potIndex: 2, amount: 900, winners: [2], uncalled: true, hand: null }
  ],
  revealed: [
    { idx: 0, hole: [C(14, 0), C(13, 0)] },
    { idx: 1, hole: [C(12, 1), C(12, 2)] },
    { idx: 2, hole: [C(9, 3), C(8, 3)] }
  ]
});
var lr = room.lastResult;
ok(!!lr, 'lastResult recorded');
ok(lr.winners.length === 3, 'split pot expanded to per-winner entries (' + lr.winners.length + ')');
ok(lr.winners[0].idx === 0 && lr.winners[0].amount === 250, 'co-winner Ann gets her 250 share, not the 500 pot');
ok(lr.winners[1].idx === 1 && lr.winners[1].amount === 250, 'co-winner Bob gets his 250 share');
ok(lr.winners[2].idx === 1 && lr.winners[2].amount === 300, 'side pot adds Bob +300');
ok(!lr.winners.some(function (w) { return w.idx === 2; }), 'uncalled refund is not listed as a win');
var revSeats = lr.revealed.map(function (r) { return r.idx; }).sort();
ok(revSeats.join(',') === '0,1', 'only winners cards revealed; loser (seat 2) mucked (got ' + revSeats.join(',') + ')');
// Snapshot carries the same filtered view to clients.
var snap = room.getSnapshot(2);
ok(snap.showdown && snap.showdown.length === 2, 'snapshot showdown has winners only');
console.log(fails === 0 ? 'ONLINE WINNERS TEST PASSED' : 'ONLINE WINNERS TEST FAILED (' + fails + ')');
process.exit(fails ? 1 : 0);
