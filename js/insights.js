// ============================================================================
// AUREUM — Aureate Insights Synthesis & Horizon Bento Card Renderer
// ============================================================================
// The insights are computed from raw logs + the habit thermostat only. They are
// rendered exclusively inside #view-horizon; the sidebar no longer owns any
// insight markup, render calls, or auto-cycling state.

function calculateAureateInsights(rawLogs, pomoHistory, settings) {
    const insights = [];
    const workLogs = rawLogs.filter(l => l.type === 'work');
    const pomoList = pomoHistory || [];

    const targetPts = (settings.weeklyHours || 10) * 12;
    const targetCash = settings.monthlyCash || 8000;
    const pointRate = targetPts > 0 ? targetCash / targetPts : 0;
    // Hard monthly limit = target allowance × max bonus cap %. Chore bonuses are
    // applied inside this ceiling and can never raise or exceed it.
    const monthlyLimit = targetCash * ((settings.maxBonusCapPct || 125) / 100);

    // 1. The Catalyst Hour
    // Identifies the 2-hour daily window with the highest average Quality (>= 4) achieved during high-effort work (Effort >= 4).
    const catalystDesc = 'Peak two-hour deep focus window.';
    let bestCatalystStart = -1, bestCatalystQ = 0, bestCatalystE = 0;
    let fallbackQ4Start = -1, fallbackQ4_Q = 0, fallbackQ4_E = 0;
    let fallbackAnyStart = -1, fallbackAnyQ = 0, fallbackAnyE = 0;

    for (let h = 0; h < 24; h++) {
        const hNext = (h + 1) % 24;
        const winLogs = workLogs.filter(l => {
            const lh = getLogDate(l).getHours();
            return lh === h || lh === hNext;
        });
        if (winLogs.length > 0) {
            let sumQ = 0, sumE = 0;
            let heSumQ = 0, heSumE = 0, heCount = 0;
            winLogs.forEach(l => {
                const q = parseFloat(l.results) || 3;
                const e = parseFloat(l.effort) || 3;
                sumQ += q;
                sumE += e;
                if (e >= 4) {
                    heSumQ += q;
                    heSumE += e;
                    heCount++;
                }
            });
            const avgQ = sumQ / winLogs.length;
            const avgE = sumE / winLogs.length;

            if (heCount > 0) {
                const heAvgQ = heSumQ / heCount;
                const heAvgE = heSumE / heCount;
                if (heAvgQ >= 4) {
                    if (heAvgQ > bestCatalystQ || (heAvgQ === bestCatalystQ && heAvgE > bestCatalystE)) {
                        bestCatalystStart = h;
                        bestCatalystQ = heAvgQ;
                        bestCatalystE = heAvgE;
                    }
                }
            }

            if (avgQ >= 4) {
                if (avgQ > fallbackQ4_Q || (avgQ === fallbackQ4_Q && avgE > fallbackQ4_E)) {
                    fallbackQ4Start = h;
                    fallbackQ4_Q = avgQ;
                    fallbackQ4_E = avgE;
                }
            }

            if (avgQ > fallbackAnyQ || (avgQ === fallbackAnyQ && avgE > fallbackAnyE)) {
                fallbackAnyStart = h;
                fallbackAnyQ = avgQ;
                fallbackAnyE = avgE;
            }
        }
    }

    const chosenCatalystStart = bestCatalystStart >= 0
        ? bestCatalystStart
        : (fallbackQ4Start >= 0 ? fallbackQ4Start : fallbackAnyStart);

    if (chosenCatalystStart >= 0) {
        const startStr = formatHourAmPm(chosenCatalystStart);
        const endStr = formatHourAmPm((chosenCatalystStart + 2) % 24);
        insights.push({
            icon: '⚡',
            category: 'The Catalyst Hour',
            value: `${startStr} – ${endStr}`,
            detail: catalystDesc
        });
    } else {
        insights.push({
            icon: '⚡',
            category: 'The Catalyst Hour',
            value: '9:00 AM – 11:00 AM',
            detail: catalystDesc
        });
    }

    // 2. The Grindset Ratio
    // Rolling 30-day Quality vs. Effort averages + peak-focus shift count,
    // computed directly from raw work logs (no legacy progression engine).
    const thirtyDayCutoff = Date.now() - (30 * 86400000);
    const recentWorkLogs = workLogs.filter(l => getLogDate(l).getTime() >= thirtyDayCutoff);
    const totalShifts30d = recentWorkLogs.length;
    let sumQuality30d = 0, sumEffort30d = 0, stalwartCount = 0;
    recentWorkLogs.forEach(l => {
        const q = parseFloat(l.results) || 3;
        const e = parseFloat(l.effort) || 3;
        sumQuality30d += q;
        sumEffort30d += e;
        if (q >= 4 && e >= 4) stalwartCount++;
    });
    if (totalShifts30d > 0) {
        const avgQuality30d = sumQuality30d / totalShifts30d;
        const avgEffort30d = sumEffort30d / totalShifts30d;
        const peakFocusPct = Math.round((stalwartCount / totalShifts30d) * 100);
        insights.push({
            icon: '⚖️',
            category: 'The Grindset Ratio',
            value: `${avgQuality30d.toFixed(1)} Avg Quality | ${avgEffort30d.toFixed(1)} Avg Effort`,
            detail: `${peakFocusPct}% Peak Focus Shifts`
        });
    } else {
        insights.push({
            icon: '⚖️',
            category: 'The Grindset Ratio',
            value: '3.0 Avg Quality | 3.0 Avg Effort',
            detail: '0% Peak Focus Shifts'
        });
    }

    // 3. Pace Forecast
    // Projects end-of-month allowance payout: MTD Allowance + (7-Day Daily Avg * Remaining Days in Month).
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate();
    const remainingDays = Math.max(0, daysInMonth - now.getDate());

    let mtdPts = 0, lastMonthPts = 0, last7DaysPts = 0;
    const prevMonthDate = new Date(curYear, curMonth - 1, 1);
    const prevYear = prevMonthDate.getFullYear(), prevMonth = prevMonthDate.getMonth();
    const sevenDaysAgo = now.getTime() - (7 * 86400000);

    workLogs.forEach(l => {
        const d = getLogDate(l);
        const pts = l.points || 0;
        if (d.getFullYear() === curYear && d.getMonth() === curMonth) mtdPts += pts;
        else if (d.getFullYear() === prevYear && d.getMonth() === prevMonth) lastMonthPts += pts;
        if (d.getTime() >= sevenDaysAgo) last7DaysPts += pts;
    });

    const mtdChoreHours = sumMonthlyChoreHours(rawLogs, curYear, curMonth);
    const mtdTier = calculateChoreMultiplier(mtdChoreHours);
    const baseMtdCash = Math.min(mtdPts * pointRate, monthlyLimit);
    const sevenDayDailyAvgCash = (last7DaysPts * pointRate) / 7;
    const baseProjectedCash = Math.min(monthlyLimit, baseMtdCash + (sevenDayDailyAvgCash * remainingDays));
    // The estimate is hard-capped at the monthly limit — the chore bonus can
    // never push the projection above target allowance × max bonus cap %.
    const rawProjectedCash = baseProjectedCash * mtdTier.multiplier;
    const projectedCash = Math.min(monthlyLimit, rawProjectedCash);
    const projectionCapped = rawProjectedCash > monthlyLimit + 0.005;
    const lastMonthChoreHours = sumMonthlyChoreHours(rawLogs, prevYear, prevMonth);
    const lastMonthCash = Math.min(monthlyLimit, Math.min(lastMonthPts * pointRate, monthlyLimit) * calculateChoreMultiplier(lastMonthChoreHours).multiplier);

    const capSuffix = projectionCapped ? ` • ⛔ ฿${Math.round(monthlyLimit).toLocaleString()} monthly cap` : '';
    const tierSuffix = (mtdTier.tier > 0 ? ` • 🧹 +${mtdTier.bonusPercent} Tier ${mtdTier.tier}` : '') + capSuffix;

    let forecastComparison = '';
    if (lastMonthCash > 0) {
        const pctDiff = Math.round(((projectedCash - lastMonthCash) / lastMonthCash) * 100);
        const sign = pctDiff >= 0 ? '+' : '';
        forecastComparison = `${sign}${pctDiff}% vs last month (฿${Math.round(lastMonthCash).toLocaleString()})${tierSuffix}`;
    } else {
        const targetPct = Math.round((projectedCash / targetCash) * 100);
        forecastComparison = `${targetPct}% of monthly base (฿${Math.round(sevenDayDailyAvgCash).toLocaleString()}/d pace)${tierSuffix}`;
    }

    insights.push({
        icon: '📈',
        category: 'Pace Forecast',
        value: `฿${Math.round(projectedCash).toLocaleString()} Est.`,
        detail: forecastComparison
    });

    // 4. Longest Flow (Retained)
    // Queries the user's single longest uninterrupted Pomodoro/focus session duration from all time.
    let maxPomoSecs = 0;
    pomoList.forEach(p => {
        if (!p.wasPaused && (p.durationSecs || 0) > maxPomoSecs) {
            maxPomoSecs = p.durationSecs;
        }
    });
    let maxWorkMins = 0;
    workLogs.forEach(l => {
        const mins = Math.round((l.hours || 0) * 60);
        if (mins > maxWorkMins) maxWorkMins = mins;
    });

    const peakFlowMins = maxPomoSecs > 0 ? Math.round(maxPomoSecs / 60) : maxWorkMins;
    insights.push({
        icon: '🛡️',
        category: 'Longest Flow',
        value: peakFlowMins > 0 ? `${peakFlowMins} Mins` : '0 Mins',
        detail: peakFlowMins > 0 ? 'All-time unbroken focus record' : 'Complete an unbroken focus round'
    });

    // 5. Career Earnings (Retained)
    // Calculates the lifetime total sum of all allowance paid out across all recorded sessions.
    const monthlyPtsMap = {};
    const monthlyChoreMap = {};
    rawLogs.forEach(l => {
        const d = getLogDate(l);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (l.type === 'work') {
            monthlyPtsMap[key] = (monthlyPtsMap[key] || 0) + (l.points || 0);
        } else if (l.type === 'chore') {
            monthlyChoreMap[key] = (monthlyChoreMap[key] || 0) + (parseFloat(l.hours) || 0);
        }
    });
    let lifetimeEarnings = 0;
    const activeMonths = Object.keys(monthlyPtsMap).length;
    Object.entries(monthlyPtsMap).forEach(([key, pts]) => {
        const baseCash = Math.min(pts * pointRate, monthlyLimit);
        // Each month's payout is hard-capped at the monthly limit.
        lifetimeEarnings += Math.min(monthlyLimit, baseCash * calculateChoreMultiplier(monthlyChoreMap[key] || 0).multiplier);
    });

    insights.push({
        icon: '👑',
        category: 'Career Earnings',
        value: `฿${Math.round(lifetimeEarnings).toLocaleString()}`,
        detail: `Lifetime payout across ${Math.max(1, activeMonths)} cycle${activeMonths === 1 ? '' : 's'}`
    });

    // 6. Peak Shift (High Score)
    // Identifies the single day with the highest total earnings, or the single session with the highest score (Hours * Quality * Effort).
    const dayPointsMap = {};
    const dayDateObjMap = {};
    let bestSessionScore = 0;
    let bestSessionLog = null;

    workLogs.forEach(l => {
        const d = getLogDate(l);
        const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        dayPointsMap[dayKey] = (dayPointsMap[dayKey] || 0) + (l.points || 0);
        if (!dayDateObjMap[dayKey]) dayDateObjMap[dayKey] = d;

        const q = parseFloat(l.results) || 3;
        const e = parseFloat(l.effort) || 3;
        const h = parseFloat(l.hours) || 0;
        const sessionScore = h * q * e;
        if (sessionScore > bestSessionScore) {
            bestSessionScore = sessionScore;
            bestSessionLog = l;
        }
    });

    let peakDayKey = null, peakDayPts = 0;
    Object.keys(dayPointsMap).forEach(k => {
        if (dayPointsMap[k] > peakDayPts) {
            peakDayPts = dayPointsMap[k];
            peakDayKey = k;
        }
    });

    if (peakDayKey && bestSessionLog) {
        const peakDayCash = Math.round(peakDayPts * pointRate);
        const dateStr = dayDateObjMap[peakDayKey].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const bQ = bestSessionLog.results || 3;
        const bE = bestSessionLog.effort || 3;
        const bH = formatHours(bestSessionLog.hours || 0);
        insights.push({
            icon: '🔥',
            category: 'Peak Shift',
            value: `฿${peakDayCash.toLocaleString()} (${dateStr})`,
            detail: `Best Shift: ${bH}h • Q${bQ}/E${bE} (${Math.round(bestSessionScore)} Score)`
        });
    } else {
        insights.push({
            icon: '🔥',
            category: 'Peak Shift',
            value: '฿0 Record',
            detail: 'Log work to set a high score'
        });
    }

    // 7. Consistency Streak
    // Current consecutive active-day streak plus the best 30-day coverage.
    const activeDaySet = new Set();
    const activityLogs = rawLogs.filter(l => ['work', 'chore', 'workout', 'diary', 'health'].includes(l.type));
    activityLogs.forEach(l => {
        const d = getLogDate(l);
        if (isNaN(d.getTime())) return;
        activeDaySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    const dayKeyFor = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let currentStreak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    // Allow today to be empty until it is logged; start from yesterday then.
    if (!activeDaySet.has(dayKeyFor(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (activeDaySet.has(dayKeyFor(cursor))) {
        currentStreak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    let activeIn30 = 0;
    for (let offset = 0; offset < 30; offset++) {
        const d = new Date();
        d.setDate(d.getDate() - offset);
        if (activeDaySet.has(dayKeyFor(d))) activeIn30 += 1;
    }
    insights.push({
        icon: '🔥',
        category: 'Consistency Streak',
        value: `${currentStreak} Day${currentStreak === 1 ? '' : 's'}`,
        detail: `${activeIn30}/30 active days • ${activeDaySet.size} total active days`
    });

    // 8. Habit Thermostat
    // Reads the rolling 7-day state straight from computeHabitThermostat.
    const thermostat = (typeof computeHabitThermostat === 'function')
        ? computeHabitThermostat(rawLogs, settings, Date.now())
        : null;
    if (thermostat) {
        const m = thermostat.metrics || {};
        insights.push({
            icon: '🌡️',
            category: 'Habit Thermostat',
            value: thermostat.label,
            detail: `${formatHours(m.workH || 0)}h work • ${formatHours(m.choreH || 0)}h chores • ${m.activeDays || 0}/7 active days`
        });
    }

    return insights;
}

const HORIZON_INSIGHT_TONES = ['amber', 'emerald', 'sky', 'violet', 'rose', 'teal', 'gold', 'indigo'];

/**
 * Renders the relocated Aureate Insight cards as a responsive bento grid inside
 * #view-horizon. Each card is a static read of the computed insight payload, so
 * add/edit/delete log snapshots simply re-run the calculation and re-render.
 * @param {Array<{icon:string,category:string,value:string,detail:string}>} insights
 */
function renderHorizonInsightCards(insights) {
    const grid = $('horizon-insight-grid');
    if (!grid) return;
    if (!Array.isArray(insights) || insights.length === 0) {
        grid.innerHTML = '<div class="horizon-empty sm:col-span-2 xl:col-span-4">No insights yet — log a session to synthesize the bento.</div>';
        return;
    }
    grid.innerHTML = insights.map((insight, idx) => {
        const tone = HORIZON_INSIGHT_TONES[idx % HORIZON_INSIGHT_TONES.length];
        const icon = escapeHtml(insight.icon || '✨');
        const category = escapeHtml(insight.category || 'Insight');
        const value = escapeHtml(insight.value || '—');
        const detail = escapeHtml(insight.detail || '');
        return `<article class="horizon-insight-card" data-tone="${tone}" aria-label="${category}">
            <div class="flex items-start justify-between gap-2">
                <span class="horizon-insight-icon" aria-hidden="true">${icon}</span>
                <span class="horizon-insight-index">${String(idx + 1).padStart(2, '0')}</span>
            </div>
            <div class="horizon-insight-category">${category}</div>
            <div class="horizon-insight-value">${value}</div>
            <div class="horizon-insight-detail">${detail}</div>
        </article>`;
    }).join('');
}
