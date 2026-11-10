// ============================================================================
// AUREUM — Utility Helpers, Input Hold Handlers & Right-Drag Scrolling
// ============================================================================

function getLogDate(l) {
    if (!l || !l.timestamp) return new Date();
    return l.timestamp.toDate ? l.timestamp.toDate() : new Date(l.timestamp);
}

function formatHours(val) {
    const num = parseFloat(val) || 0;
    const rounded = Math.round(num * 100) / 100;
    return (rounded % 1 === 0) ? rounded.toFixed(1) : rounded.toString();
}

function formatHourAmPm(h) {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 === 0 ? 12 : h % 12;
    return `${hr}:00 ${ampm}`;
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getUserDisplayName(userKey) {
    const u = userKey || viewedUser || loggedInUser || 'North';
    if (u === loggedInUser && userSettings && typeof userSettings.displayName === 'string' && userSettings.displayName.trim()) {
        return userSettings.displayName.trim();
    }
    if (typeof spectatorSettings !== 'undefined' && spectatorSettings && u === viewedUser && typeof spectatorSettings.displayName === 'string' && spectatorSettings.displayName.trim()) {
        return spectatorSettings.displayName.trim();
    }
    const s = duoPresenceData[u]?.settings;
    if (s && typeof s.displayName === 'string' && s.displayName.trim()) {
        return s.displayName.trim();
    }
    return u;
}

const GOALS_TARGET_FIELD_IDS = ['setting-monthly-cash', 'setting-weekly-hrs', 'setting-daily-soft-cap', 'setting-bonus-cap'];

// Right-Click Drag Window Scrolling & Hold Cleanup
let isRightDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragScrollX = 0;
let dragScrollY = 0;
let didRightDrag = false;

window.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
        isRightDragging = true;
        didRightDrag = false;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragScrollX = window.scrollX;
        dragScrollY = window.scrollY;
    }
}, { passive: true });

window.addEventListener('mousemove', (e) => {
    if (!isRightDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didRightDrag = true;
    window.scrollTo(dragScrollX - dx, dragScrollY - dy);
}, { passive: true });

window.addEventListener('mouseup', (e) => {
    if (e.button === 2) isRightDragging = false;
    stopHold();
}, { passive: true });

window.addEventListener('touchend', stopHold, { passive: true });
window.addEventListener('touchcancel', stopHold, { passive: true });

window.addEventListener('contextmenu', (e) => {
    if (didRightDrag) {
        e.preventDefault();
        didRightDrag = false;
    }
});

window.addEventListener('touchmove', () => {
    isTouchScrolling = true;
    stopHold();
}, { passive: true });

window.addEventListener('touchend', () => {
    setTimeout(() => {
        isTouchScrolling = false;
    }, 50);
}, { passive: true });

function startHold(mode, fieldOrId, delta, step = 1, min = 1, max = 5, e) {
    if (isTouchScrolling) return;
    const evt = e || window.event;
    if (evt) {
        if (evt.type === 'touchstart') {
            if (evt.cancelable) evt.preventDefault();
        } else if (evt.type === 'mousedown' && ('ontouchstart' in window)) {
            return;
        }
    }
    stopHold();
    const executeStep = () => {
        if (mode === 'value') {
            if (typeof goalsTargetsLocked !== 'undefined' && goalsTargetsLocked && GOALS_TARGET_FIELD_IDS.includes(fieldOrId)) {
                stopHold();
                return;
            }
            const el = $(fieldOrId);
            if (!el || el.disabled || el.readOnly) {
                stopHold();
                return;
            }
            let val = (parseFloat(el.value) || 0) + (delta * step);
            if (min !== undefined) val = Math.max(min, val);
            if (max !== undefined) val = Math.min(max, val);
            el.value = step < 1 ? val.toFixed(2) : Math.round(val);
        } else if (mode === 'rating') {
            const input = $(`work-${fieldOrId}`);
            if (!input) return;
            input.value = Math.max(1, Math.min(5, (parseInt(input.value) || 3) + delta));
            updateRatingUI(fieldOrId);
        } else if (mode === 'strain') {
            const input = $('workout-strain');
            if (!input) return;
            input.value = Math.max(1, Math.min(5, (parseInt(input.value) || 3) + delta));
            updateWorkoutStrainUI();
        }
    };
    executeStep();
    activeHoldTimer = setTimeout(() => {
        activeHoldInterval = setInterval(executeStep, mode === 'value' ? 80 : 120);
    }, 280);
}

function startHoldJournalPage(delta, e) {
    if (isTouchScrolling) return;
    const evt = e || window.event;
    if (evt) {
        if (evt.type === 'touchstart') {
            if (evt.cancelable) evt.preventDefault();
        } else if (evt.type === 'mousedown' && ('ontouchstart' in window)) {
            return;
        }
    }
    stopHold();
    const executeStep = () => {
        changeJournalBookPage(delta);
    };
    executeStep();
    activeHoldTimer = setTimeout(() => {
        activeHoldInterval = setInterval(executeStep, 140);
    }, 300);
}

function stopHold() {
    if (activeHoldTimer) {
        clearTimeout(activeHoldTimer);
        activeHoldTimer = null;
    }
    if (activeHoldInterval) {
        clearInterval(activeHoldInterval);
        activeHoldInterval = null;
    }
}

function updateRatingUI(field) {
    const input = $(`work-${field}`);
    if (!input) return;

    const val = parseInt(input.value) || 3;
    const d = RATING_DATA[field][val - 1];
    const p = field === 'results' ? 'q' : 'e';

    const iconEl = $(`${p}-icon`);
    if (iconEl) iconEl.innerText = d.icon;
    const badgeEl = $(`${p}-badge`);
    if (badgeEl) badgeEl.innerText = `LVL ${d.level}`;
    const titleEl = $(`${p}-title-label`);
    if (titleEl) titleEl.innerText = d.title;
    const descEl = $(`${p}-desc`);
    if (descEl) descEl.innerText = d.desc;
}

const STRAIN_LEVEL_COLORS = ['#38bdf8', '#10b981', '#f59e0b', '#f97316', '#ef4444'];

function updateWorkoutStrainUI() {
    const input = $('workout-strain');
    if (!input) return;
    const val = parseInt(input.value) || 3;
    const d = RATING_DATA.workoutStrain[val - 1];
    const color = STRAIN_LEVEL_COLORS[val - 1] || '#f59e0b';
    $('w-icon').innerText = d.icon;
    const wBadge = $('w-badge');
    if (wBadge) {
        wBadge.innerText = `LVL ${d.level}`;
        wBadge.className = 'font-black';
        wBadge.style.color = color;
    }
    $('w-title').innerText = d.title;
    const barEl = $('workout-strain-bars');
    if (barEl && typeof renderSegmentedBar === 'function') {
        barEl.innerHTML = renderSegmentedBar(val, 5, color);
    }
}
