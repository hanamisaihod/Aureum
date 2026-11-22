// ============================================================================
// AUREUM — Inline Quick-Log Runtime Tests (fake DOM + fake Firestore)
// ============================================================================
// Exercises the exact payloads produced by the three category pills without a
// browser, so logging work/chore/workout can never silently drift from the
// Sanctuary forms.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const choreMultiplier = require('../js/choreMultiplier.js');

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
        'quick-log-duration': createEl({ value: '25' }),
        'quick-log-duration-unit': createEl(),
        'quick-log-duration-chips': createEl(),
        'quick-log-effort-strip': createEl(),
        'quick-log-quality-strip': createEl(),
        'quick-log-ratings': createEl(),
        'quick-log-effort-label': createEl(),
        'quick-log-quality-label': createEl(),
        'quick-log-category-hint': createEl(),
        'quick-log-submit-btn': createEl({ innerText: 'Log Session' }),
        'quick-log-note': createEl(),
        'quick-log-error': createEl()
    };

    const categoryButtons = ['work', 'chore', 'workout'].map(key => createEl({
        getAttribute: name => (name === 'data-quick-category' ? key : null)
    }));

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
            querySelectorAll: selector => (selector === '[data-quick-category]' ? categoryButtons : []),
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

    return { sandbox, elements, added, categoryButtons };
}

test('quick-log initial render exposes work chips, ratings, and defaults', () => {
    const { sandbox, elements } = createQuickLogContext();

    assert.equal(vm.runInContext('[typeof applyAccumulatedFocusToQuickLog, typeof focusQuickLogCard, typeof submitQuickLog, typeof toggleQuickLogDurationUnit].join(",")', sandbox), 'function,function,function,function');
    assert.ok(elements['quick-log-duration-chips'].innerHTML.includes('25m'));
    assert.ok(elements['quick-log-duration-chips'].innerHTML.includes('120m'));
    assert.equal(elements['quick-log-ratings'].classList.contains('hidden'), false);
    assert.equal(elements['quick-log-effort-label'].innerText, '3');
    assert.equal(elements['quick-log-quality-label'].innerText, '3');
    assert.equal(elements['quick-log-category-hint'].innerText, '+DEX / +STR');
    assert.equal(vm.runInContext('getQuickLogMinutesFromInput()', sandbox), 25);
});

test('chore category swaps chips, hides ratings, and keeps logging fast', () => {
    const { sandbox, elements } = createQuickLogContext();

    vm.runInContext('setQuickLogCategory("chore")', sandbox);

    assert.ok(elements['quick-log-duration-chips'].innerHTML.includes('10m'));
    assert.ok(!elements['quick-log-duration-chips'].innerHTML.includes('120m'));
    assert.equal(elements['quick-log-ratings'].classList.contains('hidden'), true);
    assert.equal(elements['quick-log-category-hint'].innerText, '+VIT');
    assert.equal(elements['quick-log-duration'].value, '15'); // chore default
});

test('quick-log submits canonical work, chore, and workout payloads', async () => {
    const { sandbox, elements, added } = createQuickLogContext();

    // --- Work ---
    vm.runInContext('setQuickLogCategory("work")', sandbox);
    elements['quick-log-duration'].value = '25';
    vm.runInContext('onQuickLogDurationInput()', sandbox);
    elements['quick-log-note'].value = 'Deep work';
    await vm.runInContext('submitQuickLog({preventDefault(){}})', sandbox);

    const work = added[added.length - 1].payload;
    assert.equal(work.type, 'work');
    assert.equal(work.user, 'North');
    assert.equal(work.hours, 0.4167);
    assert.equal(work.normalHours, 0.4167);
    assert.ok(Math.abs(work.points - 1.2501) < 1e-9); // 3.0 avg rating × hours
    assert.equal(work.results, 3);
    assert.equal(work.effort, 3);
    assert.equal(work.reflectionText, 'Deep work');
    assert.equal(elements['quick-log-note'].value, '');
    assert.equal(elements['quick-log-submit-btn'].innerText, '✓ Logged!');

    // --- Chore (ratings hidden, note doubles as reflectionText) ---
    vm.runInContext('setQuickLogCategory("chore")', sandbox);
    elements['quick-log-note'].value = 'Laundry';
    await vm.runInContext('submitQuickLog({preventDefault(){}})', sandbox);

    const chore = added[added.length - 1].payload;
    assert.equal(chore.type, 'chore');
    assert.equal(chore.hours, 0.25); // 15m default
    assert.equal(chore.note, 'Laundry');
    assert.equal(chore.reflectionText, 'Laundry');
    assert.equal(elements['quick-log-note'].value, '');

    // --- Workout (strain from Effort, results from Quality) ---
    vm.runInContext('setQuickLogCategory("workout")', sandbox);
    elements['quick-log-duration'].value = '45';
    vm.runInContext('onQuickLogDurationInput()', sandbox);
    vm.runInContext('setQuickLogRating("effort", 4)', sandbox);
    vm.runInContext('setQuickLogRating("quality", 5)', sandbox);
    await vm.runInContext('submitQuickLog({preventDefault(){}})', sandbox);

    const workout = added[added.length - 1].payload;
    assert.equal(workout.type, 'workout');
    assert.equal(workout.hours, 0.75);
    assert.equal(workout.strain, 4);
    assert.equal(workout.results, 5);
    assert.equal(elements['quick-log-note'].value, '');
});

