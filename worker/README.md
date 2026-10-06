# Poker Sparring relay (Cloudflare Workers + Durable Objects)

Production backend for the **Online** tab: an authoritative, real-time poker
room server. Each room code maps to one Durable Object instance holding a
`Room` (the same DOM-free class from `js/room-server.js` — wrangler bundles it
directly, no code duplication). Browsers connect over WebSocket; the server
validates every action against the engine and sends per-seat snapshots (your
hole cards go only to you).

The in-page **mock server** (`js/netplay.js` `MockRoomServer`) implements the
same protocol with no backend — that's what the Online tab uses by default and
what the test suite exercises. This worker is the drop-in production path.

## Deploy

```bash
cd worker
npx wrangler login      # one time: opens Cloudflare dashboard auth
npx wrangler deploy     # prints your https://poker-sparring-relay.<you>.workers.dev URL
```

Then in the app: Online tab → Join → Advanced → paste
`wss://poker-sparring-relay.<you>.workers.dev` as the WebSocket URL.
Hosting a table from there creates the room on the relay; friends join with
the same URL + room code.

## Free-tier notes (as of Oct 2026)

- Workers free plan: **100,000 requests/day** — plenty for friendly games.
  (WebSocket *messages* don't count as requests; only the initial upgrade does.)
- Durable Objects are included on the free plan with generous limits.
- No paid features are used here: no KV, no R2, no Queues.

"Free forever" is Cloudflare's stated free-tier model (not a 12-month trial),
but limits and pricing can change — check cloudflare.com/plans before relying
on it for anything serious.

## What's stubbed / prototype-grade

- **Reconnect**: the client re-dials and rejoins by name, reclaiming its seat.
  Mid-hand state is preserved server-side; no missed-action replay yet.
- **Eviction**: if a Durable Object is evicted while idle, in-memory room state
  is lost (alarms re-arm on next message, but the hand won't resume). For
  play-money friend games this is acceptable; a production version would
  snapshot the Room to DO storage on every mutation.
- **No persistence**: chips reset every game; no accounts, no history.
- **No anti-abuse**: no rate limiting, no name moderation. Fine for sharing a
  code with friends; not for a public lobby.

## Protocol

Same JSON protocol as the mock server — see the header comment in
`js/netplay.js`. The client (`js/online.js`) speaks to both identically.
