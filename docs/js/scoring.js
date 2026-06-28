// Scoring: slot-based comparison of each participant's picks against the
// actual results, plus leaderboard ranking with a tiebreaker chain.
//
// Slot-based means: for every bracket game you earn its points if YOUR
// predicted winner of that game equals the ACTUAL winner of that game —
// independent of whether you predicted the opponent correctly.

// Rounds that count on the main ladder (everything except the third-place game).
const LADDER_ROUND_IDS = ["R32", "R16", "QF", "SF", "F"];

// Tiebreaker preference order for the "later rounds" comparison (hardest first).
const LATER_ROUND_ORDER = ["F", "SF", "QF", "R16", "R32"];

// Score a single prediction against results.
// Returns { total, byRound: {R32,R16,QF,SF,F}, thirdPlace }.
export function scoreOne(prediction, bracket, results) {
    const picks = prediction.picks || {};
    const byRound = {};
    let total = 0;

    for (const roundId of LADDER_ROUND_IDS) {
        const round = bracket.round(roundId);
        let sub = 0;
        if (round) {
            for (const game of round.games) {
                const actual = results[game.id];
                if (actual != null && picks[game.id] === actual) {
                    sub += round.pointsPerGame;
                }
            }
        }
        byRound[roundId] = sub;
        total += sub;
    }

    let thirdPlace = 0;
    const tpRound = bracket.round("TP");
    const tpPoints = bracket.meta.thirdPlacePoints || 0;
    if (tpRound && tpPoints > 0) {
        const game = tpRound.games[0];
        const actual = results[game.id];
        if (actual != null && picks[game.id] === actual) {
            thirdPlace = tpPoints;
        }
    }
    total += thirdPlace;

    return { total, byRound, thirdPlace };
}

// Maximum achievable score, for display ("42 / 84").
export function maxScore(bracket) {
    let max = 0;
    for (const roundId of LADDER_ROUND_IDS) {
        const round = bracket.round(roundId);
        if (round) max += round.pointsPerGame * round.games.length;
    }
    const tpRound = bracket.round("TP");
    if (tpRound && bracket.meta.thirdPlacePoints) max += bracket.meta.thirdPlacePoints;
    return max;
}

// Build a ranked leaderboard. `predictions` is an array of prediction docs.
// Returns rows sorted best-first, each with a `rank` (ties share a rank).
export function buildLeaderboard(predictions, bracket, results) {
    const actualGoals = results.finalTotalGoals;
    const actualChampion = results["F-1"];

    const rows = predictions.map((pred) => {
        const score = scoreOne(pred, bracket, results);
        const guess = pred.tiebreaker ? pred.tiebreaker.finalTotalGoals : null;

        let goalCloseness = null;
        if (actualGoals != null) {
            goalCloseness = guess == null ? Infinity : Math.abs(guess - actualGoals);
        }

        let championCorrect = null;
        if (actualChampion != null) {
            championCorrect = (pred.picks && pred.picks["F-1"]) === actualChampion;
        }

        return {
            name: pred.name,
            nameKey: pred.nameKey,
            submittedAtMs: pred.submittedAtMs || 0,
            finalGoalsGuess: guess,
            total: score.total,
            byRound: score.byRound,
            thirdPlace: score.thirdPlace,
            goalCloseness,
            championCorrect,
            rank: 0
        };
    });

    rows.sort(compareForRank);

    let rank = 0;
    for (let i = 0; i < rows.length; i++) {
        if (i === 0 || compareForRank(rows[i - 1], rows[i]) !== 0) {
            rank = i + 1;
        }
        rows[i].rank = rank;
    }

    return rows;
}

// Negative when `a` ranks ahead of `b`. Chain: total → closest final-goals
// guess → correct champion → more points in later rounds → earliest submission
// → name.
export function compareForRank(a, b) {
    if (a.total !== b.total) return b.total - a.total;

    if (a.goalCloseness != null && b.goalCloseness != null && a.goalCloseness !== b.goalCloseness) {
        return a.goalCloseness - b.goalCloseness;
    }

    if (a.championCorrect != null && b.championCorrect != null && a.championCorrect !== b.championCorrect) {
        return (b.championCorrect ? 1 : 0) - (a.championCorrect ? 1 : 0);
    }

    for (const roundId of LATER_ROUND_ORDER) {
        const av = a.byRound[roundId] || 0;
        const bv = b.byRound[roundId] || 0;
        if (av !== bv) return bv - av;
    }

    if (a.submittedAtMs !== b.submittedAtMs) return a.submittedAtMs - b.submittedAtMs;

    return String(a.name).localeCompare(String(b.name));
}
