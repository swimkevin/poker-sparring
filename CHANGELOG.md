## [1.8.129] — ARCHITECTURE / AI-WORKFLOW suite counts and CLAUDE native-port wording pinned in the docs-freshness gate

Docs-accuracy pass on the last unpinned claims the v1.8.124–128 series
left behind — every claim below was checked against the code before
pinning it, so a future chain change breaks CI instead of rotting a doc:

- `docs/ARCHITECTURE.md` and `docs/AI-WORKFLOW.md` both cite 36 suites,
  but the gate only enforced the count in README, ROADMAP, and TESTING.
  The gate now derives the count from the `npm test` chain and asserts it
  in ARCHITECTURE and AI-WORKFLOW too. Sensitivity checked: neither doc
  contains a "37 suites" string, so the new assertions fail on any
  changed chain count, not just on a missing doc.
- `CLAUDE.md` said the DOM-free core is "kept reusable for a native port
  later" — the same planned-port phrasing the v1.8.127 gate already bans
  in ARCHITECTURE, and it contradicts the ROADMAP non-goal ("No native
  app"). Reworded to match ARCHITECTURE/ROADMAP: no native app is
  planned; the PWA covers the phone story. The gate now bans "native
  port later" in CLAUDE, verified to fail on the old wording before the
  fix and pass after it. `docs/MOBILE.md` option D is untouched: listing
  an option in an options analysis is not planning it.
- Verified, not changed: debloat scan clean (no dead CSS selectors, no
  never-called top-level functions), README project structure lists all
  14 js/ files, chain parses to exactly 36 suites.

Audit clean: livetest 10/10 with 0 issues and 0 JS errors, coach eval
CLEAN over 11 hands with 0 flags, full suite green.

## [1.8.128] — FEATURE_FLAGS and MOBILE claims pinned in the docs-freshness gate

Docs-accuracy pass on the two docs the v1.8.124–127 series had verified but
not pinned — every claim below was checked against the code before pinning
it, so the drift the series fixed elsewhere cannot silently return here:

- `docs/FEATURE_FLAGS.md` names exactly the three flags in `js/app.js`
  `DEFAULT_FLAGS` (`headsUpMode`, `pushFoldTrainer`, `customBots`, all
  default off), and its console/URL enabling routes match the code
  (`enableFlag` persisting to `ps_feature_flags` in localStorage, `?flags=`
  parsed from the URL). The gate now derives the flag list from
  `DEFAULT_FLAGS` and asserts it both ways: every code flag is documented,
  and every doc table flag still exists in code.
- `docs/MOBILE.md` says the layout stacks under 900px, the PWA is shipped
  with a manifest link and a service-worker registration. Verified:
  `css/style.css` carries `@media (max-width: 900px)` breakpoints,
  `index.html` links `manifest.json`, and `js/app.js` registers `sw.js`.
  The gate pins both claims.
- Verified, not changed: `docs/TESTING.md` cites 36 suites (the chain has
  exactly 36 commands), the README's 14-opponent count matches the 14 bot
  profiles in `js/bots.js`, and the debloat scan is clean (no dead CSS
  selectors — the one candidate, `coach-recap-bad`, is built dynamically
  as `'coach-recap-' + kind` — and no never-called top-level functions
  across js/ and index.html).

Audit clean: livetest 10/10 with 0 issues and 0 JS errors, coach eval
CLEAN over 11 hands with 0 flags, full suite green.

## [1.8.127] — ARCHITECTURE.md stops claiming "no backend" (recruiter-loop docs-accuracy follow-up)

Docs-accuracy pass on the one doc the v1.8.124–126 series had not audited —
every claim below was checked against the code before changing it:

- `docs/ARCHITECTURE.md` opened with "no backend" while the same doc's
  Deployment section documents the Cloudflare Worker relay that online
  tables run through — the same stale-claim class fixed in `CLAUDE.md` in
  v1.8.126. The intro now says solo play needs no backend and online
  tables use the separate relay. The Security note's "no backend to
  attack" is likewise corrected: no secrets, no API keys, no accounts,
  and the relay itself has no auth (verified: no auth code in
  `worker/` or `js/room-server.js`).
- The Layering rule said the DOM-free core was "written to be reused by a
  React Native port later", implying a planned port — while
  `docs/ROADMAP.md` lists no native app as a deliberate non-goal and
  `docs/MOBILE.md` treats React Native as a much-later option only. The
  rule now says DOM-free keeps a port possible without a rewrite, and
  that none is planned.
- Verified, not changed: the evaluator score formula (category * 16^5 +
  kickers), the equity helpers, the 50-hand replay cap, botDecide's
  `{ a, amount } | null` contract, and the engine event queue all match
  the doc; the debloat scan is clean (no dead CSS selectors, no
  once-only top-level functions).
- `tests/docs-freshness-test.js` gains two assertions pinning the above
  (verified to fail both on the v1.8.126 tree and pass on the new tree).

Audit clean: livetest 10/10 with 0 issues and 0 JS errors, coach eval
CLEAN over 11 hands with 0 flags, full suite green.

## [1.8.126] — CLAUDE.md and the incident log stop contradicting the repo (recruiter loop 4 of 4)

Docs-accuracy pass, final in the recruiter series — every claim below was
checked against the code before changing it, and the freshness gate now pins
each one so the drift can't silently return:

- `CLAUDE.md` was the stalest agent-facing doc in the repo: it called the app
  "offline" with "no backend" (online multiplayer via the Cloudflare Worker
  relay shipped long ago), listed only the offline core (missing `replay.js`,
  `names.js`, `online.js`, `netplay.js`, `room-server.js`), told agents to
  keep functions "commented at the decision points" (directly contradicting
  the test-enforced zero-comment rule fixed in `docs/AI-WORKFLOW.md` in
  v1.8.125), cited the "300-hand soak" (default is 100 hands,
  `SOAK_HANDS=300` is the deep check), and listed the hand replayer, the PWA,
  and online multiplayer as future roadmap headliners when all three have
  shipped. All corrected; the roadmap section now points at
  `docs/ROADMAP.md` instead of restating headliners from memory.
- `docs/INCIDENTS.md` said "Two real production bugs" while listing three
  (v1.4.1, v1.4.2, v1.6). Header now says three.
- `docs/ROADMAP.md` cited `js/app.js` as exactly 2,546 lines; the file is
  2,548 lines and counting, so the section now says "over 2,500 lines" —
  order-of-magnitude wording, per the volatile-counts lesson.
- `tests/docs-freshness-test.js` gains six assertions pinning the above
  (verified to fail all six on the v1.8.125 tree and pass on the new tree).

Verified, not changed: the debloat scan is clean (no dead CSS selectors, no
once-only top-level functions), and the README's "4 live coach-audit rounds"
count was left alone — its counting rule is undefined (the changelog said 3
as of v1.8.70), so guessing a new number would invent a metric.

Audit clean: livetest 10/10 with 0 issues and 0 JS errors, coach eval
CLEAN over 11 hands with 0 flags, full suite green.

## [1.8.125] — Coach tone budget now covers the base message, and the docs stop lying about the test suite

Coach fix (found by this run's live eval, which first FAILED with 2 tone
flags on one hand-3 river message, then went CLEAN after the fix):

- The board-play fold message said "everyone is guaranteed at least a
  split" — the eval flags "guaranteed" as overclaim language, and the
  check-branch already says the same thing as "already has at least a
  split". Reworded to match, and tightened the sentence around it.
- Root cause behind the 579-char message: `coachVerdict` budgeted only the
  optional extras (stage/multiway notes, v1.8.113) while the base message
  plus the villain line plus the position note sailed past the 500-char
  tone limit unchecked. The budget now applies to the base too: when it
  overflows, the optional villain line drops first, then the position
  note. Core advice is never truncated. Regression tests in
  `tests/coach-scenarios.js` section 31 fail 4 checks on the old code and
  pass on the new code (91 passed total, was 87).

Docs-accuracy pass (recruiter loop 3 of 3-4 — every claim below was
checked against the code before changing it):

- `docs/TESTING.md` was the stalest doc in the repo: it claimed 144 cases /
  1,133 assertions, a 300-hand default soak, four layers, and that the
  worker "is not executed by npm test" — while the chain runs 36 suites,
  the soak defaults to 100 hands (`SOAK_HANDS=300` is the deep check), and
  `tests/worker.test.js` boots the real Durable Object in the chain.
  Rewritten around order-of-magnitude figures (exact counts rot) with the
  full layer table, and `tests/docs-freshness-test.js` now enforces the
  suite count in TESTING.md plus the absence of the old soak wording.
- `docs/AI-WORKFLOW.md` claimed the suite was "1,058 tests" and told
  agents to "comment the decision points" — contradicting the
  test-enforced zero-comment rule. Both fixed (36 suites / 2,000+
  assertions; history lives in CHANGELOG.md), with a freshness assertion
  against the stale count. The dated ADR that mentions 1,058 is a
  historical record and is intentionally left alone.
- `docs/MOBILE.md` presented the PWA as the "recommended next" step and
  told readers to "ship the PWA" — but `manifest.json` is linked and
  `sw.js` is registered and precaching, so the PWA is already live.
  The doc now says so; the App Store wrapper stays the "if it earns it"
  step.
- README's engineering highlights called the smoke test "300 randomized
  hands" — the smoke test auto-plays full hands in jsdom until 3 are seen
  (300 is the replay-step cap, not a hand count). Corrected.
- Debloat scan clean: no dead CSS selectors, no dead top-level functions,
  no TODOs.

Audit clean: livetest 10/10 with 0 issues and 0 JS errors, coach eval
CLEAN over 11 hands with 0 flags, full suite green.

## [1.8.124] — README structure, architecture diagram, and roadmap now match the app

Recruiter-loop docs-accuracy pass (no app behavior changed except one dead CSS rule):

- README's Project structure listed only 8 of the 14 `js/` files — the
  `cards/evaluator/equity/engine.js` shorthand hid three files outright and
  `names.js`, `stats.js`, `pushfold.js`, `replay.js` were missing entirely.
  The tree now lists all 14 files with the same one-line roles as
  `docs/ARCHITECTURE.md`'s module map, and `tests/docs-freshness-test.js`
  asserts every `js/*.js` file appears in the structure section — verified
  to fail 7 checks on the old README, so the drift can't silently return.
- The architecture diagram showed the offline core only, even though the
  module map lists the whole online layer. It now includes
  `online.js` → `netplay.js` → `room-server.js` → `worker/` relay, with a
  matching docs-freshness assertion on the diagram.
- ROADMAP overstated two things: its standfirst still said "we're at
  v1.8.107" (rotted 16 releases ago — the version clause is dropped, the
  date stays, per the volatile-counts lesson), and its "everything below
  is live" list presented heads-up and the push/fold trainer as core modes
  when both are flag-gated experiments (`docs/FEATURE_FLAGS.md`, README
  Features). Both bullets now say so, and the README's "What it is" line
  carries the same heads-up qualifier.
- Debloat: the `.bet-panel .bet-confirm` rule matched zero elements — the
  Confirm button carries classes `ctl primary`, never `bet-confirm`, and
  no script assigns that class — so the gold styling it declared never
  rendered. Deleted; no visual change. No dead functions found; the scan's
  only other candidates were verified alive.

Audit clean: livetest 10/10 with 0 issues and 0 JS errors, coach eval
CLEAN over 11 hands with 0 flags, full suite green.

## [1.8.123] — README's linked competitive analysis actually ships

The README's coach-methodology section linked `docs/competitive-analysis-2026-10-09.md`, but that file was never pushed — anyone clicking through from the repo README hit a 404. The doc itself (a dated Oct 9 analysis of a rival trainer, and the source of the Blind-mode and session-report ideas) now ships in this release, and `tests/docs-freshness-test.js` now asserts every `docs/` file the README links exists in the tree — verified to fail on a tree without the file, so a future unpushed doc breaks CI instead of shipping silently. No app code changed. Audit clean: livetest 10/10 with 0 issues and 0 JS errors, coach eval CLEAN over 11 hands with 0 flags, debloat scan clean (no dead top-level functions). Loop-ops note added to `AGENTS.md`.

## [1.8.122] — README frames the project as AI engineering

FANG director review (2026-10-25) found the README's substance strong but its AI connection implicit. Two changes: (1) the Why section now states explicitly that this project is an autonomous agent with guardrails — it improves its own codebase daily, verifies every change against 36 test suites, and learns from its mistakes; (2) version-count selling points reframed from "100+ versions" to "daily tested releases" — the process is the signal, not the number.

## [1.8.121] — Architecture doc now tells the truth about online play

Fresh-eyes director review of `docs/ARCHITECTURE.md` found it stale in three
places a hiring manager would trip over:

- The module map listed only the offline core and omitted the entire online
  layer (`names.js`, `online.js`, `netplay.js`, `room-server.js`) plus the
  `worker/` relay — even though online multiplayer is a headline feature
  with its own nav tab. All four files plus the worker are now mapped.
- The Deployment section claimed "no multiplayer" as a consequence of the
  static architecture. Online tables shipped long ago via a separate
  Cloudflare Worker relay (Durable Object rooms, `wrangler` deploys); the
  section now states the real split — static app on Pages, relay apart,
  independent deploys — instead of the old limitation.
- The testing table's counts had rotted: `tests/test.js` is 1000+ tests, not
  954 (bot-legality sweep now thousands of decisions, not 999; engine soak
  100 hands, not 300), and `component.test.js` is 216 tests, not 25. Exact
  unit counts vary slightly run to run (1024 vs 1027 across this run's two
  `test.js` runs, from randomized soak hands), so the table now says 1000+
  instead of a brittle exact number — the previous exact numbers were the
  thing that rotted. The intro now notes the full 36-suite chain.

Deliberately untouched: `docs/adr/0004-static-deploy-github-pages.md` still
says "no multiplayer" — an ADR records the decision at the time it was made,
not the current state; the living architecture doc is where the correction
belongs. No app code changed, so no behavior change: audit clean (livetest
10/10, coach eval 0 flags over 11 hands), debloat scan clean (both
candidates verified alive: `$` helper, `initMobileTabs` IIFE), full suite
green.

Loop-ops learning: two background sessions vanished mid-run with no trace
(the first coach-eval run froze at hand 6, a `test.js` probe session
disappeared) — the service-restart hazard the repo notes already warn
about. The eval was re-run from scratch and verified CLEAN; never trust a
partial run's silence.

## [1.8.120] — Bot-identity regression suite (36th)

New `tests/bot-identity-test.js`: the spot-check sweep proves bot actions are
legal, but nothing proved they are in character. This suite plays every
archetype first-in preflop facing only the big blind (1000 trials each, bot
never in the blind seat so toCall is always the blind) and asserts the
profile: tight bots (Alice, Donald, Rohan, Shark, Rock, Pro, Nit) fold 72o
at least 80% of the time, loose bots (swimkev, Amogh, Nathan, Station,
Maniac, Bully, Gambler) fold it at most 20%, everyone but the never-raisers
(Rohan, Nathan) raises aces at least 50%, and nobody ever folds aces.
Measured rates cluster at 0% or 95-100%, so the bands sit many sigma away
from flaking. Station is exempt from the aces-raise bar (measured ~24% —
the loose-passive calls aces down more than it raises them, which matches
its profile).

Also verified this run, not changed: a first-in VPIP probe initially looked
like six bots "never fold anything" (100% VPIP), but a 72o control showed
the loose bots genuinely call trash to a lone blind while Rock folds it
300/300 — the taglines ("Sees every flop with a smile", "Almost never
folds") are honest, and the desc percentages describe real-game rates with
raises in front, not first-in rates. No dead code this run: the only
dead-function candidate was the named IIFE `initMobileTabs`, and the only
dead-CSS candidate was `coach-recap-bad`, alive via dynamic class
construction — both verified alive, both left alone.

## [1.8.119] — Roadmap now states the app.js plan in public

Closing a loop-instruction gap from the 2026-10-23 FANG director review:
the review flagged `js/app.js` (2,546 lines) as the app's #1 architectural
concern and the loop notes said to make the extraction plan public — but
`docs/ROADMAP.md` never actually said it. It does now: a new "Architecture:
the app.js question" section states the plan (extract the coach into
`js/coach.js`), why it's deferred (the coach shares closure state with game
flow, so refactor risk outweighs value on any given day), and the gate for
attempting it (full suite green before AND after).

Also verified this run: the daily audit is clean (livetest 10/10, coach
eval 0 flags over 11 hands, full suite green), and a debloat scan found no
dead CSS — its one candidate, `coach-recap-bad`, is alive via dynamic class
construction (`'coach-recap-' + kind` in app.js, `'coach-recap-' + (good ?
'good' : 'bad')` in ui.js), the exact string-concatenation trap the
debloat-scan discipline warns about. Verified with grep, not deleted.

## [1.8.118] — Flagged-modes regression suite + scroll-saga CSS debloat

Kevin's manual trigger: debloat round + feature testing + fresh-eyes pass.

- **New `tests/flagged-modes-test.js` (35th suite).** The feature-flagged modes
  (heads-up, push/fold trainer, custom-bot builder) are hidden from the default
  UI, so nothing exercised them day to day. The suite boots the real app in
  jsdom with all flags on and plays each mode end to end: 5 push/fold rounds
  with verdict feedback every round, a full heads-up hand to completion, and a
  custom-bot add/delete round-trip — zero JS errors throughout. Wired into
  `npm test`; README/ROADMAP suite counts updated (the docs-freshness gate
  stays green). All three modes verified healthy — no app bugs found.
- **CSS debloat from the v1.8.115–117 scroll saga.** Two superseded
  declarations removed: `overflow-y: auto` + `-webkit-overflow-scrolling` on
  `#online-view.online-scroll` (the v1.8.116 rule) are fully overridden by the
  v1.8.117 `:has()` rule's `overflow: visible` under identical conditions —
  only the padding survives. Also dropped a dead `font-size: 1rem` on
  `.mp-body .coach`, overridden by the later `0.9rem` in the same query.
  Verified win-by-specificity before deleting; no visual change.
- **Loop-ops learning: phantom-stall probes.** This run's first heads-up probe
  reported a "stuck" game three times — all three were probe bugs, not app
  bugs: (1) `UI.clearLog()` wipes `#hand-log` every hand, so counting
  `Hand #` in the log can never exceed 1 — count via `#hand-info` instead;
  (2) the "You are felted!" rebuy modal is correct behavior, not a stall —
  handle it like the sweep does; (3) bot think pacing (650–1400ms/action) plus
  coach Monte Carlo makes headless play look frozen on short horizons. Extends
  the v1.8.111/113/114 probe-fidelity rules: verify the probe's measurement
  method before concluding the app is broken.

## [1.8.117] — Online scroll: bulletproof fix

v1.8.116's fix didn't work on Kevin's phone. Root cause: a `.online-wrap` div sits between the flex parents (`#screen-online` → `#online-root`) and `#online-view`, breaking the flex sizing chain — `flex: 1` on `#online-view` did nothing because its parent isn't a flex container.

New approach doesn't depend on flexbox at all: when the lobby is shown (`#online-view.online-scroll` present), a `:has()` rule turns `#screen-online` into a plain scrollable block container and neutralizes all the intermediate `overflow: hidden` / flex constraints. The in-game table (no `online-scroll` class) keeps the original fixed layout. Also raised the header brand-collapse breakpoint from 420px to 900px so the spade-icon-only header applies on all phones (Kevin's iPhone is wider than 420px). All changes remain in mobile media queries — desktop untouched.

## [1.8.116] — Fix Online scroll (for real) + hidden-screen bleed

v1.8.115's scroll fix didn't work: setting `display: block` on the scrollable view broke its flex sizing, so it overflowed without scrolling. The view keeps `display: flex` now and just gets `overflow-y: auto` — flexbox constrains the height, the content scrolls inside it.

Also fixed a screen-bleed bug Kevin caught: on mobile, `#screen-online` and `#screen-table` set `display: flex`, which overrides the `hidden` attribute — so the Online heading was visible at the bottom of the Play tab. Both now respect `[hidden]` explicitly. `tests/online-scroll-test.js` covers both fixes. All changes are inside mobile media queries; desktop is untouched.

## [1.8.115] — Online tab scrolls on mobile

Kevin reported the "Play online" page couldn't scroll on iPhone — the Host/Join forms were clipped below the fold. Root cause: `#online-view` had `overflow: hidden` on mobile (meant for the in-game table), which also trapped the lobby views.

- **Scrollable lobby.** `renderHome()` and `renderLobby()` now add an `online-scroll` class to `#online-view`; `renderTableView()` removes it. On mobile the scrollable view gets `overflow-y: auto` with momentum scrolling and bottom padding clear of the tab bar. New `tests/online-scroll-test.js` locks it in (34th suite).
- **FANG-level mobile polish.** 44px minimum touch targets on all form inputs/buttons (48px for the primary CTA, full-width), and the header brand collapses to just the spade icon below 420px so the Online tab + bankroll fit without clipping.

## [1.8.114] — Bot profile honesty: donald + rohan taglines match real behavior

The daily bot audit measured postflop fold rates against a faithful probe
(pure-air hands with no flush/straight draws, verified draw-free after two
probe bugs: Qs on a Ks board is a flush draw, and a 4-flush on the turn
board is a draw too). Findings: every bot correctly folds pure air to big
bets (need >= 0.25) on all streets — the v1.8.104 flop fix generalizes —
40/40 for donald, rock, shark, amogh, lag, nathan, rohan, maniac; station
keeps its character (2/40 with overcard air, 40/40 with absolute nothing).
Two taglines contradicted the measured behavior (the v1.8.89
profile-text-must-match-params pattern, following the v1.8.108 maniac
precedent):

- **donald:** tagline claimed "almost never folds postflop" while he folds
  air 40/40 to big bets on every street. Now: "Tight but sticky. Folds a
  lot preflop, and folds air to big bets — but never a pair." (His desc
  already said he calls down light — that part was honest.)
- **rohan:** tagline claimed he "calls everything" while his own desc says
  he "folds when he has nothing" and he folds air 40/40. Now: "Loose and
  straightforward. Calls down light, but folds when he has nothing."

`tests/fold-realism-test.js` section D gains four profile-honesty
assertions (verified to FAIL 4/4 on the old taglines, PASS on the new).
Checked but deliberately left alone: nathan's "Never raises" tagline is
honest — measured 0/40 raises pre-river AND on the river (his river trap
bets ~73% with near-nuts when checked to, but never raises), so no change.

## [1.8.113] — Coach tone budget + contradiction-detector fix + aggressive soak test

The daily coach eval flagged two issues; both root-caused and fixed:

- **Coach messages now respect a length budget (tone flag).** A 513-char
  flop verdict exceeded the 500-char tone limit: independently-reasonable
  components (pot-odds math line, bluff-catching note, villain exploit line,
  position/multiway notes) stack without bound. Two changes: the
  bluff-catching note is tightened (keeps the plain-English definition the
  scenarios test asserts on), and `coachVerdict` now appends the optional
  stage/multiway notes only while the message stays under budget (480 chars
  for normal verdicts, 800 for the first-decision table-reads verdict whose
  eval limit is 850). Core advice is never truncated.
- **Eval contradiction false positive fixed.** The eval flagged "advice
  flipped raise -> fold with no new cards" on a hand where the coach was
  right both times: `preflopSpot()`'s `facing-open` bucket conflated "no
  raise yet" (isolate limpers / steal — coach says raise) with "facing one
  raise" (coach correctly says fold). The eval's situation key now includes
  the preflop raise count (new `__coachTestHooks.preflopRaises`, backed by
  an extracted `preflopRaiseCount()` that `preflopSpot` and `coachPreflop`
  share instead of duplicating). The deterministic selftest gains a
  regression case for exactly this scenario — verified it FAILS on the old
  bucketing and passes on the new.
- **New `tests/aggressive-soak.js`** (wired into `npm test`; suite count is
  now 33 — README/ROADMAP updated, the docs-freshness gate stays green).
  25 full hands with a maximum-pressure hero (wide opens, 3-bets, 2/3-pot
  c-bets, barrels) against every bot archetype on the REAL engine table,
  asserting no exceptions, every bot action legal per `engine.act`'s exact
  validation, and chip conservation hand to hand. Verified it FAILS when the
  bug is injected (+1 chip leak: 17/25 clean, AGGRESSIVE SOAK FAILED) and
  passes 25/25 on clean code.
- **Loop-ops learning: verify the probe's contract on both sides.** The
  first version of the soak probe read `mv.amt` while `botDecide` returns
  `{ a, amount }` — 48 phantom "illegal raise undefined" failures; then the
  hero policy used the wrong field name (44 more); then the checker was
  stricter than `engine.act` (which treats 'bet'/'raise' identically).
  Rule: run any probe against ONE known-good hand first — a probe that
  flags the control is broken, not the app. Extends the v1.8.111
  stub-fidelity rule to return shapes.
- **Loop-ops learning: verify tree-vs-remote-tip at run start.** This run
  opened with local git HEAD at v1.8.1 while the working tree held the full
  v1.8.112 content — push.py never updates local refs, so local git metadata
  rots silently. Phase 0 now opens with `git fetch` + a `git archive`
  vs working-tree diff to confirm the tree matches the remote tip before
  any suite runs.

## [1.8.112] — Fix flaky Rohan aggression assertion (CI caught it)

CI failed the v1.8.111 tree on `tests/test.js`: `Rohan rarely bets or raises
(45 aggressive of 718)` — the same tree passed CI three minutes earlier, the
classic signature of a statistical flake. Root cause: Rohan's true aggression
rate is ~3.9% (measured 271/6975 over 400 hands), so a 5% threshold on ~718
decisions flakes ~7% of runs. Per the v1.8.100 Monte Carlo rule the threshold
must sit several sigma above the true rate: now 7% over 60 hands (~1080
decisions), which keeps the flake probability negligible while still catching
a real regression (e.g. 15% aggression fails loudly). No bot behavior changed
— test-only fix.

## [1.8.111] — Bot sanity sweep regression test + loop-ops learnings

- **New `tests/bot-sanity-sweep.js`** (wired into `npm test`; suite count is
  now 32 — README/ROADMAP updated, the docs-freshness gate stays green).
  Drives every archetype's `botDecide` through 500 random spots (all streets,
  random stacks/pots/bets/live counts) with a stub that faithfully mirrors
  `js/engine.js`'s `legalActions` contract, and asserts every returned action
  is well-formed: a known action string, a finite non-negative amount, and
  bet/raise amounts inside the legal [min, max] range. Verified it FAILS when
  the bug is injected (a `clampRaise` returning NaN produced 49 failures) and
  passes on clean code (500/500 sane this run).
- **Loop-ops learning: probe stubs must mirror the engine contract.** An
  early version of this sweep's stub omitted `minBetTo`/`players`/`button`
  and reported phantom NaN bets and preflop exceptions that don't exist in
  the real game — the stub manufactured the bugs. Rule going forward: verify
  any probe stub against `js/engine.js legalActions` before trusting its
  findings.
- **Loop-ops learning: one `push.py` call per release.** `push.py` sends one
  blob POST per file, so the ~150 KB size limit is per-file, not per-commit —
  the v1.8.108–110 "1/3, 2/3, 3/3" split pattern was never required and is
  what produced the red intermediate commits. Verified the pattern against
  v1.8.107 (a single 12-file commit, incl. the 107 KB `js/app.js`, pushed
  fine). Every release now ships as ONE atomic `push.py` call with every
  changed file; version identity (version.txt, package.json, APP_VERSION,
  all ?v= busters, sw.js PS_VERSION, README (vX)) changes in that same call.
- **Every-commit-green gate verified (Kevin's manual rerun request).** CI
  history confirms the gate works: the split intermediates `b0a8e68` /
  `ecb6eb7` correctly FAILED (docs-freshness caught the version-identity
  split), and the tip `d28a795` is green on both the test workflow and the
  Pages deploy. Live `version.txt` matches the repo at 1.8.110 — no drift.
- **Coach eval clean.** 11 hands completed, 0 flags, 0 JS errors; livetest
  10/10 hands OK. Debloat scan clean (0 dead functions/CSS — same false
  positives as v1.8.110, verified again).

## [1.8.110] — Theme-toggle/Online regression test + undefined CSS var fix

Kevin's transient theme-toggle blank on the Online tab (first seen v1.8.106,
never reproduced) is now a permanent regression test instead of a carried
"known cosmetic" line:

- **New `tests/theme-online-test.js`** (wired into `npm test`; suite count is
  now 31 — README/ROADMAP updated, the docs-freshness gate stays green).
  18 checks: Online nav shows the lobby, 4× theme toggles never hide
  `screen-online` or empty its content, exactly one screen stays visible,
  navigate-away-and-back survives another toggle, zero JS errors. Verified
  the test FAILS when the symptom is injected (a toggle that hides
  `screen-online` blanks the app exactly as reported) and passes on clean
  code. The code audit was re-run to match: the toggle only flips
  `data-theme`, every var `online.css` uses is defined in both themes, no JS
  touches the online screen on toggle — the transient blank itself remains
  unreproduced (likely a paint glitch; it self-healed on re-select), but no
  future change can reintroduce the DOM-state version of it.
- **Fixed undefined `--card`.** `.emoji-pick` (the emoji `<select>`s on setup
  and the online host/join forms) used `background: var(--card)`, but `--card`
  was never defined anywhere — the declaration silently dropped to a
  transparent background. Now uses the existing `--panel2` surface token
  (one line). It was the only undefined CSS variable in shipped styles.
- **Debloat scan clean.** 0 dead functions, 0 dead CSS selectors. The naive
  scan's candidates (`$`, `initMobileTabs`, `coach-recap-bad`) were all false
  positives on verification — named IIFE, regex missing `$(` call sites,
  string-concatenated class names — per the v1.8.109 discipline note.

## [1.8.109] — Docs-freshness gate (the loop improves itself)

The v1.8.108 audit found README/ROADMAP suite counts had drifted when
`sw-test.js` joined the chain in v1.8.107 — and no test caught it. New
`tests/docs-freshness-test.js` (wired into `npm test`, verified to fail on
the stale state): counts the unique `node tests/` suites in the `npm test`
chain and asserts README and ROADMAP print that number, plus that README's
`(vX.Y.Z)` mention matches `package.json`. Stale hiring-manager numbers now
fail the build instead of shipping.

## [1.8.108] — Maniac tagline honesty + docs suite counts

- **Maniac's tagline was lying.** Since v1.8.104's fold-realism tuning,
  Maniac folds air to big bets by design (regression-tested at 35+/40, and a
  240-hand aggressive-hero probe this run showed 61% flop folds vs 3/4-pot
  bets) — but his tagline still said "No fold button found." New tagline:
  "Raises everything. Even he folds air to a big bet." Added a guard to
  `tests/fold-realism-test.js` so the tagline can never again claim he never
  folds while the fold behavior is tested. (Profile text must match params —
  the v1.8.89 rule.)
- **Docs suite counts corrected.** README said 28 suites, ROADMAP said 25 —
  the `npm test` chain has 29 since v1.8.107's `sw-test.js`. Hiring-manager
  numbers stay honest.
- **Audit notes.** The 240-hand probe (aggressive hero betting 75% pot with
  everything, 0 engine errors) confirmed every archetype behaves per its
  profile: rock/alice fold most, donald/station/rohan stay sticky with pieces,
  nathan calls down by trapper design. The transient Online-tab theme-toggle
  blank remains unreproduced in the harness (toggle only flips `data-theme`;
  no code path blanks the online screen) — still a known cosmetic item.

## [1.8.107] — Service worker: the PWA is real now + two eval flags fixed

The manifest has been linked since early on, but no service worker existed, so
the app was never actually installable or offline-capable — dead weight on the
"PWA" claim. Fixed with a minimal cache-first worker:

- **New `sw.js`** (zero comments, like all shipped source). Precaches the full
  app shell on install (every `?v=` asset `index.html` references, plus the
  manifest and icon), serves versioned assets cache-first, and uses
  network-first for navigations and `version.txt` so the update check
  (`fetch('version.txt?v=' + Date.now())`) keeps working and the page never
  goes stale while online. Cross-origin and non-GET requests pass through
  untouched. The cache name carries the version and the SW file itself changes
  every release, so updates propagate through the normal SW update flow.
- **Registered on boot** in `js/app.js`, with failures routed through the
  existing `quiet(e)` helper (visible under `?psdebug=1`) — a failed install
  leaves the app exactly as before, never broken.
- **New `tests/sw-test.js`** (19 checks, wired into `npm test`): runs the
  worker in a stubbed SW environment and verifies install precaches the whole
  shell, activate purges stale caches, the cache-first/network-first split,
  offline navigation fallback, and request passthrough. It also enforces the
  version-bump rule as a test: `version.txt`, `APP_VERSION`, `package.json`,
  every `?v=` in `index.html`, and `PS_VERSION` must all agree — a forgotten
  bump now fails the build instead of shipping a phantom update.
- The version-bump checklist in AGENTS.md now lists all five places.

The 10-hand coach eval flagged two issues this run, both fixed at the root:
- **Tone (508-char message).** A pot-odds explanation ran 8 chars over the
  500-char message budget. Cut the zero-information "(pays for itself)"
  filler and tightened the tournament note — the message now ships with
  ~50 chars of margin on its longest path.
- **Contradiction false positive.** The eval flagged a preflop raise→fold
  flip, but the coach was right: hero was advised to 3-bet a premium vs an
  open, then correctly advised to fold it vs the re-raise — the situation
  changed. The eval's same-situation bucket (`hand|street|facing`) was too
  coarse to see that. It now keys on the coach's own spot classifier
  (`open` / `facing-open` / `facing-3bet` / `facing-4bet+`), and a new
  deterministic `node tests/coach-eval.js --selftest` (wired into `npm test`)
  pins the bucketing: the old logic fails it, the new logic passes, and true
  contradictions still flag.

## [1.8.106] — CI fix + coach grammar + deep live-test pass

- **CI green again.** The v1.8.105 `no-comments-test.js` failed on CI (not locally) because a locally-deleted `js/update-check.js` still existed on the remote — `push.py` cannot delete files. Removed via the Contents API. Added the lesson to AGENTS.md: directory-scanning tests must account for orphaned remote files.
- **Coach grammar.** Position note said "You're in button" — now "You're on the button" (and "in the small blind", "in early position", etc., each with the right preposition).
- **Deep live-test round.** 8 hands in a real browser (all tabs, bet panel, edge cases) + 10-hand local live loop + full 27-suite CI. Found 4 minor issues: the button grammar (fixed), silent clamping of invalid bet amounts (by design — clamping prevents bad bets; no change), a transient theme-toggle blank on the Online tab (self-heals on re-select; not reproduced in tests), and a reported preflop min-raise of 21 vs 20 (engine math verified correct at 20 — likely a misread). No JS errors anywhere.

## [1.8.105] — Zero-comment source, jargon-free coach, debug-everywhere catches

Kevin's directive: debloat the code, zero comments (matching the Lens project), FANG-level README with a real "why", and keep the loop improving itself. An independent adversarial audit (fresh-eyes review as FANG hiring manager + beginner) filed 10 findings; the high-impact ones are fixed here.

- **Zero-comment shipped source.** Stripped ~1,200 comment lines from js/, css/, and index.html. Version-history comments now live only in CHANGELOG.md, where they belong. New `tests/no-comments-test.js` fails the build if a comment ever ships again — the same test-enforced rule as Lens. (The strip caught 4 tests that were asserting on comment text instead of code — rewritten to assert on the actual logic.)
- **Coach is jargon-free for real.** The README claimed "No 3-bet" but the coach said "3-bet"/"4-bet" in 6 spots and "set-mine" in 3. All rewritten in plain words ("re-raised", "raise again", "hunting three of a kind"). New static checks in `tests/coach-scenarios.js` fail if jargon returns.
- **Silent-failure lesson applied repo-wide.** 42 bare `catch {}` now route through a `quiet(e)` helper that logs under `?psdebug=1`. The README's #1 lesson ("error handling should never make bugs invisible") is now true everywhere, not just the coach.
- **First-run coach intro.** One dismissible tip on the first hand ("New here? This is your coach…"), persisted to localStorage. New `tests/coach-intro-test.js`.
- **iOS viewport.** `100vh` → `100dvh` with `100vh` fallback (Safari toolbar overlap).
- **Docs honesty pass.** ROADMAP rewritten (the old one planned v1.3–v2.0; we're past 1.8.105), README gained a "Why I built this" section, Features list marks heads-up/push-fold as experimental flags, stale demo-video placeholder removed, suite count corrected. Deleted 2 stale docs (TABLE_REWRITE_PLAN.md, coach-improvement-loop.md).

Deferred: extracting the coach from app.js into js/coach.js (audit suggestion) — the coach shares closure state with game flow, so the refactor's regression risk outweighs today's value. Logged as a future improvement.

## [1.8.104] — Bots fold air to big bets (fold-realism tuning)

Kevin's observation from live play: bots called too loose and never folded
after the flop. A 40-trial probe per archetype confirmed it — donald/lag/amogh
folded air (no pair, no draw) to a 3/4-pot bet multiway exactly 0/40 times,
and nobody folded air heads-up. It also caught the opposite leak: shark/pro
folded the nut flush draw 40/40 (over-tight).

- The old discipline rule (v1.8.97, disciplined bots only) is now a general
  fold-realism rule: everyone but Station folds no-pair, no-draw hands
  (ms < 0.30, flush draws and open-enders exempt) at need >= 0.25 (1/2-pot+,
  heads-up or multiway). need is toCall/(potTotal+toCall) and potTotal
  includes the bet, so 0.25 is exactly a half-pot bet.
- Follow-up probe caught the first cut (0.30) only catching 3/4-pot+:
  heads-up vs exactly 1/2-pot with air, sticky bots still folded 0/60.
  Threshold unified at 0.25 — now 40/40 folds there too.
- Station keeps its loose character: it only folds "absolutely nothing"
  (ms < 0.15, no draw), and only at need >= 0.30 (3/4-pot+) — 40/40 in the
  probe, while still calling with overcard air 38/40.
- Draw exemption fixes shark/pro over-folding: both continue with the nut
  flush draw 40/40 now. Pairs untouched everywhere (40/40 continue).
- Taglines honed: donald "almost never folds postflop", station "almost
  never folds".
- 10-hand live sim with a bluff-heavy hero (55% stab when checked to, 25%
  bluff-raise vs bets): bots folded air to big bets in live play
  (donald 2/4, lag 2/2, amogh 3/3, rohan 1/1).
- New permanent regression test: tests/fold-realism-test.js (21 assertions,
  wired into npm test).

## [1.8.103] — Shorter coach messages + 1/4-pot bet panel + loop hardening

Four live-testing rounds (real hands, hero + coach audited every decision):
- Round 1 caught hands stalling after the hero busted — the "felted" modal
  blocked the next hand. Eval harness now auto-rebuys (correct app UX, the
  harness just didn't handle it).
- Rounds 2–3 flagged 900-char coach messages: the opponent scouting report
  repeated on every street's first verdict. Reads now show once per hand,
  using short archetype taglines ("Tight but sticky") instead of full
  exploit paragraphs. Round 4: EVAL CLEAN, 0 flags across 7 hands.
- Equity label dedup: "21% vs Donald's strong range… (simulated 150× vs
  Donald's strong range)" said the range twice — now "(150 Monte Carlo
  simulations)" when the threshold already names it.
- Bet panel opens pre-set to 1/4 pot (Kevin) instead of the minimum; the
  1.5× overbet quick button is now ¼ Pot.
- Alice defense test: 40 trials was flaky (33/40 vs a 34/40 bar). Now 200
  trials with proportional bars.
- New permanent test: feature-sweep (every tab, screen, and game mode boots
  and renders). coach-scenarios sections renumbered 1–29.

## [1.8.102] — Honest board texture + 1/4-pot default + calmer Donald

Kevin's flop spot: 6h6s2d rainbow, coach said "Bet for value 3/4 pot (221) —
lots of draws out there". There are no draws on that board: the old texture
check (rank spread <= 4) ignored the pair.
- boardTexture now needs 3 distinct ranks within a 5-span for "wet" — paired
  boards like 662 correctly read dry (Donald's own wet-board overbet check
  fixed the same way).
- Default value-bet sizing: 1/4 pot on dry boards (Kevin), 2/3 on wet, 3/4
  only vs stations who never fold. Dry message explains the small sizing.
- Donald bluffs less with nothing: bluff param 1.0 -> 0.5 (air stabs roughly
  halved); his draw semi-bluffs (65%) are untouched — those have equity.
- Test-harness repair: coach-scenarios.js had a process.exit() mid-file, so
  sections 19-21 and 24-26 were dead code that never ran. Moved results+exit
  to the end; revived sections exposed 5 stale assertions (fixed: v1.8.74 line
  restructure, Donald bluff value, donaldPostflop dispatch vs export, stale
  'swimkev' fallback roster default in app.js, board-play branch regex).
- New test: texture-sizing (10 texture cases + sizing + Donald params).

## [1.8.101] — Coach no longer value-raises when hero plays the board

Kevin's river spot: A-K on Q-Q-7-Q-7. The old coach classified the board's
full house as the hero's 'nut' and said "Raise for value ~3x, charge the
draws" — but when none of your cards are in the best 5, nobody can hold a
worse hand than you (raising gets called only by better), and a bet is never
a bluff (you can't bluff someone off a hand they already tie).
- handClass returns 'board' for straight+ with no hole card in the best 5.
- Facing a bet with 'board': Fold, with a plain-language explanation naming
  the Queen/Seven danger vs tight players. Checked to: Check (nothing to
  value-bet, no fold to win).
- New tests: board-play (classifier incl. quad/sevens-full counter-cases
  that must stay 'nut') + static verdict-branch checks in coach-scenarios.

## [1.8.100] — Flaky equity test hardened

- The v1.8.99 range-equity ordering assertion (tier2 < tier3 < random) flaked at
  500 Monte Carlo sims (SE ~0.022 vs a ~0.04 true gap — pure noise, caught on
  2026-10-13 rerun). Sims raised to 5,000 for those three estimates (ordering
  then held across 5 seeds); suite is back to 1,020/1,020.

## [1.8.99] — Honest coach equity, side-pot reconciliation, reveal hardening

- Disputed equity spot FIXED (Kevin): the coach's "you win X%" vs a strong
  read is now simulated against the villain's actual tier-bounded range on
  the real board (`estimateEquityVsRangePostflop` in equity.js) — never vs
  random hands with a fudge factor. Polarized-from-a-non-bluffer reads as a
  tier-2 (premium/strong) range, 'strong' as tier-3; the x0.75 discount and
  the compensating bar bumps are gone (they double-counted once the range is
  priced into the equity). The math line now says "simulated 150× vs Amogh's
  strong range" — the number shown is the number the advice is based on.
- Side-pot 3k report investigated (Kevin): 150 fuzzed multi-level all-in
  hands now assert per-player event-vs-actual credit agreement
  (`tests/sidepot-reconcile.js`, 2,000+ assertions) — the handEnd event, the
  winner banner, and the hand history can no longer disagree with real stack
  credits. No reproduction of the 3,275: engine and event agree on every
  reachable path; stays a watch item pending a hand number from Kevin.
- Engine hardening: the degenerate no-eligible-winner refund now emits
  per-player "takes back" entries instead of a winnerless pot (the old shape
  rendered as "Side pot N: wins X" with no name).
- Voluntary reveal hardened (online): the "Show my cards" button now appears
  only after the hand completes — it was offered to players who folded
  mid-hand, broadcasting their live cards to the table. The server now
  rejects `show` while a hand is in progress (ships with Kevin's next
  `wrangler deploy`; the client half is live immediately).
- Mobile audit (online): `.online-table-top` is now a real flex row (the old
  rule set flex-wrap without display:flex), the Show button is anchored
  bottom-center of the felt (was in-flow over the top seats), and the paused
  overlay is centered (was unstyled). Feature flags audited: all three map to
  live elements, no dead references. Rabbit-hunting doesn't exist in the app
  (nothing to validate); run-it-twice scoped but not built — Kevin's call.

## [1.8.98] — Online winner presentation + mucked losers

- Winner treatment online now matches solo: gold seat ring, the winning hand named
  in the splash ("Guest-1 wins 20 · Two Pair, Aces and Kings"), and the winning
  best-5 cards lift with a gold ring while the rest of the board dims (best-5
  computed in the client from the winner's shown cards).
- Losing showdown hands are mucked by default: only winners' cards are revealed;
  everyone else shows card backs unless they tap "Show my cards". Enforced in the
  client display immediately and in the room server's snapshot (live on the next
  worker deploy).
- Room server: split pots now expand to per-winner entries with per-winner
  amounts (co-winners were previously dropped and the whole pot credited to one
  player in the banner/feed); uncalled refunds are no longer listed as wins.
- Show-my-cards button now appears for losing players even against older relays.
- New tests: online-winners (server normalization + reveal filtering) and
  online-winner-dom (full mock game in jsdom: ring, face-up winner, mucked loser,
  lifted board). Live-verified: 3 full hands on the production relay, chips
  conserved, no errors.

# Changelog

All notable changes to Poker Sparring. Versions are also stamped in the app
footer (`APP_VERSION` in `js/app.js`) and `package.json`.

## [1.8.97] — 2026-10-11

### Winner highlight + winner line fix (Kevin)
- At showdown the winning best-5 cards now lift with a gold ring — the
  winner's hole cards plus the board cards that make the hand — while the
  rest of the board and the losers' cards dim, casino-style. The winner's
  seat ring turned gold (was green, hard to see on the felt).
- Bug found by the new test: the "X won with ..." line under the hero
  cards was overwritten by the hand-end render the instant it was set —
  it now applies after the render, so it actually stays visible.
- Rebuy bug (Kevin): after rebuying, the top-right win/loss counter read
  0 for the whole next hand — the Rebuy button zeroed it instead of
  refreshing from lifetime stats. Fixed; the rebuy itself still isn't
  counted as profit.

### Shark discipline (Kevin)
- Shark called pot-sized+ bets multiway with no pair — Monte Carlo equity
  vs random hands plus the stack discount talked him into it. Disciplined
  players (Shark, Pro) now fold no-pair hands at those prices outright:
  need >= 0.30 multiway, >= 0.40 heads-up. His preflop calling tightened
  too (callTier 4 -> 3). He still defends top pair at the same price and
  still calls small bets heads-up with overcards.

### Cleanup round (Kevin)
- README refreshed with accurate numbers (97 versions, 14 archetypes,
  1,450+ assertions) and the new features (hand label + winner line,
  mid-hand freeze/resume, range reads, Learn rankings).
- Removed the dead range.words rendering (replaced by concrete range
  reads) and fixed three coach-advice tests that predated the
  never-empty-recap rule.
- New permanent tests: tests/live-loop-test.js (`npm run livetest`) plays
  10 full hands in the real app (jsdom), hero calling/checking to the
  river, asserting the coach speaks on every turn, the hand label shows
  postflop, and no JS errors occur.

## [1.8.96] — 2026-10-11

### swimkev's iso identity + coach range reads (Kevin)
- swimkev limped A9 then folded to an iso raise. Now he IS the iso-raiser:
  big ~1.5x-pot iso over limpers with good hands (pressure + information —
  callers show monsters/premium high cards), doesn't fold good hands to
  others' isos, and attacks low flops after his iso gets called (their
  high-card range whiffed) while repping the raiser's range.
- Coach now reads ranges out loud in plain words, adjusted for personality
  and board: "Rohan's range is capped: mostly one pair or a draw — a
  monster would usually raise on this draw-heavy board." Plus sizing-tell
  lessons (tight player's overbet = the nuts; bluffer's = polarized).

### No fake side pots heads-up (Kevin's hand #6)
- Pot layers with identical eligible players are now merged: heads-up vs
  a short all-in, Rohan wins ONE main pot — the hero's excess is simply
  the uncalled refund, not a "side pot".

### Recap grades the hand-defining decision (Kevin)
- Recap picked the first mistake (a 10-chip limp, "you went call") over
  the all-in that decided the hand. Decisions now record pot size and the
  recap grades the biggest-pot one, naming the street.

### Crash fix
- detectDraws() hardened against stub players — a direct unit call has
  crashed tests/test.js since v1.8.93's Amogh change (the CI failure
  emails). Full suite green again: 1009 passed in tests/test.js.

## [1.8.95] — 2026-10-11

### Leave mid-hand, come back to the exact same spot (Kevin)
- Switching to Learn/Stats/etc mid-hand used to lose the hand (bots kept
  playing with nobody watching). Now the game FREEZES when you leave the
  table tab — pump, bot timers, and the auto-deal countdown all pause —
  and resumes exactly where it stopped when you return. Nothing is
  rebuilt or re-dealt; the table lives in memory.
- Play button with a live game = back to your table. Setup also gains a
  "▶ Back to your game — Hand #N in progress" button.
- Verified by tests/away-freeze-test.js (state identical after 3s away,
  game moves again on return).

### Alice + everyone: stack-relative looseness (Kevin)
- Alice folded ATs to a 75 bet with 1000 behind: a 7.5bb open tripped the
  "facing a 3-bet" branch on size alone, and the stack discount gave zero
  relief at 7.5% of stack.
- stackDiscount bands widened (relief up to ~12% of stack), Alice callTier
  1→2 / openTierLate 2→3, postflop cheap-call factor 0.18→0.25, and the
  big-bet branch now lets playable hands defend when the price is small
  vs the stack. Trash still folds; real stack-threatening bets still
  respected. tests/alice-defense-test.js locks it in (38/40 continue).

## [1.8.94] — 2026-10-11

### Fix hand-strength label (Kevin's screenshot: no "Pair of 2s")
- evaluate() takes ONE combined array; the label code passed (hole, board)
  separately, threw, and silently rendered empty postflop. Preflop pairs
  worked, which masked it.
- Fixed to evaluate(hole.concat(board)). Verified live in jsdom with
  Kevin's exact spot (T2 on A-2-5 = "Pair of Twos") + new regression test
  tests/hero-desc-test.js (in npm test): flop/turn/river/preflop cases.

## [1.8.93] — 2026-10-11

### Amogh plays more normal (Kevin)
- Was too loose + bluff-heavy with crazy all-ins. Now:
- Pairs (one pair / weak two pair) usually check down to see the river
  instead of bombing.
- Bluffs only as semi-bluffs with a real draw (flush draw / open-ender) —
  never a pure-air all-in. Overbet line raised (bets strong hands only).

## [1.8.92] — 2026-10-11

### New features for beginners (Kevin)
- **Hand strength by your cards**: gold label under your hole cards shows
  what you currently hold ("Two Pair, Eights and Sixes", "Flush, Ace high",
  pocket pair preflop) — PokerNow-style.
- **Winner line**: after showdown, "🏆 Rohan won with Full House, Aces over
  Eights" stays by your cards so you know what beat you.
- **Learn section**: hand rankings table (Royal Flush → High Card with
  examples) + 8 beginner rules to live by.

## [1.8.91] — 2026-10-11

### Coach all-in sizing + Rohan raises monsters (Kevin)
- Coach said "bet ½ pot (300)" when hero had 885 and was committed. Now
  shoves instead of suggesting a small fraction when SPR says commit.
- Rohan had Aces full and only called. Added monsterThrough: with a monster
  (flush+), his raises now go through the neverRaise gate like a normal person.

## [1.8.90] — 2026-10-11

### Bulletproof coach recap — never empty (Kevin)
- Won at showdown with no recorded strong decision → empty recap.
- Added catch-all: if no branch fires, show generic win/loss message.
- Coach now ALWAYS says something after every hand.

## [1.8.89] — 2026-10-11

### Fix "Rohan bluffs constantly" bad advice (Kevin's screenshot)
- Coach said "Rohan bluffs constantly" but profile says "bluffs sometimes".
- Root: vManiac check used bluff param > 0.6. Rohan has bluff 0.68 but
  aggression 0.05 — not a maniac.
- Fix: vManiac now requires aggression > 0.5 too.

## [1.8.88] — 2026-10-11

### Rohan tighter + roster repair (Kevin)
- Rohan: callTier 5→4, stubborn 0.80→0.65, callPushTier 4→3. Still
  loose-passive but folds air like a normal person.
- topUpRoster now ensures ALL defaults present (was fill-to-7). Stale saves
  with Station get him swapped for swimkev (lag).

## [1.8.87] — 2026-10-11

### Fix bet panel 3/4-pot raise + game lockup (Kevin)
- 3/4-pot raise used `minTo + pot*0.75` (overshot). Now `currentBet + pot*0.75`,
  clamped to legal range.
- If the engine rejects an amount, the game no longer locks up with disabled
  controls — it re-enables and lets you try again.

## [1.8.86] — 2026-10-10

### Fix empty coach recap after losing all-in (Kevin)
- Lost all-in with no recorded "strong" decision → recap returned null →
  placeholder "coach speaks up on your turn".
- Now always shows a message: "Tough loss — sometimes the cards don't
  cooperate."

## [1.8.85] — 2026-10-10

### Fix empty coach recap after winning by fold (Kevin)
- Raised preflop per coach, everyone folded, but recap was empty: none of
  the branches fired when won=true but no "strong" decision was recorded.
- Now `won && wonByFold` always shows a message ("Nice aggression! 🎉").

## [1.8.84] — 2026-10-10

### Fix default roster: Donald in, Station out, swimkev id (Kevin)
- Cash defaults were `['alice','swimkev',...]` — but the bot named "swimkev"
  has id `'lag'`, so `botById('swimkev')` failed silently and only 6 loaded.
- New cash: Alice, Donald, swimkev(lag), Rohan, Amogh, Nathan, Shark.
- Station removed from defaults. Same fix for tourney.

## [1.8.83] — 2026-10-10

### Fix: coach "You won!" when hero actually lost (live QA)
- Hand #7: hero shoved, lost 843 net, got 147 back as uncalled refund.
  `heroWon()` counted the refund as a win → "You won the hand! 🎉".
- Fix: `heroWon()` skips `uncalled` pots; hero must win a contested pot.

## [1.8.82] — 2026-10-10

### Fix CI: push missing test files
- v1.8.81 added sidepot-stress.js and allin-stress.js to the CI script but
  never pushed the files — CI failed with "Cannot find module". Pushed.

## [1.8.81] — 2026-10-10

### Test suite cleanup (Kevin: CI failure emails)
- Fixed 3 outdated tests: Rohan bluff (allows <5% aggression), roster order
  (alice,donald,lag,rohan), singular "1 hand" grammar.
- Added missing regression suites to CI: coach-scenarios (49 tests),
  session, sidepot-stress, allin-stress.
- Soak test: 100 hands in CI (was 300), full 300 via SOAK_HANDS=300.
- Removed dead diagnose-duplication.js.
- README: 80 versions, 14 archetypes.

## [1.8.80] — 2026-10-10

### Coach: don't fold to Donald's overbets as "the nuts"
- Donald (tight preflop) overbets draws and vulnerable top pairs, not just
  the nuts. Added `wideOverbet` flag; coach exempts him from the
  "tight overbet = nuts" auto-fold.

## [1.8.79] — 2026-10-10

### Exploit lines match new playstyles
- Rohan: "he bluffs sometimes so don't auto-fold" (was "never bluff").
- Donald: "His bets are often draws or big overbets when ahead".

## [1.8.78] — 2026-10-10

### Donald: semi-bluffs + Amogh-style bombs (Kevin)
- **Semi-bluffs draws often** (65% when checked to with a draw).
- **Bombs big when ahead but vulnerable** — top pair+ on wet boards gets
  1.5x-2.3x pot overbets like Amogh, instead of small value bets.

## [1.8.77] — 2026-10-10

### Bluff tuning (Kevin)
- **Rohan bluffs 15%.** Bluff moves flagged (`mv.bluff`); neverRaise gate
  lets bluffs through. Still a calling station otherwise.
- **Donald bluffs ~25%.** Bluff param 1.0 (22% heads-up after scaling).

## [1.8.76] — 2026-10-10

### New bots + Rohan bluffs (Kevin's request)
- **Rohan sometimes randomly bluffs.** Was pure calling station
  (`neverRaise` blocked everything). Now `bluffThrough: 0.30` lets ~30% of
  his rare aggressive moves through — mostly bluffs. Still calls everything.
- **New bot: Donald 🦆** (right below Alice). Tighter than Rohan preflop
  (openTier 2/3), but once in a pot he never folds (stubborn 0.90) and
  fires semi-bluffs with draws (bluff 0.20).

## [1.8.75] — 2026-10-10

### Fixed — contradiction + richer player reads (Kevin's screenshots)
- **"Fold" vs "great spot to raise" contradiction.** 3 limps then Shark
  raised to 55; coach said Fold T2o (correct) but the multiway note said
  "great spot to raise and take it down". `multiwayNote()` now suppresses
  the raise note once `currentBet > BB` — it's not dead money after a raise.
- **Table bullets now teach.** Each player shows the full exploit line
  (what the style means + how to beat it), not just the label. Added
  swimkev's line (was missing from EXPLOIT_LINES).

## [1.8.74] — 2026-10-10

### Fixed — three coach bugs from Kevin's phone screenshots
- **Made straight + flush redraw called "semi-bluff".** Kevin had 7cJc on
  9c3d8dTc (J-high straight + 4-flush). `handClass` checked flushDraw+OESD
  before made hands, returning 'draw-strong'. Now `ev.cat >= 4` is checked
  first — straight+ always classifies as 'nut' (value bet).
- **Table reads back to bullet points.** The compact inline format (v1.8.73)
  is now one-per-line bullets as Kevin prefers.
- **No solo villain read in multiway pots without an aggressor.** Coach said
  "swimkev's range..." and "vs swimkev:" in a 4-way pot where swimkev did
  nothing. `pickVillain` fell back to an arbitrary opponent. Now both the
  range note and vs-line are suppressed multiway unless someone bet/raised.

## [1.8.73] — 2026-10-10

### Fixed — table reads visible mid-hand again
- **Opponent play types show once per street.** Kevin: "coach doesnt show
  other players play type anymore mid turn." The v1.8.71 optimization showed
  the compact table reads only on the hand's first verdict; now they appear
  on the first verdict of each street (preflop/flop/turn/river).
- Regression check #18 updated in `tests/coach-scenarios.js`.

## [1.8.72] — 2026-10-10

### Fixed — version bump was missed on 6 pushes (critical)
- **All of today's fixes were invisible on phones.** Six commits pushed as
  "v1.8.71" without bumping the version, so the `?v=1.8.71` asset
  cache-busters never changed and browsers kept loading the stale cached
  JS. Bumped to 1.8.72 across `version.txt`, `APP_VERSION`, `package.json`,
  and all 16 asset URLs in `index.html`. Lesson: every push gets a version
  bump — the number IS the cache-busting mechanism.

## [1.8.71] — 2026-10-10

### Fixed — coach in limped multiway pots (from Kevin's live hand)
- **Iso-raise option for 2+ limpers in late/middle position.** Kevin's spot:
  A4o in MP with 2 limpers + dead money got a flat "fold" because the
  iso-raise gate required 3+ limpers on the button/cutoff. Now 2+ limpers in
  button/cutoff/middle with a playable hand (tier ≤ 5) offers the iso-raise
  as an option ("You can raise 4× to attack the dead money… Or fold; both
  are fine") instead of a bare fold.
- **No single-villain read in limped multiway pots.** The same hand showed
  "vs Amogh" with 4+ players in and no raise — a single read is noise there.
  The villain line is now suppressed for limped multiway pots (preflop, no
  raise yet, 4+ handed), not just 3+ limpers. Raised pots keep the aggressor
  read, where it matters.

### Fixed — engine stuck asking for action with everyone all-in (critical)
- **No betting round when nobody can act.** After Kevin called Amogh's
  turn shove, the river was dealt and hero was asked to act with 5 chips
  while Amogh was all-in — the hand couldn't reach showdown. `_bettingComplete`
  now ends the round with 0 actors, or with 1 actor who has no outstanding
  bet to match; a lone player still facing a bet keeps their call/fold.

### Fixed — range estimator misread big bets as 'wide' (from Kevin's live hand)
- **Bet sizing now measured vs pot-before-bet.** `estimateVillainRange` used
  `size/pot` where the timeline's pot includes the bet just made, so Amogh's
  225-into-135 flop overbet read as 0.625 → 'wide' → coach said "call" with
  ace-high and claimed "Amogh plays lots of hands or bluffs". True ratio is
  1.67 → polarized. Same reconstruction as `villainSizingTell`.
- **Polarized range from a non-bluffer treated as strong.** Amogh (bluff 0.15)
  shoving is not bluff-heavy: threshold now rises (+0.12) and equity is
  discounted (×0.75) instead of the reverse. The turn shove now reads as a
  clear fold, matching Kevin's live read that his ~3 outs were nearly dead.
- Regression checks #10–14 in `tests/coach-scenarios.js`.

### Fixed — recap, explanations, and message length (from Kevin's live hand)
- **Recap never says "well played" for a losing hand.** Following the coach's
  (wrong) flop call and losing 980 still earned praise. Praise is now gated
  on winning; losses get a neutral "tough loss — you stuck to the plan" note
  when no leak was found.
- **Pot odds in plain English.** "You need to win 38% of the time" → "Pot
  odds: calling 225 to win 360 — you need to win 38% of the time to break
  even." Beginners now see the price, the prize, and what the % means.
- **Bluff-catching explained.** When hero holds air facing a bet, the fold
  advice now names the concept: "Bluff-catching means calling with a hand
  that only wins if they're bluffing — like ace-high here."
- **Opponent reads shown once per hand, compact.** The full per-opponent
  scouting report repeated on every decision (600+ char messages). Now shown
  once (first verdict) as compact style tags: "🎯 Table: Alice (vault) ·
  Rohan (calling station) · …".
- **Hand log shows hole cards.** `finishHandRecord` now persists `allHands`
  (hero always, opponents if revealed at showdown); the Hands tab already
  rendered the grid but the data was never saved.
- Regression checks #15–19 in `tests/coach-scenarios.js`; 10-hand
  `coach-eval` audit loop re-run until clean.

### Fixed — cash roster topped up to 7 bots
- **Stale 6-bot rosters repaired.** Cash games showed 6 bots instead of 7
  (persisted `ps_roster_cash_v1`). `topUpRoster()` now fills cash/tournament
  rosters to the full 7 from mode defaults on load and mode switch — never
  removing a deliberate pick; heads-up untouched.
- Regression check #20 in `tests/coach-scenarios.js`.

### Fixed — hand history shows every player's cards
- **All hole cards in history, even folded.** Kevin: "i want to see all players
  hands in history, even if they folded early." `finishHandRecord` now reads
  every player's hole cards from the table at hand end (engine keeps them
  until the next hand) instead of only showdown-revealed ones. Netplay
  unaffected — unknown opponent cards still show "—".
- Regression check #17 updated in `tests/coach-scenarios.js`.

### Fixed — hand-end pause + longer auto-deal
- **Pause button.** The post-hand auto-deal can now be paused ("⏸ Pause" /
  "▶ Resume") to review the hand as long as wanted; resume continues from
  the remaining time.
- **Auto-deal 10s → 13s.** Three extra seconds before the next hand deals.
- Regression check #21 in `tests/coach-scenarios.js`.

### Fixed — confusing pot-odds message (Kevin's J4 vs Amogh)
- **Adjusted threshold now visible.** The message showed raw 41% needed, then
  said "fold" despite 52% equity — contradictory. When a strong range
  raises the bar, it now reads: "…you need 41% to break even (win this
  often and the call pays for itself over time) — but Amogh bets big with
  strong hands, so vs their range you need 53%, and you win about 52% vs
  that range."
- **Break-even explained inline** per Kevin's request.
- Regression check #22 in `tests/coach-scenarios.js`.

### Improved — win-% estimation explained, math line tightened
- **How the win % is calculated.** Per Kevin's request, the coach now notes
  the number is "played out vs random hands 150 times" and adjusted for the
  opponent's style ("lowered for their strength") — beginner-friendly and
  honest about what it assumes.
- **Tighter phrasing.** The three explainers (break-even, adjusted bar,
  simulation) were bloating messages past 600 chars; rewritten concisely to
  stay under the 400-char loop budget.
- Regression check #23 in `tests/coach-scenarios.js`.

## [1.8.70] — 2026-10-10

### Docs — README upgrades for hiring-manager review
- **New "By the numbers"**: 69 versions shipped, 1,800+ tests, 11 archetypes,
  0 deps, 4 ADRs, 3 coach-audit rounds.
- **New "Why this stack"**: one-line rationale per major decision, linked to ADRs.
- **New "What I learned (and what I'd do differently)"**: silent-failure lesson
  from the posName bug class, composition-vs-unit testing, scope-cutting, and
  what TypeScript/mobile-first would have changed.
- **Screenshot + demo-video placeholders**: `docs/screenshots/README.md` with
  exact capture instructions (1 desktop + 1 mobile + optional GIF); commented
  lines in README ready to uncomment.

## [1.8.69] — 2026-10-09

### Fixed — copy bugs from FANG audit
- **Bots page**: Rohan description "neverRaise converts" → "the neverRaise flag converts" (missing space).
- **Stats**: "1 hands · won 0" → "1 hand · won 0" (grammar).
- **Hand log**: Added non-breaking space before hand name in win messages to prevent "wins 50Pair of Kings" concatenation.

## [1.8.68] — 2026-10-09

### Fixed — CRITICAL: posName undefined in coachPostflop (blank coach on checked streets)
- **Root cause of "coach absent on checked-around streets"**: `coachPostflop()`
  didn't destructure `posName` from context, but the air-bluff branch reads it
  (`checkedAround = table.currentBet === 0 && (posName === 'button' || ...)`).
  Same bug class as v1.8.65's preflop fix. Whenever hero had air postflop with
  no bet to face, the ReferenceError was swallowed by coachVerdict's try/catch
  and the coach panel went blank — 12 of 15 such spots in a jsdom gameplay
  repro. One-line fix: destructure `posName` in `coachPostflop`.
- **Regression test**: `tests/coach-scenarios.js` check #9 (static, mirrors the
  v1.8.65 preflop check; verified it fails without the fix). Behavioral repro
  confirms 0 blanked spots after the fix.
- **Pre-existing test failures fixed**: `tests/test.js` exploit-line assertions
  for maniac/rock used case-sensitive regexes (`/trap/`, `/steal/`) but the
  lines begin "Trap…"/"Steal…". Made the two regexes case-insensitive — test
  intent unchanged, no user-facing text altered.
- Tests: 22 coach-advice + 17 scenarios + full `npm test`, all passing.

## [1.8.67] — 2026-10-09

### Docs — loop hardening for Tuesday automation
- **Known issues documented**: coach text duplication (under investigation),
  absent on checked-around streets (decision needed).
- **Automation plan updated**: Phase 0 fast static checks (scenarios + unit +
  lint) before browser audit; duplication check as P0; 60s CDN wait in verify.
- Tests: 22 coach-advice + 15 scenarios, all passing.

## [1.8.66] — 2026-10-09

### Hardening — unified decision tracking + scenario verification
- **Leak tracker respects coach**: if the coach advised the action, the leak
  tracker no longer flags it. Coach, leak tracker, and recap now agree —
  no more "math says call" vs "calling too loose" contradictions.
- **Node scenario verification**: `tests/coach-scenarios.js` runs 15 static
  checks without a browser (limpers branch, posName, handClass, jargon,
  debug hooks). Run via `node tests/coach-scenarios.js`.
- Tests: 22 coach-advice + 15 scenarios, all passing.

## [1.8.65] — 2026-10-09

### Fixed — CRITICAL: posName undefined in coachPreflop
- **Root cause of silent coach failure**: `coachPreflop()` didn't destructure
  `posName` from context. The iso-raise code referenced undefined `posName` →
  ReferenceError → try/catch → null → blank coach panel on 3+ limpers.
- This is why v1.8.63 still showed the bug — the branch condition was fixed
  but the variable was undefined.

## [1.8.64] — 2026-10-09

### Hardening — coach audit loop improvements
- **Error surfacing**: coach try/catch now logs to console in debug mode
  (`?coachdebug=1` or `window.__coachDebug=true`) and returns the error in
  the verdict object instead of silently returning null.
- **Test hooks**: `window.__coachTestHooks.testScenario()` and `.enableDebug()`
  for programmatic coach verification.
- **Regression tests**: 3+ limpers branch condition tested (nRaises===0 &&
  limpers>0); raise-blocks-limpers verified.
- Tests: 22 passed (20 + 2 new).

## [1.8.63] — 2026-10-09

### Fixed — second audit (critical rendering bug + 4 more)
From second 5-hand live audit:

**CRITICAL:**
- **Coach silent on 3+ limpers**: the limpers branch required `spot === 'open'`,
  but limpers are `spot === 'facing-open'`. Coach returned null → silent failure.
  Fixed to check `nRaises === 0 && countLimpers() > 0` directly.

**HIGH:**
- **Limpers vs raise priority**: 1 limp + raise was showing "isolate limpers"
  instead of facing-raise logic. Fixed by the nRaises check above.

**MEDIUM:**
- **Trash filter**: 52o was getting "the math says call" (37% raw equity).
  Added tier >= 6 instant fold — raw equity lies for trash hands.

**LOW:**
- **"3-bet" jargon**: remaining instances → "re-raise".
- **Loop docs**: updated `docs/coach-improvement-loop.md` with audit process
  improvements (absent-coach protocol, no mid-hand code reading, rare-spot hunting).

## [1.8.62] — 2026-10-09

### Fixed — 5-hand coach audit (11 issues)
From systematic live audit of 5 full hands:

**HIGH:**
- **Limp counter fixed**: `countLimpers()` was counting calls of raises as limps.
  83s facing a 3-bet got "great spot to raise and take it down" — dangerous.
  Now only counts calls made before any raise.
- **Board pair ≠ hero pair**: J-high on a paired board was called "weak pair".
  Now correctly identifies when hero doesn't hold the paired card → "air".

**MEDIUM:**
- **No semi-bluffs multiway**: was suggesting semi-bluffs while also saying
  "bluffs rarely work multiway". Now checks multiway draws.
- **Player count**: "5-way pot" with 6 players — was counting opponents, not total.
- **Rohan contradiction**: vs-line said "calling station", bullet said "tricky player".
  Added friend-bot archetypes (Alice=the vault, Rohan=calling station, etc.)

**LOW:**
- **Jargon removed**: "3-bet range" → "re-raise", "TAG poker" → "tight players",
  "solid TAG" → "play straightforward", "unreadable" → "hard to read".
- **Grammar**: "You're on the middle position" → "You're in middle position".
- **Board texture**: 4-flush board no longer says "make draws pay to chase"
  (the draw already completed).

## [1.8.61] — 2026-10-09

### Docs — coach methodology + competitive analysis
- **README**: Rewrote "How the coach works" with FANG-style improvement
  methodology — human-in-the-loop verification cycle, 5 audit criteria,
  bug→test→fix workflow with real examples.
- **New docs**: `docs/competitive-analysis-2026-10-09.md` (SparringPoker
  comparison, 5 learnings, prioritized roadmap) and
  `docs/coach-improvement-loop.md` (Tuesday automation plan).

## [1.8.60] — 2026-10-09

### Fixed — coach no longer value-bets bottom pair
- **Hand classification bug**: ANY non-top pair was called "second pair".
  K7 on A-Q-8-7-5 (bottom pair) was getting "second pair is usually best here"
  + a half-pot bet suggestion. Now properly distinguishes second pair from
  third pair or worse ("weak pair").
- **Weak pair = give up**: third pair or worse now gets "Check — a weak pair
  is rarely best here. Don't throw good money after bad." The coach knows
  when to let go instead of value-betting into trappers.

## [1.8.59] — 2026-10-09

### Changed — opponent reads explain player types for beginners
- **Descriptive reads**: "Station: never bluff them, value-bet big" →
  "Station: calling station — calls with any pair or draw, never folds.
  Don't bluff; bet big for value when you have it."
- All 12 archetypes now explain WHAT the player type means, not just
  the exploit. New users can understand "maniac", "rock", "calling station",
  etc. without poker background.

## [1.8.58] — 2026-10-09

### Changed — coach less rigid, more options
- **Iso-raise as option**: "You can raise 4× to punish the limpers... Or call
  behind; both are fine. Mix in the raise sometimes." — not a command.
- **Flop check-around steals**: when everyone checks to you on the button/
  cutoff, coach now suggests a bluff even multiway ("everyone checked to you").
  The bar is lower because checked-around weakness is a green light.

## [1.8.57] — 2026-10-09

### Changed — coach multiway awareness + cleaner opponent reads
- **Multiway pots**: with 3+ limpers preflop, coach now leads with
  "👥 3 limpers in the pot (45 dead money) — great spot to raise and take it down."
  instead of focusing on a single villain. Postflop 4-way+ pots get
  "bluffs rarely work multiway; bet only for value."
- **Opponent reads as bullet points**: no more mashed-up single line —
  each opponent gets their own bullet (• Alice: tricky — play straightforward).
- **No single-villain focus in limped pots**: the "vs X:" line is skipped
  when 3+ limpers are in, since the situation is about the crowd.

## [1.8.56] — 2026-10-09

### Changed — coach now suggests iso-raise bluffs
- **Punish limpers**: with 3+ limpers on the button/cutoff, coach now suggests
  <b>Raise 4×</b> as an iso-raise bluff with any playable hand (tier 5+) —
  the dead money + fold equity + position makes it profitable long-term.
- **Recap fix**: winning by fold no longer shows a contradictory "tighten up"
  lecture. Iso-raise wins get "Nice iso-raise! 🎉 You punished the limpers
  and took the dead money."
- **Jargon**: "3-bet strong hands, never float light" → "re-raise strong hands,
  never call light".

## [1.8.55] — 2026-10-09

### Changed — cash game defaults to 7 opponents
- **Full table by default**: cash games now default to 7 opponents (Alice,
  swimkev, Rohan, Amogh, Nathan, Shark, Station) instead of 3.

## [1.8.54] — 2026-10-09

### Fixed — Skip button UI state
- **Skip now disables controls** when folding the hero's hand (was leaving
  Fold/Call/Raise buttons enabled, causing a "glitched" error notice).
- **Safer bot fast-forward**: wrapped the immediate bot action in try/catch
  so a bad bot decision can't break the hand.

## [1.8.53] — 2026-10-09

### Changed — tournament blinds now double every level
- **Pure doubling**: L1 5/10 → L2 10/20 → L3 20/40 → L4 40/80, etc.
  Simple, predictable, and creates good practice pressure with 8-hand levels.
- **Antes from level 4**: standard tournament antes (BB/8) kick in at L4.

## [1.8.52] — 2026-10-09

### Fixed
- **Skip button**: now immediately advances past bot thinking delays instead of
  appearing to do nothing. Bot actions trigger instantly on skip.
- **Coach jargon**: "3-bet your strong ones" → "re-raise your strong ones";
  "solid TAG" → "strong tight-aggressive player".

### Changed — per-mode rosters
- **Each mode remembers its own opponents**: cash and tournament now have
  independent selections. Switching modes no longer carries the other mode's
  picks. Tournament defaults to 7 opponents; cash defaults to 3.

## [1.8.51] — 2026-10-09

### Changed — tournament requirements & payouts
- **Full table required**: tournaments now need 8 players (you + 7 opponents)
  for realistic bubble and ICM dynamics. Starting with fewer shows a prompt.
- **Top 3 payout display**: tournament end now shows 🥇🥈🥉 placements with
  50/30/20 prize pool split.

### Changed — tournament-aware coach
- **Stage tips**: coach now shows stage-specific guidance — Early (play like cash),
  Middle (steal more), 🫧 Bubble (3 paid! tighten/bully), 🏁 Final 3 (survival).
- **Simpler language**: removed MDF, "implied odds", "reverse implied odds" —
  replaced with plain explanations. "Leak to fix" → "To improve".

## [1.8.50] — 2026-10-09

### Fixed — bot selection across modes
- **Stale picks pruned on load**: switching from tournament to cash no longer
  leaves tournament bots in the selection blocking new picks, and startGame
  can no longer launch a cash game with tournament bots.

### Changed — tournament bots
- **Renamed**: Grinder→Pro, Bubble→Nit (cleaner, more professional).
- **New**: Bully (big-stack ICM pressure) and Gambler (Harrington-style super
  aggressive) — researched from tournament literature for realistic practice.

### Changed — coach recognizes semi-bluffs
- **Semi-bluff praise**: winning with a strong draw + aggression now says
  "Nice semi-bluff! 🎉" instead of just flagging the deviation.

### Fixed — tournament blinds
- **Tournament now starts at your configured blinds** (e.g. 5/10) instead of
  jumping to hardcoded 10/20. Blind levels scale from your SB/BB setting.
- **Setup screen clarifies**: tournament mode now shows "🏆 Tournament: starts
  at X/Y, blinds go up every N hands" under the settings.

### Changed — simpler coach language
- **Beginner-friendly wording**: replaced jargon like "equity", "range",
  "polarized", "SPR", "ICM", "3-bet", "fold equity", "variance", "pot odds"
  with plain language (e.g. "chance of winning", "re-raise", "be a bit tighter
  in tournaments"). "Leak to fix" → "To improve".

## [1.8.49] — 2026-10-09

### Changed — bot roster by game type
- **Tournament mode is back** — always visible, no longer behind a flag.
- **Separate default bots per game type**: cash shows Shark/Station/Maniac/Rock;
  tournament shows Grinder/Bubble. Alice, friends, and custom bots appear in
  every mode. Switching modes prunes unavailable bots from the selection.
- **Alice moved to the top** of the roster, ahead of custom bots.
- **Shorter classic names**: TAG Shark→Shark, Calling Station→Station,
  The Maniac→Maniac, The Rock→Rock, The Grinder→Grinder, Bubble Boy→Bubble.

### Changed — coach celebrates wins
- **Win-aware recap**: ignoring the coach but winning now leads with praise
  ("Bluff worked! 🎉" for fold-wins, "You won the hand! 🎉" otherwise), with
  the leak to fix below it. Losses keep the direct "Leak to fix" framing.
- **Cleaner opponent reads**: 1-2 opponents get one style note per line;
  3+ stay compact. Style notes rewritten in plain beginner language.

## [1.8.48] — 2026-10-09

### Changed — code quality & debloat pass
- **ESLint gate added** (`eslint.config.js`, dev-only): catches unused vars,
  unreachable code, and redeclarations. Full codebase now lint-clean.
- **Dead code removed**: unused `foldEquityNote` coach helper, 9 orphaned CSS
  classes, dead `advancedStats` feature flag, unused catch params (76× `catch
  {`), dead stores in online/evaluator/test files.
- **Fixed**: `index.html` cache-busters now track the version (v1.8.47 shipped
  with stale `?v=1.8.46` — caught by the component suite).
- **README**: added "How the coach works (and how it gets better)" and "Fair
  dealing" sections — honest docs on the rules-engine coach, the daily
  improvement loop, and CSPRNG shuffling.

## [1.8.47] — 2026-10-08

### Changed — solver-grade coach upgrade
- **Minimum defense frequency**: facing a bet, the coach now shows the MDF
  (`pot / (pot + bet)`) alongside your pot-odds math.
- **Tournament ICM**: a risk premium (4–12% by stack depth) is added to the
  equity you need near pay jumps, with a plain-English "tournament tax" note.
- **Short-stack push/fold**: at ≤12bb in tournaments the coach switches to
  shove-or-fold using the built-in push/fold chart — no more flat-calling
  short.
- **River population prior**: rivers are under-bluffed at these stakes, so the
  coach over-folds slightly to river aggression (unless villain is a known
  bluffer).
- **Blocker-aware bluffs**: holding the nut-flush blocker is now cited as a
  reason to bluff.
- **Bubble exploitation**: as the big stack in a tournament, the coach widens
  steal raises — medium stacks must over-fold to survive.
- Fixed a missing space in the coach's math line ("here. Math says").

### Changed
- **README rewrite**: current feature set (11 bots, 1,800+ tests, session
  resume, solver-informed coach), outdated info removed.

## [1.8.46] — 2026-10-08

### Added
- **Resume offline session**: leaving the page no longer loses your game.
  Stacks (yours and every bot's) are saved after each hand and best-effort
  when the page closes; the setup screen now offers a "Resume last session"
  button (with hand number, mode, your chip count, and save time) that
  restores the exact stacks, blinds, and tournament level. Mid-hand exits
  forfeit the dead hand — a fresh hand starts with the same chips.

## [1.8.45] — 2026-10-08

### Added
- New prebuilt bot **Alice** ("The vault"): ultra-safe, never bluffs, folds
  almost every weak starting hand, sizes value bets unpredictably (small or
  big), disciplined folds, and almost always calls with two pair or better.
  Very hard to win money from. Coach exploit line included.

### Changed
- Named bots play slightly more hands (one tier looser each: swimkev, Rohan,
  Amogh, Nathan, The Grinder, Bubble Boy, TAG Shark). The classic training
  archetypes (Calling Station, The Maniac, The Rock) are untouched.

### Fixed
- **Mobile raise panel**: on phones it slid under the bottom tab bar, hiding
  Confirm/Cancel with no way out. It is now a compact fixed dialog centered
  on the felt (fully visible, always tappable). Desktop unchanged.
- **Mobile dark-mode bottom seam**: the tab bar height and the hero-bar
  offset now share one variable, so no gap/overlap line shows between them.

## [1.8.44] — 2026-10-08

### Removed
- The "New version available" update toast: it was unreliable (Kevin). The
  footer "Check for updates" button remains the single update path.

### Fixed
- Typeable bet amount was rendering in near-black on the always-dark bet
  panel (light theme's `--gold` is dark bronze). It now uses a fixed light
  gold readable in both themes.

## [1.8.43] — 2026-10-08

### Fixed
- Coach: second pair (e.g. QQ on an Ace-high flop) was labeled a "Bluff" — it
  fell through to the air-ball branch. It now gets its own thin-value/
  protection guidance ("Bet ~½ pot — second pair is usually best here…")
  heads-up with a reason, else a pot-control check.

## [1.8.42] — 2026-10-08

### Fixed
- Raise slider topped out at ~10% of the legal range (e.g. 124 of a 1,060 max):
  the HTML slider was `max="100"` while the JS divided by 1000. Now `max="1000"`,
  so the slider spans the full [min, all-in] range.
- Bet amount is now typeable: the amount field accepts exact chip counts
  (numeric keyboard on mobile), clamps to the legal range, syncs both ways
  with the slider, and Enter confirms.

### Changed
- Hand-end auto-deal countdown shortened 16s → 10s.

## [1.8.41] — 2026-10-08

### Changed — coach upgrade (poker theory deep dive)
- New concepts: SPR + commitment guidance ("SPR ~2, you're committed with top
  pair"), implied odds (deep stacks vs paying opponents), reverse implied odds
  (non-nut draws vs tight ranges), range reading from the hand's action history
  (callers capped, raisers strong, overbets polarized), blind-steal spots, and
  villain sizing tells (tiny bet = weak, overbet from a nit = nuts).
- Fixed 3 advice bugs: facing a 3-bet no longer mislabeled as a 3-bet spot
  (proper 4-bet branch: premiums 4-bet ~2.3x, marginal broadways fold);
  3-bet sizing is now 3x in position / 4x out of position; equity is computed
  vs the villain's range (not random hands) when facing aggression.
- Premiums never fold to a single all-in 3-bet/4-bet (was: fell through to fold).
- All tips rewritten in beginner-friendly language; jargon gets a one-clause
  explanation inline. Coach stays honestly labeled as heuristics, not a solver.
- Post-hand recap: at most one praise line + one leak to fix, shown in the
  coach box after each hand, in the Coach tab, and in the hand story history.
- New 10-hand eval harness (`tests/coach-eval.js`): auto-plays 10 hands, flags
  illegal advice, math errors, contradictions, and tone problems — clean.
- New unit tests: SPR/implied/RIO helpers, recap builder, update-flow kept green.

## [1.8.40] — 2026-10-08

### Changed
- Hand-end result is now an ephemeral **win splash** (PokerStars/GGPoker-style)
  instead of the blocking popup: a single pill-shaped line ("🏆 You win 1,200!")
  centered on the felt that fades on its own after ~3s. No close button, and
  `pointer-events: none` so it never blocks the board. The per-pot breakdown
  stays in the hand log and the topbar "Last:" chip. Online multiplayer uses
  the same splash.

## [1.8.39] — 2026-10-08

### Fixed
- Mobile seat names truncated ("The Gri…", "realswi…"): seat boxes slightly
  wider (72px max, was 64px) and names slightly smaller (0.55rem, was 0.6rem),
  so full names fit; ellipsis remains as the backstop for very long names.

## [1.8.38] — 2026-10-08

### Fixed
- Mobile felt layout (iPhone): the hero bar is `position: fixed` and covers
  the bottom ~30% of the felt, which buried the pot pill, community cards,
  and hero seat behind it. The board (pot + community) moved to 32% (visual
  middle), the pot pill flows in place instead of absolute-positioning down
  inside the board, and the mobile seat ring shifted up (hero at 54%) to
  clear the betting panel. Desktop unchanged.

## [1.8.37] — 2026-10-08

### Fixed
- "Check for updates" reload now navigates with the new version in the URL
  (`?v=<new>`) instead of `location.reload()` — the old reload kept the stale
  `?v=` param in the address bar, so the URL still showed the previous version.
- Seat boxes expand to fit their content (`width: max-content`, up to 170px on
  desktop) instead of clipping: v1.8.36's `overflow: hidden` cut off the dealer
  button and SB/BB badges, which intentionally overlap the seat edge. Long
  names truncate with an ellipsis; avatar and badges are never clipped.

## [1.8.36] — 2026-10-08

### Fixed
- Seat emoji overflow: boxes now clip content properly.
- Mobile bottom bar compact: 36×50 hero cards, 32px buttons, more felt room.

## [1.8.35] — 2026-10-08

### Fixed
- Desktop seats compact: 88-100px wide (was 118px), smaller text, action text hidden (in hand log). Felt taller (520px). No more overlaps.

## [1.8.33] — 2026-10-08

### Changed
- Shuffle now uses a CSPRNG (`crypto.getRandomValues` in browser, Node `crypto`
  in tests) instead of `Math.random`, with rejection sampling for unbiased
  Fisher-Yates indices — the browser-side equivalent of how regulated sites
  (e.g. PokerStars' GLI-certified quantum RNG) seed shuffles from strong
  entropy. The whole deck is still shuffled once before the hand and never
  re-dealt. Legacy caller-supplied rng param kept for deterministic tests.
- New shuffle tests: 52-unique-cards invariant, chi-square uniformity of the
  first-card rank over 6,500 shuffles, all 52 cards dealt over 500 hands,
  `randInt` uniformity, seeded-rng determinism.

## [1.8.32] — 2026-10-08

### Fixed
- Desktop seat layout: 8 seats now use explicit evenly-spaced positions (was ellipse math causing overlaps on left/right sides).

## [1.8.30] — 2026-10-08

### Fixed
- Mobile seat layout: 8 seats now use explicit evenly-spaced positions instead of ellipse math. No more squished/overlapping seats on left and right sides.

## [1.8.29] — 2026-10-08

### Changed
- Pocket pairs never fold preflop to normal bets — any pair is always playable. Only vs all-ins do small pairs sometimes fold.
- Added "Check for updates" button in footer for manual version checks during live testing.

## [1.8.28] — 2026-10-08

### Changed
- Homepage simplified: removed duplicate "▶ Play" button. Now one clear "♠️ Deal me in" CTA at top and bottom (identical). Less redundant, cleaner for recruiters.
- Amogh now always raises QQ+ first-in (was 20%).

## [1.8.27] — 2026-10-08

### Fixed
- Bot preflop realism: tier-1 hands (QQ+, AKs) never fold preflop — vs a single
  open they 3-bet or call; vs a 3-bet they 4-bet or flat. Tier-2 hands
  (JJ-TT, AKo, AQs/AJs/KQs) also never fold to a single 3-bet at 100bb
  (TAGs were folding JJ/AKo ~77% of the time — same leak class).
  (Amogh folding KK preflop was the reported bug.)
- 4-bets now sized ~2.3x the 3-bet instead of automatic all-in shoves.
- C-bet/value sizing standardized to half-pot through three-quarter-pot.
- Early position plays a tier tighter facing a raise; blinds keep pot-odds defense.
- Short-SPR + strong equity hands commit instead of playing turns/rivers.
- Amogh bombs monsters 70% facing a raise, 20% first-in (was 90% always).

## [1.8.25] — 2026-10-08

### Fixed
- Roster restore no longer caps opponents at 5 when switching game modes.

## [1.8.24] — 2026-10-08

### Changed
- Smaller hero cards (44x62), more compact buttons, pot pinned center-table,
  opponent bet badges visible, "Your turn" text hidden on mobile.

## [1.8.23] — 2026-10-08

### Changed
- Ultra-minimalist mobile design: 56px seats, smaller text, even spacing.

## [1.8.22] — 2026-10-08

### Fixed
- Seat ellipse compressed so all 8 seats visible above the action bar.
- Turn status made compact; max opponents raised to 7.

## [1.8.21] — 2026-10-08

### Changed
- Table rewrite: fixed 8-seat layout (empty seats show as dimmed "Open" placeholders).
- Opponent seats are cardless mid-hand (avatar + name + stack only); cards expand inline face-up at hand end or on voluntary show.
- Hero cards moved to a dedicated always-visible strip (`#hero-cards`) above the action bar; seat-0 on the felt is cardless.
- CSS cleanup: deleted 5 competing seat-card size rules + dead `#seat-0 .pcards` / `#screen-table .hero-cards` overrides; one consolidated TABLE REWRITE block is the single source of truth.
- Hand-end controls: inline in the hero bar on mobile, falling back to the winner banner.

## [1.8.20] — 2026-10-08

### Fixed
- Hero cards visibility (seat moved up, action bar compacted).
- Action button color contrast (fold red, call green, raise gold).

## [1.8.19] — 2026-10-08

### Changed
- PokerNow-style hand end: no blocking modal. Small toast + inline "Next hand" button. All hands revealed face-up at showdown.
- Hero seat moved up (62%) — cards no longer hidden behind action bar.

## [1.8.18] — 2026-10-08

### Changed
- Modern v2 redesign: floating minimal seats, clean felt, refined cards/buttons/tab bar. Muse-clean aesthetic.

## [1.8.17] — 2026-10-08

### Changed
- Modern Muse-clean mobile redesign: softer felt, minimal seats with blur, clean action buttons, elegant winner toast.

## [1.8.16] — 2026-10-08

### Fixed
- Hero seat cards now 56×78 (were 20×30) — the 72×100 rule was targeting the wrong element (.hero-cards instead of #seat-0 .pcards).
- Winner banner redesigned as a compact dismissible toast at the top — no longer blocks the table.

## [1.8.15] — 2026-10-08

### Fixed
- Pot/board moved lower (55% desktop, 58% mobile) — no longer overlaps the top seat.
- Raise bet-panel now opens above the hero seat instead of covering hero cards.

## [1.8.14] — 2026-10-08

### Fixed
- Stats → Recent hands showed wrong suits on every row (hearts/diamonds transposed in the suit-letter map). Hands view was always correct.
- Stats per-hand P/L now includes blind/ante postings. Previously the baseline was snapshotted after blinds were posted, so folding the BB showed 0 instead of −10. (This was the shape of the reported "loss on the wrong row" — a systematic blind exclusion, not a row shift.)
- Stats "Won X" label now shows what the hero actually won (side-pot wins no longer display the full pot).
- Grammar: "You take back" instead of "You takes back" in hand log and topbar result.
- Lobby: the ▶ Play hint's bot count is now live ("vs 4 bots") instead of a hardcoded "vs 3 bots"; subtitle no longer advertises flag-hidden modes (tournament, heads-up, push/fold).
- Lobby blind inputs no longer flag valid values as invalid (`step=5` made the 5/10 defaults themselves fail validation; now `step=1`).

## [1.8.13] — 2026-10-08

### Fixed
- Safari: pot no longer covered by top seat (CSS stacking context fix — z-index on #board-area, not just .pot).
- Mobile hero cards redesigned PokerNow-style: bigger cards (72×100), smaller cleaner text, overflow hidden.
- Removed cut-off action text under seats ("Amogh c...") — redundant with hand history.
- Mobile action buttons now 44px touch targets with better spacing.

### Added
- Feature flags: advanced modes (tournament, heads-up, push/fold) hidden by default. Enable via `enableFlag('name')` or `?flags=name`.
- Coach now position-aware ("You're on the button") with multi-opponent reads.
- Coach naturally accounts for suitedness and multi-way pots in its reasoning.

## [1.8.12] — 2026-10-07

### Fixed
- Pot pill now paints above seats on full tables (was partially hidden behind a seat in 6-max).
- Stale "Last:" result from a previous session no longer lingers in the table topbar when starting a new game.
- Safari fallbacks: `100vh` before `100dvh`, `-webkit-backdrop-filter` for the modal overlay (`:has()` and `dvh` need Safari 15.4+; `env(safe-area-inset-*)` already used).

## [1.8.11] — 2026-10-07

### Added
- Phone bottom tab bar: 🃏 Table, 💡 Coach, 📖 History, ☰ Menu with slide-up panels. No more scrolling to find the hand log or coach tips.

### Fixed
- Folded cards are no longer removed — you always see your own hand, even mid-hand after folding.
- Compact phone table: smaller cards/text that fits the viewport (PokerNow-style).
- Fixed dead CSS selectors that left the action bar covering content.

## [1.8.10] — 2026-10-07

### Fixed
- Phone: action buttons now stay pinned to the bottom of the screen (were scrolling away mid-hand).
- You always see your own cards, even after folding (folding hides them from the table, not from you).
- Mock-mode "Create table" crash fixed (`myEmoji` → `loadEmoji`).
- Returning to the tab after switching apps now auto-reconnects (was stranding players).
- Sitting out mid-hand no longer corrupts the hand ("Seat undefined wins").

## [1.8.9] — 2026-10-07

### Fixed
- Online "Show my cards" button now appears correctly (hole cards cached).
- Online seats show emoji in mock mode too.
- Bankroll chip now actually shows lifetime profit (was stuck at 0).
- Hand history grid renders everyone's cards correctly (was blank).
- "Pair of Sixes" typo fixed.

## [1.8.8] — 2026-10-07

### Added
- **Show your cards (online)** — PokerNow-style: after a hand, tap "👁 Show my
  cards" to voluntarily reveal your mucked hand to the table.
- **Stats hand history** — last 10 hands, each expandable with game mode and a
  "▶ Replay hand" button that opens the hand replayer.

### Fixed
- **Bankroll chip** now shows lifetime profit (persists across refreshes)
  instead of resetting to 0.

## [1.8.7] — 2026-10-07

### Changed
- **Friend bots play looser** — swimkev, Rohan, Amogh, and Nathan now call
  wider when the price is small relative to their stack (40 chips from 3000
  is nothing), and size up their bets a bit. More like a real friendly game.

## [1.8.6] — 2026-10-07

### Added
- **Tournament blind interval** — choose how often blinds go up (default 8 hands).
- **Tournament rebuys** — optional; busted players (you + bots) can buy back in.

### Fixed
- **Collapsible result banner** — hand results now start as a slim bar; tap to
  expand details, tap again to collapse. Never blocks the board, never
  disappears until the next hand. Same for online.
- Round-bets example now uses 27 (not 67).

## [1.8.5] — 2026-10-07

### Fixed (mobile UX audit)
- Logo now taps back to home.
- Action buttons stick to the bottom on phones — no more scrolling to find
  Fold/Call/Raise.
- Nav tabs get a fade hint so it's obvious they scroll.
- Bigger touch targets: bet slider thumb, bot rename, stat info, banner
  dismiss.
- In-game topbar wraps cleanly on small screens.
- Escape closes the Feedback modal.

## [1.8.4] — 2026-10-07

### Fixed
- **Hand history redesign**: everyone's hole cards now show in an organized
  grid at the top (not scattered), result box uses readable colors in both
  themes.
- **Update toast is dismissible**: tap ✕ to finish your hand first; it reminds
  you again in 30 minutes. Online tables auto-rejoin by name after refresh.

## [1.8.3] — 2026-10-07

### Fixed — mobile table UX
- **Board no longer covered on mobile**: compact seat badges, smaller cards,
  and a taller felt keep all 5 community cards visible even 8-handed.
- **Winner banner is dismissible**: tap ✕ to see the board behind it; also
  more compact on small screens.

## [1.8.2] — 2026-10-07

### Added
- **SB/BB position badges**: the small blind and big blind seats now show
  SB/BB pills next to the name (offline and online), matching the dealer
  button style — no more guessing who posted.
- **Pick your emoji**: choose the avatar shown above your seat — a picker on
  the home screen and in the online lobby (30 options, saved locally). Your
  pick travels with you to online tables via the relay.

### Fixed
- **Bet panel opens at the minimum**: tapping Bet/Raise now starts the slider
  at the min legal amount instead of ¾ pot — slide up from there.
- **Worker: chat in lobby snapshots** (`getLobby` now includes the last 50
  messages, like the game snapshot) and **no more double feed lines** on
  timer auto-actions.
- **Worker: `sbIdx`/`bbIdx` in snapshots** so online clients can render
  blind badges; player `emoji` round-trips through join → snapshot.

## [1.8.0] — 2026-10-07

### Added — multiplayer round (PokerNow comparison)
- **💬 Table chat** in online lobbies and games: 200-char messages, server
  relayed, last 50 kept. The #1 thing that makes multiplayer feel alive.
- **Online rebuy**: busted (or short) players top back up to the starting
  stack mid-game; buy-in count tracked per player.
- **📊 Session ledger** (online): per-player buy-ins, stack, and net — the
  trust layer for settling up with friends.
- **"Join sitting out"** checkbox: join a running table as a spectator without
  being dealt in.
- **Host migration**: if the host's connection drops (not a clean leave), a
  connected player who hits Start takes the crown instead of the room
  soft-locking. Transient drops don't strip the host.

## [1.7.3] — 2026-10-07

### Fixed — hiring-manager review round (10 bugs)
- **Stats "Record vs archetypes"**: dropped the misleading split-profit
  attribution (identical figures across archetypes) — rows now show
  hands / won / win%, which is the honest per-archetype signal.
- **Roster selection persists** across reloads (mode/username/renames already
  did); stale ids are dropped. Roster card clicks now notify the app so the
  count, quick-start hint, and saved selection stay in sync.
- **Coach vs stations**: pure-bluff suggestions are suppressed when the
  villain rarely folds; Rohan's stubbornness raised (0.55 → 0.80) to match
  his "calls everything, never bluff him" persona.
- **Bot preflop defense**: maniacs complete the SB heads-up getting 3:1
  instead of folding trash; all bots defend vs min-raises instead of
  over-folding speculative hands.
- **Duplicate bot names rejected** in the custom-bot builder (roster rename
  already guarded).
- **CSS**: defined the missing `--line` variable (hand-history modal borders).
- **Glossary**: Tilt entry no longer claims "the bots never tilt" — they do
  (🌡️ badge), and that's the lesson.

## [1.7.2] — 2026-10-07

### Added
- **💬 Feedback button** in the nav: a small form (Bug / Idea / General,
  title, details) that opens a pre-filled GitHub issue in a new tab —
  version, browser, and screen size are attached automatically. Zero backend.

## [1.7.1] — 2026-10-07

### Fixed — restored features lost in a stash mishap
- **Multiplayer sit-out/back-in:** the Sit out button, seat badges, blind/action
  skipping, mid-hand fold, and all-in pot eligibility are back, with the worker
  protocol (`{t:'sitout'}`) and 32 netplay + 3 worker regression tests.
- **In-table hand history:** the 📖 button opens past hands mid-game again;
  the story HTML is now one shared function used by both the modal and the
  Hands tab.
- **Raise UX:** the raise panel again opens at the minimum legal raise with a
  Min quick button; opening bets still default to ¾ pot.
- **Results pacing:** the hand-end pause is 16 seconds again (was 6), and the
  winner banner is docked at the bottom so the board stays visible.
- **Bankroll pill:** Reset Stats and hero rebuy now zero the session pill
  immediately.

## [1.7.0] — 2026-10-07

### Added — bot realism: rebuys, tilt, tournament pros, thinking explainer
- **Bot rebuys with seat counters (PokerNow-style):** busted bots buy back in
  based on their rebuy tendency (Maniac always, Rock rarely), with a ×N badge
  on their seat and a hand-log line. Toggleable in Table settings; a bot that
  declines leaves the table.
- **Tilt meter:** bad beats (strong hand cracked at showdown), big-pot losses,
  and bust-outs steam bots up; wins and time cool them off. Tilted bots play
  more hands, blast more, and call down lighter — a 🌡️ badge marks the seat.
- **Two tournament archetypes:** The Grinder (tight, relentless 3-bets,
  correct short-stack shoves) and Bubble Boy (folds everything but the nuts).
- **Post-hand bot-thinking notes:** the 1–2 most teachable bot bets/raises get
  a 💭 hand-log line explaining the range logic and your exploit.
- **Custom-bot calibration:** new Tilt-proneness and Rebuy tendency sliders.

### Added — smarter coach
- Coach now teaches TAG aggression: value-bet and semi-bluff math, bluff
  break-even % (½-pot needs 33% folds), 3-bet sizing (~3× the open), bluff
  3-bets with blockers, and bluff-catching vs aggro villains.
- Every tip ends with a per-opponent exploit line (vs the Station: value bet
  big, never bluff…).

### Added — stats & setup UX
- **Stat ⓘ popovers:** every Stats card explains what it means and how it's
  calculated inline (VPIP, PFR, Aggression Factor, bb/100…).
- **Roster selection rework:** named bots (swimkev, Rohan, Amogh, Nathan)
  lead the roster; heads-up locks to exactly 1 opponent (swimkev by default)
  with over-selection refused; pick-order badges; count always derives from
  the selection; leaving heads-up restores your table.
- **Raise UX:** offline raise panel starts at the minimum legal raise
  (PokerNow-style) with a Min quick button; opening bets still default to
  ¾ pot.
- **In-table hand history:** 📖 button opens the Hand Story without leaving
  the table.
- **Results pacing:** 16-second hand-end pause (was 6); winner banner docked
  to the bottom so the board stays visible.
- **Multiplayer:** per-turn timer (Off/15s/30s/45s/60s, auto-check/fold) and
  sit-out/back-in with seat badges.

### Fixed
- Reset Stats / rebuy / leave-table now immediately zero the session
  bankroll pill.
- `getArchetype` fallback is id-based (shark) instead of positional, so
  roster reordering can't change bot behavior.

## [1.6.2] — 2026-10-07

### Fixed
- Session bankroll pill's tooltip/accessible label now says chips, not
  "big blinds".

## [1.6.1] — 2026-10-07

### Fixed
- **Topbar "Last:" totals multi-pot wins:** uncalled "takes back" entries no
  longer break the winner grouping, so "Last: You +1,143" is shown instead of
  just the main pot's "+40".
- **Session bankroll in chips:** the topbar pill now reads "+1,250 session"
  instead of "+125 bb session".
- **Legacy BB fallback rounding:** old hand records without chip amounts show
  "-13.4 bb" instead of float garbage like "-13.437999999999999 bb".
- **Stale "Waiting for X…" cleared** from the action bar during the results
  pause.

## [1.6.0] — 2026-10-07

### Fixed (player-reported)
- **Hand-end results no longer flash by:** the table now pauses 6 seconds after
  every hand with a "Next hand ▸" button and an auto-deal countdown, so the
  winner banner, board, and revealed hands can actually be read. Skipped
  (fast-forward) hands still advance instantly, and ⏩ Skip during the pause
  jumps straight to the next hand.
- **Win amounts are exact:** the "🏆 You win N!" banner and the persistent
  "Last:" topbar line now total what the winner actually took across main and
  side pots (previously the topbar showed only the first pot's share, e.g.
  "+40" on a 685 win). Verified live: banner matched the pot exactly on
  real hands.
- **All bot hole cards revealed at hand end:** every bot shows its cards
  face-up when a hand ends — even folded ones — so you can study how each bot
  played (practice mode). A folded hero sees card backs with a "👁 Show my
  hand" choice, PokerNow-style.
- **Results shown in chips, not BB:** every +/- result (hand list, history,
  per-archetype rows, biggest pot) now reads "+1,250" / "-340" instead of
  "+125 bb". Records saved before this release fall back to BB text.

### Added
- **📖 Hand Story view:** each saved hand now has a clean, phone-readable
  text narrative (streets, actions, board, result, your net) alongside the
  step-through replayer. Hand rows are tidied for narrow screens.
- **Quick-start mirrors your setup:** "♠️ Deal me in" now starts exactly what
  you configured (mode, opponents, stacks, blinds) with a live hint line,
  instead of forcing a fixed 3-bot cash game.

### Changed
- **Smoother bot action flow:** community and hole cards are diff-synced, so
  only newly dealt cards animate — the flop no longer rebuilds when the turn
  lands. Bets fly a chip to the pot, action badges pop, and changed
  pot/stack/bet values pulse instead of snapping.

### Tests
- 1,400 unit + 478 component + 62 netplay + 16 worker assertions green;
  smoke test drives the real app through the new hand-end flow with no JS
  errors. New regression coverage: chip deltas, hand story, bot reveal,
  hero show/muck, next-hand controls, win-amount math, legacy BB fallback.

## [1.5.2] — 2026-10-07

### Fixed
- **Hibernated sockets survive DO restarts:** the per-socket attachment now
  carries the room code, and a socket that speaks up on a restarted instance
  re-registers for broadcasts. Previously, any worker restart/eviction left
  live sockets failing every message with "Room not found" (the lobby looked
  fine, then Start died) — caught by a live two-client test, reproduced in
  `tests/worker.test.js` (fails without the fix, passes with it).

## [1.5.1] — 2026-10-06

### Fixed
- **Dropped connections now auto-reconnect:** a lost relay socket redials with
  backoff and re-sends join, so the Room reclaims the seat and the client
  resyncs to the live table instead of stranding on a stale lobby.
- **Rooms survive host disconnects + worker eviction:** room state persists to
  Durable Object storage (`Room.toJSON`/`fromJSON`); a guest joining minutes
  after the host vanished finds the room intact.
- **Fast redial no longer loses the seat:** a reconnect arriving before the
  server processes the old socket's close is now treated as a session takeover
  instead of being rejected as "name taken."
- **Online status accuracy:** the home status pill now reports the actual mode
  ("Live relay ready" vs "Local mock") instead of always claiming the mock.
- **Coach tip naming:** hole cards are named high-card-first ("Jack Nine")
  instead of in random deal order.

### Added
- **Update-available toast:** a long-open tab polls `version.txt`; when a new
  release lands it offers one-click Refresh instead of needing a hard refresh.
- **One-tap start ("Deal me in"):** a hero button on Play starts a cash game
  vs 3 bots immediately — no configuration wall.
- **Skip hand:** fast-forwards bot-vs-bot streets after the hero folds
  (or folds the hero's live hand first).
- **Turn status line:** explicit "Your turn" / "Waiting for X…" so it's never
  ambiguous why the action buttons are idle; plus a persistent compact
  last-result line in the top bar.
- **Accessibility:** cards announce rank and suit to screen readers; the raise
  slider has an accessible name.
- **Bot renames reject duplicates** inline (two "Doyle"s at one table).

## [1.5.0] — 2026-10-05

### Added
- **Visual polish pass (no behavior changes):** textured felt (woven gradient +
  top light + vignette), staggered card-deal animation, button press physics,
  view transitions, semantic action-button colors (check = blue, call = green,
  bet/raise = gold), pot restyled as a pill badge, Georgia serif display type
  with monospace hand log (system stacks only — the app stays offline-first),
  bot "thinking" dots on the to-act seat, and a remembered **light theme**
  (warm paper, toggle in the top bar, persisted in localStorage).

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
  unfixed engine (10 failures) and pass with the fix; a 12,000-hand soak
  diagnostic completed with zero crashes.

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
