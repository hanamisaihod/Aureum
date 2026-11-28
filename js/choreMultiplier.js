// ============================================================================
// AUREUM — Monthly Chore-to-Allowance Multiplier Engine
// ============================================================================
// Pure, dependency-free helpers that link logged chore hours to the work
// allowance payout. Loaded as a classic script (globals) and also exported for
// Node-based unit tests.
//
// Progression ladder (every 10 logged chore hours unlocks +5%, capped at +25%):
//   < 10h  -> Tier 0  +0%  (1.00x)
//   10–20h -> Tier 1  +5%  (1.05x)
//   20–30h -> Tier 2  +10% (1.10x)
//   30–40h -> Tier 3  +15% (1.15x)
//   40–50h -> Tier 4  +20% (1.20x)
//   >= 50h -> Tier 5  +25% (1.25x)  MAX
// ============================================================================

const CHORE_TIER_STEP_HOURS = 10;
const CHORE_TIER_BONUS_RATE = 0.05;
const CHORE_MAX_TIER = 5;
const CHORE_MAX_TIER_HOURS = CHORE_TIER_STEP_HOURS * CHORE_MAX_TIER;

function _choreRound2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Converts a Firestore Timestamp / Date / ISO string into a Date.
 * @param {*} value
 * @returns {Date|null}
 */
function _choreToDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') {
        const d = value.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    }
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Calculates the chore multiplier tier and bonus based on monthly chore hours.
 * @param {number|string} choreHours - Total chore hours logged in the calendar month
 * @returns {{
 *   tier: number,
 *   bonusRate: number,
 *   multiplier: number,
 *   hoursToNextTier: number,
 *   isMaxTier: boolean,
 *   totalHours: number,
 *   tierLabel: string,
 *   bonusPercent: string,
 *   nextTierLabel: string,
 *   nextTierHours: number,
 *   tierFloorHours: number,
 *   progressPercent: number,
 *   maxTier: number,
 *   maxTierHours: number
 * }}
 */
function calculateChoreMultiplier(choreHours) {
    const parsed = parseFloat(choreHours);
    const hours = Math.max(0, Number.isFinite(parsed) ? parsed : 0);
    const tier = Math.min(Math.floor(hours / CHORE_TIER_STEP_HOURS), CHORE_MAX_TIER);
    const bonusRate = _choreRound2(tier * CHORE_TIER_BONUS_RATE);
    const multiplier = 1 + bonusRate;
    const isMaxTier = tier >= CHORE_MAX_TIER;
    const tierFloorHours = tier * CHORE_TIER_STEP_HOURS;
    const nextTierHours = isMaxTier ? CHORE_MAX_TIER_HOURS : (tier + 1) * CHORE_TIER_STEP_HOURS;
    // Keep at least 0.01h of headroom when a tier is still locked so the UI
    // never claims "0h to next tier" before the threshold is actually crossed.
    const hoursToNextTier = isMaxTier
        ? 0
        : Math.max(0.01, _choreRound2(Math.max(0, nextTierHours - hours)));
    const progressPercent = isMaxTier
        ? 100
        : _choreRound2(Math.min(100, Math.max(0, ((hours - tierFloorHours) / CHORE_TIER_STEP_HOURS) * 100)));

    return {
        tier,
        bonusRate,
        multiplier,
        hoursToNextTier,
        isMaxTier,
        totalHours: hours,
        tierLabel: `Tier ${tier}`,
        bonusPercent: `${Math.round(bonusRate * 100)}%`,
        nextTierLabel: isMaxTier ? 'Max Tier Unlocked' : `Tier ${tier + 1} (+${(tier + 1) * 5}%)`,
        nextTierHours,
        tierFloorHours,
        progressPercent,
        maxTier: CHORE_MAX_TIER,
        maxTierHours: CHORE_MAX_TIER_HOURS
    };
}

/**
 * Applies the unlocked tier multiplier retroactively to an entire month's
 * accumulated base work allowance.
 *
 * The optional `monthlyAllowanceLimit` is a HARD ceiling — the monthly limit
 * defined as `targetAllowance × maxBonusCapPct / 100`. The chore tier bonus can
 * never push the payout above it, and the bonus itself never changes the limit.
 * @param {number|string} baseWorkAllowance - Base allowance earned from work logs this month
 * @param {number|string} choreHours - Total chore hours logged this month
 * @param {number|string} [monthlyAllowanceLimit] - Hard monthly ceiling (target allowance × max bonus cap %)
 * @returns {ReturnType<typeof calculateChoreMultiplier> & {
 *   baseAllowance: number,
 *   finalMonthlyAllowance: number,
 *   choreBonusAmount: number,
 *   monthlyAllowanceLimit: number|null,
 *   payoutCapped: boolean
 * }}
 */
function calculateMonthlyAllowanceBreakdown(baseWorkAllowance, choreHours, monthlyAllowanceLimit) {
    const parsedBase = parseFloat(baseWorkAllowance);
    const safeBase = Math.max(0, Number.isFinite(parsedBase) ? parsedBase : 0);

    // Resolve the hard limit first. Invalid/omitted limits mean "no ceiling".
    const parsedLimit = parseFloat(monthlyAllowanceLimit);
    const limit = Number.isFinite(parsedLimit) && parsedLimit >= 0 ? _choreRound2(parsedLimit) : null;

    // The base work allowance can never sit above the limit either.
    const base = limit === null ? safeBase : Math.min(safeBase, limit);
    const tierInfo = calculateChoreMultiplier(choreHours);
    const baseAllowance = _choreRound2(base);
    const uncappedAllowance = _choreRound2(baseAllowance * tierInfo.multiplier);
    const finalMonthlyAllowance = limit === null ? uncappedAllowance : Math.min(uncappedAllowance, limit);

    return {
        ...tierInfo,
        baseAllowance,
        finalMonthlyAllowance,
        choreBonusAmount: _choreRound2(finalMonthlyAllowance - baseAllowance),
        monthlyAllowanceLimit: limit,
        payoutCapped: limit !== null && (safeBase > limit || uncappedAllowance > finalMonthlyAllowance)
    };
}

/**
 * Sums all completed chore hours for one calendar month.
 * Every chore category counts; only `type === 'chore'` entries are included.
 * @param {Array<Object>} logs - Raw log documents (may include any log type)
 * @param {number} year - Full calendar year (e.g. 2026)
 * @param {number} month - Zero-based calendar month (0 = January)
 * @returns {number}
 */
function sumMonthlyChoreHours(logs, year, month) {
    if (!Array.isArray(logs)) return 0;
    let total = 0;
    for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        if (!log || log.type !== 'chore') continue;
        const d = _choreToDate(log.timestamp ?? log.date ?? log.createdAt);
        if (!d || d.getFullYear() !== year || d.getMonth() !== month) continue;
        const hrs = parseFloat(log.hours);
        if (Number.isFinite(hrs) && hrs > 0) total += hrs;
    }
    // Keep full precision here: tier thresholds are applied to the raw sum so
    // 9.999h cannot silently round up into Tier 1 before the tier is resolved.
    return total;
}

// ============================================================================
// CO-OP SPILLOVER — Pure Duo Monthly Allowance Engine
// ============================================================================
// Both partners are computed together from the same raw log snapshot. Each
// partner has an independent personal ceiling:
//   personalCeiling = monthlyBaseCap × (1 + maxBonusRate)
// Anything a partner earns above that ceiling (work hours × the retroactive
// chore tier) overflows 1:1 to the other partner. No Firestore writes and no
// cached state — add/edit/delete a log and the next snapshot recomputes it.

const DUO_USER_KEYS = ['North', 'Cream'];
const DUO_PARTNER_MAP = { North: 'Cream', Cream: 'North' };

function _choreResolveUserSettings(settings, user) {
    if (!settings || typeof settings !== 'object') return {};
    const scoped = settings[user];
    if (scoped && typeof scoped === 'object') return scoped;
    // A single, shared settings object applies to both partners.
    return settings;
}

function _choreFiniteNumber(value, fallback) {
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function _choreResolveMonthlyBaseCap(settings) {
    const keys = ['monthlyBaseCap', 'monthlyCap', 'monthlyCash'];
    for (let i = 0; i < keys.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(settings, keys[i])) continue;
        const raw = settings[keys[i]];
        // An explicitly null/empty cap means "uncapped", not "fall through".
        if (raw === null || raw === undefined || raw === '') return NaN;
        const parsed = parseFloat(raw);
        return Number.isFinite(parsed) ? parsed : NaN;
    }
    return NaN;
}

function _choreResolveMaxBonusRate(settings) {
    const explicit = parseFloat(settings.maxBonusRate);
    if (Number.isFinite(explicit) && explicit >= 0) return explicit;
    const capPct = parseFloat(settings.maxBonusCapPct);
    if (Number.isFinite(capPct) && capPct >= 0) return Math.max(0, capPct / 100 - 1);
    // Default to the chore ladder's own maximum: 5 tiers × +5% = +25%.
    return _choreRound2(CHORE_MAX_TIER * CHORE_TIER_BONUS_RATE);
}

/**
 * Resolves a work log's earned points. Stored points win (they already encode
 * the quality/effort weighting and soft-cap split); legacy logs without points
 * fall back to the canonical hours × average rating formula.
 */
function _choreWorkLogPoints(log) {
    const parsed = parseFloat(log.points);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
    const hours = Math.max(0, _choreFiniteNumber(log.hours, 0));
    const quality = Math.min(5, Math.max(1, _choreFiniteNumber(log.results, 3)));
    const effort = Math.min(5, Math.max(1, _choreFiniteNumber(log.effort, 3)));
    return hours * ((quality + effort) / 2);
}

function _choreMonthlyTotalsForUser(logs, user, year, month) {
    let workHours = 0;
    let choreHours = 0;
    let monthlyPoints = 0;
    if (!Array.isArray(logs)) {
        return { workHours: 0, choreHours: 0, monthlyPoints: 0 };
    }
    for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        if (!log || log.user !== user) continue;
        const d = _choreToDate(log.timestamp ?? log.date ?? log.createdAt);
        if (!d || d.getFullYear() !== year || d.getMonth() !== month) continue;
        if (log.type === 'work') {
            const hrs = _choreFiniteNumber(log.hours, 0);
            if (hrs > 0) workHours += hrs;
            monthlyPoints += _choreWorkLogPoints(log);
        } else if (log.type === 'chore') {
            const hrs = _choreFiniteNumber(log.hours, 0);
            if (hrs > 0) choreHours += hrs;
        }
    }
    return {
        workHours,
        choreHours,
        monthlyPoints
    };
}

function _choreComputeUserAllowance(user, totals, settings) {
    const s = settings || {};
    const weeklyHours = _choreFiniteNumber(s.weeklyHours, 0) > 0 ? _choreFiniteNumber(s.weeklyHours, 0) : 10;
    const monthlyCash = _choreFiniteNumber(s.monthlyCash, 0) > 0 ? _choreFiniteNumber(s.monthlyCash, 0) : 8000;
    const targetPoints = weeklyHours * 12;
    const pointRate = targetPoints > 0 ? monthlyCash / targetPoints : 0;

    const tierInfo = calculateChoreMultiplier(totals.choreHours);

    // The canonical base allowance is monthly points × the configured point
    // rate. `baseHourlyRate` exposes the effective configured hourly rate so the
    // same figure can be read as workHours × rate.
    const rawBaseEarned = _choreRound2(totals.monthlyPoints * pointRate);
    // Keep the effective hourly rate unrounded so `workHours × baseHourlyRate`
    // reproduces `rawBaseEarned` exactly; formatting happens at the UI boundary.
    const baseHourlyRate = totals.workHours > 0
        ? (rawBaseEarned / totals.workHours)
        : pointRate;
    const rawTotalEarned = _choreRound2(rawBaseEarned * tierInfo.multiplier);

    const monthlyBaseCap = _choreResolveMonthlyBaseCap(s);
    const maxBonusRate = _choreResolveMaxBonusRate(s);
    const hasCap = Number.isFinite(monthlyBaseCap) && monthlyBaseCap > 0;
    const personalCeiling = hasCap ? _choreRound2(monthlyBaseCap * (1 + maxBonusRate)) : Infinity;
    const personalCappedEarned = Math.min(rawTotalEarned, personalCeiling);
    const spilloverGenerated = hasCap ? _choreRound2(Math.max(0, rawTotalEarned - personalCeiling)) : 0;

    return {
        user,
        partner: DUO_PARTNER_MAP[user] || null,
        monthlyBaseCap: hasCap ? _choreRound2(monthlyBaseCap) : monthlyBaseCap,
        maxBonusRate,
        hasCap,
        personalCeiling,
        workHours: totals.workHours,
        choreHours: totals.choreHours,
        monthlyPoints: totals.monthlyPoints,
        targetPoints,
        pointRate,
        baseHourlyRate,
        rawBaseEarned,
        rawTotalEarned,
        personalCappedEarned,
        cappedByCeiling: hasCap && rawTotalEarned > personalCeiling + 1e-9,
        spilloverGenerated,
        // Cross-partner transfer values are filled in once both users resolve.
        spilloverSent: 0,
        spilloverReceived: 0,
        finalPayout: personalCappedEarned,
        // Chore tier payload (same shape as calculateChoreMultiplier).
        tier: tierInfo.tier,
        bonusRate: tierInfo.bonusRate,
        multiplier: tierInfo.multiplier,
        bonusPercent: tierInfo.bonusPercent,
        tierLabel: tierInfo.tierLabel,
        isMaxTier: tierInfo.isMaxTier,
        tierInfo
    };
}

/**
 * Computes both partners' monthly allowance + Co-Op Spillover from raw logs.
 *
 * @param {Array<Object>} logs - Raw log documents for BOTH users
 * @param {Object} settings - `{ North: {...}, Cream: {...} }` or one shared object
 * @param {number} year - Full calendar year (e.g. 2026)
 * @param {number} month - Zero-based calendar month (0 = January)
 * @returns {{
 *   year: number,
 *   month: number,
 *   users: { North: Object, Cream: Object },
 *   North: Object,
 *   Cream: Object,
 *   bothMaxed: boolean,
 *   hasSpillover: boolean,
 *   totalSent: number,
 *   totalReceived: number
 * }}
 */
function computeDuoMonthlyAllowance(logs, settings, year, month) {
    const parsedYear = parseInt(year, 10);
    const parsedMonth = parseInt(month, 10);
    const safeYear = Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear();
    const safeMonth = Number.isFinite(parsedMonth)
        ? Math.min(11, Math.max(0, parsedMonth))
        : new Date().getMonth();

    const users = {};
    DUO_USER_KEYS.forEach(user => {
        const userSettings = _choreResolveUserSettings(settings, user);
        const totals = _choreMonthlyTotalsForUser(logs, user, safeYear, safeMonth);
        users[user] = _choreComputeUserAllowance(user, totals, userSettings);
    });

    const north = users.North;
    const cream = users.Cream;
    const bothMaxed = north.spilloverGenerated > 0 && cream.spilloverGenerated > 0;

    if (bothMaxed) {
        // Mutual overflow cancels: never inflate past the combined ceilings.
        north.spilloverSent = 0;
        north.spilloverReceived = 0;
        cream.spilloverSent = 0;
        cream.spilloverReceived = 0;
    } else {
        north.spilloverSent = north.spilloverGenerated;
        north.spilloverReceived = cream.spilloverGenerated;
        cream.spilloverSent = cream.spilloverGenerated;
        cream.spilloverReceived = north.spilloverGenerated;
    }

    DUO_USER_KEYS.forEach(user => {
        const entry = users[user];
        entry.finalPayout = _choreRound2(entry.personalCappedEarned + entry.spilloverReceived);
    });

    const totalSent = _choreRound2(users.North.spilloverSent + users.Cream.spilloverSent);
    const totalReceived = _choreRound2(users.North.spilloverReceived + users.Cream.spilloverReceived);

    return {
        year: safeYear,
        month: safeMonth,
        users,
        North: users.North,
        Cream: users.Cream,
        bothMaxed,
        hasSpillover: totalSent > 0 || totalReceived > 0,
        totalSent,
        totalReceived
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateChoreMultiplier,
        calculateMonthlyAllowanceBreakdown,
        sumMonthlyChoreHours,
        computeDuoMonthlyAllowance,
        CHORE_TIER_STEP_HOURS,
        CHORE_TIER_BONUS_RATE,
        CHORE_MAX_TIER,
        CHORE_MAX_TIER_HOURS,
        DUO_USER_KEYS,
        DUO_PARTNER_MAP
    };
}
