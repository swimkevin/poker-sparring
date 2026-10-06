# ADR 0004: Static deploy on GitHub Pages

- **Status:** Accepted
- **Date:** 2026-10-06 (decision made at project inception, 2026-10-04)

## Context

The app needs hosting. Options range from a free static host to a VPS or
serverless backend, each with different cost, ops, and capability trade-offs.

## Options considered

1. **VPS / serverless backend.** Enables auth, multiplayer, server-side
   features. Costs: real money, ops burden, and a backend the product doesn't
   need.
2. **GitHub Pages, "Deploy from branch" (`main`, `/root`).** Free, deploys on
   every push in ~1–2 minutes, zero config. Costs: no server-side code, no
   secrets, no dynamic behavior beyond the static files.

## Decision

Option 2. The repo has no server code, no API keys, and no build step, so
there is nothing to deploy *but* static files — the hosting matches the
architecture instead of fighting it.

## Accepted costs

- No multiplayer, no server-side persistence, no secrets management. All
  documented as limitations in the README.
- Tied to GitHub's Pages pipeline (build minutes, no custom headers); fine
  for a portfolio piece, would be revisited for a real product.

## Why

It is free, instant, and honest: the deploy story is "push to main, live in
two minutes," which is exactly the iteration loop a weekly-release side
project wants. Combined with ADR 0002, the whole system has no backend to
operate, monitor, or pay for — operational simplicity as a deliberate choice,
not an accident.
