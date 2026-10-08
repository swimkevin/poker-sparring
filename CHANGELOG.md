# Changelog

All notable changes to Poker Sparring. Versions are also stamped in the app
footer (`APP_VERSION` in `js/app.js`) and `package.json`.

## [1.8.36] — 2026-10-08

### Fixed
- Seat emoji overflow: boxes now clip content properly.
- Mobile bottom bar compact: 36×50 hero cards, 32px buttons, more felt room.

## [1.8.35] — 2026-10-08

### Fixed
- Desktop seats compact: 88-100px wide (was 118px), smaller text, action text hidden (in hand log). Felt taller (520px). No more overlaps.

## [1.8.33] — 2026-10-08

### Changed
- Shuffle now uses a CSPRNG (`crypto.getRandomValues` in browser, Node `crypto`
  in tests) instead of `Math.random`, with rejection sampling for unbiased
  Fisher-Yates indices — the browser-side equivalent of how regulated sites
  (e.g. PokerStars' GLI-certified quantum RNG) seed shuffles from strong
  entropy. The whole deck is still shuffled once before the hand and never
  re-dealt. Legacy caller-supplied rng param kept for deterministic tests.
- New shuffle tests: 52-unique-cards invariant, chi-square uniformity of the
  first-card rank over 6,500 shuffles, all 52 cards dealt over 500 hands,
  `randInt` uniformity, seeded-rng determinism.

## [1.8.32] — 2026-10-08

### Fixed
- Desktop seat layout: 8 seats now use explicit evenly-spaced positions (was ellipse math causing overlaps on left/right sides).

## [1.8.30] — 2026-10-08

### Fixed
- Mobile seat layout: 8 seats now use explicit evenly-spaced positions instead of ellipse math. No more squished/overlapping seats on left and right sides.

## [1.8.29] — 2026-10-08

### Changed
- Pocket pairs never fold preflop to normal bets — any pair is always playable. Only vs all-ins do small pairs sometimes fold.
- Added "Check for updates" button in footer for manual version checks during live testing.

## [1.8.28] — 2026-10-08

### Changed
- Homepage simplified: removed duplicate "▶ Play" button. Now one clear "♠️ Deal me in" CTA at top and bottom (identical). Less redundant, cleaner for recruiters.
- Amogh now always raises QQ+ first-in (was 20%).

## [1.8.27] — 2026-10-08

### Fixed
- Bot preflop realism: tier-1 hands (QQ+, AKs) never fold preflop — vs a single
  open they 3-bet or call; vs a 3-bet they 4-bet or flat. Tier-2 hands
  (JJ-TT, AKo, AQs/AJs/KQs) also never fold to a single 3-bet at 100bb
  (TAGs were folding JJ/AKo ~77% of the time — same leak class).
  (Amogh folding KK preflop was the reported bug.)
- 4-bets now sized ~2.3x the 3-bet instead of automatic all-in shoves.
- C-bet/value sizing standardized to half-pot through three-quarter-pot.
- Early position plays a tier tighter facing a raise; blinds keep pot-odds defense.
- Short-SPR + strong equity hands commit instead of playing turns/rivers.
- Amogh bombs monsters 70% facing a raise, 20% first-in (was 90% always).

## [1.8.25] — 2026-10-08

### Fixed
- Roster restore no longer caps opponents at 5 when switching game modes.

## [1.8.24] — 2026-10-08

### Changed
- Smaller hero cards (44x62), more compact buttons, pot pinned center-table,
  opponent bet badges visible, "Your turn" text hidden on mobile.

## [1.8.23] — 2026-10-08

### Changed
- Ultra-minimalist mobile design: 56px seats, smaller text, even spacing.

## [1.8.22] — 2026-10-08

### Fixed
- Seat ellipse compressed so all 8 seats visible above the action bar.
- Turn status made compact; max opponents raised to 7.

## [1.8.21] — 2026-10-08

### Changed
- Table rewrite: fixed 8-seat layout (empty seats show as dimmed "Open" placeholders).
- Opponent seats are cardless mid-hand (avatar + name + stack only); cards expand inline face-up at hand end or on voluntary show.
- Hero cards moved to a dedicated always-visible strip (`#hero-cards`) above the action bar; seat-0 on the felt is cardless.
- CSS cleanup: deleted 5 competing seat-card size rules + dead `#seat-0 .pcards` / `#screen-table .hero-cards` overrides; one consolidated TABLE REWRITE block is the single source of truth.
- Hand-end controls: inline in the hero bar on mobile, falling back to the winner banner.

## [1.8.20] — 2026-10-08

### Fixed
- Hero cards visibility (seat moved up, action bar compacted).
- Action button color contrast (fold red, call green, raise gold).

## [1.8.19] — 2026-10-08

### Changed
- PokerNow-style hand end: no blocking modal. Small toast + inline "Next hand" button. All hands revealed face-up at showdown.
- Hero seat moved up (62%) — cards no longer hidden behind action bar.

## [1.8.18] — 2026-10-08

### Changed
- Modern v2 redesign: floating minimal seats, clean felt, refined cards/buttons/tab bar. Muse-clean aesthetic.

## [1.8.17] — 2026-10-08

### Changed
- Modern Muse-clean mobile redesign: softer felt, minimal seats with blur, clean action buttons, elegant winner toast.

## [1.8.16] — 2026-10-08

### Fixed
- Hero seat cards now 56×78 (were 20×30) — the 72×100 rule was targeting the wrong element (.hero-cards instead of #seat-0 .pcards).
- Winner banner redesigned as a compact dismissible toast at the top — no longer blocks the table.

## [1.8.15] — 2026-10-08

### Fixed
- Pot/board moved lower (55% desktop, 58% mobile) — no longer overlaps the top seat.
- Raise bet-panel now opens above the hero seat instead of covering hero cards.

## [1.8.14] — 2026-10-08

### Fixed
- Stats → Recent hands showed wrong suits on every row (hearts/diamonds transposed in the suit-letter map). Hands view was always correct.
- Stats per-hand P/L now includes blind/ante postings. Previously the baseline was snapshotted after blinds were posted, so folding the BB showed 0 instead of −10. (This was the shape of the reported "loss on the wrong row" — a systematic blind exclusion, not a row shift.)
- Stats "Won X" label now shows what the hero actually won (side-pot wins no longer display the full pot).
- Grammar: "You take back" instead of "You takes back" in hand log and topbar result.
- Lobby: the ▶ Play hint's bot count is now live ("vs 4 bots") instead of a hardcoded "vs 3 bots"; subtitle no longer advertises flag-hidden modes (tournament, heads-up, push/fold).
- Lobby blind inputs no longer flag valid values as invalid (`step=5` made the 5/10 defaults themselves fail validation; now `step=1`).

## [1.8.13] — 2026-10-08

### Fixed
- Safari: pot no longer covered by top seat (CSS stacking context fix — z-index on #board-area, not just .pot).
- Mobile hero cards redesigned PokerNow-style: bigger cards (72×100), smaller cleaner text, overflow hidden.
- Removed cut-off action text under seats ("Amogh c...") — redundant with hand history.
- Mobile action buttons now 44px touch targets with better spacing.

### Added
- Feature flags: advanced modes (tournament, heads-up, push/fold) hidden by default. Enable via `enableFlag('name')` or `?flags=name`.
- Coach now position-aware ("You're on the button") with multi-opponent reads.
- Coach naturally accounts for suitedness and multi-way pots in its reasoning.

## [1.8.12] — 2026-10-07

### Fixed
- Pot pill now paints above seats on full tables (was partially hidden behind a seat in 6-max).
- Stale "Last:" result from a previous session no longer lingers in the table topbar when starting a new game.
- Safari fallbacks: `100vh` before `100dvh`, `-webkit-backdrop-filter` for the modal overlay (`:has()` and `dvh` need Safari 15.4+; `env(safe-area-inset-*)` already used).

## [1.8.11] — 2026-10-07

### Added
- Phone bottom tab bar: 🃏 Table, 💡 Coach, 📖 History, ☰ Menu with slide-up panels. No more scrolling to find the hand log or coach tips.

### Fixed
- Folded cards are no longer removed — you always see your own hand, even mid-hand after folding.
- Compact phone table: smaller cards/text that fits the viewport (PokerNow-style).
- Fixed dead CSS selectors that left the action bar covering content.

## [1.8.10] — 2026-10-07

### Fixed
- Phone: action buttons now stay pinned to the bottom of the screen (were scrolling away mid-hand).
- You always see your own cards, even after folding (folding hides them from the table, not from you).
- Mock-mode "Create table" crash fixed (`myEmoji` → `loadEmoji`).
- Returning to the tab after switching apps now auto-reconnects (was stranding players).
- Sitting out mid-hand no longer corrupts the hand ("Seat undefined wins").

## [1.8.9] — 2026-10-07

### Fixed
- Online "Show my cards" button now appears correctly (hole cards cached).
- Online seats show emoji in mock mode too.
- Bankroll chip now actually shows lifetime profit (was stuck at 0).
- Hand history grid renders everyone's cards correctly (was blank).
- "Pair of Sixes" typo fixed.

## [1.8.8] — 2026-10-07

### Added
- **Show your cards (online)** — PokerNow-style: after a hand, tap "👁 Show my
  cards" to voluntarily reveal your mucked hand to the table.
- **Stats hand history** — last 10 hands, each expandable with game mode and a
  "▶ Replay hand" button that opens the hand replayer.

### Fixed
- **Bankroll chip** now shows lifetime profit (persists across refreshes)
  instead of resetting to 0.

## [1.8.7] — 2026-10-07

### Changed
- **Friend bots play looser** — swimkev, Rohan, Amogh, and Nathan now call
  wider when the price is small relative to their stack (40 chips from 3000
  is nothing), and size up their bets a bit. More like a real friendly game.

## [1.8.6] — 2026-10-07

### Added
- **Tournament blind interval** — choose how often blinds go up (default 8 hands).
- **Tournament rebuys** — optional; busted players (you + bots) can buy back in.

### Fixed
- **Collapsible result banner** — hand results now start as a slim bar; tap to
  expand details, tap again to collapse. Never blocks the board, never
  disappears until the next hand. Same for online.
- Round-bets example now uses 27 (not 67).

## [1.8.5] — 2026-10-07

### Fixed (mobile UX audit)
- Logo now taps back to home.
- Action buttons stick to the bottom on phones — no more scrolling to find
  Fold/Call/Raise.
- Nav tabs get a fade hint so it's obvious they scroll.
- Bigger touch targets: bet slider thumb, bot rename, stat info, banner
  dismiss.
- In-game topbar wraps cleanly on small screens.
- Escape closes the Feedback modal.

## [1.8.4] — 2026-10-07

### Fixed
- **Hand history redesign**: everyone's hole cards now show in an organized
  grid at the top (not scattered), result box uses readable colors in both
  themes.
- **Update toast is dismissible**: tap ✕ to finish your hand first; it reminds
  you again in 30 minutes. Online tables auto-rejoin by name after refresh.

## [1.8.3] — 2026-10-07

### Fixed — mobile table UX
- **Board no longer covered on mobile**: compact seat badges, smaller cards,
  and a taller felt keep all 5 community cards visible even 8-handed.
- **Winner banner is dismissible**: tap ✕ to see the board behind it; also
  more compact on small screens.

## [1.8.2] — 2026-10-07

### Added
- **SB/BB position badges**: the small blind and big blind seats now show
  SB/BB pills next to the name (offline and online), matching the dealer
  button style — no more guessing who posted.
- **Pick your emoji**: choose the avatar shown above your seat — a picker on
  the home screen and in the online lobby (30 options, saved locally). Your
  pick travels with you to online tables via the relay.

### Fixed
- **Bet panel opens at the minimum**: tapping Bet/Raise now starts the slider
  at the min legal amount instead of ¾ pot — slide up from there.
- **Worker: chat in lobby snapshots** (`getLobby` now includes the last 50
  messages, like the game snapshot) and **no more double feed lines** on
  timer auto-actions.
- **Worker: `sbIdx`/`bbIdx` in snapshots** so online clients can render
  blind badges; player `emoji` round-trips through join → snapshot.

## [1.8.0] — 2026-10-07

### Added — multiplayer round (PokerNow comparison)
- **💬 Table chat** in online lobbies and games: 200-char messages, server
  relayed, last 50 kept. The #1 thing that makes multiplayer feel alive.
- **Online rebuy**: busted (or short) players top back up to the starting
  stack mid-game; buy-in count tracked per player.
- **📊 Session ledger** (online): per-player buy-ins, stack, and net — the
  trust layer for settling up with friends.
- **"Join sitting out"** checkbox: join a running table as a spectator without
  being dealt in.
- **Host migration**: if the host's connection drops (not a clean leave), a
  connected player who hits Start takes the crown instead of the room
  soft-locking. Transient drops don't strip the host.

## [1.7.3] — 2026-10-07

### Fixed — hiring-manager review round (10 bugs)
- **Stats "Record vs archetypes"**: dropped the misleading split-profit
  attribution (identical figures across archetypes) — rows now show
  hands / won / win%, which is the honest per-archetype signal.
- **Roster selection persists** across reloads (mode/username/renames already
  did); stale ids are dropped. Roster card clicks now notify the app so the
  count, quick-start hint, and saved selection stay in sync.
- **Coach vs stations**: pure-bluff suggestions are suppressed when the
  villain rarely folds; Rohan's stubbornness raised (0.55 → 0.80) to match
  his "calls everything, never bluff him" persona.
- **Bot preflop defense**: maniacs complete the SB heads-up getting 3:1
  instead of folding trash; all bots defend vs min-raises instead of
  over-folding speculative hands.
- **Duplicate bot names rejected** in the custom-bot builder (roster rename
  already guarded).
- **CSS**: defined the missing `--line` variable (hand-history modal borders).
- **Glossary**: Tilt entry no longer claims "the bots never tilt" — they do
  (🌡️ badge), and that's the lesson.

## [1.7.2] — 2026-10-07

### Added
- **💬 Feedback button** in the nav: a small form (Bug / Idea / General,
  title, details) that opens a pre-filled GitHub issue in a new tab —
  version, browser, and screen size are attached automatically. Zero backend.

## [1.7.1] — 2026-10-07

### Fixed — restored features lost in a stash mishap
- **Multiplayer sit-out/back-in:** the Sit out button, seat badges, blind/action
  skipping, mid-hand fold, and all-in pot eligibility are back, with the worker
  protocol (`{t:'sitout'}`) and 32 netplay + 3 worker regression tests.
- **In-table hand history:** the 📖 button opens past hands mid-game again;
  the story HTML is now one shared function used by both the modal and the
  Hands tab.
- **Raise UX:** the raise panel again opens at the minimum legal raise with a
  Min quick button; opening bets still default to ¾ pot.
- **Results pacing:** the hand-end pause is 16 seconds again (was 6), and the
  winner banner is docked at the bottom so the board stays visible.
- **Bankroll pill:** Reset Stats and hero rebuy now zero the session pill
  immediately.

## [1.7.0] — 2026-10-07

### Added — bot realism: rebuys, tilt, tournament pros, thinking explainer
- **Bot rebuys with seat counters (PokerNow-style):** busted bots buy back in
  based on their rebuy tendency (Maniac always, Rock rarely), with a ×N badge
  on their seat and a hand-log line. Toggleable in Table settings; a bot that
  declines leaves the table.
- **Tilt meter:** bad beats (strong hand cracked at showdown), big-pot losses,
  and bust-outs steam bots up; wins and time cool them off. Tilted bots play
  more hands, blast more, and call down lighter — a 🌡️ badge marks the seat.
- **Two tournament archetypes:** The Grinder (tight, relentless 3-bets,
  correct short-stack shoves) and Bubble Boy (folds everything but the nuts).
- **Post-hand bot-thinking notes:** the 1–2 most teachable bot bets/raises get
  a 💭 hand-log line explaining the range logic and your exploit.
- **Custom-bot calibration:** new Tilt-proneness and Rebuy tendency sliders.

### Added — smarter coach
- Coach now teaches TAG aggression: value-bet and semi-bluff math, bluff
  break-even % (½-pot needs 33% folds), 3-bet sizing (~3× the open), bluff
  3-bets with blockers, and bluff-catching vs aggro villains.
- Every tip ends with a per-opponent exploit line (vs the Station: value bet
  big, never bluff…).

### Added — stats & setup UX
- **Stat ⓘ popovers:** every Stats card explains what it means and how it's
  calculated inline (VPIP, PFR, Aggression Factor, bb/100…).
- **Roster selection rework:** named bots (swimkev, Rohan, Amogh, Nathan)
  lead the roster; heads-up locks to exactly 1 opponent (swimkev by default)
  with over-selection refused; pick-order badges; count always derives from
  the selection; leaving heads-up restores your table.
- **Raise UX:** offline raise panel starts at the minimum legal raise
  (PokerNow-style) with a Min quick button; opening bets still default to
  ¾ pot.
- **In-table hand history:** 📖 button opens the Hand Story without leaving
  the table.
- **Results pacing:** 16-second hand-end pause (was 6); winner banner docked
  to the bottom so the board stays visible.
- **Multiplayer:** per-turn timer (Off/15s/30s/45s/60s, auto-check/fold) and
  sit-out/back-in with seat badges.

### Fixed
- Reset Stats / rebuy / leave-table now immediately zero the session
  bankroll pill.
- `getArchetype` fallback is id-based (shark) instead of positional, so
  roster reordering can't change bot behavior.

## [1.6.2] — 2026-10-07

### Fixed
- Session bankroll pill's tooltip/accessible label now says chips, not
  "big blinds".

## [1.6.1] — 2026-10-07

### Fixed
- **Topbar "Last:" totals multi-pot wins:** uncalled "takes back" entries no
  longer break the winner grouping, so "Last: You +1,143" is shown instead of
  just the main pot's "+40".
- **Session bankroll in chips:** the topbar pill now reads "+1,250 session"
  instead of "+125 bb session".
- **Legacy BB fallback rounding:** old hand records without chip amounts show
  "-13.4 bb" instead of float garbage like "-13.437999999999999 bb".
- **Stale "Waiting for X…" cleared** from the action bar during the results
  pause.

## [1.6.0] — 2026-10-07

### Fixed (player-reported)
- **Hand-end results no longer flash by:** the table now pauses 6 seconds after
  every hand with a "Next hand ▸" button and an auto-deal countdown, so the
  winner banner, board, and revealed hands can actually be read. Skipped
  (fast-forward) hands still advance instantly, and ⏩ Skip during the pause
  jumps straight to the next hand.
- **Win amounts are exact:** the "🏆 You win N!" banner and the persistent
  "Last:" topbar line now total what the winner actually took across main and
  side pots (previously the topbar showed only the first pot's share, e.g.
  "+40" on a 685 win). Verified live: banner matched the pot exactly on
  real hands.
- **All bot hole cards revealed at hand end:** every bot shows its cards
  face-up when a hand ends — even folded ones — so you can study how each bot
  played (practice mode). A folded hero sees card backs with a "👁 Show my
  hand" choice, PokerNow-style.
- **Results shown in chips, not BB:** every +/- result (hand list, history,
  per-archetype rows, biggest pot) now reads "+1,250" / "-340" instead of
  "+125 bb". Records saved before this release fall back to BB text.

### Added
- **📖 Hand Story view:** each saved hand now has a clean, phone-readable
  text narrative (streets, actions, board, result, your net) alongside the
  step-through replayer. Hand rows are tidied for narrow screens.
- **Quick-start mirrors your setup:** "♠️ Deal me in" now starts exactly what
  you configured (mode, opponents, stacks, blinds) with a live hint line,
  instead of forcing a fixed 3-bot cash game.

### Changed
- **Smoother bot action flow:** community and hole cards are diff-synced, so
  only newly dealt cards animate — the flop no longer rebuilds when the turn
  lands. Bets fly a chip to the pot, action badges pop, and changed
  pot/stack/bet values pulse instead of snapping.

### Tests
- 1,400 unit + 478 component + 62 netplay + 16 worker assertions green;
  smoke test drives the real app through the new hand-end flow with no JS
  errors. New regression coverage: chip deltas, hand story, bot reveal,
  hero show/muck, next-hand controls, win-amount math, legacy BB fallback.

## [1.5.2] — 2026-10-07

### Fixed
- **Hibernated sockets survive DO restarts:** the per-socket attachment now
  carries the room code, and a socket that speaks up on a restarted instance
  re-registers for broadcasts. Previously, any worker restart/eviction left
  live sockets failing every message with "Room not found" (the lobby looked
  fine, then Start died) — caught by a live two-client test, reproduced in
  `tests/worker.test.js` (fails without the fix, passes with it).

## [1.5.1] — 2026-10-06

### Fixed
- **Dropped connections now auto-reconnect:** a lost relay socket redials with
  backoff and re-sends join, so the Room reclaims the seat and the client
  resyncs to the live table instead of stranding on a stale lobby.
- **Rooms survive host disconnects + worker eviction:** room state persists to
  Durable Object storage (`Room.toJSON`/`fromJSON`); a guest joining minutes
  after the host vanished finds the room intact.
- **Fast redial no longer loses the seat:** a reconnect arriving before the
  server processes the old socket's close is now treated as a session takeover
  instead of being rejected as "name taken."
- **Online status accuracy:** the home status pill now reports the actual mode
  ("Live relay ready" vs "Local mock") instead of always claiming the mock.
- **Coach tip naming:** hole cards are named high-card-first ("Jack Nine")
  instead of in random deal order.

### Added
- **Update-available toast:** a long-open tab polls `version.txt`; when a new
  release lands it offers one-click Refresh instead of needing a hard refresh.
- **One-tap start ("Deal me in"):** a hero button on Play starts a cash game
  vs 3 bots immediately — no configuration wall.
- **Skip hand:** fast-forwards bot-vs-bot streets after the hero folds
  (or folds the hero's live hand first).
- **Turn status line:** explicit "Your turn" / "Waiting for X…" so it's never
  ambiguous why the action buttons are idle; plus a persistent compact
  last-result line in the top bar.
- **Accessibility:** cards announce rank and suit to screen readers; the raise
  slider has an accessible name.
- **Bot renames reject duplicates** inline (two "Doyle"s at one table).

## [1.5.0] — 2026-10-05

### Added
- **Visual polish pass (no behavior changes):** textured felt (woven gradient +
  top light + vignette), staggered card-deal animation, button press physics,
  view transitions, semantic action-button colors (check = blue, call = green,
  bet/raise = gold), pot restyled as a pill badge, Georgia serif display type
  with monospace hand log (system stacks only — the app stays offline-first),
  bot "thinking" dots on the to-act seat, and a remembered **light theme**
  (warm paper, toggle in the top bar, persisted in localStorage).

## [1.4.2] — 2026-10-04

### Fixed
- **Hand replayer street-jump buttons:** the Pre-flop/Flop/Turn/River buttons
  rendered but never responded to clicks — `ui.js` tags them with
  `data-street` while `app.js` wired clicks via a `[data-rp-street]`
  selector that matched nothing (found by live-browser playtest of v1.4.1).
  Wiring now uses the same attribute, scoped to the replay view.

### Tests
- Smoke test now clicks a street-jump button in the replay viewer and asserts
  the frame actually moves (and the flop renders, or the jump lands at the end
  for preflop-ending hands). Verified the new assertion fails against the
  unfixed wiring and passes with the fix.

## [1.4.1] — 2026-10-04

### Fixed
- **Engine crash on broke players ("zombie" bug):** a busted player left seated
  with 0 chips (cash games never marked them `sittingOut`) held no cards but
  counted as a live player. A hand could then run to a showdown with no eligible
  winner and crash in `_showdown` (`TypeError: Reduce of empty array`), or award
  a pot to a cardless player by fold. `livePlayers()` now only counts players
  who can still contest chips (not folded/out and `stack > 0 || totalBet > 0`);
  all-in players are unaffected. `_showdown` also hardens the empty-eligible
  case: contributors are refunded their slice at that level (chip-conserving)
  instead of throwing, and the refund is flagged on the `handEnd` event.
- **Cash-game bot top-up:** felted bots (0 chips) now top back up to the full
  buy-in like the rest of the table, instead of sitting out every future hand as
  cardless zombies and slowly killing the table.

### Tests
- 1,058 headless tests (was 1,041): new regression tests replicate the exact
  crash scenario (broke players seated, hero SB folds to a short-stack BB
  blind — asserts no throw, fold-win to the shorty, chip conservation), an
  all-in showdown with broke players seated, and a direct degenerate
  `_showdown` call (asserts no throw, contributor refund, conservation, and the
  `refunded` flag on `handEnd`). Verified the new tests fail against the
  unfixed engine (10 failures) and pass with the fix; a 12,000-hand soak
  diagnostic completed with zero crashes.

## [1.4.0] — 2026-10-04

### Added
- **Hand replayer** (new "Hands" tab): every finished hand is now captured as a
  per-hand action/event record (hero hole cards, blinds/antes, every action
  with street and running pot, board by street, winners/result) and persisted
  to localStorage (`ps_hands_v1`, last 50 hands, newest first — existing stats
  keys untouched). Open any hand to replay it street by street: ⏮ Start /
  ◀ Prev / Next ▶ / End ⏭ plus Pre-flop/Flop/Turn/River jump buttons, with
  board cards, action list, running pot, and result at the final frame.
- New DOM-free module `js/replay.js`: capture (`startHandRecord`,
  `recordHandAction`, `recordHandStreet`, `finishHandRecord`), storage
  (guarded, capped), and a replay state machine (`replayState`,
  `frameIndexForStreet`).
- Engine: `actionTaken` events now carry `street` (one-line, backward
  compatible) so capture doesn't depend on event-pump timing.

### Tests
- 1,041 headless tests (was 981): +41 unit tests — deterministic capture of a
  rigged preflop shove (action sequence, pot evolution 5/15/110/200, winners,
  hero net), a rigged multi-street hand (street frames in order, exact flop
  cards, non-decreasing pot, step forward/back), synthesized ante/blind
  ordering, and storage cap/ordering/clear. +21 jsdom component tests —
  hand-list rendering (rows, net styling, hole cards, empty state, open-by-id),
  replay viewer frames (start/mid/flop/end, disabled states, progress text,
  result banner, street-jump buttons), and XSS escaping of hostile timeline
  names. Gameplay smoke now also verifies a saved record renders in the Hands
  tab and steps through to the end with zero JS errors.

## [1.3.0] — 2026-10-04

### Fixed
- Hand log now names the acting bot on every action ("🪨 The Rock raises to 250"
  instead of "raises to 250").
- Winner banner labels pots ("Main pot" / "Side pot 1") and separates the hand
  description from the amount; uncalled bets are explained.
- Push/fold trainer: facing-a-shove verdicts are now computed against the
  shover's **range** (new `estimateEquityVsRange()` in `js/equity.js`, driven by
  each archetype's own `pushTier`) instead of comparing a tier chart against
  misleading vs-random equity. The feedback text shows the range equity it used.
- Stats: `bb/100` shows "—" until 20+ hands (it was noise before that).
- "Record vs archetypes" now counts only opponents actually dealt into each hand.
- Custom-bot emoji is HTML-escaped everywhere it renders (stored-XSS guard).

### Added
- 981 headless tests: unit (evaluator, engine, equity, bots, stats, push/fold),
  deterministic side-pot/odd-chip/full-hand scenarios, bot move-legality sweep
  (999 decisions, all archetypes), and jsdom component tests
  (`tests/component.test.js`: escaping, feedback rendering, glossary accordions,
  stats guards, leak tracker states). Run with `npm test`.
- `package.json` with `test` / `test:unit` / `test:component` / `serve` scripts;
  jsdom as the only devDependency (zero runtime dependencies preserved).
- Global error boundary: a UI glitch logs a calm notice instead of killing the table.
- Accessibility: `<details>` accordions for the glossary and leak explanations,
  `prefers-reduced-motion` support, `:focus-visible` styles, `role="dialog"` on modals.
- `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/MOBILE.md`; rewritten README.

## [1.2.0] — 2026-10-04
- Learn screen: 3 essential books, 3 free training sites, 29-term glossary.
- Leak tracker: detects 4 hero mistake types live, explains the math, persists locally.

## [1.1.0] — 2026-10-04
- Setup rework: opponent-count stepper (1–5), 1,000-chip defaults.
- Five literature-grounded archetypes (Rock, Calling Station, Maniac, TAG Shark,
  Tricky LAG), each with a "how to beat" exploit tip.

## [1.0.0] — 2026-10-04
- Initial release: cash / heads-up / tournament / push-fold trainer, Monte Carlo
  equity engine, heuristic bot AI, local stats, GitHub Pages deployment.
