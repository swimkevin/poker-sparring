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

## v2.0 — Online multiplayer (prototype) ⬅️ IN PROGRESS

PokerNow-style friendly online poker as a separate **Online** mode (BETA tab):
host creates a table with settings (2–8 players, stacks, blinds, turn timer),
friends join with a 6-letter room code, host starts/pauses, everyone plays
with per-turn timers (auto-check/auto-fold on expiry).

**Architecture (mock vs worker split):**
- `js/room-server.js` — DOM-free authoritative `Room` state machine wrapping
  the `PokerTable` engine: lobby/seating, turn timers (injectable clock),
  host pause (freezes timers), per-seat snapshots (hole cards only to owner).
- `js/netplay.js` — JSON message protocol, `NetClient` WebSocket wrapper, and
  `MockRoomServer`: the same protocol delivered via direct calls, so the UI
  and the 46-test suite (`tests/netplay.test.js`) run with NO backend.
- `js/online.js` — UI controller reusing the offline felt/seat/card CSS.
- `worker/` — Cloudflare Workers + Durable Object production path (one DO per
  room code, WebSocket relay, alarm-driven timers). Documented in
  `worker/README.md`; not executed by `npm test`. Free-tier friendly.

**Still to do:** real reconnect resume, mid-game rejoin polish, chat,
play-money persistence across games, rate limiting / abuse controls, DO
eviction snapshotting. The offline modes are untouched (additive only).

## Next week — planned (2026-10-06 full QA round)

Prioritized from the 2026-10-06 live QA pass (19 steps, all major flows).
Order reflects user value per week-sized release:

1. **v2.0 live: deploy the Cloudflare relay** — the single unlock for real
   multiplayer. Needs the account owner's signup + deploy (dashboard paste
   path needs no terminal; see `worker/README.md`). Then: two-browser
   WebSocket test, reconnect/resume for dropped mobile players, table chat.
2. **v1.6 drill packs** — 3-bet pots, blind defense, ICM-flavored tournament
   bubble. Reuses the `pushfold.js` scenario/feedback pattern (now fixed:
   no duplicate opponents, honors roster selection + renames).
3. **Sound design** — Web Audio chip clicks, card deals, win fanfare; mutable,
   zero deps. Cheapest big feel win on the list.
4. **v1.9 streaks & achievements** — daily practice streaks, milestone badges,
   weekly challenges. The daily-use driver; all local.
5. **v1.8 range charts** — visual preflop range grids per archetype/position.

QA fixes shipped 2026-10-06 (this round): session-profit header stat was
mixing chips and big blinds (showed +91 bb on a 1 bb win — now a tested
`sessionProfitBB` helper); push/fold trainer showed duplicate opponents and
ignored roster selection/renames; seat-widget action text clipped past card
edge (`max-width: 100%`); online hero seat showed card backs while the action
panel showed real cards; the ⏸ Paused badge rendered on every online table
because `.online-paused { display: flex }` overrode the `hidden` attribute
(now `[hidden] { display: none !important }`); leak tracker fired "calling too
loose" on defensible TQo calls (now: tier-6 trash vs any raise, tier-5 only
vs 4bb+ heat).

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
