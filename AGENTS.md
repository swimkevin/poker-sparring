# AGENTS.md — poker-sparring

Repo conventions for AI coding agents. The full guide is `CLAUDE.md` — read it
first; this file is the 30-second version.

- Vanilla HTML/CSS/JS, zero runtime dependencies, no build step. Deployed to
  GitHub Pages from `main`.
- Layering: `cards → evaluator → equity → engine → bots` are **DOM-free** and run
  in Node tests. `ui.js` renders only; `app.js` conducts. Keep it that way.
- Cross-file globals need a guarded `require` block for Node (see `CLAUDE.md`).
- Engine actions go through `table.legalActions(idx)`; bet/raise `amount` is the
  TOTAL street bet target.
- `npm test` (unit + component) must pass before pushing. Add a targeted test
  with every engine/bot/equity change.
- Never `innerHTML` user-controlled strings without `UI.escapeHtml`.
- Keep functions small, no emojis in code comments.
- **Zero comments in shipped source** (Kevin 2026-10-18): js/, css/, index.html ship with NO comments — `tests/no-comments-test.js` fails the build otherwise. Version-history notes go in CHANGELOG.md only. If a test asserts on comment text, rewrite it to assert on code.

## Release checklist (GitHub Pages)
- Bump the version in five places: `APP_VERSION` in `js/app.js`, `"version"` in
  `package.json`, the bare number in `version.txt`, every `?v=` cache-buster in
  `index.html`, and `PS_VERSION` in `sw.js`. `tests/sw-test.js` fails the build
  if they drift. The update toast compares `version.txt` against the page's
  `APP_VERSION`; if they drift, users get a phantom "update available" (or none
  at all).
- Add a CHANGELOG.md entry under the new version.
- Push via the GitHub connector (`push_files`); keep each push payload well
  under ~150 KB or it silently fails. Verify the commit and the live file after.
- Worker changes need a separate `wrangler deploy` by Kevin from the
  `worker/` folder (plus `js/room-server.js`, `js/engine.js`, `js/evaluator.js`,
  `js/cards.js` which the bundle imports). The app and the worker deploy
  independently — a worker-only fix needs no app push and vice versa.

## CI gotcha (2026-10-18)
- `push.py` CANNOT delete files — it only adds/updates. Use `~/workspace/github-delete.py`
  (Contents API) to delete. Leftover remote files WILL break CI: `tests/no-comments-test.js`
  scans `js/` and failed on CI because a locally-deleted `js/update-check.js` still existed
  on remote. When adding any test that scans directories, verify no orphaned files exist on
  remote (`git ls-files` is stale locally; check via API).
- To identify a failing CI suite without log access, push a diagnostic branch with a
  `tests/chain.js` wrapper that prints `::error::`/`::notice::` annotations, open a PR to
  trigger CI, then read annotations via the check-runs API. Close the PR without merging.

## Loop ops (daily improvement cron)
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
