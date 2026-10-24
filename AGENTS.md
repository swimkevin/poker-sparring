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
- CSS debloat verification (v1.8.118): when removing a superseded declaration,
  prove it dead by specificity — both rules must apply under identical
  conditions and the surviving rule must win on every property being removed.
  The v1.8.116 `overflow-y: auto` on `#online-view.online-scroll` died because
  the v1.8.117 `:has()` rule sets `overflow: visible` at higher specificity
  (3,2,0 vs 2,1,0) under the same `.online-scroll` condition.
