# Poker Sparring

**Texas Hold'em training app — spar against AI opponents modeled on real player types, or host private online tables with friends.**

▶️ **Live:** https://swimkevin.github.io/poker-sparring/

![vanilla JS](https://img.shields.io/badge/vanilla-JS-yellow) ![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen) ![tests](https://img.shields.io/badge/tests-1800%2B%20passing-brightgreen)

## What it is

An offline-first poker practice app. Play cash games, heads-up, and tournaments against 11 AI opponents — each modeled on a real player archetype (the rock, the calling station, the maniac, Alice the ultra-tight vault) with distinct, exploitable tendencies. A solver-informed coach explains the math behind every decision in plain English. Or host a private online table and play real hands with friends from a link. No accounts, no signup, no real money.

## Engineering highlights

**Zero-dependency vanilla JS.** No framework, no bundler, no build step. The poker core (`cards → evaluator → equity → engine → bots`) is DOM-free by design — the same code runs in Node tests and the browser.

**1,800+ test assertions, 5 layers.** Unit, component, smoke (300 randomized hands), netplay, and worker tests. The suite verifies the invariants that matter: chip conservation, legality of every engine action, hole-card privacy per seat. Every bug gets a regression test verified to fail without its fix.

**Real-time multiplayer on Cloudflare Workers.** One Durable Object per room, authoritative game state, per-seat snapshots so hole cards never leak. Auto-reconnect with backoff, host migration if the host drops.

**Solver-informed coaching engine.** The coach encodes solver-derived principles — minimum defense frequency, pot-odds math, SPR commitment tiers, range/nut advantage, ICM risk premiums, push/fold charts — plus exploitative adjustments per opponent type, grounded in standard training literature (Sklansky, Harrington, Janda, Clarke).

## How the coach works (and how it gets better)

**It's a rules engine, not a neural net — and that's deliberate.** Every piece of advice traces to a named principle (pot odds, MDF, SPR, ICM) you can verify in a poker book. No black box, no hallucinated ranges.

**How it improves:** a daily loop keeps it honest.
- **Automated test hands** — hundreds of simulated hands check the coach's advice stays legal and mathematically consistent.
- **Verification playthroughs** — full games are played with the coach's advice followed, and every decision is reviewed for quality (latest: 10 hands, 14 decisions, all sound).
- **Research** — solver outputs and poker literature (books, training sites) are studied; when a principle is missing or a bad outcome is found, it's encoded as a new rule with a regression test.

The coach doesn't rewrite itself — improvements are deliberate, tested, and shipped as versions, like any good training program.

## Fair dealing

Shuffled like the pros. Each hand starts with a full 52-card Fisher-Yates shuffle driven by a **cryptographic RNG** (Web Crypto in the browser, Node crypto in tests) — the same class of randomness regulated sites use — with rejection sampling so every shuffle index is unbiased. The whole deck is shuffled once per hand and dealt in order, exactly like a live dealer (PokerStars documents the same approach: once shuffled, the order is set). `Math.random` is never used for dealing — it's predictable and fails the fairness bar. The shuffle is covered by statistical tests in the suite.

## Features

**Play**
- Cash games, heads-up, and tournaments vs 11 AI archetypes — including Alice, the ultra-safe vault who never bluffs
- Custom opponents: tune looseness, aggression, bluff frequency; name them after your friends
- Session resume: leave mid-session, pick up with the exact same stacks
- Push/fold trainer with range-based feedback
- Hand replayer with street-by-street review, training stats (VPIP/PFR/bb/100), leak tracker

**Coach**
- Every spot explained in plain English: pot odds vs your equity, implied and reverse-implied odds, SPR commitment, minimum defense frequency
- Tournament-aware: ICM risk premiums near pay jumps, shove-or-fold guidance under 12bb, bubble exploitation for big stacks
- Exploit adjustments by opponent archetype; post-hand recaps (one praise line, one leak line)

**Online with friends**
- Host a table, share a 6-letter code, up to 8 players
- Table chat, session ledger, rebuys, sit-out
- Resilient: auto-reconnect, host migration, spectator mode

**Mobile-first.** Minimalist table layout, always-visible hero cards, thumb-zone controls. No scrolling on game screens.

**Updates.** New releases are checked only when you tap the footer's "Check for updates" — no automatic popups.

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

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the plan, [`CHANGELOG.md`](CHANGELOG.md) for what's shipped.

---

*Built by Kevin Song — practicing poker and practicing shipping, one version at a time.*
