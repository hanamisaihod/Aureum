// FIREBASE CONFIG & INITIALIZATION
const firebaseConfig = {
    apiKey: "AIzaSyAJ7cVPRiJfiShTKFi___pJ9VZHEcLM47Q",
    authDomain: "aureum-214d1.firebaseapp.com",
    projectId: "aureum-214d1",
    storageBucket: "aureum-214d1.firebasestorage.app",
    messagingSenderId: "967566110651",
    appId: "1:967566110651:web:4ee66bc4a6afd271b45e9e"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// GLOBAL STATE
let loggedInUser = 'North';
let viewedUser = 'North';
let currentUserUid = null;
let audioMuted = false;

let holdInterval = null;
let holdTimeout = null;

const RATING_DATA = {
    results: [
        { level: 1, icon: '⚡', title: 'Minimal', desc: 'Warmup or light prep' },
        { level: 2, icon: '🌱', title: 'Fair', desc: 'Modest progress made' },
        { level: 3, icon: '🎯', title: 'Solid', desc: 'On-target standard pace' },
        { level: 4, icon: '✨', title: 'High Craft', desc: 'Exceptional output speed' },
        { level: 5, icon: '👑', title: 'Peak Flow', desc: 'Flawless breakthrough' }
    ],
    effort: [
        { level: 1, icon: '🍃', title: 'Effortless', desc: 'Zero resistance or strain' },
        { level: 2, icon: '☁️', title: 'Light', desc: 'Mild focus required' },
        { level: 3, icon: '🔥', title: 'Moderate', desc: 'Standard focus effort' },
        { level: 4, icon: '⛰️', title: 'Heavy', desc: 'Overcame strong fatigue' },
        { level: 5, icon: '🌋', title: 'Max Willpower', desc: 'Intense willpower push' }
    ]
};

let userSettings = {
    monthlyCash: 8000,
    weeklyHours: 10,
    dailySoftCap: 4,
    maxBonusCapPct: 125,
    pomoFocus: 25,
    pomoShort: 5,
    pomoLong: 15,
    pomoRounds: 4,
    userTheme: 'gold',
    avatarUrl: '',
    vaultedMonths: {}
};

// AUDIO & NOTIFICATIONS
function playTone(type) {
    if (audioMuted) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (type === 'save') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.08);
            osc.start();
            osc.stop(ctx.currentTime + 0.08);
        } else if (type === 'delete') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
        } else if (type === 'pomoDone') {
            [0, 0.2, 0.4].forEach(delay => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(880, ctx.currentTime + delay);
                osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + delay + 0.15);
                gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
                gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + delay + 0.18);
                osc.start(ctx.currentTime + delay);
                osc.stop(ctx.currentTime + delay + 0.18);
            });
        }
    } catch (e) {}
}

function requestNotificationPermission() {
    try {
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission().catch(e => console.log("Notif blocked:", e));
        }
    } catch (e) {}
}

function triggerDesktopNotification(title, body) {
    try {
        if ("Notification" in window && Notification.permission === "granted") {
            new Notification(title, { body: body, icon: "https://fav.farm/✨" });
        }
    } catch (e) {}
}

function toggleAudioMute() {
    audioMuted = !audioMuted;
    document.getElementById('audio-toggle-btn').innerText = audioMuted ? "🔇" : "🔊";
}

// HOLDABLE STEPPERS & RATING SELECTORS
function stepValue(inputId, delta, step, min, max) {
    const input = document.getElementById(inputId);
    if (!input) return;
    let val = parseFloat(input.value) || 0;
    val += delta * step;
    if (min !== undefined && min !== null) val = Math.max(min, val);
    if (max !== undefined && max !== null) val = Math.min(max, val);
    
    input.value = step < 1 ? val.toFixed(2) : Math.round(val);
}

function startHoldStep(inputId, delta, step, min, max) {
    stopHoldStep();
    stepValue(inputId, delta, step, min, max);
    holdTimeout = setTimeout(() => {
        holdInterval = setInterval(() => stepValue(inputId, delta, step, min, max), 80);
    }, 300);
}

function stopHoldStep() {
    if (holdTimeout) clearTimeout(holdTimeout);
    if (holdInterval) clearInterval(holdInterval);
    holdTimeout = null;
    holdInterval = null;
}

function updateRatingUI(field) {
    const hiddenInput = document.getElementById(`work-${field}`);
    if (!hiddenInput) return;
    const val = parseInt(hiddenInput.value) || 3;
    const data = RATING_DATA[field][val - 1];
    
    if (field === 'results') {
        document.getElementById('q-icon').innerText = data.icon;
        document.getElementById('q-badge').innerText = `LVL ${data.level}`;
        document.getElementById('q-title').innerText = data.title;
        document.getElementById('q-desc').innerText = data.desc;
    } else {
        document.getElementById('e-icon').innerText = data.icon;
        document.getElementById('e-badge').innerText = `LVL ${data.level}`;
        document.getElementById('e-title').innerText = data.title;
        document.getElementById('e-desc').innerText = data.desc;
    }
}

function stepRating(field, delta) {
    const hiddenInput = document.getElementById(`work-${field}`);
    let currentVal = parseInt(hiddenInput.value) || 3;
    currentVal = Math.max(1, Math.min(5, currentVal + delta));
    hiddenInput.value = currentVal;
    updateRatingUI(field);
}

function startHoldStepRating(field, delta) {
    stopHoldStep();
    stepRating(field, delta);
    holdTimeout = setTimeout(() => {
        holdInterval = setInterval(() => stepRating(field, delta), 120);
    }, 300);
}

function applyThemeToBody(themeKey) {
    document.body.setAttribute('data-theme', themeKey || 'gold');
}
