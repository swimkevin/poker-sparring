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
