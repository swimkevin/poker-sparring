# Mobile path — phone web vs PWA vs App Store

## Where we are today

The app already works on phones: open the GitHub Pages URL in mobile Safari or
Chrome and it plays. The layout has a responsive breakpoint (table stacks above
the log under 900px), touch targets are buttons/sliders, and there's no
hover-dependent UI. "Add to Home Screen" works right now with zero code changes —
it just opens in the browser without an install prompt or offline support.

## The options

### A. Mobile web as-is (done)
- **Cost:** $0. **Effort:** 0.
- Works everywhere via URL. Nothing to install, nothing to review.
- Trade-off: no home-screen icon polish, no offline mode, no push notifications,
  and it looks like a website — because it is one.

### B. PWA — installable web app (recommended next)
- **Cost:** $0. **Effort:** ~1 day.
- Add a web manifest + icons + service worker: install prompt on Android,
  "Add to Home Screen" on iOS, full offline play, splash screen, no browser chrome.
- Trade-off: iOS PWAs can't send push notifications and can't reach the App Store
  charts — but for a training app, that barely matters.
- **This is the best value step.** It makes the phone experience feel like an app
  without leaving the free static hosting.

### C. Capacitor wrapper — real App Store listing, same codebase
- **Cost:** $99/yr Apple Developer Program. **Effort:** ~1 week.
- Capacitor wraps the existing HTML/CSS/JS in a native shell: publish to the App
  Store and Google Play with almost no code changes. Enables push notifications
  and native plugins later.
- Trade-off: App Store review (gambling-adjacent apps get extra scrutiny — a
  **training** app with no real money is allowed, but expect review friction),
  yearly fee, and you're maintaining store listings. The code stays the same.

### D. React Native rewrite — true native app
- **Cost:** $99/yr Apple fee if published. **Effort:** 4–8 weeks.
- The poker core (`cards → engine → bots`) was deliberately kept DOM-free so it
  can be imported into React Native as-is; only `ui.js`/`app.js` get rebuilt with
  native components.
- Trade-off: biggest effort by far, for the main benefit of "native feel" and a
  store presence. Only worth it if the app earns real users first.

## Recommendation

**B now, C if it earns it, D much later.** Ship the PWA (v1.6 on the roadmap) —
it's a day of work and makes the phone story genuinely good. Consider the App
Store wrapper only after real usage justifies the $99/yr and review overhead.
A store listing with no users impresses no one; a polished PWA people actually
open does.

Note: no real-money play anywhere in this project, ever — that keeps every
option above (including App Store review) viable.
