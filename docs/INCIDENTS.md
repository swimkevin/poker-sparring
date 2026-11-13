# Incident log

Four real production bugs, written up the way they'd be written on the job.
Each was found by verification *around* the test suite, then pinned with
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

## v1.6 — Online tab dead in browsers: `var`/`class` global-scope collision

- **Detected:** Pre-push verification of the Online multiplayer prototype.
  The Node suite was fully green (46/46 netplay tests), but a script-tag-
  faithful browser harness showed the Online tab rendering an empty lobby and
  throwing on host: the prototype's two new scripts never parsed in the
  browser at all.
- **Root cause:** `js/room-server.js` declared `var PokerTable` inside its
  Node `require` guard while `js/engine.js` declares `class PokerTable`;
  `js/netplay.js` declared `var Room` while `js/room-server.js` declares
  `class Room`. A hoisted `var` and a `class` of the same name in the shared
  global lexical scope is a `SyntaxError` — but only when files load as
  classic browser scripts. Node's per-file module scopes hid it completely,
  so every test passed while the production tab was dead on arrival.
- **Fix:** Aliased constructors (`PokerTableCtor`, `RoomCtor`) so no `var`
  shadows a `class` binding; the `var` + `function` pattern (used elsewhere,
  e.g. bots/equity) is harmless and unchanged. Also fixed in the same pass:
  the mock server broadcast the lobby synchronously on attach, before the
  UI's `onmessage` was set — the host view silently fell back to home.
  `attachClient` now replays the pending snapshot.
- **Verification:** Full host → lobby → demo bots → start → table → hero
  action flow re-verified in the script-tag harness with zero page errors,
  then confirmed on the deployed site.
- **Regression guard:** `tests/test.js` now concatenates `index.html`'s
  scripts in page order and parses them as a single classic script via
  `vm.Script` — any future `var`/`class` collision fails the parse. Verified
  the guard throws `SyntaxError: Identifier 'PokerTable' has already been
  declared` against the pre-fix tree and passes on the fixed tree. This
  closes the exact layer gap (Node module scope vs browser global scope)
  that let the bug through.

## v1.8.211–214 — Stale cached assets left the app stuck on dark mode after a revert

- **Detected:** Kevin, on his iPhone in Hong Kong, after the v1.8.212–213 revert: the app was stuck on dark mode and would not deal in — the topbar (which holds the theme toggle) was gone.
- **Root cause:** v1.8.211 hid the topbar on the table screen. The 212/213 revert restored the old layout in the repo, but Kevin's phone was still rendering the stale v1.8.211 assets: the service worker plus the `?v=` cache-buster only update on a fresh fetch, and the phone had not fetched one. No code was broken in 212/213 — the phone was running 211 while the repo was on 213.
- **Fix:** Rolled back to v1.8.208 — the last version Kevin had verified working on his iPhone — as v1.8.214, then re-applied the minimal card fix as v1.8.215. Phone-side remedy for Kevin: close the Safari tab completely and reopen; if still stale, delete the swimkevin.github.io entry under Settings → Safari → Advanced → Website Data (not all Safari data).
- **Verification:** Live version.txt confirmed 1.8.215 after the push; Kevin confirmed v1.8.217 "looks better now" on his iPhone.
- **Regression guard:** The release flow verifies the live version.txt after every push, and the rollback procedure (last iPhone-verified version, new version number, CI green) is documented in AGENTS.md — so a stale phone is caught by asking for the live version, not by re-reading the repo.
