# 🂡 Poker Sparring

**Train against offline poker AI.** A free, no-signup Texas Hold'em practice app: play cash games, heads-up, and tournaments against bots with distinct, customizable playing styles — or drill short-stack push/fold spots with instant feedback.

▶️ **Live demo:** https://swimkevin.github.io/poker-sparring/

![vanilla JS](https://img.shields.io/badge/vanilla-JS-yellow) ![no dependencies](https://img.shields.io/badge/dependencies-0-brightgreen) ![tests](https://img.shields.io/badge/tests-1058%20passing-brightgreen) [![CI](https://github.com/swimkevin/poker-sparring/actions/workflows/test.yml/badge.svg)](https://github.com/swimkevin/poker-sparring/actions/workflows/test.yml)

## Key decisions

The architecture calls that shape this repo, recorded as ADRs:

- [Vanilla JS, zero runtime dependencies](docs/adr/0001-vanilla-js-zero-dependencies.md) — no framework, no build step; the layering has to be designed, not inherited.
- [Local-first storage, no backend](docs/adr/0002-local-first-storage.md) — stats and hands in `localStorage`; a backend only when a feature needs it.
- [Heuristic bots, honestly labeled](docs/adr/0003-heuristic-bots-not-ml.md) — transparent agents, never marketed as ML.
- [Static deploy on GitHub Pages](docs/adr/0004-static-deploy-github-pages.md) — push to main, live in ~2 minutes.

## Verification

- **1,058 tests** (1,012 unit + integration, 46 component) + a gameplay smoke test that boots the real app and auto-plays hands. Strategy: [docs/TESTING.md](docs/TESTING.md).
- **Incident log** with root causes and regression guards: [docs/INCIDENTS.md](docs/INCIDENTS.md).
- **How AI-assisted development is run here** (guardrails, verification, human ownership): [docs/AI-WORKFLOW.md](docs/AI-WORKFLOW.md).

## Why this exists

I'm Kevin Song, a software engineer (currently building auth infrastructure at Capital One). I started this project in October 2026 with two goals:

1. **Build something genuinely useful.** Most poker tools are either real-money sites or static charts. I wanted a *sparring partner*: offline opponents modeled on the player archetypes you actually meet — the rock who only plays aces, the calling station you can't bluff, the maniac who raises every hand. Practice exploiting each style, then build a custom bot to drill the exact player type that gives you trouble.
2. **Level up as an engineer.** This is my deliberate practice ground for AI-assisted development: prompting, reviewing and testing agent-written code, designing multi-agent collaboration, and shipping iteratively like a real product — weekly releases, QA passes, and honest changelogs. The "AI" here is used the way I'd use it on the job: as leverage, with verification.

On the "AI" label, to be precise: the opponents are **transparent heuristic agents** (tiered hand ranges, Monte Carlo equity, pot-odds math) — not neural networks or trained models. I call it "offline bot AI" and keep every decision rule readable and tunable. That trade-off is intentional: it's explainable, testable, runs with zero dependencies, and teaches real poker concepts instead of hiding behind a black box.

## Features

- **4 game modes** — cash games (auto top-ups), heads-up, full tournaments (escalating blinds + antes, eliminations), and a push/fold trainer
- **5 built-in AI archetypes** — The Rock 🪨, Calling Station 📞, The Maniac 🤪, TAG Shark 🦈, Tricky LAG 🎭, each with a "how to beat" exploit tip grounded in classic poker literature
- **Custom bot builder** — sliders for looseness, aggression, bluff frequency, and call-down stubbornness; saved to your browser
- **Real poker engine** — full betting rounds, side pots, all-ins, split pots with odd-chip rules, antes, heads-up blind rules
- **Coach tips + leak tracker** — contextual pot-odds/equity advice on your turn; the app spots 4 common hero mistakes and explains the math behind them
- **Learn screen** — essential books, free training sites, and a 29-term plain-English glossary
- **Training stats** — VPIP/PFR/aggression factor, win rate (bb/100, shown only after 20+ hands), stack graph, per-archetype records, hand history export (JSON)
- **100% offline** — no accounts, no servers, no tracking. Stats live in `localStorage`.

## How the bot AI works

Transparent, tunable heuristics (see `js/bots.js`):

1. **Preflop**: hole cards are bucketed into 6 strength tiers; each archetype has open/call/3-bet tier thresholds adjusted for position, plus push/fold logic under 13bb.
2. **Postflop**: Monte Carlo equity estimation vs opponent ranges, combined with made-hand strength and draw detection, drives bet/call/fold decisions; pot-odds math gates every call.
3. **Personality**: aggression shifts value-bet thresholds, bluff frequency drives bluffs/semi-bluffs, stubbornness widens call-downs.
4. **Push/fold trainer**: facing-a-shove verdicts are computed against the *shover's range* (each archetype's own shoving tiers), not against random hands — because a shover's range is much stronger than "any two cards."

Bot-vs-bot simulations confirm the styles separate cleanly (rock ~7% VPIP → maniac ~74%), and an automated sweep verifies every archetype only ever produces legal moves.

## Project structure

```
poker-sparring/
├── index.html          # App shell (screens: setup, table, push/fold, bots, stats, learn)
├── css/style.css       # Dark casino theme, no frameworks
├── js/
│   ├── cards.js        # Card primitives
│   ├── evaluator.js    # 7-card hand evaluator (integer-scored)
│   ├── equity.js       # Monte Carlo equity, range equity, hand strength, draws
│   ├── engine.js       # Table engine: blinds, betting rounds, side pots, showdown
│   ├── bots.js         # Archetypes + heuristic decision engine
│   ├── pushfold.js     # Push/fold drill scenarios + range-based feedback
│   ├── replay.js       # Hand-history capture + replay state machine (DOM-free)
│   ├── stats.js        # localStorage training stats + leak records
│   ├── ui.js           # DOM rendering (no game logic)
│   └── app.js          # Game flow, event pump, controls, tournament logic
├── tests/
│   ├── test.js           # Unit + integration: evaluator, engine, equity, bots, stats
│   └── component.test.js # jsdom component tests: rendering, escaping, UI states
├── docs/
│   ├── ARCHITECTURE.md # Module map, data flow, testing strategy, deployment
│   ├── ROADMAP.md      # Weekly iteration plan
│   └── MOBILE.md       # Phone-web vs PWA vs App Store trade-offs
├── package.json        # Scripts only — zero runtime dependencies
├── CHANGELOG.md        # Release notes
└── CLAUDE.md / AGENTS.md # Contributor + AI-agent guides
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full technical write-up: layering rules, event flow, and why the poker core is DOM-free (it runs unchanged in Node tests and is ready for a React Native port).

## Run it

No build step:

```bash
npm test          # full suite: 1012 unit + 46 component tests (1058 total)
npm run serve     # → http://localhost:8000
```

Or just open `index.html` directly.

## How the live site works (GitHub Pages)

The demo at `swimkevin.github.io/poker-sparring` is **GitHub Pages**: GitHub serves the files on the `main` branch as a static website, free, with automatic redeploys on every push. There is no backend, no database, no server code — which is exactly why the app is pure HTML/CSS/JS with all state in the browser's `localStorage`.

Practical consequences:
- Your stats and custom bots live **in your browser on your device**. Clearing site data resets them; they don't sync between devices.
- No login, no multiplayer, no real-money anything — by architecture, not just by policy.
- I deliberately skipped a custom domain: the `github.io` URL is the standard look for a portfolio side project, and a custom domain adds cost and DNS setup for zero hiring benefit.

## Limitations (honest)

- **Coaching is heuristic, not solver-certified.** Tips and leak detection use pot-odds/equity math and tier charts — good fundamentals, not GTO solutions.
- **Monte Carlo estimates vary** run to run; bot play includes deliberate randomization to feel human.
- **No cloud sync or multiplayer** — local browser only, by design of the static hosting.
- **Tournament ICM is simplified** (chip-EV based, no payout-structure modeling yet).
- **Mobile web works** but isn't yet installable/offline-first — see [`docs/MOBILE.md`](docs/MOBILE.md) for the PWA/App Store path.

## Roadmap

Weekly iterations — see [`docs/ROADMAP.md`](docs/ROADMAP.md) for the plan and [`CHANGELOG.md`](CHANGELOG.md) for what's shipped. Near-term: hand replayer, more drill packs (3-bet pots, blind defense, ICM), PWA installability, range charts.

## Contributing

See [CLAUDE.md](CLAUDE.md) (full guide) and [AGENTS.md](AGENTS.md) (quick version): architecture, conventions, and how to run tests. AI agents welcome — that's part of the point.

---

*Built to make practice fun — and to show what an engineer + AI agents can ship, iteratively, with tests.*
