// ============================================================================
// AUREUM — Co-Op Spillover UI Wiring Tests
// ============================================================================
// Loads app.js into a tiny DOM sandbox (same classic-script style as
// index.html) and verifies the compact inline indicators only appear while a
// transfer is active, plus the HUD "• Overflowing" suffix.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const chore = require('../js/choreMultiplier.js');

function makeElement(id) {
    const classes = new Set(id.includes('spillover') ? ['hidden'] : []);
    return {
        id,
        dataset: {},
        innerText: '',
        innerHTML: '',
        className: '',
        title: '',
        src: '',
        alt: '',
        disabled: false,
        style: {},
        classList: {
            add(...names) { names.forEach(name => classes.add(name)); },
            remove(...names) { names.forEach(name => classes.delete(name)); },
            contains(name) { return classes.has(name); },
            toggle(name, force) {
                if (force === undefined) {
                    if (classes.has(name)) classes.delete(name); else classes.add(name);
                } else if (force) classes.add(name);
                else classes.delete(name);
            }
        },
        addEventListener() {},
        setAttribute() {},
        blur() {},
        contains() { return false; },
        parentElement: null
    };
}

function createSandbox() {
    const ids = [
        'chore-bonus-zone', 'chore-tier-track', 'chore-tier-bar', 'allowance-tier-pill',
        'allowance-base-amount', 'allowance-bonus-rate', 'allowance-bonus-amount',
        'allowance-multiplier-badge', 'allowance-hours-logged', 'allowance-hours-to-next',
        'chore-tier-ladder', 'chore-tier-step-hint', 'chore-tier-progress-pct',
        'chore-tier-progress-label', 'monthly-payout',
        'allowance-spillover-sent', 'allowance-spillover-received',
        'hud-card-north', 'hud-card-cream', 'hud-name-north', 'hud-name-cream',
        'hud-avatar-north', 'hud-avatar-cream', 'hud-presence-dot-north', 'hud-presence-dot-cream',
        'hud-timer-spin-north', 'hud-timer-spin-cream', 'hud-badge-north', 'hud-badge-cream',
        'hud-thermostat-badge-north', 'hud-thermostat-badge-cream',
        'hud-thermostat-trigger-north', 'hud-thermostat-trigger-cream',
        'hud-hours-north', 'hud-hours-cream', 'hud-info-popup', 'hud-info-popup-body'
    ];
    const elements = {};
    ids.forEach(id => { elements[id] = makeElement(id); });
    elements['chore-tier-track'].parentElement = makeElement('chore-tier-track-parent');

    const settings = { monthlyCash: 1200, weeklyHours: 10, dailySoftCap: 4, maxBonusCapPct: 125, displayName: '', vaultedMonths: {} };
    const thermostat = {
        state: 'STEADY_CRUISE', label: 'Steady', message: '', isCorrective: false, isPlaceholder: false,
        quickActions: [], recommendedPomo: null, explain: [], window: { windowDays: 7 },
        metrics: { workH: 0, choreH: 0, workoutH: 0, totalH: 0, activeDays: 0, avgQuality: 0, missingRatingCount: 0, qualityCoverage: 0, ignoredFutureLogs: 0, windowDays: 7 }
    };

    const sandbox = {
        console,
        document: {
            addEventListener() {},
            querySelectorAll() { return []; },
            getElementById(id) { return elements[id] || null; },
            readyState: 'complete'
        },
        $: id => elements[id] || null,
        window: { addEventListener() {}, event: null, innerWidth: 1000, innerHeight: 800 },
        localStorage: { getItem() { return null; }, setItem() {} },
        auth: { onAuthStateChanged() {} },
        db: {
            collection: () => ({
                doc: () => ({ onSnapshot: () => () => {}, set: async () => {} }),
                where: () => ({ onSnapshot: () => () => {} }),
                onSnapshot: () => () => {}
            })
        },
        setInterval() { return 0; },
        clearInterval() {},
        setTimeout() { return 0; },
        clearTimeout() {},
        loggedInUser: 'North',
        viewedUser: 'North',
        currentUserUid: 'uid-north',
        userSettings: settings,
        duoPresenceData: {
            North: { settings, hoursToday: 0, logs: [] },
            Cream: { settings: { ...settings }, hoursToday: 0, logs: [] }
        },
        spectatorSettings: null,
        globalAllLogsCache: [],
        currentRawLogsCache: [],
        currentTodayHoursLogged: 0,
        hudInfoPopupUser: null,
        hudInfoPopupPinned: false,
        hudInfoPopupHideTimer: null,
        hudThermostatCache: { North: null, Cream: null },
        myPomoIsRunning: false,
        activeTab: 'crucible',
        goalsTargetsLocked: true,
        applyDynamicAvatarGlow() {},
        computeHabitThermostat() { return thermostat; },
        getThermostatBadgeClasses() { return 'bg-slate-800'; },
        getUserDisplayName(user) { return user; },
        formatHours(value) {
            const num = parseFloat(value) || 0;
            const rounded = Math.round(num * 100) / 100;
            return (rounded % 1 === 0) ? rounded.toFixed(1) : rounded.toString();
        },
        escapeHtml(value) { return String(value ?? ''); },
        calculateChoreMultiplier: chore.calculateChoreMultiplier,
        calculateMonthlyAllowanceBreakdown: chore.calculateMonthlyAllowanceBreakdown,
        sumMonthlyChoreHours: chore.sumMonthlyChoreHours,
        computeDuoMonthlyAllowance: chore.computeDuoMonthlyAllowance,
        CHORE_TIER_STEP_HOURS: chore.CHORE_TIER_STEP_HOURS,
        CHORE_TIER_BONUS_RATE: chore.CHORE_TIER_BONUS_RATE
    };
    sandbox.global = sandbox;
    sandbox.self = sandbox;
    vm.createContext(sandbox);
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    vm.runInContext(source, sandbox, { filename: 'app.js' });
    return { sandbox, elements };
}

test('allowance card shows the sent sub-line only while overflowing', () => {
    const { sandbox, elements } = createSandbox();
    const info = sandbox.calculateMonthlyAllowanceBreakdown(10000, 50, 10000); // at the cap

    sandbox.renderAllowanceMultiplierUI(info, {
        partner: 'Cream', spilloverSent: 1250, spilloverReceived: 0, finalPayout: 10000
    });

    const sent = elements['allowance-spillover-sent'];
    const received = elements['allowance-spillover-received'];
    assert.equal(sent.classList.contains('hidden'), false);
    assert.ok(sent.innerText.startsWith('Maxed • +฿1,250.00 overflowing to Cream'));
    assert.equal(received.classList.contains('hidden'), true);
    assert.equal(received.innerText, '');

    // Receiver view.
    sandbox.renderAllowanceMultiplierUI(info, {
        partner: 'Cream', spilloverSent: 0, spilloverReceived: 500, finalPayout: 10500
    });
    assert.equal(sent.classList.contains('hidden'), true);
    assert.equal(sent.innerText, '');
    assert.equal(received.classList.contains('hidden'), false);
    assert.ok(received.innerText.startsWith('Includes +฿500.00 Co-Op Spillover from Cream'));

    // Back below the cap: both sub-lines disappear and the layout is untouched.
    sandbox.renderAllowanceMultiplierUI(info, {
        partner: 'Cream', spilloverSent: 0, spilloverReceived: 0, finalPayout: 10000
    });
    assert.equal(sent.classList.contains('hidden'), true);
    assert.equal(received.classList.contains('hidden'), true);
    assert.equal(sent.innerText, '');
    assert.equal(received.innerText, '');
});

test('duo HUD appends a low-contrast overflow indicator to the overflowing partner only', () => {
    const { sandbox, elements } = createSandbox();
    const now = new Date();
    sandbox.globalAllLogsCache = [
        { id: 'n1', type: 'work', user: 'North', hours: 1, points: 200, timestamp: now }
    ];

    sandbox.renderDuoHUDCards();

    assert.ok(elements['hud-hours-north'].innerHTML.includes('• Overflowing'));
    assert.ok(!elements['hud-hours-cream'].innerHTML.includes('Overflowing'));

    // Deleting the excess log removes the indicator again.
    sandbox.globalAllLogsCache = [];
    sandbox.renderDuoHUDCards();
    assert.ok(!elements['hud-hours-north'].innerHTML.includes('Overflowing'));
});

