// ============================================================================
// AUREUM — 5-State Habit Thermostat Engine
// ============================================================================
// Pure, derived helpers that translate the rolling 7-day log history into one
// mutually exclusive pacing state. Nothing is persisted: every snapshot simply
// recomputes the thermostat from the raw `logs` array.
//
// Priority waterfall (first match wins):
//   1. OVERHEATING   (corrective)
//   2. COLD_START    (corrective)
//   3. TUNNEL_VISION (corrective)
//   4. DIALED_IN     (positive)
//   5. STEADY_CRUISE (default positive)
//
// Loaded as a classic global script in index.html and exported for Node tests.
// ============================================================================

const THERMOSTAT_DAY_MS = 86400000;
const THERMOSTAT_FUTURE_GRACE_MS = 5 * 60000;

const HABIT_THERMOSTAT_STATES = {
    OVERHEATING: {
        state: 'OVERHEATING',
        priority: 1,
        label: '🔥 Overheating',
        tone: 'corrective',
        isCorrective: true,
        message: 'High output with rising strain or dipping quality. Ease off the gas and protect your pacing.',
        action: {
            type: 'OVERHEATING',
            recommendedPomo: { workMins: 25, breakMins: 10 },
            quickActions: [
                { label: 'Low-Pressure Play Session (25m)', type: 'work', mins: 25 }
            ]
        }
    },
    COLD_START: {
        state: 'COLD_START',
        priority: 2,
        label: '❄️ Cold Start',
        tone: 'corrective',
        isCorrective: true,
        message: 'Low momentum over the past 7 days. Lower the bar and log one tiny starter rep.',
        action: {
            type: 'COLD_START',
            quickActions: [
                { label: '15m Starter Craft', type: 'work', mins: 15 },
                { label: '10m Quick Tidy', type: 'chore', mins: 10 }
            ]
        }
    },
    TUNNEL_VISION: {
        state: 'TUNNEL_VISION',
        priority: 3,
        label: '🔭 Tunnel-Vision',
        tone: 'corrective',
        isCorrective: true,
        message: 'Heavy work focus while body and apartment upkeep are idling. Take a 15-minute reset.',
        action: {
            type: 'TUNNEL_VISION',
            quickActions: [
                { label: '15m Sanctuary Reset', type: 'chore', mins: 15 },
                { label: '15m Mobility / Walk', type: 'workout', mins: 15 }
            ]
        }
    },
    DIALED_IN: {
        state: 'DIALED_IN',
        priority: 4,
        label: '⚡ Dialed In',
        tone: 'positive',
        isCorrective: false,
        message: 'Strong output, clean execution, and balanced upkeep. Keep riding the wave.',
        action: {
            type: 'DIALED_IN',
            quickActions: []
        }
    },
    STEADY_CRUISE: {
        state: 'STEADY_CRUISE',
        priority: 5,
        label: '🌿 Steady Cruise',
        tone: 'positive',
        isCorrective: false,
        message: 'Balanced, sustainable rhythm with no alarms tripped.',
        action: {
            type: 'STEADY_CRUISE',
            quickActions: []
        }
    }
};

/**
 * Converts a Firestore Timestamp / Date / millisecond value / ISO string into
 * epoch milliseconds. Returns null for unusable values.
 * @param {*} value
 * @returns {number|null}
 */
function _thermostatToDateMs(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value instanceof Date) {
        const t = value.getTime();
        return Number.isFinite(t) ? t : null;
    }
    if (typeof value.toDate === 'function') {
        try {
            const d = value.toDate();
            const t = d instanceof Date ? d.getTime() : NaN;
            return Number.isFinite(t) ? t : null;
        } catch (e) {
            return null;
        }
    }
    if (typeof value === 'object' && Number.isFinite(value.seconds)) {
        const nanos = Number.isFinite(value.nanoseconds) ? value.nanoseconds : 0;
        return (value.seconds * 1000) + Math.floor(nanos / 1e6);
    }
    if (typeof value === 'string') {
        const t = Date.parse(value);
        return Number.isFinite(t) ? t : null;
    }
    return null;
}

/**
 * Resolves the timestamp of a log document.
 * @param {Object} log
 * @returns {number|null}
 */
function _thermostatLogMs(log) {
    if (!log || typeof log !== 'object') return null;
    const candidates = [log.timestamp, log.date, log.createdAt];
    for (let i = 0; i < candidates.length; i++) {
        const ms = _thermostatToDateMs(candidates[i]);
        if (ms !== null) return ms;
    }
    return null;
}

function _thermostatHours(log) {
    const hrs = parseFloat(log?.hours);
    return Number.isFinite(hrs) && hrs > 0 ? hrs : 0;
}

function _thermostatRating(value, fallback = 3) {
    const rating = parseFloat(value);
    return Number.isFinite(rating) ? rating : fallback;
}

function _thermostatRound2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function _thermostatDayKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}


/**
 * Computes the current 5-state Habit Thermostat from raw logs.
 *
 * Rolling windows (all timestamps in epoch milliseconds):
 *   currentWindow: (refTimeMs - 7d,  refTimeMs + 5m]
 *   prevWindow:    (refTimeMs - 14d, refTimeMs - 7d]
 *
 * @param {Array<Object>} logs - Raw Firestore log documents
 * @param {Object} settings - Active user settings (reserved for future tuning)
 * @param {number} [refTimeMs=Date.now()] - Reference "now" in epoch milliseconds
 * @returns {Object} State definition + rolling metrics
 */
function computeHabitThermostat(logs, settings, refTimeMs = Date.now()) {
    const reference = Number.isFinite(Number(refTimeMs)) ? Number(refTimeMs) : Date.now();
    const currentStart = reference - (7 * THERMOSTAT_DAY_MS);
    const currentEnd = reference + THERMOSTAT_FUTURE_GRACE_MS;
    const prevStart = reference - (14 * THERMOSTAT_DAY_MS);
    const prevEnd = reference - (7 * THERMOSTAT_DAY_MS);
    const last24hStart = reference - THERMOSTAT_DAY_MS;

    const source = Array.isArray(logs) ? logs : [];
    const currentWindow = [];
    const prevWindow = [];

    for (let i = 0; i < source.length; i++) {
        const log = source[i];
        const ms = _thermostatLogMs(log);
        if (ms === null) continue;
        if (ms > currentStart && ms <= currentEnd) {
            currentWindow.push({ log, ms });
        } else if (ms > prevStart && ms <= prevEnd) {
            prevWindow.push({ log, ms });
        }
    }

    let workH = 0, choreH = 0, workoutH = 0, workHLast24h = 0;
    let workQualitySum = 0, workEffortSum = 0, workLogsCount = 0;
    const activeDayKeys = new Set();
    const currentWorkLogs = [];

    for (let i = 0; i < currentWindow.length; i++) {
        const { log, ms } = currentWindow[i];
        activeDayKeys.add(_thermostatDayKey(ms));
        const hrs = _thermostatHours(log);
        if (log.type === 'work') {
            workH += hrs;
            workLogsCount += 1;
            workQualitySum += _thermostatRating(log.results);
            workEffortSum += _thermostatRating(log.effort);
            if (ms > last24hStart) workHLast24h += hrs;
            currentWorkLogs.push({ log, ms });
        } else if (log.type === 'chore') {
            choreH += hrs;
        } else if (log.type === 'workout') {
            workoutH += hrs;
        }
    }

    let prevQualitySum = 0, prevWorkLogsCount = 0;
    for (let i = 0; i < prevWindow.length; i++) {
        const log = prevWindow[i].log;
        if (log.type !== 'work') continue;
        prevWorkLogsCount += 1;
        prevQualitySum += _thermostatRating(log.results);
    }

    const activeDays = activeDayKeys.size;
    const totalH = workH + choreH + workoutH;
    const avgEffort = workLogsCount > 0 ? (workEffortSum / workLogsCount) : 0;
    const avgQuality = workLogsCount > 0 ? (workQualitySum / workLogsCount) : 0;
    const prevAvgQuality = prevWorkLogsCount > 0 ? (prevQualitySum / prevWorkLogsCount) : 0;
    // Compare rounded values so exact spec boundaries (4.2, 3.8, 0.6) are not
    // lost to IEEE-754 accumulation from repeated additions/divisions.
    const avgEffortGate = _thermostatRound2(avgEffort);
    const avgQualityGate = _thermostatRound2(avgQuality);
    const prevQualityGate = _thermostatRound2(prevAvgQuality);
    const hadFullWorkRestLast24h = workHLast24h <= 0;

    const sortedWorkLogs = currentWorkLogs
        .slice()
        .sort((a, b) => b.ms - a.ms);
    const lastTwoWorkLowEffort = sortedWorkLogs.length >= 2
        && sortedWorkLogs.slice(0, 2).every(({ log }) => _thermostatRating(log.effort) <= 3.5);

    // --- Priority waterfall (first match wins) ------------------------------
    let stateId;

    // 1. OVERHEATING — corrective, guarded by rest / low-effort hysteresis.
    const overheatingTrigger = workH >= 14 && (
        avgEffortGate >= 4.2
        || (prevQualityGate > 0 && (prevQualityGate - avgQualityGate) >= 0.6)
    );
    const overheatingBlocked = hadFullWorkRestLast24h || lastTwoWorkLowEffort;

    if (overheatingTrigger && !overheatingBlocked) {
        stateId = 'OVERHEATING';
    } else {
        // 2. COLD_START — remains until both recovery thresholds are cleared.
        const coldStartTrigger = activeDays <= 2 || totalH < 3;
        const coldStartCleared = totalH >= 4.5 && activeDays >= 3;
        if (coldStartTrigger || !coldStartCleared) {
            stateId = 'COLD_START';
        } else {
            // 3. TUNNEL_VISION — clears once upkeep/sanctuary catches up.
            const tunnelVisionExit = choreH >= 2.5 || workoutH >= 1.25;
            const tunnelVisionTrigger = workH >= 8 && choreH < 2 && workoutH < 1;
            if (tunnelVisionTrigger && !tunnelVisionExit) {
                stateId = 'TUNNEL_VISION';
            } else if (workH >= 8 && avgQualityGate >= 3.8 && (choreH >= 2 || workoutH >= 1)) {
                // 4. DIALED_IN — positive, high craft + balanced upkeep.
                stateId = 'DIALED_IN';
            } else {
                // 5. STEADY_CRUISE — default positive fallback.
                stateId = 'STEADY_CRUISE';
            }
        }
    }

    const definition = HABIT_THERMOSTAT_STATES[stateId];
    const action = definition.action;
    const metrics = {
        workH: _thermostatRound2(workH),
        choreH: _thermostatRound2(choreH),
        workoutH: _thermostatRound2(workoutH),
        totalH: _thermostatRound2(totalH),
        activeDays,
        avgEffort: _thermostatRound2(avgEffort),
        avgQuality: _thermostatRound2(avgQuality),
        prevAvgQuality: _thermostatRound2(prevAvgQuality),
        hadFullWorkRestLast24h,
        lastTwoWorkLowEffort,
        workLogsCount
    };

    return {
        state: definition.state,
        label: definition.label,
        tone: definition.tone,
        isCorrective: definition.isCorrective,
        message: definition.message,
        priority: definition.priority,
        action,
        quickActions: action.quickActions || [],
        recommendedPomo: action.recommendedPomo || null,
        metrics
    };
}


/**
 * Tailwind token helper shared by the HUD badges and the adaptive panel.
 * Positive states use calm emerald/teal; corrective states use warm amber/sky.
 * @param {string} state
 * @returns {string}
 */
function getThermostatBadgeClasses(state) {
    switch (state) {
        case 'DIALED_IN':
            return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';
        case 'STEADY_CRUISE':
            return 'bg-teal-500/15 text-teal-300 border-teal-500/35';
        case 'COLD_START':
            return 'bg-sky-500/15 text-sky-300 border-sky-500/35';
        case 'TUNNEL_VISION':
            return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
        case 'OVERHEATING':
            return 'bg-amber-500/15 text-amber-200 border-amber-500/40';
        default:
            return 'bg-slate-800 text-slate-300 border-slate-700';
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        computeHabitThermostat,
        getThermostatBadgeClasses,
        HABIT_THERMOSTAT_STATES,
        THERMOSTAT_DAY_MS,
        THERMOSTAT_FUTURE_GRACE_MS
    };
}

