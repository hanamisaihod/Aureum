// ============================================================================
// AUREUM — Global Application State
// ============================================================================

let loggedInUser = 'North';
let viewedUser = 'North';
let currentUserUid = null;
let audioMuted = false;

let activeHoldTimer = null;
let activeHoldInterval = null;
let isTouchScrolling = false;
let currentJournalPageIndex = 0;
let journalFlipTimer = null;

let _cachedFocus = 25;
let _cachedShort = 5;
let _cachedLong = 15;
let _cachedShowMonthlyCodex = false;

try {
    const _sf = localStorage.getItem('aureum_pomo_focus');
    if (_sf) _cachedFocus = parseInt(_sf) || 25;
    const _ss = localStorage.getItem('aureum_pomo_short');
    if (_ss) _cachedShort = parseInt(_ss) || 5;
    const _sl = localStorage.getItem('aureum_pomo_long');
    if (_sl) _cachedLong = parseInt(_sl) || 15;
    const _scodex = localStorage.getItem('aureum_show_monthly_codex_v2');
    if (_scodex !== null) _cachedShowMonthlyCodex = _scodex === 'true';
} catch (e) {}

let activeChronicleFilter = 'all';
let activeTab = 'crucible';

let userSettings = {
    displayName: '',
    role: 'illustrator',
    monthlyCash: 8000,
    weeklyHours: 10,
    dailySoftCap: 4,
    maxBonusCapPct: 125,
    pomoFocus: _cachedFocus,
    pomoShort: _cachedShort,
    pomoLong: _cachedLong,
    pomoRounds: 4,
    pomoSound: 'zen_bowl',
    pomoSoundRepeats: 3,
    unloggedFocusSecs: 0,
    userTheme: 'gold',
    userCursor: 'default',
    bgPattern: 'dots',
    bgOpacity: 20,
    avatarUrl: '',
    particleIntensity: 15,
    audioMuted: false,
    showMonthlyCodex: _cachedShowMonthlyCodex,
    vaultedMonths: {},
    unlockedBadges: [],
    completedPomoHistory: [],
    scratchpadTodos: []
};

let goalsTargetsLocked = true;
let goalsUnlockConfirmPending = false;

let duoPresenceData = {
    North: { settings: {}, hoursToday: 0, logs: [] },
    Cream: { settings: {}, hoursToday: 0, logs: [] }
};

let currentTodayHoursLogged = 0;
let currentRawLogsCache = [];
let globalAllLogsCache = [];
let activeTickerLogIndex = 0;
let monthlyCodexFlipped = false;

// HUD info popup (personal card thermostat breakdown)
let hudInfoPopupUser = null;
let hudInfoPopupPinned = false;
let hudInfoPopupHideTimer = null;
let hudThermostatCache = { North: null, Cream: null };
let settingsUnsubscribe = null;
let globalLogsUnsubscribe = null;
let userLogsUnsubscribe = null;
let activityFeedUnsubscribe = null;
let unsubscribeNorthSettings = null;
let unsubscribeCreamSettings = null;
