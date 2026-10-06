# ADR 0003: Heuristic bots, not ML — and honest labeling

- **Status:** Accepted
- **Date:** 2026-10-06 (decision made at project inception, 2026-10-04)

## Context

The product is "practice against AI opponents." That can mean a trained model
or transparent heuristics. The label on the box matters as much as the
technique: calling heuristics "ML" would be the easy, dishonest upgrade.

## Options considered

1. **Trained ML model** (e.g. a small policy network or CFR approximation).
   Costs: training pipeline, model hosting, an unexplainable black box, and
   heavy dependencies — all for opponents whose whole point is to be
   *readable* practice targets.
2. **Transparent heuristic agents.** Tiered hand ranges (6 preflop tiers),
   Monte Carlo equity vs opponent ranges, pot-odds math gating every call,
   personality parameters (aggression, bluff frequency, stubbornness) per
   archetype. Every decision rule is readable and tunable in `js/bots.js`.

## Decision

Option 2, with honest labeling everywhere: the README says "offline bot AI"
and states plainly that the opponents are "transparent heuristic agents —
not neural networks or trained models."

## Accepted costs

- Bots are exploitable by design and don't adapt — that's the point (you
  practice exploiting fixed styles), but no one should mistake them for
  solver-grade opposition.
- No "AI-powered" marketing halo. The repo trades hype for credibility.

## Why

Heuristics are explainable (the coach can show the math behind a tip),
testable, and dependency-free. Bot-vs-bot simulations verify the archetypes
separate cleanly (Rock ~7% VPIP → Maniac ~74%), and an automated sweep
verifies every archetype only produces legal moves. You can't write those
tests against a black box. The labeling discipline is itself the signal:
senior engineers describe what the system *is*, not what sounds impressive.
