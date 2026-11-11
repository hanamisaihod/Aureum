// ============================================================================
// AUREUM — Guild Announcer Comment Engine & Quote Dictionary
// ============================================================================

const ANNOUNCER_QUOTES = {
    work: {
        // High Quality (4–5) & High Effort (4–5) [Hyper-Flow / Masterpiece]
        hyperFlow: [
            "Pure mastery on display! The guild archives take note.",
            "Incredible execution. That session was pure inspiration.",
            "Craftsmanship at its absolute peak. Legendary focus!",
            "A monumental push! Craft of this caliber leaves a mark.",
            "Flawless execution. The studio is buzzing!"
        ],
        // High Effort (4–5) & Moderate/Low Quality (1–3) [Grind & Grit]
        grindAndGrit: [
            "Thank you for your effort! The grind builds the foundation.",
            "Raw determination beats perfection every single time.",
            "Heavy lifting today. Respect the dedication!",
            "Pushing through the tough hours—that is true grit.",
            "Sweat and persistence. The breakthrough is coming!"
        ],
        // High Quality (4–5) & Moderate/Low Effort (1–3) [Effortless Flow]
        effortlessFlow: [
            "Nicely done! Smooth, elegant, and effective.",
            "Pure talent making hard craft look easy.",
            "Clean precision without burning out. Beautiful work!",
            "Finesse over force. A truly graceful session."
        ],
        // Moderate/Balanced (Q:3, E:3) & Standard Steady Output
        balanced: [
            "Solid, reliable progress. Brick by brick!",
            "Steady output keeps the engine humming.",
            "Another solid session logged for the craft.",
            "Consistency is the silent key to mastery."
        ]
    },
    fitness: [
        "Body tempered, spirit sharpened! Great workout.",
        "Building iron endurance step by step!",
        "Every rep counts toward the long journey.",
        "Movement is medicine. Fantastic energy!",
        "Stronger today than yesterday. Keep pushing!"
    ],
    chore: [
        "Sanctuary restored! Clean space, clear mind.",
        "Tackling the baseline duties like a champion.",
        "Order restored to the guild domain!",
        "The unsexy work that makes everything else run smooth."
    ],
    snack: [
        "Fueling up for the next big creative push.",
        "Rest and recovery are vital parts of the craft.",
        "A well-deserved break for the studio mind."
    ],
    diary: [
        "Wisdom inscribed into the guild chronicles.",
        "A quiet moment of reflection sharpens tomorrow's vision.",
        "Thoughts distilled into permanent lore. Well reflected!"
    ]
};

const _announcerQuoteCacheByLogId = {};

function _selectWorkQuotePool(quality, effort) {
    const q = Math.max(1, Math.min(5, parseFloat(quality) || 3));
    const e = Math.max(1, Math.min(5, parseFloat(effort) || 3));

    if (q >= 4 && e >= 4) {
        return ANNOUNCER_QUOTES.work.hyperFlow;
    }
    if (e >= 4 && q <= 3) {
        return ANNOUNCER_QUOTES.work.grindAndGrit;
    }
    if (q >= 4 && e <= 3) {
        return ANNOUNCER_QUOTES.work.effortlessFlow;
    }
    return ANNOUNCER_QUOTES.work.balanced;
}

function getAnnouncerComment(logType, quality = 3, effort = 3, cacheKey = null) {
    if (cacheKey && _announcerQuoteCacheByLogId[cacheKey]) {
        return _announcerQuoteCacheByLogId[cacheKey];
    }

    const normType = String(logType || 'work').trim().toLowerCase();
    let pool = ANNOUNCER_QUOTES.work.balanced;

    if (normType === 'work' || normType === 'crucible') {
        pool = _selectWorkQuotePool(quality, effort);
    } else if (normType === 'workout' || normType === 'fitness') {
        pool = ANNOUNCER_QUOTES.fitness;
    } else if (normType === 'chore' || normType === 'chores') {
        pool = ANNOUNCER_QUOTES.chore;
    } else if (normType === 'health' || normType === 'snack' || normType === 'recovery') {
        pool = ANNOUNCER_QUOTES.snack;
    } else if (normType === 'diary' || normType === 'reflection' || normType === 'journal') {
        pool = ANNOUNCER_QUOTES.diary;
    }

    if (!Array.isArray(pool) || pool.length === 0) {
        pool = ANNOUNCER_QUOTES.work.balanced;
    }

    const randomIdx = Math.floor(Math.random() * pool.length);
    const chosen = pool[randomIdx];

    if (cacheKey) {
        _announcerQuoteCacheByLogId[cacheKey] = chosen;
    }
    return chosen;
}
