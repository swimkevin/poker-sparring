# Poker Sparring

**Texas Hold'em training app — practice against AI opponents modeled on real player archetypes, or host private online tables with friends.**

▶️ **Live:** https://swimkevin.github.io/poker-sparring/

![vanilla JS](https://img.shields.io/badge/vanilla-JS-yellow) ![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen) ![tests](https://img.shields.io/badge/tests-1500%2B%20passing-brightgreen)

## What it is

An offline-first poker practice app. Spar against 10 AI opponents — each modeled on a classic player type (the rock, the calling station, the maniac) with distinct, exploitable tendencies. Or host a private online table and play real hands with friends from a link. No accounts, no signup, no real money.

## Engineering highlights

**Zero-dependency vanilla JS.** No framework, no bundler, no build step. The entire poker engine (`cards → evaluator → equity → engine → bots`) is DOM-free by design — the same code runs in Node tests and the browser.

**1,500+ test assertions, 5 layers.** Unit, component, smoke (300 randomized hands), netplay, and worker tests. The suite verifies invariants that matter: chip conservation, engine legality of every bot action, hole-card privacy per seat. Every bug gets a regression test verified to fail without its fix.

**Real-time multiplayer on Cloudflare Workers.** One Durable Object per room, authoritative game state, per-seat snapshots so hole cards never leak. Auto-reconnect with backoff, host migration if the host drops.

**AI-assisted development workflow.** Built with AI agents writing code under human review — weekly shipping cadence, honest changelog, architectural decisions recorded as ADRs in `docs/adr/`.

## Features

**Spar vs bots (offline)**
- Cash games, heads-up, and tournaments vs 11 distinct AI archetypes — including Alice, the ultra-safe vault who never bluffs
- Build custom opponents — tune looseness, aggression, bluff frequency; name them after your friends
- Push/fold trainer with range-based feedback
- Hand replayer, training stats (VPIP/PFR/bb/100), leak tracker
- Pot-odds coach that explains the math in plain English — range-aware equity,
  SPR/commitment guidance, implied + reverse-implied odds, exploit adjustments
  by opponent archetype, and post-hand recaps (one praise line, one leak line)

**Coach theory sources.** The coach's rules are distilled from standard poker
training literature (summarized in own words in
[`hidden_files/coach-deep-dive.md`](hidden_files/coach-deep-dive.md)):
- David Sklansky, *The Theory of Poker* — pot odds, the Fundamental Theorem
- Dan Harrington, *Harrington on Hold'em* — positional hand selection
- Matthew Janda, *Applications of No-Limit Hold'em* — range-vs-range play, SPR
- Peter Clarke, *The Grinder's Manual* — TAG fundamentals
- Alex Fitzgerald, *Exploitative Play in Live Poker* — player-type exploits
- Training sites: [Upswing Poker](https://upswingpoker.com),
  [Red Chip Poker](https://redchippoker.com) (SplitSuit),
  [BlackRain79](https://www.blackrain79.com) (micro-stakes),
  [PokerCoaching.com](https://www.pokercoaching.com),
  [888poker](https://www.888poker.com)
- Open guides: [jameswu5/poker](https://github.com/jameswu5/poker) (6-max NLHE guide)

**Updates.** The app checks for new releases only when you tap the footer
"Check for updates" button — there is no automatic update popup (removed in
v1.8.44 as unreliable).

**Online with friends**
- Host a table, share a 6-letter code, up to 8 players
- Table chat, session ledger, rebuys, sit-out
- Resilient: auto-reconnect, host migration, spectator mode

**Mobile-first.** Rebuilt for phones — minimalist table layout, always-visible hero cards, thumb-zone controls. No scrolling on game screens.

## Project structure

```
poker-sparring/
├── index.html / css / js      # the app — no build, no bundler
│   └── js/
│       ├── cards/evaluator/equity/engine.js  # DOM-free poker core
│       ├── bots.js            # archetypes + heuristic decision engine
│       ├── room-server.js     # authoritative room (worker + mock)
│       ├── netplay.js         # WebSocket client w/ auto-reconnect
│       ├── online.js          # online lobby + table UI
│       └── ui.js / app.js     # rendering / game flow
├── worker/                    # Cloudflare relay (Durable Object rooms)
├── tests/                     # unit, component, smoke, netplay, worker
├── docs/                      # ADRs, architecture, testing, roadmap
└── CHANGELOG.md
```

## Run it

```bash
npm test          # full suite
npm run serve     # → http://localhost:8000
```

Or just open `index.html` — no build step.

## Honest limitations

- **Bots are heuristics, not solvers.** Tiered ranges, Monte Carlo equity, pot-odds math — solid fundamentals, not GTO. Labeled as such throughout.
- **Online is beta** — built for friends, not real money (there is none).

## Roadmap

Weekly iterations. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the plan, [`CHANGELOG.md`](CHANGELOG.md) for what's shipped.

---

*Built by Kevin Song — practicing poker and practicing shipping, one version at a time.*
