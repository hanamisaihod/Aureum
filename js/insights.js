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

    // 1. Peak Productive Hours
    const hourBuckets = new Array(24).fill(0);
    workLogs.forEach(l => {
        const d = getLogDate(l);
        const h = d.getHours();
        hourBuckets[h] += (l.hours || 0);
    });
    let maxHour = -1, maxHourVal = 0;
    for (let h = 0; h < 24; h++) {
        if (hourBuckets[h] > maxHourVal) {
            maxHourVal = hourBuckets[h];
            maxHour = h;
        }
    }
    if (maxHour >= 0 && maxHourVal > 0) {
        const startStr = formatHourAmPm(maxHour);
        const endStr = formatHourAmPm((maxHour + 2) % 24);
        insights.push({
            icon: '⚡',
            category: 'Peak Window',
            value: `${startStr} – ${endStr}`,
            detail: `${formatHours(maxHourVal)}h in this window`
        });
    } else {
        insights.push({
            icon: '⚡',
            category: 'Peak Window',
            value: '9:00 AM – 11:00 AM',
            detail: 'Diurnal rhythm calibrating'
        });
    }

    // 2. Top Focus Day of the Week
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayBuckets = new Array(7).fill(0);
    workLogs.forEach(l => {
        const d = getLogDate(l);
        dayBuckets[d.getDay()] += (l.hours || 0);
    });
    let maxDay = -1, maxDayVal = 0;
    for (let i = 0; i < 7; i++) {
        if (dayBuckets[i] > maxDayVal) {
            maxDayVal = dayBuckets[i];
            maxDay = i;
        }
    }
    if (maxDay >= 0 && maxDayVal > 0) {
        insights.push({
            icon: '📅',
            category: 'Top Focus Day',
            value: `${dayNames[maxDay]}`,
            detail: `${formatHours(maxDayVal)}h cumulative work`
        });
    } else {
        insights.push({
            icon: '📅',
            category: 'Top Focus Day',
            value: 'Midweek Cadence',
            detail: 'Calibrating with logged work'
        });
    }

    // 3. Longest Unbroken Session
    let maxPomoSecs = 0;
    pomoList.forEach(p => {
        if (!p.wasPaused && (p.durationSecs || 0) > maxPomoSecs) {
            maxPomoSecs = p.durationSecs;
        }
    });
    let maxWorkH = 0;
    workLogs.forEach(l => {
        if ((l.hours || 0) > maxWorkH) maxWorkH = l.hours;
    });

    if (maxPomoSecs > 0 || maxWorkH > 0) {
        let displayVal = '';
        if (maxPomoSecs >= 3600) {
            displayVal = `${formatHours(maxPomoSecs / 3600)} Hours (Clock)`;
        } else if (maxPomoSecs > 0 && (maxPomoSecs / 3600) >= maxWorkH) {
            displayVal = `${Math.round(maxPomoSecs / 60)} Mins (Focus)`;
        } else {
            displayVal = `${formatHours(maxWorkH)} Hours (Work)`;
        }
        insights.push({
            icon: '🛡️',
            category: 'Longest Flow',
            value: displayVal,
            detail: '0 pause interruptions'
        });
    } else {
        insights.push({
            icon: '🛡️',
            category: 'Longest Flow',
            value: '50 Mins (Target)',
            detail: 'Flow with zero pauses'
        });
    }

    // 4. Clean Session Rate
    const totalPomoCount = pomoList.length;
    const cleanPomoCount = pomoList.filter(p => !p.wasPaused).length;
    if (totalPomoCount > 0) {
        const cleanRate = Math.round((cleanPomoCount / totalPomoCount) * 100);
        insights.push({
            icon: '💎',
            category: 'Clean Flow Rate',
            value: `${cleanRate}% Clean`,
            detail: `${cleanPomoCount}/${totalPomoCount} clean rounds`
        });
    } else {
        insights.push({
            icon: '💎',
            category: 'Clean Flow Rate',
            value: '100% Clean',
            detail: '0 pauses recorded'
        });
    }

    // 5. Lifetime Career Earnings
    const monthlyPtsMap = {};
    workLogs.forEach(l => {
        const d = getLogDate(l);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        monthlyPtsMap[key] = (monthlyPtsMap[key] || 0) + (l.points || 0);
    });
    const targetPts = (settings.weeklyHours || 10) * 12;
    const pointRate = targetPts > 0 ? (settings.monthlyCash || 8000) / targetPts : 0;
    const maxBonus = (settings.monthlyCash || 8000) * ((settings.maxBonusCapPct || 125) / 100);
    let lifetimeEarnings = 0;
    const activeMonths = Object.keys(monthlyPtsMap).length;
    Object.values(monthlyPtsMap).forEach(pts => {
        lifetimeEarnings += Math.min(pts * pointRate, maxBonus);
    });

    insights.push({
        icon: '👑',
        category: 'Career Earnings',
        value: `฿${Math.round(lifetimeEarnings).toLocaleString()}`,
        detail: `Over ${Math.max(1, activeMonths)} active cycle${activeMonths === 1 ? '' : 's'}`
    });

    // 6. Ascension Milestone & Lifetime PWR
    const lifetimePWR = calculateLifetimePWR(rawLogs);
    const rankInfo = getRankDetails(lifetimePWR);
    insights.push({
        icon: '🏺',
        category: 'Ascension Rank',
        value: `R${rankInfo.rank} • ${rankInfo.title}`,
        detail: `${lifetimePWR.toLocaleString()} Lifetime PWR`
    });

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
