# CLAUDE.md — AI agent guide for poker-sparring

This file orients AI coding agents (Claude Code, etc.) working on this repo. Read it before making changes.

## What this is

Poker Sparring: a Texas Hold'em training app (mobile-first layout, PWA-installable).
Vanilla HTML/CSS/JS. **No build step, no runtime dependencies.** The app itself is
static (GitHub Pages); online tables run through a separate Cloudflare Worker
relay — see `docs/ARCHITECTURE.md` for the real split.

## Commands

```bash
npm test               # full gate: unit/integration + jsdom component + gameplay smoke
npm run test:unit      # node tests/test.js only
npm run test:component # node tests/component.test.js only (needs `npm install` for jsdom)
npm run test:smoke     # node tests/smoke.js: boots the real app in jsdom, auto-plays hands
npm run serve          # → http://localhost:8000
```

Open `index.html` directly also works, but serving is recommended.

## Architecture

```
js/cards.js       Card primitives. Card = { r: 2..14, s: 0..3 }.
js/evaluator.js   7-card evaluator. Score = category * 16^5 + kickers (integer compare).
js/equity.js      Monte Carlo equity, madeStrength() [0,1], detectDraws(), holeTier() 1..6.
js/engine.js      PokerTable class. Owns ALL game rules. Emits events via onEvent + eventQueue.
js/bots.js        ARCHETYPES + botDecide(table, player) -> { a, amount }.
js/pushfold.js    Push/fold drill scenarios + range-based feedback (equity vs the
                shover's archetype range, not vs random hands).
js/stats.js       localStorage stats. Guarded so it loads in Node.
js/replay.js      Hand-history capture + replay state machine (DOM-free).
js/ui.js          DOM rendering only. Never makes game decisions.
js/app.js         Conductor: event pump, hero controls, tournament, coach tips.
js/names.js       Username and custom-bot name prefs (localStorage).
js/online.js      Browser UI for the online lobby and table.
js/netplay.js     WebSocket client for the relay; mock mode runs in-page.
js/room-server.js Authoritative room state, shared by the app mock and the worker.
```

**Critical layering rule:** `cards → evaluator → equity → engine → bots` are DOM-free
and must stay that way — they run in Node tests and are kept reusable for a
native port later (see `docs/MOBILE.md`, option D — much later, only if the app
earns it). `ui.js`/`app.js` are browser-only.

## Conventions

- Classic `<script>` tags (no modules/bundler) so the app runs from `file://`.
  Cross-file references are globals in the browser; in Node each file is a module,
  so every core file has a guarded require block at top AND `module.exports` at bottom:
  ```js
  if (typeof module !== 'undefined' && module.exports) {
    var __ev = require('./evaluator.js');
    var evaluate7 = __ev.evaluate7;
  }
  ```
  When adding a cross-file call, add it to the guard block too.
- Engine actions: `table.act(idx, 'fold'|'check'|'call'|'bet'|'raise', amount)`.
  For bet/raise, `amount` is the TOTAL bet target for the street, not the increment.
- `table.legalActions(idx)` returns `{ toCall, canCheck, callAmount, canBet/canRaise, minBetTo/minRaiseTo, maxRaiseTo }`.
  UI and bots must always go through it — never hand-roll legality.
- Bot decisions return `{ a, amount }` or null. Keep `botDecide` pure-ish (no DOM).
- Events: engine emits synchronously; `app.js` drains them with animation delays.
  Never call `table.act()` synchronously inside `onEvent` for a bot — schedule it.

## Testing

- `npm test` must pass before any push: evaluator vectors, equity sanity ranges,
  deterministic side-pot/odd-chip/full-hand scenarios, push/fold verdict
  consistency, the bot move-legality sweep (every archetype, only legal moves),
  the 100-hand soak by default (`SOAK_HANDS=300` for deeper checks; chip
  conservation every hand, no exceptions, no infinite loops), and jsdom
  component tests (escaping, feedback rendering, UI states).
- If you change engine rules, add a targeted deterministic test (side-pot split,
  short all-in, odd chip). The soak test catches regressions; deterministic tests
  pin behavior.
- If you tune bot params, run the lineup script pattern from git history to confirm
  archetypes still separate (rock < shark < lag < station < maniac by VPIP).
- If you change push/fold logic, the verdict must always agree with the equity
  number shown in the feedback text (see `evaluatePushFold` range-consistency tests).
- Never `innerHTML` user-controlled strings without `UI.escapeHtml` — there are
  component tests guarding this; add one if you add a new injection point.

## Style

- Keep functions small. No comments in shipped `js/`/`css/`/`index.html` at all
  (test-enforced zero-comment rule) — decision history lives in `CHANGELOG.md`
  only. Emojis are UI content only (bot avatars).
- Prefer clarity over cleverness — this repo is also a portfolio piece.

## Roadmap

See `docs/ROADMAP.md` for the current plan. Do not copy headliners from memory:
three items this section used to list as future work — the hand replayer, the
PWA (manifest + service worker), and online multiplayer — have all shipped,
and the current direction is polish, not features. The one structural item
still open is the `js/app.js` coach extraction, stated publicly in
`docs/ROADMAP.md` with its deferral reason and gate.
