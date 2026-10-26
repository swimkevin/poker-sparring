# Competitive Analysis: SparringPoker vs Poker Sparring

**Date:** 2026-10-09
**Subject:** sparringpoker.com (v1.7.2) — offline poker training app

## What they are

SparringPoker is a downloadable desktop/mobile app (Windows + Android) for offline poker training. Freemium model: 300 hands free trial, then one-time Premium purchase. Bilingual EN/FR (+ Spanish). Their training loop: **Practice → Read → Review → Improve.**

## Where they lead (learnings for us)

### 1. Opponent Reading mode — HIDE bot identities
Their killer feature: opponent names and strategic profiles stay **hidden** until you deliberately reveal them. You have to watch betting patterns and form your own read before checking. This turns passive play into active observation training.

**Our gap:** We show names + archetypes upfront. There's no skill in "reading" when the label tells you.

**Adopt:** Add a "Blind mode" toggle — hides bot names/archetypes (shows "Player 3" etc.), reveals after hand or on demand. This is the single highest-value feature to copy.

### 2. Progress Tracking — period-over-period comparison
They compare recent play vs earlier periods: "your VPIP dropped from 35% to 28%, aggression up 12%." Not just a snapshot — a trend.

**Our gap:** We have session stats and a leak tracker, but no "are you improving?" view.

**Adopt:** Store periodic snapshots (weekly), show deltas. "This week vs last week" panel in stats.

### 3. Personalized coaching from accumulated stats
Their coach analyzes your overall tendencies: "you're calling too much from the blinds" / "your river aggression is low." Ours is per-hand tactical; theirs is strategic.

**Our gap:** No session-level or long-term pattern coaching.

**Adopt:** After N hands, generate a "session report" — top 3 patterns (good and bad) from your actual play data.

### 4. AI decision review export
They generate a structured prompt for ChatGPT/Claude to review your decisions — with only the info available at decision time (no hindsight). Clever: outsources deep analysis without building it.

**Our gap:** No export for external review.

**Adopt:** "Export hand for AI review" button — formats hand history + your decisions as a clean prompt.

### 5. Calibration credibility
They claim "500k+ simulated hands per gamestyle used for calibration." Whether true or not, it's a strong trust signal.

**Our gap:** We say "heuristics, not GTO" (honest) but have no calibration story.

**Adopt:** Run bot-vs-bot simulations, publish real stats (e.g. "Maniac bot VPIP 42% over 10k hands"). Data beats disclaimers.

## Where we lead (don't lose these)

| Dimension | Us | Them |
|---|---|---|
| Platform | Web PWA, zero install, iPhone-ready | Windows/Android download only |
| Price | Fully free, no paywall | 300-hand trial → paid Premium |
| Coach | Real-time, street-by-street | Post-session analysis only |
| Bot variety | 12+ archetypes | 4 gamestyles |
| Tournament mode | Yes, with blind structure | Not highlighted |
| Personality | Friend-named bots, playful | Clinical |
| Ship speed | Daily iterations | Versioned releases |

## Priority roadmap (from this analysis)

**P0 — Opponent Reading mode** (their best idea, fits our training mission)
**P1 — Session report** (personalized coaching from your stats)
**P2 — Progress tracking** (week-over-week deltas)
**P3 — Bot calibration stats** (run sims, publish real numbers)
**P4 — AI review export** (structured prompt generation)

## Strategic note

They're a **product** (monetized, marketed, versioned). We're a **training tool** (free, fast-iterating, personal). Don't chase their business model — steal their training insights and out-execute on coach quality, which is our differentiator.
