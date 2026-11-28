// ============================================================================
// AUREUM — Horizon Analytics & Forecasting Unit Tests
// Run with: npm test
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildMonthlyTrajectory,
    mergeHorizonTrajectories,
    applyDuoSpilloverProjection,
    computeSweetSpot,
    computeDurationDistribution,
    HORIZON_DURATION_BANDS
} = require('../js/horizon.js');

const SETTINGS = { weeklyHours: 10, monthlyCash: 8000, maxBonusCapPct: 125, dailySoftCap: 4 };

function workLog(day, points, hours = 1, extra = {}) {
    return {
        type: 'work',
        user: 'North',
        points,
        hours,
        results: 4,
        effort: 3,
        timestamp: new Date(2026, 10, day, 10, 0, 0),
        ...extra
    };
}

function timedLog(type, hours, timestamp, extra = {}) {
    return { type, user: 'North', hours, timestamp, ...extra };
}

function closeTo(actual, expected, tolerance = 0.02, label = '') {
    assert.ok(Math.abs(actual - expected) <= tolerance,
        `${label || 'value'}: expected ${expected} ±${tolerance}, received ${actual}`);
}

test('day 1 with zero logs never divides by zero', () => {
    const t = buildMonthlyTrajectory([], SETTINGS, new Date(2026, 10, 1, 9, 0, 0));

    assert.equal(t.daysInMonth, 30); // November
    assert.equal(t.dayOfMonth, 1);
    assert.equal(t.elapsedDays, 1);
    assert.equal(t.remainingDays, 29);
    assert.equal(t.earnedSoFar, 0);
    assert.equal(t.dailyPaceBase, 0);
    assert.equal(t.dailyPaceHours, 0);
    assert.equal(t.projectedTotal, 0);
    assert.equal(t.projectedChoreHours, 0);
    assert.equal(t.projectedTier.tier, 0);
    assert.equal(t.hasLogs, false);

    [t.monthlyLimit, t.pointRate, t.projectedBase, t.baseToDate].forEach(value => {
        assert.ok(Number.isFinite(value), 'all scalars stay finite');
    });
    t.projectedBaseSeries.forEach(value => {
        assert.ok(value === null || Number.isFinite(value), 'projection series stays finite');
    });
});

test('month-to-date trajectory projects base allowance and chore tier at current pace', () => {
    const logs = [
        workLog(5, 10, 2),
        workLog(15, 20, 3),
        timedLog('chore', 12, new Date(2026, 10, 3, 12, 0, 0))
    ];
    const t = buildMonthlyTrajectory(logs, SETTINGS, new Date(2026, 10, 21, 18, 0, 0));

    closeTo(t.pointRate, 8000 / 120, 1e-9, 'point rate');
    assert.equal(t.monthlyLimit, 10000);
    closeTo(t.baseToDate, 30 * (8000 / 120), 0.05, 'base to date');
    assert.equal(t.currentTier.tier, 1);
    closeTo(t.earnedSoFar, 2000 * 1.05, 0.05, 'earned so far');
    closeTo(t.dailyPaceBase, 2000 / 21, 0.02, 'daily pace base');
    closeTo(t.projectedBase, 2000 + (2000 / 21) * 9, 0.05, 'projected base');
    assert.equal(t.projectedChoreHours, 17.14);
    assert.equal(t.projectedTier.tier, 1);
    closeTo(t.projectedTotal, (2000 + (2000 / 21) * 9) * 1.05, 0.05, 'projected payout');
    assert.equal(t.payoutCapped, false);
    assert.equal(t.projectedTotalSeries.length, 30);
    assert.equal(t.projectedTotalSeries[0], null);
    assert.equal(t.projectedTotalSeries[19], null);
    assert.notEqual(t.projectedTotalSeries[20], null);
    assert.notEqual(t.projectedTotalSeries[29], null);
});

test('projected chore hours can unlock a higher tier by month end', () => {
    const logs = [
        workLog(5, 10, 2),
        timedLog('chore', 9, new Date(2026, 10, 3, 12, 0, 0))
    ];
    const t = buildMonthlyTrajectory(logs, SETTINGS, new Date(2026, 10, 10, 12, 0, 0));

    assert.equal(t.currentTier.tier, 0, '9h is still Tier 0 today');
    assert.equal(t.projectedChoreHours, 27, '9h + 0.9h/day × 20 days');
    assert.equal(t.projectedTier.tier, 2, 'projected 27h unlocks Tier 2 (+10%)');
    closeTo(t.projectedTotal, t.projectedBase * 1.10, 0.05, 'projected payout uses projected tier');
});

test('monthly limit is a hard ceiling for actual and projected payout', () => {
    const logs = [
        workLog(2, 1000, 40),
        timedLog('chore', 60, new Date(2026, 10, 3, 12, 0, 0))
    ];
    const t = buildMonthlyTrajectory(logs, SETTINGS, new Date(2026, 10, 21, 12, 0, 0));

    assert.equal(t.currentTier.tier, 5);
    assert.equal(t.earnedSoFar, 10000);
    assert.equal(t.projectedTotal, 10000);
    assert.equal(t.payoutCapped, true);
    assert.ok(t.projectedTotal <= t.monthlyLimit);
});

test('logs from other months are ignored by the active-month trajectory', () => {
    const logs = [
        workLog(5, 10, 2),
        { type: 'work', user: 'North', points: 99, hours: 5, results: 5, effort: 5, timestamp: new Date(2026, 9, 5, 10, 0, 0) }
    ];
    const t = buildMonthlyTrajectory(logs, SETTINGS, new Date(2026, 10, 21, 12, 0, 0));
    closeTo(t.pointsToDate, 10, 1e-9, 'only November points count');
});


test('sweet spot highlights the highest-quality window and the biggest strain gap', () => {
    const logs = [
        // 09:00–11:00 block: quality 5, low effort, 3 sessions
        workLog(7, 10, 1, { results: 5, effort: 2, timestamp: new Date(2026, 10, 7, 9, 10, 0) }),
        workLog(8, 10, 1, { results: 5, effort: 2, timestamp: new Date(2026, 10, 8, 9, 40, 0) }),
        workLog(9, 10, 1, { results: 5, effort: 2, timestamp: new Date(2026, 10, 9, 10, 5, 0) }),
        // 15:00–17:00 block: quality 2, high effort, 3 sessions
        workLog(7, 10, 1, { results: 2, effort: 5, timestamp: new Date(2026, 10, 7, 15, 10, 0) }),
        workLog(8, 10, 1, { results: 2, effort: 5, timestamp: new Date(2026, 10, 8, 15, 40, 0) }),
        workLog(9, 10, 1, { results: 2, effort: 5, timestamp: new Date(2026, 10, 9, 16, 5, 0) })
    ];
    const sweet = computeSweetSpot(logs);

    assert.equal(sweet.totalSessions, 6);
    assert.equal(sweet.hours[9].count, 2);
    assert.equal(sweet.hours[10].count, 1);
    assert.ok(sweet.peakWindow, 'peak window detected');
    assert.equal(sweet.peakWindow.startHour, 9);
    assert.equal(sweet.peakWindow.avgQuality, 5);
    assert.ok(sweet.strainWindow, 'strain window detected');
    assert.equal(sweet.strainWindow.startHour, 15);
    assert.equal(sweet.strainWindow.gap, 3);
});

test('sweet spot requires at least two sessions and tolerates empty logs', () => {
    const empty = computeSweetSpot([]);
    assert.equal(empty.hasData, false);
    assert.equal(empty.peakWindow, null);
    assert.equal(empty.strainWindow, null);

    const single = computeSweetSpot([
        workLog(5, 10, 1, { results: 5, effort: 1, timestamp: new Date(2026, 10, 5, 9, 0, 0) })
    ]);
    assert.equal(single.hasData, true);
    assert.equal(single.peakWindow, null, 'a single session is not a 2-hour block');
});

test('duration distribution falls back to work logs when Pomodoro history is sparse', () => {
    const logs = [
        workLog(5, 10, 0.5, { results: 3 }),
        workLog(6, 10, 1.0, { results: 5 }),
        workLog(7, 10, 1.5, { results: 4 })
    ];
    const sparsePomo = [{ durationSecs: 600, wasPaused: false, timestamp: Date.now() }];
    const dist = computeDurationDistribution(logs, sparsePomo);

    assert.equal(dist.source, 'worklogs');
    assert.equal(dist.totalSessions, 3);
    const standard = dist.buckets.find(b => b.key === 'standard');
    const deep = dist.buckets.find(b => b.key === 'deep');
    assert.equal(standard.count, 1); // 30m
    assert.equal(standard.avgQuality, 3);
    assert.equal(deep.count, 1); // 60m
    assert.equal(deep.avgQuality, 5);
    assert.equal(dist.mostPicked.key, 'standard');
    assert.equal(dist.bestQuality.key, 'deep');
});


test('duration distribution uses Pomodoro history when it has three or more sessions', () => {
    const logs = [
        workLog(5, 10, 0.5, { results: 4, timestamp: new Date(2026, 10, 5, 10, 0, 0) })
    ];
    const pomo = [
        { durationSecs: 10 * 60, wasPaused: false, timestamp: new Date(2026, 10, 5, 10, 2, 0) },  // micro, Q4 nearby
        { durationSecs: 25 * 60, wasPaused: false, timestamp: new Date(2026, 10, 5, 15, 0, 0) },  // standard, no log nearby
        { durationSecs: 40 * 60, wasPaused: false, timestamp: new Date(2026, 10, 6, 9, 0, 0) },   // extended
        { durationSecs: 90 * 60, wasPaused: false, timestamp: new Date(2026, 10, 7, 9, 0, 0) }    // marathon
    ];
    const dist = computeDurationDistribution(logs, pomo);

    assert.equal(dist.source, 'pomodoro');
    assert.equal(dist.totalSessions, 4);
    assert.equal(dist.buckets.find(b => b.key === 'micro').count, 1);
    assert.equal(dist.buckets.find(b => b.key === 'micro').avgQuality, 4);
    assert.equal(dist.buckets.find(b => b.key === 'standard').count, 1);
    assert.equal(dist.buckets.find(b => b.key === 'standard').avgQuality, null);
    assert.equal(dist.buckets.find(b => b.key === 'extended').count, 1);
    assert.equal(dist.buckets.find(b => b.key === 'marathon').count, 1);
    assert.equal(dist.buckets.find(b => b.key === 'deep').count, 0);
});

test('duration buckets honor exact band boundaries', () => {
    const caseFor = (mins) => {
        const dist = computeDurationDistribution(
            [workLog(5, 10, mins / 60, { results: 3 })],
            []
        );
        return dist.buckets.find(b => b.count > 0).key;
    };
    assert.equal(HORIZON_DURATION_BANDS.length, 5);
    assert.equal(caseFor(19.9), 'micro');
    assert.equal(caseFor(20), 'standard');
    assert.equal(caseFor(34.9), 'standard');
    assert.equal(caseFor(35), 'extended');
    assert.equal(caseFor(54.9), 'extended');
    assert.equal(caseFor(55), 'deep');
    assert.equal(caseFor(84.9), 'deep');
    assert.equal(caseFor(85), 'marathon');
});

test('duo trajectories merge independent ledgers without losing totals', () => {
    const now = new Date(2026, 10, 21, 12, 0, 0);
    const north = buildMonthlyTrajectory([workLog(5, 10, 2)], SETTINGS, now);
    const cream = buildMonthlyTrajectory(
        [workLog(6, 20, 3), timedLog('chore', 10, new Date(2026, 10, 7, 12, 0, 0))],
        SETTINGS,
        now
    );
    const duo = mergeHorizonTrajectories(north, cream);

    assert.equal(duo.isDuo, true);
    closeTo(duo.earnedSoFar, north.earnedSoFar + cream.earnedSoFar, 0.02, 'combined earnings');
    closeTo(duo.projectedTotal, north.projectedTotal + cream.projectedTotal, 0.02, 'combined projection');
    closeTo(duo.projectedChoreHours, north.projectedChoreHours + cream.projectedChoreHours, 0.02, 'combined chores');
    assert.equal(duo.daysInMonth, 30);
    assert.equal(duo.projectedTotalSeries.length, 30);
    assert.equal(duo.monthlyLimit, north.monthlyLimit + cream.monthlyLimit);
});


test('duo spillover projection transfers the excess 1:1 and keeps the personal curve capped', () => {
    const now = new Date(2026, 10, 21, 12, 0, 0);
    // North blows past the ฿10,000 ceiling; Cream is comfortably below it.
    const north = buildMonthlyTrajectory([workLog(5, 1000, 40)], SETTINGS, now);
    const cream = buildMonthlyTrajectory([workLog(6, 20, 3)], SETTINGS, now);
    const pair = applyDuoSpilloverProjection(north, cream);

    assert.equal(north.personalCeiling, 10000);
    assert.ok(north.mtdOverflow > 0);
    assert.equal(pair.North.spilloverSentActual, north.mtdOverflow);
    assert.equal(pair.North.spilloverReceivedActual, 0);
    assert.equal(pair.North.earnedSoFar, 10000, 'sender stays exactly at the personal ceiling');

    assert.equal(pair.Cream.spilloverSentActual, 0);
    assert.equal(pair.Cream.spilloverReceivedActual, north.mtdOverflow);
    closeTo(pair.Cream.earnedSoFar, cream.earnedSoFar + north.mtdOverflow, 0.02, 'receiver payout includes the transfer');

    // Month-end projection mirrors the same rule and the last projected point
    // equals the headline projected total to the cent.
    assert.equal(pair.North.projectedTotal, 10000);
    closeTo(pair.Cream.projectedTotal, cream.projectedTotal + north.projectedOverflow, 0.02, 'projected transfer');
    const lastIdx = pair.Cream.projectedTotalSeries.length - 1;
    closeTo(pair.Cream.projectedTotalSeries[lastIdx], pair.Cream.projectedTotal, 0.02, 'series ends at projected total');

    // The sender keeps the uncapped overflow series for the dashed chart segment.
    assert.ok(pair.North.projectedOverflowSeries.some(value => value !== null));
});

test('duo spillover projection cancels when both partners are over the ceiling', () => {
    const now = new Date(2026, 10, 21, 12, 0, 0);
    const north = buildMonthlyTrajectory([workLog(5, 1000, 40)], SETTINGS, now);
    const cream = buildMonthlyTrajectory([workLog(6, 1000, 40)], SETTINGS, now);
    const pair = applyDuoSpilloverProjection(north, cream);

    assert.ok(north.mtdOverflow > 0);
    assert.ok(cream.mtdOverflow > 0);
    assert.equal(pair.North.spilloverSentActual, 0);
    assert.equal(pair.North.spilloverReceivedActual, 0);
    assert.equal(pair.Cream.spilloverSentActual, 0);
    assert.equal(pair.Cream.spilloverReceivedActual, 0);
    assert.equal(pair.North.projectedTotal, 10000);
    assert.equal(pair.Cream.projectedTotal, 10000);
    assert.equal(pair.North.bothMaxed, true);
});

test('merging spillover-adjusted trajectories sums household payouts', () => {
    const now = new Date(2026, 10, 21, 12, 0, 0);
    const north = buildMonthlyTrajectory([workLog(5, 1000, 40)], SETTINGS, now);
    const cream = buildMonthlyTrajectory([workLog(6, 20, 3)], SETTINGS, now);
    const pair = applyDuoSpilloverProjection(north, cream);
    const duo = mergeHorizonTrajectories(pair.North, pair.Cream);

    closeTo(duo.projectedTotal, pair.North.projectedTotal + pair.Cream.projectedTotal, 0.02, 'combined payout');
    assert.equal(duo.projectedTotalSeries.length, 30);
    assert.ok(duo.spilloverReceivedProjected > 0);
});


test('month-end horizon payout matches the pure duo allowance to the cent', () => {
    const { computeDuoMonthlyAllowance } = require('../js/choreMultiplier.js');
    const now = new Date(2026, 10, 30, 23, 0, 0); // last day of November 2026
    const logs = [
        { type: 'work', user: 'North', points: 135, hours: 50, timestamp: new Date(2026, 10, 2, 10, 0, 0) },
        { type: 'chore', user: 'North', hours: 50, timestamp: new Date(2026, 10, 3, 10, 0, 0) }
    ];
    const north = buildMonthlyTrajectory(logs.filter(l => l.user === 'North'), SETTINGS, now);
    const cream = buildMonthlyTrajectory([], SETTINGS, now);
    const pair = applyDuoSpilloverProjection(north, cream);
    const duo = computeDuoMonthlyAllowance(logs, { North: SETTINGS, Cream: SETTINGS }, 2026, 10);

    // ฿9,000 base × 1.25 = ฿11,250 raw; personal ceiling ฿10,000; ฿1,250 spills.
    assert.equal(duo.North.spilloverSent, 1250);
    assert.equal(duo.Cream.finalPayout, 1250);
    assert.equal(pair.North.projectedTotal, duo.North.finalPayout);
    assert.equal(pair.Cream.projectedTotal, duo.Cream.finalPayout);
    assert.equal(pair.North.earnedSoFar, duo.North.finalPayout);
    assert.equal(pair.Cream.earnedSoFar, duo.Cream.finalPayout);
});

