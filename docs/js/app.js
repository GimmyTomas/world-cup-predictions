// Main controller: loads the bracket, manages the participant's picks, and
// coordinates the UI, scoring and storage modules.

import { Bracket } from './bracket.js';
import { buildLeaderboard, maxScore } from './scoring.js';
import { UI } from './ui.js';
import {
    savePrediction, loadEntries, loadAllPredictions,
    subscribeEntries, subscribePredictions,
    loadMyPrediction, cacheMyPrediction
} from './storage.js';
import { SCHEMA_VERSION, LOCAL_ONLY } from './config.js';

class App {
    constructor() {
        this.ui = new UI();
        this.bracket = null;

        this.me = null;            // { name, nameKey }
        this.picks = {};
        this.tiebreaker = null;    // final total-goals guess

        this.predictionsOpen = false;
        this.locked = false;

        this.entries = [];
        this.allPredictions = [];
        this.viewingOther = false;

        this.wireCallbacks_();
        this.init_();
    }

    async init_() {
        let data;
        try {
            data = await this.loadBracketData_();
        } catch (e) {
            this.ui.showBanner('Could not load the bracket data. Please refresh.', 'warn');
            return;
        }
        this.bracket = new Bracket(data);

        this.predictionsOpen = !!this.bracket.meta.predictionsOpen && this.bracket.teamsAssigned();
        this.locked = Date.now() >= this.bracket.lockDeadlineMs();

        // Restore this device's saved/draft bracket.
        const mine = loadMyPrediction();
        if (mine && mine.nameKey) {
            this.me = { name: mine.name, nameKey: mine.nameKey };
            this.picks = this.bracket.normalize(mine.picks || {});
            this.tiebreaker = mine.tiebreaker ? mine.tiebreaker.finalTotalGoals : null;
        }

        await this.setupSubscriptions_();
        this.route_();
    }

    async loadBracketData_() {
        const params = new URLSearchParams(location.search);
        const file = params.get('data') === 'sample' ? 'bracket.sample.json' : 'bracket.json';
        const res = await fetch(`data/${file}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`fetch ${file} failed`);
        return res.json();
    }

    wireCallbacks_() {
        this.ui.onStart = (name) => this.handleStart_(name);
        this.ui.onTeamPick = (gameId, teamId) => this.handlePick_(gameId, teamId);
        this.ui.onTiebreakerChange = (v) => this.handleTiebreaker_(v);
        this.ui.onSubmit = () => this.handleSubmit_();
        this.ui.onTab = (view) => this.handleTab_(view);
        this.ui.onViewPlayer = (nameKey) => this.viewPlayer_(nameKey);
    }

    async setupSubscriptions_() {
        if (this.locked) {
            await subscribePredictions((list) => {
                this.allPredictions = list;
                if (!this.ui.el.leaderboardScreen.hidden) this.renderLeaderboard_();
            });
        } else if (this.predictionsOpen) {
            await subscribeEntries((list) => {
                this.entries = list;
                if (!this.ui.el.leaderboardScreen.hidden) this.renderLeaderboard_();
            });
        }
    }

    // --- routing -----------------------------------------------------------

    route_() {
        const scoringHtml = this.scoringHelpHtml_();

        if (!this.predictionsOpen) {
            this.ui.setNavVisible(false);
            this.ui.showBanner(
                '⏳ Predictions open once the group stage ends. The 32 knockout teams will be set shortly — check back soon.',
                'warn');
            this.ui.renderNameGate(
                { canSubmit: false, opensText: this.bracket.meta.opensText || '', hasMine: false },
                scoringHtml);
            this.ui.el.startBtn.disabled = true;
            this.ui.showScreen('nameGate');
            return;
        }

        this.ui.setNavVisible(true);

        if (this.locked) {
            this.ui.showBanner('🔒 Predictions are locked. Results and the leaderboard are live below — good luck!', 'lock');
            this.renderLeaderboard_();
            this.ui.showScreen('leaderboard');
            return;
        }

        this.ui.showBanner(
            `🔓 Predictions are open until <strong>${escapeText(this.deadlineText_())}</strong>. ` +
            `Everyone's picks stay hidden until then.` +
            (LOCAL_ONLY ? ' <em>(local test mode — no shared leaderboard)</em>' : ''),
            'info');

        if (this.me) {
            this.enterEditing_();
        } else {
            this.ui.renderNameGate({ canSubmit: true, hasMine: false }, scoringHtml);
            this.ui.showScreen('nameGate');
        }
    }

    // --- name gate ---------------------------------------------------------

    handleStart_(rawName) {
        const name = (rawName || '').trim().replace(/\s+/g, ' ');
        if (name.length < 2) { this.ui.setStartMessage('Please enter your name (at least 2 characters).'); return; }
        if (name.length > 39) { this.ui.setStartMessage('That name is too long.'); return; }

        const nameKey = name.toLowerCase();
        const taken = this.entries.some((e) => e.nameKey === nameKey);
        const isMine = this.me && this.me.nameKey === nameKey;
        if (taken && !isMine) {
            this.ui.setStartMessage(`Heads up: "${name}" already submitted. If that's you, continue and it'll update your entry.`);
        }

        this.me = { name, nameKey };
        this.enterEditing_();
    }

    // --- bracket editing ---------------------------------------------------

    enterEditing_() {
        this.viewingOther = false;
        this.ui.renderBracket(this.bracket, this.picks, {
            readOnly: false,
            headline: `${this.me ? this.me.name + " — " : ''}make your picks`
        });
        this.ui.setTiebreaker(this.tiebreaker);
        this.refreshEditingState_();
        this.ui.showScreen('bracket');
    }

    handlePick_(gameId, teamId) {
        if (this.locked || this.viewingOther) return;
        this.picks = this.bracket.setPick(this.picks, gameId, teamId);
        this.ui.renderBracket(this.bracket, this.picks, {
            readOnly: false,
            headline: `${this.me ? this.me.name + " — " : ''}make your picks`
        });
        this.refreshEditingState_();
        this.cacheDraft_();
    }

    handleTiebreaker_(value) {
        this.tiebreaker = value;
        this.refreshEditingState_();
        this.cacheDraft_();
    }

    refreshEditingState_() {
        const picked = this.bracket.countPicked(this.picks);
        const total = this.bracket.totalGames();
        this.ui.updateProgress(picked, total);
        const complete = this.bracket.isComplete(this.picks) && this.tiebreaker != null;
        this.ui.setSubmitEnabled(complete);
        this.ui.setSubmitMessage(
            complete ? '' :
            (this.bracket.isComplete(this.picks)
                ? 'Enter your Final total-goals tiebreaker to submit.'
                : `Pick every game to submit (${picked}/${total}).`));
    }

    cacheDraft_() {
        if (!this.me) return;
        cacheMyPrediction(this.buildPrediction_());
    }

    buildPrediction_() {
        return {
            name: this.me.name,
            nameKey: this.me.nameKey,
            submittedAtMs: Date.now(),
            schemaVersion: SCHEMA_VERSION,
            picks: this.picks,
            tiebreaker: { finalTotalGoals: this.tiebreaker }
        };
    }

    async handleSubmit_() {
        if (this.locked) { this.ui.toast('Predictions are locked.'); return; }
        if (!this.bracket.isComplete(this.picks) || this.tiebreaker == null) {
            this.ui.toast('Finish every pick first.'); return;
        }
        if (!this.bracket.validatePicks(this.picks)) {
            this.ui.toast('Your bracket is inconsistent — try re-picking.'); return;
        }

        const pred = this.buildPrediction_();
        this.ui.setSubmitMessage('Saving…');
        try {
            await savePrediction(pred);
        } catch (e) {
            console.error(e);
            this.ui.setSubmitMessage('');
            this.ui.toast('Could not save — predictions may have just locked.');
            return;
        }
        this.ui.toast('Saved! Good luck 🍀');
        this.ui.setSubmitMessage('Submitted. You can edit any time before the lock.');
        await this.refreshData_();
        this.handleTab_('leaderboard');
    }

    // --- leaderboard -------------------------------------------------------

    async refreshData_() {
        if (this.locked) {
            this.allPredictions = await loadAllPredictions();
        } else if (this.predictionsOpen) {
            this.entries = await loadEntries();
        }
    }

    renderLeaderboard_() {
        if (this.locked) {
            const results = this.bracket.data.results || {};
            const rows = buildLeaderboard(this.allPredictions, this.bracket, results);
            const goalsKnown = results.finalTotalGoals != null;
            this.ui.renderLeaderboardLocked(rows, maxScore(this.bracket),
                this.me ? this.me.nameKey : null, goalsKnown);
        } else {
            this.ui.renderLeaderboardOpen(this.entries, this.deadlineText_());
        }
    }

    handleTab_(view) {
        if (view === 'home') {
            this.goHome_();
            return;
        }
        if (view === 'leaderboard') {
            this.renderLeaderboard_();
            this.ui.showScreen('leaderboard');
            return;
        }
        // Bracket tab.
        if (this.locked) {
            if (this.me) {
                this.viewPlayer_(this.me.nameKey);
            } else {
                this.ui.renderBracket(this.bracket, {}, { readOnly: true, headline: 'Pick a player from the leaderboard to view their bracket' });
                this.ui.showScreen('bracket');
            }
        } else {
            this.enterEditing_();
        }
    }

    goHome_() {
        const canSubmit = this.predictionsOpen && !this.locked;
        this.ui.renderNameGate({
            canSubmit,
            opensText: this.predictionsOpen ? '' : (this.bracket.meta.opensText || ''),
            hasMine: !!this.me,
            myName: this.me ? this.me.name : ''
        }, this.scoringHelpHtml_());
        this.ui.el.startBtn.disabled = !canSubmit;
        this.ui.showScreen('nameGate');
    }

    viewPlayer_(nameKey) {
        const pred = this.allPredictions.find((p) => p.nameKey === nameKey);
        if (!pred) {
            // Could be the current user before lock with only a local draft.
            if (this.me && this.me.nameKey === nameKey) {
                this.renderReadOnlyBracket_(this.picks, `${this.me.name} — your bracket`);
                return;
            }
            this.ui.toast('Bracket not available.');
            return;
        }
        this.renderReadOnlyBracket_(pred.picks, `${pred.name}'s bracket`);
    }

    renderReadOnlyBracket_(picks, headline) {
        this.viewingOther = true;
        const results = this.bracket.data.results || {};
        this.ui.renderBracket(this.bracket, this.bracket.normalize(picks || {}), {
            readOnly: true, results, headline
        });
        this.ui.showScreen('bracket');
    }

    // --- helpers -----------------------------------------------------------

    deadlineText_() {
        const ms = this.bracket.lockDeadlineMs();
        if (!isFinite(ms)) return 'kickoff';
        try {
            return new Date(ms).toLocaleString(undefined, {
                weekday: 'short', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) {
            return new Date(ms).toString();
        }
    }

    scoringHelpHtml_() {
        const rows = [];
        for (const r of this.bracket.rounds) {
            if (r.id === 'TP') continue;
            const games = r.games.length;
            rows.push(`<tr><td>${escapeText(r.name)}</td><td>${r.pointsPerGame}</td><td>${games}</td><td>${r.pointsPerGame * games}</td></tr>`);
        }
        const tp = this.bracket.round('TP');
        if (tp && this.bracket.meta.thirdPlacePoints) {
            rows.push(`<tr><td>${escapeText(tp.name)}</td><td>${this.bracket.meta.thirdPlacePoints}</td><td>1</td><td>${this.bracket.meta.thirdPlacePoints}</td></tr>`);
        }
        return `
            <h3>How scoring works</h3>
            <p>Predict the winner of every knockout game. You earn a game's points if your
            predicted winner is the team that actually wins that game — even if you got the
            opponent wrong.</p>
            <div class="table-wrap"><table class="scoring-table">
              <thead><tr><th>Round</th><th>Points per game</th><th>Games</th><th>Max</th></tr></thead>
              <tbody>${rows.join('')}</tbody>
              <tfoot><tr><td>Total</td><td></td><td></td><td>${maxScore(this.bracket)}</td></tr></tfoot>
            </table></div>
            <p class="muted">Ties are broken by closest guess of total goals in the Final, then a
            correct champion, then points won in later rounds.</p>`;
    }
}

function escapeText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
