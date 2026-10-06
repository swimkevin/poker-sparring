# ADR 0001: Vanilla JS, zero runtime dependencies

- **Status:** Accepted
- **Date:** 2026-10-06 (decision made at project inception, 2026-10-04)

## Context

Poker Sparring is a poker training app: a real-time table engine, heuristic
opponent AI, and several drill screens. The natural default in 2026 would be
React (or Vue/Svelte) plus a bundler, which buys component structure, state
management, and a large ecosystem.

## Options considered

1. **React + Vite + TypeScript.** Component model, devtools, huge ecosystem.
   Costs: build step, ~100KB+ runtime before app code, framework churn, and
   the framework would own the architecture — easy to hide weak design behind
   it.
2. **Vanilla HTML/CSS/JS, zero runtime dependencies, no build step.**
   Costs: every abstraction (rendering, state, events) is hand-rolled; no
   ecosystem to lean on.

## Decision

Option 2. The app is plain `<script>` tags, classic globals in the browser
with guarded `require` blocks for Node, and jsdom as the only devDependency.
`package.json` exists for scripts only.

## Accepted costs

- All UI structure is hand-built DOM in `js/ui.js`; there is no virtual DOM
  diffing and no component library.
- State lives in explicit module-level objects in `js/app.js`, not a store.
- Hiring managers who filter on framework keywords will not find "React" here;
  the bet is that readable architecture + 1,058 tests says more than a
  framework label.

## Why

Instant load, genuinely offline-first (the footer promises "offline" and means
it), and — the decisive reason — it forces architectural ownership. With no
framework, the layering (`cards → evaluator → equity → engine → bots`,
DOM-free core) had to be designed deliberately, and the tests run in plain
Node with no framework harness. That is the senior-level signal this repo is
built to demonstrate.
