// ============================================================================
// AUREUM — Inline Quick-Log Card (Flat, Zero-Nesting Session Logging)
// ============================================================================
// One card, three categories, no modal. Every submit writes straight to
// db.collection('logs') using the same document shapes as the Sanctuary forms:
//   work    -> type, user, role, hours, normalHours, overCapHours, results,
//              effort, points, reflectionText, timestamp
//   chore   -> type, user, hours, note, reflectionText, timestamp
//   workout -> type, user, hours, strain, results, reflectionText, timestamp
// (`results` on workouts carries the optional Form/Quality rating; it is the
// already-shared 1-5 rating field in the logs schema, so no new field names.)
// ============================================================================

const QUICK_LOG_DURATION_CHIPS = {
    work: [15, 25, 45, 60, 90, 120],
    chore: [10, 15, 20, 30, 45, 60],
    workout: [15, 25, 45, 60, 90, 120]
};

const QUICK_LOG_DEFAULT_MINUTES = { work: 25, chore: 15, workout: 45 };

const QUICK_LOG_HINTS = { work: '+DEX / +STR', chore: '+VIT', workout: '+VIT' };

let quickLogCategory = 'work';
let quickLogMinutes = QUICK_LOG_DEFAULT_MINUTES.work;
let quickLogDurationUnit = 'min';
let quickLogEffort = 3;
let quickLogQuality = 3;
let quickLogConfirmTimer = null;

function getQuickLogDurationChips() {
    return QUICK_LOG_DURATION_CHIPS[quickLogCategory] || QUICK_LOG_DURATION_CHIPS.work;
}

function formatQuickLogDurationValue(minutes, unit) {
    if (unit === 'hrs') {
        const hrs = Math.round((minutes / 60) * 100) / 100;
        return String(hrs);
    }
    return String(Math.round(minutes));
}

function getQuickLogMinutesFromInput() {
    const input = $('quick-log-duration');
    const raw = parseFloat(input?.value);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    const mins = quickLogDurationUnit === 'hrs' ? raw * 60 : raw;
    if (!Number.isFinite(mins)) return 0;
    return Math.max(1, Math.min(600, Math.round(mins)));
}

function updateQuickLogUnitLabel() {
    const unitBtn = $('quick-log-duration-unit');
    if (!unitBtn) return;
    unitBtn.innerText = quickLogDurationUnit === 'hrs' ? 'hrs' : 'min';
    unitBtn.title = quickLogDurationUnit === 'hrs' ? 'Showing hours — click for minutes' : 'Showing minutes — click for hours';
}

function syncQuickLogDurationField() {
    const input = $('quick-log-duration');
    if (input) input.value = formatQuickLogDurationValue(quickLogMinutes, quickLogDurationUnit);
    updateQuickLogUnitLabel();
}

function renderQuickLogCategoryUI() {
    document.querySelectorAll('[data-quick-category]').forEach(btn => {
        const key = btn.getAttribute('data-quick-category');
        const active = key === quickLogCategory;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const hint = $('quick-log-category-hint');
    if (hint) hint.innerText = QUICK_LOG_HINTS[quickLogCategory] || '';
}

function renderQuickLogDurationChips() {
    const wrap = $('quick-log-duration-chips');
    if (!wrap) return;
    wrap.innerHTML = getQuickLogDurationChips().map(mins => {
        const active = quickLogMinutes === mins;
        return `<button type="button" onclick="selectQuickLogDuration(${mins}, event)" aria-pressed="${active ? 'true' : 'false'}" class="quick-log-chip px-2 py-1 rounded-lg text-[11px] font-mono font-extrabold ${active ? 'is-active' : ''}">${mins}m</button>`;
    }).join('');
}

function renderQuickLogRatingStrips() {
    [{ kind: 'effort', value: quickLogEffort }, { kind: 'quality', value: quickLogQuality }].forEach(({ kind, value }) => {
        const el = $(`quick-log-${kind}-strip`);
        if (el) {
            el.innerHTML = [1, 2, 3, 4, 5].map(n => {
                const active = n === value;
                return `<button type="button" onclick="setQuickLogRating('${kind}', ${n}, event)" aria-pressed="${active ? 'true' : 'false'}" title="${kind === 'effort' ? 'Effort' : 'Quality'} ${n}" class="quick-log-rating-btn h-7 rounded-lg text-[11px] font-black ${active ? 'is-active' : ''}">${n}</button>`;
            }).join('');
        }
        const label = $(`quick-log-${kind}-label`);
        if (label) label.innerText = String(value);
    });
}

function updateQuickLogRatingsVisibility() {
    const ratings = $('quick-log-ratings');
    if (!ratings) return;
    const hide = quickLogCategory === 'chore';
    ratings.classList.toggle('hidden', hide);
    ratings.setAttribute('aria-hidden', hide ? 'true' : 'false');
}

function renderQuickLogUI() {
    renderQuickLogCategoryUI();
    renderQuickLogDurationChips();
    renderQuickLogRatingStrips();
    updateQuickLogRatingsVisibility();
    syncQuickLogDurationField();
}


function setQuickLogCategory(category) {
    if (!['work', 'chore', 'workout'].includes(category)) return;
    if (quickLogCategory === category) return;
    quickLogCategory = category;
    // Keep the current duration when the new chip set offers it; otherwise fall
    // back to that category's fast default.
    const chips = getQuickLogDurationChips();
    if (!chips.includes(quickLogMinutes)) {
        quickLogMinutes = QUICK_LOG_DEFAULT_MINUTES[category] || 25;
    }
    renderQuickLogUI();
}

function selectQuickLogDuration(minutes, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const mins = Math.max(1, Math.min(600, Math.round(Number(minutes) || 0)));
    quickLogMinutes = mins;
    syncQuickLogDurationField();
    renderQuickLogDurationChips();
    playTone('step');
    clearQuickLogError();
}

function onQuickLogDurationInput() {
    const mins = getQuickLogMinutesFromInput();
    // Clearing the field also clears the chip highlight; any custom value simply
    // leaves no chip active until it matches a preset again.
    quickLogMinutes = mins > 0 ? mins : 0;
    renderQuickLogDurationChips();
    clearQuickLogError();
}

function toggleQuickLogDurationUnit(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const mins = getQuickLogMinutesFromInput();
    if (mins > 0) quickLogMinutes = mins;
    quickLogDurationUnit = quickLogDurationUnit === 'min' ? 'hrs' : 'min';
    syncQuickLogDurationField();
    renderQuickLogDurationChips();
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

async function commitQuickChoreLog(hours, note, originEvt) {
    const now = new Date();
    const hoursBeforeLog = sumMonthlyChoreHours(currentRawLogsCache, now.getFullYear(), now.getMonth());
    await db.collection('logs').add({
        type: 'chore',
        user: loggedInUser,
        hours,
        note,
        reflectionText: note,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    // The realtime snapshot may not have delivered the new entry yet, so prefer
    // the snapshot total and otherwise project it from this log.
    const snapshotHours = sumMonthlyChoreHours(currentRawLogsCache, now.getFullYear(), now.getMonth());
    const currentMonthlyChoreHours = snapshotHours > hoursBeforeLog ? snapshotHours : (hoursBeforeLog + hours);
    const choreMultiplier = calculateChoreMultiplier(currentMonthlyChoreHours);
    const tierInfo = choreMultiplier.isMaxTier
        ? `🏆 <strong>Max Tier Unlocked!</strong> +${choreMultiplier.bonusPercent} Bonus Active`
        : `📊 ${choreMultiplier.tierLabel} • +${choreMultiplier.bonusPercent} • ${formatHours(choreMultiplier.hoursToNextTier)}h to ${choreMultiplier.nextTierLabel}`;

    showToast({
        title: '🧹 Chore Logged',
        subtitle: `${formatHours(hours)}h saved${note ? `: "${escapeHtml(note)}"` : ''}<br>${tierInfo}`,
        icon: '🏰',
        tier: 'silver',
        originEvt,
        duration: 4000
    });
}

async function commitQuickWorkoutLog(hours, strain, quality, note, originEvt) {
    await db.collection('logs').add({
        type: 'workout',
        user: loggedInUser,
        hours,
        strain,
        results: quality,
        reflectionText: note,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast({
        title: '🏃 Fitness Logged',
        subtitle: `${formatHours(hours)}h saved at Level ${strain} intensity${note ? `: "${escapeHtml(note)}"` : ''}`,
        icon: '🔥',
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

    const minutes = getQuickLogMinutesFromInput();
    if (!minutes) {
        showQuickLogError('Enter a duration between 1 and 600 minutes.');
        const input = $('quick-log-duration');
        if (input && input.focus) input.focus();
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
        if (quickLogCategory === 'chore') {
            await commitQuickChoreLog(hours, note, e);
        } else if (quickLogCategory === 'workout') {
            await commitQuickWorkoutLog(hours, quickLogEffort, quickLogQuality, note, e);
        } else {
            await commitQuickWorkLog(hours, quickLogQuality, quickLogEffort, note, e);
        }
        if (noteEl) noteEl.value = '';
        showQuickLogConfirmation();
        playTone('save');
    } catch (err) {
        setQuickLogButtonLabel('Log Session', false);
        showQuickLogError('Could not save that session. Check your connection and try again.');
        try { console.error('Quick Log failed:', err); } catch (e2) {}
    }
}

function applyAccumulatedFocusToQuickLog(minutes, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (loggedInUser !== viewedUser) return;
    const mins = Math.max(1, Math.min(600, Math.round(Number(minutes) || 0)));
    if (quickLogCategory !== 'work') setQuickLogCategory('work');
    quickLogDurationUnit = 'min';
    selectQuickLogDuration(mins);
    const card = $('work-form-card');
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    playTone('step');
}

function focusQuickLogCard(minutes) {
    if (loggedInUser !== viewedUser) return;
    if (quickLogCategory !== 'work') setQuickLogCategory('work');
    if (Number.isFinite(minutes) && minutes > 0) {
        quickLogDurationUnit = 'min';
        selectQuickLogDuration(minutes);
    }
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

