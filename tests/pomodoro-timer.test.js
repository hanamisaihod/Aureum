// ============================================================================
// AUREUM — Pomodoro Tab Title & Completion Chime Tests
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DEFAULT_PAGE_TITLE = 'AUREUM — The Aureate Standard';

function createTimerContext() {
    const events = [];
    const store = {};
    const fakeCtx = {
        state: 'suspended',
        currentTime: 10,
        resume() { events.push(['resume']); this.state = 'running'; return Promise.resolve(); },
        createOscillator() {
            return {
                type: 'sine',
                frequency: { setValueAtTime(freq, at) { events.push(['freq', freq, at]); } },
                connect() {},
                start(at) { events.push(['start', at]); },
                stop(at) { events.push(['stop', at]); }
            };
        },
        createGain() {
            return {
                gain: {
                    setValueAtTime(value, at) { events.push(['gain', value, at]); },
                    exponentialRampToValueAtTime(value, at) { events.push(['ramp', value, at]); }
                },
                connect() {}
            };
        },
        destination: {}
    };

    const documentStub = {
        title: DEFAULT_PAGE_TITLE,
        addEventListener() {},
        getElementById() { return null; }
    };

    const sandbox = {
        console,
        document: documentStub,
        localStorage: {
            getItem(key) { return store[key] === undefined ? null : store[key]; },
            setItem(key, value) { store[key] = value; }
        },
        window: {},
        $: () => null,
        getAudioContext: () => fakeCtx,
        audioMuted: false,
        loggedInUser: 'North',
        viewedUser: 'North',
        _cachedFocus: 25,
        _cachedShort: 5,
        _cachedLong: 15,
        userSettings: { pomoFocus: 25, pomoShort: 5, pomoLong: 15, pomoRounds: 4, pomoSound: 'zen_bowl' },
        duoPresenceData: { North: {}, Cream: {} },
        spectatorSettings: null,
        playPomoSound() {},
        playTone() {},
        showToast() {},
        triggerDesktopNotification() {},
        requestNotificationPermission() {},
        evaluateBadges() {},
        renderDuoHUDCards() {},
        applyThemeToBody() {},
        applyCursorToBody() {},
        applyBackgroundPattern() {},
        renderBadgeGrid() {},
        renderTodoList() {},
        getUserDisplayName: user => user,
        db: { collection: () => ({ doc: () => ({ set: async () => {}, get: async () => ({ exists: false }) }) }) },
        firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } }
    };
    sandbox.global = sandbox;
    vm.createContext(sandbox);
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'pomodoro.js'), 'utf8');
    vm.runInContext(source, sandbox, { filename: 'pomodoro.js' });

    return {
        sandbox,
        events,
        store,
        title: () => documentStub.title,
        run: code => vm.runInContext(code, sandbox)
    };
}

test('tab title mirrors the live timer and restores the page title', () => {
    const timer = createTimerContext();

    assert.equal(timer.run('DEFAULT_TITLE'), DEFAULT_PAGE_TITLE);
    assert.equal(timer.run('typeof applyAccumulatedHoursToWorkInput'), 'function');
    assert.equal(timer.run('typeof toggleMyPomoTimer'), 'function');
    assert.equal(timer.run('typeof startGlobalUIRenderer'), 'function');
    assert.equal(timer.run('typeof toggleTimerChime'), 'function');

    timer.run('syncPomodoroDocumentTitle(1500, true, "focus", 1500, true)');
    assert.equal(timer.title(), '[25:00] Focus • Aureum');

    timer.run('syncPomodoroDocumentTitle(1200, false, "focus", 1500, true)');
    assert.equal(timer.title(), '[PAUSED 20:00] Focus • Aureum');

    timer.run('syncPomodoroDocumentTitle(1500, false, "focus", 1500, true)');
    assert.equal(timer.title(), DEFAULT_PAGE_TITLE);

    timer.run('syncPomodoroDocumentTitle(300, true, "short", 300, true)');
    assert.equal(timer.title(), '[05:00] Short Break • Aureum');

    timer.run('syncPomodoroDocumentTitle(300, false, "short", 300, true)');
    assert.equal(timer.title(), DEFAULT_PAGE_TITLE);

    // Viewing a partner's timer never hijacks your own tab title.
    timer.run('syncPomodoroDocumentTitle(600, true, "long", 900, false)');
    assert.equal(timer.title(), DEFAULT_PAGE_TITLE);
});

test('completion chime synthesizes C5 then G5 with a 0.8s fade', () => {
    const timer = createTimerContext();
    timer.run('playTimerChime()');

    const freqs = timer.events.filter(event => event[0] === 'freq');
    assert.ok(freqs.some(event => event[1] === 523.25 && event[2] === 10));
    assert.ok(freqs.some(event => event[1] === 783.99 && event[2] === 10.18));
    assert.ok(timer.events.some(event => event[0] === 'resume'));

    const fadeEnds = timer.events.filter(event => event[0] === 'ramp' && event[1] === 0.0001);
    assert.ok(fadeEnds.some(event => Math.abs(event[2] - 10.8) < 1e-9));
});

test('timer chime toggle persists in localStorage and silences playback', () => {
    const timer = createTimerContext();

    timer.run('toggleTimerChime()');
    assert.equal(timer.store.aureum_timer_chime_muted, 'true');

    const before = timer.events.length;
    timer.run('playTimerChime()');
    assert.equal(timer.events.length, before);

    timer.run('toggleTimerChime()');
    assert.equal(timer.store.aureum_timer_chime_muted, 'false');
    assert.ok(timer.events.some(event => event[0] === 'freq' && event[1] === 523.25));
});

