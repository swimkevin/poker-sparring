# ADR 0002: Local-first storage, no backend

- **Status:** Accepted
- **Date:** 2026-10-06 (decision made at project inception, 2026-10-04)

## Context

The app persists training stats, leak records, custom bots, and the last 50
hand records. That state has to live somewhere: a backend database with
accounts, or the browser itself.

## Options considered

1. **Backend DB (e.g. Supabase/Postgres free tier).** Cross-device sync,
   leaderboards, real user accounts. Costs: auth, API design, ongoing ops,
   privacy surface, and a signup wall that kills the "no-signup" pitch.
2. **Local-first: `localStorage` with guarded access.** Keys `ps_stats_v1`
   (stats/leaks), `ps_hands_v1` (hand records, capped at 50, newest first),
   plus custom-bot storage. Schema is additive (`blankStats()` merged over
   stored JSON). Costs: no cross-device sync, no leaderboards, clearing site
   data resets everything.

## Decision

Option 2. All storage access is wrapped in try/catch so private-mode browsers
and Node never crash, and the core modules stay DOM-free and storage-agnostic
(`js/stats.js` and `js/replay.js` degrade gracefully without `localStorage`).

## Accepted costs

- Stats don't follow the user across devices — documented as a limitation in
  the README, not a surprise.
- No server-side features (multiplayer, shared leaderboards) are possible;
  those are explicitly out of scope for the static build.

## Why

Zero cost, zero accounts, zero privacy surface — and it matches the product
promise: open the page and practice, no signup. A backend is a real option
later, but only when a feature (e.g. cloud sync) actually needs it. Adding
one for resume optics, with no feature behind it, would be dishonest
engineering; the decision is recorded here so the reasoning is visible.
