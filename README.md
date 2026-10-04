# 🂡 Poker Sparring

**Train against offline poker AI.** A free, no-signup Texas Hold'em practice app: play cash games, heads-up, and tournaments against bots with distinct, customizable playing styles — or drill short-stack push/fold spots with instant feedback.

▶️ **Live demo:** `https://swimkevin.github.io/poker-sparring/`

![vanilla JS](https://img.shields.io/badge/vanilla-JS-yellow) ![no dependencies](https://img.shields.io/badge/dependencies-0-brightgreen) ![tests](https://img.shields.io/badge/tests-900%2B%20passing-brightgreen)

## Why this exists

Most poker tools are either real-money sites or static charts. Poker Sparring is a **sparring partner**: offline AI opponents modeled on the player archetypes you actually meet — the nit who only plays aces, the calling station you can't bluff, the maniac who raises every hand. Practice exploiting each style, then build your own custom bot to drill the exact player type that gives you trouble.

## Features

- **4 game modes** — 6-max cash (100bb, auto top-ups), heads-up, full tournaments (escalating blinds + antes, eliminations), and a push/fold trainer
- **5 built-in AI archetypes** — The Nit 🧊, Calling Station 📞, The Maniac 🤪, TAG Shark 🦈, Tournament Crusher 🏆, each with measurably different VPIP/PFR/aggression profiles
- **Custom bot builder** — sliders for looseness, aggression, bluff frequency, and call-down stubbornness; saved to your browser
- **Real poker engine** — full betting rounds, side pots, all-ins, split pots with odd-chip rules, antes, heads-up blind rules
- **Coach tips** — contextual advice on your turn: pot-odds math, equity estimates, position and draw guidance
- **Training stats** — VPIP/PFR/aggression factor, win rate (bb/100), stack graph, per-archetype records, hand history export (JSON)
- **100% offline** — no accounts, no servers, no tracking. Stats live in `localStorage`.

## How the bot AI works

No neural nets — transparent, tunable heuristics (see `js/bots.js`):

1. **Preflop**: hole cards are bucketed into 6 strength tiers; each archetype has open/call/3-bet tier thresholds adjusted for position, plus push/fold logic under 13bb.
2. **Postflop**: Monte Carlo equity estimation (~150 rollouts vs opponent ranges) combined with made-hand strength and draw detection drives bet/call/fold decisions; pot-odds math gates every call.
3. **Personality**: aggression shifts value-bet thresholds, bluff frequency drives bluffs/semi-bluffs, stubbornness widens call-downs.

Bot-vs-bot simulations confirm the styles separate cleanly (nit ~9% VPIP → maniac ~80%+), and no archetype is trivially exploitable.

## Project structure

```
poker-sparring/
├── index.html          # App shell (screens: setup, table, push/fold, bots, stats)
├── css/style.css       # Dark casino theme, no frameworks
├── js/
│   ├── cards.js        # Card primitives
│   ├── evaluator.js    # 7-card hand evaluator (21-combination, integer-scored)
│   ├── equity.js       # Monte Carlo equity, hand strength, draw detection
│   ├── engine.js       # Table engine: blinds, betting rounds, side pots, showdown
│   ├── bots.js         # Archetypes + heuristic decision engine
│   ├── pushfold.js     # Push/fold drill scenarios + chart-based feedback
│   ├── stats.js        # localStorage training stats
│   ├── ui.js           # DOM rendering (no game logic)
│   └── app.js          # Game flow, event pump, controls, tournament logic
└── tests/test.js       # Headless engine tests (run with node)
```

**Architecture note:** the poker core (`cards` → `engine`, `bots`, `pushfold`) is DOM-free vanilla JS with zero dependencies — it runs unchanged in Node (tests), the browser, and later a React Native mobile port.

## Run it

No build step. Either:

```bash
# Option A — just open it
open index.html

# Option B — serve locally (recommended; avoids file:// quirks)
python3 -m http.server 8000
# → http://localhost:8000
```

Run the test suite (evaluator correctness, 300-hand engine soak test with chip-conservation checks, bot behavior):

```bash
node tests/test.js
```

## Deploy (free)

This is a static site — push to GitHub and enable **Settings → Pages → Deploy from branch** (`main`, `/root`). Your app is live at `https://<user>.github.io/poker-sparring/` in ~2 minutes. No backend needed.

## Roadmap

- [ ] Mobile app (Expo/React Native reusing the DOM-free engine)
- [ ] GTO-inspired range charts per archetype
- [ ] LLM hand-review coach ("why was my river call bad?")
- [ ] Online multiplayer rooms
- [ ] More drill packs (3-bet pots, blind defense)

## Contributing

See [CLAUDE.md](CLAUDE.md) for the contributor/AI-agent guide: architecture, conventions, and how to run tests.

---

*Built to make practice fun — and to show what a focused side project can look like.*
