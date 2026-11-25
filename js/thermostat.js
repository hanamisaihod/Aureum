// ============================================================================
// AUREUM — 6-State Habit Thermostat Engine
// ============================================================================
// Pure, derived helpers that translate the rolling log history into one
// mutually exclusive pacing state. Nothing is persisted: every snapshot simply
// recomputes the thermostat from the raw `logs` array.
//
// Priority waterfall (first match wins):
//   0. NO_DATA       (neutral placeholder — zero usable history, never competes)
//   1. OVERHEATING   (corrective)
//   2. COLD_START    (corrective)
//   3. TUNNEL_VISION (corrective)
//   4. DIALED_IN     (positive)
//   5. STEADY_CRUISE (default positive)
//
// Every numeric gate lives in THERMOSTAT_THRESHOLD_DEFAULTS and is resolved by
// resolveThermostatThresholds(settings): explicit `settings.thermostat`
// overrides win, then values derived from `settings.weeklyHours`, then the
// defaults — which reproduce the original 14h / 4.2 / 0.6 / 8h / 3.8 / 4.5h
// gates exactly, so default users see no behaviour change.
//
// Loaded as a classic global script in index.html and exported for Node tests.
// ============================================================================

const THERMOSTAT_DAY_MS = 86400000;
const THERMOSTAT_FUTURE_GRACE_MS = 5 * 60000;
const THERMOSTAT_DEFAULT_WINDOW_DAYS = 7;
const THERMOSTAT_MAX_WINDOW_DAYS = 400;

// Baseline gates. Overridable per user through `settings.thermostat`.
const THERMOSTAT_THRESHOLD_DEFAULTS = Object.freeze({
    workH: { overheat: 14, tunnel: 8, dialed: 8 },
    effort: { overheatAvg: 4.2 },
    quality: { drop: 0.6, dialedAvg: 3.8 },
    coldStart: { triggerTotalH: 3, triggerActiveDays: 2, clearTotalH: 4.5, clearActiveDays: 3 },
    upkeep: {
        tunnelChoreMax: 2,
        tunnelWorkoutMax: 1,
        tunnelExitChore: 2.5,
        tunnelExitWorkout: 1.25,
        dialedChore: 2,
        dialedWorkout: 1
    },
    hysteresis: { lowEffortMax: 3.5, restWindowH: 24 }
});

const HABIT_THERMOSTAT_STATES = {
    NO_DATA: {
        state: 'NO_DATA',
        priority: 0,
        label: '⏳ Warming Up',
        tone: 'neutral',
        isCorrective: false,
        isPlaceholder: true,
        message: 'No entries yet. Log one short rep and the thermostat starts reading your pacing.',
        action: {
            type: 'NO_DATA',
            quickActions: [
                { label: '15m Starter Craft', type: 'work', mins: 15 }
            ]
        }
    },
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

function _thermostatClamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function _thermostatRound1(value) {
    return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

/**
 * Parses a strictly positive number, returning null for anything unusable.
 * @param {*} value
 * @returns {number|null}
 */
function _thermostatPositiveNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Resolves a rolling-window length in days, clamped to a sane range.
 * @param {*} value
 * @param {number} fallback
 * @returns {number}
 */
function _thermostatClampInt(value, fallback) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(THERMOSTAT_MAX_WINDOW_DAYS, n);
}

/**
 * Resolves the thermostat gates for one user.
 *
 * Precedence per gate: `settings.thermostat.<group>.<key>` → value derived from
 * `settings.weeklyHours` → THERMOSTAT_THRESHOLD_DEFAULTS. Only the work-hour
 * gates are derived (1.4× weekly for the overheat ceiling, 0.8× for the focus
 * floor), so a 10h/week target reproduces the classic 14h / 8h gates.
 *
 * @param {Object} settings - Active user settings
 * @returns {Object} Frozen threshold groups
 */
function resolveThermostatThresholds(settings) {
    const source = (settings && typeof settings === 'object') ? settings : {};
    const overrides = (source.thermostat && typeof source.thermostat === 'object') ? source.thermostat : {};
    const weekly = _thermostatPositiveNumber(source.weeklyHours) || 10;
    const derived = {
        workH: {
            overheat: _thermostatClamp(_thermostatRound1(weekly * 1.4), 4, 60),
            tunnel: _thermostatClamp(_thermostatRound1(weekly * 0.8), 4, 60),
            dialed: _thermostatClamp(_thermostatRound1(weekly * 0.8), 4, 60)
        }
    };

    const resolved = {};
    Object.keys(THERMOSTAT_THRESHOLD_DEFAULTS).forEach(group => {
        const defaults = THERMOSTAT_THRESHOLD_DEFAULTS[group];
        const overrideGroup = (overrides[group] && typeof overrides[group] === 'object') ? overrides[group] : {};
        const derivedGroup = derived[group] || {};
        const out = {};
        Object.keys(defaults).forEach(key => {
            const overrideValue = _thermostatPositiveNumber(overrideGroup[key]);
            if (overrideValue !== null) {
                out[key] = overrideValue;
                return;
            }
            const derivedValue = _thermostatPositiveNumber(derivedGroup[key]);
            out[key] = derivedValue !== null ? derivedValue : defaults[key];
        });
        resolved[group] = Object.freeze(out);
    });
    return Object.freeze(resolved);
}


/**
 * Computes the current Habit Thermostat from raw logs.
 *
 * Rolling windows (all timestamps in epoch milliseconds):
 *   currentWindow: (refTimeMs - windowDays·day,   refTimeMs + graceMs]
 *   prevWindow:    (refTimeMs - prevDays·day,     refTimeMs - windowDays·day]
 *
 * @param {Array<Object>} logs - Raw Firestore log documents
 * @param {Object} settings - Active user settings (weeklyHours + thermostat overrides)
 * @param {number} [refTimeMs=Date.now()] - Reference "now" in epoch milliseconds
 * @param {Object} [options] - Window overrides, e.g. { windowDays: 30 } for monthly cards
 * @returns {Object} State definition + rolling metrics + explain trace
 */
function computeHabitThermostat(logs, settings, refTimeMs = Date.now(), options = {}) {
    const reference = Number.isFinite(Number(refTimeMs)) ? Number(refTimeMs) : Date.now();
    const opts = (options && typeof options === 'object') ? options : {};
    const windowDays = _thermostatClampInt(opts.windowDays, THERMOSTAT_DEFAULT_WINDOW_DAYS);
    const prevDays = _thermostatClampInt(opts.previousWindowDays, windowDays);
    const graceMs = Number.isFinite(Number(opts.graceMs)) && opts.graceMs !== null
        ? Number(opts.graceMs)
        : THERMOSTAT_FUTURE_GRACE_MS;
    const thresholds = resolveThermostatThresholds(settings);
    const currentStart = reference - (windowDays * THERMOSTAT_DAY_MS);
    const currentEnd = reference + graceMs;
    const prevEnd = currentStart;
    const prevStart = currentStart - (prevDays * THERMOSTAT_DAY_MS);
    const last24hStart = reference - (thresholds.hysteresis.restWindowH * 3600000);

    const source = Array.isArray(logs) ? logs : [];
    const currentWindow = [];
    const prevWindow = [];
    let usableLogs = 0;
    let ignoredFutureLogs = 0;

    for (let i = 0; i < source.length; i++) {
        const log = source[i];
        const ms = _thermostatLogMs(log);
        if (ms === null) continue;
        usableLogs += 1;
        if (ms > currentStart && ms <= currentEnd) {
            currentWindow.push({ log, ms });
        } else if (ms > prevStart && ms <= prevEnd) {
            prevWindow.push({ log, ms });
        } else if (ms > currentEnd) {
            ignoredFutureLogs += 1;
        }
    }

    let workH = 0, choreH = 0, workoutH = 0, workHLast24h = 0;
    let workQualitySum = 0, workEffortSum = 0, workLogsCount = 0, missingRatingCount = 0;
    const activeDayKeys = new Set();
    const currentWorkLogs = [];

    for (let i = 0; i < currentWindow.length; i++) {
        const { log, ms } = currentWindow[i];
        activeDayKeys.add(_thermostatDayKey(ms));
        const hrs = _thermostatHours(log);
        if (log.type === 'work') {
            workH += hrs;
            workLogsCount += 1;
            if (!Number.isFinite(parseFloat(log.results))) missingRatingCount += 1;
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
        && sortedWorkLogs.slice(0, 2).every(({ log }) => _thermostatRating(log.effort) <= thresholds.hysteresis.lowEffortMax);

    // --- Priority waterfall (first match wins) ------------------------------
    // Every evaluated rule is appended to `explain` so the UI can justify the
    // badge. `skipped: true` marks the NO_DATA guard when it short-circuits.
    const explain = [];
    const record = (id, state, label, value, threshold, passed, skipped = false) => {
        explain.push({
            id,
            state,
            label,
            value,
            threshold,
            passed: Boolean(passed),
            skipped: Boolean(skipped)
        });
    };

    // Rounded gates keep exact spec boundaries (14, 4.5, 3.8, 4.2) intact.
    const workHGate = _thermostatRound2(workH);
    const choreHGate = _thermostatRound2(choreH);
    const workoutHGate = _thermostatRound2(workoutH);
    const totalHGate = _thermostatRound2(totalH);

    let stateId;

    if (usableLogs === 0) {
        // 0. NO_DATA — neutral placeholder for a history with no usable entries.
        //    Logs that merely fell out of the window stay COLD_START instead.
        stateId = 'NO_DATA';
        record('noData.usableLogs', 'NO_DATA', 'At least one usable log entry', 0, 1, false);
    } else {
        record('noData.usableLogs', 'NO_DATA', 'At least one usable log entry', usableLogs, 1, true);

        // 1. OVERHEATING — corrective, guarded by rest / low-effort hysteresis.
        const overheatingTrigger = workHGate >= thresholds.workH.overheat && (
            avgEffortGate >= thresholds.effort.overheatAvg
            || (prevQualityGate > 0 && (prevQualityGate - avgQualityGate) >= thresholds.quality.drop)
        );
        const overheatingBlocked = hadFullWorkRestLast24h || lastTwoWorkLowEffort;

        record(
            'overheating.workH',
            'OVERHEATING',
            `Work hours ≥ ${thresholds.workH.overheat}h`,
            workHGate,
            thresholds.workH.overheat,
            workHGate >= thresholds.workH.overheat
        );
        record(
            'overheating.effort',
            'OVERHEATING',
            `Avg effort ≥ ${thresholds.effort.overheatAvg}`,
            avgEffortGate,
            thresholds.effort.overheatAvg,
            avgEffortGate >= thresholds.effort.overheatAvg
        );
        record(
            'overheating.qualityDrop',
            'OVERHEATING',
            `Quality drop ≥ ${thresholds.quality.drop} vs previous window`,
            _thermostatRound2(prevQualityGate - avgQualityGate),
            thresholds.quality.drop,
            prevQualityGate > 0 && (prevQualityGate - avgQualityGate) >= thresholds.quality.drop
        );
        record(
            'overheating.hysteresis',
            'OVERHEATING',
            'No rest day or low-effort tail detected',
            hadFullWorkRestLast24h ? 'rest day' : (lastTwoWorkLowEffort ? 'low-effort tail' : 'clear'),
            0,
            !overheatingBlocked
        );

        if (overheatingTrigger && !overheatingBlocked) {
            stateId = 'OVERHEATING';
        } else {
            // 2. COLD_START — remains until both recovery thresholds are cleared.
            const coldStartTrigger = activeDays <= thresholds.coldStart.triggerActiveDays
                || totalHGate < thresholds.coldStart.triggerTotalH;
            const coldStartCleared = totalHGate >= thresholds.coldStart.clearTotalH
                && activeDays >= thresholds.coldStart.clearActiveDays;

            record(
                'coldStart.activeDays',
                'COLD_START',
                `Active days ≤ ${thresholds.coldStart.triggerActiveDays}`,
                activeDays,
                thresholds.coldStart.triggerActiveDays,
                activeDays <= thresholds.coldStart.triggerActiveDays
            );
            record(
                'coldStart.totalH',
                'COLD_START',
                `Total hours < ${thresholds.coldStart.triggerTotalH}h`,
                totalHGate,
                thresholds.coldStart.triggerTotalH,
                totalHGate < thresholds.coldStart.triggerTotalH
            );
            record(
                'coldStart.cleared',
                'COLD_START',
                `Cleared at ≥ ${thresholds.coldStart.clearTotalH}h and ≥ ${thresholds.coldStart.clearActiveDays} active days`,
                totalHGate,
                thresholds.coldStart.clearTotalH,
                coldStartCleared
            );

            if (coldStartTrigger || !coldStartCleared) {
                stateId = 'COLD_START';
            } else {
                // 3. TUNNEL_VISION — clears once upkeep/sanctuary catches up.
                const tunnelVisionExit = choreHGate >= thresholds.upkeep.tunnelExitChore
                    || workoutHGate >= thresholds.upkeep.tunnelExitWorkout;
                const tunnelVisionTrigger = workHGate >= thresholds.workH.tunnel
                    && choreHGate < thresholds.upkeep.tunnelChoreMax
                    && workoutHGate < thresholds.upkeep.tunnelWorkoutMax;

                record(
                    'tunnelVision.workH',
                    'TUNNEL_VISION',
                    `Work hours ≥ ${thresholds.workH.tunnel}h`,
                    workHGate,
                    thresholds.workH.tunnel,
                    workHGate >= thresholds.workH.tunnel
                );
                record(
                    'tunnelVision.upkeepIdle',
                    'TUNNEL_VISION',
                    `Chores < ${thresholds.upkeep.tunnelChoreMax}h and workouts < ${thresholds.upkeep.tunnelWorkoutMax}h`,
                    `${choreHGate}h / ${workoutHGate}h`,
                    thresholds.upkeep.tunnelChoreMax,
                    choreHGate < thresholds.upkeep.tunnelChoreMax && workoutHGate < thresholds.upkeep.tunnelWorkoutMax
                );
                record(
                    'tunnelVision.exit',
                    'TUNNEL_VISION',
                    `Sanctuary caught up at ≥ ${thresholds.upkeep.tunnelExitChore}h chores or ≥ ${thresholds.upkeep.tunnelExitWorkout}h workouts`,
                    `${choreHGate}h / ${workoutHGate}h`,
                    thresholds.upkeep.tunnelExitChore,
                    tunnelVisionExit
                );

                const dialedInUpkeep = choreHGate >= thresholds.upkeep.dialedChore
                    || workoutHGate >= thresholds.upkeep.dialedWorkout;

                if (tunnelVisionTrigger && !tunnelVisionExit) {
                    stateId = 'TUNNEL_VISION';
                } else if (workHGate >= thresholds.workH.dialed
                    && avgQualityGate >= thresholds.quality.dialedAvg
                    && dialedInUpkeep) {
                    // 4. DIALED_IN — positive, high craft + balanced upkeep.
                    record(
                        'dialedIn.workH',
                        'DIALED_IN',
                        `Work hours ≥ ${thresholds.workH.dialed}h`,
                        workHGate,
                        thresholds.workH.dialed,
                        workHGate >= thresholds.workH.dialed
                    );
                    record(
                        'dialedIn.quality',
                        'DIALED_IN',
                        `Avg quality ≥ ${thresholds.quality.dialedAvg}`,
                        avgQualityGate,
                        thresholds.quality.dialedAvg,
                        avgQualityGate >= thresholds.quality.dialedAvg
                    );
                    record(
                        'dialedIn.upkeep',
                        'DIALED_IN',
                        `Upkeep ≥ ${thresholds.upkeep.dialedChore}h chores or ≥ ${thresholds.upkeep.dialedWorkout}h workouts`,
                        `${choreHGate}h / ${workoutHGate}h`,
                        thresholds.upkeep.dialedChore,
                        dialedInUpkeep
                    );
                    stateId = 'DIALED_IN';
                } else {
                    // 5. STEADY_CRUISE — default positive fallback.
                    stateId = 'STEADY_CRUISE';
                }
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
        workLogsCount,
        missingRatingCount,
        qualityCoverage: workLogsCount > 0
            ? _thermostatRound2((workLogsCount - missingRatingCount) / workLogsCount)
            : 0,
        ignoredFutureLogs,
        windowDays
    };

    return {
        state: definition.state,
        label: definition.label,
        tone: definition.tone,
        isCorrective: definition.isCorrective,
        isPlaceholder: Boolean(definition.isPlaceholder),
        message: definition.message,
        priority: definition.priority,
        action,
        quickActions: action.quickActions || [],
        recommendedPomo: action.recommendedPomo || null,
        metrics,
        explain,
        window: {
            startMs: currentStart,
            endMs: currentEnd,
            prevStartMs: prevStart,
            prevEndMs: prevEnd,
            windowDays,
            previousWindowDays: prevDays
        }
    };
}


/**
 * Tailwind token helper shared by the HUD badges and the adaptive panel.
 * Positive states use calm emerald/teal; corrective states use warm amber/sky;
 * the NO_DATA placeholder stays deliberately neutral (dashed slate).
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
        case 'NO_DATA':
            return 'bg-slate-800/80 text-slate-400 border-slate-600 border-dashed';
        default:
            return 'bg-slate-800 text-slate-300 border-slate-700';
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        computeHabitThermostat,
        resolveThermostatThresholds,
        getThermostatBadgeClasses,
        HABIT_THERMOSTAT_STATES,
        THERMOSTAT_THRESHOLD_DEFAULTS,
        THERMOSTAT_DAY_MS,
        THERMOSTAT_FUTURE_GRACE_MS,
        THERMOSTAT_DEFAULT_WINDOW_DAYS
    };
}

