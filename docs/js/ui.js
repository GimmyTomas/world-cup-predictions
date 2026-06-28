// All DOM rendering and event wiring. The controller (app.js) sets the
// callback properties and calls the render methods; UI knows nothing about
// storage or scoring.

import { teamDisplay } from './flags.js';

export class UI {
    constructor() {
        // Callbacks wired by app.js.
        this.onStart = null;          // (name)
        this.onTeamPick = null;       // (gameId, teamId)
        this.onTiebreakerChange = null; // (value|null)
        this.onSubmit = null;         // ()
        this.onTab = null;            // ('bracket' | 'leaderboard')
        this.onViewPlayer = null;     // (nameKey)
        this.onEditMine = null;       // ()

        this.el = {
            tabs: document.getElementById('tabs'),
            tabHome: document.getElementById('tabHome'),
            tabBracket: document.getElementById('tabBracket'),
            tabLeaderboard: document.getElementById('tabLeaderboard'),
            homeLink: document.getElementById('homeLink'),
            banner: document.getElementById('banner'),
            nameGate: document.getElementById('nameGate'),
            nameInput: document.getElementById('nameInput'),
            startBtn: document.getElementById('startBtn'),
            startMsg: document.getElementById('startMsg'),
            scoringHelp: document.getElementById('scoringHelp'),
            bracketScreen: document.getElementById('bracketScreen'),
            whoami: document.getElementById('whoami'),
            progress: document.getElementById('progress'),
            rounds: document.getElementById('rounds'),
            tiebreakerBox: document.getElementById('tiebreakerBox'),
            finalGoals: document.getElementById('finalGoals'),
            submitBtn: document.getElementById('submitBtn'),
            submitMsg: document.getElementById('submitMsg'),
            leaderboardScreen: document.getElementById('leaderboardScreen'),
            leaderboardContent: document.getElementById('leaderboardContent'),
            toast: document.getElementById('toast')
        };

        this.bindStatic_();
    }

    bindStatic_() {
        this.el.startBtn.addEventListener('click', () => {
            const name = this.el.nameInput.value.trim();
            if (this.onStart) this.onStart(name);
        });
        this.el.nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.el.startBtn.click();
        });

        this.el.tabHome.addEventListener('click', () => this.onTab && this.onTab('home'));
        this.el.tabBracket.addEventListener('click', () => this.onTab && this.onTab('bracket'));
        this.el.tabLeaderboard.addEventListener('click', () => this.onTab && this.onTab('leaderboard'));
        if (this.el.homeLink) {
            this.el.homeLink.addEventListener('click', () => this.onTab && this.onTab('home'));
        }

        this.el.submitBtn.addEventListener('click', () => this.onSubmit && this.onSubmit());

        this.el.finalGoals.addEventListener('input', () => {
            const v = this.el.finalGoals.value;
            const n = v === '' ? null : parseInt(v, 10);
            if (this.onTiebreakerChange) this.onTiebreakerChange(Number.isNaN(n) ? null : n);
        });

        // Delegated team picking.
        this.el.rounds.addEventListener('click', (e) => {
            const btn = e.target.closest('.team-btn');
            if (!btn || btn.disabled) return;
            const gameId = btn.dataset.gameId;
            const teamId = btn.dataset.teamId;
            if (this.onTeamPick) this.onTeamPick(gameId, teamId);
        });
    }

    // --- chrome ------------------------------------------------------------

    showBanner(html, kind = 'info') {
        if (!html) { this.el.banner.hidden = true; return; }
        this.el.banner.hidden = false;
        this.el.banner.className = `banner banner-${kind}`;
        this.el.banner.innerHTML = html;
    }

    setNavVisible(visible) {
        this.el.tabs.hidden = !visible;
    }

    showScreen(name) {
        this.el.nameGate.hidden = name !== 'nameGate';
        this.el.bracketScreen.hidden = name !== 'bracket';
        this.el.leaderboardScreen.hidden = name !== 'leaderboard';
        this.el.tabHome.classList.toggle('active', name === 'nameGate');
        this.el.tabBracket.classList.toggle('active', name === 'bracket');
        this.el.tabLeaderboard.classList.toggle('active', name === 'leaderboard');
    }

    toast(msg) {
        this.el.toast.textContent = msg;
        this.el.toast.classList.add('show');
        clearTimeout(this.toastTimer_);
        this.toastTimer_ = setTimeout(() => this.el.toast.classList.remove('show'), 2600);
    }

    // --- name gate ---------------------------------------------------------

    renderNameGate({ canSubmit, opensText, hasMine, myName }, scoringHtml) {
        this.el.scoringHelp.innerHTML = scoringHtml;
        this.el.startMsg.textContent = '';
        if (!canSubmit && opensText) {
            this.el.startMsg.textContent = opensText;
        }
        if (hasMine && myName) {
            this.el.nameInput.value = myName;
        }
        this.el.startBtn.textContent = hasMine ? 'Open my bracket' : 'Start';
    }

    setStartMessage(msg) {
        this.el.startMsg.textContent = msg || '';
    }

    // --- bracket -----------------------------------------------------------

    renderBracket(bracket, picks, opts) {
        const { readOnly = false, results = null, headline = '' } = opts || {};
        this.el.whoami.textContent = headline;

        let html = '';
        for (const round of bracket.rounds) {
            html += `<div class="round-col" data-round="${round.id}">`;
            html += `<h3 class="round-title">${escapeHtml(round.name)}` +
                    `<span class="round-pts">${round.pointsPerGame} pt${round.pointsPerGame === 1 ? '' : 's'}</span></h3>`;
            for (const game of round.games) {
                html += this.gameCardHtml_(bracket, game, picks, readOnly, results);
            }
            html += `</div>`;
        }
        this.el.rounds.innerHTML = html;

        this.el.finalGoals.disabled = readOnly;
        this.el.submitBtn.hidden = readOnly;
        this.el.tiebreakerBox.classList.toggle('readonly', readOnly);
    }

    gameCardHtml_(bracket, game, picks, readOnly, results) {
        const [a, b] = bracket.contestants(game.id, picks);
        const pick = picks[game.id] || null;
        const actual = results ? results[game.id] : null;

        const slot = (teamId, fallbackLabel) => {
            if (!teamId) {
                return `<div class="team-slot empty">${escapeHtml(fallbackLabel)}</div>`;
            }
            const team = bracket.team(teamId);
            const classes = ['team-btn'];
            if (pick === teamId) classes.push('selected');
            if (actual && teamId === actual) classes.push('actual-winner');
            if (actual && pick === teamId) classes.push(pick === actual ? 'pick-correct' : 'pick-wrong');
            const disabled = readOnly ? 'disabled' : '';
            return `<button class="${classes.join(' ')}" data-game-id="${game.id}" ` +
                   `data-team-id="${teamId}" aria-pressed="${pick === teamId}" ${disabled}>` +
                   `${escapeHtml(teamDisplay(team))}</button>`;
        };

        const labelA = game.slotA ? game.slotA.label : feederPlaceholder(game.feederA, game.losers);
        const labelB = game.slotB ? game.slotB.label : feederPlaceholder(game.feederB, game.losers);

        return `<div class="game-card" data-game-id="${game.id}">` +
               slot(a, labelA) +
               `<div class="vs">v</div>` +
               slot(b, labelB) +
               `</div>`;
    }

    updateProgress(picked, total) {
        this.el.progress.textContent = `${picked} / ${total} picks`;
    }

    setSubmitEnabled(enabled) {
        this.el.submitBtn.disabled = !enabled;
    }

    setSubmitMessage(msg) {
        this.el.submitMsg.textContent = msg || '';
    }

    setTiebreaker(value) {
        this.el.finalGoals.value = (value == null) ? '' : value;
    }

    // --- leaderboard -------------------------------------------------------

    // Pre-lock: only who has submitted, no picks/scores.
    renderLeaderboardOpen(entries, deadlineText) {
        const names = entries.slice().sort((x, y) =>
            String(x.name).localeCompare(String(y.name)));
        let html = `<div class="card">`;
        html += `<h2>Predictions are open</h2>`;
        if (deadlineText) html += `<p class="muted">Everyone's picks stay hidden until they lock at ${escapeHtml(deadlineText)}.</p>`;
        html += `<p><strong>${names.length}</strong> ${names.length === 1 ? 'player has' : 'players have'} submitted so far:</p>`;
        if (names.length === 0) {
            html += `<p class="muted">No one yet — be the first!</p>`;
        } else {
            html += `<div class="chips">` +
                names.map((e) => `<span class="chip">${escapeHtml(e.name)}</span>`).join('') +
                `</div>`;
        }
        html += `</div>`;
        this.el.leaderboardContent.innerHTML = html;
    }

    // Post-lock: full ranked table.
    renderLeaderboardLocked(rows, maxPts, currentNameKey, goalsKnown) {
        if (rows.length === 0) {
            this.el.leaderboardContent.innerHTML =
                `<div class="card"><h2>Leaderboard</h2><p class="muted">No predictions were submitted.</p></div>`;
            return;
        }
        let html = `<div class="card"><h2>Leaderboard <span class="muted">/ ${maxPts} max</span></h2>`;
        html += `<p class="muted">Tap a row to view that bracket.</p>`;
        html += `<div class="table-wrap"><table class="leaderboard"><thead><tr>` +
            `<th>#</th><th class="name-col">Name</th><th>Total</th>` +
            `<th>R32</th><th>R16</th><th>QF</th><th>SF</th><th>F</th><th>3rd</th>` +
            (goalsKnown ? `<th title="Final total-goals guess">Goals</th>` : ``) +
            `</tr></thead><tbody>`;
        for (const r of rows) {
            const me = r.nameKey === currentNameKey ? ' me' : '';
            html += `<tr class="lb-row${me}" data-name-key="${escapeHtml(r.nameKey)}">` +
                `<td>${r.rank}</td>` +
                `<td class="name-col">${escapeHtml(r.name)}${me ? ' <span class="you">you</span>' : ''}</td>` +
                `<td class="total">${r.total}</td>` +
                `<td>${r.byRound.R32}</td><td>${r.byRound.R16}</td><td>${r.byRound.QF}</td>` +
                `<td>${r.byRound.SF}</td><td>${r.byRound.F}</td><td>${r.thirdPlace}</td>` +
                (goalsKnown ? `<td>${r.finalGoalsGuess == null ? '–' : r.finalGoalsGuess}</td>` : ``) +
                `</tr>`;
        }
        html += `</tbody></table></div></div>`;
        this.el.leaderboardContent.innerHTML = html;

        this.el.leaderboardContent.querySelectorAll('.lb-row').forEach((tr) => {
            tr.addEventListener('click', () => {
                if (this.onViewPlayer) this.onViewPlayer(tr.dataset.nameKey);
            });
        });
    }
}

function feederPlaceholder(feederId, losers) {
    if (!feederId) return 'TBD';
    const friendly = String(feederId).replace('-', ' #');
    return losers ? `Loser ${friendly}` : `Winner ${friendly}`;
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
