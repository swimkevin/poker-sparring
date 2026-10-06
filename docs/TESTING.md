# Testing strategy

Three layers, all runnable with `npm test`. Current counts: **1,012 unit +
integration, 46 component** (1,058 total), plus a gameplay smoke test.

## The pyramid

| Layer | Where | What it covers |
|---|---|---|
| Unit + integration | `tests/test.js` (plain Node) | Evaluator vectors, engine scenarios (side pots, odd chips, all-ins, split pots), equity sanity ranges, bot behavior, stats recording, push/fold verdict consistency, replay capture + storage (cap 50, newest first) |
| Component | `tests/component.test.js` (jsdom) | Real `ui.js` rendering: XSS escaping of hostile input, replay viewer frames, hand-list rows, glossary accordions, bb/100 guard, leak tracker states |
| Gameplay smoke | `tests/smoke.js` (jsdom) | Boots the real app, auto-plays full hands, exercises the Hands tab and replay viewer, asserts zero JS errors |

## What's actually being proven

- **Invariants, not just examples.** The 300-hand engine soak runs randomized
  policies and asserts per-hand chip conservation (`chips === totalChips`)
  every hand — money can never be created or destroyed, regardless of the
  cards.
- **Statistical separation.** Bot-vs-bot simulations verify archetypes play
  distinct styles (Rock ~7% VPIP → Maniac ~74%); a move-legality sweep
  verifies every archetype only produces legal moves.
- **Honesty about randomness.** The soak and sweep policies use
  `Math.random()` — they are *not* seeded. Determinism comes from per-hand
  invariants (conservation, legality), not fixed seeds, so a green run means
  the properties held across 300 random hands, not one memorized script.
- **External validation beyond the suite.** A 12,000-hand no-crash soak
  diagnostic ran clean; regression tests for the v1.4.1 engine crash were
  verified to fail 10 times against the unfixed engine before passing with
  the fix; every release gets a live-browser playtest (see
  `docs/INCIDENTS.md` for what those caught).

## The rule

Every bug fix ships with a regression test that fails without the fix —
verified by running the new tests against the unfixed code before committing.
`npm test` (all three layers) gates every release; a red suite blocks the
push. See `docs/INCIDENTS.md` for the two production bugs this discipline
has caught and pinned.
