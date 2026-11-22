// ============================================================================
// AUREUM — Inline Quick-Log Runtime Tests (fake DOM + fake Firestore)
// ============================================================================
// The Crucible Quick Log is work-only (chores and workouts live in Sanctuary),
// always steps in 15 minutes, starts at 0, and only accepts banked Pomodoro
// focus through the explicit green Move action.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const choreMultiplier = require('../js/choreMultiplier.js');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function createEl(extra) {
    const classes = new Set();
    return Object.assign({
        innerHTML: '',
        innerText: '',
        value: '',
        disabled: false,
        title: '',
        classList: {
            contains: name => classes.has(name),
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            toggle: (name, force) => {
                const on = force === undefined ? !classes.has(name) : Boolean(force);
                if (on) classes.add(name); else classes.delete(name);
                return on;
            }
        },
        setAttribute() {},
        focus() {},
        scrollIntoView() {}
    }, extra || {});
}

function createQuickLogContext() {
    const elements = {
        'quick-log-form': createEl(),
        'quick-log-duration': createEl({ value: '0m' }),
        'quick-log-step-minus': createEl(),
        'quick-log-step-plus': createEl(),
        'quick-log-quality-strip': createEl(),
        'quick-log-effort-strip': createEl(),
        'quick-log-ratings': createEl(),
        'quick-log-effort-label': createEl(),
        'quick-log-quality-label': createEl(),
        'quick-log-submit-btn': createEl({ innerText: 'Log Session' }),
        'quick-log-note': createEl(),
        'quick-log-error': createEl()
    };

    const added = [];
    const db = {
        collection(name) {
            return {
                add: async payload => { added.push({ collection: name, payload }); },
                doc: () => ({ set: async () => {}, delete: async () => {} })
            };
        }
    };

    const sandbox = {
        console,
        document: {
            addEventListener() {},
            querySelectorAll: () => [],
            getElementById: id => elements[id] || null,
            readyState: 'complete'
        },
        localStorage: { getItem() { return null; }, setItem() {} },
        $: id => elements[id] || null,
        setTimeout: () => 0,
        clearTimeout() {},
        db,
        firebase: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TS' } } },
        loggedInUser: 'North',
        viewedUser: 'North',
        userSettings: { monthlyCash: 8000, weeklyHours: 10, maxBonusCapPct: 125, dailySoftCap: 4, unloggedFocusSecs: 0 },
        currentRawLogsCache: [],
        currentTodayHoursLogged: 0,
        getLogDate: log => (log && log.timestamp) || new Date(),
        formatHours: value => {
            const num = parseFloat(value) || 0;
            const rounded = Math.round(num * 100) / 100;
            return (rounded % 1 === 0) ? rounded.toFixed(1) : rounded.toString();
        },
        escapeHtml: value => String(value ?? ''),
        getUserRole: () => 'illustrator',
        updateUnloggedFocusDisplay() {},
        showToast() {},
        playTone() {},
        sumMonthlyChoreHours: choreMultiplier.sumMonthlyChoreHours,
        calculateChoreMultiplier: choreMultiplier.calculateChoreMultiplier,
        calculateMonthlyAllowanceBreakdown: choreMultiplier.calculateMonthlyAllowanceBreakdown
    };
    sandbox.global = sandbox;
    vm.createContext(sandbox);
    ['ledger.js', 'quickLog.js'].forEach(file => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
        vm.runInContext(source, sandbox, { filename: file });
    });

    return { sandbox, elements, added };
}

test('quick-log starts at zero with a 15-minute stepper and visible ratings', () => {
    const { sandbox, elements } = createQuickLogContext();

    assert.equal(
        vm.runInContext('[typeof applyAccumulatedFocusToQuickLog, typeof focusQuickLogCard, typeof submitQuickLog, typeof stepQuickLogMinutes, typeof holdQuickLogMinutes].join(",")', sandbox),
        'function,function,function,function,function'
    );
    assert.equal(vm.runInContext('getQuickLogMinutes()', sandbox), 0);
    assert.equal(elements['quick-log-duration'].value, '0m');
    assert.equal(elements['quick-log-step-minus'].disabled, true);
    assert.equal(elements['quick-log-step-plus'].disabled, false);
    assert.equal(elements['quick-log-ratings'].classList.contains('hidden'), false);
    assert.equal(elements['quick-log-quality-label'].innerText, '3');
    assert.equal(elements['quick-log-effort-label'].innerText, '3');
    assert.ok(elements['quick-log-quality-strip'].innerHTML.includes('Quality 5 of 5'));
    assert.ok(elements['quick-log-effort-strip'].innerHTML.includes('Effort 1 of 5'));
});

test('duration only moves in 15-minute steps and never falls below zero', () => {
    const { sandbox, elements, added } = createQuickLogContext();

    vm.runInContext('stepQuickLogMinutes(1)', sandbox);
    assert.equal(vm.runInContext('getQuickLogMinutes()', sandbox), 15);
    assert.equal(elements['quick-log-duration'].value, '15m');
    assert.equal(elements['quick-log-step-minus'].disabled, false);

    vm.runInContext('stepQuickLogMinutes(1); stepQuickLogMinutes(1); stepQuickLogMinutes(1)', sandbox);
    assert.equal(vm.runInContext('getQuickLogMinutes()', sandbox), 60);
    assert.equal(elements['quick-log-duration'].value, '1h');

    vm.runInContext('stepQuickLogMinutes(-1)', sandbox);
    assert.equal(elements['quick-log-duration'].value, '45m');

    // Hold repeaters call the same stepper, so a single press stages one step.
    vm.runInContext('holdQuickLogMinutes(1)', sandbox);
    assert.equal(elements['quick-log-duration'].value, '1h');

    vm.runInContext('setQuickLogMinutes(620)', sandbox);
    assert.equal(vm.runInContext('getQuickLogMinutes()', sandbox), 600);
    assert.equal(elements['quick-log-duration'].value, '10h');

    // Off-grid values snap onto the grid instead of creating odd durations.
    vm.runInContext('setQuickLogMinutes(16)', sandbox);
    assert.equal(elements['quick-log-duration'].value, '15m');
    vm.runInContext('setQuickLogMinutes(23)', sandbox);
    assert.equal(elements['quick-log-duration'].value, '30m');

    vm.runInContext('setQuickLogMinutes(15); stepQuickLogMinutes(-1)', sandbox);
    assert.equal(vm.runInContext('getQuickLogMinutes()', sandbox), 0);
    assert.equal(elements['quick-log-duration'].value, '0m');
    assert.equal(elements['quick-log-step-minus'].disabled, true);

    assert.equal(added.length, 0); // stepping never writes a log by itself
});

test('banked focus snaps onto the 15-minute grid only when moved in', () => {
    const { sandbox, elements } = createQuickLogContext();

    // Nothing auto-fills: the box stays empty until the green Move button runs.
    assert.equal(elements['quick-log-duration'].value, '0m');

    vm.runInContext('applyAccumulatedFocusToQuickLog(90)', sandbox);
    assert.equal(elements['quick-log-duration'].value, '1h 30m');

    vm.runInContext('applyAccumulatedFocusToQuickLog(25)', sandbox);
    assert.equal(elements['quick-log-duration'].value, '30m');

    // A stray sub-step bank still lands on one full step rather than zero.
    vm.runInContext('applyAccumulatedFocusToQuickLog(3)', sandbox);
    assert.equal(elements['quick-log-duration'].value, '15m');

    vm.runInContext('applyAccumulatedFocusToQuickLog(0)', sandbox);
    assert.equal(elements['quick-log-duration'].value, '15m');
});

test('quick-log rejects an empty box and logs quality before effort', async () => {
    const { sandbox, elements, added } = createQuickLogContext();

    elements['quick-log-note'].value = 'Premature';
    await vm.runInContext('submitQuickLog({preventDefault(){}})', sandbox);

    assert.equal(added.length, 0);
    assert.equal(elements['quick-log-error'].classList.contains('hidden'), false);
    assert.ok(elements['quick-log-error'].innerText.includes('Set a duration'));

    vm.runInContext('stepQuickLogMinutes(1); stepQuickLogMinutes(1)', sandbox); // 30m
    vm.runInContext('setQuickLogRating("quality", 5)', sandbox);
    vm.runInContext('setQuickLogRating("effort", 2)', sandbox);
    elements['quick-log-note'].value = 'Deep work';
    await vm.runInContext('submitQuickLog({preventDefault(){}})', sandbox);

    assert.equal(added.length, 1);
    const work = added[0].payload;
    assert.equal(work.type, 'work');
    assert.equal(work.user, 'North');
    assert.equal(work.role, 'illustrator');
    assert.equal(work.hours, 0.5);
    assert.equal(work.normalHours, 0.5);
    assert.equal(work.overCapHours, 0);
    assert.equal(work.results, 5); // Quality
    assert.equal(work.effort, 2); // Effort
    assert.ok(Math.abs(work.points - 1.75) < 1e-9); // avg(5, 2) × 0.5h
    assert.equal(work.reflectionText, 'Deep work');
    assert.equal(elements['quick-log-note'].value, '');
    assert.equal(elements['quick-log-duration'].value, '0m'); // fresh session after saving
    assert.equal(elements['quick-log-error'].classList.contains('hidden'), true);
    assert.equal(elements['quick-log-submit-btn'].innerText, '✓ Logged!');
});

test('holding the stepper repeats in 15-minute steps until released', () => {
    const { sandbox, elements } = createQuickLogContext();
    const timeouts = [];
    const intervals = [];
    sandbox.setTimeout = fn => { timeouts.push(fn); return 1; };
    sandbox.setInterval = fn => { intervals.push(fn); return 2; };
    sandbox.clearTimeout = () => {};
    sandbox.clearInterval = () => {};

    vm.runInContext('holdQuickLogMinutes(1, {type: "mousedown", preventDefault(){}})', sandbox);
    assert.equal(elements['quick-log-duration'].value, '15m'); // immediate step
    assert.equal(timeouts.length, 1);

    timeouts[0](); // 300ms hold threshold reached -> start repeating
    assert.equal(intervals.length, 1);

    intervals[0]();
    intervals[0]();
    assert.equal(elements['quick-log-duration'].value, '45m');
    assert.equal(vm.runInContext('getQuickLogMinutes()', sandbox), 45);
});

test('quick-log markup drops presets and categories, and keeps quality ahead of effort', () => {
    assert.ok(!indexHtml.includes('data-quick-category'));
    assert.ok(!indexHtml.includes('quick-log-duration-chips'));
    assert.ok(!indexHtml.includes('quick-log-duration-unit'));
    assert.ok(!indexHtml.includes('2-3 taps'));
    assert.ok(!/id="quick-log-duration"[^>]*type="number"/.test(indexHtml));
    assert.ok(!/type="number"[^>]*id="quick-log-duration"/.test(indexHtml));
    assert.ok(/id="quick-log-duration"[^>]*readonly/.test(indexHtml));

    const qualityAt = indexHtml.indexOf('id="quick-log-quality-strip"');
    const effortAt = indexHtml.indexOf('id="quick-log-effort-strip"');
    assert.ok(qualityAt > -1 && effortAt > -1, 'both rating strips must exist');
    assert.ok(qualityAt < effortAt, 'quality must render before effort');
});


