# How AI-assisted development works on this repo

This project is deliberately built with AI agents — and deliberately built
so a hiring manager can see *how*. The workflow below is the actual practice
used for every release, not an aspiration.

## The setup

The repo ships executable guardrails, not vibes:

- **`AGENTS.md`** (30-second version) and **`CLAUDE.md`** (full guide) bound
  agent behavior: the layering rule (`cards → evaluator → equity → engine →
  bots` stay DOM-free), engine contracts (`table.legalActions()`,
  bet/raise `amount` is the total street target), and conventions (guarded
  `require` blocks, no emojis in code comments).
- **Standing rules agents must follow:** `npm test` must pass before any
  push; every engine/bot/equity change ships with a targeted test; never
  `innerHTML` user-controlled strings without `UI.escapeHtml`; keep
  functions small and comment the decision points.

## What agents may do

Implement, refactor, and draft docs **within a brief**: a bounded task with
the files, constraints, and acceptance criteria spelled out. Agents write
code, write tests, run the suite, and report diffs.

## What agents may never do

- **Push without human approval.** Every push to GitHub goes through an
  explicit human approval step; agents prepare commits, the human ships.
- **Invent metrics, dates, or events.** Test counts, version numbers, and
  incident details come from tool output or the changelog — never from
  plausible-sounding generation. (The changelog once carried an inflated
  fuzzer claim; it was corrected to the defensible figure rather than
  shipped.)
- **Reverse an ADR decision or change honest labeling.** The "offline bot
  AI, never ML" rule (ADR 0003) is a human decision; an agent doesn't get to
  rebrand it.

## Verification

Every agent change goes through the same gate: the full `npm test` suite
(1,058 tests) **plus human diff review** before commit. Agents have been
observed catching real bugs this way — e.g. a smoke-test ordering flake the
agent introduced was caught by the suite, diagnosed, and fixed with a
regression guard in the same session.

## Authorship

Architecture decisions stay human. ADRs (`docs/adr/`) record decisions the
human made; agents may draft the write-up but never invent or reverse the
decision itself. **Kevin Song owns every result** — the agents are leverage,
the judgment is his. That division of labor is the skill being demonstrated:
directing and verifying AI output the way a senior engineer directs a team.
