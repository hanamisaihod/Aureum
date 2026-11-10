// ============================================================================
// AUREUM — 100-Tier Rank System, Power Calculation & Roadmap Modal
// ============================================================================

const RANK_TITLES = ["The Unbound Spark", "Ember Initiate", "Apprentice of the Flame", "Hearth Warden", "Crucible Aspirant", "Alloy Seeker", "Alchemical Neophyte", "Forge Tender", "Zephyr Walker", "Copper Artisan", "Ironclad Striker", "Cinder Weaver", "Pyre Adept", "Calcinated Mind", "Argent Novice", "Crucible Journeyman", "Gilded Wayfarer", "Silver Sentinel", "Mercury Scholar", "Auric Disciple", "Athanor Craftsman", "Transmutation Prowler", "Goldforged Knight", "Solar Initiate", "Electrum Warden", "Prismatic Shaper", "Radiant Adept", "Luminary Vanguard", "Astral Smelter", "Ether Alchemist", "Meridian Sage", "Solstice Harvester", "Aureate Stasis Master", "Chrysalis Champion", "Resonant Artificer", "Dawnstrider", "Sunstone Guardian", "Gilded Templar", "Stellar Weaver", "Alchemical Magus", "Celestial Metallurgist", "Void Refiner", "Golden Zenith", "Chrono Weaver", "Eclipse Conqueror", "Solarian Prelate", "Aurora Commander", "Epoch Walker", "Zenith Alchemist", "Aegis of the Sun", "Prime Transmuter", "Crucible Chancellor", "Auric Archon", "Astral Luminary", "Singularity Pioneer", "Solar Vanguard", "Nova Architect", "Ethereal Sovereign", "Dawn Paragon", "Quintessence Keeper", "Grand Artificer", "Golden Imperator", "Primordial Refiner", "Celestial Chancellor", "Starforged Hierarch", "Meridian Overlord", "Astral Viceroy", "Sol Invictus", "Empyrean Warden", "Crowned Alchemist", "Hyperion Ascendant", "Solar Dominus", "Aether Sovereign", "Chronos Patriarch", "Celestial Paragon", "Stellar Warlord", "Infinite Transmuter", "Zenith Monarch", "Sunfire Primarch", "Seraph of Aureum", "Architect of Cosmos", "Astral Demiurge", "Gilded Colossus", "Cosmic Overseer", "Primordial Dawn", "Eternal Forgemaster", "Horizon Sovereign", "Supernova Regent", "Empyrean Overlord", "Master of Infinity", "Celestial Primarch", "Omnipresent Luminary", "Godforged Emperor", "Sol Sovereign", "Astral Omnipotent", "Lord of the Crucible", "Crown of the Cosmos", "Alpha and Omega", "Immortal of Aureum", "Grand Sovereign of Eternity"];

const RANK_THRESHOLDS = [0, 80, 340, 770, 1400, 2200, 3200, 4400, 5750, 7350, 9100, 11100, 13200, 15600, 18100, 20900, 23800, 27000, 30400, 33900, 37700, 41600, 45800, 50200, 54700, 59500, 64500, 69700, 75100, 80700, 86500, 92500, 98700, 105000, 112000, 118500, 125500, 133000, 140500, 148000, 156000, 164000, 172500, 181000, 189500, 198500, 208000, 217000, 226500, 236500, 246500, 256500, 267000, 278000, 288500, 299500, 311000, 322500, 334000, 346000, 358000, 370500, 383000, 396000, 409000, 422000, 435500, 449000, 463000, 477000, 491500, 506000, 520500, 535500, 550500, 566000, 581500, 597500, 613500, 629500, 646000, 662500, 679500, 696500, 714000, 731500, 749500, 767500, 785500, 804000, 822500, 841500, 860500, 879500, 899000, 919000, 939000, 959000, 979500, 1000000];

function getRankDetails(pwr) {
    const score = Math.max(0, pwr || 0);
    let rank = 1;
    for (let i = 99; i >= 0; i--) {
        if (score >= RANK_THRESHOLDS[i]) {
            rank = i + 1;
            break;
        }
    }
    const title = RANK_TITLES[rank - 1];
    const currentThreshold = RANK_THRESHOLDS[rank - 1];
    const nextThreshold = rank < 100 ? RANK_THRESHOLDS[rank] : null;
    let progressPct = 100;
    let neededPWR = 0;
    if (nextThreshold !== null) {
        const span = nextThreshold - currentThreshold;
        progressPct = Math.min(100, Math.max(0, ((score - currentThreshold) / span) * 100));
        neededPWR = Math.max(0, nextThreshold - score);
    }
    return {
        rank,
        title,
        currentThreshold,
        nextThreshold,
        progressPct,
        neededPWR,
        lifetimePWR: score
    };
}

function calculateLifetimePWR(logs) {
    let workH = 0, workoutH = 0, choreH = 0;
    if (!logs || !Array.isArray(logs)) return 0;
    for (let i = 0; i < logs.length; i++) {
        const l = logs[i];
        if (l.type === 'work') workH += (l.hours || 0);
        else if (l.type === 'workout') workoutH += (l.hours || 0);
        else if (l.type === 'chore') choreH += (l.hours || 0);
    }
    return Math.round((workH * 100) + (workoutH * 120) + (choreH * 80));
}
const calculatePowerScore = calculateLifetimePWR;

function calculateAndRenderPowerMeter(logs) {
    const pwrScore = calculateLifetimePWR(logs);
    const rankDetails = getRankDetails(pwrScore);
    if ($('power-score-val')) $('power-score-val').innerText = pwrScore.toLocaleString();
    if ($('power-level-bar')) $('power-level-bar').style.width = `${Math.min(100, Math.round(rankDetails.progressPct))}%`;
}

function openRankRoadmapModal(targetUser, evt) {
    if (evt && evt.stopPropagation) evt.stopPropagation();
    const u = targetUser || viewedUser || loggedInUser;
    const pwr = duoPresenceData[u]?.powerScore || 0;
    const rankInfo = getRankDetails(pwr);
    const s = (u === loggedInUser) ? userSettings : (spectatorSettings || duoPresenceData[u]?.settings || {});

    const sumEl = $('rank-modal-summary');
    if (sumEl) {
        let nextStr = rankInfo.nextThreshold !== null ? `Next: Rank ${rankInfo.rank + 1} (${rankInfo.neededPWR.toLocaleString()} PWR needed)` : 'Maximum Rank Attained 👑';
        sumEl.innerHTML = `
            <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                    <img src="${s.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${u}`}" alt="${u}" class="w-12 h-12 rounded-xl border border-slate-700 shrink-0">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="font-black text-sm text-slate-100">${u}</span>
                            <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">RANK ${rankInfo.rank}</span>
                        </div>
                        <div class="text-xs font-bold theme-accent-text truncate">${rankInfo.title}</div>
                    </div>
                </div>
                <div class="text-right shrink-0">
                    <div class="text-xl font-black text-amber-400 font-mono">${pwr.toLocaleString()} <span class="text-xs text-slate-400">PWR</span></div>
                    <div class="text-[10px] text-slate-400 font-mono">${Math.round(rankInfo.progressPct)}% to Rank ${Math.min(100, rankInfo.rank + 1)}</div>
                </div>
            </div>
            <div class="space-y-1">
                <div class="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-700/80 p-[1px]">
                    <div class="theme-accent-bg h-full rounded-full transition-all duration-500" style="width: ${Math.min(100, Math.max(0, rankInfo.progressPct))}%"></div>
                </div>
                <div class="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>Rank ${rankInfo.rank} (${rankInfo.currentThreshold.toLocaleString()} PWR)</span>
                    <span>${nextStr}</span>
                </div>
            </div>
        `;
    }

    const listEl = $('rank-roadmap-list');
    if (listEl) {
        let itemsHtml = '';
        for (let i = 0; i < 100; i++) {
            const rNum = i + 1;
            const rTitle = RANK_TITLES[i];
            const rThresh = RANK_THRESHOLDS[i];
            const isActive = (rNum === rankInfo.rank);
            const isUnlocked = (rNum <= rankInfo.rank);

            let cardClass = 'p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all ';
            let badgeHtml = '';
            if (isActive) {
                cardClass += 'bg-amber-500/15 border-amber-500/80 shadow-md';
                badgeHtml = '<span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 uppercase shrink-0">Active</span>';
            } else if (isUnlocked) {
                cardClass += 'bg-slate-900/60 border-slate-800 text-slate-200';
                badgeHtml = '<span class="text-[10px] text-emerald-400 font-bold shrink-0">✓</span>';
            } else {
                cardClass += 'bg-slate-950/40 border-slate-900/80 text-slate-500';
                badgeHtml = '<span class="text-[10px] text-slate-600 shrink-0">🔒</span>';
            }

            itemsHtml += `
                <div id="roadmap-rank-item-${rNum}" class="${cardClass}">
                    <div class="flex items-center gap-2.5 min-w-0 pr-2">
                        <span class="font-mono font-bold text-[11px] ${isActive ? 'text-amber-400' : (isUnlocked ? 'text-slate-300' : 'text-slate-600')} shrink-0">#${rNum.toString().padStart(2, '0')}</span>
                        <span class="font-bold truncate ${isActive ? 'text-white' : ''}">${rTitle}</span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="font-mono text-[11px] ${isActive ? 'text-amber-300 font-extrabold' : 'text-slate-400'}">${rThresh.toLocaleString()} PWR</span>
                        ${badgeHtml}
                    </div>
                </div>
            `;
        }
        listEl.innerHTML = itemsHtml;

        setTimeout(() => {
            const activeItem = $(`roadmap-rank-item-${rankInfo.rank}`);
            if (activeItem) {
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }

    $('rank-roadmap-modal').classList.remove('hidden');
}

function closeRankRoadmapModal() {
    $('rank-roadmap-modal').classList.add('hidden');
}

