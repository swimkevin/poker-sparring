# Feature Flags

Poker Sparring follows Flappy Bird simplicity: the default experience is **one tap to play**. Advanced features are preserved in code but hidden behind flags.

## Flags

| Flag | Default | What it hides |
|------|---------|---------------|
| `tournamentMode` | off | Tournament mode card |
| `headsUpMode` | off | Heads-Up mode card |
| `pushFoldTrainer` | off | Push/Fold trainer mode card |
| `customBots` | off | Custom bot builder section |

## Enabling flags

**Console** (persists via localStorage):
```js
enableFlag('tournamentMode')  // refresh to see it
```

**URL** (one-time):
```
https://swimkevin.github.io/poker-sparring/?flags=tournamentMode,pushFoldTrainer
```

## Design philosophy

Every feature here was built for a reason and tested. Hiding ≠ deleting:
- Tournament mode: for players who want escalating blinds
- Heads-up: for drilling one specific opponent
- Push/fold trainer: for short-stack decisions
- Custom bots: for modeling specific friends' play styles

The default stays simple. Power users can opt in.

## Learnings

- **2026-10-08**: Simplified the lobby to a single "▶ Play" button. Mode selection, opponent picker, and settings moved behind "Customize". Advanced modes hidden behind flags. The app felt overwhelming before — now it's one tap to a game.
