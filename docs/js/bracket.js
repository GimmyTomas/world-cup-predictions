// Bracket model: the knockout tree, contestant resolution and the cascade
// logic that keeps a set of picks internally consistent.
//
// A "winners" map is { gameId: teamId } and is used for both a participant's
// `picks` and the actual `results`. Contestants of any game past the Round of
// 32 are derived by walking the feeder games — never stored — so picks and
// results share the exact same shape and scoring is a per-key comparison.

export class Bracket {
    constructor(data) {
        this.data = data;
        this.meta = data.meta || {};
        this.teams_ = data.teams || {};
        this.rounds = data.rounds || [];

        this.gamesById_ = {};
        this.roundOfGame_ = {};
        for (const round of this.rounds) {
            for (const game of round.games) {
                this.gamesById_[game.id] = game;
                this.roundOfGame_[game.id] = round;
            }
        }
    }

    // --- lookups -----------------------------------------------------------

    team(teamId) {
        return this.teams_[teamId] || null;
    }

    teamsAssigned() {
        return Object.keys(this.teams_).length > 0;
    }

    round(roundId) {
        return this.rounds.find((r) => r.id === roundId) || null;
    }

    game(gameId) {
        return this.gamesById_[gameId] || null;
    }

    roundOf(gameId) {
        return this.roundOfGame_[gameId] || null;
    }

    // Every game a participant must pick for their bracket to be complete
    // (includes the third-place play-off when present).
    allGameIds() {
        const ids = [];
        for (const round of this.rounds) {
            for (const game of round.games) ids.push(game.id);
        }
        return ids;
    }

    lockDeadlineMs() {
        const iso = this.meta.lockDeadlineIso;
        const ms = iso ? Date.parse(iso) : NaN;
        return Number.isNaN(ms) ? Infinity : ms;
    }

    // --- contestant resolution --------------------------------------------

    // The two teamIds that contest a game given a winners map. For the Round
    // of 32 these are the fixed slot assignments; otherwise they are the
    // winners (or losers, for the third-place game) of the feeder games.
    // Returns [teamIdA|null, teamIdB|null].
    contestants(gameId, winners) {
        const game = this.game(gameId);
        if (!game) return [null, null];

        if (game.slotA && game.slotB) {
            return [game.slotA.teamId || null, game.slotB.teamId || null];
        }

        if (game.losers) {
            return [
                this.loserOf_(game.feederA, winners),
                this.loserOf_(game.feederB, winners)
            ];
        }

        return [winners[game.feederA] || null, winners[game.feederB] || null];
    }

    loserOf_(feederGameId, winners) {
        const winner = winners[feederGameId];
        if (!winner) return null;
        const [a, b] = this.contestants(feederGameId, winners);
        if (!a || !b) return null;
        return winner === a ? b : a;
    }

    // Is `teamId` a legal contestant of `gameId` under the given winners map?
    isLegalPick(gameId, teamId, winners) {
        const [a, b] = this.contestants(gameId, winners);
        return teamId === a || teamId === b;
    }

    // --- picks / cascade ---------------------------------------------------

    // Set the winner of `gameId` to `teamId` and return a NEW winners map with
    // any now-illegal downstream picks removed. Rounds are processed in order
    // so upstream picks are resolved before the games that depend on them.
    setPick(picks, gameId, teamId) {
        const next = { ...picks, [gameId]: teamId };
        return this.normalize(next);
    }

    clearPick(picks, gameId) {
        const next = { ...picks };
        delete next[gameId];
        return this.normalize(next);
    }

    // Drop any pick that is no longer one of its game's two contestants.
    normalize(picks) {
        const winners = { ...picks };
        for (const round of this.rounds) {
            for (const game of round.games) {
                const pick = winners[game.id];
                if (pick == null) continue;
                if (!this.isLegalPick(game.id, pick, winners)) {
                    delete winners[game.id];
                }
            }
        }
        return winners;
    }

    isComplete(picks) {
        for (const id of this.allGameIds()) {
            if (picks[id] == null) return false;
        }
        return true;
    }

    countPicked(picks) {
        let n = 0;
        for (const id of this.allGameIds()) {
            if (picks[id] != null) n++;
        }
        return n;
    }

    totalGames() {
        return this.allGameIds().length;
    }

    // True if every present pick is a legal contestant of its game. Used to
    // reject tampered or stale submissions before trusting them.
    validatePicks(picks) {
        const winners = {};
        // Re-apply picks round by round; a legal bracket survives unchanged.
        for (const round of this.rounds) {
            for (const game of round.games) {
                const pick = picks[game.id];
                if (pick == null) continue;
                if (!this.isLegalPick(game.id, pick, winners)) return false;
                winners[game.id] = pick;
            }
        }
        return true;
    }
}
