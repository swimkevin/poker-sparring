# Roadmap

(Rewritten 2026-10-18 — the old version planned v1.3–v2.0; we're at v1.8.107 and most of it shipped.)

## Where the app stands

Everything below is live at https://swimkevin.github.io/poker-sparring/:

- Cash games, heads-up, and tournaments vs 14 AI archetypes (friend-named bots included)
- Solver-informed coach with plain-English advice, leak tracker, post-hand recaps
- Hand replayer, training stats, push/fold trainer, Learn tab
- Real online multiplayer (Cloudflare Workers relay): room codes, chat, rebuys, host migration
- Mobile-first layout, light/dark themes, PWA-installable
- GitHub Actions CI runs the full suite on every push

## Current direction: polish, not features

The app is feature-complete for its purpose (a personal poker trainer for Kevin and friends). Work now is:

1. **Realism** — bots play like people with money at stake (v1.8.104: fold air to ½-pot+)
2. **Coach clarity** — every message plain-English, never self-contradictory, verified by live hand audits
3. **Bug-free** — full suite (34 suites) + live 10-hand loop + coach evals green before every release
4. **Debloat** — dead code removed, docs kept current

## Deliberate non-goals

- No real money, ever
- No accounts / backend user data (local-first)
- No native app (PWA covers the phone story)
- No ML bots (heuristics are debuggable and explainable — see `docs/adr/0003-heuristic-bots-not-ml.md`)

## Ideas on ice

Drill packs (3-bet pots, blind defense), sound design, streaks/achievements, visual range charts. Any of these can become a release if there's a real user asking — none are being built speculatively.

## Monetization (secondary — resume first)

A FANG/AI offer is worth orders of magnitude more than early app revenue; the public repo *is* the resume. If revenue ever makes sense: GitHub Sponsors tip jar (free), then Capacitor → App Store ($99/yr) once analytics show real usage. No real-money play anywhere. The repo stays public regardless — the moat is distribution and UX, not the source.

## History

See [`CHANGELOG.md`](../CHANGELOG.md) for the full release history (100+ versions).

## Playtest checklist (run before each release)

1. `npm test` green (full chain, bare exit code, grep for FAIL).
2. `npm run livetest` — 10/10 hands, 0 issues, 0 JS errors.
3. Fresh browser: play 3+ hands in cash mode (hero fold / call / raise / all-in).
4. Push/fold trainer: answer 5 spots, check feedback sanity.
5. Stats tab: verify bb/100, leak tracker, per-archetype records.
6. Bots tab: create a custom bot with `<b>` in the name — must render escaped.
7. Bump version everywhere, push to `main`, verify the live site updated (~2 min).
