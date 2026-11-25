// ============================================================================
// AUREUM — End-of-Month Payoff Receipt (Monthly Statement Modal)
// ============================================================================
// Reuses the pure chore-multiplier engine (js/choreMultiplier.js) and the habit
// thermostat (js/thermostat.js) so the statement always mirrors the dashboard
// math: base work allowance + retroactive chore bonus = final payout.
// ============================================================================

const RECEIPT_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

let payoffReceiptYear = null;
let payoffReceiptMonth = null;

function _receiptViewedSettings() {
    if (loggedInUser === viewedUser) return userSettings || {};
    return (typeof spectatorSettings !== 'undefined' && spectatorSettings)
        || duoPresenceData?.[viewedUser]?.settings
        || userSettings
        || {};
}

function _receiptLogsForViewedUser() {
    if (Array.isArray(currentRawLogsCache) && currentRawLogsCache.length > 0) return currentRawLogsCache;
    return duoPresenceData?.[viewedUser]?.logs || [];
}

function _receiptAllLogs() {
    if (Array.isArray(globalAllLogsCache) && globalAllLogsCache.length > 0) return globalAllLogsCache;
    if (Array.isArray(currentRawLogsCache) && currentRawLogsCache.length > 0) return currentRawLogsCache;
    return [...(duoPresenceData?.North?.logs || []), ...(duoPresenceData?.Cream?.logs || [])];
}

function _receiptSumHours(logs, type) {
    return (logs || []).reduce((acc, log) => {
        if (!log || log.type !== type) return acc;
        const hrs = parseFloat(log.hours);
        return Number.isFinite(hrs) && hrs > 0 ? acc + hrs : acc;
    }, 0);
}

function _receiptMoney(value) {
    return `฿${Math.round(Number(value) || 0).toLocaleString('en-US')}`;
}

function _receiptHours(value) {
    const num = parseFloat(value);
    return `${(Number.isFinite(num) ? num : 0).toFixed(2)} h`;
}

function getPayoffReceiptMonthBounds() {
    const now = new Date();
    let minMs = new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime();
    _receiptAllLogs().forEach(log => {
        if (!log || !log.timestamp) return;
        const d = getLogDate(log);
        if (!d || isNaN(d.getTime())) return;
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        if (monthStart < minMs) minMs = monthStart;
    });
    return { minMs, maxMs: new Date(now.getFullYear(), now.getMonth(), 1).getTime() };
}

function _receiptDuoMonthTotals(year, month) {
    const totals = {
        North: { workH: 0, choreH: 0 },
        Cream: { workH: 0, choreH: 0 }
    };
    _receiptAllLogs().forEach(log => {
        const user = log?.user;
        if (user !== 'North' && user !== 'Cream') return;
        const d = getLogDate(log);
        if (!d || isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== month) return;
        const hrs = parseFloat(log.hours);
        if (!Number.isFinite(hrs) || hrs <= 0) return;
        if (log.type === 'work') totals[user].workH += hrs;
        else if (log.type === 'chore') totals[user].choreH += hrs;
    });
    return {
        North: totals.North,
        Cream: totals.Cream,
        workH: totals.North.workH + totals.Cream.workH,
        choreH: totals.North.choreH + totals.Cream.choreH
    };
}

function updatePayoffReceiptButtonState() {
    const btn = $('open-payoff-receipt-btn');
    if (!btn) return;
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = lastDay - now.getDate();
    const isDue = daysLeft <= 2; // final 3 calendar days (e.g. 29th-31st or 28th-30th)
    btn.classList.toggle('is-due', isDue);
    btn.title = isDue
        ? `Month closes in ${daysLeft + 1} day${daysLeft === 0 ? '' : 's'} — generate the payoff receipt`
        : 'Generate your monthly payoff receipt';
    const badge = $('payoff-receipt-due-badge');
    if (badge) {
        badge.classList.toggle('hidden', !isDue);
        badge.innerText = daysLeft === 0 ? 'Final day' : `${daysLeft + 1}d left`;
    }
}

function openPayoffReceipt(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const now = new Date();
    if (payoffReceiptYear === null || payoffReceiptMonth === null) {
        payoffReceiptYear = now.getFullYear();
        payoffReceiptMonth = now.getMonth();
    }
    const modal = $('payoff-receipt-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
    }
    renderPayoffReceipt();
    playTone('save');
}

function closePayoffReceipt(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const modal = $('payoff-receipt-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }
}

function shiftPayoffReceiptMonth(delta, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const now = new Date();
    const baseYear = payoffReceiptYear === null ? now.getFullYear() : payoffReceiptYear;
    const baseMonth = payoffReceiptMonth === null ? now.getMonth() : payoffReceiptMonth;
    const target = new Date(baseYear, baseMonth + (parseInt(delta, 10) || 0), 1);
    const bounds = getPayoffReceiptMonthBounds();
    const targetMs = Math.min(Math.max(target.getTime(), bounds.minMs), bounds.maxMs);
    const next = new Date(targetMs);
    payoffReceiptYear = next.getFullYear();
    payoffReceiptMonth = next.getMonth();
    renderPayoffReceipt();
    playTone('step');
}

function refreshPayoffReceipt() {
    updatePayoffReceiptButtonState();
    const modal = $('payoff-receipt-modal');
    if (modal && !modal.classList.contains('hidden')) renderPayoffReceipt();
}

document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const modal = $('payoff-receipt-modal');
    if (modal && !modal.classList.contains('hidden')) closePayoffReceipt(e);
});

try { updatePayoffReceiptButtonState(); } catch (e) {}


/**
 * Builds every figure shown on the payoff statement for one calendar month.
 * Through a month the logs are filtered `1st 00:00` -> `last day 23:59:59`;
 * the same helpers the dashboard uses keep the totals reconciled.
 *
 * @param {number} year
 * @param {number} month - zero-based calendar month
 * @returns {Object}
 */
function computePayoffReceiptData(year, month) {
    const now = new Date();
    const monthTitle = `${RECEIPT_MONTH_NAMES[month]} ${year}`;
    const isCurrent = (year === now.getFullYear() && month === now.getMonth());
    const monthEndMs = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
    const refMs = isCurrent ? Date.now() : monthEndMs;

    const monthLogs = _receiptLogsForViewedUser().filter(log => {
        const d = getLogDate(log);
        return d && !isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month;
    });
    const workLogs = monthLogs.filter(l => l.type === 'work');
    const workH = _receiptSumHours(monthLogs, 'work');
    const choreH = _receiptSumHours(monthLogs, 'chore');
    const workoutH = _receiptSumHours(monthLogs, 'workout');
    const monthlyPoints = workLogs.reduce((acc, l) => {
        const pts = parseFloat(l.points);
        return acc + (Number.isFinite(pts) ? pts : 0);
    }, 0);
    const activeDays = new Set(monthLogs.map(l => {
        const d = getLogDate(l);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })).size;

    const settings = _receiptViewedSettings();
    const targetCash = parseFloat(settings.monthlyCash) || 8000;
    const weeklyHours = parseFloat(settings.weeklyHours) || 10;
    const maxBonusPct = parseFloat(settings.maxBonusCapPct) || 125;
    const targetPts = weeklyHours * 12;
    const pointRate = targetPts > 0 ? (targetCash / targetPts) : 0;
    const maxCash = targetCash * (maxBonusPct / 100);
    const baseAllowance = Math.min(monthlyPoints * pointRate, maxCash);
    const breakdown = calculateMonthlyAllowanceBreakdown(baseAllowance, choreH, maxCash);

    // The statement's thermostat describes the whole calendar month (month-to-date
    // while the current month is open), so the window tracks the month span rather
    // than the engine's default trailing 7 days.
    const thermostatDayMs = (typeof THERMOSTAT_DAY_MS === 'number' && THERMOSTAT_DAY_MS > 0)
        ? THERMOSTAT_DAY_MS
        : 86400000;
    const monthStartMs = new Date(year, month, 1).getTime();
    const monthWindowDays = Math.max(1, Math.round((refMs - monthStartMs) / thermostatDayMs));
    const thermostat = typeof computeHabitThermostat === 'function'
        ? computeHabitThermostat(monthLogs, settings, refMs, { windowDays: monthWindowDays })
        : { state: 'NO_DATA', label: '⏳ Warming Up' };

    return {
        year, month, monthTitle, isCurrent,
        displayName: getUserDisplayName(viewedUser),
        isSelf: loggedInUser === viewedUser,
        workH, choreH, workoutH, monthlyPoints, workLogCount: workLogs.length, activeDays,
        pointRate, targetCash, targetPts, maxCash, maxBonusPct,
        baseAllowance, breakdown, thermostat,
        duo: _receiptDuoMonthTotals(year, month)
    };
}

function renderPayoffReceipt() {
    const body = $('payoff-receipt-body');
    if (!body) return;

    const now = new Date();
    const year = payoffReceiptYear === null ? now.getFullYear() : payoffReceiptYear;
    const month = payoffReceiptMonth === null ? now.getMonth() : payoffReceiptMonth;
    const data = computePayoffReceiptData(year, month);

    body.innerHTML = _buildPayoffReceiptHtml(data);

    const labelEl = $('payoff-receipt-month-label');
    if (labelEl) labelEl.innerText = data.monthTitle;

    const bounds = getPayoffReceiptMonthBounds();
    const monthStartMs = new Date(year, month, 1).getTime();
    const prevBtn = $('payoff-receipt-prev');
    const nextBtn = $('payoff-receipt-next');
    if (prevBtn) {
        prevBtn.disabled = monthStartMs <= bounds.minMs;
        prevBtn.classList.toggle('opacity-40', prevBtn.disabled);
    }
    if (nextBtn) {
        nextBtn.disabled = monthStartMs >= bounds.maxMs;
        nextBtn.classList.toggle('opacity-40', nextBtn.disabled);
    }
}


function _receiptRowHtml(label, value, opts) {
    const o = opts || {};
    return `<div class="flex items-center justify-between gap-2">
        <span class="text-[11px] ${o.strong ? 'text-slate-200 font-bold' : 'text-slate-400'}">${label}</span>
        <span class="text-[11px] font-mono ${o.strong ? 'font-black' : 'font-bold'} ${o.tint || 'text-slate-100'} text-right whitespace-nowrap">${value}</span>
    </div>`;
}

function _buildPayoffReceiptHtml(d) {
    return `<div class="space-y-3.5 receipt-figures">
        ${_receiptHeaderHtml(d)}
        ${_receiptEarningsSectionHtml(d)}
        ${_receiptChoreSectionHtml(d)}
        ${_receiptTotalSectionHtml(d)}
        ${_receiptHabitDuoSectionHtml(d)}
        <div class="text-center text-[9px] font-mono text-slate-500 pt-1">Issued by Aureum • ${d.isCurrent ? 'Month in progress' : 'Closed statement'}</div>
    </div>`;
}

function _receiptHeaderHtml(d) {
    return `<div class="text-center space-y-1 pb-1">
        <div class="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">Aureum Monthly Statement</div>
        <div class="text-xl sm:text-2xl font-black text-slate-100">${escapeHtml(d.monthTitle)}</div>
        <div class="text-[11px] font-mono text-slate-400">Prepared for ${escapeHtml(d.displayName)}${d.isSelf ? '' : ' · Read-only'}</div>
    </div>`;
}

function _receiptEarningsSectionHtml(d) {
    return `<section class="pt-3 receipt-dashed space-y-1.5">
        <div class="text-[9px] font-black uppercase tracking-widest text-slate-500">Work &amp; Base Earnings</div>
        ${_receiptRowHtml('Total Work Hours', _receiptHours(d.workH))}
        ${_receiptRowHtml('Logged Shifts', String(d.workLogCount))}
        ${_receiptRowHtml('Base Rate', `฿${d.pointRate.toFixed(2)} / pt`)}
        ${_receiptRowHtml('Earned Points', `${formatHours(d.monthlyPoints)} pts`)}
        ${_receiptRowHtml('Base Work Allowance', _receiptMoney(d.breakdown.baseAllowance), { strong: true })}
    </section>`;
}


function _receiptChoreSectionHtml(d) {
    const cm = d.breakdown;
    const bonusTint = cm.choreBonusAmount > 0 ? 'text-emerald-400' : 'text-slate-400';
    const capNote = cm.payoutCapped
        ? `<p class="text-[10px] text-amber-300/90 leading-snug">Capped at the monthly limit ${_receiptMoney(cm.monthlyAllowanceLimit)} (target × max bonus cap).</p>`
        : '';
    return `<section class="pt-3 receipt-dashed space-y-1.5">
        <div class="flex items-center justify-between gap-2">
            <span class="text-[9px] font-black uppercase tracking-widest text-slate-500">Chore Multiplier Breakdown</span>
            <span class="text-[9px] font-mono text-slate-500">×${cm.multiplier.toFixed(2)}</span>
        </div>
        ${_receiptRowHtml('Total Chore Hours', _receiptHours(d.choreH))}
        ${_receiptRowHtml('Unlocked Tier', `${cm.tierLabel}${cm.isMaxTier ? ' · MAX' : ''}`)}
        ${_receiptRowHtml('Multiplier Percentage', `+${cm.bonusPercent}`)}
        ${_receiptRowHtml('Retroactive Chore Bonus', `+${_receiptMoney(cm.choreBonusAmount)}`, { strong: true, tint: bonusTint })}
        ${capNote}
    </section>`;
}

function _receiptTotalSectionHtml(d) {
    return `<section class="pt-3 receipt-dashed">
        <div class="flex items-center justify-between gap-2">
            <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Grand Total</span>
            <span class="text-[9px] font-mono text-slate-500">Base + Retroactive Bonus</span>
        </div>
        <div class="flex items-end justify-between gap-2 mt-1">
            <span class="text-xs font-bold text-slate-300">Final Allowance Payout</span>
            <span class="text-2xl font-black font-mono text-emerald-300">${_receiptMoney(d.breakdown.finalMonthlyAllowance)}</span>
        </div>
        <div class="text-[9px] font-mono text-slate-500 mt-0.5">Target ${_receiptMoney(d.targetCash)} · Cap ${_receiptMoney(d.maxCash)}</div>
    </section>`;
}

function _receiptHabitDuoSectionHtml(d) {
    const t = d.thermostat || {};
    const badge = typeof getThermostatBadgeClasses === 'function'
        ? getThermostatBadgeClasses(t.state)
        : 'bg-slate-800 text-slate-300 border-slate-700';
    const duo = d.duo || {
        North: { workH: 0, choreH: 0 }, Cream: { workH: 0, choreH: 0 },
        workH: 0, choreH: 0
    };
    return `<section class="pt-3 receipt-dashed space-y-1.5">
        <div class="text-[9px] font-black uppercase tracking-widest text-slate-500">Habit &amp; Duo Snapshot</div>
        <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] text-slate-400">Habit Thermostat</span>
            <span class="text-[10px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap ${badge}">${escapeHtml(t.label || '—')}</span>
        </div>
        ${_receiptRowHtml('Active Days', String(d.activeDays))}
        ${_receiptRowHtml('Workout Hours', _receiptHours(d.workoutH))}
        <div class="pt-2 mt-1 receipt-dashed">
            <div class="text-[9px] font-black uppercase tracking-widest text-slate-500">Duo Household Total</div>
            <div class="grid grid-cols-2 gap-2 mt-1.5">
                <div class="p-2 rounded-lg bg-slate-900/70 border border-slate-800">
                    <div class="text-[8px] uppercase tracking-wider font-extrabold text-slate-500">Combined Work</div>
                    <div class="text-sm font-black font-mono text-amber-300">${_receiptHours(duo.workH)}</div>
                </div>
                <div class="p-2 rounded-lg bg-slate-900/70 border border-slate-800">
                    <div class="text-[8px] uppercase tracking-wider font-extrabold text-slate-500">Combined Chores</div>
                    <div class="text-sm font-black font-mono text-sky-300">${_receiptHours(duo.choreH)}</div>
                </div>
            </div>
            <div class="text-[9px] font-mono text-slate-500 mt-1.5">North ${_receiptHours(duo.North.workH)} work · ${_receiptHours(duo.North.choreH)} chores</div>
            <div class="text-[9px] font-mono text-slate-500">Cream ${_receiptHours(duo.Cream.workH)} work · ${_receiptHours(duo.Cream.choreH)} chores</div>
        </div>
    </section>`;
}
