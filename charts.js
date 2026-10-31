// CHART.JS & VISUALIZATION ENGINE
let charts = {};
let chartTimeframes = { work: 'daily', health: 'daily', chore: 'daily' };
let workChartMode = 'bar'; // 'bar', 'line', 'area'

function initCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { grid: { color: '#334155' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
            y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } }
        },
        plugins: { legend: { display: false } }
    };

    const workCtx = document.getElementById('workChart').getContext('2d');
    charts['work'] = new Chart(workCtx, {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [], backgroundColor: '#10b981', borderColor: '#10b981', borderRadius: 4, fill: false }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onHover: (evt, activeElements) => {
                evt.chart.canvas.style.cursor = (chartTimeframes['work'] === 'monthly' && activeElements.length > 0) ? 'pointer' : 'default';
            },
            onClick: async (evt, activeElements) => {
                if (chartTimeframes['work'] === 'monthly' && activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const monthKey = `${new Date().getFullYear()}-${index}`;
                    
                    userSettings.vaultedMonths = userSettings.vaultedMonths || {};
                    userSettings.vaultedMonths[monthKey] = !userSettings.vaultedMonths[monthKey];

                    try {
                        await db.collection('settings').doc(viewedUser).set({
                            vaultedMonths: userSettings.vaultedMonths
                        }, { merge: true });
                        playTone('save');
                    } catch (err) { console.error("Error saving vaulted status:", err); }
                }
            },
            scales: {
                x: { grid: { color: '#334155' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
                y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `Earnings: ฿${Math.round(context.raw).toLocaleString()}`,
                        footer: (tooltipItems) => {
                            if (chartTimeframes['work'] === 'monthly') {
                                const index = tooltipItems[0].dataIndex;
                                const monthKey = `${new Date().getFullYear()}-${index}`;
                                const isVaulted = userSettings.vaultedMonths && userSettings.vaultedMonths[monthKey];
                                return isVaulted ? 'Status: 🔒 VAULTED (Paid Out)' : 'Status: 🔓 UNLOCKED (Active)';
                            }
                            return '';
                        }
                    }
                }
            }
        }
    });

    ['health', 'chore'].forEach(type => {
        const ctx = document.getElementById(`${type}Chart`).getContext('2d');
        charts[type] = new Chart(ctx, {
            type: 'bar',
            data: { labels: [], datasets: [{ data: [], backgroundColor: type === 'health' ? '#10b981' : '#f59e0b', borderRadius: 4 }] },
            options: chartOptions
        });
        updateChartTimeframeUI(type, 'daily');
    });

    updateChartTimeframeUI('work', 'daily');
}

function setWorkChartMode(mode) {
    workChartMode = mode;
    if (charts['work']) {
        charts['work'].config.type = mode === 'area' ? 'line' : mode;
        charts['work'].data.datasets[0].fill = (mode === 'area');
        charts['work'].update();
    }
}

function setChartRange(type, range) {
    chartTimeframes[type] = range;
    updateChartTimeframeUI(type, range);
    if (typeof loadUserData === 'function') loadUserData();
}

function updateChartTimeframeUI(type, range) {
    ['daily', 'weekly', 'monthly', 'yearly'].forEach(r => {
        const btn = document.getElementById(`btn-${type}-${r}`);
        if (btn) {
            btn.className = r === range ? "px-3 py-1 rounded bg-blue-600 text-white font-medium" : "px-3 py-1 rounded text-slate-400 hover:text-white";
        }
    });
}

function updateGoalGauge(monthlyCashEarned, targetMonthlyCash) {
    const rawPct = (monthlyCashEarned / targetMonthlyCash) * 100;
    const cappedPct = Math.min(Math.round(rawPct), 100);
    
    const circlePath = document.getElementById('gauge-circle-path');
    const percentText = document.getElementById('gauge-percent-text');
    const tierBadge = document.getElementById('gauge-tier-badge');
    const tierSub = document.getElementById('gauge-tier-sub');

    if (percentText) percentText.innerText = `${Math.round(rawPct)}%`;
    if (circlePath) circlePath.style.strokeDashoffset = 100 - cappedPct;

    if (rawPct >= 100) {
        tierBadge.innerText = "✨ Goal Mastered";
        tierSub.innerText = "Maximum base crushed!";
    } else if (rawPct >= 75) {
        tierBadge.innerText = "🥇 Gold Tier";
        tierSub.innerText = "Final stretch to target base!";
    } else if (rawPct >= 50) {
        tierBadge.innerText = "🥈 Silver Tier";
        tierSub.innerText = "Halfway benchmark unlocked";
    } else if (rawPct >= 25) {
        tierBadge.innerText = "🥉 Bronze Tier";
        tierSub.innerText = "Building strong momentum";
    } else {
        tierBadge.innerText = "🌱 Initiate";
        tierSub.innerText = `${Math.round(rawPct)}% reached`;
    }
}

function updateChartData(type, logs, pointRate, maxCash) {
    const range = chartTimeframes[type];
    let labels = [];
    let values = [];
    const now = new Date();

    if (range === 'daily') {
        for (let i = 13; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            values.push(0);
        }
    } else if (range === 'weekly') {
        for (let i = 7; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - (i * 7));
            labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            values.push(0);
        }
    } else if (range === 'monthly') {
        labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        values = new Array(12).fill(0);
    } else {
        labels = ['2025', '2026', '2027'];
        values = [0, 0, 0];
    }

    logs.forEach(l => {
        let val = type === 'work' ? (l.points || 0) * pointRate : (type === 'health' ? (l.level || 0) : (l.hours || 0));
        values[values.length - 1] += val;
    });

    if (type === 'work') values = values.map(v => Math.min(v, maxCash));

    charts[type].data.labels = labels;

    if (type === 'work' && range === 'monthly') {
        let bgColors = [];
        let borderColors = [];
        for (let i = 0; i < 12; i++) {
            const monthKey = `${now.getFullYear()}-${i}`;
            const isVaulted = userSettings.vaultedMonths && userSettings.vaultedMonths[monthKey];
            bgColors.push(isVaulted ? '#f59e0b' : '#10b981');
            borderColors.push(isVaulted ? '#f59e0b' : '#10b981');
        }
        charts[type].data.datasets[0].backgroundColor = bgColors;
        charts[type].data.datasets[0].borderColor = borderColors;
    } else {
        const color = type === 'work' ? '#10b981' : (type === 'health' ? '#10b981' : '#f59e0b');
        charts[type].data.datasets[0].backgroundColor = color;
        charts[type].data.datasets[0].borderColor = color;
    }

    charts[type].data.datasets[0].data = values;
    charts[type].update();
}
