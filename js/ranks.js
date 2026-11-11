// ============================================================================
// AUREUM — 10-Tier Level System, Work Style Archetypes & Roadmap Modal
// ============================================================================

const RANK_TIER_BANDS = [
    { min: 1, max: 10, tier: "Initiate" },
    { min: 11, max: 20, tier: "Apprentice" },
    { min: 21, max: 30, tier: "Practitioner" },
    { min: 31, max: 40, tier: "Specialist" },
    { min: 41, max: 50, tier: "Artisan" },
    { min: 51, max: 60, tier: "Professional" },
    { min: 61, max: 70, tier: "Expert" },
    { min: 71, max: 80, tier: "Master" },
    { min: 81, max: 90, tier: "Paragon" },
    { min: 91, max: 100, tier: "Vanguard" }
];

const RANK_THRESHOLDS = [0, 80, 340, 770, 1400, 2200, 3200, 4400, 5750, 7350, 9100, 11100, 13200, 15600, 18100, 20900, 23800, 27000, 30400, 33900, 37700, 41600, 45800, 50200, 54700, 59500, 64500, 69700, 75100, 80700, 86500, 92500, 98700, 105000, 112000, 118500, 125500, 133000, 140500, 148000, 156000, 164000, 172500, 181000, 189500, 198500, 208000, 217000, 226500, 236500, 246500, 256500, 267000, 278000, 288500, 299500, 311000, 322500, 334000, 346000, 358000, 370500, 383000, 396000, 409000, 422000, 435500, 449000, 463000, 477000, 491500, 506000, 520500, 535500, 550500, 566000, 581500, 597500, 613500, 629500, 646000, 662500, 679500, 696500, 714000, 731500, 749500, 767500, 785500, 804000, 822500, 841500, 860500, 879500, 899000, 919000, 939000, 959000, 979500, 1000000];

function getUserRole(userOrRole) {
    const raw = String(userOrRole || (typeof viewedUser !== 'undefined' ? viewedUser : 'North')).trim().toLowerCase();
    return (raw === 'cream' || raw === 'author') ? 'author' : 'illustrator';
}

function getUserDomainInfo(userOrRole) {
    const role = getUserRole(userOrRole);
    return role === 'author'
        ? { role: 'author', roleLabel: 'Author', domain: 'Chronicler', icon: '✒️' }
        : { role: 'illustrator', roleLabel: 'Illustrator', domain: 'Artisan', icon: '🎨' };
}

const CREST_STAT_PALETTES = {
    INT: { primary: '#38bdf8', secondary: '#06b6d4', glow: 'rgba(56,189,248,0.45)', deep: '#082f49' },
    WIS: { primary: '#f59e0b', secondary: '#fbbf24', glow: 'rgba(245,158,11,0.45)', deep: '#451a03' },
    STR: { primary: '#ef4444', secondary: '#f43f5e', glow: 'rgba(239,68,68,0.45)', deep: '#450a0a' },
    DEX: { primary: '#10b981', secondary: '#34d399', glow: 'rgba(16,185,129,0.45)', deep: '#064e3b' },
    WIL: { primary: '#f59e0b', secondary: '#f97316', glow: 'rgba(245,158,11,0.45)', deep: '#431407' },
    VIT: { primary: '#10b981', secondary: '#f59e0b', glow: 'rgba(16,185,129,0.40)', deep: '#064e3b' }
};

let _crestUidCounter = 0;

function _buildCrestSigilSvg(normRole, uid, pal, secPal) {
    if (normRole === 'author') {
        return `<g class="crest-sigil-author"><path d="M16 25 C21 23, 27 24, 32 27 C37 24, 43 23, 48 25 L48 43 C43 41, 37 42, 32 45 C27 42, 21 41, 16 43 Z" fill="rgba(15,23,42,0.9)" stroke="url(#${uid}_g)" stroke-width="1.8" /><line x1="32" y1="27" x2="32" y2="45" stroke="${pal.primary}" stroke-width="1.5" /><line x1="20" y1="30" x2="28" y2="31.5" stroke="${pal.secondary}" stroke-width="1.2" /><line x1="36" y1="31.5" x2="44" y2="30" stroke="${secPal.primary}" stroke-width="1.2" /><path d="M43 15 C37 16, 31 22, 29 31 L32 39 L36 30 C41 26, 45 20, 43 15 Z" fill="url(#${uid}_g)" stroke="#f8fafc" stroke-width="0.9" /><line x1="41.5" y1="16.5" x2="29.5" y2="40.5" stroke="#f8fafc" stroke-width="1.2" /></g>`;
    }
    return `<g class="crest-sigil-illustrator"><polygon points="32,14 47,36 32,47 17,36" fill="rgba(15,23,42,0.88)" stroke="url(#${uid}_g)" stroke-width="1.8" /><polygon points="32,14 40,35 32,47 24,35" fill="url(#${uid}_g)" fill-opacity="0.28" stroke="${pal.secondary}" stroke-width="1.1" /><line x1="17" y1="36" x2="47" y2="36" stroke="${secPal.primary}" stroke-width="1.1" /><path d="M32 11 L36.5 26 L32 49 L27.5 26 Z" fill="url(#${uid}_g)" stroke="#f8fafc" stroke-width="0.95" /><circle cx="32" cy="27" r="2.2" fill="#0f172a" stroke="#f8fafc" stroke-width="1.1" /></g>`;
}

function renderClassCrest(role, topStats, level = 1, size = 44) {
    const normRole = getUserRole(role);
    const lvl = Math.max(1, Math.min(100, parseInt(level) || 1));
    const uid = `c_${++_crestUidCounter}_${lvl}`;
    let statKeys = [];
    if (Array.isArray(topStats)) {
        statKeys = topStats.map(s => (typeof s === 'string' ? s.toUpperCase() : (s?.key || '').toUpperCase())).filter(Boolean);
    } else if (typeof topStats === 'string' && topStats.trim()) {
        statKeys = [topStats.trim().toUpperCase()];
    }
    const primaryKey = statKeys.find(k => CREST_STAT_PALETTES[k]) || (normRole === 'author' ? 'WIS' : 'DEX');
    const secondaryKey = statKeys.find(k => k !== primaryKey && CREST_STAT_PALETTES[k]) || (normRole === 'author' ? 'INT' : 'WIS');

    const pal = CREST_STAT_PALETTES[primaryKey] || CREST_STAT_PALETTES.DEX;
    const secPal = CREST_STAT_PALETTES[secondaryKey] || CREST_STAT_PALETTES.WIS;
    const ringScale = (0.86 + Math.min(1, lvl / 100) * 0.14).toFixed(3);
    const outerStroke = (1.35 + (lvl / 100) * 1.15).toFixed(2);
    const tierBand = Math.min(10, Math.max(1, Math.ceil(lvl / 10)));

    let levelFrame = '';
    if (lvl >= 15) levelFrame += `<polygon points="32,4 52,12 60,32 52,52 32,60 12,52 4,32 12,12" fill="none" stroke="url(#${uid}_g)" stroke-width="1.1" stroke-opacity="0.55" />`;
    if (lvl >= 30) levelFrame += `<circle cx="32" cy="32" r="28.5" fill="none" stroke="${pal.secondary}" stroke-width="0.9" stroke-dasharray="3,3" stroke-opacity="0.65" /><path d="M32 1.5 L34.2 6.5 L32 5.2 L29.8 6.5 Z M32 62.5 L34.2 57.5 L32 58.8 L29.8 57.5 Z M1.5 32 L6.5 29.8 L5.2 32 L6.5 34.2 Z M62.5 32 L57.5 29.8 L58.8 32 L57.5 34.2 Z" fill="${pal.primary}" />`;
    if (lvl >= 55) levelFrame += `<polygon points="32,2 39,10 50,7 48,18 59,22 53,32 59,42 48,46 50,57 39,54 32,62 25,54 14,57 16,46 5,42 11,32 5,22 16,18 14,7 25,10" fill="none" stroke="${secPal.primary}" stroke-width="0.95" stroke-opacity="0.5" />`;
    if (lvl >= 80) levelFrame += `<circle cx="32" cy="32" r="30.2" fill="none" stroke="${pal.primary}" stroke-width="1.3" stroke-opacity="0.8" />`;

    const rDot = lvl >= 25 ? '2.1' : '1.4';
    const runes = `<g class="crest-runes" opacity="0.92"><polygon points="32,5.5 34,8.5 32,11.5 30,8.5" fill="${pal.primary}" /><polygon points="32,52.5 34,55.5 32,58.5 30,55.5" fill="${pal.primary}" /><polygon points="5.5,32 8.5,30 11.5,32 8.5,34" fill="${secPal.primary}" /><polygon points="52.5,32 55.5,30 58.5,32 55.5,34" fill="${secPal.primary}" /><circle cx="14" cy="14" r="${rDot}" fill="${pal.secondary}" /><circle cx="50" cy="14" r="${rDot}" fill="${secPal.primary}" /><circle cx="14" cy="50" r="${rDot}" fill="${secPal.primary}" /><circle cx="50" cy="50" r="${rDot}" fill="${pal.secondary}" /></g>`;
    const sigil = _buildCrestSigilSvg(normRole, uid, pal, secPal);
    const sizeAttr = size ? `width="${size}" height="${size}"` : '';
    return `<svg ${sizeAttr} viewBox="0 0 64 64" class="aureum-class-crest shrink-0 select-none overflow-visible" data-role="${normRole}" data-stat="${primaryKey}" data-level="${lvl}" style="filter: drop-shadow(0 0 8px ${pal.glow});"><defs><linearGradient id="${uid}_g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${pal.primary}" /><stop offset="60%" stop-color="${pal.secondary}" /><stop offset="100%" stop-color="${secPal.primary}" /></linearGradient><radialGradient id="${uid}_bg" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${pal.primary}" stop-opacity="0.28" /><stop offset="70%" stop-color="${pal.deep}" stop-opacity="0.88" /><stop offset="100%" stop-color="#090d16" stop-opacity="0.96" /></radialGradient></defs><g transform="translate(32 32) scale(${ringScale}) translate(-32 -32)"><circle cx="32" cy="32" r="26" fill="url(#${uid}_bg)" stroke="url(#${uid}_g)" stroke-width="${outerStroke}" /><circle cx="32" cy="32" r="21.5" fill="none" stroke="${pal.primary}" stroke-width="0.85" stroke-opacity="0.45" stroke-dasharray="${2 + tierBand},2" />${levelFrame}${runes}</g>${sigil}</svg>`;
}

function getRankTierName(level) {
    const lvl = Math.max(1, Math.min(100, parseInt(level) || 1));
    const idx = Math.min(9, Math.floor((lvl - 1) / 10));
    return RANK_TIER_BANDS[idx].tier;
}

const ALL_STAT_KEYS = ['STR', 'DEX', 'INT', 'VIT', 'WIS', 'WIL'];

function computeStatScoresFromLogs(logs, settings, windowDays = 30, referenceTimeMs = null) {
    const safeLogs = Array.isArray(logs) ? logs : [];
    const safeSettings = settings || {};
    const refNow = referenceTimeMs || Date.now();
    const pool = referenceTimeMs
        ? safeLogs.filter(l => getLogDate(l).getTime() <= refNow)
        : safeLogs;

    const workLogs = pool.filter(l => l.type === 'work');
    const workoutLogs = pool.filter(l => l.type === 'workout');
    const choreLogs = pool.filter(l => l.type === 'chore');
    const diaryLogs = pool.filter(l => l.type === 'diary');
    const healthLogs = pool.filter(l => l.type === 'health');
    const pomoList = Array.isArray(safeSettings.completedPomoHistory) ? safeSettings.completedPomoHistory : [];
    const unlockedBadges = Array.isArray(safeSettings.unlockedBadges) ? safeSettings.unlockedBadges : [];
    const todos = Array.isArray(safeSettings.scratchpadTodos) ? safeSettings.scratchpadTodos : [];

    const workoutHours = workoutLogs.reduce((acc, l) => acc + (parseFloat(l.hours) || 0), 0);
    const avgStrain = workoutLogs.length > 0
        ? workoutLogs.reduce((acc, l) => acc + (parseFloat(l.strain) || 3), 0) / workoutLogs.length : 3.0;
    const heavyWorkHours = workLogs.filter(l => (parseFloat(l.effort) || 3) >= 4).reduce((acc, l) => acc + (parseFloat(l.hours) || 0), 0);
    const strRaw = (workoutHours * 4.2 * (avgStrain / 3)) + (workoutLogs.length * 1.8) + (heavyWorkHours * 1.4);
    const strVal = Math.min(99, Math.max(12, Math.round(12 + 87 * (1 - Math.exp(-strRaw / 38)))));

    const cutoff30 = refNow - ((windowDays || 30) * 86400000);
    const recentWork = workLogs.filter(l => getLogDate(l).getTime() >= cutoff30);
    const avgQ = recentWork.length > 0
        ? recentWork.reduce((acc, l) => acc + (parseFloat(l.results) || 3), 0) / recentWork.length
        : (workLogs.length > 0 ? workLogs.reduce((acc, l) => acc + (parseFloat(l.results) || 3), 0) / workLogs.length : 3.0);
    const avgE = recentWork.length > 0
        ? recentWork.reduce((acc, l) => acc + (parseFloat(l.effort) || 3), 0) / recentWork.length
        : (workLogs.length > 0 ? workLogs.reduce((acc, l) => acc + (parseFloat(l.effort) || 3), 0) / workLogs.length : 3.0);
    let masteryMult = 0.75;
    if (avgQ >= 4 && avgE >= 4) {
        masteryMult = 1.25;
    } else if (avgQ >= 4) {
        masteryMult = 1.0;
    }
    const doneTodos = todos.filter(t => t.done).length;
    const dexQualityPart = workLogs.length > 0 ? ((avgQ - 1) / 4) * 54 : 18;
    const dexMasteryPart = Math.min(25, Math.sqrt(workLogs.length) * 3.2 + doneTodos * 0.8);
    const dexVal = Math.min(99, Math.max(12, Math.round((dexQualityPart + dexMasteryPart) * masteryMult)));

    const totalWorkHours = workLogs.reduce((acc, l) => acc + (parseFloat(l.hours) || 0), 0);
    const totalFocusHours = pomoList.reduce((acc, p) => acc + ((parseFloat(p.durationSecs) || 0) / 3600), 0);
    const unbrokenFocusHours = pomoList.filter(p => !p.wasPaused).reduce((acc, p) => acc + ((parseFloat(p.durationSecs) || 0) / 3600), 0);
    const intRaw = (totalWorkHours * 1.6) + (totalFocusHours * 4.4) + (unbrokenFocusHours * 2.8);
    const intVal = Math.min(99, Math.max(12, Math.round(12 + 87 * (1 - Math.exp(-intRaw / 55)))));

    const totalChoreHours = choreLogs.reduce((acc, l) => acc + (parseFloat(l.hours) || 0), 0);
    const softCap = parseFloat(safeSettings.dailySoftCap) || 4;
    const workByDay = {};
    workLogs.forEach(l => {
        const d = getLogDate(l);
        const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        workByDay[k] = (workByDay[k] || 0) + (parseFloat(l.hours) || 0);
    });
    const balancedDays = Object.values(workByDay).filter(h => h >= 1.5 && h <= softCap + 1).length;
    const vitRaw = (totalChoreHours * 3.6) + (choreLogs.length * 1.5) + (balancedDays * 2.2) + (healthLogs.length * 0.8);
    const vitVal = Math.min(99, Math.max(12, Math.round(12 + 87 * (1 - Math.exp(-vitRaw / 38)))));

    const wisRaw = (diaryLogs.length * 3.5) + (unlockedBadges.length * 4.2);
    const wisVal = Math.min(99, Math.max(12, Math.round(12 + 87 * (1 - Math.exp(-wisRaw / 42)))));

    const activeDaySet = new Set();
    pool.forEach(l => {
        const d = getLogDate(l);
        activeDaySet.add(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
    });
    const sortedDays = Array.from(activeDaySet).sort((a, b) => a - b);
    let bestStreak = sortedDays.length > 0 ? 1 : 0, curRun = sortedDays.length > 0 ? 1 : 0;
    for (let i = 1; i < sortedDays.length; i++) {
        const diff = Math.round((sortedDays[i] - sortedDays[i - 1]) / 86400000);
        if (diff === 1) { curRun++; if (curRun > bestStreak) bestStreak = curRun; }
        else if (diff > 1) curRun = 1;
    }
    const softCapHits = Object.values(workByDay).filter(h => h >= softCap).length;
    const wilRaw = (sortedDays.length * 2.0) + (bestStreak * 3.8) + (softCapHits * 3.0);
    const wilVal = Math.min(99, Math.max(12, Math.round(12 + 87 * (1 - Math.exp(-wilRaw / 42)))));

    return {
        STR: strVal,
        DEX: dexVal,
        INT: intVal,
        VIT: vitVal,
        WIS: wisVal,
        WIL: wilVal
    };
}

function _normalizeStatsMap(stats) {
    const map = { STR: 12, DEX: 12, INT: 12, VIT: 12, WIS: 12, WIL: 12 };
    if (!stats) return map;
    if (Array.isArray(stats)) {
        stats.forEach(item => {
            if (item && item.key && ALL_STAT_KEYS.includes(String(item.key).toUpperCase())) {
                const k = String(item.key).toUpperCase();
                map[k] = Number(item.val ?? item.score ?? 12);
            }
        });
        return map;
    }
    if (typeof stats === 'object') {
        ALL_STAT_KEYS.forEach(k => {
            if (stats[k] !== undefined && stats[k] !== null) {
                map[k] = Number(stats[k]);
            }
        });
    }
    return map;
}

function getTopStatKeysFromMap(statScores, role) {
    const normRole = getUserRole(role);
    const s = _normalizeStatsMap(statScores);
    const tieOrder = normRole === 'author'
        ? ['WIS', 'INT', 'WIL', 'VIT', 'DEX', 'STR']
        : ['DEX', 'WIS', 'INT', 'VIT', 'WIL', 'STR'];
    const sorted = [...ALL_STAT_KEYS].sort((a, b) => {
        const diff = (s[b] || 0) - (s[a] || 0);
        if (diff !== 0) return diff;
        return tieOrder.indexOf(a) - tieOrder.indexOf(b);
    });
    return sorted;
}

function calculateHybridClass(stats, role) {
    let resolvedStats = stats;
    let resolvedRole = role;
    if (typeof stats === 'string' && (role === undefined || typeof role === 'object')) {
        resolvedRole = stats;
        resolvedStats = role;
    }
    const normRole = getUserRole(resolvedRole);
    const sortedKeys = getTopStatKeysFromMap(resolvedStats, normRole);
    const primary = sortedKeys[0];
    const secondary = sortedKeys[1];
    const hasPair = (a, b) => (primary === a && secondary === b) || (primary === b && secondary === a);

    if (normRole === 'illustrator') {
        if (hasPair('VIT', 'WIL')) return 'Stalwart Vanguard';
        if (hasPair('VIT', 'WIS')) return 'Relic Artisan';
        if (hasPair('VIT', 'STR')) return 'Iron Sculptor';
        if (hasPair('WIS', 'WIL')) return 'Master Chronicler';
        if (hasPair('INT', 'VIT')) return 'System Draftsman';

        if (primary === 'DEX' || secondary === 'DEX') {
            const partner = primary === 'DEX' ? secondary : primary;
            if (partner === 'INT') return 'Artisan Draftsman';
            if (partner === 'STR') return 'Stalwart Illustris';
            return 'Grand Virtuoso';
        }

        if (hasPair('INT', 'WIS')) return 'Master Chronicler';
        if (hasPair('INT', 'WIL')) return 'System Draftsman';
        if (hasPair('INT', 'STR')) return 'Iron Sculptor';
        if (hasPair('STR', 'WIL')) return 'Stalwart Vanguard';
        if (hasPair('STR', 'WIS')) return 'Relic Artisan';
        return 'Stalwart Vanguard';
    }

    if (hasPair('WIS', 'INT')) return 'Arch-Chronicler';
    if (hasPair('WIS', 'WIL')) return 'Relic Keeper';
    if (hasPair('WIS', 'STR')) return 'Iron Scribe';
    if (hasPair('VIT', 'WIL')) return 'Stalwart Vanguard';
    if (hasPair('VIT', 'WIS')) return 'Relic Keeper';
    if (hasPair('VIT', 'STR')) return 'Iron Scribe';
    if (hasPair('INT', 'VIT')) return 'Arch-Chronicler';
    if (hasPair('INT', 'WIL')) return 'Relic Keeper';
    if (hasPair('STR', 'WIL')) return 'Iron Scribe';
    if (hasPair('INT', 'STR')) return 'Iron Scribe';
    if (primary === 'DEX' || secondary === 'DEX') {
        const partner = primary === 'DEX' ? secondary : primary;
        if (partner === 'STR') return 'Iron Scribe';
        if (partner === 'WIL' || partner === 'VIT') return 'Relic Keeper';
        return 'Arch-Chronicler';
    }
    return 'Arch-Chronicler';
}

function getHybridClassTitle(role, statScores) {
    return calculateHybridClass(statScores, role);
}

function calculateRolling30DayQE(logs, userOrRole, settings) {
    const role = getUserRole(userOrRole);
    const scores30 = computeStatScoresFromLogs(logs, settings, 30);
    const hybridTitle = getHybridClassTitle(role, scores30);
    const topStats = getTopStatKeysFromMap(scores30, role);
    if (!logs || !Array.isArray(logs)) {
        return { avgQuality: 0, avgEffort: 0, count: 0, stalwartCount: 0, archetype: hybridTitle, hybridTitle, topStats, statScores: scores30 };
    }
    const cutoff = Date.now() - (30 * 86400000);
    const recentWork = logs.filter(l => l.type === 'work' && getLogDate(l).getTime() >= cutoff);
    if (recentWork.length === 0) {
        return { avgQuality: 0, avgEffort: 0, count: 0, stalwartCount: 0, archetype: hybridTitle, hybridTitle, topStats, statScores: scores30 };
    }
    let sumQ = 0, sumE = 0, stalwartCount = 0;
    for (let i = 0; i < recentWork.length; i++) {
        const q = parseFloat(recentWork[i].results) || 3, e = parseFloat(recentWork[i].effort) || 3;
        sumQ += q; sumE += e;
        if (q >= 4 && e >= 4) stalwartCount++;
    }
    return { avgQuality: sumQ / recentWork.length, avgEffort: sumE / recentWork.length, count: recentWork.length, stalwartCount, archetype: hybridTitle, hybridTitle, topStats, statScores: scores30 };
}

function getRankDetails(pwr, logs, userOrRole, settings) {
    const score = Math.max(0, pwr || 0);
    let rank = 1;
    for (let i = 99; i >= 0; i--) {
        if (score >= RANK_THRESHOLDS[i]) {
            rank = i + 1;
            break;
        }
    }
    const role = getUserRole(userOrRole);
    const domainInfo = getUserDomainInfo(role);
    const tierName = getRankTierName(rank);
    const qeStats = calculateRolling30DayQE(logs, role, settings);
    const workStyle = qeStats.hybridTitle;
    const title = workStyle;

    const currentThreshold = RANK_THRESHOLDS[rank - 1];
    const nextThreshold = rank < 100 ? RANK_THRESHOLDS[rank] : null;
    let progressPct = 100;
    let neededPWR = 0;
    if (nextThreshold !== null) {
        const span = nextThreshold - currentThreshold;
        progressPct = Math.min(100, Math.max(0, ((score - currentThreshold) / span) * 100));
        neededPWR = Math.max(0, nextThreshold - score);
    }
    return {
        rank,
        level: rank,
        role,
        domain: domainInfo.domain,
        roleLabel: domainInfo.roleLabel,
        tierName,
        workStyle,
        hybridTitle: workStyle,
        title,
        fullRankTitle: `${tierName} • ${workStyle}`,
        topStats: qeStats.topStats,
        statScores30d: qeStats.statScores,
        currentThreshold,
        nextThreshold,
        progressPct,
        neededPWR,
        lifetimePWR: score,
        avgQuality30d: qeStats.avgQuality,
        avgEffort30d: qeStats.avgEffort
    };
}

function calculateLifetimePWR(logs) {
    let workH = 0, workoutH = 0, choreH = 0;
    if (!logs || !Array.isArray(logs)) return 0;
    for (let i = 0; i < logs.length; i++) {
        const l = logs[i];
        if (l.type === 'work') workH += (l.hours || 0);
        else if (l.type === 'workout') workoutH += (l.hours || 0);
        else if (l.type === 'chore') choreH += (l.hours || 0);
    }
    return Math.round((workH * 100) + (workoutH * 120) + (choreH * 80));
}
const calculatePowerScore = calculateLifetimePWR;

function calculateAndRenderPowerMeter(logs) {
    const pwrScore = calculateLifetimePWR(logs);
    const rankDetails = getRankDetails(pwrScore, logs, viewedUser, userSettings);
    if ($('power-score-val')) $('power-score-val').innerText = pwrScore.toLocaleString();
    if ($('power-level-bar')) $('power-level-bar').style.width = `${Math.min(100, Math.round(rankDetails.progressPct))}%`;
}

const WORK_STYLE_INFO = {
    'Stalwart Vanguard': { icon: '🛡️', combo: 'High VIT + WIL', tagline: 'High VIT + WIL • Unwavering Pacing & Deep Endurance', desc: 'Harmonizes sustainable daily pacing with relentless streak discipline and deep endurance across every shift.' },
    'Relic Artisan': { icon: '🏺', combo: 'High VIT + WIS', tagline: 'High VIT + WIS • Resilient Craft & Archival Focus', desc: 'Blends sanctuary balance and restorative pacing with reflective chronicle wisdom and milestone mastery.' },
    'Iron Sculptor': { icon: '⚒️', combo: 'High VIT + STR', tagline: 'High VIT + STR • Heavy Project Volume & Physical Power', desc: 'Combines physical conditioning and high-strain output with grounded life maintenance to power heavy project volume.' },
    'Master Chronicler': { icon: '📖', combo: 'High WIS + WIL', tagline: 'High WIS + WIL • Deep Worldbuilding & Focus', desc: 'Synthesizes archival reflection and lore mastery with unbroken daily willpower and long-term consistency.' },
    'System Draftsman': { icon: '📐', combo: 'High INT + VIT', tagline: 'High INT + VIT • Structured Technical Execution', desc: 'Pairs sustained cognitive immersion and deep focus sessions with structured, well-paced daily execution.' },
    'Grand Virtuoso': { icon: '🎨', combo: 'High DEX + WIS', tagline: 'High DEX + WIS • Master of Inspired Visual Craft', desc: 'Merges razor-sharp execution with deep reflective insight — turning every canvas session into timeless artistry.' },
    'Artisan Draftsman': { icon: '📐', combo: 'High DEX + INT', tagline: 'High DEX + INT • Architect of Precision & Deep Focus', desc: 'Combines technical draughtsmanship with sustained cognitive immersion and unbroken flow states.' },
    'Stalwart Illustris': { icon: '⚔️', combo: 'High DEX + STR', tagline: 'High DEX + STR • Relentless Vanguard of the Stylus', desc: 'Forges high-craft illustration through sheer physical stamina, heavy-effort shifts, and unyielding grit.' },
    'Arch-Chronicler': { icon: '📜', combo: 'High WIS + INT', tagline: 'High WIS + INT • Sovereign Scholar of the Living Codex', desc: 'Synthesizes deep reflective wisdom with sustained intellectual focus to weave intricate narratives.' },
    'Relic Keeper': { icon: '🏺', combo: 'High WIS + WIL', tagline: 'High WIS + WIL • Custodian of Lore & Unbroken Streaks', desc: 'Guards the sacred archives through daily discipline, streak resilience, and milestone mastery.' },
    'Iron Scribe': { icon: '✒️', combo: 'High WIS + STR', tagline: 'High WIS + STR • Indomitable Forge-Writer', desc: 'Channels high-strain conditioning and intense effort into powerful, unshakeable written output.' },
    Virtuoso: { icon: '✨', combo: 'High DEX + WIS', tagline: 'High Quality (≥ 4.0) + Low Effort (≤ 3.0)', desc: 'Efficient, high craft — delivering peak output with minimal strain and effortless flow.' },
    Stalwart: { icon: '🛡️', combo: 'High DEX + STR', tagline: 'High Quality (≥ 4.0) + High Effort (≥ 4.0)', desc: 'High craft, maximum dedication — forging top-tier results through relentless grit and focus.' },
    Grinder: { icon: '⛏️', combo: 'High DEX + STR', tagline: 'Low Quality (≤ 3.0) + High Effort (≥ 4.0)', desc: 'High volume, brute force — pushing through heavy resistance and foundational groundwork.' },
    Tactician: { icon: '⚖️', combo: 'High DEX + INT', tagline: 'Balanced Quality & Effort Distribution', desc: 'Steady, measured cadence — maintaining a sustainable equilibrium across output and energy.' }
};

function getStatGrade(val) {
    if (val >= 90) return { grade: 'S+', color: '#f59e0b', bg: 'rgba(245,158,11,0.18)', border: 'rgba(245,158,11,0.45)' };
    if (val >= 80) return { grade: 'S', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.4)' };
    if (val >= 65) return { grade: 'A', color: '#10b981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.35)' };
    if (val >= 50) return { grade: 'B', color: '#38bdf8', bg: 'rgba(56,189,248,0.15)', border: 'rgba(56,189,248,0.35)' };
    if (val >= 35) return { grade: 'C', color: '#a855f7', bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.35)' };
    return { grade: 'D', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.25)' };
}

function calculateRPGAbilities(logs, settings, pwr, rankInfo) {
    const safeLogs = Array.isArray(logs) ? logs : [];
    const safeSettings = settings || {};
    const workLogs = safeLogs.filter(l => l.type === 'work');
    const workoutLogs = safeLogs.filter(l => l.type === 'workout');
    const choreLogs = safeLogs.filter(l => l.type === 'chore');
    const diaryLogs = safeLogs.filter(l => l.type === 'diary');
    const healthLogs = safeLogs.filter(l => l.type === 'health');
    const pomoList = Array.isArray(safeSettings.completedPomoHistory) ? safeSettings.completedPomoHistory : [];
    const unlockedBadges = Array.isArray(safeSettings.unlockedBadges) ? safeSettings.unlockedBadges : [];
    const todos = Array.isArray(safeSettings.scratchpadTodos) ? safeSettings.scratchpadTodos : [];

    const workoutHours = workoutLogs.reduce((acc, l) => acc + (parseFloat(l.hours) || 0), 0);
    const avgStrain = workoutLogs.length > 0
        ? workoutLogs.reduce((acc, l) => acc + (parseFloat(l.strain) || 3), 0) / workoutLogs.length : 3.0;
    const heavyWorkHours = workLogs.filter(l => (parseFloat(l.effort) || 3) >= 4).reduce((acc, l) => acc + (parseFloat(l.hours) || 0), 0);
    const strRaw = (workoutHours * 4.2 * (avgStrain / 3)) + (workoutLogs.length * 1.8) + (heavyWorkHours * 1.4);
    const strVal = Math.min(99, Math.max(12, Math.round(12 + 87 * (1 - Math.exp(-strRaw / 38)))));

    const qe30 = calculateRolling30DayQE(safeLogs);
    const avgQ = qe30.count > 0
        ? qe30.avgQuality
        : (workLogs.length > 0 ? workLogs.reduce((acc, l) => acc + (parseFloat(l.results) || 3), 0) / workLogs.length : 3.0);
    const avgE = qe30.count > 0
        ? qe30.avgEffort
        : (workLogs.length > 0 ? workLogs.reduce((acc, l) => acc + (parseFloat(l.effort) || 3), 0) / workLogs.length : 3.0);
    let masteryMult = 0.75;
    if (avgQ >= 4 && avgE >= 4) {
        masteryMult = 1.25;
    } else if (avgQ >= 4 && avgE <= 3) {
        masteryMult = 1.0;
    } else if (avgQ >= 4) {
        masteryMult = 1.0;
    }
    const masteryMultStr = Number.isInteger(masteryMult) ? `${masteryMult.toFixed(1)}x` : `${masteryMult}x`;
    const doneTodos = todos.filter(t => t.done).length;
    const dexQualityPart = workLogs.length > 0 ? ((avgQ - 1) / 4) * 54 : 18;
    const dexMasteryPart = Math.min(25, Math.sqrt(workLogs.length) * 3.2 + doneTodos * 0.8);
    const dexVal = Math.min(99, Math.max(12, Math.round((dexQualityPart + dexMasteryPart) * masteryMult)));

    const totalWorkHours = workLogs.reduce((acc, l) => acc + (parseFloat(l.hours) || 0), 0);
    const totalFocusHours = pomoList.reduce((acc, p) => acc + ((parseFloat(p.durationSecs) || 0) / 3600), 0);
    const unbrokenFocusHours = pomoList.filter(p => !p.wasPaused).reduce((acc, p) => acc + ((parseFloat(p.durationSecs) || 0) / 3600), 0);
    const intRaw = (totalWorkHours * 1.6) + (totalFocusHours * 4.4) + (unbrokenFocusHours * 2.8);
    const intVal = Math.min(99, Math.max(12, Math.round(12 + 87 * (1 - Math.exp(-intRaw / 55)))));

    const totalChoreHours = choreLogs.reduce((acc, l) => acc + (parseFloat(l.hours) || 0), 0);
    const softCap = parseFloat(safeSettings.dailySoftCap) || 4;
    const workByDay = {};
    workLogs.forEach(l => {
        const d = getLogDate(l);
        const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        workByDay[k] = (workByDay[k] || 0) + (parseFloat(l.hours) || 0);
    });
    const balancedDays = Object.values(workByDay).filter(h => h >= 1.5 && h <= softCap + 1).length;
    const vitRaw = (totalChoreHours * 3.6) + (choreLogs.length * 1.5) + (balancedDays * 2.2) + (healthLogs.length * 0.8);
    const vitVal = Math.min(99, Math.max(12, Math.round(12 + 87 * (1 - Math.exp(-vitRaw / 38)))));

    const wisRaw = (diaryLogs.length * 3.5) + (unlockedBadges.length * 4.2);
    const wisVal = Math.min(99, Math.max(12, Math.round(12 + 87 * (1 - Math.exp(-wisRaw / 42)))));

    const activeDaySet = new Set();
    safeLogs.forEach(l => {
        const d = getLogDate(l);
        activeDaySet.add(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
    });
    const sortedDays = Array.from(activeDaySet).sort((a, b) => a - b);
    let bestStreak = sortedDays.length > 0 ? 1 : 0, curRun = sortedDays.length > 0 ? 1 : 0;
    for (let i = 1; i < sortedDays.length; i++) {
        const diff = Math.round((sortedDays[i] - sortedDays[i - 1]) / 86400000);
        if (diff === 1) { curRun++; if (curRun > bestStreak) bestStreak = curRun; }
        else if (diff > 1) curRun = 1;
    }
    const softCapHits = Object.values(workByDay).filter(h => h >= softCap).length;
    const wilRaw = (sortedDays.length * 2.0) + (bestStreak * 3.8) + (softCapHits * 3.0);
    const wilVal = Math.min(99, Math.max(12, Math.round(12 + 87 * (1 - Math.exp(-wilRaw / 42)))));

    const stats = [
        {
            key: 'STR',
            name: 'Strength',
            icon: '⚔️',
            val: strVal,
            color: '#ef4444',
            detail: `${formatHours(workoutHours)}h Fitness | ${formatHours(heavyWorkHours)}h High-Strain`,
            description: 'Measures physical conditioning, athletic exertion, and capacity for high-strain output.',
            actionGuide: '⚡ Log Fitness workouts with higher strain or complete high-effort Work Shifts (Effort >= 4.0) to build raw strength.'
        },
        {
            key: 'DEX',
            name: 'Dexterity',
            icon: '🎯',
            val: dexVal,
            color: '#10b981',
            detail: `${avgQ.toFixed(1)} / 5 Craft | ${masteryMultStr} Mastery`,
            description: 'Measures precision, fine craft, and high-quality execution standards.',
            actionGuide: '⚡ Log sessions with Quality 4–5 and Effort 4–5 to earn maximum 1.25x Mastery EXP.'
        },
        {
            key: 'INT',
            name: 'Intelligence',
            icon: '🧠',
            val: intVal,
            color: '#38bdf8',
            detail: `${formatHours(totalWorkHours)}h Work | ${formatHours(totalFocusHours)}h Focus`,
            description: 'Measures cognitive depth, sustained concentration, and uninterrupted deep-work mastery.',
            actionGuide: '⚡ Accumulate unbroken Hourglass Focus time without pausing and log Deep Work hours.'
        },
        {
            key: 'VIT',
            name: 'Vitality',
            icon: '🛡️',
            val: vitVal,
            color: '#f59e0b',
            detail: `${formatHours(totalChoreHours)}h Chores | ${balancedDays}d Paced`,
            description: 'Measures life maintenance, environmental order, and sustainable daily work pacing.',
            actionGuide: '⚡ Log Sanctuary Chores, track Health metrics, and maintain balanced work days within your daily soft cap.'
        },
        {
            key: 'WIS',
            name: 'Wisdom',
            icon: '📖',
            val: wisVal,
            color: '#a855f7',
            detail: `${diaryLogs.length} Chronicles | ${unlockedBadges.length} Relics`,
            description: 'Measures self-reflection, synthesis of lived experience, and milestone mastery.',
            actionGuide: '⚡ Write Journal Chronicles to reflect on your days and unlock Relics across all disciplines.'
        },
        {
            key: 'WIL',
            name: 'Willpower',
            icon: '🔥',
            val: wilVal,
            color: '#f97316',
            detail: `${sortedDays.length}d Active | ${bestStreak}d Best Streak`,
            description: 'Measures relentless consistency, daily discipline, and long-term streak resilience.',
            actionGuide: '⚡ Show up daily to extend your active streak and hit your daily focus soft cap consistently.'
        }
    ];

    const avgStat = Math.round(stats.reduce((s, x) => s + x.val, 0) / stats.length);
    const powerLevel = Math.round((pwr || 0) + (avgStat * 25) + ((rankInfo?.level || 1) * 120));
    const overallGrade = getStatGrade(avgStat);
    const topStat = [...stats].sort((a, b) => b.val - a.val)[0];
    const specialtyMap = {
        STR: 'Titan Vanguard (Physical & Grit)',
        DEX: 'Grand Artisan (Craft & Precision)',
        INT: 'Arcane Scholar (Deep Focus)',
        VIT: 'Sanctuary Warden (Harmony & Keep)',
        WIS: 'Chronicle Sage (Lore & Insight)',
        WIL: 'Unyielding Sovereign (Endurance)'
    };

    return {
        stats,
        avgStat,
        powerLevel,
        overallGrade,
        dominantSpecialty: `${topStat.icon} ${specialtyMap[topStat.key] || topStat.name}`,
        level: rankInfo?.level || 1,
        tierName: rankInfo?.tierName || 'Initiate',
        workStyle: rankInfo?.workStyle || 'Tactician',
        rankTitle: rankInfo?.title || 'Initiate Tactician'
    };
}

let activePowerMatrixData = null;
let activePowerMatrixPinnedKey = null;

function renderRPGAbilitiesCard(abilities) {
    activePowerMatrixData = abilities;
    activePowerMatrixPinnedKey = null;

    const stats = abilities.stats;
    const vbW = 440, vbH = 360;
    const cx = 220, cy = 180, maxR = 116;
    const angles = [-90, -30, 30, 90, 150, 210].map(deg => (deg * Math.PI) / 180);

    const rings = [0.25, 0.5, 0.75, 1.0].map(scale => {
        const pts = angles.map(a => `${(cx + Math.cos(a) * maxR * scale).toFixed(1)},${(cy + Math.sin(a) * maxR * scale).toFixed(1)}`).join(' ');
        return `<polygon points="${pts}" fill="${scale === 1 ? 'rgba(15,23,42,0.35)' : 'none'}" stroke="${scale === 1 ? 'rgba(251,191,36,0.32)' : 'rgba(148,163,184,0.18)'}" stroke-width="${scale === 1 ? '1.4' : '1'}" ${scale === 1 ? 'stroke-dasharray="none"' : 'stroke-dasharray="3,3"'} />`;
    }).join('');

    const axes = stats.map((st, i) => {
        const a = angles[i];
        const x2 = (cx + Math.cos(a) * maxR).toFixed(1);
        const y2 = (cy + Math.sin(a) * maxR).toFixed(1);
        return `<line id="power-matrix-axis-${st.key}" data-stat="${st.key}" class="power-matrix-axis" style="--active-stat-color:${st.color}" x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="rgba(148,163,184,0.28)" stroke-width="1.25" stroke-linecap="round" />`;
    }).join('');

    const dataCoords = stats.map((st, i) => {
        const ratio = Math.max(0.14, Math.min(1, st.val / 99));
        const x = cx + Math.cos(angles[i]) * maxR * ratio;
        const y = cy + Math.sin(angles[i]) * maxR * ratio;
        const labelR = maxR + 40;
        const lx = cx + Math.cos(angles[i]) * labelR;
        const ly = cy + Math.sin(angles[i]) * labelR;
        return { x, y, lx, ly, st, i, g: getStatGrade(st.val) };
    });

    const dataPolygonPts = dataCoords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

    const interactiveNodes = dataCoords.map(c => {
        const vx = c.x.toFixed(1), vy = c.y.toFixed(1);
        const lx = c.lx.toFixed(1), ly = c.ly.toFixed(1);
        const pillX = (c.lx - 34).toFixed(1), pillY = (c.ly - 17).toFixed(1);
        const key = c.st.key;
        return `<g class="power-matrix-node-group" data-stat="${key}" style="--stat-color:${c.st.color}" tabindex="0" role="button" aria-label="${c.st.name} (${key}) ${c.g.grade}${c.st.val} out of 99" onmouseenter="handlePowerMatrixNodeHover('${key}', event)" onmouseleave="handlePowerMatrixNodeLeave('${key}', event)" onclick="handlePowerMatrixNodeTap('${key}', event)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();handlePowerMatrixNodeTap('${key}', event);}"><circle class="power-matrix-dot-halo" cx="${vx}" cy="${vy}" r="12" fill="${c.st.color}" fill-opacity="0.28" stroke="${c.st.color}" stroke-width="1.5" /><circle class="power-matrix-dot" cx="${vx}" cy="${vy}" r="6" fill="${c.st.color}" stroke="#0f172a" stroke-width="2" /><circle cx="${vx}" cy="${vy}" r="20" fill="transparent" /><rect class="power-matrix-label-pill" x="${pillX}" y="${pillY}" width="68" height="34" rx="8" fill="rgba(15,23,42,0.92)" stroke="rgba(148,163,184,0.28)" stroke-width="1.2" /><text x="${lx}" y="${(c.ly - 6).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#f8fafc" font-size="11" font-weight="900" font-family="monospace">${c.st.icon} ${key}</text><text x="${lx}" y="${(c.ly + 8.5).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="${c.st.color}" font-size="10.5" font-weight="800" font-family="monospace">${c.g.grade}${c.st.val}<tspan fill="#64748b" font-size="8.5">/99</tspan></text></g>`;
    }).join('');

    const og = abilities.overallGrade;
    const matrixCrest = renderClassCrest(abilities.role || viewedUser, abilities.topStats || [abilities.topStat?.key || 'DEX'], abilities.level || 1, 42);
    return `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-800/90">
            <div class="flex items-center gap-3 min-w-0">
                <div class="shrink-0 p-1 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-center">${matrixCrest}</div>
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-sm sm:text-base font-black uppercase tracking-wider text-slate-100">⚡ Power Matrix</span>
                        <span class="text-[10px] font-black font-mono px-2 py-0.5 rounded" style="background:${og.bg};color:${og.color};border:1px solid ${og.border}">CLASS ${og.grade} • AVG ${abilities.avgStat}</span>
                    </div>
                    <div class="text-[11px] text-slate-300 font-semibold mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span class="text-amber-300 font-bold">Lvl ${abilities.level} • ${escapeHtml(abilities.rankTitle)}</span>
                        <span class="text-slate-600">•</span>
                        <span class="text-amber-300/90">Specialty: ${abilities.dominantSpecialty}</span>
                    </div>
                </div>
            </div>
            <div class="bg-slate-950/90 border border-amber-500/40 rounded-xl px-3.5 py-1.5 text-left sm:text-right shrink-0">
                <div class="text-[9px] uppercase tracking-widest font-extrabold text-slate-400">Combat Power Level</div>
                <div class="text-base sm:text-lg font-black font-mono text-amber-400">⚡ ${abilities.powerLevel.toLocaleString()} <span class="text-[10px] text-amber-200/80">PWR</span></div>
            </div>
        </div>
        <div id="power-matrix-stage" class="power-matrix-stage bg-slate-950/70 rounded-2xl border border-slate-800/90 p-2 sm:p-4 flex flex-col items-center justify-center" onclick="handlePowerMatrixStageClick(event)">
            <svg id="power-matrix-svg" viewBox="0 0 ${vbW} ${vbH}" class="w-full max-w-[560px] h-auto select-none overflow-visible">
                <defs>
                    <radialGradient id="abilityRadarGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.50" />
                        <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.22" />
                    </radialGradient>
                </defs>
                ${rings}
                ${axes}
                <circle cx="${cx}" cy="${cy}" r="2.5" fill="rgba(251,191,36,0.55)" />
                <polygon points="${dataPolygonPts}" fill="url(#abilityRadarGrad)" stroke="#fbbf24" stroke-width="2.4" stroke-linejoin="round" />
                ${interactiveNodes}
            </svg>
            <div class="text-[10px] font-mono text-slate-400 text-center mt-1 flex items-center justify-center gap-1.5">
                <span>✨ Hover or tap any stat node for live breakdown &amp; leveling guide</span>
            </div>
            <div id="power-matrix-tooltip" class="power-matrix-tooltip hidden p-3.5 text-left" role="tooltip" onclick="event.stopPropagation()"></div>
        </div>
    `;
}

function getPowerMatrixStatCoords(statKey) {
    if (!activePowerMatrixData || !Array.isArray(activePowerMatrixData.stats)) return null;
    const idx = activePowerMatrixData.stats.findIndex(s => s.key === statKey);
    if (idx === -1) return null;
    const st = activePowerMatrixData.stats[idx];
    const vbW = 440, vbH = 360;
    const cx = 220, cy = 180, maxR = 116;
    const angle = ([-90, -30, 30, 90, 150, 210][idx] * Math.PI) / 180;
    const ratio = Math.max(0.14, Math.min(1, st.val / 99));
    const vx = cx + Math.cos(angle) * maxR * ratio;
    const vy = cy + Math.sin(angle) * maxR * ratio;
    return { st, idx, vx, vy, vbW, vbH, g: getStatGrade(st.val) };
}

function renderPowerMatrixTooltip(statKey) {
    const stage = $('power-matrix-stage');
    const tooltip = $('power-matrix-tooltip');
    if (!stage || !tooltip) return;

    const info = getPowerMatrixStatCoords(statKey);
    if (!info) {
        hidePowerMatrixTooltip();
        return;
    }

    const { st, vx, vy, vbW, vbH, g } = info;

    stage.classList.add('has-active-stat');
    stage.querySelectorAll('.power-matrix-node-group').forEach(el => {
        el.classList.toggle('is-active', el.getAttribute('data-stat') === statKey);
    });
    stage.querySelectorAll('.power-matrix-axis').forEach(el => {
        const isMatch = el.getAttribute('data-stat') === statKey;
        el.classList.toggle('is-active', isMatch);
        el.setAttribute('stroke', isMatch ? st.color : 'rgba(148,163,184,0.28)');
    });

    tooltip.style.setProperty('--tooltip-accent', st.color);
    tooltip.style.border = `1.5px solid ${st.color}`;
    tooltip.innerHTML = `
        <div class="space-y-2">
            <div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                <div class="text-xs font-black text-slate-100 leading-tight">
                    <span>${st.icon} ${st.key} (${st.name})</span>
                    <span class="text-slate-400"> — </span>
                    <span class="font-mono" style="color:${g.color}">${g.grade}${st.val} / 99</span>
                </div>
                <button type="button" onclick="hidePowerMatrixTooltip(event)" class="text-slate-500 hover:text-slate-200 text-xs font-bold px-1 leading-none sm:hidden" aria-label="Close tooltip">✕</button>
            </div>
            <div class="text-[11px] font-mono font-bold px-2 py-1 rounded-lg bg-slate-900/95 border border-slate-800 text-amber-300">
                ${st.detail}
            </div>
            <p class="text-[11px] text-slate-300 leading-snug">
                ${st.description}
            </p>
            <div class="text-[11px] font-semibold leading-snug p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200">
                ${st.actionGuide}
            </div>
        </div>
    `;
    tooltip.classList.remove('hidden');

    const stageRect = stage.getBoundingClientRect();
    const svgEl = $('power-matrix-svg');
    const svgRect = svgEl ? svgEl.getBoundingClientRect() : stageRect;

    const nodeX = (svgRect.left - stageRect.left) + (vx / vbW) * svgRect.width;
    const nodeY = (svgRect.top - stageRect.top) + (vy / vbH) * svgRect.height;

    const ttW = tooltip.offsetWidth || 280;
    const ttH = tooltip.offsetHeight || 165;
    const pad = 10;

    let left = nodeX - (ttW / 2);
    if (vx < vbW * 0.45) {
        left = nodeX + 18;
    } else if (vx > vbW * 0.55) {
        left = nodeX - ttW - 18;
    }
    left = Math.max(pad, Math.min(stageRect.width - ttW - pad, left));

    let top = vy <= vbH * 0.52 ? (nodeY + 18) : (nodeY - ttH - 18);
    if (top + ttH > stageRect.height - pad) {
        top = Math.max(pad, nodeY - ttH - 16);
    }
    if (top < pad) {
        top = Math.min(stageRect.height - ttH - pad, nodeY + 16);
    }
    top = Math.max(pad, Math.min(stageRect.height - ttH - pad, top));

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
}

function hidePowerMatrixTooltip(evt) {
    if (evt && evt.stopPropagation) evt.stopPropagation();
    activePowerMatrixPinnedKey = null;
    const stage = $('power-matrix-stage');
    const tooltip = $('power-matrix-tooltip');
    if (tooltip) tooltip.classList.add('hidden');
    if (stage) {
        stage.classList.remove('has-active-stat');
        stage.querySelectorAll('.power-matrix-node-group').forEach(el => el.classList.remove('is-active'));
        stage.querySelectorAll('.power-matrix-axis').forEach(el => {
            el.classList.remove('is-active');
            el.setAttribute('stroke', 'rgba(148,163,184,0.28)');
        });
    }
}

function handlePowerMatrixNodeHover(statKey, evt) {
    if (evt && evt.sourceCapabilities && evt.sourceCapabilities.firesTouchEvents) return;
    if (activePowerMatrixPinnedKey && activePowerMatrixPinnedKey !== statKey) return;
    renderPowerMatrixTooltip(statKey);
}

function handlePowerMatrixNodeLeave(statKey, evt) {
    if (activePowerMatrixPinnedKey) return;
    hidePowerMatrixTooltip(evt);
}

function handlePowerMatrixNodeTap(statKey, evt) {
    if (evt && evt.stopPropagation) evt.stopPropagation();
    if (activePowerMatrixPinnedKey === statKey) {
        hidePowerMatrixTooltip();
    } else {
        activePowerMatrixPinnedKey = statKey;
        renderPowerMatrixTooltip(statKey);
    }
}

function handlePowerMatrixStageClick(evt) {
    if (!evt.target.closest('.power-matrix-node-group') && !evt.target.closest('#power-matrix-tooltip')) {
        hidePowerMatrixTooltip();
    }
}

if (typeof document !== 'undefined') {
    document.addEventListener('click', (evt) => {
        if (!activePowerMatrixPinnedKey) return;
        if (!evt.target.closest('.power-matrix-node-group') && !evt.target.closest('#power-matrix-tooltip')) {
            hidePowerMatrixTooltip();
        }
    });
    document.addEventListener('touchstart', (evt) => {
        if (!activePowerMatrixPinnedKey) return;
        if (!evt.target.closest('.power-matrix-node-group') && !evt.target.closest('#power-matrix-tooltip')) {
            hidePowerMatrixTooltip();
        }
    }, { passive: true });
}

function openRankRoadmapModal(targetUser, evt) {
    if (evt && evt.stopPropagation) evt.stopPropagation();
    const u = targetUser || viewedUser || loggedInUser;
    const dispName = escapeHtml(getUserDisplayName(u));
    const pwr = duoPresenceData[u]?.powerScore || 0;
    const uLogs = duoPresenceData[u]?.logs || (u === viewedUser ? currentRawLogsCache : []);
    const s = (u === loggedInUser) ? userSettings : (spectatorSettings || duoPresenceData[u]?.settings || {});
    const rankInfo = getRankDetails(pwr, uLogs, u, s);
    const abilities = calculateRPGAbilities(uLogs, s, pwr, rankInfo);
    const sortedKeys = [...abilities.stats].sort((a, b) => b.val - a.val).map(x => x.key);
    const crestStats = rankInfo.topStats && rankInfo.topStats.length > 0 ? rankInfo.topStats : sortedKeys;
    const crestSvg = renderClassCrest(rankInfo.role, crestStats, rankInfo.level, 52);

    const sumEl = $('rank-modal-summary');
    if (sumEl) {
        let nextStr = rankInfo.nextThreshold !== null
            ? `${pwr.toLocaleString()} / ${rankInfo.nextThreshold.toLocaleString()} EXP (${rankInfo.neededPWR.toLocaleString()} EXP to Lvl ${rankInfo.level + 1})`
            : '1,000,000 / 1,000,000 EXP (Maximum Level 👑)';
        sumEl.innerHTML = `
            <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                    <img src="${s.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${u}`}" alt="${dispName}" class="w-12 h-12 rounded-xl border border-slate-700 shrink-0">
                    <div class="shrink-0 flex items-center justify-center p-1 rounded-xl bg-slate-950/90 border border-slate-800" title="${rankInfo.roleLabel} (${rankInfo.domain} Domain)">${crestSvg}</div>
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-black text-sm text-slate-100">${dispName}</span>
                            <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">Lvl ${rankInfo.level}</span>
                            <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 uppercase">${rankInfo.roleLabel} • ${rankInfo.domain}</span>
                        </div>
                        <div class="text-xs font-bold theme-accent-text truncate">${rankInfo.tierName} • ${rankInfo.hybridTitle}</div>
                    </div>
                </div>
                <div class="text-right shrink-0">
                    <div class="text-xl font-black text-amber-400 font-mono">${pwr.toLocaleString()} <span class="text-xs text-slate-400">EXP</span></div>
                    <div class="text-[10px] text-slate-400 font-mono">${Math.round(rankInfo.progressPct)}% to Lvl ${Math.min(100, rankInfo.level + 1)}</div>
                </div>
            </div>
            <div class="space-y-1">
                <div class="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-700/80 p-[1px]">
                    <div class="theme-accent-bg h-full rounded-full transition-all duration-500" style="width: ${Math.min(100, Math.max(0, rankInfo.progressPct))}%"></div>
                </div>
                <div class="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>Lvl ${rankInfo.level} (${rankInfo.tierName})</span>
                    <span>${nextStr}</span>
                </div>
            </div>
        `;
    }

    const abilitiesEl = $('rank-modal-abilities-card');
    if (abilitiesEl) {
        abilities.role = rankInfo.role;
        abilities.topStats = crestStats;
        abilitiesEl.innerHTML = renderRPGAbilitiesCard(abilities);
    }

    const styleEl = $('rank-modal-style-card');
    if (styleEl) {
        const ws = WORK_STYLE_INFO[rankInfo.workStyle] || WORK_STYLE_INFO['Grand Virtuoso'];
        const avgQStr = rankInfo.avgQuality30d > 0 ? rankInfo.avgQuality30d.toFixed(1) : '3.0';
        const avgEStr = rankInfo.avgEffort30d > 0 ? rankInfo.avgEffort30d.toFixed(1) : '3.0';
        const miniCrest = renderClassCrest(rankInfo.role, crestStats, rankInfo.level, 40);
        styleEl.innerHTML = `
            <div class="flex items-start justify-between gap-3">
                <div class="flex items-start gap-2.5 min-w-0">
                    <div class="p-1 rounded-xl bg-slate-950/90 border border-amber-500/30 flex items-center justify-center shrink-0">${miniCrest}</div>
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-xs font-black text-slate-100 uppercase tracking-wider">Hybrid Class: <span class="theme-accent-text">${rankInfo.workStyle}</span></span>
                            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">${ws.combo || 'Hybrid'} • ${avgQStr} Q / ${avgEStr} E</span>
                        </div>
                        <div class="text-[11px] font-semibold text-amber-400/90 mt-0.5">${ws.tagline}</div>
                        <p class="text-[11px] text-slate-400 leading-snug mt-0.5">${ws.desc}</p>
                    </div>
                </div>
            </div>
        `;
    }

    const listEl = $('rank-roadmap-list');
    if (listEl) {
        let itemsHtml = '';
        const currentTierIdx = Math.min(9, Math.floor((rankInfo.level - 1) / 10));
        for (let i = 0; i < RANK_TIER_BANDS.length; i++) {
            const band = RANK_TIER_BANDS[i];
            const tierNum = i + 1;
            const rTitle = `${band.tier} ${rankInfo.workStyle}`;
            const startExp = RANK_THRESHOLDS[band.min - 1];
            const isActive = (i === currentTierIdx);
            const isUnlocked = (i <= currentTierIdx);

            let cardClass = 'p-3 rounded-xl border flex items-center justify-between text-xs transition-all ';
            let badgeHtml = '';
            if (isActive) {
                cardClass += 'bg-amber-500/15 border-amber-500/80 shadow-md';
                badgeHtml = `<span class="text-[9px] font-extrabold px-2 py-0.5 rounded bg-amber-500 text-slate-950 uppercase shrink-0">Active (Lvl ${rankInfo.level})</span>`;
            } else if (isUnlocked) {
                cardClass += 'bg-slate-900/60 border-slate-800 text-slate-200';
                badgeHtml = '<span class="text-[10px] text-emerald-400 font-bold shrink-0">✓ Unlocked</span>';
            } else {
                cardClass += 'bg-slate-950/40 border-slate-900/80 text-slate-500';
                badgeHtml = '<span class="text-[10px] text-slate-600 shrink-0">🔒 Locked</span>';
            }

            itemsHtml += `
                <div id="roadmap-tier-item-${tierNum}" class="${cardClass}">
                    <div class="flex items-center gap-3 min-w-0 pr-2">
                        <span class="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 ${isActive ? 'text-amber-400 border-amber-500/40' : (isUnlocked ? 'text-slate-300' : 'text-slate-600')} shrink-0">Lvls ${band.min}–${band.max}</span>
                        <div class="min-w-0">
                            <div class="font-extrabold truncate ${isActive ? 'text-white' : ''}">${rTitle}</div>
                            <div class="text-[10px] text-slate-500 font-mono">Tier ${tierNum} • ${band.tier}</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2.5 shrink-0">
                        <span class="font-mono text-[11px] ${isActive ? 'text-amber-300 font-extrabold' : 'text-slate-400'}">${startExp.toLocaleString()}+ EXP</span>
                        ${badgeHtml}
                    </div>
                </div>
            `;
        }
        listEl.innerHTML = itemsHtml;

        setTimeout(() => {
            const activeItem = $(`roadmap-tier-item-${currentTierIdx + 1}`);
            if (activeItem) {
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }

    $('rank-roadmap-modal').classList.remove('hidden');
}

function closeRankRoadmapModal() {
    hidePowerMatrixTooltip();
    $('rank-roadmap-modal').classList.add('hidden');
}

