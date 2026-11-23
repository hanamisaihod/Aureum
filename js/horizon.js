// ============================================================================
// AUREUM — Horizon Analytics & Forecasting Engine
// ============================================================================
// Pure forecast/aggregation helpers plus vanilla SVG renderers. The math block
// has zero DOM dependencies and can be required directly from Node unit tests
// (see tests/horizon.test.js). Everything visual is rendered into #view-horizon
// only — the sidebar and Chronicle no longer own any charts or insight cards.

const HORIZON_SCOPE_KEYS = ['North', 'Cream', 'Duo'];

const HORIZON_DURATION_BANDS = [
    { key: 'micro', name: 'Micro', label: '< 20m', min: 0, max: 20 },
    { key: 'standard', name: 'Standard', label: '20–35m', min: 20, max: 35 },
    { key: 'extended', name: 'Extended', label: '35–55m', min: 35, max: 55 },
    { key: 'deep', name: 'Deep Block', label: '55–85m', min: 55, max: 85 },
    { key: 'marathon', name: 'Marathon', label: '85m+', min: 85, max: Infinity }
];

// Follow the active user by default; an explicit toggle pins North/Cream/Duo.
let horizonUserSelection = null;
let _horizonTooltipBound = false;

// Node test harness: make the shared chore engine reachable without a browser.
if (typeof calculateChoreMultiplier === 'undefined' && typeof require === 'function') {
    try {
        const _choreEngine = require('./choreMultiplier.js');
        globalThis.calculateChoreMultiplier = _choreEngine.calculateChoreMultiplier;
        globalThis.calculateMonthlyAllowanceBreakdown = _choreEngine.calculateMonthlyAllowanceBreakdown;
        globalThis.sumMonthlyChoreHours = _choreEngine.sumMonthlyChoreHours;
        globalThis.CHORE_TIER_STEP_HOURS = _choreEngine.CHORE_TIER_STEP_HOURS;
        globalThis.CHORE_TIER_BONUS_RATE = _choreEngine.CHORE_TIER_BONUS_RATE;
        globalThis.CHORE_MAX_TIER = _choreEngine.CHORE_MAX_TIER;
    } catch (e) {}
}

function resetHorizonUserSelection() {
    horizonUserSelection = null;
}

function _horizonRound2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function _horizonNumber(value, fallback) {
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function _horizonClamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function _horizonToDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') {
        const d = value.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    }
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

function _horizonLogDate(log) {
    if (!log || typeof log !== 'object') return null;
    return _horizonToDate(log.timestamp) || _horizonToDate(log.date) || _horizonToDate(log.createdAt);
}

function _horizonChoreTier(hours) {
    if (typeof calculateChoreMultiplier === 'function') return calculateChoreMultiplier(hours);
    const safe = Math.max(0, _horizonNumber(hours, 0));
    const tier = Math.min(Math.floor(safe / 10), 5);
    return {
        tier,
        bonusRate: tier * 0.05,
        multiplier: 1 + tier * 0.05,
        bonusPercent: `${tier * 5}%`,
        totalHours: safe,
        isMaxTier: tier >= 5
    };
}

function _horizonFormatHour(hour) {
    const h = ((Math.round(hour) % 24) + 24) % 24;
    const suffix = h >= 12 ? 'PM' : 'AM';
    const display = h % 12 === 0 ? 12 : h % 12;
    return `${display}:00 ${suffix}`;
}

/**
 * Builds the month-to-date earning trajectory plus the dashed month-end
 * projection shown in the Horizon hero chart.
 *
 * - Cumulative actual payout applies the currently unlocked chore tier
 *   retroactively to the whole month (matching the allowance card).
 * - Pace is base-allowance-per-elapsed-day and chore-hours-per-elapsed-day.
 * - Month-end projection uses `projectedChoreHours` -> projected tier bonus.
 * - `monthlyAllowanceLimit` (target × max bonus cap %) is a hard ceiling.
 *
 * @param {Array<Object>} rawLogs
 * @param {Object} settings
 * @param {Date} [nowDate]
 * @returns {Object}
 */
function buildMonthlyTrajectory(rawLogs, settings, nowDate = new Date()) {
    const now = (nowDate instanceof Date && !isNaN(nowDate.getTime())) ? nowDate : new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Day 1 is always a valid denominator — brand-new months never divide by zero.
    const dayOfMonth = _horizonClamp(now.getDate(), 1, daysInMonth);
    const elapsedDays = dayOfMonth;
    const remainingDays = Math.max(0, daysInMonth - dayOfMonth);

    const s = settings || {};
    const weeklyHours = _horizonNumber(s.weeklyHours, 0) > 0 ? _horizonNumber(s.weeklyHours, 0) : 10;
    const monthlyCash = _horizonNumber(s.monthlyCash, 0) > 0 ? _horizonNumber(s.monthlyCash, 0) : 8000;
    const bonusCapPct = _horizonNumber(s.maxBonusCapPct, 0) > 0 ? _horizonNumber(s.maxBonusCapPct, 0) : 125;
    const targetPoints = weeklyHours * 12;
    const pointRate = targetPoints > 0 ? monthlyCash / targetPoints : 0;
    const monthlyLimit = monthlyCash * (bonusCapPct / 100);

    const dailyPoints = new Array(daysInMonth).fill(0);
    const dailyWorkHours = new Array(daysInMonth).fill(0);
    const dailyChoreHours = new Array(daysInMonth).fill(0);

    const source = Array.isArray(rawLogs) ? rawLogs : [];
    for (let i = 0; i < source.length; i++) {
        const log = source[i];
        if (!log || typeof log !== 'object') continue;
        const d = _horizonLogDate(log);
        if (!d || d.getFullYear() !== year || d.getMonth() !== month) continue;
        const idx = _horizonClamp(d.getDate(), 1, daysInMonth) - 1;
        if (log.type === 'work') {
            dailyPoints[idx] += Math.max(0, _horizonNumber(log.points, 0));
            dailyWorkHours[idx] += Math.max(0, _horizonNumber(log.hours, 0));
        } else if (log.type === 'chore') {
            dailyChoreHours[idx] += Math.max(0, _horizonNumber(log.hours, 0));
        }
    }

    let pointsToDate = 0, workHoursToDate = 0, choreHoursToDate = 0;
    for (let i = 0; i < elapsedDays; i++) {
        pointsToDate += dailyPoints[i];
        workHoursToDate += dailyWorkHours[i];
        choreHoursToDate += dailyChoreHours[i];
    }

    const currentTier = _horizonChoreTier(choreHoursToDate);
    const baseToDate = Math.min(pointsToDate * pointRate, monthlyLimit);
    const earnedSoFar = Math.min(monthlyLimit, baseToDate * currentTier.multiplier);

    const dailyPaceBase = elapsedDays > 0 ? baseToDate / elapsedDays : 0;
    const dailyPaceHours = elapsedDays > 0 ? workHoursToDate / elapsedDays : 0;
    const dailyPaceChore = elapsedDays > 0 ? choreHoursToDate / elapsedDays : 0;

    const projectedChoreHours = _horizonRound2(choreHoursToDate + (dailyPaceChore * remainingDays));
    const projectedTier = _horizonChoreTier(projectedChoreHours);
    const projectedBase = Math.min(monthlyLimit, baseToDate + (dailyPaceBase * remainingDays));
    const projectedTotalRaw = projectedBase * projectedTier.multiplier;
    const projectedTotal = Math.min(monthlyLimit, projectedTotalRaw);
    const payoutCapped = projectedTotalRaw > monthlyLimit + 0.005;

    const cumulativeBase = new Array(daysInMonth).fill(0);
    const cumulativeActual = new Array(daysInMonth).fill(0);
    let runningPoints = 0;
    for (let i = 0; i < daysInMonth; i++) {
        runningPoints += dailyPoints[i];
        const base = Math.min(runningPoints * pointRate, monthlyLimit);
        cumulativeBase[i] = _horizonRound2(base);
        cumulativeActual[i] = _horizonRound2(Math.min(monthlyLimit, base * currentTier.multiplier));
    }

    // Dashed projection: starts at today and runs through the last day.
    const projectedBaseSeries = new Array(daysInMonth).fill(null);
    const projectedTotalSeries = new Array(daysInMonth).fill(null);
    const todayIdx = elapsedDays - 1;
    projectedBaseSeries[todayIdx] = _horizonRound2(baseToDate);
    projectedTotalSeries[todayIdx] = _horizonRound2(earnedSoFar);
    for (let step = 1; step <= remainingDays; step++) {
        const idx = todayIdx + step;
        const base = Math.min(monthlyLimit, baseToDate + (dailyPaceBase * step));
        projectedBaseSeries[idx] = _horizonRound2(base);
        projectedTotalSeries[idx] = _horizonRound2(Math.min(monthlyLimit, base * projectedTier.multiplier));
    }

    const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return {
        year,
        month,
        monthLabel,
        daysInMonth,
        dayOfMonth,
        elapsedDays,
        remainingDays,
        weeklyHours,
        monthlyCash,
        bonusCapPct,
        targetPoints,
        pointRate,
        monthlyLimit: _horizonRound2(monthlyLimit),
        currentTier,
        projectedTier,
        dailyPoints,
        dailyWorkHours,
        dailyChoreHours,
        cumulativeBase,
        cumulativeActual,
        projectedBaseSeries,
        projectedTotalSeries,
        pointsToDate: _horizonRound2(pointsToDate),
        workHoursToDate: _horizonRound2(workHoursToDate),
        choreHoursToDate: _horizonRound2(choreHoursToDate),
        baseToDate: _horizonRound2(baseToDate),
        earnedSoFar: _horizonRound2(earnedSoFar),
        dailyPaceBase: _horizonRound2(dailyPaceBase),
        dailyPaceHours: _horizonRound2(dailyPaceHours),
        dailyPaceChore: _horizonRound2(dailyPaceChore),
        projectedChoreHours,
        projectedBase: _horizonRound2(projectedBase),
        projectedTotal: _horizonRound2(projectedTotal),
        payoutCapped,
        hasLogs: pointsToDate > 0 || choreHoursToDate > 0
    };
}

/**
 * Merges two partner trajectories into a single Duo forecast. Each partner's
 * payout/limit stays independent; only the chart series and KPIs are summed.
 * @param {Object} a
 * @param {Object} b
 * @returns {Object}
 */
function mergeHorizonTrajectories(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    const len = Math.max(a.daysInMonth || 0, b.daysInMonth || 0);
    const sumSeries = (x, y) => Array.from({ length: len }, (_, i) => {
        const xv = Array.isArray(x) ? x[i] : null;
        const yv = Array.isArray(y) ? y[i] : null;
        if ((xv === null || xv === undefined) && (yv === null || yv === undefined)) return null;
        return _horizonRound2((xv || 0) + (yv || 0));
    });
    const sumScalar = (key) => _horizonRound2((_horizonNumber(a[key], 0)) + (_horizonNumber(b[key], 0)));
    const projectedChoreHours = sumScalar('projectedChoreHours');
    return {
        ...a,
        daysInMonth: len,
        monthlyCash: sumScalar('monthlyCash'),
        weeklyHours: sumScalar('weeklyHours'),
        monthlyLimit: sumScalar('monthlyLimit'),
        pointRate: _horizonRound2((_horizonNumber(a.pointRate, 0) + _horizonNumber(b.pointRate, 0)) / 2),
        dailyPoints: sumSeries(a.dailyPoints, b.dailyPoints),
        dailyWorkHours: sumSeries(a.dailyWorkHours, b.dailyWorkHours),
        dailyChoreHours: sumSeries(a.dailyChoreHours, b.dailyChoreHours),
        cumulativeBase: sumSeries(a.cumulativeBase, b.cumulativeBase),
        cumulativeActual: sumSeries(a.cumulativeActual, b.cumulativeActual),
        projectedBaseSeries: sumSeries(a.projectedBaseSeries, b.projectedBaseSeries),
        projectedTotalSeries: sumSeries(a.projectedTotalSeries, b.projectedTotalSeries),
        pointsToDate: sumScalar('pointsToDate'),
        workHoursToDate: sumScalar('workHoursToDate'),
        choreHoursToDate: sumScalar('choreHoursToDate'),
        baseToDate: sumScalar('baseToDate'),
        earnedSoFar: sumScalar('earnedSoFar'),
        dailyPaceBase: sumScalar('dailyPaceBase'),
        dailyPaceHours: sumScalar('dailyPaceHours'),
        dailyPaceChore: sumScalar('dailyPaceChore'),
        projectedChoreHours,
        projectedTier: _horizonChoreTier(projectedChoreHours),
        projectedBase: sumScalar('projectedBase'),
        projectedTotal: sumScalar('projectedTotal'),
        payoutCapped: Boolean(a.payoutCapped || b.payoutCapped),
        hasLogs: Boolean(a.hasLogs || b.hasLogs),
        isDuo: true
    };
}

/**
 * Groups work logs by hour of day (00:00–23:00) and finds the peak clarity
 * window (best 2–3 hour block by average quality, min 2 sessions) and the
 * high-strain window (largest effort-minus-quality gap, min 2 sessions).
 *
 * @param {Array<Object>} rawLogs
 * @returns {Object}
 */
function computeSweetSpot(rawLogs) {
    const hours = Array.from({ length: 24 }, (_, hour) => ({
        hour, count: 0, qualitySum: 0, effortSum: 0, workHours: 0, avgQuality: 0, avgEffort: 0
    }));

    const source = Array.isArray(rawLogs) ? rawLogs : [];
    for (let i = 0; i < source.length; i++) {
        const log = source[i];
        if (!log || log.type !== 'work') continue;
        const d = _horizonLogDate(log);
        if (!d) continue;
        const slot = hours[d.getHours()];
        slot.count += 1;
        slot.qualitySum += _horizonClamp(_horizonNumber(log.results, 3), 1, 5);
        slot.effortSum += _horizonClamp(_horizonNumber(log.effort, 3), 1, 5);
        slot.workHours += Math.max(0, _horizonNumber(log.hours, 0));
    }
    hours.forEach(slot => {
        if (slot.count > 0) {
            slot.avgQuality = _horizonRound2(slot.qualitySum / slot.count);
            slot.avgEffort = _horizonRound2(slot.effortSum / slot.count);
        }
        slot.workHours = _horizonRound2(slot.workHours);
    });

    let peakWindow = null, strainWindow = null;
    let peakQuality = -Infinity, strainGap = -Infinity;
    for (let length = 2; length <= 3; length++) {
        for (let start = 0; start + length <= 24; start++) {
            let count = 0, qualitySum = 0, effortSum = 0;
            for (let k = 0; k < length; k++) {
                const slot = hours[start + k];
                count += slot.count;
                qualitySum += slot.qualitySum;
                effortSum += slot.effortSum;
            }
            // A block must open on an active hour and hold at least two sessions.
            if (count < 2 || hours[start].count === 0) continue;
            const avgQuality = qualitySum / count;
            const avgEffort = effortSum / count;
            const candidate = {
                startHour: start,
                endHour: (start + length) % 24,
                length,
                count,
                avgQuality: _horizonRound2(avgQuality),
                avgEffort: _horizonRound2(avgEffort),
                gap: _horizonRound2(avgEffort - avgQuality)
            };
            const betterPeak = avgQuality > peakQuality + 1e-9
                || (Math.abs(avgQuality - peakQuality) <= 1e-9 && peakWindow && count > peakWindow.count);
            if (betterPeak) {
                peakQuality = avgQuality;
                peakWindow = candidate;
            }
            const betterStrain = candidate.gap > strainGap + 1e-9
                || (Math.abs(candidate.gap - strainGap) <= 1e-9 && strainWindow && count > strainWindow.count);
            if (betterStrain) {
                strainGap = candidate.gap;
                strainWindow = candidate;
            }
        }
    }

    if (strainWindow && strainWindow.gap <= 0) strainWindow = null;

    const totalSessions = hours.reduce((sum, slot) => sum + slot.count, 0);
    return { hours, peakWindow, strainWindow, totalSessions, hasData: totalSessions > 0 };
}

function _horizonDurationBandForMins(mins) {
    const value = Math.max(0, _horizonNumber(mins, 0));
    for (let i = 0; i < HORIZON_DURATION_BANDS.length; i++) {
        const band = HORIZON_DURATION_BANDS[i];
        if (value >= band.min && value < band.max) return band.key;
    }
    return HORIZON_DURATION_BANDS[HORIZON_DURATION_BANDS.length - 1].key;
}

function _horizonNearestWorkQuality(workLogs, timestampMs) {
    if (!Number.isFinite(timestampMs)) return null;
    let best = null, bestDelta = Infinity;
    for (let i = 0; i < workLogs.length; i++) {
        const d = _horizonLogDate(workLogs[i]);
        if (!d) continue;
        const delta = Math.abs(d.getTime() - timestampMs);
        if (delta < bestDelta) {
            bestDelta = delta;
            best = workLogs[i];
        }
    }
    if (!best || bestDelta > 45 * 60000) return null;
    const quality = _horizonNumber(best.results, null);
    return quality === null ? null : _horizonClamp(quality, 1, 5);
}

/**
 * Buckets completed focus sessions into duration bands and reports both the
 * session count and the average quality achieved per band.
 *
 * Primary source: `settings.completedPomoHistory` (quality attributed from the
 * nearest work log within 45 minutes). When Pomodoro history is sparse
 * (< 3 sessions) it falls back to work-log durations in minutes.
 *
 * @param {Array<Object>} rawLogs
 * @param {Array<Object>} pomoHistory
 * @returns {Object}
 */
function computeDurationDistribution(rawLogs, pomoHistory) {
    const sourceLogs = Array.isArray(rawLogs) ? rawLogs : [];
    const workLogs = sourceLogs.filter(log => log && log.type === 'work' && _horizonNumber(log.hours, 0) > 0);
    const pomoList = Array.isArray(pomoHistory) ? pomoHistory : [];
    const pomoSessions = [];
    for (let i = 0; i < pomoList.length; i++) {
        const entry = pomoList[i] || {};
        const mins = _horizonNumber(entry.durationSecs, 0) / 60;
        if (!(mins > 0)) continue;
        const tsDate = _horizonToDate(entry.timestamp) || _horizonToDate(entry.completedAt) || _horizonToDate(entry.date);
        pomoSessions.push({ mins, timestampMs: tsDate ? tsDate.getTime() : NaN });
    }

    const usePomodoro = pomoSessions.length >= 3;
    const sessions = usePomodoro
        ? pomoSessions.map(s => ({ mins: s.mins, quality: _horizonNearestWorkQuality(workLogs, s.timestampMs) }))
        : workLogs.map(log => ({
            mins: Math.max(0, _horizonNumber(log.hours, 0)) * 60,
            quality: _horizonClamp(_horizonNumber(log.results, 3), 1, 5)
        }));

    const buckets = HORIZON_DURATION_BANDS.map(band => ({
        key: band.key, name: band.name, label: band.label, min: band.min, max: band.max,
        count: 0, qualitySum: 0, qualityCount: 0, avgQuality: null
    }));
    const byKey = buckets.reduce((map, bucket) => { map[bucket.key] = bucket; return map; }, {});

    sessions.forEach(session => {
        const bucket = byKey[_horizonDurationBandForMins(session.mins)];
        if (!bucket) return;
        bucket.count += 1;
        if (session.quality !== null && Number.isFinite(session.quality)) {
            bucket.qualitySum += session.quality;
            bucket.qualityCount += 1;
        }
    });

    const totalSessions = sessions.length;
    buckets.forEach(bucket => {
        if (bucket.qualityCount > 0) bucket.avgQuality = _horizonRound2(bucket.qualitySum / bucket.qualityCount);
        bucket.sharePct = totalSessions > 0 ? _horizonRound2((bucket.count / totalSessions) * 100) : 0;
    });

    let mostPicked = null, bestQuality = null;
    buckets.forEach(bucket => {
        if (bucket.count > 0 && (!mostPicked || bucket.count > mostPicked.count)) mostPicked = bucket;
        if (bucket.count > 0 && bucket.avgQuality !== null && (!bestQuality || bucket.avgQuality > bestQuality.avgQuality)) bestQuality = bucket;
    });

    return {
        source: usePomodoro ? 'pomodoro' : 'worklogs',
        totalSessions,
        buckets,
        mostPicked,
        bestQuality,
        hasData: totalSessions > 0
    };
}


// ============================================================================
// RENDER LAYER — scope resolution, KPI pills & vanilla SVG charts
// ============================================================================

function _horizonEscape(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _horizonBaht(value) {
    return `฿${Math.round(_horizonNumber(value, 0)).toLocaleString()}`;
}

function _horizonReadSpectatorSettings() {
    try {
        return (typeof spectatorSettings !== 'undefined' && spectatorSettings) ? spectatorSettings : null;
    } catch (e) {
        return null;
    }
}

function getHorizonUserSelection() {
    return HORIZON_SCOPE_KEYS.includes(horizonUserSelection) ? horizonUserSelection : null;
}

function getHorizonScope() {
    return getHorizonUserSelection() || (typeof viewedUser !== 'undefined' && viewedUser ? viewedUser : 'North');
}

/**
 * Resolves the settings used for a Horizon scope, filling peer documents with
 * the current user's defaults so missing keys never break the forecast.
 */
function _horizonResolveSettings(userKey) {
    const base = (typeof userSettings !== 'undefined' && userSettings) ? userSettings : {};
    const login = (typeof loggedInUser !== 'undefined') ? loggedInUser : null;
    const viewing = (typeof viewedUser !== 'undefined') ? viewedUser : null;
    const key = userKey === 'Duo' ? getHorizonScope() : userKey;
    if (key === login) return base;
    const peer = (typeof duoPresenceData !== 'undefined' && duoPresenceData && duoPresenceData[key])
        ? duoPresenceData[key].settings
        : null;
    if (peer && Object.keys(peer).length > 0) return { ...base, ...peer };
    const spectator = _horizonReadSpectatorSettings();
    if (spectator && key === viewing) return { ...base, ...spectator };
    return base;
}

function _horizonResolveLogs(userKey) {
    const globalLogs = (typeof globalAllLogsCache !== 'undefined' && Array.isArray(globalAllLogsCache)) ? globalAllLogsCache : [];
    const localLogs = (typeof currentRawLogsCache !== 'undefined' && Array.isArray(currentRawLogsCache)) ? currentRawLogsCache : [];
    if (userKey === 'Duo') return globalLogs.length > 0 ? globalLogs : localLogs;
    const scoped = globalLogs.filter(log => log && log.user === userKey);
    if (scoped.length > 0) return scoped;
    if (typeof viewedUser !== 'undefined' && userKey === viewedUser) return localLogs;
    return [];
}

function _horizonResolvePomoHistory(scope) {
    const collect = (settings) => (settings && Array.isArray(settings.completedPomoHistory)) ? settings.completedPomoHistory : [];
    if (scope === 'Duo') {
        return [
            ...collect(_horizonResolveSettings('North')),
            ...collect(_horizonResolveSettings('Cream'))
        ];
    }
    return collect(_horizonResolveSettings(scope));
}


function _renderHorizonScope(scope) {
    const badge = $('horizon-scope-badge');
    if (badge) {
        badge.innerText = scope === 'Duo' ? 'Duo Combined' : scope;
        badge.className = scope === 'Duo'
            ? 'text-[10px] font-mono font-extrabold px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30'
            : 'text-[10px] font-mono font-extrabold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30';
    }
    HORIZON_SCOPE_KEYS.forEach(key => {
        const btn = $(`horizon-scope-${key.toLowerCase()}`);
        if (!btn) return;
        const active = key === scope;
        btn.className = `horizon-scope-btn${active ? ' is-active' : ''}`;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function renderHorizonKpis(trajectory, scope) {
    const row = $('horizon-kpi-row');
    if (!row || !trajectory) return;
    const tier = trajectory.projectedTier || _horizonChoreTier(0);
    const tierLabel = tier.tier > 0 ? `Tier ${tier.tier} · +${tier.bonusPercent}` : 'Tier 0 · +0%';
    const pills = [
        {
            id: 'earned', icon: '💰', label: 'Earned So Far', value: _horizonBaht(trajectory.earnedSoFar),
            sub: `${formatHours(trajectory.workHoursToDate)}h work · ${formatHours(trajectory.choreHoursToDate)}h chores`, tone: 'emerald'
        },
        {
            id: 'projected', icon: '🌅', label: 'Projected Month-End', value: _horizonBaht(trajectory.projectedTotal),
            sub: `Base ${_horizonBaht(trajectory.projectedBase)}${trajectory.payoutCapped ? ' · capped' : ''}`, tone: 'violet'
        },
        {
            id: 'pace', icon: '⚡', label: 'Current Pace / Day', value: _horizonBaht(trajectory.dailyPaceBase),
            sub: `${formatHours(trajectory.dailyPaceHours)}h work · ${formatHours(trajectory.dailyPaceChore)}h chores`, tone: 'amber'
        },
        {
            id: 'tier', icon: '🧹', label: 'Projected Chore Tier', value: tierLabel,
            sub: `${formatHours(trajectory.projectedChoreHours)}h projected chores`, tone: 'sky'
        }
    ];
    row.innerHTML = pills.map(pill => `
        <div class="horizon-kpi" data-tone="${pill.tone}" id="horizon-kpi-${pill.id}">
            <div class="horizon-kpi-label"><span aria-hidden="true">${pill.icon}</span> ${_horizonEscape(pill.label)}</div>
            <div class="horizon-kpi-value">${_horizonEscape(pill.value)}</div>
            <div class="horizon-kpi-sub">${_horizonEscape(pill.sub)}</div>
        </div>`).join('');

    const caption = $('horizon-trajectory-caption');
    if (caption) {
        caption.innerText = `${trajectory.monthLabel} · Day ${trajectory.dayOfMonth} of ${trajectory.daysInMonth}${scope === 'Duo' ? ' · combined ledgers' : ` · ${scope}`}`;
    }
    const note = $('horizon-trajectory-note');
    if (note) {
        const capNote = trajectory.payoutCapped
            ? ` · projection capped at ${_horizonBaht(trajectory.monthlyLimit)} (target × max bonus cap)`
            : '';
        note.innerText = `Pace projects ${formatHours(trajectory.projectedChoreHours)}h chores by month end → ${tierLabel}. `
            + `Projected payout = ${_horizonBaht(trajectory.projectedBase)} base × ${(tier.multiplier || 1).toFixed(2)}${capNote}.`;
    }
}

const HORIZON_CHART_W = 760;      // fallback width when the shell cannot be measured
const HORIZON_CHART_MIN_W = 300;  // keep the plot legible on very narrow phones

/**
 * Measures the live CSS pixel width of a Horizon chart shell. The SVG viewBox
 * is pinned to that width so one unit equals one CSS pixel. Without this the
 * fixed 760-unit viewBox gets scaled down inside the half-width sweet-spot and
 * duration cards, shrinking 9px axis labels to roughly 5px on screen.
 * @param {HTMLElement|null} target
 * @returns {number}
 */
function _horizonChartWidth(target) {
    if (!target) return HORIZON_CHART_W;
    let padX = 0;
    try {
        if (typeof getComputedStyle === 'function') {
            const styles = getComputedStyle(target);
            padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
        }
    } catch (e) { padX = 0; }
    let raw = target.clientWidth || 0;
    if (!raw && typeof target.getBoundingClientRect === 'function') {
        raw = Math.round(target.getBoundingClientRect().width) || 0;
    }
    const measured = Math.round(raw - padX);
    return measured > 0 ? Math.max(HORIZON_CHART_MIN_W, measured) : HORIZON_CHART_W;
}

function _horizonScale(value, domainMin, domainMax, rangeMin, rangeMax) {
    if (!(domainMax > domainMin)) return rangeMin;
    const t = (value - domainMin) / (domainMax - domainMin);
    return rangeMin + _horizonClamp(t, 0, 1) * (rangeMax - rangeMin);
}

function _horizonNiceMax(value) {
    const v = _horizonNumber(value, 0);
    if (!(v > 0)) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(v)));
    const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (let i = 0; i < steps.length; i++) {
        const candidate = steps[i] * magnitude;
        if (candidate >= v) return candidate;
    }
    return 10 * magnitude;
}

function _horizonLinePath(points) {
    let d = '';
    let open = false;
    points.forEach(point => {
        if (!point) { open = false; return; }
        d += `${open ? ' L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
        open = true;
    });
    return d.trim();
}


function buildTrajectorySvg(trajectory, width) {
    const W = Math.max(HORIZON_CHART_MIN_W, Math.round(_horizonNumber(width, HORIZON_CHART_W)));
    const H = 280;
    const narrow = W < 420;
    const pad = { l: narrow ? 54 : 64, r: 18, t: 18, b: 32 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const days = Math.max(1, trajectory.daysInMonth);
    const maxValue = _horizonNiceMax(Math.max(
        trajectory.monthlyLimit || 0,
        trajectory.projectedTotal || 0,
        trajectory.projectedBase || 0,
        trajectory.earnedSoFar || 0,
        1
    ));
    const xFor = (idx) => pad.l + (days === 1 ? plotW / 2 : (idx / (days - 1)) * plotW);
    const yFor = (value) => pad.t + (1 - _horizonClamp(_horizonNumber(value, 0) / maxValue, 0, 1)) * plotH;

    let grid = '';
    for (let i = 0; i <= 4; i++) {
        const value = (maxValue / 4) * i;
        const y = yFor(value);
        grid += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}" class="horizon-grid-line"/>`;
        grid += `<text x="${pad.l - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" class="horizon-axis-label">${_horizonBaht(value)}</text>`;
    }

    const labelEvery = Math.max(1, Math.ceil(days / 8));
    let xLabels = '';
    for (let idx = 0; idx < days; idx += labelEvery) {
        xLabels += `<text x="${xFor(idx).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="horizon-axis-label">${idx + 1}</text>`;
    }
    if ((days - 1) % labelEvery !== 0) {
        xLabels += `<text x="${xFor(days - 1).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="horizon-axis-label">${days}</text>`;
    }

    const todayIdx = Math.max(0, Math.min(days - 1, trajectory.elapsedDays - 1));
    const todayX = xFor(todayIdx);

    const actualPoints = trajectory.cumulativeActual.slice(0, todayIdx + 1).map((value, idx) => ({ x: xFor(idx), y: yFor(value) }));
    const projectedBasePoints = trajectory.projectedBaseSeries.map((value, idx) => value === null ? null : ({ x: xFor(idx), y: yFor(value) }));
    const projectedTotalPoints = trajectory.projectedTotalSeries.map((value, idx) => value === null ? null : ({ x: xFor(idx), y: yFor(value) }));

    const actualPath = _horizonLinePath(actualPoints);
    const basePath = _horizonLinePath(projectedBasePoints);
    const totalPath = _horizonLinePath(projectedTotalPoints);
    const actualArea = actualPath && actualPoints.length > 1
        ? `${actualPath} L ${actualPoints[actualPoints.length - 1].x.toFixed(2)} ${pad.t + plotH} L ${actualPoints[0].x.toFixed(2)} ${pad.t + plotH} Z`
        : '';

    let hoverCells = '';
    for (let idx = 0; idx < days; idx++) {
        const isPast = idx <= todayIdx;
        const actual = trajectory.cumulativeActual[idx];
        const projectedBase = trajectory.projectedBaseSeries[idx];
        const projectedTotal = trajectory.projectedTotalSeries[idx];
        const tipParts = [`Day ${idx + 1}`];
        if (isPast) tipParts.push(`Actual ${_horizonBaht(actual)}`);
        if (projectedBase !== null) tipParts.push(`Proj. base ${_horizonBaht(projectedBase)}`);
        if (projectedTotal !== null) tipParts.push(`Proj. payout ${_horizonBaht(projectedTotal)}`);
        const tip = tipParts.join(' · ');
        const cellW = plotW / days;
        hoverCells += `<rect x="${(xFor(idx) - cellW / 2).toFixed(2)}" y="${pad.t}" width="${cellW.toFixed(2)}" height="${plotH}" class="horizon-hover-cell" data-horizon-tip="${_horizonEscape(tip)}"><title>${_horizonEscape(tip)}</title></rect>`;
    }

    const lastIdx = days - 1;
    return `<svg viewBox="0 0 ${W} ${H}" class="horizon-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Earning trajectory for ${_horizonEscape(trajectory.monthLabel)}">
        <defs>
            <linearGradient id="horizonActualFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#10b981" stop-opacity="0.32"/>
                <stop offset="100%" stop-color="#10b981" stop-opacity="0.02"/>
            </linearGradient>
        </defs>
        ${grid}
        ${xLabels}
        <line x1="${pad.l}" y1="${pad.t + plotH}" x2="${W - pad.r}" y2="${pad.t + plotH}" class="horizon-axis-line"/>
        <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + plotH}" class="horizon-axis-line"/>
        <line x1="${todayX.toFixed(1)}" y1="${pad.t}" x2="${todayX.toFixed(1)}" y2="${pad.t + plotH}" class="horizon-today-line"/>
        <text x="${(todayX + 5).toFixed(1)}" y="${pad.t + 12}" class="horizon-today-label">Today</text>
        ${actualArea ? `<path d="${actualArea}" fill="url(#horizonActualFill)"/>` : ''}
        ${actualPath ? `<path d="${actualPath}" class="horizon-series-actual"/>` : ''}
        ${basePath ? `<path d="${basePath}" class="horizon-series-base"/>` : ''}
        ${totalPath ? `<path d="${totalPath}" class="horizon-series-total"/>` : ''}
        ${actualPoints.length ? `<circle cx="${actualPoints[actualPoints.length - 1].x.toFixed(1)}" cy="${actualPoints[actualPoints.length - 1].y.toFixed(1)}" r="4" class="horizon-dot-actual"/>` : ''}
        ${projectedTotalPoints[lastIdx] ? `<circle cx="${projectedTotalPoints[lastIdx].x.toFixed(1)}" cy="${projectedTotalPoints[lastIdx].y.toFixed(1)}" r="4" class="horizon-dot-total"/>` : ''}
        ${hoverCells}
    </svg>`;
}

function renderHorizonTrajectoryChart(trajectory) {
    const target = $('horizon-trajectory-chart');
    if (!target || !trajectory) return;
    target.innerHTML = buildTrajectorySvg(trajectory, _horizonChartWidth(target));
}


function _horizonHourTick(hour) {
    const h = ((hour % 24) + 24) % 24;
    const suffix = h >= 12 ? 'p' : 'a';
    const display = h % 12 === 0 ? 12 : h % 12;
    return `${display}${suffix}`;
}

function buildSweetSpotSvg(sweet, width) {
    const W = Math.max(HORIZON_CHART_MIN_W, Math.round(_horizonNumber(width, HORIZON_CHART_W)));
    const H = 250;
    const narrow = W < 420;
    const pad = { l: narrow ? 30 : 36, r: narrow ? 12 : 16, t: 20, b: 34 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const groupW = plotW / 24;
    const barW = groupW * 0.30;
    const yFor = (value) => pad.t + (1 - _horizonClamp(_horizonNumber(value, 0) / 5, 0, 1)) * plotH;

    let grid = '';
    for (let value = 1; value <= 5; value++) {
        const y = yFor(value);
        grid += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}" class="horizon-grid-line"/>`;
        grid += `<text x="${pad.l - 7}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" class="horizon-axis-label">${value}</text>`;
    }

    let bands = '';
    if (sweet.peakWindow) {
        bands += `<rect x="${(pad.l + sweet.peakWindow.startHour * groupW).toFixed(1)}" y="${pad.t}" width="${(sweet.peakWindow.length * groupW).toFixed(1)}" height="${plotH}" rx="4" class="horizon-band-peak"/>`;
    }
    if (sweet.strainWindow) {
        bands += `<rect x="${(pad.l + sweet.strainWindow.startHour * groupW).toFixed(1)}" y="${pad.t}" width="${(sweet.strainWindow.length * groupW).toFixed(1)}" height="${plotH}" rx="4" class="horizon-band-strain"/>`;
    }

    const baseY = pad.t + plotH;
    let bars = '';
    let ticks = '';
    let hoverCells = '';
    sweet.hours.forEach(slot => {
        const groupX = pad.l + slot.hour * groupW;
        if (slot.count > 0) {
            const qHeight = (slot.avgQuality / 5) * plotH;
            const eHeight = (slot.avgEffort / 5) * plotH;
            bars += `<rect x="${(groupX + groupW * 0.14).toFixed(2)}" y="${(baseY - qHeight).toFixed(2)}" width="${barW.toFixed(2)}" height="${qHeight.toFixed(2)}" rx="2" class="horizon-bar-quality"/>`;
            bars += `<rect x="${(groupX + groupW * 0.54).toFixed(2)}" y="${(baseY - eHeight).toFixed(2)}" width="${barW.toFixed(2)}" height="${eHeight.toFixed(2)}" rx="2" class="horizon-bar-effort"/>`;
        }
        if (slot.hour % 3 === 0) {
            ticks += `<text x="${(groupX + groupW / 2).toFixed(1)}" y="${H - 12}" text-anchor="middle" class="horizon-axis-label">${_horizonHourTick(slot.hour)}</text>`;
        }
        const tip = slot.count > 0
            ? `${_horizonFormatHour(slot.hour)} · n=${slot.count} · Q ${slot.avgQuality.toFixed(1)} · E ${slot.avgEffort.toFixed(1)} · ${formatHours(slot.workHours)}h`
            : `${_horizonFormatHour(slot.hour)} · no sessions`;
        hoverCells += `<rect x="${groupX.toFixed(2)}" y="${pad.t}" width="${groupW.toFixed(2)}" height="${plotH}" class="horizon-hover-cell" data-horizon-tip="${_horizonEscape(tip)}"><title>${_horizonEscape(tip)}</title></rect>`;
    });

    return `<svg viewBox="0 0 ${W} ${H}" class="horizon-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Average quality and effort by hour of day">
        ${grid}
        ${bands}
        <line x1="${pad.l}" y1="${baseY}" x2="${W - pad.r}" y2="${baseY}" class="horizon-axis-line"/>
        ${bars}
        ${ticks}
        ${hoverCells}
    </svg>`;
}

function buildSweetSpotInsight(sweet) {
    if (!sweet || !sweet.hasData) {
        return 'Log at least two focus sessions in a time block to surface your peak clarity window.';
    }
    const parts = [];
    if (sweet.peakWindow) {
        const p = sweet.peakWindow;
        parts.push(`Peak Clarity Window: ${_horizonFormatHour(p.startHour)} – ${_horizonFormatHour(p.endHour === 0 && p.startHour + p.length >= 24 ? 24 : p.endHour)} (Q ${p.avgQuality.toFixed(1)} · n=${p.count})`);
    } else {
        parts.push('Peak Clarity Window needs two sessions inside the same 2–3 hour block.');
    }
    if (sweet.strainWindow) {
        const s = sweet.strainWindow;
        parts.push(`High-Strain Window: ${_horizonFormatHour(s.startHour)} – ${_horizonFormatHour(s.endHour === 0 && s.startHour + s.length >= 24 ? 24 : s.endHour)} (E ${s.avgEffort.toFixed(1)} vs Q ${s.avgQuality.toFixed(1)} · +${s.gap.toFixed(1)} gap)`);
    } else {
        parts.push('No high-strain window — effort never outran quality.');
    }
    return parts.join(' • ');
}

function renderHorizonSweetSpot(sweet) {
    const target = $('horizon-sweetspot-chart');
    const insight = $('horizon-sweetspot-insight');
    if (insight) insight.innerText = buildSweetSpotInsight(sweet);
    if (!target) return;
    if (!sweet || !sweet.hasData) {
        target.innerHTML = `<div class="horizon-empty">No work sessions logged yet — the sweet-spot map appears after your first focus session.</div>`;
        return;
    }
    target.innerHTML = buildSweetSpotSvg(sweet, _horizonChartWidth(target));
}


function buildDurationSvg(distribution, width) {
    const W = Math.max(HORIZON_CHART_MIN_W, Math.round(_horizonNumber(width, HORIZON_CHART_W)));
    const H = 250;
    const narrow = W < 420;
    const pad = { l: narrow ? 30 : 40, r: narrow ? 30 : 46, t: 20, b: 50 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const buckets = distribution.buckets;
    const groupW = plotW / buckets.length;
    const barW = groupW * 0.40;
    const maxCount = _horizonNiceMax(Math.max(1, ...buckets.map(b => b.count)));
    const yCount = (value) => pad.t + (1 - _horizonClamp(_horizonNumber(value, 0) / maxCount, 0, 1)) * plotH;
    const yQuality = (value) => pad.t + (1 - _horizonClamp(_horizonNumber(value, 0) / 5, 0, 1)) * plotH;

    let grid = '';
    for (let i = 0; i <= 4; i++) {
        const y = pad.t + (plotH / 4) * i;
        grid += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}" class="horizon-grid-line"/>`;
        grid += `<text x="${pad.l - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" class="horizon-axis-label">${Math.round(maxCount - (maxCount / 4) * i)}</text>`;
    }
    for (let value = 1; value <= 5; value++) {
        grid += `<text x="${W - pad.r + 8}" y="${(yQuality(value) + 3.5).toFixed(1)}" text-anchor="start" class="horizon-axis-label horizon-axis-label-quality">${value}</text>`;
    }

    const baseY = pad.t + plotH;
    let bars = '', labels = '', hoverCells = '';
    const qualityPoints = [];
    // Band names need ~60px each to stay legible; drop them to a single range
    // row on narrow phones instead of letting the labels collide.
    const showBandNames = groupW >= 58;
    const labelBaseY = showBandNames ? baseY + 17 : baseY + 22;
    buckets.forEach((bucket, idx) => {
        const centerX = pad.l + groupW * idx + groupW / 2;
        const barHeight = (bucket.count / maxCount) * plotH;
        const tip = `${bucket.name} (${bucket.label}) · ${bucket.count} session${bucket.count === 1 ? '' : 's'}`
            + (bucket.avgQuality !== null ? ` · Q ${bucket.avgQuality.toFixed(1)}` : ' · no quality data')
            + ` · ${Math.round(bucket.sharePct)}% of sessions`;
        if (bucket.count > 0) {
            bars += `<rect x="${(centerX - barW / 2).toFixed(2)}" y="${(baseY - barHeight).toFixed(2)}" width="${barW.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="4" class="horizon-bar-duration"/>`;
        }
        if (bucket.avgQuality !== null) {
            qualityPoints.push({ x: centerX, y: yQuality(bucket.avgQuality) });
            bars += `<circle cx="${centerX.toFixed(2)}" cy="${yQuality(bucket.avgQuality).toFixed(2)}" r="3.5" class="horizon-dot-quality"/>`;
        } else {
            qualityPoints.push(null);
        }
        if (showBandNames) {
            labels += `<text x="${centerX.toFixed(2)}" y="${labelBaseY}" text-anchor="middle" class="horizon-axis-label horizon-band-name">${_horizonEscape(bucket.name)}</text>`;
            labels += `<text x="${centerX.toFixed(2)}" y="${baseY + 32}" text-anchor="middle" class="horizon-axis-label">${_horizonEscape(bucket.label)}</text>`;
        } else {
            labels += `<text x="${centerX.toFixed(2)}" y="${labelBaseY}" text-anchor="middle" class="horizon-axis-label">${_horizonEscape(bucket.label)}</text>`;
        }
        hoverCells += `<rect x="${(pad.l + groupW * idx).toFixed(2)}" y="${pad.t}" width="${groupW.toFixed(2)}" height="${plotH}" class="horizon-hover-cell" data-horizon-tip="${_horizonEscape(tip)}"><title>${_horizonEscape(tip)}</title></rect>`;
    });

    const qualityPath = _horizonLinePath(qualityPoints);

    return `<svg viewBox="0 0 ${W} ${H}" class="horizon-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Session count and average quality by duration band">
        ${grid}
        <line x1="${pad.l}" y1="${baseY}" x2="${W - pad.r}" y2="${baseY}" class="horizon-axis-line"/>
        ${bars}
        ${qualityPath ? `<path d="${qualityPath}" class="horizon-series-quality"/>` : ''}
        ${labels}
        ${hoverCells}
    </svg>`;
}

function buildDurationInsight(distribution) {
    if (!distribution || !distribution.hasData) {
        return 'No completed focus sessions yet — finish a Pomodoro round or log a work session to map your preferred duration.';
    }
    const most = distribution.mostPicked;
    const best = distribution.bestQuality;
    let text = most
        ? `Most-picked band: ${most.name} ${most.label} (n=${most.count}, ${Math.round(most.sharePct)}%)`
        : 'No sessions bucketed yet';
    if (best && best.avgQuality !== null) {
        text += best.key === (most && most.key)
            ? ` — and it also yields your best work (Q ${best.avgQuality.toFixed(1)}).`
            : `, but ${best.name} ${best.label} yields your best work (Q ${best.avgQuality.toFixed(1)}, n=${best.count}).`;
    } else {
        text += '.';
    }
    text += distribution.source === 'pomodoro' ? ' Source: Pomodoro history.' : ' Source: work-log durations.';
    return text;
}

function renderHorizonDuration(distribution) {
    const target = $('horizon-duration-chart');
    const insight = $('horizon-duration-insight');
    if (insight) insight.innerText = buildDurationInsight(distribution);
    if (!target) return;
    if (!distribution || !distribution.hasData) {
        target.innerHTML = `<div class="horizon-empty">No completed sessions yet — finish a Pomodoro round or log a work session.</div>`;
        return;
    }
    target.innerHTML = buildDurationSvg(distribution, _horizonChartWidth(target));
}


// ============================================================================
// INTERACTIONS — shared hover tooltip, scope toggle & live render entry point
// ============================================================================

function initHorizonTooltip() {
    if (_horizonTooltipBound || typeof document === 'undefined') return;
    const view = $('view-horizon');
    if (!view) return;
    _horizonTooltipBound = true;

    let tip = $('horizon-tooltip');
    if (!tip) {
        tip = document.createElement('div');
        tip.id = 'horizon-tooltip';
        tip.className = 'horizon-tooltip hidden';
        tip.setAttribute('role', 'tooltip');
        document.body.appendChild(tip);
    }

    const hide = () => tip.classList.add('hidden');
    const show = (target, x, y) => {
        const text = target.getAttribute('data-horizon-tip');
        if (!text) return;
        tip.innerText = text;
        tip.classList.remove('hidden');
        const width = tip.offsetWidth || 220;
        const height = tip.offsetHeight || 32;
        let left = x + 14;
        let top = y + 14;
        if (left + width > window.innerWidth - 8) left = Math.max(8, x - width - 14);
        if (top + height > window.innerHeight - 8) top = Math.max(8, y - height - 14);
        tip.style.left = `${Math.round(left)}px`;
        tip.style.top = `${Math.round(top)}px`;
    };
    const targetFrom = (event) => {
        const node = event.target;
        return (node && typeof node.closest === 'function') ? node.closest('[data-horizon-tip]') : null;
    };

    view.addEventListener('pointerover', event => {
        const target = targetFrom(event);
        if (target) show(target, event.clientX, event.clientY);
    });
    view.addEventListener('pointermove', event => {
        const target = targetFrom(event);
        if (!target) { hide(); return; }
        show(target, event.clientX, event.clientY);
    });
    view.addEventListener('pointerout', event => {
        if (targetFrom(event)) hide();
    });
    view.addEventListener('focusin', event => {
        const target = targetFrom(event);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        show(target, rect.left + rect.width / 2, rect.top);
    });
    view.addEventListener('focusout', hide);
    window.addEventListener('scroll', hide, { passive: true });
}

function setHorizonUser(key) {
    if (!HORIZON_SCOPE_KEYS.includes(key)) return;
    horizonUserSelection = key;
    renderHorizonView();
    resizeHorizonCharts();
}

let _horizonLastView = null;
let _horizonResizeBound = false;

/**
 * Re-renders the three hand-built SVGs from the last computed payload. The
 * charts are drawn at a 1:1 pixel scale, so they must be rebuilt whenever the
 * chart shell changes width (window resize, sidebar collapse, tab mount).
 */
function _renderHorizonSvgCharts() {
    const cache = _horizonLastView;
    if (!cache) return;
    renderHorizonTrajectoryChart(cache.trajectory);
    renderHorizonSweetSpot(cache.sweet);
    renderHorizonDuration(cache.distribution);
}

function _bindHorizonChartResize() {
    if (_horizonResizeBound || typeof window === 'undefined') return;
    _horizonResizeBound = true;
    let timer = null;
    window.addEventListener('resize', () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            if (typeof activeTab !== 'undefined' && activeTab !== 'horizon') return;
            resizeHorizonCharts();
        }, 150);
    }, { passive: true });
}

function resizeHorizonCharts() {
    _renderHorizonSvgCharts();
    if (typeof charts === 'undefined' || !charts) return;
    const run = () => {
        ['work', 'sanctuary'].forEach(key => {
            try {
                if (charts[key] && typeof charts[key].resize === 'function') charts[key].resize();
            } catch (e) {}
        });
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else run();
}

/**
 * Renders every Horizon section from the live caches. Safe to call repeatedly:
 * it is invoked on tab activation plus every logs/settings snapshot.
 * @returns {{scope:string,trajectory:Object,sweet:Object,distribution:Object}|null}
 */
function renderHorizonView() {
    if (typeof document === 'undefined') return null;
    const scope = getHorizonScope();
    const now = new Date();

    const logs = _horizonResolveLogs(scope);
    const settings = _horizonResolveSettings(scope);
    const pomoHistory = _horizonResolvePomoHistory(scope);

    let trajectory;
    if (scope === 'Duo') {
        trajectory = mergeHorizonTrajectories(
            buildMonthlyTrajectory(_horizonResolveLogs('North'), _horizonResolveSettings('North'), now),
            buildMonthlyTrajectory(_horizonResolveLogs('Cream'), _horizonResolveSettings('Cream'), now)
        );
    } else {
        trajectory = buildMonthlyTrajectory(logs, settings, now);
    }

    const sweet = computeSweetSpot(logs);
    const distribution = computeDurationDistribution(logs, pomoHistory);

    _renderHorizonScope(scope);
    renderHorizonKpis(trajectory, scope);
    renderHorizonTrajectoryChart(trajectory);
    renderHorizonSweetSpot(sweet);
    renderHorizonDuration(distribution);

    if (typeof renderHorizonInsightCards === 'function' && typeof calculateAureateInsights === 'function') {
        renderHorizonInsightCards(calculateAureateInsights(logs, pomoHistory, settings));
    }

    initHorizonTooltip();
    _bindHorizonChartResize();
    _horizonLastView = { trajectory, sweet, distribution };
    if (typeof setTimeout === 'function') setTimeout(resizeHorizonCharts, 60);
    return { scope, trajectory, sweet, distribution };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        buildMonthlyTrajectory,
        mergeHorizonTrajectories,
        computeSweetSpot,
        computeDurationDistribution,
        HORIZON_DURATION_BANDS,
        HORIZON_SCOPE_KEYS
    };
}

