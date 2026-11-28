// ============================================================================
// AUREUM — Monthly Chore-to-Allowance Multiplier Unit Tests
// Run with: npm test
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    calculateChoreMultiplier,
    calculateMonthlyAllowanceBreakdown,
    sumMonthlyChoreHours
} = require('../js/choreMultiplier.js');

test('tier ladder boundary conditions', () => {
    const cases = [
        { hours: 0, tier: 0, multiplier: 1.00, bonusPercent: '0%', hoursToNextTier: 10, isMaxTier: false, progressPercent: 0 },
        { hours: 9.99, tier: 0, multiplier: 1.00, bonusPercent: '0%', hoursToNextTier: 0.01, isMaxTier: false, progressPercent: 99.9 },
        { hours: 10, tier: 1, multiplier: 1.05, bonusPercent: '5%', hoursToNextTier: 10, isMaxTier: false, progressPercent: 0 },
        { hours: 16.75, tier: 1, multiplier: 1.05, bonusPercent: '5%', hoursToNextTier: 3.25, isMaxTier: false, progressPercent: 67.5 },
        { hours: 19.99, tier: 1, multiplier: 1.05, bonusPercent: '5%', hoursToNextTier: 0.01, isMaxTier: false, progressPercent: 99.9 },
        { hours: 26.75, tier: 2, multiplier: 1.10, bonusPercent: '10%', hoursToNextTier: 3.25, isMaxTier: false, progressPercent: 67.5 },
        { hours: 39.99, tier: 3, multiplier: 1.15, bonusPercent: '15%', hoursToNextTier: 0.01, isMaxTier: false, progressPercent: 99.9 },
        { hours: 49.99, tier: 4, multiplier: 1.20, bonusPercent: '20%', hoursToNextTier: 0.01, isMaxTier: false, progressPercent: 99.9 },
        { hours: 50, tier: 5, multiplier: 1.25, bonusPercent: '25%', hoursToNextTier: 0, isMaxTier: true, progressPercent: 100 },
        { hours: 60, tier: 5, multiplier: 1.25, bonusPercent: '25%', hoursToNextTier: 0, isMaxTier: true, progressPercent: 100 }
    ];

    for (const c of cases) {
        const result = calculateChoreMultiplier(c.hours);
        assert.equal(result.tier, c.tier, `tier for ${c.hours}h`);
        assert.equal(result.multiplier, c.multiplier, `multiplier for ${c.hours}h`);
        assert.equal(result.bonusRate, Math.round(c.tier * 5) / 100, `bonusRate for ${c.hours}h`);
        assert.equal(result.bonusPercent, c.bonusPercent, `bonusPercent for ${c.hours}h`);
        assert.equal(result.hoursToNextTier, c.hoursToNextTier, `hoursToNextTier for ${c.hours}h`);
        assert.equal(result.isMaxTier, c.isMaxTier, `isMaxTier for ${c.hours}h`);
        assert.equal(result.progressPercent, c.progressPercent, `progressPercent for ${c.hours}h`);
        assert.equal(result.totalHours, c.hours, `totalHours for ${c.hours}h`);
    }
});

test('exact intermediate tier thresholds', () => {
    assert.equal(calculateChoreMultiplier(20).tier, 2);
    assert.equal(calculateChoreMultiplier(30).tier, 3);
    assert.equal(calculateChoreMultiplier(40).tier, 4);
    assert.equal(calculateChoreMultiplier(50).tier, 5);
});

test('invalid and defensive inputs resolve to Tier 0', () => {
    [-5, -0.01, NaN, undefined, null, '', 'abc', Infinity].forEach((input) => {
        const result = calculateChoreMultiplier(input);
        assert.equal(result.tier, 0, `tier for ${String(input)}`);
        assert.equal(result.multiplier, 1, `multiplier for ${String(input)}`);
        assert.equal(result.hoursToNextTier, 10, `hoursToNextTier for ${String(input)}`);
    });

    // Numeric strings are parsed.
    assert.equal(calculateChoreMultiplier('16.75').tier, 1);
    assert.equal(calculateChoreMultiplier('16.75').totalHours, 16.75);
});

test('multiplier never decreases as chore hours grow', () => {
    let previous = 0;
    for (let hours = 0; hours <= 70; hours += 0.5) {
        const { multiplier } = calculateChoreMultiplier(hours);
        assert.ok(multiplier >= previous, `multiplier decreased at ${hours}h`);
        assert.ok(multiplier <= 1.25, `multiplier exceeded cap at ${hours}h`);
        previous = multiplier;
    }
});

test('sub-hundredth precision still reports a positive next-tier delta', () => {
    const result = calculateChoreMultiplier(9.999);
    assert.equal(result.tier, 0);
    assert.equal(result.hoursToNextTier, 0.01);
});

test('allowance breakdown applies multiplier retroactively to base allowance', () => {
    const base = 1000;
    const cases = [
        { hours: 0, total: 1000, bonus: 0 },
        { hours: 9.99, total: 1000, bonus: 0 },
        { hours: 10, total: 1050, bonus: 50 },
        { hours: 16.75, total: 1050, bonus: 50 },
        { hours: 26.75, total: 1100, bonus: 100 },
        { hours: 50, total: 1250, bonus: 250 },
        { hours: 60, total: 1250, bonus: 250 }
    ];

    for (const c of cases) {
        const result = calculateMonthlyAllowanceBreakdown(base, c.hours);
        assert.equal(result.baseAllowance, base, `base for ${c.hours}h`);
        assert.equal(result.finalMonthlyAllowance, c.total, `total for ${c.hours}h`);
        assert.equal(result.choreBonusAmount, c.bonus, `bonus for ${c.hours}h`);
        // Breakdown identity: total = base + bonus
        assert.equal(result.finalMonthlyAllowance, result.baseAllowance + result.choreBonusAmount);
    }
});

test('adding chore hours retroactively increases payout on previously logged work', () => {
    const baseFromAlreadyLoggedWork = 1000;

    // Work was logged first: no chores yet, so no bonus.
    const before = calculateMonthlyAllowanceBreakdown(baseFromAlreadyLoggedWork, 0);
    assert.equal(before.finalMonthlyAllowance, 1000);

    // 5 chore hours: still Tier 0, payout unchanged.
    const afterFive = calculateMonthlyAllowanceBreakdown(baseFromAlreadyLoggedWork, 5);
    assert.equal(afterFive.finalMonthlyAllowance, 1000);
    assert.equal(afterFive.choreBonusAmount, 0);

    // 5 more chore hours (10h total) cross Tier 1. The +5% is applied to the
    // *entire* previously logged base — not only to work logged from now on.
    const afterTen = calculateMonthlyAllowanceBreakdown(baseFromAlreadyLoggedWork, 10);
    assert.equal(afterTen.finalMonthlyAllowance, 1050);
    assert.equal(afterTen.choreBonusAmount, 50);
    assert.ok(afterTen.finalMonthlyAllowance > before.finalMonthlyAllowance);

    // Same base + more work logged later still benefits from the same tier.
    const withMoreWork = calculateMonthlyAllowanceBreakdown(1500, 10);
    assert.equal(withMoreWork.finalMonthlyAllowance, 1575);
});

test('allowance breakdown clamps negative/invalid base allowances to zero', () => {
    const result = calculateMonthlyAllowanceBreakdown(-500, 25);
    assert.equal(result.baseAllowance, 0);
    assert.equal(result.finalMonthlyAllowance, 0);
    assert.equal(result.choreBonusAmount, 0);
    assert.equal(result.tier, 2);
});

test('allowance breakdown rounds money to two decimals', () => {
    const result = calculateMonthlyAllowanceBreakdown(1000.05, 26.75);
    assert.equal(result.baseAllowance, 1000.05);
    assert.equal(result.finalMonthlyAllowance, 1100.06); // 1000.05 * 1.10 = 1100.055
    assert.equal(result.choreBonusAmount, 100.01);
});

function makeLog(type, hours, date, extra = {}) {
    return { type, hours, timestamp: date, ...extra };
}

test('sumMonthlyChoreHours only counts chores inside the calendar month', () => {
    const logs = [
        makeLog('chore', 3.5, new Date(2026, 10, 2, 9, 0)),   // Nov 2026 ✓
        makeLog('chore', '2.25', new Date(2026, 10, 30, 23, 59)), // Nov 2026, numeric string ✓
        makeLog('chore', 4, new Date(2026, 9, 31, 23, 59)),   // Oct 2026 ✗
        makeLog('chore', 1, new Date(2026, 11, 1, 0, 0)),      // Dec 2026 ✗
        makeLog('work', 8, new Date(2026, 10, 3)),             // work log ✗
        makeLog('workout', 2, new Date(2026, 10, 4)),          // workout log ✗
        makeLog('chore', 1.5, { toDate: () => new Date(2026, 10, 15) }), // Firestore Timestamp ✓
        makeLog('chore', 2, new Date(2026, 10, 16), { category: 'laundry' }), // any category ✓
        makeLog('chore', 5, null),                             // missing timestamp ✗
        null                                                   // malformed entry ✗
    ];

    assert.equal(sumMonthlyChoreHours(logs, 2026, 10), 9.25); // 3.5 + 2.25 + 1.5 + 2
    assert.equal(sumMonthlyChoreHours(logs, 2026, 9), 4);
    assert.equal(sumMonthlyChoreHours(logs, 2026, 11), 1);
    assert.equal(sumMonthlyChoreHours(logs, 2027, 10), 0);
});

test('sumMonthlyChoreHours tolerates non-array input', () => {
    assert.equal(sumMonthlyChoreHours(null, 2026, 10), 0);
    assert.equal(sumMonthlyChoreHours(undefined, 2026, 10), 0);
    assert.equal(sumMonthlyChoreHours({}, 2026, 10), 0);
});

test('each calendar month starts fresh at Tier 0', () => {
    const octoberHours = 55;
    const novemberHours = 0;

    assert.equal(calculateChoreMultiplier(octoberHours).tier, 5);
    assert.equal(calculateChoreMultiplier(octoberHours).multiplier, 1.25);
    assert.equal(calculateChoreMultiplier(novemberHours).tier, 0);
    assert.equal(calculateChoreMultiplier(novemberHours).multiplier, 1);

    // Excess October hours never roll over into November.
    const october = calculateMonthlyAllowanceBreakdown(1000, octoberHours);
    const november = calculateMonthlyAllowanceBreakdown(1000, novemberHours);
    assert.equal(october.finalMonthlyAllowance, 1250);
    assert.equal(november.finalMonthlyAllowance, 1000);
    assert.equal(november.choreBonusAmount, 0);
});

test('50h max tier caps the bonus with no further growth', () => {
    const at50 = calculateMonthlyAllowanceBreakdown(2000, 50);
    const at80 = calculateMonthlyAllowanceBreakdown(2000, 80);

    assert.equal(at50.tier, 5);
    assert.equal(at50.finalMonthlyAllowance, 2500);
    assert.equal(at80.tier, 5);
    assert.equal(at80.finalMonthlyAllowance, 2500);
    assert.equal(at80.hoursToNextTier, 0);
    assert.equal(at80.nextTierLabel, 'Max Tier Unlocked');
});

test('chore bonus can never push the payout past the monthly limit', () => {
    const limit = 10000; // e.g. target ฿8,000 × 125% max bonus cap

    // Bonus would overflow the ceiling: trimmed to the limit exactly.
    const atCap = calculateMonthlyAllowanceBreakdown(9900, 50, limit);
    assert.equal(atCap.baseAllowance, 9900);
    assert.equal(atCap.finalMonthlyAllowance, limit);
    assert.equal(atCap.choreBonusAmount, 100);
    assert.equal(atCap.monthlyAllowanceLimit, limit);
    assert.equal(atCap.payoutCapped, true);

    // Base work already sits above the limit: everything clamps to the limit.
    const overCap = calculateMonthlyAllowanceBreakdown(12000, 50, limit);
    assert.equal(overCap.baseAllowance, limit);
    assert.equal(overCap.finalMonthlyAllowance, limit);
    assert.equal(overCap.choreBonusAmount, 0);
    assert.equal(overCap.payoutCapped, true);

    // Bonus fits under the ceiling: applied in full and not flagged as capped.
    const underCap = calculateMonthlyAllowanceBreakdown(4000, 50, limit);
    assert.equal(underCap.finalMonthlyAllowance, 5000);
    assert.equal(underCap.choreBonusAmount, 1000);
    assert.equal(underCap.payoutCapped, false);

    // Breakdown identity still holds after clamping.
    assert.equal(atCap.finalMonthlyAllowance, atCap.baseAllowance + atCap.choreBonusAmount);
});

test('the monthly limit stays fixed and is never scaled by the chore tier', () => {
    const targetAllowance = 8000;
    const maxBonusCapPct = 125;
    const limit = targetAllowance * (maxBonusCapPct / 100); // ฿10,000

    for (let hours = 0; hours <= 70; hours += 2.5) {
        const result = calculateMonthlyAllowanceBreakdown(9999, hours, limit);
        assert.ok(result.finalMonthlyAllowance <= limit, `payout exceeded the limit at ${hours}h`);
        assert.equal(result.monthlyAllowanceLimit, limit, `limit drifted at ${hours}h`);
        assert.equal(result.finalMonthlyAllowance, result.baseAllowance + result.choreBonusAmount);
    }
});

test('omitting or invalidating the monthly limit keeps the uncapped behaviour', () => {
    assert.equal(calculateMonthlyAllowanceBreakdown(1000, 50).finalMonthlyAllowance, 1250);
    assert.equal(calculateMonthlyAllowanceBreakdown(1000, 50, undefined).finalMonthlyAllowance, 1250);
    assert.equal(calculateMonthlyAllowanceBreakdown(1000, 50, null).finalMonthlyAllowance, 1250);
    assert.equal(calculateMonthlyAllowanceBreakdown(1000, 50, 'abc').finalMonthlyAllowance, 1250);
    assert.equal(calculateMonthlyAllowanceBreakdown(1000, 50).monthlyAllowanceLimit, null);
    assert.equal(calculateMonthlyAllowanceBreakdown(1000, 50).payoutCapped, false);
});

test('integration: raw monthly logs feed the allowance breakdown', () => {
    const monthlyCash = 8000;
    const weeklyHours = 10;
    const targetPts = weeklyHours * 12;              // 120
    const pointRate = monthlyCash / targetPts;        // ฿66.67/pt
    const maxCash = monthlyCash * 1.25;               // ฿10,000 cap
    const points = 60;                                // ฿4,000 base

    const logs = [
        { type: 'work', points, hours: 4, timestamp: new Date(2026, 10, 3) },
        { type: 'chore', hours: 4, timestamp: new Date(2026, 10, 4) },
        { type: 'chore', hours: '6.75', timestamp: new Date(2026, 10, 12) },
        { type: 'workout', hours: 2, timestamp: new Date(2026, 10, 5) },
        { type: 'chore', hours: 12, timestamp: new Date(2026, 9, 28) }, // prior month
        { type: 'work', points: 500, hours: 8, timestamp: new Date(2026, 9, 28) }
    ];

    const choreHours = sumMonthlyChoreHours(logs, 2026, 10);
    assert.equal(choreHours, 10.75); // 4 + 6.75, October chore excluded

    const baseAllowance = Math.min(points * pointRate, maxCash);
    const breakdown = calculateMonthlyAllowanceBreakdown(baseAllowance, choreHours, maxCash);

    assert.equal(breakdown.tier, 1);
    assert.equal(breakdown.baseAllowance, 4000);
    assert.equal(breakdown.finalMonthlyAllowance, 4200);
    assert.equal(breakdown.choreBonusAmount, 200);
    assert.equal(breakdown.hoursToNextTier, 9.25);
    assert.equal(breakdown.monthlyAllowanceLimit, maxCash);
    assert.equal(breakdown.payoutCapped, false);
    assert.ok(breakdown.finalMonthlyAllowance <= maxCash);

    // Even a maxed-out month stays inside the monthly limit.
    const maxedOut = calculateMonthlyAllowanceBreakdown(maxCash, 50, maxCash);
    assert.equal(maxedOut.finalMonthlyAllowance, maxCash);
    assert.equal(maxedOut.payoutCapped, true);
});

// ============================================================================
// CO-OP SPILLOVER — Pure duo math scenarios
// ============================================================================

const {
    computeDuoMonthlyAllowance
} = require('../js/choreMultiplier.js');

const DUO_SETTINGS = {
    North: { monthlyCash: 1200, weeklyHours: 10, maxBonusCapPct: 125 },
    Cream: { monthlyCash: 1200, weeklyHours: 10, maxBonusCapPct: 125 }
};

function duoLog(type, user, hours, date, extra = {}) {
    return { type, user, hours, timestamp: date, ...extra };
}

test('scenario 1 — below the personal ceiling produces zero spillover and no UI flags', () => {
    const logs = [
        duoLog('work', 'North', 1, new Date(2026, 10, 5, 10), { points: 100 })
    ];
    const result = computeDuoMonthlyAllowance(logs, DUO_SETTINGS, 2026, 10);
    const north = result.North;
    const cream = result.Cream;

    // ฿1,200 target / 120 pts = ฿10/pt; 100 pts => ฿1,000 base, ceiling ฿1,500.
    assert.equal(north.pointRate, 10);
    assert.equal(north.rawBaseEarned, 1000);
    assert.equal(north.personalCeiling, 1500);
    assert.equal(north.rawTotalEarned, 1000);
    assert.equal(north.personalCappedEarned, 1000);
    assert.equal(north.spilloverGenerated, 0);
    assert.equal(north.spilloverSent, 0);
    assert.equal(north.spilloverReceived, 0);
    assert.equal(north.finalPayout, 1000);
    assert.equal(cream.spilloverReceived, 0);
    assert.equal(result.bothMaxed, false);
    assert.equal(result.hasSpillover, false);

    // Every zero-log partner object still initializes cleanly.
    ['workHours', 'choreHours', 'monthlyPoints', 'rawBaseEarned', 'rawTotalEarned',
        'personalCappedEarned', 'spilloverSent', 'spilloverReceived', 'finalPayout'].forEach(key => {
        assert.equal(cream[key], 0, `${key} initializes to 0`);
        assert.ok(!Number.isNaN(cream[key]), `${key} is not NaN`);
    });
});

test('scenario 2 — work above the ceiling overflows 1:1 without the receiver bonus multiplier', () => {
    const logs = [
        duoLog('work', 'North', 1, new Date(2026, 10, 5, 10), { points: 200 }), // ฿2,000 raw
        duoLog('chore', 'Cream', 50, new Date(2026, 10, 6, 10))                // Tier 5 (+25%)
    ];
    const result = computeDuoMonthlyAllowance(logs, DUO_SETTINGS, 2026, 10);
    const north = result.North;
    const cream = result.Cream;

    assert.equal(north.rawTotalEarned, 2000);
    assert.equal(north.personalCappedEarned, 1500);
    assert.equal(north.spilloverGenerated, 500);
    assert.equal(north.spilloverSent, 500);
    assert.equal(north.finalPayout, 1500);

    // The ฿500 arrives whole — Cream's +25% chore tier must NOT multiply it.
    assert.equal(cream.tier, 5);
    assert.equal(cream.multiplier, 1.25);
    assert.equal(cream.rawTotalEarned, 0);
    assert.equal(cream.spilloverReceived, 500);
    assert.equal(cream.finalPayout, 500);
    assert.equal(north.spilloverSent, cream.spilloverReceived);
    assert.equal(result.totalSent, result.totalReceived);
});


test('scenario 3 — a retroactive chore-tier jump creates spillover automatically', () => {
    const baseLogs = [
        duoLog('work', 'North', 2, new Date(2026, 10, 5, 10), { points: 129 }),
        duoLog('chore', 'North', 30, new Date(2026, 10, 6, 10)) // Tier 3 (+15%)
    ];
    const before = computeDuoMonthlyAllowance(baseLogs, DUO_SETTINGS, 2026, 10);
    assert.equal(before.North.tier, 3);
    assert.equal(before.North.rawTotalEarned, 1483.5); // 1290 × 1.15
    assert.ok(before.North.rawTotalEarned < before.North.personalCeiling);
    assert.equal(before.North.spilloverSent, 0);
    assert.equal(before.Cream.spilloverReceived, 0);

    // Log 10 more chore hours: Tier 3 -> Tier 4. The retroactive +20% is
    // applied to every work hour already logged, pushing the month over.
    const afterLogs = baseLogs.concat([
        duoLog('chore', 'North', 10, new Date(2026, 10, 20, 10))
    ]);
    const after = computeDuoMonthlyAllowance(afterLogs, DUO_SETTINGS, 2026, 10);
    assert.equal(after.North.tier, 4);
    assert.equal(after.North.rawTotalEarned, 1548); // 1290 × 1.20
    assert.equal(after.North.spilloverSent, 48);
    assert.equal(after.Cream.spilloverReceived, 48);
    assert.equal(after.Cream.finalPayout, 48);
});

test('scenario 4 — deleting the overflowing log rolls spillover back to zero', () => {
    const logs = [
        duoLog('work', 'North', 1, new Date(2026, 10, 5, 10), { points: 200 }),
        duoLog('work', 'North', 1, new Date(2026, 10, 6, 10), { points: 10 })
    ];
    const overflowing = computeDuoMonthlyAllowance(logs, DUO_SETTINGS, 2026, 10);
    assert.ok(overflowing.North.spilloverSent > 0);
    assert.ok(overflowing.Cream.spilloverReceived > 0);

    // Delete the excess work log exactly as the ledger delete handler would.
    const remaining = logs.filter(log => !(log.type === 'work' && log.points === 200));
    const rolledBack = computeDuoMonthlyAllowance(remaining, DUO_SETTINGS, 2026, 10);
    assert.equal(rolledBack.North.rawTotalEarned, 100);
    assert.equal(rolledBack.North.spilloverSent, 0);
    assert.equal(rolledBack.Cream.spilloverReceived, 0);
    assert.equal(rolledBack.hasSpillover, false);
});

test('scenario 5 — both partners over the cap cancel mutual spillover to zero', () => {
    const logs = [
        duoLog('work', 'North', 1, new Date(2026, 10, 5, 10), { points: 200 }),
        duoLog('work', 'Cream', 1, new Date(2026, 10, 5, 11), { points: 200 })
    ];
    const result = computeDuoMonthlyAllowance(logs, DUO_SETTINGS, 2026, 10);

    assert.equal(result.bothMaxed, true);
    assert.equal(result.North.spilloverGenerated, 500);
    assert.equal(result.Cream.spilloverGenerated, 500);
    assert.equal(result.North.spilloverSent, 0);
    assert.equal(result.North.spilloverReceived, 0);
    assert.equal(result.Cream.spilloverSent, 0);
    assert.equal(result.Cream.spilloverReceived, 0);
    assert.equal(result.North.finalPayout, 1500);
    assert.equal(result.Cream.finalPayout, 1500);
    assert.equal(result.hasSpillover, false);
});

test('spillover helpers treat uncapped or misconfigured caps as Infinity', () => {
    const uncapped = {
        North: { monthlyCash: 1200, weeklyHours: 10, monthlyBaseCap: 0 },
        Cream: { monthlyCash: 1200, weeklyHours: 10, monthlyBaseCap: null }
    };
    const logs = [duoLog('work', 'North', 1, new Date(2026, 10, 5), { points: 200 })];
    const result = computeDuoMonthlyAllowance(logs, uncapped, 2026, 10);

    assert.equal(result.North.hasCap, false);
    assert.equal(result.North.personalCeiling, Infinity);
    assert.equal(result.North.spilloverGenerated, 0);
    assert.equal(result.North.finalPayout, 2000, 'normal earnings are never zeroed out');
    assert.equal(result.Cream.personalCeiling, Infinity);
    assert.equal(result.Cream.spilloverReceived, 0);
});

test('duo math ignores other months and derives missing points from hours × ratings', () => {
    const logs = [
        duoLog('work', 'North', 2, new Date(2026, 10, 5), { points: 30 }),
        duoLog('work', 'North', 5, new Date(2026, 9, 5), { points: 999 }), // October
        duoLog('work', 'Cream', 2, new Date(2026, 10, 6), { results: 4, effort: 4 }) // no points
    ];
    const result = computeDuoMonthlyAllowance(logs, DUO_SETTINGS, 2026, 10);

    assert.equal(result.North.monthlyPoints, 30);
    assert.equal(result.North.rawBaseEarned, 300);
    assert.equal(result.Cream.monthlyPoints, 8); // 2h × ((4+4)/2)
    assert.equal(result.Cream.rawBaseEarned, 80);
});
