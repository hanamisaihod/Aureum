// ============================================================================
// AUREUM — Payoff Receipt & Quick-Log Payload Integration Tests
// ============================================================================
// Loads the browser modules into a vm sandbox (same classic-script style as
// index.html) and asserts the monthly statement reconciles with the pure
// chore-multiplier engine to the cent.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const choreMultiplier = require('../js/choreMultiplier.js');
const thermostat = require('../js/thermostat.js');

function createAppContext() {
    const sandbox = {
        console,
        document: {
            title: 'AUREUM — The Aureate Standard',
            addEventListener() {},
            querySelectorAll() { return []; },
            getElementById() { return null; },
            readyState: 'complete'
        },
        localStorage: { getItem() { return null; }, setItem() {} },
        window: {},
        $: () => null,
        audioMuted: false,
        loggedInUser: 'North',
        viewedUser: 'North',
        userSettings: { monthlyCash: 8000, weeklyHours: 10, maxBonusCapPct: 125, dailySoftCap: 4 },
        duoPresenceData: { North: { logs: [] }, Cream: { logs: [] } },
        currentRawLogsCache: [],
        globalAllLogsCache: [],
        currentTodayHoursLogged: 0,
        spectatorSettings: null,
        getLogDate: log => {
            if (!log || !log.timestamp) return new Date();
            return log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp);
        },
        formatHours: value => {
            const num = parseFloat(value) || 0;
            const rounded = Math.round(num * 100) / 100;
            return (rounded % 1 === 0) ? rounded.toFixed(1) : rounded.toString();
        },
        escapeHtml: value => String(value ?? ''),
        getUserRole: () => 'illustrator',
        getUserDisplayName: () => 'North',
        calculateChoreMultiplier: choreMultiplier.calculateChoreMultiplier,
        calculateMonthlyAllowanceBreakdown: choreMultiplier.calculateMonthlyAllowanceBreakdown,
        sumMonthlyChoreHours: choreMultiplier.sumMonthlyChoreHours,
        computeHabitThermostat: thermostat.computeHabitThermostat,
        getThermostatBadgeClasses: thermostat.getThermostatBadgeClasses,
        playTone() {},
        showToast() {},
        db: {
            collection: () => ({
                add: async () => {},
                doc: () => ({ set: async () => {}, delete: async () => {} })
            })
        },
        firebase: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TS' } } }
    };
    sandbox.global = sandbox;
    vm.createContext(sandbox);
    ['ledger.js', 'quickLog.js', 'receipt.js'].forEach(file => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
        vm.runInContext(source, sandbox, { filename: file });
    });
    return sandbox;
}

function setLogs(context, logs) {
    context.__logs = logs;
    vm.runInContext('currentRawLogsCache = __logs; globalAllLogsCache = __logs;', context);
}

function makeLog(type, user, hours, points, date) {
    return { type, user, hours, points, timestamp: date };
}

test('payoff receipt reconciles base allowance + chore tier bonus for a past month', () => {
    const context = createAppContext();
    const y = 2026, m = 9; // October 2026 (zero-based month)
    setLogs(context, [
        makeLog('work', 'North', 4, 12, new Date(y, m, 1, 12)),
        makeLog('work', 'North', 3.5, 10, new Date(y, m, 2, 12)),
        makeLog('chore', 'North', 8, undefined, new Date(y, m, 3, 12)),
        makeLog('chore', 'North', 7, undefined, new Date(y, m, 4, 12)),
        makeLog('workout', 'North', 1.5, undefined, new Date(y, m, 5, 12)),
        makeLog('work', 'North', 2, 5, new Date(y, m, 12, 12))
    ]);

    const data = vm.runInContext(`computePayoffReceiptData(${y}, ${m})`, context);

    assert.equal(data.monthTitle, 'October 2026');
    assert.equal(data.isCurrent, false);
    assert.equal(data.workH, 9.5);
    assert.equal(data.choreH, 15);
    assert.equal(data.workoutH, 1.5);
    assert.equal(data.monthlyPoints, 27);
    assert.equal(data.activeDays, 6);

    // ฿8,000 target over 120 points => ฿66.67/pt; 27 pts => ฿1,800 base.
    assert.equal(Math.round(data.breakdown.baseAllowance), 1800);
    // 15 chore hours => Tier 1 (+5%) => +฿90 retroactive bonus.
    assert.equal(data.breakdown.tierLabel, 'Tier 1');
    assert.equal(data.breakdown.bonusPercent, '5%');
    assert.equal(Math.round(data.breakdown.choreBonusAmount), 90);
    assert.equal(Math.round(data.breakdown.finalMonthlyAllowance), 1890);

    const html = vm.runInContext(`_buildPayoffReceiptHtml(computePayoffReceiptData(${y}, ${m}))`, context);
    assert.ok(html.includes('Aureum Monthly Statement'));
    assert.ok(html.includes('Retroactive Chore Bonus'));
    assert.ok(html.includes('฿1,890'));
    assert.ok(html.includes('+฿90'));
    assert.ok(html.includes('receipt-dashed'));
    assert.ok(html.includes('receipt-figures'));
});

test('payoff receipt respects the hard monthly cap (target × max bonus cap)', () => {
    const context = createAppContext();
    const y = 2026, m = 8; // September 2026
    setLogs(context, [
        makeLog('work', 'North', 50, 135, new Date(y, m, 2, 12)), // ฿9,000 base
        makeLog('chore', 'North', 50, undefined, new Date(y, m, 3, 12)) // Tier 5 (+25%)
    ]);

    const data = vm.runInContext(`computePayoffReceiptData(${y}, ${m})`, context);
    assert.equal(data.breakdown.tierLabel, 'Tier 5');
    assert.equal(data.breakdown.bonusPercent, '25%');
    assert.equal(Math.round(data.breakdown.finalMonthlyAllowance), 10000); // capped
    assert.equal(Math.round(data.breakdown.choreBonusAmount), 1000);
    assert.equal(data.breakdown.payoutCapped, true);
});

test('payoff receipt duo footer sums both partners for the selected month', () => {
    const context = createAppContext();
    const y = 2026, m = 9;
    setLogs(context, [
        makeLog('work', 'North', 4, 12, new Date(y, m, 1, 12)),
        makeLog('chore', 'North', 2, undefined, new Date(y, m, 2, 12)),
        makeLog('work', 'Cream', 5, 15, new Date(y, m, 3, 12)),
        makeLog('chore', 'Cream', 3, undefined, new Date(y, m, 4, 12)),
        // Different month must be excluded.
        makeLog('work', 'Cream', 9, 27, new Date(y, m - 1, 4, 12))
    ]);

    const data = vm.runInContext(`computePayoffReceiptData(${y}, ${m})`, context);
    assert.equal(data.duo.workH, 9);
    assert.equal(data.duo.choreH, 5);
    assert.equal(data.duo.North.workH, 4);
    assert.equal(data.duo.Cream.choreH, 3);
});

test('quick-log work payload keeps the canonical logs schema and points math', () => {
    const context = createAppContext();
    const built = vm.runInContext('buildWorkLogPayload(2.5, 4, 5, "  crafted  ")', context);

    assert.equal(built.payload.type, 'work');
    assert.equal(built.payload.user, 'North');
    assert.equal(built.payload.role, 'illustrator');
    assert.equal(built.payload.hours, 2.5);
    assert.equal(built.payload.normalHours, 2.5);
    assert.equal(built.payload.overCapHours, 0);
    assert.equal(built.payload.results, 4);
    assert.equal(built.payload.effort, 5);
    assert.equal(built.payload.points, 11.25); // 2.5h × ((4+5)/2)
    assert.equal(built.payload.reflectionText, 'crafted');
    assert.equal(built.payload.timestamp, 'SERVER_TS');
});

