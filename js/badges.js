// BADGES & ACHIEVEMENT SYSTEM ENGINE

const BADGE_CATALOG = [
    // 💼 WORK ENGINE MILESTONES
    { id: 'work_1', category: 'work', tier: 'bronze', icon: '🌱', title: "Initiate's First Step", desc: 'Log your very first work session.' },
    { id: 'work_cap', category: 'work', tier: 'silver', icon: '🍵', title: 'Soft Cap Survivor', desc: 'Reach or exceed your daily Soft Cap (4.0h) in a single day.' },
    { id: 'work_100', category: 'work', tier: 'gold', icon: '🎯', title: 'Century Focus', desc: 'Reach 100 total hours logged all-time.' },
    { id: 'work_1000', category: 'work', tier: 'titan', icon: '🏛️', title: 'Millennium Scholar', desc: 'Reach 1,000 total hours logged all-time.' },
    { id: 'work_10000', category: 'work', tier: 'aureum', icon: '👑', title: 'Master of the Craft', desc: 'Reach 10,000 total hours logged all-time.' },

    // ⏱️ POMODORO CHALLENGES
    { id: 'pomo_1', category: 'pomo', tier: 'bronze', icon: '⏱️', title: 'Clockwork', desc: 'Complete 1 focus Pomodoro session.' },
    { id: 'pomo_flow', category: 'pomo', tier: 'silver', icon: '🌊', title: 'Flow State', desc: 'Complete 4 focus rounds in a single day.' },
    { id: 'pomo_deep', category: 'pomo', tier: 'silver', icon: '🤿', title: 'Deep Dive', desc: 'Complete a 50+ minute focus session.' },
    { id: 'pomo_overdrive', category: 'pomo', tier: 'gold', icon: '🔥', title: 'Overdrive', desc: 'Complete 8 focus rounds in a single day.' },
    { id: 'pomo_unbroken', category: 'pomo', tier: 'gold', icon: '🛡️', title: 'Unbroken Void', desc: 'Complete a 50+ minute focus session without pausing.' },
    { id: 'pomo_marathon', category: 'pomo', tier: 'titan', icon: '🏃', title: 'Marathon Runner', desc: 'Complete 12 focus rounds in a single day.' },
    { id: 'pomo_zen', category: 'pomo', tier: 'titan', icon: '🧘', title: 'Zen Master', desc: 'Complete 4 back-to-back focus sessions without a single pause.' },
    { id: 'pomo_perfect', category: 'pomo', tier: 'aureum', icon: '✨', title: 'The Perfect Loop', desc: 'Complete a full 4-round loop with zero pauses.' },

    // 🧹 HOUSE CHORES
    { id: 'chore_1', category: 'chores', tier: 'bronze', icon: '🧹', title: 'Clean Slate', desc: 'Log your first house chore session.' },
    { id: 'chore_25', category: 'chores', tier: 'silver', icon: '🏰', title: 'Sanctuary Keeper', desc: 'Log 25 total hours of house chores all-time.' },
    { id: 'chore_100', category: 'chores', tier: 'gold', icon: '🌟', title: 'Pillar of the Home', desc: 'Log 100 total hours of house chores all-time.' },

    // 📖 REFLECTION NOTES
    { id: 'diary_1', category: 'diary', tier: 'bronze', icon: '✍️', title: 'Mindful Moment', desc: 'Save your first daily reflection note.' },
    { id: 'diary_30', category: 'diary', tier: 'silver', icon: '📖', title: 'Journaler', desc: 'Save 30 daily reflection notes all-time.' },
    { id: 'diary_100', category: 'diary', tier: 'gold', icon: '🧠', title: 'Philosopher', desc: 'Save 100 daily reflection notes all-time.' },

    // 🔥 CONSISTENCY STREAKS
    { id: 'streak_3', category: 'streak', tier: 'bronze', icon: '⚡', title: '3-Day Ignition', desc: 'Maintain a 3-day active streak (≥1.0h work, 2 pomos, or 0.5h chore/day).' },
    { id: 'streak_7', category: 'streak', tier: 'silver', icon: '🚀', title: '7-Day Unstoppable', desc: 'Maintain a 7-day active streak.' },
    { id: 'streak_30', category: 'streak', tier: 'gold', icon: '💎', title: '30-Day Relentless', desc: 'Maintain a 30-day active streak.' },
    { id: 'streak_100', category: 'streak', tier: 'aureum', icon: '🌋', title: 'Monolith of Discipline', desc: 'Maintain a 100-day active streak.' }
];

function renderBadgeGrid(unlockedSet = new Set()) {
    const gridEl = document.getElementById('badge-grid');
    if (!gridEl) return;

    const countEl = document.getElementById('badge-completion-count');
    if (countEl) countEl.innerText = `${unlockedSet.size} / ${BADGE_CATALOG.length}`;

    gridEl.innerHTML = BADGE_CATALOG.map(badge => {
        const isUnlocked = unlockedSet.has(badge.id);
        const lockClass = isUnlocked ? '' : 'locked';
        const tierClass = `badge-tier-${badge.tier}`;
        
        return `
            <div class="badge-card ${lockClass} ${tierClass} p-4 rounded-xl flex items-start gap-3 select-none">
                <div class="text-3xl p-2 bg-slate-900/80 rounded-xl border border-slate-700/60 shrink-0">
                    ${isUnlocked ? badge.icon : '🔒'}
                </div>
                <div class="space-y-0.5">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold ${isUnlocked ? 'text-slate-100' : 'text-slate-400'}">${badge.title}</span>
                        <span class="text-[9px] uppercase font-extrabold px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">${badge.tier}</span>
                    </div>
                    <p class="text-[11px] text-slate-400 leading-snug">${badge.desc}</p>
                </div>
            </div>
        `;
    }).join('');
}

function showBadgeToast(badge) {
    const container = document.getElementById('badge-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `badge-toast card p-4 rounded-xl shadow-2xl border-2 badge-tier-${badge.tier} flex items-center gap-3 bg-slate-950/90 backdrop-blur-md`;
    toast.innerHTML = `
        <div class="text-3xl p-2 bg-slate-900 rounded-xl border border-slate-700 shrink-0">${badge.icon}</div>
        <div>
            <div class="text-[10px] font-extrabold text-amber-400 uppercase tracking-widest">🏆 Achievement Unlocked!</div>
            <div class="text-sm font-bold text-white">${badge.title}</div>
            <div class="text-xs text-slate-300">${badge.desc}</div>
        </div>
    `;

    container.appendChild(toast);
    playTone('save');

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';
        setTimeout(() => toast.remove(), 500);
    }, 4500);
}

function evaluateBadges(logs, pRoundsList = []) {
    if (!logs) return;

    userSettings.unlockedBadges = userSettings.unlockedBadges || [];
    const unlockedSet = new Set(userSettings.unlockedBadges);
    const newlyUnlocked = [];

    // 1. Work Stats
    const workLogs = logs.filter(l => l.type === 'work');
    const totalWorkHours = workLogs.reduce((acc, l) => acc + (l.hours || 0), 0);
    
    if (workLogs.length >= 1) unlock('work_1');
    if (workLogs.some(l => l.hours >= (userSettings.dailySoftCap || 4))) unlock('work_cap');
    if (totalWorkHours >= 100) unlock('work_100');
    if (totalWorkHours >= 1000) unlock('work_1000');
    if (totalWorkHours >= 10000) unlock('work_10000');

    // 2. Chores & Reflection Stats
    const choreLogs = logs.filter(l => l.type === 'chore');
    const totalChoreHours = choreLogs.reduce((acc, l) => acc + (l.hours || 0), 0);
    if (choreLogs.length >= 1) unlock('chore_1');
    if (totalChoreHours >= 25) unlock('chore_25');
    if (totalChoreHours >= 100) unlock('chore_100');

    const diaryLogs = logs.filter(l => l.type === 'diary');
    if (diaryLogs.length >= 1) unlock('diary_1');
    if (diaryLogs.length >= 30) unlock('diary_30');
    if (diaryLogs.length >= 100) unlock('diary_100');

    // 3. Pomodoro Session Stats
    const pomoCount = pRoundsList.length;
    if (pomoCount >= 1) unlock('pomo_1');
    
    // Group Pomodoros by Day
    const pomoByDay = {};
    pRoundsList.forEach(p => {
        const dateKey = new Date(p.timestamp).toDateString();
        pomoByDay[dateKey] = (pomoByDay[dateKey] || 0) + 1;
    });

    const maxPomoDay = Math.max(0, ...Object.values(pomoByDay));
    if (maxPomoDay >= 4) unlock('pomo_flow');
    if (maxPomoDay >= 8) unlock('pomo_overdrive');
    if (maxPomoDay >= 12) unlock('pomo_marathon');

    pRoundsList.forEach(p => {
        if (p.durationSecs >= 3000) unlock('pomo_deep'); // 50m+
        if (p.durationSecs >= 3000 && !p.wasPaused) unlock('pomo_unbroken');
    });

    // Back-to-Back Clean Sessions
    let cleanStreak = 0;
    pRoundsList.forEach(p => {
        if (!p.wasPaused) {
            cleanStreak++;
            if (cleanStreak >= 4) unlock('pomo_zen');
        } else {
            cleanStreak = 0;
        }
    });

    // 4. Active Day Streaks Calculation
    const activeDates = new Set();
    logs.forEach(l => {
        if (!l.timestamp) return;
        const d = l.timestamp.toDate();
        const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        
        if (l.type === 'work' && l.hours >= 1.0) activeDates.add(dateKey);
        if (l.type === 'chore' && l.hours >= 0.5) activeDates.add(dateKey);
    });

    Object.entries(pomoByDay).forEach(([dayStr, count]) => {
        if (count >= 2) {
            const d = new Date(dayStr);
            activeDates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
        }
    });

    // Calculate Max Consecutive Streak Days
    const sortedDates = Array.from(activeDates).map(str => new Date(str.split('-')[0], str.split('-')[1], str.split('-')[2])).sort((a,b) => a - b);
    let currentStreak = 0, maxStreak = 0;
    for (let i = 0; i < sortedDates.length; i++) {
        if (i === 0) {
            currentStreak = 1;
        } else {
            const diffDays = Math.round((sortedDates[i] - sortedDates[i-1]) / (1000 * 60 * 60 * 24));
            currentStreak = diffDays === 1 ? currentStreak + 1 : 1;
        }
        maxStreak = Math.max(maxStreak, currentStreak);
    }

    if (maxStreak >= 3) unlock('streak_3');
    if (maxStreak >= 7) unlock('streak_7');
    if (maxStreak >= 30) unlock('streak_30');
    if (maxStreak >= 100) unlock('streak_100');

    function unlock(badgeId) {
        if (!unlockedSet.has(badgeId)) {
            unlockedSet.add(badgeId);
            newlyUnlocked.push(badgeId);
            const badge = BADGE_CATALOG.find(b => b.id === badgeId);
            if (badge) showBadgeToast(badge);
        }
    }

    if (newlyUnlocked.length > 0 && loggedInUser === viewedUser) {
        userSettings.unlockedBadges = Array.from(unlockedSet);
        renderBadgeGrid(unlockedSet);
        try {
            db.collection('settings').doc(loggedInUser).set({ unlockedBadges: userSettings.unlockedBadges }, { merge: true });
        } catch (e) { console.error("Failed to sync badges:", e); }
    } else {
        renderBadgeGrid(unlockedSet);
    }
}
