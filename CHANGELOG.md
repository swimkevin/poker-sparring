# Changelog

All notable changes to Poker Sparring. Versions are also stamped in the app
footer (`APP_VERSION` in `js/app.js`) and `package.json`.

## [1.4.2] — 2026-10-04

### Fixed
- **Hand replayer street-jump buttons:** the Pre-flop/Flop/Turn/River buttons
  rendered but never responded to clicks — `ui.js` tags them with
  `data-street` while `app.js` wired clicks via a `[data-rp-street]`
  selector that matched nothing (found by live-browser playtest of v1.4.1).
  Wiring now uses the same attribute, scoped to the replay view.

### Tests
- Smoke test now clicks a street-jump button in the replay viewer and asserts
  the frame actually moves (and the flop renders, or the jump lands at the end
  for preflop-ending hands). Verified the new assertion fails against the
  unfixed wiring and passes with the fix.

## [1.4.1] — 2026-10-04

### Fixed
- **Engine crash on broke players ("zombie" bug):** a busted player left seated
  with 0 chips (cash games never marked them `sittingOut`) held no cards but
  counted as a live player. A hand could then run to a showdown with no eligible
  winner and crash in `_showdown` (`TypeError: Reduce of empty array`), or award
  a pot to a cardless player by fold. `livePlayers()` now only counts players
  who can still contest chips (not folded/out and `stack > 0 || totalBet > 0`);
  all-in players are unaffected. `_showdown` also hardens the empty-eligible
  case: contributors are refunded their slice at that level (chip-conserving)
  instead of throwing, and the refund is flagged on the `handEnd` event.
- **Cash-game bot top-up:** felted bots (0 chips) now top back up to the full
  buy-in like the rest of the table, instead of sitting out every future hand as
  cardless zombies and slowly killing the table.

### Tests
- 1,058 headless tests (was 1,041): new regression tests replicate the exact
  crash scenario (broke players seated, hero SB folds to a short-stack BB
  blind — asserts no throw, fold-win to the shorty, chip conservation), an
  all-in showdown with broke players seated, and a direct degenerate
  `_showdown` call (asserts no throw, contributor refund, conservation, and the
  `refunded` flag on `handEnd`). Verified the new tests fail against the
  unfixed engine (10 failures) and pass with the fix; a 60,000-hand
  short-stack/zombie fuzzer reports zero crashes and zero conservation
  violations.

## [1.4.0] — 2026-10-04

### Added
- **Hand replayer** (new "Hands" tab): every finished hand is now captured as a
  per-hand action/event record (hero hole cards, blinds/antes, every action
  with street and running pot, board by street, winners/result) and persisted
  to localStorage (`ps_hands_v1`, last 50 hands, newest first — existing stats
  keys untouched). Open any hand to replay it street by street: ⏮ Start /
  ◀ Prev / Next ▶ / End ⏭ plus Pre-flop/Flop/Turn/River jump buttons, with
  board cards, action list, running pot, and result at the final frame.
- New DOM-free module `js/replay.js`: capture (`startHandRecord`,
  `recordHandAction`, `recordHandStreet`, `finishHandRecord`), storage
  (guarded, capped), and a replay state machine (`replayState`,
  `frameIndexForStreet`).
- Engine: `actionTaken` events now carry `street` (one-line, backward
  compatible) so capture doesn't depend on event-pump timing.

### Tests
- 1,041 headless tests (was 981): +41 unit tests — deterministic capture of a
  rigged preflop shove (action sequence, pot evolution 5/15/110/200, winners,
  hero net), a rigged multi-street hand (street frames in order, exact flop
  cards, non-decreasing pot, step forward/back), synthesized ante/blind
  ordering, and storage cap/ordering/clear. +21 jsdom component tests —
  hand-list rendering (rows, net styling, hole cards, empty state, open-by-id),
  replay viewer frames (start/mid/flop/end, disabled states, progress text,
  result banner, street-jump buttons), and XSS escaping of hostile timeline
  names. Gameplay smoke now also verifies a saved record renders in the Hands
  tab and steps through to the end with zero JS errors.

## [1.3.0] — 2026-10-04

### Fixed
- Hand log now names the acting bot on every action ("🪨 The Rock raises to 250"
  instead of "raises to 250").
- Winner banner labels pots ("Main pot" / "Side pot 1") and separates the hand
  description from the amount; uncalled bets are explained.
- Push/fold trainer: facing-a-shove verdicts are now computed against the
  shover's **range** (new `estimateEquityVsRange()` in `js/equity.js`, driven by
  each archetype's own `pushTier`) instead of comparing a tier chart against
  misleading vs-random equity. The feedback text shows the range equity it used.
- Stats: `bb/100` shows "—" until 20+ hands (it was noise before that).
- "Record vs archetypes" now counts only opponents actually dealt into each hand.
- Custom-bot emoji is HTML-escaped everywhere it renders (stored-XSS guard).

### Added
- 981 headless tests: unit (evaluator, engine, equity, bots, stats, push/fold),
  deterministic side-pot/odd-chip/full-hand scenarios, bot move-legality sweep
  (999 decisions, all archetypes), and jsdom component tests
  (`tests/component.test.js`: escaping, feedback rendering, glossary accordions,
  stats guards, leak tracker states). Run with `npm test`.
- `package.json` with `test` / `test:unit` / `test:component` / `serve` scripts;
  jsdom as the only devDependency (zero runtime dependencies preserved).
- Global error boundary: a UI glitch logs a calm notice instead of killing the table.
- Accessibility: `<details>` accordions for the glossary and leak explanations,
  `prefers-reduced-motion` support, `:focus-visible` styles, `role="dialog"` on modals.
- `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/MOBILE.md`; rewritten README.

## [1.2.0] — 2026-10-04
- Learn screen: 3 essential books, 3 free training sites, 29-term glossary.
- Leak tracker: detects 4 hero mistake types live, explains the math, persists locally.

## [1.1.0] — 2026-10-04
- Setup rework: opponent-count stepper (1–5), 1,000-chip defaults.
- Five literature-grounded archetypes (Rock, Calling Station, Maniac, TAG Shark,
  Tricky LAG), each with a "how to beat" exploit tip.

## [1.0.0] — 2026-10-04
- Initial release: cash / heads-up / tournament / push-fold trainer, Monte Carlo
  equity engine, heuristic bot AI, local stats, GitHub Pages deployment.
