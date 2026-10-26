# Testing strategy

`npm test` runs 36 suites, 2,000+ assertions per run: unit, component,
smoke, netplay, worker, service worker, coach scenarios and audits, and
docs-freshness gates. Exact per-file counts vary run to run (randomized
sweeps, varying hand counts), so this doc cites order-of-magnitude figures
only — exact numbers rot, as the old "144 cases / 1,133 assertions" header
did. The suite-count figure is enforced: `tests/docs-freshness-test.js`
fails if this doc ever stops naming the chain's suite count.

Deliberately no coverage-percentage target: 100% coverage is a
[vanity metric](https://hackernoon.com/why-100percent-test-coverage-is-a-vanity-metric) —
it measures lines executed, not bugs caught. This suite optimizes for
*invariant coverage* of load-bearing code instead: every path where money moves
or an action is validated is exercised across thousands of randomized hands.
[What isn't covered — and why](#what-we-dont-test-and-why) is listed below.

## The layers

| Layer | Where | What it covers |
|---|---|---|
| Unit + integration | `tests/test.js` (plain Node) | Evaluator vectors, engine scenarios (side pots, odd chips, all-ins, split pots), equity sanity ranges, bot behavior (incl. Rohan/Amogh/Nathan), stats recording, push/fold verdict consistency, replay capture + storage (cap 50, newest first), username/bot-rename prefs |
| Component | `tests/component.test.js` (jsdom) | Real `ui.js` rendering: XSS escaping of hostile input, replay viewer frames, hand-list rows, glossary accordions, bb/100 guard, leak tracker states |
| Netplay | `tests/netplay.test.js` (plain Node) | Room protocol over `MockRoomServer`: room codes, seating limits, start gating, 3-client hand convergence, chip conservation, turn-timer auto-fold, host pause, hole-card privacy per seat |
| Gameplay smoke | `tests/smoke.js` (jsdom) | Boots the real app, auto-plays full hands, exercises the Hands tab and replay viewer, asserts zero JS errors |
| Worker | `tests/worker.test.js` (plain Node) | Boots the real `worker/room-do.js` Durable Object with stubbed Cloudflare globals and replays the browser's exact create/join flow |
| Coach + live audits | `tests/coach-scenarios.js`, `tests/coach-advice.test.js`, `tests/coach-eval.js`, `tests/live-loop-test.js` | Deterministic coach-branch scenarios, advice legality and math, and live 10-hand loops with contradiction and over-long-message flags |
| Gates | `tests/docs-freshness-test.js`, `tests/no-comments-test.js`, `tests/sw-test.js` | README/roadmap numbers match the suite chain, no comments in shipped source, service-worker versioning and offline behavior |

## What's actually being proven

- **Invariants, not just examples.** The engine soak runs randomized
  policies and asserts per-hand chip conservation (`chips === totalChips`)
  every hand — money can never be created or destroyed, regardless of the
  cards. CI runs 100 soak hands by default (`SOAK_HANDS=300` for deeper
  checks); the old wording described the deep-check setting, not the
  default run.
- **Statistical separation.** Bot-vs-bot simulations verify archetypes play
  distinct styles, and a move-legality sweep verifies every archetype only
  produces legal moves.
- **Honesty about randomness.** The soak and sweep policies use
  `Math.random()` — they are *not* seeded. Determinism comes from per-hand
  invariants (conservation, legality), not fixed seeds, so a green run means
  the properties held across randomized hands, not one memorized script.
- **External validation beyond the suite.** A 12,000-hand no-crash soak
  diagnostic ran clean; regression tests for the v1.4.1 engine crash were
  verified to fail 10 times against the unfixed engine before passing with
  the fix; every release gets a live-browser playtest (see
  `docs/INCIDENTS.md` for what those caught).

## What we don't test (and why)

- **Visual layout.** No screenshot/pixel tests — the felt, cards, and themes
  are verified by a live-browser playtest each release (see
  `docs/INCIDENTS.md`). Pixel tests on a hand-styled UI would be brittle for
  near-zero signal.
- **A live Cloudflare deployment.** `worker/` is the documented production
  route for real cross-device multiplayer; the deployed worker itself is not
  exercised by `npm test` (it needs `wrangler` + a Cloudflare account). What
  *is* tested in the chain is the `Room` state machine it hosts — via both
  `MockRoomServer` and the real `room-do.js` under stubbed globals
  (`tests/worker.test.js`).
- **True cross-browser WebSocket play.** The mock transport is in-page; a real
  two-browser session requires the deployed worker (above). The protocol the
  worker speaks is what's tested.
- **Line/branch coverage percentage.** See the top of this doc — we track
  invariant coverage of critical paths instead. If you want a number: the
  engine, evaluator, and bot-decision code paths are exercised on every run;
  thin UI glue (theme toggles, footers) is smoke-tested, not unit-tested.

## The rule

Every bug fix ships with a regression test that fails without the fix —
verified by running the new tests against the unfixed code before committing.
`npm test` (all 36 suites) gates every release; a red suite blocks the
push. See `docs/INCIDENTS.md` for the production bugs this discipline
has caught and pinned.
