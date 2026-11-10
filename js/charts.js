// ============================================================================
// AUREUM — Chart.js Analytics & Monthly Goal Gauge
// ============================================================================

let charts = {};
let chartTimeframes = { work: 'daily', sanctuary: 'daily' };
let workChartMode = 'bar';
let sanctuaryChartSubmode = 'bar';
let workChartUnit = 'money';

function initCharts() {
    const opts = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
            y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' }, beginAtZero: true }
        },
        plugins: { legend: { display: false } }
    };
    charts['work'] = new Chart($('workChart').getContext('2d'), {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [], backgroundColor: '#10b981', borderColor: '#10b981', borderRadius: 4 }] },
        options: {
            ...opts,
            onClick: async (evt, els) => {
                if (chartTimeframes['work'] === 'monthly' && els.length > 0) {
                    const mKey = `${new Date().getFullYear()}-${els[0].index}`;
                    userSettings.vaultedMonths = userSettings.vaultedMonths || {};
                    userSettings.vaultedMonths[mKey] = !userSettings.vaultedMonths[mKey];
                    await db.collection('settings').doc(viewedUser).set({ vaultedMonths: userSettings.vaultedMonths }, { merge: true });
                    playTone('save');
                }
            }
        }
    });
    charts['sanctuary'] = new Chart($('sanctuaryChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                { label: '🏃 Fitness (h)', data: [], backgroundColor: '#f59e0b', borderColor: '#f59e0b', borderRadius: 4, fill: false },
                { label: '🧹 Chores (h)', data: [], backgroundColor: '#38bdf8', borderColor: '#38bdf8', borderRadius: 4, fill: false },
                { label: '🍨 Snacks', data: [], backgroundColor: '#f43f5e', borderColor: '#f43f5e', borderRadius: 4, fill: false }
            ]
        },
        options: { ...opts, plugins: { legend: { display: true, labels: { color: '#94a3b8', font: { size: 11, weight: 'bold' } } } } }
    });
}

function setWorkChartUnit(u) {
    workChartUnit = u;
    ['money', 'hours'].forEach(unit => {
        const btn = $(`btn-work-unit-${unit}`);
        if (btn) btn.className = unit === u
            ? "px-3 py-1.5 rounded-lg font-bold transition-all theme-accent-btn flex items-center gap-1"
            : "px-3 py-1.5 rounded-lg font-bold transition-all text-slate-400 hover:text-white flex items-center gap-1";
    });
    loadUserData();
}

function setWorkChartMode(m) {
    workChartMode = m;
    if (charts['work']) {
        charts['work'].config.type = m === 'area' ? 'line' : m;
        charts['work'].data.datasets[0].fill = (m === 'area');
        charts['work'].update();
    }
    ['bar', 'line', 'area'].forEach(mode => {
        const btn = $(`btn-work-mode-${mode}`);
        if (btn) btn.className = mode === m
            ? "px-3 py-1.5 rounded-lg font-bold transition-all theme-accent-btn flex items-center gap-1"
            : "px-3 py-1.5 rounded-lg font-bold transition-all text-slate-400 hover:text-white flex items-center gap-1";
    });
}

function setSanctuaryChartMode(m) {
    sanctuaryChartSubmode = m;
    if (charts['sanctuary']) {
        charts['sanctuary'].config.type = m;
        charts['sanctuary'].data.datasets.forEach(ds => ds.fill = false);
        charts['sanctuary'].update();
    }
    ['bar', 'line'].forEach(mode => {
        const btn = $(`btn-sanctuary-mode-${mode}`);
        if (btn) btn.className = mode === m
            ? "px-3 py-1.5 rounded-lg font-bold transition-all theme-accent-btn flex items-center gap-1"
            : "px-3 py-1.5 rounded-lg font-bold transition-all text-slate-400 hover:text-white flex items-center gap-1";
    });
}

function setChartRange(t, r) {
    chartTimeframes[t] = r;
    updateChartTimeframeUI(t, r);
    loadUserData();
}

function updateChartTimeframeUI(t, r) {
    ['daily', 'weekly', 'monthly', 'yearly'].forEach(x => {
        const btn = $(`btn-${t}-${x}`);
        if (btn) btn.className = x === r
            ? "px-3 py-1 rounded-lg theme-accent-btn font-bold"
            : "px-3 py-1 rounded-lg text-slate-400 hover:text-white";
    });
}

function updateGoalGauge(cash, target) {
    const pct = Math.min(Math.round((cash / target) * 100), 100);
    $('gauge-percent-text').innerText = `${Math.round((cash / target) * 100)}%`;
    $('gauge-circle-path').style.strokeDashoffset = 100 - pct;
    const badge = $('gauge-tier-badge'), sub = $('gauge-tier-sub');
    if (pct >= 100) { badge.innerText = "✨ Goal Mastered"; sub.innerText = "Maximum base crushed!"; }
    else if (pct >= 75) { badge.innerText = "🥇 Gold Tier"; sub.innerText = "Final stretch to target base!"; }
    else if (pct >= 50) { badge.innerText = "🥈 Silver Tier"; sub.innerText = "Halfway benchmark unlocked"; }
    else if (pct >= 25) { badge.innerText = "🥉 Bronze Tier"; sub.innerText = "Building strong momentum"; }
    else { badge.innerText = "🌱 Initiate"; sub.innerText = `${pct}% reached`; }
}

function updateChartData(type, logs, pointRate, maxCash) {
    const range = chartTimeframes[type], now = new Date();
    let labels = [];
    if (range === 'daily') {
        for (let i = 13; i >= 0; i--) {
            const d = new Date(); d.setDate(now.getDate() - i);
            labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        }
    } else if (range === 'weekly') {
        for (let i = 7; i >= 0; i--) {
            const d = new Date(); d.setDate(now.getDate() - (i * 7));
            labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        }
    } else if (range === 'monthly') {
        labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    } else {
        labels = ['2025', '2026', '2027'];
    }

    if (type === 'work') {
        let values = new Array(labels.length).fill(0);
        logs.forEach(l => {
            const d = getLogDate(l);
            let idx = -1;
            if (range === 'daily') {
                const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                const startLog = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                const diffDays = Math.floor((startNow - startLog) / 86400000);
                if (diffDays >= 0 && diffDays < 14) idx = 13 - diffDays;
            } else if (range === 'weekly') {
                const diffDays = Math.floor((now - d) / 86400000);
                const diffWeeks = Math.floor(diffDays / 7);
                if (diffWeeks >= 0 && diffWeeks < 8) idx = 7 - diffWeeks;
            } else if (range === 'monthly') {
                if (d.getFullYear() === now.getFullYear()) idx = d.getMonth();
            } else if (range === 'yearly') {
                idx = labels.indexOf(d.getFullYear().toString());
            }
            if (idx >= 0 && idx < values.length) {
                if (workChartUnit === 'money') {
                    values[idx] += (l.points || 0) * pointRate;
                } else {
                    values[idx] += (l.hours || 0);
                }
            }
        });
        if (workChartUnit === 'money') {
            values = values.map(v => Math.min(v, maxCash));
        }
        charts['work'].data.labels = labels;
        charts['work'].data.datasets[0].backgroundColor = range === 'monthly'
            ? labels.map((_, i) => userSettings.vaultedMonths?.[`${now.getFullYear()}-${i}`] ? '#f59e0b' : '#10b981')
            : '#10b981';
        charts['work'].data.datasets[0].data = values;
        charts['work'].update();
    } else if (type === 'sanctuary') {
        let vWorkout = new Array(labels.length).fill(0),
            vChore = new Array(labels.length).fill(0),
            vHealth = new Array(labels.length).fill(0);
        logs.forEach(l => {
            const d = getLogDate(l);
            let idx = -1;
            if (range === 'daily') {
                const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                const startLog = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                const diffDays = Math.floor((startNow - startLog) / 86400000);
                if (diffDays >= 0 && diffDays < 14) idx = 13 - diffDays;
            } else if (range === 'weekly') {
                const diffDays = Math.floor((now - d) / 86400000);
                const diffWeeks = Math.floor(diffDays / 7);
                if (diffWeeks >= 0 && diffWeeks < 8) idx = 7 - diffWeeks;
            } else if (range === 'monthly') {
                if (d.getFullYear() === now.getFullYear()) idx = d.getMonth();
            } else if (range === 'yearly') {
                idx = labels.indexOf(d.getFullYear().toString());
            }
            if (idx >= 0 && idx < labels.length) {
                if (l.type === 'workout') vWorkout[idx] += (l.hours || 0);
                else if (l.type === 'chore') vChore[idx] += (l.hours || 0);
                else if (l.type === 'health') vHealth[idx] += (l.level || 1);
            }
        });
        charts['sanctuary'].data.labels = labels;
        charts['sanctuary'].data.datasets[0].data = vWorkout;
        charts['sanctuary'].data.datasets[1].data = vChore;
        charts['sanctuary'].data.datasets[2].data = vHealth;
        charts['sanctuary'].update();
    }
}
