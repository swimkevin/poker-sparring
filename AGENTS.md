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
- Bump the version in three places: `APP_VERSION` in `js/app.js`, `"version"` in
  `package.json`, and the bare number in `version.txt`. The update toast compares
  `version.txt` against the page's `APP_VERSION`; if they drift, users get a
  phantom "update available" (or none at all).
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
