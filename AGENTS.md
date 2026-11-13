# AGENTS.md — poker-sparring

Repo conventions for AI coding agents. The full guide is `CLAUDE.md` — read it
first; this file is the 30-second version. Loop operations, the rollback
procedure, CI diagnosis, and the full lessons log live in
`docs/AI-WORKFLOW.md`.

**Kevin Song owns every result** — the agents are leverage, the judgment is
his.

- Vanilla HTML/CSS/JS, zero runtime dependencies, no build step. Deployed to
  GitHub Pages from `main`.
- Layering: `cards → evaluator → equity → engine → bots` are **DOM-free** and run
  in Node tests. `ui.js` renders only; `app.js` conducts. Keep it that way.
- Cross-file globals need a guarded `require` block for Node (see `CLAUDE.md`).
- Engine actions go through `table.legalActions(idx)`; bet/raise `amount` is the
  TOTAL street bet target.
- Never `innerHTML` user-controlled strings without `UI.escapeHtml`.
- Keep functions small, no emojis in code comments.
- **Zero comments in shipped source** (Kevin 2026-10-18): js/, css/, index.html ship with NO comments — `tests/no-comments-test.js` fails the build otherwise. Version-history notes go in CHANGELOG.md only. If a test asserts on comment text, rewrite it to assert on code.

## Test discipline
- Full bare `npm test` + grep for `FAIL` must pass before EVERY push. Capture the npm exit code to a file — only the immediate `$?` capture is valid.
- `npm run solver-lab` must pass before and after each version's edits.
- `npm run livetest` must print LIVE 10-HAND LOOP OK when app/bot/coach code changes.
- Every behavior change gets a regression test that fails without the fix.
- Tests that scan directories must account for orphaned remote files (`push.py` cannot delete — see below).
- Browser/jsdom does NOT prove iPhone Safari visuals. Kevin's iPhone is the final visual gate; name that blind spot in every report.

## Release checklist
- Bump the version in six places, atomically: `version.txt`, `APP_VERSION` in `js/app.js`, `"version"` in `package.json`, all `?v=` in `index.html`, `PS_VERSION` in `sw.js`, and the `(vX)` mention in `README.md`. `tests/sw-test.js` fails the build if they drift. The update toast compares `version.txt` against the page's `APP_VERSION`; if they drift, users get a phantom "update available" (or none at all). Never blanket-sed a version string across the repo — bump only the six files.
- Add a CHANGELOG.md entry under the new version.
- Push with `push.py` (owner, repo, branch, message, then `repo-path:local-path` pairs; retry with `PYTHONPATH=/opt/muse/skills/custom-connector-setup/bin` on ModuleNotFoundError). The push list is ALWAYS the changed files PLUS all six bump-touched files, even on test-only repairs. Run `hidden_files/verify-push-list.js` before every push.
- `push.py` cannot delete files — use `~/workspace/github-delete.py` (Contents API), AFTER the push. Deleting locally first breaks verify-push-list.
- Verify live `version.txt` and CI green on the pushed SHA (only `python3 hidden_files/ci-diagnose.py` — never write a new CI script).
- Worker changes need a separate `wrangler deploy` by Kevin from the `worker/` folder (plus `js/room-server.js`, `js/engine.js`, `js/evaluator.js`, `js/cards.js` which the bundle imports). The app and the worker deploy independently. Never touch `worker/`.

## Hard rules
- Never read, open, or edit anything under `~/workspace/cron.d/`. Lessons go to `~/memory/YYYY-MM-DD.md` and `docs/AI-WORKFLOW.md`; the main agent applies cron-body edits.
- Never reuse a version number. Every deployment is a new version.
- Run logs go under the repo (`hidden_files/`, gitignored), never `/tmp` — `/tmp` is wiped by restarts, and a backgrounded suite can die with its wrapper shell before the exit echo. If a suite's log stops advancing and no process is alive, re-run from scratch; never report green on stage output alone.
- `push.py` never updates local git refs — local HEAD is permanently stale. Do NOT use `git status`/`git diff` to detect changes; track changed files manually and verify via the API response and live `version.txt`.
