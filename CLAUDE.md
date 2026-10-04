# CLAUDE.md — AI agent guide for poker-sparring

This file orients AI coding agents (Claude Code, etc.) working on this repo. Read it before making changes.

## What this is

Poker Sparring: an offline Texas Hold'em training app (web first, mobile later).
Vanilla HTML/CSS/JS. **No build step, no dependencies, no backend.**

## Commands

```bash
node tests/test.js        # full suite: evaluator unit tests + 300-hand engine soak
python3 -m http.server 8000   # serve locally → http://localhost:8000
```

Open `index.html` directly also works, but serving is recommended.

## Architecture

```
js/cards.js       Card primitives. Card = { r: 2..14, s: 0..3 }.
js/evaluator.js   7-card evaluator. Score = category * 16^5 + kickers (integer compare).
js/equity.js      Monte Carlo equity, madeStrength() [0,1], detectDraws(), holeTier() 1..6.
js/engine.js      PokerTable class. Owns ALL game rules. Emits events via onEvent + eventQueue.
js/bots.js        ARCHETYPES + botDecide(table, player) -> { a, amount }.
js/pushfold.js    Push/fold drill scenarios + chart-based feedback.
js/stats.js       localStorage stats. Guarded so it loads in Node.
js/ui.js          DOM rendering only. Never makes game decisions.
js/app.js         Conductor: event pump, hero controls, tournament, coach tips.
```

**Critical layering rule:** `cards → evaluator → equity → engine → bots` are DOM-free
and must stay that way — they run in Node tests and will be reused by the React
Native port. `ui.js`/`app.js` are browser-only.

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

- `tests/test.js` must pass before any PR: evaluator vectors, equity sanity ranges,
  and the 300-hand soak (chip conservation every hand, no exceptions, no infinite loops).
- If you change engine rules, add a targeted test (e.g. side-pot split, short all-in).
- If you tune bot params, run the lineup script pattern from git history to confirm
  archetypes still separate (nit < shark < crusher < station < maniac by VPIP).

## Style

- Keep functions small and commented at the decision points (bet sizing, thresholds).
- No emojis in code comments. Emojis are UI content only (bot avatars).
- Prefer clarity over cleverness — this repo is also a portfolio piece.

## Roadmap (biggest wins next)

1. GTO-ish preflop range charts per archetype (replace tier thresholds).
2. LLM hand-review coach (needs a backend or BYO-key design — keep client static).
3. React Native port reusing the DOM-free core.
4. Online multiplayer (would need a server; out of scope for the static build).
