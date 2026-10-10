# Poker Sparring

**Texas Hold'em training app — spar against AI opponents modeled on real player types, or host private online tables with friends.**

▶️ **Live:** https://swimkevin.github.io/poker-sparring/

![vanilla JS](https://img.shields.io/badge/vanilla-JS-yellow) ![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen) ![tests](https://img.shields.io/badge/tests-1800%2B%20passing-brightgreen)

## Screenshots

<!--
  SCREENSHOT INSTRUCTIONS (Kevin):
  1. Take 1 desktop screenshot: mid-hand, coach tip visible → save as docs/screenshots/desktop.png
  2. Take 1 mobile screenshot (390px wide): table + bottom tab bar → save as docs/screenshots/mobile.png
  3. Uncomment the two lines below.
-->
<!-- ![Desktop — mid-hand with coach tip](docs/screenshots/desktop.png) -->
<!-- ![Mobile — table view](docs/screenshots/mobile.png) -->

## Demo video

<!--
  VIDEO INSTRUCTIONS (for Tuesday):
  Option A (simplest): record 30–60s on your phone or with a screen recorder —
    open the app → "Deal me in" → show a coach tip → play one hand → open the
    hand replayer. Upload to YouTube (unlisted is fine), then replace the line
    below with: [![Demo](thumbnail-url)](your-youtube-url)
  Option B: save a GIF as docs/screenshots/demo.gif and uncomment the line below.
    (GitHub renders GIFs inline; MP4s do not play inline in READMEs.)
-->
<!-- ![Demo — one hand with coach](docs/screenshots/demo.gif) -->

## By the numbers

- **69 versions shipped** (v1.8.69) — iterative, tested releases, not one big bang
- **1,800+ test assertions** across unit, component, smoke (300 randomized hands), netplay, and worker suites
- **11 AI opponent archetypes**, each with distinct, exploitable tendencies
- **0 runtime dependencies** — vanilla HTML/CSS/JS, no framework, no bundler, no build step
- **4 architecture decision records** (`docs/adr/`) explaining every major tradeoff
- **3 live coach-audit rounds** — real hands played, every finding turned into a regression test

## What it is

An offline-first poker practice app. Play cash games, heads-up, and tournaments against 11 AI opponents — each modeled on a real player archetype (the rock, the calling station, the maniac, Alice the ultra-tight vault) with distinct, exploitable tendencies. A solver-informed coach explains the math behind every decision in plain English. Or host a private online table and play real hands with friends from a link. No accounts, no signup, no real money.

## Why this stack

- **Vanilla JS, zero dependencies** — no build step: the app runs by opening `index.html`. The poker core (`cards → evaluator → equity → engine → bots`) is DOM-free, so the exact same code runs in Node tests and the browser. (See `docs/adr/0001-vanilla-js-zero-dependencies.md`.)
- **Local-first storage** — stats live in `localStorage`. A poker trainer doesn't need your email, and it works on a plane. (See `docs/adr/0002-local-first-storage.md`.)
- **Heuristic bots, not ML** — every bot decision is a readable rule you can debug, test, and explain. A neural net would be a black box you can't fix when it plays badly. (See `docs/adr/0003-heuristic-bots-not-ml.md`.)
- **GitHub Pages** — free hosting, instant deploys from `main`, versioned releases. (See `docs/adr/0004-static-deploy-github-pages.md`.)

## What I learned (and what I'd do differently)

**Silent failures are the worst bugs.** Twice (v1.8.65, v1.8.68) the coach panel went blank because an undeclared variable threw a `ReferenceError` that the coach's `try/catch` swallowed. The logic was correct; the error handling hid the evidence. Fix: a `?coachdebug=1` mode that surfaces coach errors to the console instead of swallowing them, plus static checks that fail without each fix. Lesson: error handling should never make bugs invisible.

**Test the composition, not just the units.** Unit tests passed while the coach rendered nothing — the bug was in how pieces were wired together, not in any single function. The `tests/coach-scenarios.js` suite now checks end-to-end wiring (branch conditions, destructured context, HTML structure), not just isolated logic.

**Cut scope earlier.** Heads-Up and Push/Fold Trainer shipped as hidden, half-finished modes (`display:none` in the DOM). They should have been cut or finished — shipped-but-hidden reads as unfinished, not ambitious.

**What I'd do differently next time:** add JSDoc types or TypeScript from day one (the entire `posName` bug class was a typo-level error a type checker catches instantly), and build mobile-first instead of retrofitting it.

## Engineering highlights

**Zero-dependency vanilla JS.** No framework, no bundler, no build step. The poker core (`cards → evaluator → equity → engine → bots`) is DOM-free by design — the same code runs in Node tests and the browser.

**1,800+ test assertions, 5 layers.** Unit, component, smoke (300 randomized hands), netplay, and worker tests. The suite verifies the invariants that matter: chip conservation, legality of every engine action, hole-card privacy per seat. Every bug gets a regression test verified to fail without its fix.

**Real-time multiplayer on Cloudflare Workers.** One Durable Object per room, authoritative game state, per-seat snapshots so hole cards never leak. Auto-reconnect with backoff, host migration if the host drops.

**Solver-informed coaching engine.** The coach encodes solver-derived principles — minimum defense frequency, pot-odds math, SPR commitment tiers, range/nut advantage, ICM risk premiums, push/fold charts — plus exploitative adjustments per opponent type, grounded in standard training literature (Sklansky, Harrington, Janda, Clarke).

## How the coach works (and how it gets better)

**It's a rules engine, not a neural net — and that's deliberate.** Every piece of advice traces to a named principle (pot odds, MDF, SPR, ICM) you can verify in a poker book. No black box, no hallucinated ranges.

### Coach improvement methodology

The coach improves through a **human-in-the-loop verification cycle** — real hands played, real mistakes caught, real fixes shipped:

**1. Live hand review** — Full hands are played on the live app (not just simulations). Every coach message is audited against five criteria:
- *Correctness:* Is the recommended action right for this exact spot?
- *Multiway awareness:* In 3+ player pots, does it address the crowd or fixate on one villain?
- *Beginner clarity:* Do opponent reads explain the player type ("calling station — calls with anything") or just name it ("Station")?
- *Jargon-free:* No 3-bet, TAG, MDF, SPR, ICM, or other terms a new player wouldn't know.
- *Intellectual honesty:* Does it present options ("you can raise or call") instead of false certainty? Does it know when to give up?

**2. Bug → regression test → fix** — Every coach mistake found in review becomes a deterministic test that fails without the fix. Examples from real reviews:
- Bottom pair misclassified as "second pair" → now distinguishes 2nd pair from 3rd pair+
- Winning bluffs getting contradictory "slow leak" lectures → recap now celebrates the win
- Iso-raise spots (5 limpers, dead money) saying "fold" → now suggests the profitable raise as an option

**3. Competitive calibration** — Other training tools are studied for what they do better (see `docs/competitive-analysis-2026-10-09.md`). Best ideas are adapted, not copied.

**4. Automated verification** — The unit suite (1,800+ assertions) checks every coach rule stays legal and mathematically consistent. Lint gates every change.

The coach doesn't rewrite itself — improvements are deliberate, tested, and shipped as versions, like any good training program. When the coach is wrong, that's a bug report, not a shrug.

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
