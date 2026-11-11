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

let _cachedFocus = 25;
let _cachedShort = 5;
let _cachedLong = 15;

try {
    const _sf = localStorage.getItem('aureum_pomo_focus');
    if (_sf) _cachedFocus = parseInt(_sf) || 25;
    const _ss = localStorage.getItem('aureum_pomo_short');
    if (_ss) _cachedShort = parseInt(_ss) || 5;
    const _sl = localStorage.getItem('aureum_pomo_long');
    if (_sl) _cachedLong = parseInt(_sl) || 15;
} catch (e) {}

const USER_ROLE_BINDINGS = {
    North: { role: 'illustrator', domain: 'Artisan', label: 'Illustrator' },
    Hanamisaihod: { role: 'illustrator', domain: 'Artisan', label: 'Illustrator' },
    Cream: { role: 'author', domain: 'Chronicler', label: 'Author' }
};

let activeChronicleFilter = 'all';

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
    statusNote: '',
    vaultedMonths: {},
    unlockedBadges: [],
    completedPomoHistory: [],
    scratchpadTodos: []
};

let goalsTargetsLocked = true;
let goalsUnlockConfirmPending = false;

let duoPresenceData = {
    North: { role: 'illustrator', domain: 'Artisan', settings: {}, hoursToday: 0, powerScore: 0, logs: [], workStyle: 'Grand Virtuoso' },
    Cream: { role: 'author', domain: 'Chronicler', settings: {}, hoursToday: 0, powerScore: 0, logs: [], workStyle: 'Arch-Chronicler' }
};

let currentTodayHoursLogged = 0;
let currentRawLogsCache = [];
let settingsUnsubscribe = null;
let globalLogsUnsubscribe = null;
let unsubscribeNorthSettings = null;
let unsubscribeCreamSettings = null;
