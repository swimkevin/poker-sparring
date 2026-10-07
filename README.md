# Poker Sparring

**A free, no-signup Texas Hold'em practice app.** Spar against offline AI opponents modeled on the player types you actually meet at the table — the rock, the calling station, the maniac — or host a private online table and play real hands with friends from a link.

▶️ **Play it:** https://swimkevin.github.io/poker-sparring/

![vanilla JS](https://img.shields.io/badge/vanilla-JS-yellow) ![no dependencies](https://img.shields.io/badge/dependencies-0-brightgreen) ![tests](https://img.shields.io/badge/tests-1500%2B%20assertions-brightgreen)

## Why I built this

I started playing poker with friends and kept running into the same problem: I knew the theory, but I had no good way to *practice* it. Real-money sites are expensive tuition. Charts don't fight back.

So I built myself a sparring partner.

The idea is simple: instead of generic "poker AI," you practice against the actual archetypes that give you trouble — the rock who only plays aces, the calling station you can't bluff, the maniac raising every hand. Learn to exploit each style offline, build a custom bot that plays like your toughest friend, then take it to a real table (or just host a free online game here and take their chips instead).

It's also my engineering playground: I use it to practice AI-assisted development the way I'd use it on the job — agents writing code, me reviewing and testing it, shipping weekly like a real product. Everything ships with tests and an honest changelog.

*— Kevin*

## What you can do

- **Spar vs bots** — cash games, heads-up, and full tournaments against 5 built-in archetypes (The Rock 🪨, Calling Station 📞, The Maniac 🤪, TAG Shark 🦈, Tricky LAG 🎭), each with a "how to beat them" tip from classic poker literature
- **Build your own opponent** — sliders for looseness, aggression, bluff frequency, and stubbornness; rename them after your friends
- **Play online with friends** — host a table, share a 6-letter code, up to 8 players. Live on a Cloudflare Durable Object relay: rooms survive disconnects, dropped connections auto-reconnect and resync mid-hand
- **Push/fold trainer** — short-stack shove-or-fold drills with instant, range-based feedback
- **Hand replayer** — every hand is saved locally; step through them street by street
- **Training stats** — VPIP/PFR/aggression, win rate in bb/100, stack graph, per-archetype records, and a leak tracker that spots your most common mistakes and explains the math
- **Coach tips** — pot-odds and equity advice on your turn, in plain English ("Call 25 to win 65 — you need 38% equity. You have ~26%. Math says fold.")
- **Learn** — 29-term glossary and curated books/sites
- **No accounts, no tracking** — everything lives in your browser

## How it's built

**Vanilla JS. Zero runtime dependencies. No build step.** The poker engine (`cards → evaluator → equity → engine → bots`) is DOM-free by design — the same code runs in Node tests and the browser. `ui.js` renders, `app.js` conducts.

Online play runs on a **Cloudflare Workers relay** (`worker/`): one Durable Object per room, authoritative game state, rooms persisted to storage so they survive worker eviction, per-seat snapshots so your hole cards never leave the server for anyone else's eyes. The client auto-reconnects with backoff and reclaims its seat by name.

Key decisions are recorded as ADRs in `docs/adr/` — vanilla JS, local-first storage, honestly-labeled heuristic bots, static deploy.

## Verification

**~1,700 assertions across 5 layers.** The number that matters isn't coverage — it's *invariants*: chip conservation across 300 randomized hands, every bot move passing engine legality, hole-card privacy per seat, and a regression test for every bug in the [incident log](docs/INCIDENTS.md), each verified to fail without its fix.

```bash
npm test          # unit + component + smoke + netplay + worker
npm run serve     # → http://localhost:8000
```

What the suite proves: money can't be created or destroyed · every action is legal · humans can't see each other's cards · dropped connections resync. Honest limits are documented in [docs/TESTING.md](docs/TESTING.md).

## Project structure

```
poker-sparring/
├── index.html / css / js      # the app — no build, no bundler
│   └── js/
│       ├── cards/evaluator/equity/engine.js  # DOM-free poker core
│       ├── bots.js            # archetypes + heuristic decision engine
│       ├── room-server.js       # authoritative room (used by worker + mock)
│       ├── netplay.js           # WebSocket client w/ auto-reconnect
│       ├── online.js            # online lobby + table UI
│       ├── ui.js / app.js       # rendering / game flow
│       └── update-check.js      # "new version available" toast
├── worker/                    # Cloudflare relay (Durable Object rooms)
├── tests/                     # unit, component (jsdom), smoke, netplay, worker
├── docs/                      # ADRs, architecture, testing strategy, roadmap
└── CHANGELOG.md
```

## Run it

No build step. `npm test`, `npm run serve`, or just open `index.html`.

The demo at `swimkevin.github.io/poker-sparring` is GitHub Pages (static); online play uses the Cloudflare relay above. Your stats and custom bots live in your browser — clearing site data resets them.

## Limitations (honest)

- **Bots are heuristics, not solvers.** Tiered ranges, Monte Carlo equity, pot-odds math — good fundamentals, not GTO. They're labeled as such everywhere.
- **Coaching is math-based, not solver-certified.**
- **Online is beta** — built for friends, not real money (there is none) or big public tables.

## Roadmap

Weekly iterations — [`docs/ROADMAP.md`](docs/ROADMAP.md) for the plan, [`CHANGELOG.md`](CHANGELOG.md) for what's shipped. Next: 3-bet/blind-defense/ICM drill packs, sound design, range charts.

---

*Built to make practice fun — and to show what an engineer + AI agents can ship, iteratively, with tests.*
