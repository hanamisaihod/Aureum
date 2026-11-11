// ============================================================================
// AUREUM — Chronicle Journal Book Reader & Daily Reflection Saving
// ============================================================================

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

function changeJournalBookPage(delta) {
    const diaryLogs = currentRawLogsCache.filter(l => l.type === 'diary');
    if (diaryLogs.length === 0) return;
    currentJournalPageIndex = Math.max(0, Math.min(diaryLogs.length - 1, currentJournalPageIndex + delta));
    renderJournalBookView(diaryLogs);
    playTone('save');
}

function renderJournalBookView(diaryLogs) {
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
        return;
    }
    const log = diaryLogs[currentJournalPageIndex];
    const logDate = getLogDate(log);
    label.innerText = `Page ${currentJournalPageIndex + 1} of ${diaryLogs.length}`;
    rightDate.innerText = logDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    rightContent.innerText = `"${log.text}"`;
    rightFooter.innerText = `Written by ${getUserDisplayName(log.user || viewedUser)}`;
}
