// ============================================================================
// AUREUM — Firebase Configuration & Static Catalog Constants
// ============================================================================

const $ = (id) => document.getElementById(id);

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

const RATING_DATA = {
    results: [
        { level: 1, icon: '⚡', title: 'Minimal', desc: 'Warmup or light prep' },
        { level: 2, icon: '🌱', title: 'Fair Output', desc: 'Modest progress made' },
        { level: 3, icon: '🎯', title: 'Solid Output', desc: 'Standard steady progress' },
        { level: 4, icon: '✨', title: 'High Craft', desc: 'Exceptional output speed' },
        { level: 5, icon: '👑', title: 'Peak Flow', desc: 'Flawless breakthrough' }
    ],
    effort: [
        { level: 1, icon: '🍃', title: 'Effortless', desc: 'Zero resistance or strain' },
        { level: 2, icon: '☁️', title: 'Light', desc: 'Mild focus required' },
        { level: 3, icon: '🔥', title: 'Moderate Strain', desc: 'Standard focus effort' },
        { level: 4, icon: '⛰️', title: 'Heavy Strain', desc: 'Overcame strong fatigue' },
        { level: 5, icon: '🌋', title: 'Max Strain', desc: 'Intense willpower push' }
    ],
    workoutStrain: [
        { level: 1, icon: '🍃', title: 'Light Recovery', desc: 'Mobility & gentle movement' },
        { level: 2, icon: '☁️', title: 'Steady Pace', desc: 'Aerobic endurance flow' },
        { level: 3, icon: '🔥', title: 'Moderate Effort', desc: 'Standard workout circuit' },
        { level: 4, icon: '⛰️', title: 'High Intensity', desc: 'Heavy strength & calisthenics' },
        { level: 5, icon: '🌋', title: 'Max Strain', desc: 'Maximum effort conditioning' }
    ]
};

const THEME_PATTERN_COLORS = {
    gold: '%23f59e0b', rose: '%23fbbf24', emerald: '%23f59e0b', cyber: '%2338bdf8', sunset: '%23f472b6',
    amethyst: '%2334d399', ocean: '%23fbbf24', crimson: '%2338bdf8', matcha: '%23c084fc', monochrome: '%23f59e0b'
};

const BADGE_CATALOG = [
    { id: 'work_1', tier: 'bronze', icon: '🌱', title: "Spark of Endeavor", desc: 'Log your very first work session.' },
    { id: 'work_cap', tier: 'silver', icon: '🍵', title: 'Crucible Mastered', desc: 'Reach daily Soft Cap (4.0h) in a single day.' },
    { id: 'work_100', tier: 'gold', icon: '🎯', title: 'Century Ore', desc: 'Reach 100 total hours logged all-time.' },
    { id: 'work_1000', tier: 'titan', icon: '🏛️', title: "Alchemist's Vault", desc: 'Reach 1,000 total hours logged all-time.' },
    { id: 'work_10000', tier: 'aureum', icon: '👑', title: "Philosopher's Touch", desc: 'Reach 10,000 total hours logged all-time.' },
    { id: 'pomo_1', tier: 'bronze', icon: '⏱️', title: 'Chrono Ignition', desc: 'Complete 1 focus session.' },
    { id: 'pomo_flow', tier: 'silver', icon: '🌊', title: 'Temporal Stream', desc: 'Complete 4 focus rounds in a single day.' },
    { id: 'pomo_deep', tier: 'silver', icon: '🤿', title: 'Abyssal Focus', desc: 'Complete a 50+ minute focus session.' },
    { id: 'pomo_overdrive', tier: 'gold', icon: '🔥', title: 'Chrono Overdrive', desc: 'Complete 8 focus rounds in a single day.' },
    { id: 'pomo_unbroken', tier: 'gold', icon: '🛡️', title: 'Unbroken Seal', desc: 'Complete a 50+ minute focus session without pausing.' },
    { id: 'pomo_marathon', tier: 'titan', icon: '🏃', title: 'Timeless Marathon', desc: 'Complete 12 focus rounds in a single day.' },
    { id: 'pomo_zen', tier: 'titan', icon: '🧘', title: 'Zenith Loop', desc: 'Complete 4 back-to-back sessions without a pause.' },
    { id: 'pomo_perfect', tier: 'aureum', icon: '✨', title: 'Eternity Loop', desc: 'Complete a full 4-round loop with zero pauses.' },
    { id: 'workout_1', tier: 'bronze', icon: '🏃', title: "Warrior's Rite", desc: 'Log your first fitness workout.' },
    { id: 'chore_1', tier: 'bronze', icon: '🧹', title: 'Ward of the Keep', desc: 'Log your first house chore.' },
    { id: 'chore_25', tier: 'silver', icon: '🏰', title: 'Sanctuary Warden', desc: 'Log 25 total hours of house chores.' },
    { id: 'chore_100', tier: 'gold', icon: '🌟', title: 'Monolith of the Home', desc: 'Log 100 total hours of house chores.' },
    { id: 'diary_1', tier: 'bronze', icon: '✍️', title: 'Mindful Scroll', desc: 'Save your first daily reflection note.' },
    { id: 'diary_30', tier: 'silver', icon: '📖', title: "Chronicler's Parchment", desc: 'Save 30 daily reflection notes all-time.' },
    { id: 'diary_100', tier: 'gold', icon: '🧠', title: 'High Tome of Wisdom', desc: 'Save 100 daily reflection notes all-time.' },
    { id: 'streak_3', tier: 'bronze', icon: '⚡', title: 'Tri-Flame Ignition', desc: 'Maintain a 3-day active streak.' },
    { id: 'streak_7', tier: 'silver', icon: '🚀', title: 'Unyielding Crest', desc: 'Maintain a 7-day active streak.' },
    { id: 'streak_30', tier: 'gold', icon: '💎', title: 'Obsidian Solace', desc: 'Maintain a 30-day active streak.' },
    { id: 'streak_100', tier: 'aureum', icon: '🌋', title: 'Monolith of Eternity', desc: 'Maintain a 100-day active streak.' }
];
