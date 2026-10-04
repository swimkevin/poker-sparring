# Roadmap — weekly iterations

The goal: visible, meaningful progress every week — the kind of commit history
that reads well to a recruiter and actually makes the app better. Each week is a
small release: build, test (`npm test`), browser playtest, push, changelog entry.

## v1.3 — QA, tests & engineering hygiene ✅ (this week)

- Fixed 6 issues from the live-browser playtest: actorless hand log, winner/side-pot
  formatting, bb/100 noise, push/fold range inconsistency, feedback duplication,
  per-archetype record accuracy.
- 981 headless tests (was 916): deterministic side-pot/odd-chip/full-hand tests,
  bot move-legality sweep, jsdom component tests.
- Enterprise hygiene: `package.json` scripts, `.editorconfig`, `CHANGELOG.md`,
  `AGENTS.md`, global error boundary, XSS escaping of custom-bot input,
  accessibility pass (accordions, focus states, reduced motion).
- Docs: rewritten README, `docs/ARCHITECTURE.md`, this roadmap, `docs/MOBILE.md`.

## v1.4 — Hand replayer

Re-watch any hand from history street by street. Mostly a UI feature on top of
existing events: persist per-hand action lists, add a replay viewer. High
"wow" per effort.

## v1.5 — Drill packs

New push/fold-style trainers: 3-bet pots, blind defense, and an ICM-flavored
tournament bubble pack. Reuses the scenario/feedback pattern from `pushfold.js`.

## v1.6 — PWA: installable + offline-first

Web app manifest, service worker, iOS/Android install prompts — the phone story
without the App Store. See `docs/MOBILE.md`.

## v1.7 — Range charts

Visual preflop range grids per archetype/position (the natural upgrade from the
6-tier system). Also feeds better push/fold charts.

## v1.8 — Achievements & streaks

Practice streaks, milestone badges, weekly challenges. Retention mechanics;
all local.

## Later / bigger bets

- **LLM hand-review coach** ("why was my river call bad?") — needs a backend or
  bring-your-own-key design; the static build can't hold secrets.
- **React Native port** reusing the DOM-free core (`docs/MOBILE.md`).
- **Online multiplayer** — needs a server; out of scope for the static build.

## Playtest checklist (run before each release)

1. `npm test` green (unit + component + gameplay smoke).
2. Fresh browser: play 3+ hands in cash mode (hero fold / call / raise / all-in).
3. Push/fold trainer: answer 5 spots, check feedback sanity.
4. Stats tab: verify bb/100, leak tracker, per-archetype records.
5. Bots tab: create a custom bot with `<b>` in the name — must render escaped.
6. Push to `main`, verify the live site updated (~2 min).
