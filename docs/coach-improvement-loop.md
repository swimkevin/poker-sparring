# Coach Improvement Loop — Tuesday Automation Plan

**Starts:** Tuesday, October 13, 2026 (when poker work resumes)
**Cadence:** Daily, ~6:48 AM ET (same slot as the previous poker automation)
**Owner:** Automated (Muse), with Kevin reviewing results

## What it does each day

### Phase 0: Fast static checks (new, < 30 seconds)
1. Run `node tests/coach-scenarios.js` — 15 static verifications
2. Run `node tests/coach-advice.test.js` — 22 unit tests
3. Run `npx eslint js/` — lint gate
4. If any fail, fix before proceeding to browser audit

### Phase 1: Live hand audit (the core loop)
1. Play 5 full cash-game hands on the live site via browser automation
2. Record every coach message (preflop + postflop)
3. Audit each message against the 5 criteria:
   - Correctness of the recommended action
   - Multiway awareness (crowd vs single villain)
   - Beginner clarity (explains player types)
   - Jargon-free language
   - Intellectual honesty (options, not commands; knows when to give up)
4. Rank issues by severity
5. **Check for duplication**: if coach text appears doubled, flag as P0

### Phase 2: Fix and test
1. Fix the top 1-3 issues found
2. Add regression tests (must fail without the fix)
3. Add scenario to `tests/coach-scenarios.js` if applicable
4. Run full test suite + ESLint + scenario verification
5. Bump version, update CHANGELOG

### Phase 3: Ship and verify
1. Push to GitHub via PAT
2. Verify live deployment (version.txt + footer + commit SHA)
3. Wait 60s for CDN, re-verify version
4. Re-run browser test on the new version to confirm fixes
5. If duplication or critical bug found, fix immediately (don't wait for next day)

### Phase 4: Competitive research (weekly, not daily)
Every Tuesday, check one competitor or poker training resource for ideas.
Document in `docs/` with what to adopt vs ignore.

## Roadmap priorities (from 2026-10-09 competitive analysis)

**Week 1-2: Coach quality** (current focus)
- Continue the hand-audit loop
- Fix classification bugs, improve multiway logic
- Refine opponent reads and beginner explanations

**Week 3-4: Opponent Reading mode** (P0 from competitive analysis)
- "Blind mode" toggle: hide bot names/archetypes
- Reveal on demand or after hand
- Track "read accuracy" — did you correctly identify the player type?

**Week 5-6: Session reports** (P1)
- Post-session analysis: top 3 patterns from your play
- "You're calling too much from the blinds" style insights
- Generated from actual hand history data

**Week 7+: Progress tracking, calibration, AI export** (P2-P4)
- Week-over-week stat deltas
- Bot-vs-bot simulation stats
- "Export for AI review" button

## Known issues (from 2026-10-09 audits)

### Coach text duplication (v1.8.66, under investigation)
**Symptom:** Every coach suffix (position, multiway note, opponent bullets) renders twice.
First copy has empty values, second has filled values.
**Status:** Critical 3+ limpers bug is FIXED (coach renders). Duplication is cosmetic
but blocks automation parsing. Needs browser DevTools debugging.
**Hypothesis:** Race condition in equity calculation (first render before async
complete, second after). Or double `coachVerdict()` invocation.

### Coach absent on checked-around streets
Coach doesn't render when action checks around to hero on flop/turn.
**Decision needed:** Is this intentional (only key spots) or a gap?
Automation expects coach on every hero decision.

## Audit process improvements (from 2026-10-09 second audit)

The second audit revealed the loop itself needs hardening:

**What worked:**
- Playing real hands caught a critical rendering bug (coach silent on 3+ limpers) that code reading alone missed
- The 8 specific checks gave crisp pass/fail signals
- Source reading confirmed fixes exist in code even when UI couldn't verify

**What didn't:**
- Protocol assumed coach always renders (no "absent" procedure) — now: record state + check DOM when absent
- Navigating away to read JS mid-hand risked losing hand state — now: read code only between hands
- 5 random hands can't reliably produce rare spots (paired boards, flush draws, 6-way) — now: use Skip to fast-forward; add rigged-deck test mode for rare spots
- Silent try/catch hid the rendering bug — now: surface JS console errors during audit
- The 3+ limpers spot wasn't an explicit regression case — now: add it

**Updated protocol:**
1. Define absent-coach procedure before starting
2. Read code only between hands, never mid-hand
3. Use Skip to reach interesting spots faster
4. Check browser console for errors (don't rely on UI alone)
5. Maintain a list of "rare spots" to specifically hunt for

## What it does NOT do

- No speculative features without Kevin's approval
- No changes to game engine, multiplayer, or UI beyond coach-related
- No marketing, no monetization, no analytics
- Stays in the "training tool" lane — doesn't chase SparringPoker's product model

## Success metrics

- Coach issues found per audit (trending down)
- Regression tests added (trending up)
- User-reported coach mistakes (target: zero per week)
- Time from bug found to fix shipped (target: < 24h)

## Pause conditions

Kevin can pause this anytime. The automation stops if:
- Kevin says stop
- 3 consecutive days with zero issues found (coach is solid — shift to roadmap features)
- A critical bug breaks the live site (fix first, then resume)
