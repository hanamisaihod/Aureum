// FIRESTORE CRUD, TAB & FORM HANDLERS
let currentTodayHoursLogged = 0;
let currentRawLogsCache = [];
let settingsUnsubscribe = null;

auth.onAuthStateChanged(async user => {
    if (user) {
        currentUserUid = user.uid;
        document.getElementById('login-modal').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        
        loggedInUser = (user.uid === "ioxjbBLDH0NDLDWVoYCjq8p3PYU2" || (user.email && user.email.toLowerCase().includes("cream"))) ? 'Cream' : 'North';
        viewedUser = loggedInUser;
        
        initRealtimeSettingsListener();
        await initAndRecoverMyPomoState();
        
        updateUserSwitcherUI();
        initCharts();
        loadUserData();
        updateRatingUI('results');
        updateRatingUI('effort');
        
        startGlobalUIRenderer();
        attachPomoSpectatorListener();
    } else {
        document.getElementById('login-modal').classList.remove('hidden');
        document.getElementById('app-content').classList.add('hidden');
    }
});

function initRealtimeSettingsListener() {
    if (settingsUnsubscribe) settingsUnsubscribe();

    settingsUnsubscribe = db.collection('settings').doc(viewedUser).onSnapshot(doc => {
        if (doc.exists) {
            userSettings = { ...userSettings, ...doc.data() };
        }
        applyThemeToBody(userSettings.userTheme);
        updateSettingsUI();
        updateAvatarsInHeader();
        if (currentRawLogsCache.length > 0) loadUserData();
    });
}

function updateAvatarsInHeader() {
    const northImg = document.getElementById('avatar-img-north');
    const creamImg = document.getElementById('avatar-img-cream');

    if (viewedUser === 'North' && userSettings.avatarUrl) northImg.src = userSettings.avatarUrl;
    if (viewedUser === 'Cream' && userSettings.avatarUrl) creamImg.src = userSettings.avatarUrl;

    if (viewedUser === 'North') {
        northImg.className = "w-9 h-9 rounded-full bg-slate-800 object-cover border-2 border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]";
        creamImg.className = "w-9 h-9 rounded-full bg-slate-800 object-cover border-2 border-transparent opacity-60 hover:opacity-100";
    } else {
        creamImg.className = "w-9 h-9 rounded-full bg-slate-800 object-cover border-2 border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]";
        northImg.className = "w-9 h-9 rounded-full bg-slate-800 object-cover border-2 border-transparent opacity-60 hover:opacity-100";
    }
}

function updateSettingsUI() {
    document.getElementById('label-weekly-hrs').innerText = userSettings.weeklyHours;
    document.getElementById('label-monthly-cash').innerText = userSettings.monthlyCash.toLocaleString();
    
    document.getElementById('setting-monthly-cash').value = userSettings.monthlyCash;
    document.getElementById('setting-weekly-hrs').value = userSettings.weeklyHours;
    document.getElementById('setting-daily-soft-cap').value = userSettings.dailySoftCap || 4;
    document.getElementById('setting-bonus-cap').value = userSettings.maxBonusCapPct;

    document.getElementById('setting-pomo-focus').value = userSettings.pomoFocus || 25;
    document.getElementById('setting-pomo-short').value = userSettings.pomoShort || 5;
    document.getElementById('setting-pomo-long').value = userSettings.pomoLong || 15;
    document.getElementById('setting-pomo-rounds').value = userSettings.pomoRounds || 4;

    document.getElementById('setting-user-theme').value = userSettings.userTheme || 'gold';
    document.getElementById('setting-avatar-url').value = userSettings.avatarUrl || '';
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorElement = document.getElementById('login-error');

    try {
        await auth.signInWithEmailAndPassword(email, password);
        errorElement.classList.add('hidden');
    } catch (error) {
        errorElement.innerText = "Incorrect email or password.";
        errorElement.classList.remove('hidden');
    }
}

function handleLogout() {
    auth.signOut();
}

async function switchActiveUser(targetUser) {
    viewedUser = targetUser;
    initRealtimeSettingsListener();
    updateUserSwitcherUI();
    attachPomoSpectatorListener();
    loadUserData();
}

function updateUserSwitcherUI() {
    const isSelf = loggedInUser === viewedUser;
    
    ['work-form-card', 'diary-form-card', 'health-form-card', 'chore-form-card'].forEach(id => {
        document.getElementById(id).style.display = isSelf ? 'block' : 'none';
    });

    document.querySelectorAll('#tab-forge input, #tab-forge select').forEach(input => {
        input.disabled = !isSelf;
        input.classList.toggle('opacity-50', !isSelf);
        input.classList.toggle('cursor-not-allowed', !isSelf);
    });

    document.querySelectorAll('#tab-forge button').forEach(btn => {
        btn.style.display = isSelf ? 'inline-block' : 'none';
    });

    const banner = document.getElementById('read-only-banner');
    if (!isSelf) {
        banner.classList.remove('hidden');
        document.getElementById('view-target-name').innerText = viewedUser;
    } else {
        banner.classList.add('hidden');
    }

    updateAvatarsInHeader();
}

function switchTab(tab) {
    ['work', 'pomo', 'health', 'chores', 'forge', 'ledger'].forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        if (el) el.classList.add('hidden');
        const nav = document.getElementById(`nav-${t}`);
        if (nav) {
            nav.className = t === tab 
                ? "tab-btn active px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap"
                : "tab-btn px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap";
        }
    });
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    if (tab === 'pomo') attachPomoSpectatorListener();
}

async function logWork(e) {
    e.preventDefault();
    const T = parseFloat(document.getElementById('work-time').value);
    const R = parseFloat(document.getElementById('work-results').value);
    const E = parseFloat(document.getElementById('work-effort').value);
    
    const softCap = userSettings.dailySoftCap || 4;
    const baseRate = (R + E) / 2;

    const remainingNormalHours = Math.max(0, softCap - currentTodayHoursLogged);
    const normalHours = Math.min(T, remainingNormalHours);
    const overCapHours = T - normalHours;

    const pts = (normalHours * baseRate) + (overCapHours * baseRate * 0.25);

    await db.collection('logs').add({
        type: 'work',
        user: loggedInUser,
        hours: T,
        normalHours: normalHours,
        overCapHours: overCapHours,
        results: R,
        effort: E,
        points: pts,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    playTone('save');
    loadUserData();
}

async function logHealth(e) {
    e.preventDefault();
    const level = parseInt(document.getElementById('health-level').value);
    const note = document.getElementById('health-note').value;

    await db.collection('logs').add({
        type: 'health', user: loggedInUser, level: level, note: note,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    playTone('save');
    document.getElementById('health-note').value = '';
    loadUserData();
}

async function logChore(e) {
    e.preventDefault();
    const hours = parseFloat(document.getElementById('chore-time').value);
    const note = document.getElementById('chore-note').value;

    await db.collection('logs').add({
        type: 'chore', user: loggedInUser, hours: hours, note: note,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    playTone('save');
    document.getElementById('chore-note').value = '';
    loadUserData();
}

async function deleteLogEntry(docId) {
    if (loggedInUser !== viewedUser) return;
    try {
        await db.collection('logs').doc(docId).delete();
        playTone('delete');
    } catch (err) { console.error("Error deleting entry:", err); }
}

async function saveDailyDiary(e) {
    e.preventDefault();
    const text = document.getElementById('diary-text').value.trim();
    if (!text) return;

    await db.collection('logs').add({
        type: 'diary', user: loggedInUser, text: text,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    playTone('save');
    loadUserData();
}

async function handleInstantThemeChange() {
    const selectedTheme = document.getElementById('setting-user-theme').value;
    userSettings.userTheme = selectedTheme;
    applyThemeToBody(selectedTheme);
    if (loggedInUser === viewedUser) {
        try {
            await db.collection('settings').doc(loggedInUser).set({ userTheme: selectedTheme }, { merge: true });
            playTone('save');
        } catch (e) { console.error(e); }
    }
}

async function applyCustomAvatarUrl() {
    const url = document.getElementById('setting-avatar-url').value.trim();
    if (!url) return;
    userSettings.avatarUrl = url;
    updateAvatarsInHeader();
    if (loggedInUser === viewedUser) {
        try {
            await db.collection('settings').doc(loggedInUser).set({ avatarUrl: url }, { merge: true });
            playTone('save');
        } catch (e) { console.error(e); }
    }
}

async function setAvatarPreset(style, seed) {
    const url = `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;
    document.getElementById('setting-avatar-url').value = url;
    userSettings.avatarUrl = url;
    updateAvatarsInHeader();
    if (loggedInUser === viewedUser) {
        try {
            await db.collection('settings').doc(loggedInUser).set({ avatarUrl: url }, { merge: true });
            playTone('save');
        } catch (e) { console.error(e); }
    }
}

async function randomizeAvatar() {
    const styles = ['bottts', 'adventurer', 'lorelei', 'avataaars', 'big-smile', 'fun-emoji', 'personas', 'micah'];
    const randomStyle = styles[Math.floor(Math.random() * styles.length)];
    const randomSeed = Math.random().toString(36).substring(7);
    const url = `https://api.dicebear.com/7.x/${randomStyle}/svg?seed=${randomSeed}`;
    
    document.getElementById('setting-avatar-url').value = url;
    userSettings.avatarUrl = url;
    updateAvatarsInHeader();
    if (loggedInUser === viewedUser) {
        try {
            await db.collection('settings').doc(loggedInUser).set({ avatarUrl: url }, { merge: true });
            playTone('save');
        } catch (e) { console.error(e); }
    }
}

async function saveAllForgeSettings(e) {
    if (e) e.preventDefault();
    userSettings.monthlyCash = parseFloat(document.getElementById('setting-monthly-cash').value) || 8000;
    userSettings.weeklyHours = parseFloat(document.getElementById('setting-weekly-hrs').value) || 10;
    userSettings.dailySoftCap = parseFloat(document.getElementById('setting-daily-soft-cap').value) || 4;
    userSettings.maxBonusCapPct = parseFloat(document.getElementById('setting-bonus-cap').value) || 125;
    
    userSettings.pomoFocus = parseInt(document.getElementById('setting-pomo-focus').value) || 25;
    userSettings.pomoShort = parseInt(document.getElementById('setting-pomo-short').value) || 5;
    userSettings.pomoLong = parseInt(document.getElementById('setting-pomo-long').value) || 15;
    userSettings.pomoRounds = parseInt(document.getElementById('setting-pomo-rounds').value) || 4;

    userSettings.userTheme = document.getElementById('setting-user-theme').value;
    userSettings.avatarUrl = document.getElementById('setting-avatar-url').value.trim();

    try {
        await db.collection('settings').doc(loggedInUser).set(userSettings, { merge: true });
        playTone('save');
        updateSettingsUI();
        loadUserData();
        setMyPomoMode('focus');
    } catch (err) { console.error('Failed to save settings:', err); }
}

function loadUserData() {
    db.collection('logs').where('user', '==', viewedUser).onSnapshot(snapshot => {
        let rawLogs = [];
        let monthlyPoints = 0;
        let todayHours = 0;

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const monthKey = `${currentYear}-${currentMonth}`;
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        snapshot.forEach(doc => {
            const d = doc.data();
            d.id = doc.id;
            rawLogs.push(d);

            if (d.type === 'work' && d.timestamp) {
                const logDate = d.timestamp.toDate();
                if (logDate.getFullYear() === currentYear && logDate.getMonth() === currentMonth) {
                    monthlyPoints += (d.points || 0);
                }
                if (logDate >= startOfToday) {
                    todayHours += (d.hours || 0);
                }
            }
        });

        rawLogs.sort((a, b) => {
            const tA = a.timestamp ? a.timestamp.toDate().getTime() : 0;
            const tB = b.timestamp ? b.timestamp.toDate().getTime() : 0;
            return tB - tA;
        });

        currentTodayHoursLogged = todayHours;
        currentRawLogsCache = rawLogs;

        const targetMonthlyPts = userSettings.weeklyHours * 4 * 3;
        const pointRate = userSettings.monthlyCash / targetMonthlyPts;
        const maxCash = userSettings.monthlyCash * (userSettings.maxBonusCapPct / 100);
        const dailySoftCap = userSettings.dailySoftCap || 4;
        
        const calculatedPayout = monthlyPoints * pointRate;
        const finalPayout = Math.min(calculatedPayout, maxCash);
        
        const isVaulted = userSettings.vaultedMonths && userSettings.vaultedMonths[monthKey];
        const payoutEl = document.getElementById('monthly-payout');

        payoutEl.innerText = `฿${Math.round(finalPayout).toLocaleString()}`;
        payoutEl.className = isVaulted ? "text-3xl font-extrabold text-amber-400 mt-1 opacity-70 line-through" : "text-3xl font-extrabold text-emerald-400 mt-1";
        
        document.getElementById('today-hours-label').innerText = `${todayHours.toFixed(1)} / ${dailySoftCap} hrs`;
        document.getElementById('daily-bar').style.width = `${Math.min((todayHours / dailySoftCap) * 100, 100)}%`;

        const dailyBarEl = document.getElementById('daily-bar');
        const milestoneBadge = document.getElementById('milestone-2h-badge');
        const dailyStatusEl = document.getElementById('daily-cap-status');
        const noticeBox = document.getElementById('work-form-softcap-notice');

        if (todayHours >= dailySoftCap) {
            dailyStatusEl.innerText = "🍵 Soft Cap Active (25% Yield)";
            dailyStatusEl.className = "text-xs font-semibold theme-accent-text mt-1";
            dailyBarEl.className = "theme-accent-bg h-full rounded-full transition-all duration-700 shadow-[0_0_8px_rgba(245,158,11,0.4)]";
            milestoneBadge.innerText = "✨ Baseline Mastered";
            milestoneBadge.className = "text-[10px] font-bold theme-accent-text";
            if (noticeBox) noticeBox.classList.remove('hidden');
        } else if (todayHours >= 2.0) {
            dailyStatusEl.innerText = `${(dailySoftCap - todayHours).toFixed(1)} hrs remaining today`;
            dailyStatusEl.className = "text-xs text-slate-400 mt-1";
            dailyBarEl.className = "bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 h-full rounded-full transition-all duration-700 shadow-[0_0_10px_rgba(56,189,248,0.5)]";
            milestoneBadge.innerText = "🎯 2.0h Reached!";
            milestoneBadge.className = "text-[10px] font-bold text-emerald-400";
            if (noticeBox) noticeBox.classList.add('hidden');
        } else {
            dailyStatusEl.innerText = `${(dailySoftCap - todayHours).toFixed(1)} hrs remaining today`;
            dailyStatusEl.className = "text-xs text-slate-400 mt-1";
            dailyBarEl.className = "bg-blue-500 h-full rounded-full transition-all duration-700";
            milestoneBadge.innerText = "2.0h Target";
            milestoneBadge.className = "text-[10px] font-semibold text-slate-500";
            if (noticeBox) noticeBox.classList.add('hidden');
        }

        updateGoalGauge(finalPayout, userSettings.monthlyCash);

        ['work', 'health', 'chore'].forEach(type => {
            updateChartData(type, rawLogs.filter(l => l.type === type), pointRate, maxCash);
        });

        const todayDiary = rawLogs.find(l => l.type === 'diary' && l.timestamp && (l.timestamp.toDate() >= startOfToday));
        if (todayDiary) {
            document.getElementById('diary-text').value = todayDiary.text;
            document.getElementById('diary-status-badge').innerText = "Today's Note Saved ✨";
        } else {
            document.getElementById('diary-text').value = '';
            document.getElementById('diary-status-badge').innerText = "Jot down thoughts or wins";
        }

        populateAndFilterLedger();
    });
}

function populateAndFilterLedger() {
    const select = document.getElementById('ledger-month-select');
    if (!select) return;

    const previousValue = select.value || 'current';
    const monthSet = new Set();
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${now.getMonth()}`;

    currentRawLogsCache.forEach(l => {
        if (l.timestamp) {
            const d = l.timestamp.toDate();
            monthSet.add(`${d.getFullYear()}-${d.getMonth()}`);
        }
    });

    monthSet.add(currentKey);

    const sortedMonths = Array.from(monthSet).sort((a, b) => {
        const [yA, mA] = a.split('-').map(Number);
        const [yB, mB] = b.split('-').map(Number);
        return yA !== yB ? yB - yA : mB - mA;
    });

    const monthsNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let optionsHtml = `<option value="current">Current Month (${monthsNames[now.getMonth()]} ${now.getFullYear()})</option>`;
    
    sortedMonths.forEach(mKey => {
        if (mKey !== currentKey) {
            const [y, m] = mKey.split('-').map(Number);
            optionsHtml += `<option value="${mKey}">${monthsNames[m]} ${y}</option>`;
        }
    });

    optionsHtml += `<option value="all">All Time Records</option>`;
    select.innerHTML = optionsHtml;
    select.value = Array.from(select.options).some(opt => opt.value === previousValue) ? previousValue : 'current';

    applyLedgerFilter();
}

function applyLedgerFilter() {
    const select = document.getElementById('ledger-month-select');
    const val = select ? select.value : 'current';
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let filteredLogs = [];

    if (val === 'all') {
        filteredLogs = currentRawLogsCache;
    } else if (val === 'current') {
        filteredLogs = currentRawLogsCache.filter(l => {
            if (!l.timestamp) return true;
            const d = l.timestamp.toDate();
            return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
        });
    } else {
        const [targetY, targetM] = val.split('-').map(Number);
        filteredLogs = currentRawLogsCache.filter(l => {
            if (!l.timestamp) return false;
            const d = l.timestamp.toDate();
            return d.getFullYear() === targetY && d.getMonth() === targetM;
        });
    }

    renderLedgerLists(filteredLogs);
}

function renderLedgerLists(logs) {
    const isSelf = loggedInUser === viewedUser;
    const workLogs = logs.filter(l => l.type === 'work');
    const healthLogs = logs.filter(l => l.type === 'health');
    const choreLogs = logs.filter(l => l.type === 'chore');
    const diaryLogs = logs.filter(l => l.type === 'diary');

    document.getElementById('ledger-count-work').innerText = `${workLogs.length} entries`;
    document.getElementById('ledger-count-health').innerText = `${healthLogs.length} entries`;
    document.getElementById('ledger-count-chore').innerText = `${choreLogs.length} entries`;
    document.getElementById('ledger-count-diary').innerText = `${diaryLogs.length} entries`;

    const renderCol = (containerId, items, emptyText, formatter) => {
        const container = document.getElementById(containerId);
        if (items.length === 0) {
            container.innerHTML = `<div class="text-xs text-slate-500 py-2">${emptyText}</div>`;
        } else {
            container.innerHTML = items.map(l => {
                const dateStr = l.timestamp ? l.timestamp.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now';
                const delBtn = isSelf ? `<button onclick="deleteLogEntry('${l.id}')" class="text-[10px] text-red-400 hover:text-red-300 font-semibold px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all">Delete</button>` : '';
                return `
                    <div class="p-2.5 bg-slate-800/70 border border-slate-700/60 rounded-lg text-xs space-y-1">
                        <div class="flex justify-between items-center text-slate-400">
                            <span>${dateStr}</span>
                            ${delBtn}
                        </div>
                        ${formatter(l)}
                    </div>
                `;
            }).join('');
        }
    };

    renderCol('ledger-list-work', workLogs, 'No work logs for period.', l => `
        <div class="flex justify-between items-center font-medium">
            <span class="text-slate-200">${l.hours} hrs (${l.results}/${l.effort})</span>
            <span class="text-emerald-400 font-bold">฿${Math.round(l.points * (userSettings.monthlyCash / (userSettings.weeklyHours * 12))).toLocaleString()}</span>
        </div>
    `);

    renderCol('ledger-list-health', healthLogs, 'No snack logs for period.', l => `
        <div class="flex justify-between items-center font-medium">
            <span class="text-emerald-300">Level ${l.level}</span>
            <span class="text-slate-300 italic truncate max-w-[100px]">${l.note || 'No note'}</span>
        </div>
    `);

    renderCol('ledger-list-chore', choreLogs, 'No chore logs for period.', l => `
        <div class="flex justify-between items-center font-medium">
            <span class="theme-accent-text font-bold">${l.hours} hrs</span>
            <span class="text-slate-300 italic truncate max-w-[100px]">${l.note || 'No details'}</span>
        </div>
    `);

    renderCol('ledger-list-diary', diaryLogs, 'No reflections for period.', l => `
        <div class="text-slate-200 italic leading-snug break-words">"${l.text}"</div>
    `);
}
