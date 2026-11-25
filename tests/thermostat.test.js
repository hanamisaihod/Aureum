// ============================================================================
// AUREUM — 6-State Habit Thermostat Unit Tests
// Run with: npm test
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    computeHabitThermostat,
    resolveThermostatThresholds,
    HABIT_THERMOSTAT_STATES,
    THERMOSTAT_THRESHOLD_DEFAULTS,
    THERMOSTAT_DAY_MS,
    THERMOSTAT_FUTURE_GRACE_MS,
    THERMOSTAT_DEFAULT_WINDOW_DAYS
} = require('../js/thermostat.js');

const REF = new Date(2026, 10, 15, 12, 0, 0).getTime(); // Nov 15 2026, 12:00 local

function makeLog(type, hours, daysAgo, extra = {}) {
    return {
        type,
        hours,
        timestamp: new Date(2026, 10, 15 - daysAgo, 10, 0, 0),
        ...extra
    };
}

function at(type, hours, timestampMs, extra = {}) {
    return { type, hours, timestamp: new Date(timestampMs), ...extra };
}

test('OVERHEATING wins priority over TUNNEL_VISION and reports rolling metrics', () => {
    const logs = [
        makeLog('work', 6, 0, { results: 3, effort: 4.5 }),
        makeLog('work', 5, 2, { results: 3, effort: 4.5 }),
        makeLog('work', 5, 4, { results: 3, effort: 4.5 }),
        // Previous 7-day window: quality was materially higher.
        makeLog('work', 4, 8, { results: 4, effort: 4 }),
        makeLog('work', 4, 10, { results: 4, effort: 4 })
    ];

    const result = computeHabitThermostat(logs, {}, REF);

    assert.equal(result.state, 'OVERHEATING');
    assert.equal(result.label, '🔥 Overheating');
    assert.equal(result.tone, 'corrective');
    assert.equal(result.isCorrective, true);
    assert.equal(result.priority, 1);
    assert.equal(result.metrics.workH, 16);
    assert.equal(result.metrics.choreH, 0);
    assert.equal(result.metrics.workoutH, 0);
    assert.equal(result.metrics.totalH, 16);
    assert.equal(result.metrics.activeDays, 3);
    assert.equal(result.metrics.avgEffort, 4.5);
    assert.equal(result.metrics.avgQuality, 3);
    assert.equal(result.metrics.prevAvgQuality, 4);
    assert.equal(result.metrics.hadFullWorkRestLast24h, false);
    assert.equal(result.metrics.lastTwoWorkLowEffort, false);

    assert.equal(result.action.type, 'OVERHEATING');
    assert.deepEqual(result.recommendedPomo, { workMins: 25, breakMins: 10 });
    assert.equal(result.quickActions.length, 1);
    assert.equal(result.quickActions[0].type, 'work');
    assert.equal(result.quickActions[0].mins, 25);
});

test('NO_DATA placeholder for a completely empty history', () => {
    const result = computeHabitThermostat([], {}, REF);

    assert.equal(result.state, 'NO_DATA');
    assert.equal(result.label, '⏳ Warming Up');
    assert.equal(result.tone, 'neutral');
    assert.equal(result.isCorrective, false);
    assert.equal(result.isPlaceholder, true);
    assert.equal(result.priority, 0);
    assert.equal(result.metrics.workH, 0);
    assert.equal(result.metrics.totalH, 0);
    assert.equal(result.metrics.activeDays, 0);
    assert.equal(result.metrics.avgEffort, 0);
    assert.equal(result.metrics.avgQuality, 0);
    assert.equal(result.metrics.prevAvgQuality, 0);
    assert.equal(result.quickActions.length, 1);
    assert.deepEqual(result.quickActions.map(a => a.type), ['work']);
    assert.equal(result.explain[0].id, 'noData.usableLogs');
    assert.equal(result.explain[0].passed, false);
});

test('stale history stays COLD_START instead of NO_DATA', () => {
    // The user logged 40 days ago: nothing in either window, but history exists,
    // so the honest read is "low momentum", not "no data yet".
    const stale = [makeLog('work', 4, 40, { results: 4, effort: 3 })];
    const result = computeHabitThermostat(stale, {}, REF);

    assert.equal(result.state, 'COLD_START');
    assert.equal(result.metrics.totalH, 0);
    assert.equal(result.isPlaceholder, false);
    assert.equal(result.explain[0].id, 'noData.usableLogs');
    assert.equal(result.explain[0].passed, true);
});

test('COLD_START hysteresis: 3.5h stays cold until totalH >= 4.5 and activeDays >= 3', () => {
    const coldLogs = [
        makeLog('work', 1, 0, { results: 3, effort: 3 }),
        makeLog('work', 1, 2, { results: 3, effort: 3 }),
        makeLog('work', 0.75, 4, { results: 3, effort: 3 }),
        makeLog('work', 0.75, 6, { results: 3, effort: 3 })
    ];

    const stillCold = computeHabitThermostat(coldLogs, {}, REF);
    assert.equal(stillCold.metrics.totalH, 3.5);
    assert.equal(stillCold.metrics.activeDays, 4);
    assert.equal(stillCold.state, 'COLD_START');

    // Crossing 4.5h with 4 active days clears the cold-start guardrail.
    const recovered = computeHabitThermostat(
        [...coldLogs, makeLog('work', 1, 5, { results: 3, effort: 3 })],
        {},
        REF
    );
    assert.equal(recovered.metrics.totalH, 4.5);
    assert.notEqual(recovered.state, 'COLD_START');
    assert.equal(recovered.state, 'STEADY_CRUISE');

    // Without 3 active days the state remains cold even with high total hours.
    const twoDays = [
        makeLog('work', 2.5, 0, { results: 3, effort: 3 }),
        makeLog('work', 2.5, 2, { results: 3, effort: 3 })
    ];
    const spiky = computeHabitThermostat(twoDays, {}, REF);
    assert.equal(spiky.metrics.totalH, 5);
    assert.equal(spiky.metrics.activeDays, 2);
    assert.equal(spiky.state, 'COLD_START');
});

test('TUNNEL_VISION triggers on heavy focus with idle upkeep', () => {
    const logs = [
        makeLog('work', 3, 0, { results: 3, effort: 3.2 }),
        makeLog('work', 3, 2, { results: 3, effort: 3.2 }),
        makeLog('work', 2, 4, { results: 3, effort: 3.2 })
    ];

    const result = computeHabitThermostat(logs, {}, REF);

    assert.equal(result.state, 'TUNNEL_VISION');
    assert.equal(result.label, '🔭 Tunnel-Vision');
    assert.equal(result.metrics.workH, 8);
    assert.equal(result.metrics.choreH, 0);
    assert.equal(result.metrics.workoutH, 0);
    assert.equal(result.metrics.totalH, 8);
    assert.equal(result.metrics.activeDays, 3);
    assert.deepEqual(result.quickActions.map(a => a.type), ['chore', 'workout']);
});

test('TUNNEL_VISION exits once chores or workouts catch up', () => {
    const base = [
        makeLog('work', 3, 0, { results: 3, effort: 3.2 }),
        makeLog('work', 3, 2, { results: 3, effort: 3.2 }),
        makeLog('work', 2, 4, { results: 3, effort: 3.2 })
    ];

    const choreCaughtUp = computeHabitThermostat(
        [...base, makeLog('chore', 2.1, 1)],
        {},
        REF
    );
    assert.equal(choreCaughtUp.metrics.choreH, 2.1);
    assert.notEqual(choreCaughtUp.state, 'TUNNEL_VISION');
    assert.equal(choreCaughtUp.state, 'STEADY_CRUISE');

    const workoutCaughtUp = computeHabitThermostat(
        [...base, makeLog('workout', 1.3, 1)],
        {},
        REF
    );
    assert.equal(workoutCaughtUp.metrics.workoutH, 1.3);
    assert.notEqual(workoutCaughtUp.state, 'TUNNEL_VISION');
    assert.equal(workoutCaughtUp.state, 'STEADY_CRUISE');
});

test('DIALED_IN requires high quality plus balanced upkeep', () => {
    const logs = [
        makeLog('work', 3, 0, { results: 4, effort: 3.4 }),
        makeLog('work', 3, 2, { results: 4, effort: 3.4 }),
        makeLog('work', 3, 4, { results: 4, effort: 3.4 }),
        makeLog('chore', 2, 1),
        makeLog('workout', 1, 3)
    ];

    const result = computeHabitThermostat(logs, {}, REF);

    assert.equal(result.state, 'DIALED_IN');
    assert.equal(result.label, '⚡ Dialed In');
    assert.equal(result.tone, 'positive');
    assert.equal(result.isCorrective, false);
    assert.equal(result.metrics.workH, 9);
    assert.equal(result.metrics.choreH, 2);
    assert.equal(result.metrics.workoutH, 1);
    assert.equal(result.metrics.totalH, 12);
    assert.equal(result.metrics.avgQuality, 4);
    assert.deepEqual(result.quickActions, []);
});

test('DIALED_IN accepts the exact 3.8 quality boundary', () => {
    const logs = [
        makeLog('work', 3, 0, { results: 3.8, effort: 3.4 }),
        makeLog('work', 3, 2, { results: 3.8, effort: 3.4 }),
        makeLog('work', 3, 4, { results: 3.8, effort: 3.4 }),
        makeLog('chore', 2, 1)
    ];

    const result = computeHabitThermostat(logs, {}, REF);
    assert.equal(result.metrics.avgQuality, 3.8);
    assert.equal(result.state, 'DIALED_IN');
});

test('STEADY_CRUISE is the positive fallback when no alarm or peak applies', () => {
    const logs = [
        makeLog('work', 2, 0, { results: 3, effort: 3 }),
        makeLog('work', 2, 2, { results: 3, effort: 3 }),
        makeLog('work', 1, 4, { results: 3, effort: 3 }),
        makeLog('chore', 0.5, 1),
        makeLog('workout', 0.5, 3)
    ];

    const result = computeHabitThermostat(logs, {}, REF);

    assert.equal(result.state, 'STEADY_CRUISE');
    assert.equal(result.label, '🌿 Steady Cruise');
    assert.equal(result.tone, 'positive');
    assert.equal(result.metrics.workH, 5);
    assert.equal(result.metrics.totalH, 6);
    assert.deepEqual(result.quickActions, []);
});

test('OVERHEATING clears when a full work-rest day exists in the last 24h', () => {
    const logs = [
        makeLog('work', 6, 2, { results: 3, effort: 4.5 }),
        makeLog('work', 5, 4, { results: 3, effort: 4.5 }),
        makeLog('work', 5, 6, { results: 3, effort: 4.5 }),
        makeLog('work', 4, 8, { results: 4, effort: 4 }),
        makeLog('work', 4, 10, { results: 4, effort: 4 })
    ];

    const result = computeHabitThermostat(logs, {}, REF);

    assert.equal(result.metrics.hadFullWorkRestLast24h, true);
    assert.notEqual(result.state, 'OVERHEATING');
    assert.equal(result.state, 'TUNNEL_VISION');
});

test('OVERHEATING clears when the two latest work logs are low effort', () => {
    const logs = [
        makeLog('work', 1.5, 0, { results: 3, effort: 3 }),
        makeLog('work', 1.5, 1, { results: 3, effort: 3 }),
        makeLog('work', 2, 2, { results: 3, effort: 5 }),
        makeLog('work', 2, 3, { results: 3, effort: 5 }),
        makeLog('work', 7, 4, { results: 3, effort: 5 })
    ];

    const result = computeHabitThermostat(logs, {}, REF);

    assert.equal(result.metrics.workH, 14);
    assert.equal(result.metrics.avgEffort, 4.2);
    assert.equal(result.metrics.lastTwoWorkLowEffort, true);
    assert.notEqual(result.state, 'OVERHEATING');
    assert.equal(result.state, 'TUNNEL_VISION');
});

test('COLD_START outranks heavier states when active days are too low', () => {
    const coldButHeavy = [
        makeLog('work', 6, 0, { results: 4, effort: 3.4 }),
        makeLog('work', 6, 1, { results: 4, effort: 3.4 })
    ];
    const cold = computeHabitThermostat(coldButHeavy, {}, REF);
    assert.equal(cold.metrics.workH, 12);
    assert.equal(cold.metrics.activeDays, 2);
    assert.equal(cold.state, 'COLD_START');
});


test('rolling windows respect the 7d/14d boundaries and +5m future grace', () => {
    const logs = [
        at('work', 1, REF - (14 * THERMOSTAT_DAY_MS), { results: 1, effort: 3 }),
        at('work', 2, REF - (7 * THERMOSTAT_DAY_MS), { results: 4, effort: 3 }),
        at('work', 3, REF + THERMOSTAT_FUTURE_GRACE_MS, { results: 3, effort: 3 }),
        at('work', 4, REF + THERMOSTAT_FUTURE_GRACE_MS + 1, { results: 2, effort: 3 })
    ];

    const result = computeHabitThermostat(logs, {}, REF);

    // Only the +5m log is inside the current window; -7d lands in prevWindow.
    assert.equal(result.metrics.workH, 3);
    assert.equal(result.metrics.workLogsCount, 1);
    assert.equal(result.metrics.avgQuality, 3);
    assert.equal(result.metrics.prevAvgQuality, 4);
});

test('invalid and non-array inputs are handled defensively', () => {
    for (const input of [null, undefined, {}, 'not-a-log-array', 42]) {
        const result = computeHabitThermostat(input, null, REF);
        assert.equal(result.state, 'NO_DATA');
        assert.equal(result.metrics.totalH, 0);
        assert.equal(result.metrics.activeDays, 0);
    }

    const malformed = [
        null,
        {},
        { type: 'work', hours: 4 },
        { type: 'work', hours: 4, timestamp: 'not-a-date' },
        { type: 'work', hours: 2, timestamp: { toDate: () => new Date(REF - 1000) } }
    ];
    const result = computeHabitThermostat(malformed, {}, REF);
    assert.equal(result.metrics.workH, 2);
    assert.equal(result.metrics.workLogsCount, 1);
});

test('every state definition exposes the required label, message, and adaptive action', () => {
    const expected = {
        NO_DATA: ['⏳ Warming Up', false, 0],
        OVERHEATING: ['🔥 Overheating', true, 1],
        COLD_START: ['❄️ Cold Start', true, 2],
        TUNNEL_VISION: ['🔭 Tunnel-Vision', true, 3],
        DIALED_IN: ['⚡ Dialed In', false, 4],
        STEADY_CRUISE: ['🌿 Steady Cruise', false, 5]
    };

    Object.entries(expected).forEach(([key, meta]) => {
        const def = HABIT_THERMOSTAT_STATES[key];
        assert.ok(def, `${key} definition exists`);
        assert.equal(def.label, meta[0]);
        assert.equal(def.isCorrective, meta[1]);
        assert.equal(def.priority, meta[2]);
        assert.equal(def.state, key);
        assert.equal(typeof def.message, 'string');
        assert.ok(def.message.length > 0);
        assert.equal(def.action.type, key);
        assert.ok(Array.isArray(def.action.quickActions));
    });

    assert.deepEqual(HABIT_THERMOSTAT_STATES.OVERHEATING.action.recommendedPomo, { workMins: 25, breakMins: 10 });
    assert.deepEqual(HABIT_THERMOSTAT_STATES.COLD_START.action.quickActions, [
        { label: '15m Starter Craft', type: 'work', mins: 15 },
        { label: '10m Quick Tidy', type: 'chore', mins: 10 }
    ]);
    assert.deepEqual(HABIT_THERMOSTAT_STATES.TUNNEL_VISION.action.quickActions, [
        { label: '15m Sanctuary Reset', type: 'chore', mins: 15 },
        { label: '15m Mobility / Walk', type: 'workout', mins: 15 }
    ]);
    assert.deepEqual(HABIT_THERMOSTAT_STATES.NO_DATA.action.quickActions, [
        { label: '15m Starter Craft', type: 'work', mins: 15 }
    ]);
});

test('windowDays widens the rolling window for monthly Codex cards', () => {
    const logs = [
        makeLog('work', 2, 1, { results: 4, effort: 3 }),
        makeLog('work', 2, 3, { results: 4, effort: 3 }),
        makeLog('work', 2, 20, { results: 4, effort: 3 }),
        makeLog('work', 2, 25, { results: 4, effort: 3 })
    ];

    const weekly = computeHabitThermostat(logs, {}, REF);
    assert.equal(weekly.metrics.windowDays, THERMOSTAT_DEFAULT_WINDOW_DAYS);
    assert.equal(weekly.metrics.workH, 4);

    const monthly = computeHabitThermostat(logs, {}, REF, { windowDays: 30 });
    assert.equal(monthly.metrics.windowDays, 30);
    assert.equal(monthly.metrics.workH, 8);
    assert.equal(monthly.window.windowDays, 30);
    assert.equal(monthly.window.previousWindowDays, 30);
    assert.equal(monthly.window.endMs, REF + THERMOSTAT_FUTURE_GRACE_MS);

    // Out-of-range / junk options fall back to the 7-day default.
    assert.equal(computeHabitThermostat(logs, {}, REF, { windowDays: 'nope' }).metrics.windowDays, 7);
    assert.equal(computeHabitThermostat(logs, {}, REF, { windowDays: 0 }).metrics.windowDays, 7);
});

test('thresholds derive from weeklyHours and accept explicit overrides', () => {
    assert.deepEqual(resolveThermostatThresholds({}), JSON.parse(JSON.stringify(THERMOSTAT_THRESHOLD_DEFAULTS)));
    assert.deepEqual({ ...resolveThermostatThresholds({ weeklyHours: 10 }).workH }, { overheat: 14, tunnel: 8, dialed: 8 });
    assert.deepEqual({ ...resolveThermostatThresholds({ weeklyHours: 20 }).workH }, { overheat: 28, tunnel: 16, dialed: 16 });
    assert.deepEqual(
        { ...resolveThermostatThresholds({ weeklyHours: 20, thermostat: { workH: { overheat: 18 } } }).workH },
        { overheat: 18, tunnel: 16, dialed: 16 }
    );
    // Junk overrides fall through to the derived/default gate.
    assert.deepEqual(
        { ...resolveThermostatThresholds({ thermostat: { workH: { overheat: 'nope', tunnel: -4 } } }).workH },
        { overheat: 14, tunnel: 8, dialed: 8 }
    );
    assert.equal(resolveThermostatThresholds(null).quality.dialedAvg, 3.8);
});

test('weeklyHours target scales the OVERHEATING ceiling', () => {
    const logs = [
        makeLog('work', 6, 0, { results: 3, effort: 4.5 }),
        makeLog('work', 5, 2, { results: 3, effort: 4.5 }),
        makeLog('work', 5, 4, { results: 3, effort: 4.5 })
    ];

    const defaultTarget = computeHabitThermostat(logs, {}, REF);
    assert.equal(defaultTarget.state, 'OVERHEATING');

    const highTarget = computeHabitThermostat(logs, { weeklyHours: 20 }, REF);
    assert.notEqual(highTarget.state, 'OVERHEATING');
    assert.equal(highTarget.explain.find(e => e.id === 'overheating.workH').threshold, 28);
});

test('missing quality ratings are counted without changing the fallback maths', () => {
    const logs = [
        makeLog('work', 3, 0, { results: 4, effort: 3.4 }),
        makeLog('work', 3, 2, { effort: 3.4 }),
        makeLog('work', 3, 4, { effort: 3.4 })
    ];

    const result = computeHabitThermostat(logs, {}, REF);

    assert.equal(result.metrics.workLogsCount, 3);
    assert.equal(result.metrics.missingRatingCount, 2);
    assert.equal(result.metrics.qualityCoverage, 0.33);
    // Unrated logs keep contributing the 3.0 fallback: (4 + 3 + 3) / 3.
    assert.equal(result.metrics.avgQuality, 3.33);
});

test('explain traces the rules that produced the winning state', () => {
    const logs = [
        makeLog('work', 6, 0, { results: 3, effort: 4.5 }),
        makeLog('work', 5, 2, { results: 3, effort: 4.5 }),
        makeLog('work', 5, 4, { results: 3, effort: 4.5 })
    ];
    const result = computeHabitThermostat(logs, {}, REF);
    assert.equal(result.state, 'OVERHEATING');

    const reasons = result.explain.filter(e => e.state === result.state && e.passed && !e.skipped);
    const ids = reasons.map(e => e.id);
    assert.ok(ids.includes('overheating.workH'), 'work-hour gate is explained');
    assert.ok(ids.includes('overheating.effort'), 'effort gate is explained');
    assert.equal(result.explain.find(e => e.id === 'overheating.qualityDrop').passed, false);
    assert.equal(result.explain.find(e => e.id === 'overheating.hysteresis').passed, true);

    // Every entry is renderable by the HUD popup.
    result.explain.forEach(entry => {
        assert.equal(typeof entry.id, 'string');
        assert.equal(typeof entry.label, 'string');
        assert.ok(entry.label.length > 0);
        assert.equal(typeof entry.passed, 'boolean');
        assert.equal(typeof entry.skipped, 'boolean');
        assert.ok(entry.threshold === null || typeof entry.threshold === 'number');
    });
});

test('exactly one state is returned for a spread of log histories', () => {
    const fixtures = [
        [],
        [makeLog('work', 1, 0, { results: 3, effort: 3 })],
        [
            makeLog('work', 6, 0, { results: 3, effort: 4.5 }),
            makeLog('work', 5, 2, { results: 3, effort: 4.5 }),
            makeLog('work', 5, 4, { results: 3, effort: 4.5 })
        ],
        [
            makeLog('work', 3, 0, { results: 3, effort: 3.2 }),
            makeLog('work', 3, 2, { results: 3, effort: 3.2 }),
            makeLog('work', 2, 4, { results: 3, effort: 3.2 })
        ],
        [
            makeLog('work', 3, 0, { results: 4, effort: 3.4 }),
            makeLog('work', 3, 2, { results: 4, effort: 3.4 }),
            makeLog('work', 3, 4, { results: 4, effort: 3.4 }),
            makeLog('chore', 2, 1)
        ],
        [makeLog('chore', 1, 0), makeLog('workout', 0.5, 2)],
        [{ type: 'work', hours: 4 }],
        [
            makeLog('work', 12, 0, { results: 4, effort: 3 }),
            makeLog('work', 12, 1, { results: 4, effort: 3 })
        ]
    ];

    fixtures.forEach((logs, index) => {
        const result = computeHabitThermostat(logs, {}, REF);
        const definition = HABIT_THERMOSTAT_STATES[result.state];
        assert.ok(definition, `fixture ${index} produced a known state`);
        assert.equal(definition.state, result.state, `fixture ${index} state id matches`);
        assert.equal(definition.label, result.label, `fixture ${index} label matches`);
        assert.equal(definition.priority, result.priority, `fixture ${index} priority matches`);
        assert.equal(typeof result.metrics.totalH, 'number');
        assert.ok(Array.isArray(result.explain) && result.explain.length > 0, `fixture ${index} carries an explain trace`);
    });
});

test('state tally stays 3 corrective versus 3 positive-or-neutral', () => {
    const states = Object.values(HABIT_THERMOSTAT_STATES);

    const corrective = states.filter(s => s.isCorrective).map(s => s.state).sort();
    const other = states.filter(s => !s.isCorrective).map(s => s.state).sort();

    assert.deepEqual(corrective, ['COLD_START', 'OVERHEATING', 'TUNNEL_VISION']);
    assert.deepEqual(other, ['DIALED_IN', 'NO_DATA', 'STEADY_CRUISE']);
    // NO_DATA is a neutral placeholder, so only two states are genuinely positive.
    assert.equal(states.filter(s => !s.isCorrective && !s.isPlaceholder).length, 2);
    assert.deepEqual(states.map(s => s.priority).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
});

