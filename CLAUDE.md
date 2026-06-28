# Project Notes for Claude

World Cup 2026 knockout prediction pool. Static site (vanilla HTML/CSS/ES modules,
no build step), GitHub Pages from `docs/`, shared data in Firebase Firestore.

- **Live site:** https://gimmytomas.github.io/world-cup-predictions/
- **Always commit and push** after editing `docs/` — the user tests on the live site.

## The only file edited during the tournament: `docs/data/bracket.json`

It has three sections:
- `teams` — `teamId → { name, iso }` (ISO 3166-1 alpha-2, drives the emoji flag).
- `rounds` — the fixed bracket tree. R32 games hold `slotA`/`slotB` with a `teamId`;
  later rounds reference feeder games and derive their teams automatically.
- `results` — `gameId → winning teamId`. This is what gets edited as games finish.

The bracket is a clean binary tree: `R16-1 = winner(R32-1) vs winner(R32-2)`,
`QF-1 = winner(R16-1) vs winner(R16-2)`, etc. `TP-1` (third place) is the two
**semi-final losers**.

### Step 1 — Open predictions (once the group stage ends)

1. Fill `teams` with the 32 qualified teams.
2. Set each R32 game's `slotA.teamId` and `slotB.teamId` (16 games).
   **Order matters:** place teams so the binary-tree pairing matches the real FIFA
   bracket (whoever the official R32-1 winner would meet next goes in R32-2, and so
   on across all 16). Confirm against the official 2026 bracket before committing.
3. Set `meta.lockDeadlineIso` to the exact kickoff of the first R32 match.
4. Set `meta.predictionsOpen` to `true`.
5. Update the deadline in the Firestore rules too (see below) — they don't read
   this file. Commit + push.

> Note: England/Scotland/Wales don't have plain alpha-2 flags. If any qualify, use
> a Unicode subdivision flag emoji directly as a one-off, or fall back to `iso: ""`.

### Step 2 — Record results

**The user will just say something like "go online, check the results and update".**
When they do:

1. Look up the latest 2026 World Cup knockout results on the web (WebSearch /
   WebFetch). Use the matchups already in `bracket.json` to know which game each
   result belongs to.
2. For every finished game, set `results[gameId]` to the winning team's `teamId`
   (match by team name against the `teams` map), e.g. `"R32-1": "ARG"`.
3. Only fill games that have actually finished; leave the rest `null`.
4. After the Final, also set `"finalTotalGoals"` (combined goals in the Final) —
   the leaderboard tiebreaker.
5. Commit + push. The leaderboard recomputes automatically for everyone.

Always state which games you updated (and the score/source) so the user can
sanity-check. If a result is ambiguous or a match went to penalties, the
"winner" is whoever advances.

## Firebase setup (one-time, by the user)

1. console.firebase.google.com → Add project → Build → Firestore Database → Create
   (production mode).
2. Project settings → Your apps → Web (`</>`) → copy `firebaseConfig` → paste into
   `docs/js/config.js` (`FIREBASE_CONFIG`). It's public; that's fine.
3. Firestore → Rules → paste the rules below → Publish.

Until a config is set, the site runs in **local-only mode** (localStorage, no
shared leaderboard) — fine for local testing only.

### Firestore security rules

Two collections enforce "hide picks until lock": `entries` (public names) and
`predictions` (full picks, unreadable until the deadline). Replace the timestamp
with the **epoch-ms of `meta.lockDeadlineIso`** — keep the two in sync.

First R32 kickoff `2026-06-28T19:00:00Z` (noon PT / 3pm ET / 8pm UK) = **1782673200000**.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /entries/{nameKey} {
      allow read: if true;
      allow write: if request.time.toMillis() < 1782673200000
                   && request.resource.data.name is string
                   && request.resource.data.name.size() > 1
                   && request.resource.data.name.size() < 40;
    }
    match /predictions/{nameKey} {
      allow read:  if request.time.toMillis() >= 1782673200000;
      allow write: if request.time.toMillis() <  1782673200000
                   && request.resource.data.nameKey == nameKey
                   && request.resource.data.picks is map
                   && request.resource.data.picks.size() >= 31
                   && request.resource.data.picks.size() <= 32;
    }
  }
}
```

## Architecture

| File | Role |
|------|------|
| `docs/js/app.js` | Controller: load data, manage picks, route, render |
| `docs/js/ui.js` | DOM rendering + events (name gate, bracket, leaderboard) |
| `docs/js/bracket.js` | Bracket model: contestant resolution + cascade invalidation |
| `docs/js/scoring.js` | Slot-based scoring + leaderboard ranking + tiebreakers |
| `docs/js/storage.js` | Firestore facade (+ local-only fallback) |
| `docs/js/flags.js` | ISO code → emoji flag |
| `docs/js/config.js` | Firebase config + constants |

## Testing the pure logic

`bracket.js` and `scoring.js` have no browser dependencies and can be unit-tested
with macOS's bundled JavaScriptCore:
`/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc -m <test>.mjs`
(`jsc` provides `readFile()` and `print()`). The full module graph can be
load-checked by importing `app.js` with stubbed `document`/`localStorage`.
