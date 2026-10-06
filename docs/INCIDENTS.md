# Incident log

Two real production bugs, written up the way they'd be written on the job.
Both were found by verification *around* the test suite, then pinned with
regression tests so they can never silently return.

## v1.4.1 — Engine crash on broke players ("zombie" bug)

- **Detected:** During pre-release verification of v1.4.0, repeated
  soak runs surfaced an intermittent crash:
  `TypeError: Reduce of empty array with no initial value` in `_showdown()`.
- **Root cause:** A busted player left seated with 0 chips (cash games never
  marked them `sittingOut`) held no cards but still counted as a "live"
  player. A hand could then run to a showdown with no eligible winner, and
  the side-pot reduction ran on an empty array. The same misclassification
  could also award a pot to a cardless player by fold.
- **Fix:** `livePlayers()` now only counts players who can still contest
  chips — not folded/out and `stack > 0 || totalBet > 0` (legitimate all-in
  players stay live through `totalBet > 0`). `_showdown()` hardens the
  degenerate case: contributors are refunded their slice at that level
  (chip-conserving) instead of throwing, flagged on the `handEnd` event.
  Cash-game bots now top back up from 0 chips instead of sitting out as
  cardless zombies.
- **Verification:** 5 consecutive clean full-suite runs; a 12,000-hand soak
  diagnostic with zero crashes.
- **Regression guard:** New tests replicate the exact crash scenario (broke
  players seated, hero SB folds to a short-stack BB — asserts no throw,
  fold-win to the shorty, chip conservation), an all-in showdown with broke
  players seated, and a direct degenerate `_showdown` call (asserts no throw,
  contributor refund, conservation, `refunded` flag). Verified to fail 10
  times against the unfixed engine.

## v1.4.2 — Hand replayer street-jump buttons dead

- **Detected:** Live-browser playtest of v1.4.1 (human QA on the deployed
  site): the Pre-flop/Flop/Turn/River buttons in the replay viewer rendered
  but never responded to clicks.
- **Root cause:** `js/ui.js` tags the buttons with `data-street`, but
  `js/app.js` attached click handlers via a `[data-rp-street]` selector
  that matched nothing. The buttons were wired to a ghost attribute. Unit
  and component tests never caught it because they asserted the buttons
  *rendered*, not that the app's wiring *found* them — the gap was between
  the two layers.
- **Fix:** The wiring now uses the same attribute the buttons carry, scoped
  to the replay view (`#replay-view [data-street]`).
- **Verification:** Live-browser re-test confirmed all four buttons move the
  replay correctly on the deployed site.
- **Regression guard:** The smoke test now clicks a street-jump button in a
  real replay and asserts the frame actually moves (and the flop renders, or
  the jump lands at the end for preflop-ending hands). The new assertion was
  verified to fail against the unfixed wiring and pass with the fix —
  closing the exact layer gap that let the bug through.
