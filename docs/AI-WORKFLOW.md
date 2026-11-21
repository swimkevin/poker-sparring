# How AI-assisted development works on this repo

This project is deliberately built with AI agents — and deliberately built
so a hiring manager can see *how*. The workflow below is the actual practice
used for every release, not an aspiration.

## The setup

The repo ships executable guardrails, not vibes:

- **`AGENTS.md`** (30-second version) and **`CLAUDE.md`** (full guide) bound
  agent behavior: the layering rule (`cards → evaluator → equity → engine →
  bots` stay DOM-free), engine contracts (`table.legalActions()`,
  bet/raise `amount` is the total street target), and conventions (guarded
  `require` blocks, no emojis in code comments, and no comments at all in
  shipped `js/`/`css/`/`index.html` — test-enforced, with version history
  kept in `CHANGELOG.md` only).
- **Standing rules agents must follow:** `npm test` must pass before any
  push; every engine/bot/equity change ships with a targeted test; never
  `innerHTML` user-controlled strings without `UI.escapeHtml`; keep
  functions small, and ship no comments in `js/`/`css/`/`index.html`
  (test-enforced zero-comment rule — decision history lives in
  `CHANGELOG.md`).

## What agents may do

Implement, refactor, and draft docs **within a brief**: a bounded task with
the files, constraints, and acceptance criteria spelled out. Agents write
code, write tests, run the suite, and report diffs.

## What agents may never do

- **Push without authorization.** Two-tier model: (1) Ad-hoc agent work —
  every push to GitHub goes through an explicit human approval step; agents
  prepare commits, the human ships. (2) Daily improvement loop — operates
  under standing authorization from Kevin (2026-10-18) to push within its
  guardrails: full suite green, atomic version identity, every commit
  verified green, CI confirmed green post-push. Kevin reviews the report
  after each run; any push outside these guardrails needs explicit approval.
- **Invent metrics, dates, or events.** Test counts, version numbers, and
  incident details come from tool output or the changelog — never from
  plausible-sounding generation. (The changelog once carried an inflated
  fuzzer claim; it was corrected to the defensible figure rather than
  shipped.)
- **Reverse an ADR decision or change honest labeling.** The "offline bot
  AI, never ML" rule (ADR 0003) is a human decision; an agent doesn't get to
  rebrand it.

## Verification

Every agent change goes through the same gate: the full `npm test` suite
(42 suites, 6,000+ assertions) **plus human diff review** before commit. Agents have been
observed catching real bugs this way — e.g. a smoke-test ordering flake the
agent introduced was caught by the suite, diagnosed, and fixed with a
regression guard in the same session.

## Authorship

Architecture decisions stay human. ADRs (`docs/adr/`) record decisions the
human made; agents may draft the write-up but never invent or reverse the
decision itself. **Kevin Song owns every result** — the agents are leverage,
the judgment is his. That division of labor is the skill being demonstrated:
directing and verifying AI output the way a senior engineer directs a team.

## Loop operations

Moved from AGENTS.md in v1.8.235 — AGENTS.md is the 30-second version; this is the long-form home for loop operations and the lessons log. New lessons go here. One moved lesson (v1.8.193) still names AGENTS.md as the lessons home; that was true until this move.
- **Rollback procedure.** If a bad push reaches production: (1) Identify the
  last good commit SHA via the GitHub API. (2) Use `push.py` to push the good
  versions of the affected files (fetch them via the Contents API at the good
  SHA). (3) Bump to a new version (never reuse a version number) so
  cache-busters invalidate. (4) Verify live `version.txt` and CI green.
  For a full revert, Kevin can use GitHub's "Revert" button on the bad commit.
- `push.py` pushes via the GitHub API and never updates local git refs, so the local
  index is permanently stale: `git status` shows every API-pushed file as modified and
  `git diff origin/main` misreports untracked-but-identical files as deleted. Do NOT use
  local git to detect what changed — track changed files manually during the run and
  verify the push via the API response and the live `version.txt`.
- Service-worker rule (v1.8.107): the update check fetches `version.txt?v=<timestamp>`,
  so a SW must NOT treat `?v=` as an immutability signal — `version.txt` is network-first,
  versioned static assets are cache-first. `PS_VERSION` in `sw.js` joins the version-bump
  list (enforced by `tests/sw-test.js`), and the SW file must change every release or
  browsers will never pick up the new cache.
- `push.py` hardcodes `sys.path` to a template dir for `dynamic_credentials` that may not
  exist in the deployment; if it throws `ModuleNotFoundError`, retry with
  `PYTHONPATH=/opt/muse/skills/custom-connector-setup/bin`.
- Service-restart resilience (v1.8.109): a backgrounded `npm test` can be killed by a
  runtime service restart with no trace. Always redirect to a log file
  (`npm test > /tmp/npm-test-<ver>.log 2>&1; echo "NPM_EXIT:$?" >> log`) so the exit
  state survives; if the session disappears, re-run the full chain from scratch —
  never assume the partial run was green.
- Log persistence (v1.8.113): `/tmp` itself is wiped by a service restart, so a
  redirected log there vanishes too. Keep run logs under the repo
  (`hidden_files/*.log` — gitignored) instead of `/tmp`.
- Debloat-scan discipline (v1.8.109): naive dead-code scans lie. Verify each candidate
  with word-boundary grep across js/ tests/ index.html, including assignment usages
  (`onclick = fn`, `onEvent: fn`), string-concatenated class names
  (`'coach-recap-' + kind`), and named IIFEs (the name is only a stack-trace label).
- Docs-freshness gate (v1.8.109): `tests/docs-freshness-test.js` asserts README/ROADMAP
  suite counts match the `npm test` chain and README's `(vX.Y.Z)` matches package.json.
  Keep those numbers accurate — the test enforces it now.
- Real event dispatch in jsdom tests (v1.8.110): tests that depend on
  document-level capture/bubble listeners (e.g. online's `wireNavAway`) MUST use
  real `el.click()` dispatch — calling `el.onclick()` directly silently skips those
  listeners and can false-pass (a navigate-away check passed for the wrong reason
  until this was caught). Prefer `el.click()` everywhere in DOM tests.
- Every jsdom test must end with an explicit `process.exit(...)` (v1.8.110):
  jsdom leaves a `Socket` handle open even with zero clicks, so a test without an
  explicit exit hangs the runner instead of finishing. All existing tests do this;
  new ones must too.
- Detached runs cannot real-browser-repro localhost issues (v1.8.110):
  `browser.browse` rejects loopback addresses at the tool level, so a transient
  UI report can't be reproduced in a real browser from a scheduled run. Encode
  the reported symptom as a jsdom regression test instead — and verify the new
  test FAILS with the bug injected before shipping it.
- Probe-board fidelity (v1.8.114): when a headless probe measures "air" fold
  rates, verify the hero hand is truly air with NO draws before trusting the
  numbers — print `madeStrength`/`detectDraws` on the probe setup. Two probe
  bugs in one run: Qs on a Ks board is a flush draw, and a 4-card same-suit
  turn board gives the "air" hand a draw; both measured 0/40 folds and looked
  like a turn leak, but the bots were correctly continuing with draws. The
  v1.8.111/113 probe-fidelity rules extend to the board/hole-card construction.
- Verify-before-fixing cosmetic issues too (v1.8.114): nathan's "Never raises"
  tagline looked stale but measurement proved it honest (0/40 raises on every
  street, leading and facing). Don't "fix" profile text without measuring the
  actual behavior first — extends the v1.8.104 verify-open-issues rule to
  cosmetic changes.
- Phantom-stall probes (v1.8.118): a headless DOM probe reported a "stuck" game
  three times; all three were probe bugs. (1) `UI.clearLog()` wipes `#hand-log`
  on every hand start, so counting `Hand #` in the log can never exceed 1 —
  count completed hands via `#hand-info` instead. (2) The "You are felted!"
  rebuy modal is correct behavior, not a stall — handle it (click Rebuy) like
  the feature sweep does. (3) Bot think pacing (650-1400ms per action) plus
  coach Monte Carlo makes headless play look frozen on short horizons — run
  longer before concluding. Extends the v1.8.111/113/114 probe-fidelity rules:
  verify the probe's measurement method before concluding the app is broken.
- First-in rates are not game rates (v1.8.120): a probe measuring "VPIP"
  first-in facing only the blind reported 100% for six loose bots — but that
  does not contradict desc claims like "sees ~45% of flops", which describe
  real games with raises in front. When a profile claim names a game-wide
  rate, either simulate full games or assert on the narrower spot you actually
  measured (the new bot-identity test asserts first-in trash/aces tendencies,
  not overall VPIP). Do not "fix" a profile on a mismatched measurement.
- Bot-identity bands (v1.8.120): when asserting bot tendencies, classify bots
  into tendency groups first, measure each group's true rate over ~1000
  trials, then set bands many sigma away (measured clusters were 0% vs
  95-100%, bands at 20%/80%). Exempt genuine outliers explicitly (Station
  raises aces only ~24% — loose-passive calls them down) rather than
  widening the band for everyone.
- Unpushed-doc link rot (v1.8.123): README linked docs/competitive-analysis-2026-10-09.md while the file sat untracked locally for weeks — push.py only pushes listed files, so a linked doc is never shipped by merely existing. Guard: docs-freshness-test now asserts every README-linked docs/ file exists in the tree (fails in CI on a tree missing it). When adding a doc, list it in the push.
- CSS debloat verification (v1.8.118): when removing a superseded declaration,
  prove it dead by specificity — both rules must apply under identical
  conditions and the surviving rule must win on every property being removed.
  The v1.8.116 `overflow-y: auto` on `#online-view.online-scroll` died because
  the v1.8.117 `:has()` rule sets `overflow: visible` at higher specificity
  (3,2,0 vs 2,1,0) under the same `.online-scroll` condition.
- Backup-restore version trap (v1.8.156–157, 2026-11-03): restoring a
  file from a pre-bump backup silently reverts its version identity
  (APP_VERSION went back to 1.8.155 while version.txt said 1.8.156) —
  the v1.8.154 lesson in reverse. After ANY restore/copy from a
  backup, re-verify version identity (APP_VERSION vs version.txt)
  before testing or pushing. Prefer rebuilding the iteration's
  edits onto the current tree over wholesale file restores.
- push.py file-arg form (v1.8.156, 2026-11-03): each file arg must be
  `repo-path:local-path` (e.g. `js/app.js:js/app.js`); bare paths
  fail with ValueError. The loop body's shorthand omits the colons.
- push.py full invocation (v1.8.187, 2026-11-06): the four leading
  args are mandatory — `push.py <owner> <repo> <branch> <message>
  <repo-path:local-path> ...` (e.g. `push.py swimkevin poker-sparring
  main "v1.8.187: ..." "js/app.js:/home/hatch/workspace/poker-sparring/js/app.js"`).
  Calling it with only file pairs 404s on the refs lookup (the first
  pair is read as the owner) and nothing lands, so it is safe to
  retry with the full form. Retry with
  PYTHONPATH=/opt/muse/skills/custom-connector-setup/bin on
  ModuleNotFoundError. Double-check typed paths — a typo in a local
  path fails the whole push with FileNotFoundError before any commit.
- CI tests timing (2026-11-03): the tests workflow took up to ~20
  min to go green on some commits, longer than the ~10 min local
  suite. Do not conclude a run is dropped before ~20 min; re-check
  rather than retriggering.
- Eval tone is msg-internal stacking (v1.8.161, 2026-11-04): the
  v1.8.113 budget gate covered stage/multiway extras, but the
  value-bet message itself stacked why + vulnerability note +
  sizing math + tail past the eval's 500-char limit. The lab now
  has a `maxMsgLen` budget for leading spots; a value message
  must fit 400 chars so the full panel stays under 500.
- River commitment inversion (v1.8.162, 2026-11-04): SPR
  commitment is a multi-street concept — on the river there are
  no later streets, so a commit-shove only folds the worse hands
  the value bet targets. `sprVerdict`'s river commitAt of 1.5 was
  the trap; the shove branch now skips the river entirely.
- Hero-stack vs effective stack (v1.8.164, 2026-11-04): the
  tourney short-stack branch keyed on the effective stack, so a
  deep hero facing a short villain got shove-or-fold advice for
  hero's whole stack. Push/fold charts are hero-stack charts;
  key the branch on hero's stack. Hero-short behavior is
  unchanged (hero was the minimum there anyway).
- Pot-odds prize convention (v1.8.165, 2026-11-04): preflop
  quoted pot+toCall while postflop and the veto quote potTotal.
  One convention now: the prize is the pot before your call,
  matching Kevin's own "call 669 to win 1,556" framing. The lab
  gains its first preflop spot pinning the figure.
- Lab gross-check scope (2026-11-04): do NOT extend seeded
  gross checks to bypass/narrowed/air-cap spots — those decisions
  rest on non-range factors (overbet rule, narrowed-by-call,
  air cap) that an openTier sim misjudges and would false-fail.
  Gross checks belong only where the range sim is the decision
  basis.
- Probe hand-class fidelity (2026-11-04): a probe that calls AK
  on a Q-high board "top pair" is measuring air — verify every
  probe hand with `handClass` before trusting numbers (extends
  v1.8.114). Keep jsdom probes lean with an explicit
  `process.exit`: full verdict sweeps with equity sims take 10+
  minutes; the solver-lab harness is the fast path.
- Pin sizes from definitions, not intuition (2026-11-04): a
  river test first expected 50, but `boardTexture` correctly
  calls 5-7-9 wet (three ranks in a straight window), so the
  value bet is 67. Read the sizing function before pinning a
  size.
- Braced-block syntax (2026-11-04): converting a single-return
  `if` into a braced block needs the closing brace — run
  `node --check` after any structural edit before the test run.
- Leading bet amounts need a stack clamp too (v1.8.192, 2026-11-07): the
  facing branches all clamp raise sizes to `legal.maxRaiseTo`, but the
  leading branch computed fraction-of-pot bets with no clamp — trips at
  SPR 0.5 was advised a 1,340 bet from a 1,000 stack, and the three
  half-pot bets (semi-bluff, second pair, bluff) advised 1,500 from 1,000
  at SPR 0.33. Rule: every advised bet amount is clamped to the hero's
  stack, and when the clamped amount IS the whole stack the message says
  all-in, not a fraction-of-pot label. The v1.8.166 canRaise guard covers
  raises; this covers leading bets.
- Unguarded raise advice (v1.8.166, 2026-11-04): the eval
  flagged a preflop "raise" with canRaise false — a 10-chip hero
  told to steal-raise to 25. The steal and limpers branches
  never checked `legal.canRaise`, and the tourney shove branch
  told a short hero facing a shove to "shove" when only
  call/fold exist. Rule: every raise advice must be guarded by
  canRaise; when it is not available, premiums call it off and
  everything else folds. The 'open' branch is safe (toCall 0
  with posted blinds means canRaise is stack > 0), and all
  postflop raise lines already checked.
- Probe pot-odds need (2026-11-05): the correct need is
  `toCall / (potTotal + toCall)`, NOT `bet / (pot + bet)`.
  The engine convention is `t.pot` excludes current-street
  bets (they live in `player.bet`); `potTotal() = pot +
  sum(player bets)`. A probe that puts bets into `t.pot`
  double-counts the pot. Also `mkVerdict` returns
  `{advice, ...}` — the field is `advice`, not `action`.
- Probe reference noise (2026-11-05): a probe's SEEDED
  reference equity is itself one Monte Carlo draw. A flag
  near the threshold can be probe noise, not a coach bug:
  measure the call rate over repeated runs (3/20 calls at a
  2-point deficit = noise; 17/20 = systematic). Monte Carlo
  sims must match the asserted gap — the 3-bet equity gate
  needed 500 sims because 150-sim noise flipped borderline
  calls, and the implied-odds credit is calibrated for
  facing-opens, not 3-bets: it is halved for 3-bet pots
  (tighter range, lower SPR, more reverse implied odds).
- Branches that return before the equity (2026-11-05): the
  facing-open small-pair branch returned before `adjEq` was
  computed, so a small pair could never get an equity-based
  call. When adding an equity condition to a branch, verify
  the equity is computed BEFORE the branch, not after it.
- Edit-tool duplicate matches (2026-11-05): when old_text
  matches twice, the edit replaces the FIRST occurrence — a
  move-then-delete sequence clobbered the just-inserted block.
  Always include enough surrounding context to make the
  match unique.
- /tmp is wiped by restarts (2026-11-05): probe files in
  /tmp vanished mid-run. Keep run-critical probes under the
  repo (`hidden_files/`) or be ready to recreate them.
- CI tests timing (2026-11-05): the tests workflow took
  ~35 min on one commit (v1.8.167). Do not conclude a run is
  dropped before ~35 min; re-check rather than retriggering.
- Close-band lab spots flake on 150-sim noise (v1.8.176, 2026-11-06):
  open-55-ahead flipped about 1 run in 10 because 55's edge over the call
  threshold was ~1 sigma on 150 sims. Keep lab assertions at least 3 sigma
  from the close-band edge — e.g. kill the implied-odds credit with a
  shallow stack, as the bluff-3bet spot does at 10bb. Facing-open equity
  now uses 500 sims like the 3-bet branch, for the same reason.
- Service-restart loss, second sighting (v1.8.174, 2026-11-06): a restart
  killed the full suite mid-run with no trace; the log file showed the
  stall and the suite was re-run from scratch. If a backgrounded suite's
  log stops advancing and no process is alive, re-run — never trust the
  partial log as green.
- Jargon literals in coach copy (v1.8.175, 2026-11-06): the scenario test
  bans the literals '3-bet' and '4-bet' anywhere in app.js. A lesson that
  said "3-bet shoves" failed the build — say "re-raise shoves" instead.
- Push-list completeness, second sighting (v1.8.177/178, 2026-11-06): the
  177 push omitted js/app.js because its logic was unchanged — but the bump
  had touched its APP_VERSION, so live served 1.8.176 against version.txt
  1.8.177 and CI failed. The push list is ALWAYS the changed files PLUS
  all six bump-touched files (version.txt, app.js, package.json, sw.js,
  index.html, README.md), even on a test-only repair. Verify the list
  against the bump output file by file before pushing.
- Push-list check, automated (v1.8.179, 2026-11-06): the manual
  file-by-file check failed twice, so it is now a script —
  `node hidden_files/verify-push-list.js <x.y.z> <repo-path>...` checks
  version identity across all six bump files, requires all six in the
  push list, and diffs the working tree against the `origin/main` tip
  to catch any omitted changed file. It exits nonzero listing exactly
  what is missing. Run it before EVERY push.py call; a failed check
  blocks the push. Verified: passes a complete list, fails when
  js/app.js is omitted, fails on version drift.
- Facing-open sims to 5000 (v1.8.191-192, 2026-11-07): the facing-open branch
  has TWO nearby boundaries (the strong-call price and the in-position
  close-call lean 5 points below it), so 500-sim noise (~2 points) flipped
  the lean on borderline suited hands — T9s vs Alice's 6x open called 5/20
  identical runs. At 2000 sims it still flipped ~12% and at 5000 sims ~5%,
  because the spot sits ~1 point from the lean boundary — the honest-limit
  zone, where no sim count stabilizes it. Exception to the 500-sim rule,
  not a new rule: the other facing branches have a single boundary and
  stay at 500. Lesson: never gate a ~1-point-edge spot with a binary
  run-count test — v1.8.191's 20-run stability test (at most 2 calls in
  20) flaked on CI and locally at a ~8-14% rate, and failed the 191 CI
  run. Pin the sim count literally in the scenario test instead; measure
  flip rates with a probe, don't assert on them in the suite.
- Postflop facing sims (v1.8.179, 2026-11-06): the preflop branches moved
  to 500 sims in v1.8.176, but the postflop facing branch still ran 150 —
  and a probe caught the same flip: second pair vs a big bet quoted
  32–49% over 20 identical runs and flip-flopped call/fold 2/20. All
  three facing equity calls now run 500 sims (probe repeats 20/20 call).
  Rule: every equity estimate that feeds a call/fold boundary runs 500
  sims; 150 is only for report-only figures.
- Probe spots must carry the board (v1.8.179, 2026-11-06): a flip probe
  omitted `board` from its spots, so `t.community` was undefined and
  `handClass` threw on every run — all null advice, which looked like a
  coach failure. The earlier raise probe never caught it because preflop
  spots never touch the community. When a probe returns null advice,
  print `v.error` first and check the probe setup before concluding
  anything about the app (extends the v1.8.111/113 probe-fidelity rules).
- Out-of-position re-raise calls need a 10-point edge (v1.8.180,
  2026-11-06): the tier-2 and tier<=4 facing-re-raise branches required
  `inPos` for any equity-based call, so JJ vs a Maniac re-raise folded
  out of position at 74% equity vs a 31% price. Position is a discount
  on realized equity, not a veto: out of position the call now needs
  equity above need + 0.10. The set-mine escape stays
  position-independent (it never depended on position, only on the
  `inPos` gate around it). The lab harness now takes `spot.button`
  (default 0) so out-of-position spots can be pinned.
- Leak tracker prices the villain's range (v1.8.181, 2026-11-06):
  `detectLeak` used 120-sim random-hand equity for its bad-chase /
  weak-fold flags — the banned pattern, in the last place that still
  had it. Measured: J9 overcards calling Rock's big turn bet showed
  ~30% vs a random hand (no flag) but ~6% vs his strong range; second
  pair folding to Alice's small river bet showed ~62% vs a random hand
  (false weak-fold flag) but ~22% vs her tight range. The tracker now
  mirrors the coach's facing-branch tier logic (range from the hand
  timeline, 500 sims) with a 500-sim random fallback. Note the tier
  fallback is the villain's `openTier`, not `threeBetTier` — Rock opens
  tier 2, so the same fold against him IS a weak fold (39% vs 25%
  need); Alice opens tier 1 (22%). `detectLeak` is now exposed in
  `__coachTestHooks` so the flags are directly testable.
- Threshold audit: measure, then move (v1.8.182, 2026-11-06): a
  read-only audit replicated every rate/MC threshold's exact
  measurement and reported mean/sigma and the threshold's distance in
  sigma (bar: >=5 sigma = safe). Eleven sat below 5 sigma and were
  moved with their measured numbers in the CHANGELOG entry — e.g. the
  Alice 165 that replaced the flaking 170 was itself only 4.5 sigma on
  re-measurement (182.6 +/- 3.93), so it moved to 160 (5.8 sigma).
  Every moved threshold keeps a regression catch: the rock-JJ cap of
  40 still fails shark (86/200) and lag (94/200); the Amogh bands
  still exclude 0 and 60; the Alice 160 still fails if the facingBig
  bug returns (continuation collapses toward 0, big-bet control 9/200
  in the test). The audit report is saved at
  hidden_files/threshold-audit-report.md. Borderline-safe (>=5 sigma
  but close: AA equity, 72o-vs-tight gap, push/fold 72o margin,
  narrowed-range lab spot, Alice small value bets) were measured and
  left alone — watch them if they ever flake.
- Multiway facing sims to 500 (v1.8.183, 2026-11-06): the multiway
  diluted equity was the last facing-branch estimate still at 300 sims
  (everything else moved to 500 in v1.8.176/179), and it flaked the
  river-trap control on CI — the nut draw's diluted equity (31-40%)
  sat ~2 points above the 29% price, folding ~1 run in 20. The sims
  go to 500 and the control spot is re-margined to a 200 bet (22%
  price, 20/20 calls, equity 34-40%). Honest limit: a probe spot whose
  true edge is only ~1.5 points (second pair multiway vs a 100 bet)
  still flips ~25% of the time at 500 sims — no sim count fixes a
  1.5-point edge; the fix narrows noise for mid-edge spots and the
  CI failure itself was fixed by the spot margin, not the sims.
- Flagged-modes timeout is CI-only (v1.8.183, 2026-11-06): stage 2
  (one heads-up hand) took >120s on CI once while 23 local runs all
  finish in 22-25s. No stall reproduces: the equity paths are bounded
  (fixed iteration counts, no rejection sampling) and a leak flag only
  writes a log line, never a modal. The tick budget widens 300 to 600
  (240s) so a slow-but-progressing hand passes and a genuine stall
  still fails. The instrumented probe with per-tick logging is kept at
  hidden_files/flagged-probe.js for the next diagnosis if it recurs.
- Air pricing sims to 500 (v1.8.184, 2026-11-06): the air mixture
  (made-hands vs bluffs blend for no-pair hands) was the last facing
  estimate at 300 sims. Probe: AKo vs Nathan's 60-into-500 turn bet
  quoted 8-17% over 20 runs and flipped 11/9; at 500 sims it quotes
  10-14%. Same honest limit as v1.8.183: the spot's true edge is
  ~1 point, so it still flips — 500 sims narrows noise, it doesn't
  manufacture an edge. The 500-sim rule now covers every boundary
  equity estimate in the coach and leak tracker; 150/300 survive only
  for report-only figures.
- Grounding: plain language is test-enforced (v1.8.185, 2026-11-06):
  the jargon test only scanned coach-verdict literals and four exploit
  phrases, so jargon lived in the recap, exploit lines, bot descs, and
  tooltips uncaught. It now scans coach/recap phrases whole-file
  (case-sensitive on purpose — the code identifier countLimpers() must
  not trip the lowercase 'limpers' entry), bot taglines/descs
  whole-file, and the STAT_INFO tooltips (scoped — TAG is allowed in
  the glossary itself). All 14 archetypes have exploit lines; the dead
  grinder/bubble/swimkev keys are deleted. Watch the trap: the old
  §6 check looked for a 'swimkev:' exploit key, but swimkev's
  archetype id is lag — deleting the dead key required fixing the
  check to ['alice', 'rohan', 'lag']. The component test pins the
  glossary count (29 -> 37 when 8 terms were added) — update the pin
  when the glossary grows. README's "2,000+ assertions" verified
  against the 1.8.183 run: 5,188 passed, 0 failed (a lower bound —
  only suites printing "N passed" are counted).
- Mobile first-run (v1.8.186, 2026-11-06): the coach-intro "seen"
  flag was marked at the first hero action even on mobile, where the
  intro renders into a side panel the phone never shows. It is now
  gated on visibility — desktop marks seen at the first hero action
  (side panel visible), mobile only when the Coach panel is open or
  the player opens the Coach tab (UI.markCoachIntroSeen, exposed by
  app.js). A gold dot on the Coach tab signals new advice; coachTip
  adds it unless the coach panel is already open. Test with a
  matchMedia stub (jsdom's returns matches:false); the mobile
  scenario polls for the verdict replacing the intro so the
  "hero action happened" premise is proven, not assumed.
- CI diagnosis: ONE stable tool (v1.8.193, 2026-11-07): every CI
  failure in Nov spawned a brand-new one-off script (ci-logs.py,
  ci-logs2.py, ci-logs3.py, ci-steps.py, ci-checkruns.py,
  ci-annotations.py, ci-jobs.py) and every novel exec command
  triggered a FRESH permission card for Kevin — that is the prompt
  spam he reported ("keeps asking for permission to read daily
  improvement.txt": there is no such file; the cards were exec
  approvals for new CI-log scripts from the scheduled task).
  `hidden_files/ci-diagnose.py` is now the only CI tool, with
  subcommands check/jobs/steps/checks/logs; the loop must use ONLY
  it. HARD RULE: never write a new *.py/*.js investigation script
  per failure; never run a novel inline heredoc exec to fetch CI
  logs; reuse the stable helper or plain API calls with no new
  files. If the helper is broken, fix the helper itself. Two
  breakages found while consolidating: ci-annotations.py 404d —
  `/actions/jobs/{id}/checks` is not a real endpoint (check-runs
  live under `/commits/{sha}/check-runs`); and the logs endpoint
  does NOT always return a zip — it 302-redirects to a blob host
  and the body is sometimes a plain-text log, so assuming zip
  crashes the parse (and the auth header must be stripped on the
  redirect or the blob store 401s). The helper handles both
  formats and saves the raw bytes.
- NEVER read, open, or edit the cron definition (v1.8.193,
  2026-11-07): loop workers must never touch
  `~/workspace/cron.d/` or any cron definition file — the Phase 5
  "update THESE instructions" line kept sending workers to read
  the loop's own definition, which is the other suspect for the
  "read daily improvement" prompts (the cron file is literally
  named poker-coach-daily-improvement). Lessons go ONLY to
  `~/memory/YYYY-MM-DD.md` and repo AGENTS.md; the main agent
  applies cron-body edits. HARD RULE, no exceptions.
- Weak-fold flag is priced, not fixed (v1.8.193, 2026-11-07):
  the 1.8.189 CI failure was the Rock weak-fold test — measured
  88/100 flags at 500 sims because the fixed 0.35 line sat only
  1.47 sigma above the spot's true equity (0.379 +/- 0.020). The
  flag now fires when equity clears need + 0.10 (the same eq-vs-
  need math the coach uses everywhere; the old fixed line was the
  only place that didn't price the bet) and the leak-tracker's
  range estimate runs 2000 sims: Rock 100/100 flags, Alice 0/100,
  Maniac 100/100. The scenario test pins the rule literally
  (`eq > needFold + 0.10` present, `eq > 0.35` absent). The
  1.8.191 CI failure was the T9s run-count test (4/20 calls, same
  on CI and locally); the 1.8.192 worker already resolved it per
  the recorded lesson — run-count test removed, sim count pinned
  literally at 5000 in the scenario test (and the 1.8.192
  CHANGELOG entry does document the bump — the earlier claim that
  it was undocumented was wrong; the entry's second paragraph
  covers it). Note the 1.8.192 full-suite log is stale evidence:
  it was run before the test removal, so its T9s FAIL does not
  describe the shipped tree. Re-measured 2026-11-07: T9s calls
  3/200 verdicts at 5000 sims (p = 1.5%).
- Lean call needs a real bluffer (v1.8.194, 2026-11-08): the
  lean-call branch fired on a 'wide' range label OR high bluff
  frequency, but a wide range is not a bluffing range — the
  looseness is already priced into the call threshold (a 6-point
  discount), so the extra 10-point lean window double-counted it
  and the message ("bluffs a lot") was false for Rock (bluff
  0.02). The branch now requires bluffy > 0.5. The two probe
  spots (gutshot and ace-high into Rock's half-pot turn bet)
  fold at 14%/10% vs a 25% price.
- Tight-player pot-sized river bet (v1.8.195, 2026-11-08): the
  tier-3 range pool overstates equity vs a tight player's big
  bet (top pair quoted 59% vs Rock's pot range, true ~25%).
  The overbet guard now also folds one pair or less to a
  pot-sized ('large', 0.8-1.2x) river bet from a tight player.
  Scoped river-only and one-pair-or-less on purpose: an
  injection run with the guard turn-scoped failed the
  multiway top-pair call the lab pins, and trips still call
  (94%). The guard's refactor into `tightBigBet` broke the
  v1.8.140 scenario test's literal assertion — refactoring a
  guarded condition means updating the pattern assertion to
  the new shape, same intent (v1.8.198's draw-raise edit did
  the same to the v1.8.62 multiway assertion). The full suite
  catches both; that is the gate working.
- Squeeze sizing (v1.8.196, 2026-11-08): a value 3-bet with
  callers in front must add 1x the open per caller (AKs: 120
  with one caller, 90 without) — the same "plus 1x per
  limper" logic the iso-raise already uses. New helper
  `countCallersAfterOpen` mirrors `countLimpers` with the
  raised flag flipped.
- Trapper value raise (v1.8.197, 2026-11-08): the v1.8.146
  passive-trapper block assumes the trapper folds worse hands
  to a raise. Nathan is a station (stubborn 0.9), so a raise
  with a crushing hand is pure value — the block now lifts
  when the villain folds little (foldy <= 0.25) AND the
  coach equity crushes his range (adjEq >= 0.90), with its
  own "for value" message. Overpair at 82% still calls, so
  the v1.8.146 behavior is intact. Only Nathan qualifies as
  a passive trapper (Rohan bluffs 0.68).
- Profile rates are not in-hand rates (v1.8.198, 2026-11-08):
  Rock's generic foldy is 0.8 (1 - stubborn), but measured
  0/200 folds of top pair to a 3x raise after betting 3/4
  pot — the semi-bluff raise's fold equity was fiction, worth
  ~160 chips less than calling. The draw-raise branch now
  skips strong/polarized ranges. Measure the fold rate in the
  actual spot before trusting a semi-bluff; the probe is kept
  at hidden_files/rock-fold-probe.js. Injection-check
  discipline: a sed pattern spanning two lines silently
  no-ops — verify the injected tree actually fails the lab
  before trusting the check.
- Stale backlog verified 2026-11-08: the river veto IS
  multiway-diluted already (estimateEquityVsMadePoolMulti,
  shipped v1.8.156-160) and facing-raise advice DOES state
  explicit sizes in every main message (only lesson lines
  state bare multiples) — both backlog items are closed,
  not open.
- Probe-board fidelity (2026-11-08): exact made-pool equity
  for trip Queens on an unpaired board is only 0.43 — the 16
  straight combos dominate the made pool. The made pool
  conditions on "villain has trips+", which understates a hand
  that beats the villain's whole betting range (mostly
  one-pair hands). Use the coach's own adjEq vs the full
  range for "crushes the range" gates, not the made pool
  alone.
- Callers ahead are a range, not random hands (v1.8.199,
  2026-11-09): the multiway dilution modeled every non-bettor
  as a random hand (tier 0), but a player who called the bet
  has a calling range — second pair vs Rock's 400 + caller
  quoted 32% (true 19%), weak pair 24% (true 18%). Callers
  ahead now get tier 3 in the dilution; players who have not
  acted stay tier 0. The +0.05 call-ahead threshold bump stays
  (it prices the players still to act behind, not the caller).
  The lab's gross check mirrors the coach: tier 3 for callers
  ahead, and its pot includes their bets (runSpot now applies
  current-street calls to the table, so potTotal is right).
  Lab-spot margin rule, re-learned: the turn weak-pair spot
  flipped 1/40 runs (quoted equity 1.6 points under the
  strong-call bar) — moving it to the river, where the
  under-bluffed prior adds 3 points, took it to 0/40. A river
  card that pairs the hero (the first river 9 made two pair
  and quoted 87%) breaks the spot — verify the hand class
  after any board change, same as the v1.8.114 probe-board
  rule.
- The leak tracker prices the same hand the same way
  (v1.8.200, 2026-11-09): detectLeak used heads-up range
  equity even multiway, so it flagged correct multiway folds
  as weak folds (weak pair vs LAG 250 + caller: 55% heads-up
  vs 25% multiway truth, line 30%). It now dilutes with the
  same caller-ahead tier-3 model as the coach. The bad-chase
  flag gets the same dilution for free (more flags multiway,
  the correct direction). Injection-check discipline: the new
  multiway test was verified to fail with the dilution
  disabled (85 passed, 1 failed) before shipping.
- Reshoves are priced, not charted (v1.8.201, 2026-11-09):
  the short-stack branch reshoved tier 2-3 hands over ANY
  open at <=12bb, never looking at the opener — AJ/AQ/JJ/TT
  over Rock's open are all losing (32/38/46/39% vs a 47%
  break-even, no fold equity since Rock calls every reshove).
  Tier 2-3 hands now need equity above the no-fold-equity
  break-even + 0.03 (5000 sims), priced against the open tier
  for a normal open and the 3-bet tier for a big open or a
  re-raise. Tier 1 stays auto-shove; AKs shoves, AKo folds
  (47% vs a 49.5% bar — exactly break-even is a fold). The
  AKo lab spot caught a tier mistake: AKo is tier 2, not
  tier 1 (only AKs is tier 1) — the first version of the spot
  expected a shove and failed, which is the lab working.
- Preflop facing-open dilution (v1.8.202, 2026-11-09): the
  v1.8.199 fix was postflop-only — preflop, a facing-open
  call was priced heads-up with only a flat +0.04 threshold
  bump. ATo vs Rock + 2 callers quoted 28% and called (true
  15%, EV about -10); KQo the same (25% vs 17%). The call
  now prices equity multiway against the opener plus tier 4
  per caller (5000 sims); the +0.04 bump stays because it
  prices players still to act behind, not the callers in.
  The lab's gross check mirrors it (tier 4 per caller in
  the facing-preflop branch). Same-bug-three-places lesson:
  postflop dilution, the leak tracker, and preflop
  facing-open each priced one opponent and patched the rest
  with a constant — a constant cannot replace equity.
- A trait is not a prediction (v1.8.203, 2026-11-09): the
  suited-ace bluff 3-bet fired on villainFoldy > 0.5, but
  foldiness does not predict folding to a small 3-bet —
  Rock folds 0/1200 across his opening range deep (and LAG
  and Pro 0/200 each), because the call is cheap and the
  whole range is priced in; EV about -52 chips vs Rock.
  The branch now needs two gates that DO predict folds in
  the engine: opener wide (openTier >= 4) AND the raise
  pressures the stack (call cost >= 12% of villain total —
  the engine's expensive-call line). Shallow, Maniac's 72o
  folds 197/200 and LAG folds 15-21% of weak hands. The old
  lab spot pinning the bug was renamed to a fold (hero
  stack 100, so no implied-odds credit muddies the pin —
  A5s vs Rock deep sits 1 point from the call bar); the new
  Maniac-shallow spot pins the raise. Message updated:
  "folds too much" was false; the new wording names the
  mechanism.
- A small bet after shown strength is not a weak bet
  (v1.8.205, 2026-11-10): the small-bet raise branch read
  every small bet as a marginal hand begging for a cheap
  showdown — even after the villain bet 3/4 pot on the
  flop, so the verdict contradicted its own range read in
  one message. Measured: Rock folds 0/200 to the raise
  with every pair (AQ, KQ, QJ, Q9, sets, middle pair) and
  only folds pure air — the raise never "takes it away"
  from a hand that matters, and his opening range on that
  board is overpairs, better-kicker top pair, and sets.
  New `villainShowedStrength` timeline scan: a 0.7x-pot or
  bigger bet on an earlier street, or a preflop raise from
  a tight player, counts as shown strength and the raise
  branch skips it (falls to the equity call). Scoped: the
  capped-range raise still fires, a wide player's preflop
  raise does not count as strength (LAG still gets
  raised), and the never-raising trappers keep their value
  raise. Probe kept at hidden_files/rock-smallbet-fold-
  probe.js. Lesson: read the whole hand, not the last bet.
- One weak range in front is a raise, not a fold
  (v1.8.206, 2026-11-10): the tier-3 isolate branch fired
  only in position, so AQo folded in middle position vs a
  single player who just called — while 2+ limpers in the
  same seat already raised through the late/middle branch.
  The branch now also fires against exactly one limper
  (`inPos || countLimpers() === 1`), with its own message
  (no false "you have position"). Position against the
  button is not position against the limper.
- Stack-depth gates do not price all-ins (v1.8.207,
  2026-11-10): facing an all-in re-raise, tier 2-4 hands
  folded on the 40bb effective-stack gate — an all-in
  villain has no stack, so the gate read zero. JJ folded
  to a Maniac shove at 72% equity vs a 50% price, AQs at
  64%. A guard between the premium and tier-2 branches now
  prices it on raw equity when no raise is left
  (`!legal.canRaise`, tier 2-4, not a small pair): call iff
  eq3 > need3. Raw equity on purpose — implied-odds credit
  and reverse-implied debit are postflop concepts, and the
  second-re-raise branch prices its all-ins the same way.
  Small pairs keep their own branch (equity fallback
  already prices all-ins). Same hole class as v1.8.188,
  one raise earlier.
- A raise to your whole stack is an all-in (v1.8.208,
  2026-11-10): the facing-raise branches (nuts, draw,
  small bet) labeled a whole-stack raise "~3× their bet"
  — the nuts with 1,200 facing a 400 bet, the draw raise
  of 900 from 900. The leading bets got this fix in
  v1.8.192; the facing branches never did. Each now checks
  `raiseTo >= legal.maxRaiseTo` and says all-in with the
  amount in the same "to ~X" shape, so the lab's size
  check still parses it.
- Push-path typo is a safe retry (v1.8.208, 2026-11-10):
  a typo in the local-path half of a push.py pair
  (`poker-sparsing`) fails the whole push with
  FileNotFoundError BEFORE any commit lands, so correcting
  the path and retrying is safe. But
  verify-push-list.js only checks the repo-path half of
  each pair and version identity — it cannot catch a
  local-path typo. Double-check the typed local paths.
- Service-restart loss, third sighting (v1.8.208,
  2026-11-10): a runtime restart killed the full suite
  mid-run at the unit-test soak stage with no exit line
  and no live process; the hidden_files log showed the
  stall and the suite was re-run from scratch (green).
  Same as v1.8.174 — the log-file discipline is what
  makes the loss visible instead of silent.
- First-in is a mixed strategy, not auto-call (v1.8.209,
  2026-11-11): five bots played 100% of hands first-in
  (cheap-call branch aggression>=0.8 widened to tier 6
  plus the callTier+1 limp branch). Top-tier hands now
  raise with prob 0.55 (tier 5) / 0.30 (tier 6) instead
  of always; limping is a probability band by tier/limp/
  position. Measured N=2000/bot: lag 100 to 43.1% VPIP,
  station 100 to 50.1%, maniac PFR 95.2 to 65.2%.
  Ordering rock < shark < lag < station < maniac now
  holds (7.3 < 25.8 < 43.1 < 50.1 < 70.5).
- Facing raises are priced, not called on tier alone
  (v1.8.209, 2026-11-11): stackDiscount let deep
  stacks call anything (+3 tiers; friendly x1.8
  multiplier pushed the facing-big branch over
  threshold) — donald called Q9s/A2o vs 3x ~98%,
  alice A5s 98.3%; lag auto-called 80% of ANY raise
  with tier>=3 (AQo vs 7x 91%). The discount is now
  capped to pairs/suited, tier<=callLine+1, need<0.42,
  60% prob; lag's auto-call is gated to raises <7x;
  3-bet probability is tier-scaled.
- Postflop leading is a hand-class mixed strategy
  (v1.8.209, 2026-11-11): everyone bet 100% with
  top/second/weak pair when checked to at one fixed
  size per bot; nut flush draws semi-bluffed 91-100%;
  Rohan never led anything (monsterThrough 0.78 vs set
  strength 0.66). Now monsters bet big, medium pairs
  ~45-70%, draws semi-bluff ~25-60%, air bluffs at a
  HU-scaled rate; sizes jitter +/-15%. Rohan
  monsterThrough 0.78 to 0.60 at 0.7 prob (sets lead
  ~64-70%); Nathan still traps at 0%.
- Amogh shove discipline (v1.8.209, 2026-11-11): Amogh
  shoved AA 95% facing a 3x open, 100% first-in (a
  100bb shove vs a 3bb open). Premiums now shove 55%
  (else a normal 2.5x raise, never flat/fold) and draws
  check 35%; desc updated ("sometimes shoves").
- Station-air band sat ~1 sigma from the truth
  (v1.8.209, 2026-11-11): the fold-realism threshold
  flaked because the true fold rate is 29.3% and the
  old band sat ~1 sigma away. Moved to N=200/folds<=90
  (~4.9 sigma). Measure first, bands many sigma away
  (the v1.8.120 rule, re-learned).
- /tmp does not survive restarts (v1.8.209, 2026-11-11):
  a restart wiped a whole workstream's working copy,
  probes, and patch mid-session; the fix was re-applied
  from a recorded edit list (~/workspace/ws3-reapply.py).
  Save patches and re-apply scripts under ~/workspace,
  never only /tmp.
- An uncalled take-back is not a win (v1.8.210,
  2026-11-11, Kevin iPhone "2 people won"): hero bets
  600 with QQ, a short villain is all-in for 100 with
  AA and wins the only contested pot (200); hero's 500
  overbet returns uncalled. The engine is correct — one
  contested winner plus one uncalled entry — but the
  banner read "Alice & You take 700". `onHandEnd`
  built winnerIdx as the union over ALL e.winners
  entries including uncalled take-backs, the one place
  that didn't apply the uncalled filter everything else
  already uses. That list feeds the banner title, the
  gold seat rings, and the tilt wonSet. Fix: skip
  w.uncalled when building winnerIdx (fallback to the
  full union only if no pot was contested, so the title
  can never render empty); title amount is the sum of
  contested pots, not e.pot. Soak rate ~1% of showdowns.
  Bonus: engine _showdown refund entries carried
  potIndex 0 (inner forEach param shadowed the pot
  index) — renamed pi to idx.
- Rohan aggression threshold re-measured (v1.8.210,
  2026-11-11): the v1.8.209 bot retune moved Rohan's
  true aggression 3.9% to ~6.8% (sets now lead), so
  the 8% bar sat ~2 sigma above the mean and flaked
  (81/1003 = 8.07%). Measured 10x60-hand runs: mean
  6.76% sd 0.57%; 600-hand run 6.35% (621/9780). Bar
  moved to 10% (mean + 5 sigma ~ 9.6%). Same v1.8.182
  discipline: measure first, threshold >=5 sigma above
  the true rate — a bot retune moves test thresholds
  too, so re-measure the pinned rates after any
  retune.
- Revert the v1.8.211 layout (v1.8.212, 2026-11-11, Kevin
  iPhone "looks worse"): the in-flow hero bar shrank the felt
  and the seat ring percentages assume a near-full-height
  felt, so the seats bunched at the top with a huge empty
  green below and the pot pill overlapping Rohan's seat.
  Restored the v1.8.210 layout exactly (fixed hero bar,
  visible topbar, 200px reserve, original folded-card
  dimming). The v1.8.209 bot retune and v1.8.210
  two-winners fix are untouched. KEPT from 211: the
  fold-realism top-pair bar >=29 (test calibration for
  the 209 retune, not visual — reverting it reintroduces
  the station 33/40 flake). Correction to this entry's
  first draft: the 211 diagnosis of the dead 200px reserve
  was RIGHT — the `#screen-table { padding: 0.5rem; }`
  shorthand (later 900px block) resets padding-bottom to
  8px, so the felt runs ~200px too tall and the bottom
  seats sit at the panel edge. Restoring the reserve is
  still NOT the fix: it would shrink the felt and bunch
  the ring (the 211 look). The card fix ships separately
  in v1.8.213 as a seat nudge instead. Revert mechanics:
  restore the good-SHA files via git archive, bump to a
  NEW version, and delete a release-only test file with
  github-delete.py AFTER the push — push.py cannot
  delete, and deleting locally first makes
  verify-push-list.js fail (it diffs against the tip
  and demands the deleted file in the push list).
- Bottom-seat cards clear the panel with a seat nudge,
  not a reserve restore (v1.8.213, 2026-11-11, Kevin
  iPhone on the restored 210 layout): measured on the
  screenshot, the bottom-ring cards' centers sit at ~464
  CSS px against the panel top at ~474, so the bottom
  ~30% of each 48px card is covered. Root cause is the
  dead 200px reserve — the `#screen-table { padding:
  0.5rem; }` shorthand (later 900px block) resets
  padding-bottom to 8px, so the felt runs ~200px too
  tall. Restoring the reserve is the WRONG fix: it
  shrinks the felt and bunches the ring (the 211 look
  Kevin rejected). The fix moves only the two
  bottom-ring seats up in mobilePos (y 45 -> 40, ~40px
  on a phone felt) and raises folded/dimmed opacity on
  mobile only (0.75 / 0.55, from the 0.45 x 0.35 double
  -dim). Test-first: the new component assertions fail
  exactly 4 checks on the unfixed tree (2 seat
  positions, 2 mobile opacities) and pass after. Lesson:
  when a layout reserve is dead, restoring it changes
  every percentage that assumed the tall container —
  move the content instead. Also: a grep for a
  single-line pattern misses multi-line CSS blocks —
  the shorthand that kills the reserve was found by
  reading the block, not by grepping `padding-bottom`.
- Emergency rollback to the device-proven version
  (v1.8.214, 2026-11-12): Kevin reported the app stuck
  on dark mode and not dealing after the 212/213
  revert. Diagnosis found no code break: live files
  byte-match the tip, version identity exact, livetest
  10/10, full suite 0 FAIL lines, the 212 revert
  restored 210's code files exactly, and 213 changed
  only 4 lines. The symptoms match a phone still
  rendering stale 211 assets exactly — 211 hides the
  topbar, which holds the theme toggle, so that page
  has no way out of dark mode. Rollback target is the
  last version Kevin himself verified on his phone
  (1.8.208, Nov 11 showdown played through), NOT the
  last version that looks right on paper (210 was
  never played on-device). The 209 bot retune and 210
  two-winners fix ride out temporarily and return in
  small verified steps once 214 is confirmed on the
  phone. Two mechanics learned: (1) never blanket-sed
  a version string across the repo — `sed s/1.8.208/
  1.8.214/g` rewrote historical references in
  AGENTS.md, CHANGELOG.md, and a test comment; bump
  version strings only in the six bump files, and
  check the rest by hand. (2) A backgrounded suite
  can die with the wrapper shell before the NPM_EXIT
  echo (service-restart pattern, fourth sighting) —
  the stage evidence (every suite printing pass, 0
  FAIL lines, final stage re-run directly exiting 0)
  still stands, but the exit code must be re-captured
  by re-running; never report a suite green on stage
  output alone without saying the exit capture was
  lost.
- Card fix re-applied on the rollback (v1.8.215,
  2026-11-12): the v1.8.213 seat nudge + mobile
  opacity fix, re-applied unchanged onto the v1.8.214
  (v1.8.208) tree — two seat lines, two CSS lines,
  the same 9 component assertions (header re-pointed
  at 215/208). The fix is layout-independent of the
  209/210 changes, so it ports cleanly; the test
  pins the fixed hero bar against the 211 in-flow
  regression on the 208 layout too.
- Phone ring re-spaced on a true ellipse (v1.8.216,
  2026-11-12, round 1 of the mobile polish): the
  old hand-placed mobilePos bunched the left/right
  pairs (Alice-Donald -14px, board-Alice -27px,
  adjacent gaps -14..+41px). The ring is now an
  even ellipse (ax 36.5, ay 22, centre 30%) in
  `seatPos` only — no CSS, no hero-bar move, no
  211 change. Two model corrections made the fix
  possible: mobile seats are 72px wide (max-width
  72px, border-box, final 900px block), NOT 102px,
  and community cards are 38x54 (final cascade),
  NOT 44x62 — the earlier "impossible at 390px"
  conclusion was an artifact of the wrong sizes.
  A CSS file with a dozen competing same-specificity
  900px blocks must be read last-rule-wins: the
  live value is the LAST block's, and the hero
  cards measuring exactly 36x50 on the screenshot
  proves the cascade reading (that is the final
  block's value). The geometry harness is
  `tests/seat-ring-geometry-test.js` (39 suites):
  felt vw-29 x vh-211, seat 74x96 (showdown-tall,
  the binding state), board (50%, 32%), panel top
  vh-502 — it fails 13 checks on the unfixed tree.
  The old `tests/test.js` seat check assumed a
  440px-tall phone felt; the live felt is ~745px
  (the dead 200px reserve), so it is re-calibrated
  to 411x745. Pixel-component screenshot analysis
  is unreliable at 3x downsample (JPEG + text
  blending merges seats into the felt gradient and
  splits them at glyphs) — use it only for coarse
  anchors (felt top/height, pot centre, panel top)
  and trust the cascade + the analytic harness for
  sizes. Short-screen limits, pinned in the test:
  390x844 has the river community touching
  Donald/Nathan ~10px and the hero 35px under the
  panel; 375x812 a 2px pair corner touch, hero
  51px under; 375x667 is out of scope (visible
  felt ~165px, no ring fits under a 224px action
  bar — the hero bar still carries the hero, so
  play is unaffected). Round 2 is the short-screen
  panel boundary (compact the hero bar under 900px
  height) + folded-seat label contrast in light
  theme.
- Short-screen hero-bar compaction (v1.8.217, 2026-11-12, round 2 of the
  mobile polish): under 900px height the bar compacts (one-row controls at
  22% each, hero cards 32x44, hero-meta on one line, tighter padding;
  panel top vh-316 -> vh-257) and the community cards shrink 38x54 ->
  32x46, clearing the hero at 390x844 (+24px, was -35px) and 375x812
  (+9px, was -51px) and the board-Donald touch (+5px at 390, was -10px;
  375 a 0.7px corner graze, was -16px). The geometry suite reads the CSS
  for the compaction block and only models the compact panel when it is
  present, so it fails 4 checks on the pre-fix tree; the community row's
  top edge is fixed by the pot (boardTop+39), the shrink eats from the
  bottom edge only. Two planned levers were killed by measurement: the
  turn-status is ALREADY display:none on mobile (line ~1565), so hiding
  it saves nothing, and moving the board 32% -> 30% pushes the pot 4px
  into swimkev's seat at 390px, so the board stays at 32%. The mobile
  bet label needed no fix either: it is already hardcoded bright blue
  (#7db8ff) — only the light-theme stack colour (dark gold #8a6d1f on the
  dark seat) and the folded opacity (0.85, light theme, mobile only)
  were real. Edit-tool lesson, second sighting: an old_text that ends
  mid-branch leaves the original branch body behind and duplicates it —
  include the whole branch (or the whole function) in the match, and run
  node --check after any structural test edit before the suite.
- Position is measured over live players only (v1.8.220, 2026-11-12):
  `positionScore` built its acting order over every seat including
  players who had already folded — with the villain on the button and
  six folded, a late-seat hero scored 0.8 ("in position") while acting
  first, so the coach advised as if the hero had position in a common
  heads-up-after-folds spot. It now skips folded players alongside
  sitting-out ones. Found because lab spots that should have pinned an
  out-of-position check all advised "bet" pre-fix; the Lag control
  failing pre-fix was the injection evidence, and the mid-fix lab run
  (position fix alone: Lag passes, Station/Nathan fail "check") proved
  the causal chain before the thin-value fix landed.
- Paired probes remove re-sampling noise (v1.8.219, 2026-11-12): the
  first unpaired EV probe said Station 1.0x was WORSE than 0.75x (-33)
  — re-sampling noise; the paired design (same 1,000 hands at every
  size) said +33. Same-hands-at-every-size is the design for size
  comparisons. Tie EV must be size-correct: a called tie splits the
  (500+S) pot, net (500-S)/2 — the first probe hardcoded +250 (tie
  counts were tiny, conclusions stood, but the formula is fixed in the
  paired probes).
- Bluff sizing vs overfolders is already optimal (v1.8.220 negative,
  2026-11-12): a 1/2-pot bluff folds ~40% vs rock/lag/maniac, 1/3-pot
  only ~13-22%, 2/3-pot the same ~40% at higher cost and far more
  raises. No change; the probe is kept at
  hidden_files/bluff-size-probe-219.js.
- Literal source assertions break on refactors (v1.8.221, 2026-11-12):
  the v1.8.208 scenario test pins the all-in nut-raise message as a
  source literal ("about 3x their bet"); the variable multiplier broke
  it (first suite run 207 passed, 1 failed). Update the assertion to
  the new shape, same intent — the v1.8.195 lesson, re-learned.
- Shell-precedence trap, re-learned twice (2026-11-12): `cd X &&
  (cmd) &` backgrounds the ENTIRE `cd && (...)` list, so the foreground
  shell never changes directory and a later relative-path command fails
  with "no such file". Use absolute paths in status checks; never chain
  a backgrounded command with a foreground one in the same exec.
- ci-diagnose `check` can omit the pages run (v1.8.219, 2026-11-12):
  for c0c7ff69 it listed only the tests run even though the deploy had
  happened (live version.txt and app.js both served 219). Verify the
  deploy from the live files, not only from the run list.
- Solver-lab 3-failure baseline was flake, not a bug (2026-11-12):
  the fresh-eyes coordinator's lab run on the 1.8.218 tree showed 98
  spots, 3 failures — Monte Carlo flake on close spots (runs 2-4:
  98/98 pass) plus mid-iteration state (spots added before their fix).
  All five of the day's lab runs on stable trees passed (95, 98, 101,
  104, 104 spots, 0 failures each, EV loss 0).
- Push/fold prize caps at the matched call (v1.8.224, 2026-11-12): the
  drill priced a call against the shover's FULL stack — a 30bb shove vs
  a 10bb hero quoted a 41.5bb prize (need 24%) when the unmatched 20bb
  returns and the true prize is 21.5bb (need 46.5%). Rule: the prize is
  the pot plus the matched call from each side; an all-in shove's excess
  is not money you can win. The tier-6 range label was '?' (Maniac) —
  tier labels are cumulative shares, and the Maniac's own desc says
  ~65%.
- Card-count street mapping is not arithmetic (v1.8.225, 2026-11-12):
  history labeled the street as `['preflop','flop','turn','river']
  [Math.floor(board / 2)]`, so a 5-card board read "saw turn" — the
  counts 0/3/4/5 do not divide evenly into the four streets. Map the
  count explicitly (0 preflop, 3 flop, 4 turn, 5 river) instead of
  deriving the street from a formula.
- Scope CSS flattening rules to the class they mean (v1.8.226,
  2026-11-12): `.bet-panel button` flattened EVERY panel button —
  including gold Confirm — because the rule was written for the
  quick-chip buttons but addressed the container. A flattening rule
  with `!important` must name the exact class (`.bet-panel
  .chip-btn`); a container-wide selector silently swallows later
  primary/ghost styles. The same release caught light theme drifting
  the winner ring gold→green and folded seats at 0.85 (barely
  distinguishable) — pin the intended values in the component suite
  or a later release re-drifts them.
- Coach copy must not state what it cannot know (v1.8.232,
  2026-11-13): the river veto claimed the river "completes the hands
  he called with" on blank rivers; the board-play fold hardcoded
  "a Queen or a Seven" for every board; the semi-bluff quoted the
  pure-bluff break-even for a hand with ~35% equity when called.
  Each was a plausible-sounding sentence that was false in the
  general case. When a claim depends on the specific cards, compute
  it from the board (paired ranks) or drop it — never hardcode a
  rank, a card, or a number the situation does not guarantee.
- One visible label per screen (v1.8.233, 2026-11-13): the hand log
  was Hands / History / Hand history / Recent hands across five
  places. A disabled button with no reason is the same class of bug
  as a wrong label: the online lobby's Start button now says why it
  is disabled. When renaming, grep the whole tree for every variant
  — the modal title and the tab aria-label were two more instances
  the first pass missed.
- Count assertions from per-suite finals, not from the log's progress
  lines (v1.8.234, 2026-11-13): the component suite prints its
  running total 11 times per run, so summing every "N passed" line
  in the log overcounts by ~1,800. The honest total is the sum of
  each suite's FINAL count (4,114 in the v1.8.233 run, before the
  suites that print no count) — so README says "4,000+", not the
  "5,000+" a naive sum suggests. Same rule as the docs' own warning:
  exact numbers rot; floors survive.
- Flag-gated UI hides in HTML, not in JS (v1.8.234, 2026-11-13):
  the Heads-Up and Push/Fold mode cards rendered and were then
  hidden by JS — a flash of shipped-but-hidden UI. Put `hidden` on
  the element and let JS un-hide it when the flag is on. Check the
  CSS first: an author `display` rule beats the `hidden`
  attribute, so this only works when the class sets no display.
- Real nuts need a board check, not a category (v1.8.227, 2026-11-13):
  any straight-plus hand was 'the nuts', so a Ten-high straight on a
  three-flush board got the near-nuts lesson and the river-veto exemption
  and was shoved into a trapper's big bet. `isCurrentNuts` decides from
  the board (flush possible, board paired, a higher straight/flush/full
  house/quads/straight-flush still makeable, counting the cards left in
  the deck); anything straight-plus that fails it is 'madehand'. The
  quads check must count what the board rank still needs: board trips
  need 1 more card, not 2 (the first draft missed it and the full suite
  caught it). Near-nut full houses that lose only to a one-combination
  quad now call on veto math instead of raising in trapper spots — the
  trade-off is documented, not hidden.
- A recap grades the decision, not the result (v1.8.228, 2026-11-13):
  praising a win after the coach was ignored ("Your play got through")
  teaches the wrong thing — the win is luck, the leak is the lesson.
  When a strong decision was disobeyed, the recap names the ignored
  advice and says nothing about the win; praise survives only when the
  coach was followed or no strong decision was recorded.
- Measure the turn before extending a river rule to it (v1.8.229,
  2026-11-13): second pair vs a station bets the turn (+76/+73 over
  2000 seeded runouts) — but only with the river bet included in the
  model, since that is what the coach actually does there. A
  checked-through river understates both lines out of position. The
  leak tracker mirrors every coach extension in the same release, or
  coach and tracker disagree about the same spot.
- Gross checks belong only where the range sim decides (v1.8.230,
  2026-11-13): measure the seeded equity BEFORE adding a grossCheck
  flag. The top-pair fold vs Rock's pot bet measured 62.8% seeded eq
  against a 33.3% price — the check would false-fail a correct fold,
  because the open range cannot price a tight player's pot bet (that is
  why the tight-player guard exists). Bypass, narrowed-range, air-cap,
  veto, and trapper spots are excluded for the same reason: their
  decisions rest on non-range factors the open-range sim cannot see.
  The seeded sim is deterministic (seeded by spot name), so a passing
  gross check cannot flake.
- A range note describes the bet-size range, not the profile
  (v1.8.230, 2026-11-13): a medium bet from Rock was labeled 'wide'
  and the note claimed he "plays a wide range... some air are all in
  there" in the same verdict as "only plays monsters". Qualify the note
  by tightness when the two conflict.
- A tracker rule must mirror the coach branch exactly (v1.8.231,
  2026-11-13): the missed semi-bluff flag fires only on draw-strong
  (flush + straight draw), heads-up, villain folds (>= 0.25) — the
  coach's own gates. A plain draw is only marginal advice, so it is
  not flagged; a Station or a multiway pot is not flagged either.
  Measured first: the semi-bluff is worth ~180 chips over checking
  (combo draw vs a loose range, 2000 seeded runouts).
- Separate stacked iterations by revert-and-reapply, never by file
  restore (v1.8.228–231, 2026-11-13): when two iterations land in one
  tree, revert the later one's edits, run the suite, bump, and push the
  earlier one, then re-apply the later edits with the edit tool and
  diff against a saved backup to prove the re-apply is exact. A file
  restore would revert APP_VERSION to the pre-bump value (the
  v1.8.156–157 trap). Keep the backup under hidden_files/ (gitignored)
  as a reference, not a restore source.
- verify-push-list.js runs before EVERY push (v1.8.228, 2026-11-13):
  it was skipped once (v1.8.227) and the manual list happened to be
  right — run the script anyway; it diffs the tree against the tip and
  catches an omitted file the manual check can miss.
- Service-restart loss, fifth sighting (v1.8.229, 2026-11-13): the
  full suite died by SIGTERM 2.4 minutes in with a 9-line log. Re-ran
  from scratch; green. The log-file discipline is what makes the loss
  visible instead of silent.
- AGENTS.md is the 30-second version again (v1.8.235, 2026-11-13): the loop-ops lore (1002 lines, 112 bullets) moved verbatim to docs/AI-WORKFLOW.md — verify the move by bullet count, not by reading. Two stale bits fixed in the trim: the checklist said "five places" (it is six — README's (vX) was missing) and "push via the GitHub connector" (the loop uses push.py). The diagnostic-branch CI trick is gone, superseded by ci-diagnose.py.
- The big blind is an 'open' spot too (v1.8.236, 2026-11-13): preflopSpot() returns 'open' whenever toCall is 0, which includes the BB facing limpers — the branch returned the free-flop check before the isolate logic ran. The BB now gets the isolate raise (same 3 + limpers sizing as the facing-open branch) for tier <= 3 vs 1–2 limpers. The lab could not represent the BB until the harness took an optional heroBet (it hardcoded the hero's bet to 0, so currentBet was 0 and minRaiseTo undefined) — a spot that cannot post the blind cannot pin BB advice.
- Missed-value monster line is a flush or better (v1.8.237, 2026-11-13): the leak tracker only flagged quads+ (madeStrength > 0.88); a full house is exactly 0.88 and a flush is 0.80, so both slipped through while the coach bets both for value. The line is now >= 0.80; a straight (0.72) and trips (~0.65) still do not flag. Mirror checked first: the river value branch bets every made hand from trips up when first to act, and the maniac-trap check that would break the mirror never fires for any shipped bot (needs bluff > 0.6 with aggression > 0.5; Maniac bluffs 0.55, Rohan 0.68 but aggression 0.05).
- ESLint is not in the test chain or CI (v1.8.238, 2026-11-14): v1.8.236 shipped a duplicate `var isoMult`/`isoTo` in coachPreflop that only the loop's Phase 0 eslint gate caught — the full suite and CI were green with the lint error present. Phase 0 is the only gate for lint; never skip it.
- Service-restart loss, sixth sighting (v1.8.238, 2026-11-14): the full suite died mid-run by service restart with a 9-line log and no exitcode file. Re-ran from scratch; green. The log-file discipline is what makes the loss visible instead of silent.
- madeStrength double-counts a made straight's draw (v1.8.241, 2026-11-14): detectDraws reports oesd for any 4-rank span-3 window even when the straight is already made, so a 9-high straight priced at 0.82 — flush territory — on the turn and flagged as a monster. The river forces oesd off, which is why the river control never caught it. A made straight or better no longer takes the oesd/gutshot bonus; the flush-draw and overcard bonuses stay, since those are genuine improvements.
- Backlog items verified stale (2026-11-14): the river veto already uses estimateEquityVsMadePoolMulti (shared-board exact enumeration, not the power rule), and every non-gross-checked facing spot is in a deliberately excluded class (bypass, narrowed-range, air-cap, veto, trapper, tight-guard) per the v1.8.230 exclusions. Verify each carried-forward item against current code before working it.
- Station fold cliff is a need threshold (v1.8.240, 2026-11-14): the Station folds air only when need >= 0.30; a half-pot bet prices 0.25, so it calls with nearly everything including overcards. Sizing conclusions from probes must state the need they price — the same bet size folds a different share at different pot ratios.
- Probe accounting check (v1.8.239/242, 2026-11-14): potTotal() is pot plus current-street bets, so a probe's t.pot must exclude a villain bet already counted in the players' bets — setting t.pot to 750 with the villain's 250 bet in place double-counts. Read potTotal() before trusting a probe's pot.
- The maniac trap never fires (open, 2026-11-14): the coach's trap branch needs bluff above 0.6 with aggression above 0.5, and no shipped bot satisfies both (the Maniac bluffs 0.55, Rohan bluffs 0.68 but never raises). Whether the threshold should admit the Maniac is an open question for a future run — it needs a trap-vs-bet EV measurement first, not a threshold tweak on principle.
- Coach dot is a fresh-advice signal, not a tip-written signal (v1.8.243, 2026-11-15): coachTip lit the Coach tab dot for any tip written while the panel was closed, so the first-run intro lit it before any decision existed. The dot now lights only when the conductor passes a fresh flag, set solely by the on-action verdict call; the intro and the hand-end recap do not light it, and clearing the tip clears the dot. Same version: advice persists in the Coach tab because the tip HTML is kept in the DOM when the strip hides — the tab renders the last advice until new advice replaces it — and hand end gains a one-tap Show hands reveal (display-only; the engine-revealed map still drives tilt and hand records, and the next hand starts mucked).
- Solver-lab flake, another sighting (v1.8.243, 2026-11-15): the lab failed 1 spot once (EV loss 0) on a tree whose only changes are UI display logic, then passed twice consecutively (126/0, 126/0). The failing spot name was lost because the run's output was tailed; always save full lab output when a run flakes so the spot can be identified and seeded.
- Probe handRec shape (v1.8.244, 2026-11-15): setHandRec takes { timeline }, not the bare array — passing the array makes handRec.timeline undefined, so villainSizingTell returns null and the coach silently falls through to the nut branch (4x) instead of the small-bet branch (3x). The probe then "proves" the wrong mult. Any probe that builds a table must pass the object, and a coach verdict that ignores an obviously small bet is a sign the timeline never arrived.
- Sizing flags run before the advice-followed return (v1.8.244, 2026-11-15): detectLeak returns null when the action word matches the advice, so a bet or raise that is the right action at the wrong size is swallowed — the sizing checks (under-raised nuts, under-bet value) must run before that early return, with the amount passed through from heroAct. Same version: the nut-raise mult is universal, not station-gated — the coach raises the nuts 4x vs a station and 3x vs everyone else (3x on a small bet), so a call is a leak against a Rock too; the foldy gate that limited the flag to stations was wrong and a probe caught it.
- Board-playing hands are not monsters (v1.8.244, 2026-11-15): when the board itself is the flush, the hero plays the board and the coach checks — but madeStrength 0.80 flagged the check as a missed value bet. The monster line now skips handClass 'board'; on the flop and turn 'board' is impossible (best-5 needs five cards), so the guard only matters on the river.
- Bare sed on a threshold prefix-matches longer numbers (v1.8.246, 2026-11-15): reverting the maniac gate with a sed that replaced `> 0.6` with `> 0.5` also rewrote an unrelated `> 0.65` to `> 0.55` on a different line — sed replaces a prefix of a longer number. Never bare-sed a numeric literal; use an exact edit with full-line context, and re-grep every match of the pattern after any sed. Caught by grepping the threshold lines before the gates; the corrupted line was restored and the gates re-run.
- The maniac trap now fires (v1.8.246, 2026-11-15): closes the 2026-11-14 open item — measured, not tweaked on principle: trap +353.2 chips/hand (SE 11.5, N=2000 paired) on the flopped nut flush vs the Maniac. Gate is bluff > 0.5 with aggression > 0.5, admitting exactly the Maniac among shipped bots.
- Turn-status restore is geometrically unsafe (v1.8.251, 2026-11-15): restoring #screen-table .turn-status on mobile adds ~23px (1.3em min-height + 0.3rem margin) to the hero bar, moving the action-panel top up by that much. The geometry test's heroPanel margins are 7.1–23.8px across the four measured viewports (440x956: 18.6, 430x932: 7.1, 390x844: 23.8, 375x812: 8.5) — every viewport would drop below the >=4px clearance, reintroducing the v1.8.215 hero-seat overlap. The geometry test uses hardcoded panelTop (vh-502/vh-443), so it would NOT catch this — the margin must be checked arithmetically from the test's printed heroPanel values before restoring any hero-bar row. Dropped as an iteration; the coach-dot bump shipped instead.
- Leak tracker trusts pendingAdvice (v1.8.256, 2026-11-15): detectLeak's advice-followed early return reads pendingAdvice, which onAction sets from the live verdict — so in the live app a trap-check vs the Maniac is correctly not flagged, but in the test harness pendingAdvice is null and the monster line flags it. A test that asserts "no flag" must set the advice first (new __coachTestHooks.setPendingAdvice, reset to null after so later leak tests see the default). Do not "fix" this by recomputing the verdict inside detectLeak — that would double the equity sims on every hero action; the cached advice is the design.
- Depth gates block equity calls (v1.8.257/258, 2026-11-16): the facing-3bet and facing-4bet branches gated every call behind a stack-depth threshold (40bb / 30bb) even when the hand was a big equity favorite at the price — AKo vs a Maniac 3-bet at 25bb folded at 63% vs a 43% price. Depth changes implied odds (set-mining), not whether a favorite's price is right. Fix: gate only the set-mining path on depth; an equity edge calls at any depth. The small-pair branch already did it right and is the model.
- Probe-villain fidelity in preflopVerdict (v1.8.257, 2026-11-16): with liveCount 3, pickVillain takes the archetype-less player 2 (bigger bet) and prices the hand against tier 3, not the named villain's 3-bet tier — the KQs-vs-Rock control called until liveCount was 2. The 4-bet test needed the same care plus a reframe, because the helper hardcodes hero bet 0 (so the all-in branch, which was never gated, would have swallowed the test). When a test names a villain, verify pickVillain actually returns that villain's archetype — check which player holds the biggest bet, and which branch the setup really reaches.
- Probe labels can be wrong — verify the board, don't inherit the name (v1.8.260, 2026-11-16): the probe's "trips-nuts-turn" board 7-2-5-9 is NOT the nuts — a set of 9s and a 6-8 straight both beat trip 7s. The turn raise spot uses trip Kings on K-9-2-5 instead, and 7-2-5-9 ships as a call control. A probe's name is a claim, not evidence; re-derive the classification from the board before pinning it.
- Effective-nuts definition for trips (v1.8.260, 2026-11-16): trips are the effective nuts iff the trips rank is the board's top rank on an unpaired board with no 3-flush and no three board ranks inside a 5-rank window (ace counts low, so A-2-3 is straight-possible). Then the nut-raise branch, commit-call branch, river-veto carve-out and tracker nut-call flag all follow from the same handClass — one classification change, four mirrors. Two pair and overpair can never be the nuts (a set of the top board rank is always possible).
- Tracker mirrors must copy the coach's full condition, not the common case (v1.8.261, 2026-11-16): the second-pair flag only covered foldy < 0.25, but the coach bets on a four-way disjunction (in position, scare card, foldy > 0.5, foldy < 0.25) — so it stayed silent while the coach bet second pair in position vs a LAG on every street. Three LAG no-flag tests had the wrong premise baked in ("coach checks there too"). When a tracker test asserts "no flag", verify the coach takes the same action in that exact setup, button included — postflopLeak hardcoded button 0, so the OOP controls needed a button parameter.
- Pattern tests pin code shape, not intent (v1.8.257/260/261, 2026-11-16): three releases each broke a coach-scenarios pattern test that pinned the old expression verbatim (the call2 gate, the cat-3 one-liner, the foldy<0.25 tracker line). Updating the pattern test is part of the change, not a regression — but the new pattern must still pin the invariant (trips still map to 'trips' unless the effective nuts; the tracker still names the street).
- Full-suite runtime varies 5–14 minutes (2026-11-16): the same suite took 5.4 minutes once and 13.5 another time (randomized sweeps), so judge a run by its exit code and FAIL count, never by the clock. A runtime restart also killed one CI-check command mid-flight with no recorded result; re-running a read-only check is safe, but never re-run a push blind.
- A semi-bluff raise needs fold equity against the BETTING range, not the generic fold rate (v1.8.262, 2026-11-17): the draw-raise branch used foldy (1 - stubborn), but a villain who bet has a made-hand range — top pair and second pair fold 0/200 to a 3x raise for every villain, and the paired sim loses 385 chips/hand vs Rock's top pair (478 vs a Maniac's). The branch is deleted; draws call or fold on equity. The leading semi-bluff (betting a draw when checked to) is a different spot — the villain has shown no strength there — and is unchanged. Same lesson for the tightBigBet guard: a wide-overbet exemption must be scoped to hands that beat the overbet range (overpair+), because the coach's "strong range" sim prices one pair vs a tier pool that includes hands the villain never bets — KQ looks like 70% but its true equity vs Alice's overbet range is ~13%.
- Probe-stub fidelity, jsdom edition (v1.8.262, 2026-11-17): `new w.PokerTable(...)` from Node throws (the constructor is not a window property from outside the jsdom context) and `botDecide(table, 1)` silently misbehaves — it takes the player OBJECT, not an index — while `evaluate7` returns an object, so comparing two results directly is always false and exactEq reads 0.0%. The working pattern is the Node require guard (`require('../js/engine.js')`, `require('../js/bots.js')`, `require('../js/evaluator.js')`), `t.startHand()` then the street/board/pot, `t.acting = 1`, `BOTS.botDecide(t, v)` with the player object, and `.score` from evaluate7. Run any probe against one known-good hand first: the overbet probe's AA 56% and the exactEq AA-vs-AA 50.0% are the controls.
- Shell-precedence trap, backgrounded lists (2026-11-17): `cd X && (cmd) &` backgrounds the whole list, so later commands run in the wrong cwd and logs land nowhere. Use absolute paths and `nohup <cmd> > <abs log> 2>&1 &` with no `cd &&` prefix.
- A wide-overbet exemption must be scoped to hands that beat the overbet range (v1.8.263, 2026-11-17): Alice overbets AA 56%, sets ~52%, two pair ~50% and KQ 39% on the turn, so the tightBigBet guard wrongly folded her overpair — but a broad exemption flips top pair KQ to a call at 70% coach-implied equity, while its true equity vs her overbet range is ~13% (exact enumeration, frequency-weighted over her tier-1 overbet range; calling loses ~392). The coach's "strong range" sim overstates one pair because its tier pool includes hands Alice never bets (JJ, TT, AT, AJ bet 0% on Q-7-2-5). The exemption lifts only for overpair/trips/twopair/madehand; the exact enumeration, not the sim, is the evidence. The overbet probe's control is the botDecide setup (startHand, acting=1, player object) — the first version passed an index and measured 0% everywhere.
- A big river bet is value-heavy from every villain, not just tight ones (v1.8.264, 2026-11-17): the Maniac bets large 100% with made hands and ~0% with air on the river (and the LAG/Amogh/Station/Rock bluff air 0-4% there), yet the coach called third pair at 41-44% vs a tier-6 pool. The tier pool and the Pair+ pool both overstate marginal hands on the river — the Pair+ pool gives third pair 37.8% because it is dominated by weak-pair combos the villain would never bet — so the fix is a guard, not a re-pricing: one pair or less folds to a river bet of 0.7x pot or more from any villain. The 0.7x threshold matters (the tell's 'large' bucket starts above 0.8x, missing the Maniac's standard 0.74x bet), and the kevin-river spots are unaffected because their heroes hold trips+. Lab flake, same class as v1.8.243: madehand-flush-trapper-raise failed once (raise to 300, not 400) then passed — the trapperValue gate sits on a Monte Carlo adjEq threshold (≥0.90) that wobbles for the nut flush on a paired board. A spot that pins an exact size through a Monte Carlo threshold will flake; re-run before concluding it is a regression.
- Pricing vs the betting range, not the playing range (v1.8.265–269, 2026-11-18): the tier pool is the villain's PLAYING range — it includes weak hands he checks — so it overstates every marginal hand facing a bet. The fix, in order: air vs the made range (Maniac bets air 9.1%/3.2%/1.9% flop/turn/river, LAG 4.7%/1.5%/1.4%; ace-high was priced 35–55% vs true 2–15%); weak pair vs the made range (pair of 2s priced 36–50% vs true 11–23%); second pair vs the pair-plus pool (uniform made is bottom-pair heavy — villain bets weak pairs 1–6% — so it priced second pair 42–49% vs true 15–28%; pair-plus gives 22% flop / 16% turn); weak pair vs the pair-plus pool too (handClass only knows top/second/bottom, so a middle pair like 7s on a Q-9-7 river is 'weakpair' and the uniform made pool priced it ~40% vs true 1–16%). Probe 3 (96 flop/turn spots, exact enumeration) went 21 → 0 flags; the river audit (72 spots) went 12 → 7. The tracker mirrors each price for bad-chase (v1.8.268) with a separate chaseEq so the weak-fold check keeps the tier equity — reassigning eq would have dropped real weak-fold flags.
- A lab spot can encode the tier-pool error (v1.8.267, 2026-11-18): facing-2ndpair-rock-call expected a call from tier-pool seeded eq 40.1%, but exact enumeration shows second pair 8-7 wins 19.5% vs the Rock's flop betting range at a 33% price. When a pricing fix flips a lab spot, measure the truth (probe 6: Rock bets 126/1081 on the flop, 11.7%) before assuming a regression — the spot was wrong, the fix was right.
- Test-fixture hoisting trap (v1.8.268, 2026-11-18): using a `var` fixture before its declaration makes it undefined; JSON.stringify(undefined) writes the literal `undefined` into an injected script, so the table's community is undefined, handClass throws inside detectLeak, and the catch swallows it — the test sees a null leak with no error. Declare shared fixtures before first use; a null leak result with no error is the signature of the swallowed exception.
- Top pair / overpair on the river needs a villain-aware betting-range model (open, 2026-11-18): QJ wins 46% vs Maniac, 34% vs LAG, 7% vs Rock on the river; KK wins 55%/47%/22%. The tier pool understates QJ vs Maniac/LAG and overstates it vs Rock; the uniform made pool quotes ~70% and the pair-plus pool ~15% — the pools bracket the truth from opposite sides and no single pool matches the spread. Do not ship a hardcoded tight-villain river cap.
- Suite-chain stops at the first failure (2026-11-18): npm test is &&-linked, so a short run with few log lines means it stopped early, not that it was fast. Check the tail and the exit file, not the runtime. A mid-suite CHANGELOG edit is harmless — no test reads CHANGELOG except the version-heading check, which keys off version.txt.
- Preflop Monte Carlo close-spot flake (v1.8.188 spot pf4Ctl, 2026-11-18): QQ vs Rock 4-bet to 300 failed once (got 'call', expects 'fold') and passed on the same code before and after. Same class as the lab flakes — re-run, do not fix coach code to chase it.
- Betting-range truth must be measured at the coach spot's game size (v1.8.270, 2026-11-19): probe 7 and the flop/turn full-enum probe both built a FOUR-player table, so the bot's bet line ran on equity vs THREE random opponents — but the coach spots they audited are heads-up, where the bot's equity is vs ONE random opponent and every villain bets far wider (Rock bets 16.8% of holdings 4-handed, 40.9% heads-up). The heads-up truth on Q-7-2-5-9: QJ 76%/74%/64% vs Maniac/LAG/Rock (not 46%/34%/7%), KK 79%/77%/70% (not 55%/47%/22%), second pair 38%/30%/6% (not 16%/9%/1%). Four of probe 8's seven flags were false flags from the mismatch. A probe's table size IS part of its contract — the truth probe must use the same live-opponent count as the coach spot it audits. Closes the open 2026-11-18 top-pair/overpair item: no pool matches the spread because the spread itself was mismeasured; the analytic betting-range price matches all 18 hero x villain combinations exactly.
- Analytic betting-range price (v1.8.270, 2026-11-19): `estimateEquityVsBettingRange` in js/equity.js prices a river one-pair hand against the villain's actual betting range by applying the bot's own bet rule (bet if equity vs one random opponent > 0.62 - aggression*0.22 + 0.04 or madeStrength > 0.74, else bluff at bluff*0.22 when madeStrength < 0.55) to every holding, exactly enumerated. It reproduces the heads-up truth to 0.1% on all 18 combinations and costs ~180ms per call in Node. Two fidelity details matter: the equity-vs-one-opponent universe must include holdings with the hero's cards (the bot does not know the hero's hand — excluding them cost 2.2 points on second pair vs Maniac), and it applies ONLY to generic-rule villains — Alice/Amogh/Donald/Nathan have custom river logic and Rohan/Station have neverRaise (their river bets are only bluffs and monsters), so they keep the pool price. The riverBigValue/tightBigBet vetoes stand down only for a LONE river bet (villainFirstRiverAggro) whose analytic price clears need, and the +0.03 river prior is zeroed for analytic-priced spots (the under-bluffing is already in the price — keeping it kept second pair vs LAG 200 a fold). The v1.8.264 veto and its tests/lab spots are corrected, not just overridden: the "~18%" behind the veto came from a 22-holding sample that omitted the worse-pair mass; value-only enumeration still gives QJ 74% vs the Maniac.
- Probe labels vs handClass, again (v1.8.270, 2026-11-19): the probe calls 7x on Q-7-2-5-9 "second pair" but handClass returns 'weakpair' (7 is the third board rank), so the first version of the analytic branch (secondpair/toppair/overpair) silently skipped it and the audit stayed at 6 flags. When a probe label and handClass disagree, handClass wins — verify the class from the code, not the label. (Same family as the v1.8.260 probe-name lesson.)
- Leak tracker must mirror the coach's price (v1.8.271, 2026-11-19): v1.8.270 fixed the coach's river price but left detectLeak on the old pools, so it contradicted the coach — flagging a correct call of the Maniac's 200 with second pair as bad-chase (pair-plus ~3%) and a correct fold to the Rock's 50 as a weak fold (tier ~38%). Both checks now use the analytic betting-range price on the river heads-up for one-pair hands vs generic-rule villains, with the pool prices as the fallback. When a price changes, grep for every consumer of the old price — the coach and the tracker price the same decision twice.
- Flop/turn heads-up truth (probe12, 2026-11-19): the same game-size error applied off the river. On Q-7-2, heads-up truth vs Maniac/LAG/Rock: second pair 58%/56%/34%, top pair QJ 77%/76%/67%, weak pair 42%/38%/19%, overpair 79%/77%/73%, air AK 41%/38%/23%. On the Q-7-2-5 turn: second pair 56%/54%/36%, QJ 79%/78%/72%, weak pair 26%/22%/10%, KK 80%/81%/78%, air 25%/19%/12%. The flop/turn audit against this truth is the next iteration — but note the realization gap: raw flop/turn equity vs the betting range assumes the hand reaches showdown with no further betting, so it overstates call EV for air (which folds unimproved) and understates nothing for made pairs (which realize ~85-90%). The river price was exact because there are no future streets; a flop/turn proxy must discount for realization, not copy the raw number.
- Second pair off the river wants the tier price, not the pair-plus pool (v1.8.272, 2026-11-19): probe12's heads-up truth puts second pair at 34-58% on flop/turn, but the pair-plus pool priced it at 15-24% — the pool is uniform over made hands, while heads-up the villain bets worse pairs and air too. The tier range (probe14: 66%/55%/39% flop, 68%/56%/38% turn) is within 12 points of the truth with the same advice at every realistic need, so second pair keeps the tier price off the river and uses pair-plus only as the river fallback. Weak pair is the exception that proves the rule: the tier price overshoots it by up to 28 points (turn vs Rock: 38% vs a 9.7% truth), so it keeps pair-plus pending a betting-range estimator — do not extend a pool fix to a hand class without measuring that class. The v1.8.267 "true 15-28%" and the v1.8.265/266 flop/turn "true" figures were the four-player truth and are superseded by probe12; the air folds still hold (realization), and the weak-pair 0.75x folds still hold, but their cited numbers are stale.
- A pot-sized bet reads as a strong range (v1.8.272, 2026-11-19): the coach's math-line wording for a second-pair call changes with bet size — a 200 bet says "vs the kinds of hands V plays", a 400-into-400 bet says "vs V's strong range" (rangeEqTier). Wording assertions must pin the invariant (e.g. the made-pool line is gone), not the size-dependent phrasing.
- Raising top pair vs a tight player's small river bet loses money (probe15, 2026-11-19): QJ vs the Rock's 100-into-400 river bet — calling is +271, raising to 300 is ~+162. The Rock folds only 0.2% of his betting range to the raise (200 to win 1000 is a 17% price, so almost any pair calls) and re-raises 36.9% of the time, forcing hero to fold top pair. The coach correctly calls; do not add a value-raise branch for top pair vs tight small bets. (Note: the first EV_raise formula omitted the re-raise branch — a raise EV that ignores the villain's re-raise is not an EV at all. Any future raise analysis must price the 3-bet branch, including hero folding to it.)
- A raise EV that ignores the 3-bet branch is not an EV (probe15/17, 2026-11-19): the first raise-vs-call analysis said raising QJ vs the Rock's 100 river bet loses ~109 chips — but it assumed hero folds to any re-raise. Probe17 prices the re-raise range: hero's equity vs it is 44.9% (QJ) / 53.8% (KK), high enough to call a 3-bet profitably at any size the Rock can make, so the raise is actually +EV by ~30 chips and the coach was right to raise. The Rock re-raises 37-41% of his betting range and the Maniac 43-48% — with a wide range, not just monsters — so a one-pair hand can stand the 3-bet. Never conclude a raise is -EV from the fold/call branches alone; always price hero's equity vs the re-raising range and the 3-bet size. (The probe15 note in this file's earlier entry is superseded on the conclusion, not the method: the fold/call measurement was right, the missing branch was the error.)
- The MC betting-range estimator is accurate but too slow live (probe16, 2026-11-19): two-stage Monte Carlo (per-holding eq1 at 100 sims, then 20k joint samples) reproduces the heads-up truth within 1.5 points for weak pair on flop/turn, but costs 43-64s per call — per-sim array allocation and shuffling dominate. A live version needs precomputed scores and no per-sim allocation, a fundamentally faster implementation, not a parameter tweak. Weak pair on flop/turn stays open.
- Fast 7-card evaluator (v1.8.273, 2026-11-20): evaluate7 costs ~110us per call (it enumerates all 21 five-card subsets with sorting and string keys), which is why the flop/turn betting-range estimator cost 43-64s per call. evaluate7Fast composes the best hand directly from rank/suit counts with straights from a rank bitmask — same score encoding, categories and kickers — at ~1.76us per call (~84x faster), verified bit-exact by a seeded differential test (12,021 assertions: 8,000 random 7-card hands, 2,000 each 5- and 6-card, 20 targeted edge cases). The game still uses evaluate7 for showdowns; the fast path is estimator-only. Note for the worker: evaluator.js is imported by the worker bundle, but an additive export does not change worker behavior, so no wrangler deploy is needed for a pure addition.
- Weak pair priced vs the betting range off the river (v1.8.274, 2026-11-20): closes the v1.8.272 open item — the estimator exists now that the fast evaluator unblocks it. estimateEquityVsBettingRangePostflop applies the bot's own bet rule to every holding (seeded, deterministic; 100 sims per holding for the bet line, 6,000 joint draws on shared runouts) and lands within ~3 points of the heads-up truth on all six street x villain combinations (probe18), at ~300-440ms a call — no slower than the pair-plus call it replaces. Two things the lab caught: the range threshold was discounting 6 points for a "wide" range on top of a price that already IS the betting range, so the coach called with 22% against a 25% need vs the Rock — the discount is now zeroed whenever the price is a betting-range price, river or earlier — and the four v1.8.266 lab spots were re-decided (the flop folds were the four-player truth; heads-up they call). The estimator price is board-suit-sensitive (a 7 of spades vs clubs shifts the price ~3 points), so lab and test boards must match the probe boards exactly.
- Every one-pair hand priced vs the betting range off the river (v1.8.275, 2026-11-20): the probe21 audit showed the tier price was off by up to 14 points where it matters — top pair vs the Rock quoted 53% on the flop against a 67% truth, second pair vs the Maniac on the turn quoted 67% against a 56% truth — while the advice was still right at realistic bet sizes (the overbet guard and the threshold absorbed the error). Probe22 validated the estimator for top pair, overpair and second pair first (worst gap 3.0 points), then the coach and the leak tracker both switched to it for all four one-pair classes off the river; the river already priced them this way (v1.8.270), so the coach is now uniform. Trips and two pair stay on the tier price (probe25: within 5 points of the estimator everywhere, same advice — do not extend a price fix to a class without measuring it, per v1.8.272). The archetype-range spot's expected wording had to move from 'kinds of hands' to 'bets on the turn' in BOTH solver-lab and the river-trap test — a wording assertion can live in two files, so grep every test file after a message change, not just the one that failed. Test-fixture hoisting trap, second sighting (v1.8.268 again): the new price-band tests used the Q72 fixture before its var declaration, so the board was undefined and the verdict quoted no price — the test failed on the band, not with an exception. Declare shared fixtures before first use.
- River veto multiway re-confirmed (2026-11-20): the structural-backlog claim was already closed 2026-11-08 (riverMonsterVeto uses estimateEquityVsMadePoolMulti); re-verified against the code and measured (probe19b): the all-made model vs a mixed model differs hugely (trips 7s with 2 opponents 2.8% vs 22.0%), but the other live opponents also called the same big bet, so all-made is a defensible premise, not a bug. No change.
- The bare-multiple lesson line (v1.8.276, 2026-11-20): closes the last sub-part of the 2026-11-08 facing-raises item — the "Didn't raise the nuts" lesson said "raise to about 3x their bet" with no amount while the spot line above it had the number; the lesson now states the amount. A wording-only fix: it ships as a version but does not count toward the daily five.
- River trips/two-pair pricing (v1.8.278, 2026-11-21): probe28 found the river tier price off by up to 60 points with 4 advice flips — the v1.8.277 "off the river only" scope was a measurement gap, not a design choice; the river stayed tier-priced only because it was unmeasured. When a fix is scoped to flop/turn, the river is the next probe, not a closed item. Probe-label trap again (v1.8.270): the KK9 "two-pair K9" hero was a full house (KQ on KK9+4) — the subagent caught it via the handClass hook and re-ran with 9+4. Verify the class from the code before trusting a cell. Pattern-test churn: the v1.8.266 pattern test had to move twice in two releases as the bad-chase condition grew (street guard added in v1.8.277, removed in v1.8.278) — a pattern that pins a condition verbatim breaks on every extension of that condition; that is the documented cost of pattern tests, not a regression.
- Trips/two-pair pricing (v1.8.277, 2026-11-21): probe25's "within 5 points" held only on the dry board it measured — probe27 (wet QJ7, paired 772/KK9) found the tier price off by up to 12.6 points. A "measured everywhere" claim is only as broad as the boards measured; when a probe's scope is one board, say so. The estimator's one miss (772 two-pair turn vs Rock, 36% vs 44–46% truth) is a knife-edge in the 100-sim bet-line classification — holdings near the line get p=0 instead of p=bluffP — and is a known open item (raise the sims or soften the line), not a reason to hold the extension. Old-code quote bands are noisy: estimateEquityVsRangePostflop is unseeded Math.random, so the old displayed % varies ±3 points run to run — a band must sit ~2.5σ from the old mean or it flakes (the QJ band at 78–90 passed on old code once). The estimator is seeded/deterministic, so the new value is exact; set bands around it with the old mean + 2.5σ as the floor. The trapper flake (v1.8.264) sighted again: madehand-flush-trapper-raise failed once (raise to 300, not 400) across seven lab runs this run; 20/20 repeat verdicts in one process gave 400 — the spot pins an exact size through a Monte Carlo threshold, so re-run before concluding regression (standing guidance). Probes belong in hidden_files/ from the start: probe27's /tmp files were wiped by a restart before they were copied, and only the handoff numbers survived.
