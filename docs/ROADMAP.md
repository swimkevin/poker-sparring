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

## v1.4 — Hand replayer ✅ (shipped 2026-10-04)

Re-watch any hand from history street by street. New "Hands" tab: per-hand
action capture, 50-hand localStorage history, replay viewer with Prev/Next and
street-jump controls. 1,041 headless tests (was 981).

**v1.4.1** (2026-10-04): engine crash fix — broke players left seated with 0
chips no longer count as live (they could force a showdown with no eligible
winner); `_showdown` refunds degenerate levels instead of throwing; cash-game
bots top up from 0. 1,058 headless tests.

**v1.4.2** (2026-10-04): replay street-jump buttons fixed (wiring queried a
data attribute the buttons never had — caught by live-browser playtest).

**v1.5.0** (2026-10-05): visual polish release — textured felt, staggered deal
animation, press physics, view transitions, semantic action colors, pot pill,
serif/mono typography (offline-safe system stacks), bot thinking dots, and a
remembered light theme. No behavior changes.

## v1.6 — Drill packs ⬅️ NEXT

New push/fold-style trainers: 3-bet pots, blind defense, and an ICM-flavored
tournament bubble pack. Reuses the scenario/feedback pattern from `pushfold.js`.

## v1.7 — PWA: installable + offline-first

Web app manifest, service worker, iOS/Android install prompts — the phone story
without the App Store. See `docs/MOBILE.md`.

**Also in v1.7: analytics.** Add Cloudflare Web Analytics (free, privacy-first,
one `<script>` tag — no cookie banner needed). This starts daily-active-user
tracking with zero backend. Measure before monetizing.

## v1.8 — Range charts

Visual preflop range grids per archetype/position (the natural upgrade from the
6-tier system). Also feeds better push/fold charts.

## v1.9 — Achievements & streaks

Practice streaks, milestone badges, weekly challenges. Retention mechanics;
all local.

## Design polish backlog (from competitive research, 2026-10-05)

Surveyed the best open-source/AI-built poker trainers (Fold Call or Jam,
All-In Poker Dojo, CardsGTO, QuantPlay). Highest-impact visual upgrades not
yet built, in priority order — fold into weekly sessions as v1.x polish
releases; keep the existing dark-casino identity, offline-first, zero-dep:

1. **Dual theme** — real light theme via CSS variables (warm-paper light:
   felt `#1d6b50`, rail `#6b5636`), remembered toggle. Biggest perceived
   polish per the research.
2. **True oval felt** — `border-radius:50%/42%`, layered weave texture
   (`repeating-linear-gradient` 45°/-45°), radial light from top, inset
   vignette. Seats already absolutely positioned; map to ellipse coords.
3. **Staggered deal animation** — per-card `animation-delay` (~70ms steps),
   `backwards` fill; deal from `translateY(-14px) rotate(-4deg) scale(.9)`.
   Animate only newly dealt cards, not every re-render.
4. **Thinking dots** — three bouncing dots on the to-act seat during bot
   turns; action badges pop in as pills above seats.
5. **Keyboard shortcuts** — F fold / C check-call / R raise / Enter confirm,
   `?` overlay. Power-user feel, ~20 lines.
6. **Onboarding** — first-visit 3-step tour overlay + empty states that
   invite action ("Actions will appear here"). Never a blank panel.
7. **Session HUD tiles** — HANDS / NET / BB-100 strip on the table screen
   (data already in stats.js).
8. **Typography** — display serif for brand/headings + `tabular-nums`
   everywhere money appears (mostly done) + monospace hand log. Note: no
   Google Fonts — app promises offline; use system serif/mono stacks.

## Engineering credibility backlog (free, high resume signal)

- **GitHub Actions CI** — run `npm test` on every push/PR; add passing
  badge to README. Free for public repos.
- **PWA shell** (already v1.6) — manifest + install prompt; the phone story
  without the App Store.
- **No-backend decision record** — localStorage/IndexedDB is a legitimate
  local-first architecture; document the tradeoff in ARCHITECTURE.md.
  Add a real backend (Supabase/Cloudflare D1, free tiers) only when a
  feature (e.g. cloud sync) needs it — never for resume bingo.

## Monetization track (secondary — after the product earns users)

Priority order is deliberate: **resume first, revenue second.** A FANG/AI offer
is worth orders of magnitude more than early app revenue; the public repo *is*
the resume. Nothing below requires taking the repo private.

- **Anytime: GitHub Sponsors.** Free tip jar on the profile (10 min setup).
  Zero code changes.
- **After analytics show real usage: Capacitor → App Store.** Same codebase in a
  native shell, ~1 week of work, $99/yr Apple Developer. Paid-upfront
  ($2.99–4.99) or freemium. No real-money play anywhere — keeps App Store review
  viable (training apps are allowed; gambling-adjacent gets extra scrutiny).
- **Later, if retention justifies it: premium backend.** Cloud sync, LLM hand
  reviews, advanced drill packs as subscription. Needs a real backend; keep the
  web client public (open-core model) and only the premium service private.
- **What not to do:** AdSense on a niche trainer (pennies, hurts UX), or going
  private prematurely (kills the resume value for zero revenue benefit).

**Do you have to take it off public GitHub to make money? No.** This is the
standard indie pattern: public repo + paid distribution (App Store binary,
hosted premium). The code being public doesn't stop anyone from paying for the
convenient, polished, installable version — the moat is distribution and UX,
not the source. And for hiring, the public repo with live demo and real commit
history is exactly what FANG/AI hiring managers want to see.

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
