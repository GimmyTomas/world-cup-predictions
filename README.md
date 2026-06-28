# World Cup 2026 — Knockout Predictions

A small web app where you and your friends predict the winner of every
knockout-stage game of the 2026 World Cup (Round of 32 → Final) and compete on a
shared leaderboard.

**Live site:** https://gimmytomas.github.io/world-cup-predictions/

It's a static site (vanilla HTML/CSS/JS, no build step) hosted on GitHub Pages
from the `docs/` folder. Shared predictions and the leaderboard are stored in
[Firebase Firestore](https://firebase.google.com/) (free tier).

## How it works

1. Enter your name and fill out the bracket: pick the winner of each game. Your
   picks cascade — the team you advance shows up in the next round.
2. Predictions **lock** at the first Round-of-32 kickoff. Until then everyone's
   picks are hidden; you can edit yours any time.
3. As results come in, the leaderboard updates automatically.

### Scoring

You earn a game's points if **your predicted winner is the team that actually
wins that game** — even if you got the opponent wrong.

| Round            | Points / game | Games | Max |
|------------------|:-------------:|:-----:|:---:|
| Round of 32      | 1             | 16    | 16  |
| Round of 16      | 2             | 8     | 16  |
| Quarter-finals   | 4             | 4     | 16  |
| Semi-finals      | 8             | 2     | 16  |
| Final            | 16            | 1     | 16  |
| Third-place game | 4             | 1     | 4   |
| **Total**        |               |       | **84** |

Ties are broken by: closest guess of total goals in the Final → correct champion
→ points earned in later rounds → earliest submission.

## Repository layout

```
docs/                     # GitHub Pages root
  index.html
  css/style.css
  js/                     # ES modules: app, ui, bracket, scoring, storage, flags, config
  data/
    bracket.json          # the bracket + teams + results  ← the only file edited during the tournament
    bracket.sample.json   # sample teams for local testing (?data=sample)
```

## Running locally

ES modules need to be served over HTTP (not opened as a file):

```bash
python3 -m http.server 8000 --directory docs
# then open http://localhost:8000/?data=sample   ← sample teams, predict flow
```

Without a Firebase config set (`docs/js/config.js`), the app runs in
**local-only mode**: your prediction is saved in your browser only. That's fine
for testing the bracket and scoring; set a real Firebase config before sharing.

See [CLAUDE.md](CLAUDE.md) for the Firebase setup, the Firestore security rules,
and the day-to-day "record a result" workflow.
