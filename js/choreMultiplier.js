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
    return _choreRound2(total);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateChoreMultiplier,
        calculateMonthlyAllowanceBreakdown,
        sumMonthlyChoreHours,
        CHORE_TIER_STEP_HOURS,
        CHORE_TIER_BONUS_RATE,
        CHORE_MAX_TIER,
        CHORE_MAX_TIER_HOURS
    };
}
