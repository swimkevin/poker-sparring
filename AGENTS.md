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
- Keep functions small, comment the decision points, no emojis in code comments.

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
