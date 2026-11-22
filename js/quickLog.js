// ============================================================================
// AUREUM — Inline Quick-Log Card (Flat, Zero-Nesting Session Logging)
// ============================================================================
// One card, one category: every submit writes a `work` log straight to
// db.collection('logs') using the same document shape as the Crucible form:
//   work -> type, user, role, hours, normalHours, overCapHours, results,
//           effort, points, reflectionText, timestamp
// Chores and workouts belong to the Sanctuary tab, so they are not duplicated
// here. The duration box always starts at 0 and only moves in 15-minute steps;
// banked Pomodoro focus enters the box only through an explicit action (the
// green Move pill, or a thermostat hand-off that stages a starting time).
// ============================================================================

const QUICK_LOG_STEP_MINUTES = 15;
const QUICK_LOG_MAX_MINUTES = 600;

let quickLogMinutes = 0;
let quickLogEffort = 3;
let quickLogQuality = 3;
let quickLogConfirmTimer = null;

function formatQuickLogMinutes(minutes) {
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    if (total < 60) return `${total}m`;
    const hrs = Math.floor(total / 60);
    const rem = total % 60;
    return rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m`;
}

// Banked focus always lands on the 15-minute grid: exact multiples pass
// through untouched, and stray legacy values floor at one full step.
function snapQuickLogMinutes(rawMinutes) {
    const mins = Math.round(Number(rawMinutes) || 0);
    if (mins <= 0) return 0;
    const stepped = Math.round(mins / QUICK_LOG_STEP_MINUTES) * QUICK_LOG_STEP_MINUTES;
    return Math.min(QUICK_LOG_MAX_MINUTES, Math.max(QUICK_LOG_STEP_MINUTES, stepped));
}

function getQuickLogMinutes() {
    return quickLogMinutes;
}

function syncQuickLogDurationField() {
    const field = $('quick-log-duration');
    if (field) field.value = formatQuickLogMinutes(quickLogMinutes);
    const minus = $('quick-log-step-minus');
    if (minus) {
        const atFloor = quickLogMinutes <= 0;
        minus.disabled = atFloor;
        minus.classList.toggle('opacity-40', atFloor);
    }
}

function setQuickLogMinutes(minutes) {
    quickLogMinutes = Math.max(0, Math.min(QUICK_LOG_MAX_MINUTES, snapQuickLogMinutes(minutes)));
    syncQuickLogDurationField();
    clearQuickLogError();
    return quickLogMinutes;
}

function stepQuickLogMinutes(delta) {
    const stepMinutes = Math.round(Number(delta) || 0) * QUICK_LOG_STEP_MINUTES;
    if (!stepMinutes) return quickLogMinutes;
    const next = quickLogMinutes + stepMinutes;
    if (next <= 0) {
        quickLogMinutes = 0;
        syncQuickLogDurationField();
        clearQuickLogError();
        return quickLogMinutes;
    }
    return setQuickLogMinutes(next);
}

// Press-and-hold repeater that mirrors startHold() in utils.js: one immediate
// step, then a 300ms delay before a 100ms repeat. It reuses the shared
// activeHoldTimer / activeHoldInterval slots so the global mouseup / touchend
// listeners that call stopHold() clean it up automatically.
function holdQuickLogMinutes(delta, e) {
    const evt = e || (typeof window !== 'undefined' ? window.event : null);
    if (typeof isTouchScrolling !== 'undefined' && isTouchScrolling) return;
    if (evt) {
        if (evt.type === 'touchstart') {
            if (evt.cancelable) evt.preventDefault();
        } else if (evt.type === 'mousedown' && typeof window !== 'undefined' && 'ontouchstart' in window) {
            return;
        }
    }
    if (typeof stopHold === 'function') stopHold();
    const executeStep = () => stepQuickLogMinutes(delta);
    executeStep();
    if (quickLogMinutes <= 0 && delta < 0) return;
    activeHoldTimer = setTimeout(() => {
        activeHoldInterval = setInterval(executeStep, 100);
    }, 300);
}

function renderQuickLogRatingStrips() {
    // Quality renders first: it is the payout rating, so it leads the pair and
    // both rows share the full card width inside one coupled panel.
    [{ kind: 'quality', value: quickLogQuality }, { kind: 'effort', value: quickLogEffort }].forEach(({ kind, value }) => {
        const el = $(`quick-log-${kind}-strip`);
        if (el) {
            el.innerHTML = [1, 2, 3, 4, 5].map(n => {
                const active = n === value;
                const title = `${kind === 'quality' ? 'Quality' : 'Effort'} ${n} of 5`;
                return `<button type="button" onclick="setQuickLogRating('${kind}', ${n}, event)" aria-pressed="${active ? 'true' : 'false'}" title="${title}" class="quick-log-rating-btn h-7 rounded-md text-[11px] font-black ${active ? 'is-active' : ''}">${n}</button>`;
            }).join('');
        }
        const label = $(`quick-log-${kind}-label`);
        if (label) label.innerText = String(value);
    });
}

function renderQuickLogUI() {
    renderQuickLogRatingStrips();
    syncQuickLogDurationField();
}

function setQuickLogRating(kind, value, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const n = Math.max(1, Math.min(5, parseInt(value, 10) || 3));
    if (kind === 'effort') quickLogEffort = n;
    else quickLogQuality = n;
    renderQuickLogRatingStrips();
}

function showQuickLogError(message) {
    const el = $('quick-log-error');
    if (!el) return;
    el.innerText = message || '';
    el.classList.toggle('hidden', !message);
}

function clearQuickLogError() {
    showQuickLogError('');
}

function setQuickLogButtonLabel(label, confirmed) {
    const btn = $('quick-log-submit-btn');
    if (!btn) return;
    btn.innerText = label;
    btn.classList.toggle('is-confirmed', !!confirmed);
    btn.disabled = label === 'Saving…';
}

function restoreQuickLogButton() {
    if (quickLogConfirmTimer) {
        clearTimeout(quickLogConfirmTimer);
        quickLogConfirmTimer = null;
    }
    setQuickLogButtonLabel('Log Session', false);
}

function showQuickLogConfirmation() {
    if (quickLogConfirmTimer) clearTimeout(quickLogConfirmTimer);
    setQuickLogButtonLabel('✓ Logged!', true);
    quickLogConfirmTimer = setTimeout(() => {
        quickLogConfirmTimer = null;
        setQuickLogButtonLabel('Log Session', false);
    }, 1500);
}

async function commitQuickWorkLog(hours, quality, effort, note, originEvt) {
    const built = buildWorkLogPayload(hours, quality, effort, note);
    await db.collection('logs').add(built.payload);

    userSettings.unloggedFocusSecs = 0;
    if (typeof updateUnloggedFocusDisplay === 'function') updateUnloggedFocusDisplay();
    try { await db.collection('settings').doc(loggedInUser).set({ unloggedFocusSecs: 0 }, { merge: true }); } catch (err) {}

    const mult = built.choreMultiplier;
    const multTxt = mult.tier > 0 ? ` <span class="text-amber-300">×${mult.multiplier.toFixed(2)} Chore Bonus (+${mult.bonusPercent})</span>` : '';
    const capTxt = built.maxCash > 0 && built.cashAfter >= built.maxCash - 0.005
        ? ` <span class="text-amber-300">⛔ Monthly limit ฿${Math.round(built.maxCash).toLocaleString()}</span>`
        : '';
    showToast({
        title: '⚗️ Work Logged',
        subtitle: `<strong>+฿${Math.round(built.netCashEarned).toLocaleString()} Earned</strong> (${formatHours(hours)}h @ Q${quality}/E${effort})${multTxt}${capTxt}`,
        icon: '🎯',
        tier: 'gold',
        originEvt
    });
}

async function submitQuickLog(e) {
    if (e) e.preventDefault();
    if (loggedInUser !== viewedUser) {
        showQuickLogError('Read-only view — switch back to your own card to log sessions.');
        return;
    }

    const minutes = getQuickLogMinutes();
    if (!minutes) {
        showQuickLogError('Set a duration with − / + first, or move banked focus in.');
        return;
    }
    const submitBtn = $('quick-log-submit-btn');
    if (submitBtn && submitBtn.disabled) return;

    clearQuickLogError();
    const hours = Math.max(0.01, Math.round((minutes / 60) * 10000) / 10000);
    const note = ($('quick-log-note')?.value || '').trim();
    const noteEl = $('quick-log-note');

    setQuickLogButtonLabel('Saving…', false);
    try {
        await commitQuickWorkLog(hours, quickLogQuality, quickLogEffort, note, e);
        if (noteEl) noteEl.value = '';
        setQuickLogMinutes(0);
        showQuickLogConfirmation();
        playTone('save');
    } catch (err) {
        setQuickLogButtonLabel('Log Session', false);
        showQuickLogError('Could not save that session. Check your connection and try again.');
        try { console.error('Quick Log failed:', err); } catch (e2) {}
    }
}

// Stages banked Pomodoro focus into the duration box on demand. Nothing moves
// automatically; the bank itself is only cleared once the work log is saved.
function applyAccumulatedFocusToQuickLog(minutes, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (loggedInUser !== viewedUser) return;
    const staged = snapQuickLogMinutes(minutes);
    if (!staged) return;
    setQuickLogMinutes(staged);
    const card = $('work-form-card');
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    playTone('step');
}

function focusQuickLogCard(minutes) {
    if (loggedInUser !== viewedUser) return;
    if (Number.isFinite(minutes) && minutes > 0) setQuickLogMinutes(minutes);
    const card = $('work-form-card');
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const note = $('quick-log-note');
    if (note) setTimeout(() => note.focus(), 150);
}

function initQuickLogUI() {
    if (!$('quick-log-form')) return;
    renderQuickLogUI();
    restoreQuickLogButton();
}

try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initQuickLogUI);
    else initQuickLogUI();
} catch (e) {}


