# Changelog

All notable changes to Poker Sparring. Versions are also stamped in the app
footer (`APP_VERSION` in `js/app.js`) and `package.json`.

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
