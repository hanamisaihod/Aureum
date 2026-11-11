// ============================================================================
// AUREUM — Aureate Insights Real-Time Synthesis & Auto-Cycle Banner
// ============================================================================

let aureateInsightsData = [];
let currentInsightIndex = 0;
let insightsAutoCycleTimer = null;
let insightsAutoCyclePaused = false;

function calculateAureateInsights(rawLogs, pomoHistory, settings) {
    const insights = [];
    const workLogs = rawLogs.filter(l => l.type === 'work');
    const pomoList = pomoHistory || [];

    const targetPts = (settings.weeklyHours || 10) * 12;
    const pointRate = targetPts > 0 ? (settings.monthlyCash || 8000) / targetPts : 0;
    const maxBonus = (settings.monthlyCash || 8000) * ((settings.maxBonusCapPct || 125) / 100);

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
    // Calculates the rolling 30-day numerical averages for Quality vs. Effort and Peak Focus Ratio.
    const qe30 = calculateRolling30DayQE(rawLogs);
    if (qe30.count > 0) {
        const peakFocusPct = Math.round((qe30.stalwartCount / qe30.count) * 100);
        insights.push({
            icon: '⚖️',
            category: 'The Grindset Ratio',
            value: `${qe30.avgQuality.toFixed(1)} Avg Quality | ${qe30.avgEffort.toFixed(1)} Avg Effort`,
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

    const mtdCash = Math.min(mtdPts * pointRate, maxBonus);
    const sevenDayDailyAvgCash = (last7DaysPts * pointRate) / 7;
    const projectedCash = Math.min(maxBonus, mtdCash + (sevenDayDailyAvgCash * remainingDays));
    const lastMonthCash = Math.min(lastMonthPts * pointRate, maxBonus);

    let forecastComparison = '';
    if (lastMonthCash > 0) {
        const pctDiff = Math.round(((projectedCash - lastMonthCash) / lastMonthCash) * 100);
        const sign = pctDiff >= 0 ? '+' : '';
        forecastComparison = `${sign}${pctDiff}% vs last month (฿${Math.round(lastMonthCash).toLocaleString()})`;
    } else {
        const targetPct = Math.round((projectedCash / (settings.monthlyCash || 8000)) * 100);
        forecastComparison = `${targetPct}% of monthly base (฿${Math.round(sevenDayDailyAvgCash).toLocaleString()}/d pace)`;
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
    workLogs.forEach(l => {
        const d = getLogDate(l);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        monthlyPtsMap[key] = (monthlyPtsMap[key] || 0) + (l.points || 0);
    });
    let lifetimeEarnings = 0;
    const activeMonths = Object.keys(monthlyPtsMap).length;
    Object.values(monthlyPtsMap).forEach(pts => {
        lifetimeEarnings += Math.min(pts * pointRate, maxBonus);
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

    return insights;
}

function renderAureateInsight(idx, animated) {
    if (!aureateInsightsData || aureateInsightsData.length === 0) return;
    idx = Math.max(0, Math.min(aureateInsightsData.length - 1, idx));
    currentInsightIndex = idx;
    const data = aureateInsightsData[idx];

    const container = $('insights-content-container');
    const updateDOM = () => {
        if ($('insight-icon-box')) $('insight-icon-box').innerText = data.icon;
        if ($('insight-category')) $('insight-category').innerText = data.category;
        if ($('insight-value')) $('insight-value').innerText = data.value;
        if ($('insight-description')) $('insight-description').innerText = data.detail;
        if ($('insights-counter')) $('insights-counter').innerText = `${idx + 1} of ${aureateInsightsData.length}`;
        renderInsightsDots(idx, aureateInsightsData.length);
    };

    if (animated && container) {
        container.style.opacity = '0';
        container.style.transform = 'translateY(3px)';
        setTimeout(() => {
            updateDOM();
            container.style.opacity = '1';
            container.style.transform = 'translateY(0)';
        }, 180);
    } else {
        updateDOM();
    }
}

function renderInsightsDots(activeIdx, total) {
    const dotsEl = $('insights-dots-container');
    if (!dotsEl) return;
    let html = '';
    for (let i = 0; i < total; i++) {
        const isActive = (i === activeIdx);
        html += `<button type="button" onclick="selectAureateInsight(${i})" class="h-1 rounded-full transition-all duration-300 ${isActive ? 'w-3.5 bg-amber-400' : 'w-1 bg-slate-700 hover:bg-slate-500'}" title="Go to insight ${i + 1}"></button>`;
    }
    dotsEl.innerHTML = html;
}

function cycleAureateInsight(delta) {
    if (!aureateInsightsData || aureateInsightsData.length === 0) return;
    const n = aureateInsightsData.length;
    currentInsightIndex = (currentInsightIndex + delta + n) % n;
    renderAureateInsight(currentInsightIndex, true);
}

function selectAureateInsight(idx) {
    renderAureateInsight(idx, true);
}

function startAureateInsightsAutoCycle() {
    if (insightsAutoCycleTimer) clearInterval(insightsAutoCycleTimer);
    insightsAutoCycleTimer = setInterval(() => {
        if (!insightsAutoCyclePaused && aureateInsightsData && aureateInsightsData.length > 1) {
            currentInsightIndex = (currentInsightIndex + 1) % aureateInsightsData.length;
            renderAureateInsight(currentInsightIndex, true);
        }
    }, 6000);

    const banner = $('aureate-insights-banner');
    if (banner && !banner._hoverBound) {
        banner._hoverBound = true;
        banner.addEventListener('mouseenter', () => { insightsAutoCyclePaused = true; });
        banner.addEventListener('mouseleave', () => {
            if ($('insights-autoplay-icon')?.innerText === '⏸') {
                insightsAutoCyclePaused = false;
            }
        });
    }
}

function toggleAureateInsightsAutoPlay() {
    insightsAutoCyclePaused = !insightsAutoCyclePaused;
    const icon = $('insights-autoplay-icon');
    if (icon) icon.innerText = insightsAutoCyclePaused ? '▶' : '⏸';
    const btn = $('insights-autoplay-btn');
    if (btn) btn.title = insightsAutoCyclePaused ? 'Resume auto-cycle' : 'Pause auto-cycle';
}
