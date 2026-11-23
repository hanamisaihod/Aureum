// ============================================================================
// AUREUM — Chronicle Journal Book Reader & Daily Reflection Saving
// ============================================================================

const JOURNAL_FLIP_MS = 280;
const JOURNAL_FLIP_RESET_MS = JOURNAL_FLIP_MS + 20;

async function saveDailyDiary(e) {
    e.preventDefault();
    const text = $('diary-text').value.trim();
    if (!text) return;
    await db.collection('logs').add({
        type: 'diary',
        user: loggedInUser,
        text: text,
        reflectionText: text,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast({
        title: '📖 Reflection Saved',
        subtitle: 'Reflection updated!',
        icon: '✍️',
        tier: 'titan',
        originEvt: e
    });
    loadUserData();
}

/**
 * Enables/disables the Prev/Next controls at the ends of the journal stack.
 */
function updateJournalNavState(hasPrev, hasNext) {
    const prevBtn = $('journal-prev-btn');
    const nextBtn = $('journal-next-btn');
    if (prevBtn) prevBtn.disabled = !hasPrev;
    if (nextBtn) nextBtn.disabled = !hasNext;
}

/**
 * Plays the 280ms CSS 3D sheet turn on the active journal page.
 * Only call this from page navigation — never from typing, editing or save
 * renders — so the reflection textarea never receives animation jitter.
 * Any in-flight turn is cancelled and restarted, so rapid clicks stay clean.
 */
function triggerJournalFlip(direction) {
    const page = $('journal-reader-page');
    if (!page) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const flipClass = direction > 0 ? 'flip-next' : 'flip-prev';
    if (journalFlipTimer) {
        clearTimeout(journalFlipTimer);
        journalFlipTimer = null;
    }
    page.classList.remove('flip-next', 'flip-prev');
    // Force a reflow so back-to-back turns restart the keyframes from zero.
    void page.offsetWidth;
    page.classList.add(flipClass);
    journalFlipTimer = setTimeout(() => {
        page.classList.remove('flip-next', 'flip-prev');
        journalFlipTimer = null;
    }, JOURNAL_FLIP_RESET_MS);
}

function changeJournalBookPage(delta) {
    const diaryLogs = currentRawLogsCache.filter(l => l.type === 'diary');
    if (diaryLogs.length === 0) return;
    const nextIndex = Math.max(0, Math.min(diaryLogs.length - 1, currentJournalPageIndex + delta));
    if (nextIndex === currentJournalPageIndex) return;
    const direction = nextIndex > currentJournalPageIndex ? 1 : -1;
    currentJournalPageIndex = nextIndex;
    renderJournalBookView(diaryLogs, direction);
    playTone('save');
}

/**
 * Renders the active reflection page.
 * @param {Array} diaryLogs sorted reflection entries
 * @param {number} [flipDirection] 1 = next/forward, -1 = prev/backward, 0 = no turn
 */
function renderJournalBookView(diaryLogs, flipDirection = 0) {
    const label = $('journal-page-number-label');
    const rightDate = $('book-right-date');
    const rightContent = $('book-right-content');
    const rightFooter = $('book-right-footer');
    if (!rightContent) return;
    if (!diaryLogs || diaryLogs.length === 0) {
        label.innerText = "Page 1";
        rightDate.innerText = "---";
        rightContent.innerHTML = 'No entries logged yet.';
        rightFooter.innerText = "Page Right";
        updateJournalNavState(false, false);
        return;
    }
    // Clamp after deletions so a removed last page cannot leave a dangling index.
    if (currentJournalPageIndex > diaryLogs.length - 1) {
        currentJournalPageIndex = Math.max(0, diaryLogs.length - 1);
    }
    const log = diaryLogs[currentJournalPageIndex];
    const logDate = getLogDate(log);
    label.innerText = `Page ${currentJournalPageIndex + 1} of ${diaryLogs.length}`;
    rightDate.innerText = logDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    rightContent.innerText = `"${log.text}"`;
    rightFooter.innerText = `Written by ${getUserDisplayName(log.user || viewedUser)}`;
    updateJournalNavState(currentJournalPageIndex > 0, currentJournalPageIndex < diaryLogs.length - 1);
    if (flipDirection) triggerJournalFlip(flipDirection);
}

// Left/Right arrows turn journal pages, but only while the Chronicles tab is
// open and the reflection textarea (or any form field) is not focused.
document.addEventListener('keydown', event => {
    if (activeTab !== 'chronicles') return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const active = document.activeElement;
    const tag = active && active.tagName ? active.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (active && active.isContentEditable)) return;
    const panel = $('tab-chronicles');
    if (!panel || panel.classList.contains('hidden')) return;
    event.preventDefault();
    changeJournalBookPage(event.key === 'ArrowRight' ? 1 : -1);
});

