// ============================================================================
// AUREUM — Crucible & Sanctuary Logging + History Ledgers
// ============================================================================

async function logWork(e){
    e.preventDefault();
    const T=parseFloat($('work-time').value),R=parseFloat($('work-results').value),E=parseFloat($('work-effort').value);
    const reflectionText=($('work-reflection')?.value||'').trim();
    const softCap=userSettings.dailySoftCap||4,baseRate=(R+E)/2;
    const normH=Math.min(T,Math.max(0,softCap-currentTodayHoursLogged)),overH=T-normH;
    const pts=(normH*baseRate)+(overH*baseRate*0.25);
    const targetPts=(userSettings.weeklyHours||10)*12,pointRate=targetPts>0?(userSettings.monthlyCash/targetPts):0;
    const maxCash=userSettings.monthlyCash*((userSettings.maxBonusCapPct||125)/100);

    const now=new Date();let currentMonthlyPts=0;
    currentRawLogsCache.forEach(l=>{
        if(l.type==='work'){
            const d=getLogDate(l);
            if(d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth())currentMonthlyPts+=(l.points||0);
        }
    });
    const cashBefore=Math.min(currentMonthlyPts*pointRate,maxCash),cashAfter=Math.min((currentMonthlyPts+pts)*pointRate,maxCash);
    const netCashEarned=Math.max(0,cashAfter-cashBefore);

    const payload={
        type:'work',
        user:loggedInUser,
        role:typeof getUserRole==='function'?getUserRole(loggedInUser):(loggedInUser==='Cream'?'author':'illustrator'),
        hours:T,
        normalHours:normH,
        overCapHours:overH,
        results:R,
        effort:E,
        points:pts,
        reflectionText:reflectionText,
        timestamp:firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('logs').add(payload);

    userSettings.unloggedFocusSecs=0;
    if(typeof updateUnloggedFocusDisplay==='function')updateUnloggedFocusDisplay();
    try{await db.collection('settings').doc(loggedInUser).set({unloggedFocusSecs:0},{merge:true})}catch(err){}

    if($('work-reflection'))$('work-reflection').value='';
    if($('work-time'))$('work-time').value='1.00';
    if(typeof closeLogWorkModal==='function')closeLogWorkModal();

    showToast({title:'⚗️ Work Saved',subtitle:`<strong>+฿${Math.round(netCashEarned).toLocaleString()} Earned</strong> (${T}h @ Lvl ${R}/${E})`,icon:'🎯',tier:'gold',originEvt:e});
    loadUserData();
}

async function logWorkout(e){
    e.preventDefault();
    const hrs=parseFloat($('workout-time').value),strain=parseInt($('workout-strain').value);
    const reflectionText=($('workout-reflection')?.value||'').trim();
    await db.collection('logs').add({type:'workout',user:loggedInUser,hours:hrs,strain:strain,reflectionText:reflectionText,timestamp:firebase.firestore.FieldValue.serverTimestamp()});
    if($('workout-reflection'))$('workout-reflection').value='';
    showToast({title:'🏃 Fitness Logged',subtitle:`${hrs}h saved at Level ${strain} effort!`,icon:'🔥',tier:'gold',originEvt:e});
    loadUserData();
}

async function logHealth(e){
    e.preventDefault();
    const lvl=parseInt($('health-level').value),note=$('health-note').value.trim();
    await db.collection('logs').add({type:'health',user:loggedInUser,level:lvl,note:note,reflectionText:note,timestamp:firebase.firestore.FieldValue.serverTimestamp()});
    showToast({title:'🍨 Snack Logged',subtitle:`Level ${lvl} treat recorded${note?`: "${note}"`:''}`,icon:'🍦',tier:'emerald',originEvt:e});
    $('health-note').value='';loadUserData();
}

async function logChore(e){
    e.preventDefault();
    const hrs=parseFloat($('chore-time').value),note=$('chore-note').value.trim();
    await db.collection('logs').add({type:'chore',user:loggedInUser,hours:hrs,note:note,reflectionText:note,timestamp:firebase.firestore.FieldValue.serverTimestamp()});
    showToast({title:'🧹 Chore Logged',subtitle:`${hrs}h saved${note?`: "${note}"`:''}`,icon:'🏰',tier:'silver',originEvt:e});
    $('chore-note').value='';loadUserData();
}

async function deleteLogEntry(id,e){
    if(e&&e.stopPropagation)e.stopPropagation();
    if(loggedInUser===viewedUser){
        await db.collection('logs').doc(id).delete();playTone('delete');
        showToast({title:'🗑️ Entry Deleted',subtitle:'Record removed.',icon:'📜',tier:'bronze',duration:2500});
    }
}


function populateAndFilterLedger(){
    const select=$('ledger-month-select');if(!select)return;
    const prev=select.value||'current',monthSet=new Set(),now=new Date(),curKey=`${now.getFullYear()}-${now.getMonth()}`;
    for(let i=0;i<currentRawLogsCache.length;i++){
        const l=currentRawLogsCache[i];
        const d=getLogDate(l);monthSet.add(`${d.getFullYear()}-${d.getMonth()}`);
    }
    monthSet.add(curKey);
    const names=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let opts=`<option value="current">Current Month (${names[now.getMonth()]} ${now.getFullYear()})</option>`;
    Array.from(monthSet).sort().reverse().forEach(k=>{if(k!==curKey){const [y,m]=k.split('-');opts+=`<option value="${k}">${names[m]} ${y}</option>`}});
    opts+=`<option value="all">All Time Records</option>`;
    select.innerHTML=opts;select.value=Array.from(select.options).some(o=>o.value===prev)?prev:'current';
    applyLedgerFilter();
}

function applyLedgerFilter(){
    const val=$('ledger-month-select')?.value||'current',now=new Date();let logs=currentRawLogsCache;
    if(val==='current')logs=currentRawLogsCache.filter(l=>getLogDate(l).getFullYear()===now.getFullYear()&&getLogDate(l).getMonth()===now.getMonth());
    else if(val!=='all'){const [y,m]=val.split('-').map(Number);logs=currentRawLogsCache.filter(l=>getLogDate(l).getFullYear()===y&&getLogDate(l).getMonth()===m)}
    renderLedgerLists(logs);
    if(typeof renderMonthlyPerformanceCodex==='function')renderMonthlyPerformanceCodex();
}

function renderSegmentedBar(val,max=5,activeColor='#10b981',useDynamicLevelColors=false){
    const levelPalette=['#38bdf8','#10b981','#f59e0b','#f97316','#ef4444'];
    const resolvedColor=useDynamicLevelColors?(levelPalette[Math.max(0,Math.min(levelPalette.length-1,(parseInt(val)||1)-1))]||activeColor):activeColor;
    let bars='';
    for(let i=1;i<=max;i++){
        const segColor=useDynamicLevelColors?(levelPalette[i-1]||resolvedColor):resolvedColor;
        bars+=i<=val?`<span class="inline-block w-2.5 h-1.5 rounded-sm mr-0.5" style="background-color: ${segColor};"></span>`:`<span class="inline-block w-2.5 h-1.5 rounded-sm mr-0.5 bg-slate-800 border border-slate-700/60"></span>`;
    }
    return bars;
}

function setChronicleDeckFilter(filterKey){
    activeChronicleFilter=filterKey||'all';
    ['all','work','sanctuary','reflections'].forEach(k=>{
        const btn=$(`chronicle-filter-${k}`);
        if(btn){
            btn.className=k===activeChronicleFilter
                ?"px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all theme-accent-btn flex items-center gap-1.5"
                :"px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all bg-slate-900/90 text-slate-400 hover:text-white border border-slate-800 flex items-center gap-1.5";
        }
    });
    applyLedgerFilter();
}

function toggleChronicleCardFlip(cardId,e){
    if(e&&e.target&&e.target.closest('button'))return;
    const el=$(cardId);
    if(el)el.classList.toggle('is-flipped');
}

function _buildChronicleStatBadges(l){
    if(l.type==='work'){
        const q=l.results||3,e=l.effort||3;
        const badges=[
            `<span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">🎯 DEX Q${q}</span>`,
            `<span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold bg-sky-500/15 text-sky-300 border border-sky-500/30">🧠 INT +${formatHours(l.hours)}h</span>`,
            `<span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold bg-rose-500/15 text-rose-300 border border-rose-500/30">⚔️ STR E${e}</span>`
        ];
        if((l.overCapHours||0)>0)badges.push(`<span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold bg-amber-500/15 text-amber-300 border border-amber-500/30">🍵 Soft Cap</span>`);
        return badges.join('');
    }
    if(l.type==='workout'){
        return `<span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold bg-rose-500/15 text-rose-300 border border-rose-500/30">⚔️ STR Lvl ${l.strain||3}</span><span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold bg-amber-500/15 text-amber-300 border border-amber-500/30">🔥 WIL +${formatHours(l.hours)}h</span>`;
    }
    if(l.type==='chore'){
        return `<span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold bg-amber-500/15 text-amber-300 border border-amber-500/30">🛡️ VIT +${formatHours(l.hours)}h</span><span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold bg-orange-500/15 text-orange-300 border border-orange-500/30">🔥 WIL Order</span>`;
    }
    if(l.type==='health'){
        return `<span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">🛡️ VIT Treat Lvl ${l.level||1}</span>`;
    }
    return `<span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold bg-amber-500/15 text-amber-300 border border-amber-500/30">📖 WIS Chronicle</span><span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold bg-purple-500/15 text-purple-300 border border-purple-500/30">✨ Lore Entry</span>`;
}
function _renderChronicleCardHtml(l,idx,isSelf,pointRate,diaryByDay){
    const d=getLogDate(l);
    const dayKey=`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const endOfDayMs=new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59,999).getTime();
    const logsUpToDay=currentRawLogsCache.filter(x=>getLogDate(x).getTime()<=endOfDayMs);
    const pwrOnDay=calculateLifetimePWR(logsUpToDay);
    const scoresOnDay=typeof computeStatScoresFromLogs==='function'?computeStatScoresFromLogs(logsUpToDay,userSettings,30,endOfDayMs):{};
    const roleOnDay=typeof getUserRole==='function'?getUserRole(l.role||l.user||viewedUser):'illustrator';
    const classTitleOnDay=typeof getHybridClassTitle==='function'?getHybridClassTitle(roleOnDay,scoresOnDay):'Grand Virtuoso';
    const topStatsOnDay=typeof getTopStatKeysFromMap==='function'?getTopStatKeysFromMap(scoresOnDay,roleOnDay):['DEX','WIS'];
    const rankOnDay=getRankDetails(pwrOnDay,logsUpToDay,roleOnDay,userSettings);
    const crestSvg=typeof renderClassCrest==='function'?renderClassCrest(roleOnDay,topStatsOnDay,rankOnDay.level,38):'';

    const dateStr=d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    const timeStr=d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});

    let typeLabel='⚗️ Work Session',durationLabel=`${formatHours(l.hours||0)} hrs`,accentBadge='';
    if(l.type==='work'){
        const earned=Math.round((l.points||0)*pointRate);
        accentBadge=`<span class="text-xs font-mono font-black text-emerald-400">+฿${earned.toLocaleString()}</span>`;
    }else if(l.type==='workout'){typeLabel='🏃 Sanctuary Fitness';durationLabel=`${formatHours(l.hours||0)} hrs`}
    else if(l.type==='chore'){typeLabel='🧹 Sanctuary Chore';durationLabel=`${formatHours(l.hours||0)} hrs`}
    else if(l.type==='health'){typeLabel='🍨 Sanctuary Treat';durationLabel=`Level ${l.level||1}`}
    else if(l.type==='diary'){typeLabel='📖 Historical Reflection';durationLabel='Journal Entry'}

    const directReflection=(l.reflectionText||l.text||l.note||'').trim();
    const linkedDiary=directReflection?'':(diaryByDay[dayKey]||'').trim();
    const backText=directReflection||linkedDiary;
    const hasNote=Boolean(backText);
    const cardDomId=`chronicle-card-${l.id||idx}`;
    const delBtn=(isSelf&&l.id)?`<button type="button" onclick="deleteLogEntry('${l.id}', event)" class="text-[10px] text-red-400 font-bold px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/25">Delete</button>`:'';

    return `<div id="${cardDomId}" onclick="toggleChronicleCardFlip('${cardDomId}', event)" class="chronicle-flip-card cursor-pointer select-none"><div class="chronicle-flip-card-inner"><div class="chronicle-flip-card-front p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 flex flex-col justify-between gap-3"><div class="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2"><div class="flex items-center gap-2 min-w-0"><span class="text-[11px] font-black text-slate-200 truncate">${typeLabel}</span><span class="text-[10px] font-mono text-slate-400">• ${dateStr}</span></div><div class="flex items-center gap-2 shrink-0">${accentBadge}${delBtn}</div></div><div class="flex items-center justify-between gap-3 py-0.5"><div class="flex items-center gap-2.5 min-w-0"><div class="p-1 rounded-xl bg-slate-950/90 border border-slate-800 shrink-0">${crestSvg}</div><div class="min-w-0"><div class="text-xs font-black theme-accent-text truncate">${escapeHtml(classTitleOnDay)}</div><div class="text-[10px] font-mono text-slate-400">Lvl ${rankOnDay.level} • ${rankOnDay.tierName}</div></div></div><div class="text-right shrink-0"><div class="text-sm font-black font-mono text-white">${durationLabel}</div><div class="text-[9px] font-mono text-slate-500">${timeStr}</div></div></div><div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60 flex-wrap"><div class="flex items-center gap-1.5 flex-wrap">${_buildChronicleStatBadges(l)}</div><span class="text-[9px] font-bold ${hasNote?'text-amber-300':'text-slate-500'} font-mono shrink-0">${hasNote?'✍️ Flip for Reflection ↻':'↻ Flip Card'}</span></div></div><div class="chronicle-flip-card-back p-4 rounded-2xl bg-slate-950/95 border border-amber-500/35 flex flex-col justify-between gap-2.5"><div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-2"><span class="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1.5"><span>📜</span> <span>${l.type==='diary'?'Diary Reflection':(directReflection?'Session Reflection':'Daily Reflection')} • ${dateStr}</span></span><div class="flex items-center gap-2"><span class="text-[10px] font-mono text-slate-400">${escapeHtml(classTitleOnDay)}</span>${delBtn}</div></div><div class="flex-1 flex items-center overflow-y-auto custom-scroll py-1">${hasNote?`<p class="text-xs text-slate-200 italic leading-relaxed break-words">"${escapeHtml(backText)}"</p>`:`<p class="text-xs text-slate-500 italic">No reflection text recorded for this entry.</p>`}</div><div class="flex items-center justify-between text-[9px] font-mono text-slate-500 border-t border-slate-900 pt-1.5"><span>${typeLabel} (${durationLabel})</span><span>Tap to flip back ↺</span></div></div></div></div>`;
}


function renderLedgerLists(logs){
    const deckEl=$('chronicle-deck-grid');
    if(!deckEl)return;
    const isSelf=(loggedInUser===viewedUser);
    const sorted=[...(logs||[])].sort((a,b)=>getLogDate(b).getTime()-getLogDate(a).getTime());

    const diaryByDay={};
    currentRawLogsCache.filter(x=>x.type==='diary').forEach(dLog=>{
        const d=getLogDate(dLog);
        const k=`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if(!diaryByDay[k]&&dLog.text)diaryByDay[k]=dLog.text;
    });

    const filtered=sorted.filter(l=>{
        if(activeChronicleFilter==='work')return l.type==='work';
        if(activeChronicleFilter==='sanctuary')return ['workout','chore','health'].includes(l.type);
        if(activeChronicleFilter==='reflections'){
            const hasRefl=Boolean((l.reflectionText&&String(l.reflectionText).trim())||(l.text&&String(l.text).trim()));
            return l.type==='diary'||hasRefl;
        }
        return true;
    });

    if($('chronicle-deck-count'))$('chronicle-deck-count').innerText=`${filtered.length} ${filtered.length===1?'Card':'Cards'}`;
    if(filtered.length===0){
        deckEl.innerHTML=`<div class="col-span-full p-8 rounded-2xl bg-slate-900/50 border border-slate-800 text-center text-xs text-slate-400 italic">No chronicle cards match this filter.</div>`;
        return;
    }

    const pointRate=((userSettings.weeklyHours||10)*12)>0?(userSettings.monthlyCash/((userSettings.weeklyHours||10)*12)):0;
    deckEl.innerHTML=filtered.map((l,idx)=>_renderChronicleCardHtml(l,idx,isSelf,pointRate,diaryByDay)).join('');
}

// ============================================================================
// PART 1: PERSISTENT TOP ACTIVITY TICKER ("GUILD FEED") & SPAMMABLE REACTIONS
// ============================================================================

const GUILD_REACTION_EMOJIS = ['☕', '👏', '🔥'];
const GUILD_REACTION_DOM_KEYS = { '☕': 'coffee', '👏': 'clap', '🔥': 'fire' };
const GUILD_REACTION_STORAGE_KEY = 'aureum_guild_reactions_v1';
const GUILD_QUIET_FALLBACK_ID = 'guild_quiet_shift';

let _localReactionsMap = {};
let _pendingReactionDeltas = {};
let _reactionDebounceTimers = {};
let _reactionFirstTapTimestamps = {};

try {
    const rawSaved = localStorage.getItem(GUILD_REACTION_STORAGE_KEY);
    if (rawSaved) {
        const parsed = JSON.parse(rawSaved);
        if (parsed && typeof parsed === 'object') _localReactionsMap = parsed;
    }
} catch (e) {}

function _saveLocalReactionsToStorage() {
    try {
        localStorage.setItem(GUILD_REACTION_STORAGE_KEY, JSON.stringify(_localReactionsMap));
    } catch (e) {}
}

function formatTickerTimeAgo(dateObj) {
    if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) return 'just now';
    const diffMs = Math.max(0, Date.now() - dateObj.getTime());
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 45) return 'just now';
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
        const remMins = diffMins % 60;
        return remMins >= 15 && diffHours < 6 ? `${diffHours}h ${remMins}m ago` : `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
}

function getRecentGuildLogs48h() {
    const sourceLogs = (Array.isArray(globalAllLogsCache) && globalAllLogsCache.length > 0)
        ? globalAllLogsCache
        : (Array.isArray(currentRawLogsCache) ? currentRawLogsCache : []);
    const nowMs = Date.now();
    const cutoff48h = nowMs - (48 * 60 * 60 * 1000);
    return sourceLogs
        .filter(l => {
            const t = getLogDate(l).getTime();
            return t >= cutoff48h && t <= (nowMs + 300000);
        })
        .sort((a, b) => getLogDate(b).getTime() - getLogDate(a).getTime());
}

function getActiveTickerTargetLog() {
    const recent48h = getRecentGuildLogs48h();
    if (recent48h.length > 0) {
        const safeIdx = Math.max(0, Math.min(recent48h.length - 1, activeTickerLogIndex));
        return recent48h[safeIdx];
    }
    const allPool = (Array.isArray(globalAllLogsCache) && globalAllLogsCache.length > 0)
        ? globalAllLogsCache
        : (Array.isArray(currentRawLogsCache) ? currentRawLogsCache : []);
    if (allPool.length > 0) {
        const sortedAll = [...allPool].sort((a, b) => getLogDate(b).getTime() - getLogDate(a).getTime());
        return sortedAll[0];
    }
    return null;
}

function getEffectiveReactionsForTarget(logObj) {
    const targetId = logObj?.id || GUILD_QUIET_FALLBACK_ID;
    const serverReactions = (logObj && logObj.reactions && typeof logObj.reactions === 'object')
        ? logObj.reactions
        : (targetId === GUILD_QUIET_FALLBACK_ID && userSettings?.quietShiftReactions ? userSettings.quietShiftReactions : {});
    const localSaved = _localReactionsMap[targetId] || {};
    const pending = _pendingReactionDeltas[targetId] || {};

    const result = {};
    let changedLocal = false;

    GUILD_REACTION_EMOJIS.forEach(emoji => {
        const srvCount = Math.max(0, parseInt(serverReactions[emoji]) || 0);
        const locCount = Math.max(0, parseInt(localSaved[emoji]) || 0);
        const pendDelta = Math.max(0, parseInt(pending[emoji]) || 0);
        const effective = Math.max(srvCount + pendDelta, locCount);
        result[emoji] = effective;

        if (pendDelta === 0 && srvCount > locCount) {
            _localReactionsMap[targetId] = _localReactionsMap[targetId] || {};
            _localReactionsMap[targetId][emoji] = srvCount;
            changedLocal = true;
        }
    });

    if (changedLocal) _saveLocalReactionsToStorage();
    return result;
}

function formatGuildTickerEntryHtml(log) {
    const d = getLogDate(log);
    const timeAgo = formatTickerTimeAgo(d);
    const userName = escapeHtml(getUserDisplayName(log.user || 'North'));

    let emoji = '⚗️';
    let duration = `${formatHours(log.hours || 0)}h`;
    let category = 'Work';

    if (log.type === 'work') {
        emoji = '⚗️';
        duration = `${formatHours(log.hours || 0)}h`;
        category = 'Work';
    } else if (log.type === 'workout') {
        emoji = '🏃';
        duration = `${formatHours(log.hours || 0)}h`;
        category = 'Fitness';
    } else if (log.type === 'chore') {
        emoji = '🧹';
        duration = `${formatHours(log.hours || 0)}h`;
        category = 'Chores';
    } else if (log.type === 'health') {
        emoji = '🍨';
        duration = `Lvl ${log.level || 1}`;
        category = 'Snack';
    } else if (log.type === 'diary') {
        emoji = '📖';
        duration = 'Daily';
        category = 'Reflection';
    }

    const plainSummary = `${emoji} ${getUserDisplayName(log.user || 'North')} logged ${duration} ${category} — ${timeAgo}`;
    const html = `
        <span class="inline-flex items-center gap-1.5 min-w-0 truncate">
            <span class="text-sm shrink-0">${emoji}</span>
            <span class="font-black text-amber-300">${userName}</span>
            <span class="text-slate-400">logged</span>
            <span class="font-mono font-extrabold text-slate-100">${escapeHtml(duration)}</span>
            <span class="font-bold text-emerald-400">${escapeHtml(category)}</span>
            <span class="text-slate-500 font-normal">—</span>
            <span class="font-mono text-[11px] text-slate-400">${escapeHtml(timeAgo)}</span>
        </span>
    `;
    return { html, plainSummary };
}

function renderGuildActivityTicker() {
    const msgEl = $('guild-ticker-message');
    const navEl = $('guild-ticker-nav');
    const idxLabel = $('guild-ticker-index-label');
    if (!msgEl) return;

    const recent48h = getRecentGuildLogs48h();
    if (recent48h.length === 0) {
        activeTickerLogIndex = 0;
        const emptyText = 'The studio is quiet. Awaiting the next shift...';
        msgEl.innerHTML = `<span class="text-slate-400 italic">${emptyText}</span>`;
        msgEl.title = emptyText;
        if (navEl) {
            navEl.classList.add('hidden');
            navEl.classList.remove('flex');
        }
    } else {
        if (activeTickerLogIndex >= recent48h.length) activeTickerLogIndex = 0;
        const currentLog = recent48h[activeTickerLogIndex];
        const { html, plainSummary } = formatGuildTickerEntryHtml(currentLog);
        msgEl.innerHTML = html;
        msgEl.title = plainSummary;

        if (navEl && idxLabel) {
            if (recent48h.length > 1) {
                navEl.classList.remove('hidden');
                navEl.classList.add('flex');
                idxLabel.innerText = `${activeTickerLogIndex + 1}/${recent48h.length}`;
            } else {
                navEl.classList.add('hidden');
                navEl.classList.remove('flex');
            }
        }
    }

    const reactionTarget = getActiveTickerTargetLog();
    const counts = getEffectiveReactionsForTarget(reactionTarget);
    GUILD_REACTION_EMOJIS.forEach(emoji => {
        const key = GUILD_REACTION_DOM_KEYS[emoji];
        const countEl = $(`ticker-react-count-${key}`);
        const btnEl = $(`ticker-react-btn-${key}`);
        const c = counts[emoji] || 0;
        if (countEl) countEl.innerText = c.toLocaleString();
        if (btnEl) btnEl.classList.toggle('has-reactions', c > 0);
    });
}

function cycleGuildTickerLog(delta) {
    const recent48h = getRecentGuildLogs48h();
    if (recent48h.length <= 1) return;
    activeTickerLogIndex = (activeTickerLogIndex + delta + recent48h.length) % recent48h.length;
    renderGuildActivityTicker();
}

function _playReactionSpamMicroTone() {
    if (typeof audioMuted !== 'undefined' && audioMuted) return;
    try {
        const c = getAudioContext();
        const now = c.currentTime;
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'triangle';
        const baseFreq = 680 + Math.random() * 260;
        o.frequency.setValueAtTime(baseFreq, now);
        o.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, now + 0.065);
        g.gain.setValueAtTime(0.09, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
        o.connect(g);
        g.connect(c.destination);
        o.start(now);
        o.stop(now + 0.075);
    } catch (e) {}
}

function _spawnFloatingReactionText(emoji, btnEl) {
    if (!btnEl) return;
    const floater = document.createElement('span');
    floater.className = 'ticker-floating-plus';
    const driftX = Math.round((Math.random() - 0.5) * 28);
    floater.style.setProperty('--drift-x', `${driftX}px`);
    floater.style.left = '50%';
    floater.style.top = '-6px';
    floater.innerText = `+1 ${emoji}`;
    btnEl.appendChild(floater);
    setTimeout(() => {
        if (floater && floater.parentNode) floater.remove();
    }, 740);
}

async function flushReactionBatchToFirestore(targetId) {
    if (_reactionDebounceTimers[targetId]) {
        clearTimeout(_reactionDebounceTimers[targetId]);
        delete _reactionDebounceTimers[targetId];
    }
    delete _reactionFirstTapTimestamps[targetId];

    const deltas = _pendingReactionDeltas[targetId];
    if (!deltas || Object.keys(deltas).length === 0) return;
    const snapshotDeltas = { ...deltas };
    delete _pendingReactionDeltas[targetId];

    const incrementMap = {};
    let hasPositive = false;
    Object.entries(snapshotDeltas).forEach(([em, d]) => {
        const count = parseInt(d) || 0;
        if (count > 0) {
            incrementMap[em] = firebase.firestore.FieldValue.increment(count);
            hasPositive = true;
        }
    });
    if (!hasPositive) return;

    try {
        if (targetId && targetId !== GUILD_QUIET_FALLBACK_ID) {
            await db.collection('logs').doc(targetId).set({
                reactions: incrementMap
            }, { merge: true });
        } else if (loggedInUser) {
            await db.collection('settings').doc(loggedInUser).set({
                quietShiftReactions: incrementMap
            }, { merge: true });
        }
    } catch (err) {
        try {
            const fullCounts = _localReactionsMap[targetId] || {};
            if (targetId && targetId !== GUILD_QUIET_FALLBACK_ID) {
                await db.collection('logs').doc(targetId).set({
                    reactions: fullCounts
                }, { merge: true });
            }
        } catch (e2) {}
    }
}

function _scheduleDebouncedReactionFlush(targetId) {
    const now = Date.now();
    if (!_reactionFirstTapTimestamps[targetId]) {
        _reactionFirstTapTimestamps[targetId] = now;
    }
    if (_reactionDebounceTimers[targetId]) {
        clearTimeout(_reactionDebounceTimers[targetId]);
    }
    const elapsedSinceFirstTap = now - _reactionFirstTapTimestamps[targetId];
    if (elapsedSinceFirstTap >= 1600) {
        flushReactionBatchToFirestore(targetId);
        return;
    }
    _reactionDebounceTimers[targetId] = setTimeout(() => {
        flushReactionBatchToFirestore(targetId);
    }, 420);
}

function spamGuildReaction(emoji, evt) {
    if (evt && evt.stopPropagation) evt.stopPropagation();
    if (!GUILD_REACTION_EMOJIS.includes(emoji)) return;

    const targetLog = getActiveTickerTargetLog();
    const targetId = targetLog?.id || GUILD_QUIET_FALLBACK_ID;

    const currentEffective = getEffectiveReactionsForTarget(targetLog);
    const nextVal = (currentEffective[emoji] || 0) + 1;

    _pendingReactionDeltas[targetId] = _pendingReactionDeltas[targetId] || {};
    _pendingReactionDeltas[targetId][emoji] = (_pendingReactionDeltas[targetId][emoji] || 0) + 1;

    _localReactionsMap[targetId] = _localReactionsMap[targetId] || {};
    GUILD_REACTION_EMOJIS.forEach(em => {
        if (_localReactionsMap[targetId][em] === undefined) {
            _localReactionsMap[targetId][em] = currentEffective[em] || 0;
        }
    });
    _localReactionsMap[targetId][emoji] = nextVal;
    _saveLocalReactionsToStorage();

    const domKey = GUILD_REACTION_DOM_KEYS[emoji];
    const countEl = $(`ticker-react-count-${domKey}`);
    const btnEl = $(`ticker-react-btn-${domKey}`);
    if (countEl) countEl.innerText = nextVal.toLocaleString();
    if (btnEl) {
        btnEl.classList.add('has-reactions', 'is-popping');
        clearTimeout(btnEl._popTimer);
        btnEl._popTimer = setTimeout(() => btnEl.classList.remove('is-popping'), 140);
        _spawnFloatingReactionText(emoji, btnEl);
    }

    _playReactionSpamMicroTone();
    _scheduleDebouncedReactionFlush(targetId);
}

window.addEventListener('beforeunload', () => {
    Object.keys(_pendingReactionDeltas).forEach(tid => {
        flushReactionBatchToFirestore(tid);
    });
});

// ============================================================================
// PART 2: CONFIGURABLE & AESTHETIC MONTHLY PERFORMANCE CODEX
// ============================================================================

function toggleMonthlyCodexFlip(evt) {
    if (evt && evt.stopPropagation) evt.stopPropagation();
    monthlyCodexFlipped = !monthlyCodexFlipped;
    const cardEl = $('monthly-codex-flip-container');
    if (cardEl) {
        cardEl.classList.toggle('is-flipped', monthlyCodexFlipped);
    }
    const btnLabel = $('monthly-codex-flip-btn-label');
    if (btnLabel) {
        btnLabel.innerText = monthlyCodexFlipped
            ? '↻ Flip to Front: Metrics & 30d Stat Radar'
            : '↻ Flip Folio: Standout Reflection & Milestones';
    }
    playTone('save');
}

function _buildCodexStatRadarSvg(statScores) {
    const statOrder = [
        { key: 'STR', icon: '⚔️', color: '#ef4444' },
        { key: 'DEX', icon: '🎯', color: '#10b981' },
        { key: 'INT', icon: '🧠', color: '#38bdf8' },
        { key: 'VIT', icon: '🛡️', color: '#f59e0b' },
        { key: 'WIS', icon: '📖', color: '#fbbf24' },
        { key: 'WIL', icon: '🔥', color: '#f97316' }
    ];
    const vbW = 280, vbH = 225, cx = 140, cy = 112, maxR = 72;
    const angles = [-90, -30, 30, 90, 150, 210];

    const rings = [0.33, 0.66, 1.0].map((rRatio, rIdx) => {
        const pts = angles.map(deg => {
            const rad = (deg * Math.PI) / 180;
            return `${(cx + Math.cos(rad) * maxR * rRatio).toFixed(1)},${(cy + Math.sin(rad) * maxR * rRatio).toFixed(1)}`;
        }).join(' ');
        const strokeCol = rIdx === 2 ? 'rgba(245, 158, 11, 0.45)' : 'rgba(148, 163, 184, 0.2)';
        return `<polygon points="${pts}" fill="none" stroke="${strokeCol}" stroke-width="${rIdx === 2 ? '1.3' : '0.9'}" stroke-dasharray="${rIdx === 1 ? '2,2' : 'none'}" />`;
    }).join('');

    const axes = angles.map(deg => {
        const rad = (deg * Math.PI) / 180;
        return `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(rad) * maxR).toFixed(1)}" y2="${(cy + Math.sin(rad) * maxR).toFixed(1)}" stroke="rgba(148, 163, 184, 0.22)" stroke-width="1" />`;
    }).join('');

    const dataPts = [];
    const nodes = statOrder.map((st, i) => {
        const val = Math.max(12, Math.min(99, Number(statScores?.[st.key]) || 15));
        const ratio = Math.max(0.16, Math.min(1, val / 99));
        const rad = (angles[i] * Math.PI) / 180;
        const vx = cx + Math.cos(rad) * maxR * ratio;
        const vy = cy + Math.sin(rad) * maxR * ratio;
        dataPts.push(`${vx.toFixed(1)},${vy.toFixed(1)}`);

        const lx = cx + Math.cos(rad) * (maxR + 24);
        const ly = cy + Math.sin(rad) * (maxR + 20);
        const g = typeof getStatGrade === 'function' ? getStatGrade(val) : { grade: 'B', color: '#f59e0b' };

        return `
            <circle cx="${vx.toFixed(1)}" cy="${vy.toFixed(1)}" r="3.8" fill="${st.color}" stroke="#020617" stroke-width="1.3" />
            <text x="${lx.toFixed(1)}" y="${(ly - 4).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#e2e8f0" font-size="9.5" font-weight="900" font-family="monospace">${st.key}</text>
            <text x="${lx.toFixed(1)}" y="${(ly + 6.5).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="${g.color}" font-size="9" font-weight="800" font-family="monospace">${g.grade}${val}</text>
        `;
    }).join('');

    return `
        <svg viewBox="0 0 ${vbW} ${vbH}" class="w-full max-w-[265px] h-auto select-none mx-auto overflow-visible">
            <defs>
                <radialGradient id="codexRadarFill" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.52" />
                    <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.20" />
                </radialGradient>
            </defs>
            ${rings}
            ${axes}
            <polygon points="${dataPts.join(' ')}" fill="url(#codexRadarFill)" stroke="#fbbf24" stroke-width="2" stroke-linejoin="round" />
            <circle cx="${cx}" cy="${cy}" r="2" fill="#fef08a" />
            ${nodes}
        </svg>
    `;
}

function _selectMonthlyStandoutReflection(monthLogs, allLogs) {
    const extractText = (l) => String(l.reflectionText || l.text || l.note || '').trim();
    let candidates = (monthLogs || []).filter(l => extractText(l).length > 0);
    let isFromCurrentMonth = true;
    if (candidates.length === 0 && Array.isArray(allLogs)) {
        candidates = allLogs.filter(l => extractText(l).length > 0);
        isFromCurrentMonth = false;
    }
    if (candidates.length === 0) return null;

    const scored = candidates.map(l => {
        const txt = extractText(l);
        const q = parseFloat(l.results) || 3;
        const e = parseFloat(l.effort) || 3;
        const craftScore = l.type === 'work' ? (q * 12 + e * 8 + (l.hours || 0) * 4) : (l.type === 'diary' ? 42 : 25);
        const lenScore = Math.min(35, txt.length * 0.25);
        return { log: l, text: txt, score: craftScore + lenScore, isFromCurrentMonth };
    }).sort((a, b) => b.score - a.score || getLogDate(b.log).getTime() - getLogDate(a.log).getTime());

    return scored[0];
}

function _buildCodexReflectionCardHtml(standout, monthYearTitle) {
    if (standout) {
        const rDate = getLogDate(standout.log).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const rTypeBadge = standout.log.type === 'work'
            ? `⚗️ Work Session (${formatHours(standout.log.hours || 0)}h • Q${standout.log.results || 3}/E${standout.log.effort || 3})`
            : (standout.log.type === 'diary' ? '📖 Chronicle Journal Entry' : '🌿 Sanctuary Reflection');
        return `
            <div class="p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-amber-500/35 space-y-3 flex-1 flex flex-col justify-between">
                <div class="space-y-2.5">
                    <div class="flex items-center justify-between gap-2 flex-wrap border-b border-slate-800/90 pb-2">
                        <span class="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5"><span>✨</span> <span>Standout Reflection Highlight</span></span>
                        <span class="text-[10px] font-mono text-slate-400">${rDate}${standout.isFromCurrentMonth ? '' : ' • Archive Highlight'}</span>
                    </div>
                    <blockquote class="text-xs sm:text-sm text-slate-100 font-serif italic leading-relaxed pl-3 border-l-2 border-amber-400/70 py-1">"${escapeHtml(standout.text)}"</blockquote>
                </div>
                <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/70 text-[10px] font-mono text-amber-300/90">
                    <span>${rTypeBadge}</span>
                    <span>Inscribed by ${escapeHtml(getUserDisplayName(viewedUser))}</span>
                </div>
            </div>`;
    }
    return `
        <div class="p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-amber-500/25 space-y-3 flex-1 flex flex-col justify-between">
            <div class="space-y-2">
                <div class="flex items-center justify-between gap-2 border-b border-slate-800/90 pb-2">
                    <span class="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5"><span>✨</span> <span>Standout Reflection Highlight</span></span>
                    <span class="text-[10px] font-mono text-slate-500">${escapeHtml(monthYearTitle)}</span>
                </div>
                <p class="text-xs text-slate-400 italic font-serif leading-relaxed py-2">"No reflections have been inscribed for this folio period yet. Add a session note in the Crucible or sign a page in the Chronicle Journal to immortalize your standout breakthrough."</p>
            </div>
            <div class="text-[10px] font-mono text-slate-500 pt-2 border-t border-slate-800/70">Awaiting Chronicler's Quill • ${escapeHtml(getUserDisplayName(viewedUser))}</div>
        </div>`;
}

function _buildCodexMilestonesCardHtml(monthYearTitle, styleInfo, hybridTitle, peakFlowCount, stalwartCount, softCapDays, activeDaysCount, softCap, statScores, topStats, totalSanctuaryHours, unlockedBadgesCount) {
    return `
        <div class="lg:col-span-6 p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-amber-500/35 flex flex-col justify-between space-y-3">
            <div class="space-y-2.5">
                <div class="flex items-center justify-between gap-2 border-b border-slate-800/90 pb-2">
                    <span class="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5"><span>🏛️</span> <span>Craft Milestone Notes • ${escapeHtml(monthYearTitle)}</span></span>
                    <span class="text-[10px] font-mono font-bold text-emerald-400">${styleInfo.icon} ${escapeHtml(hybridTitle)}</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div class="p-3 rounded-xl bg-slate-900/85 border border-slate-800">
                        <div class="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">👑 High-Craft Execution</div>
                        <div class="text-xs font-bold text-slate-100 mt-1">${peakFlowCount} Peak Flow • ${stalwartCount} Stalwart Shifts</div>
                        <p class="text-[10px] text-slate-400 mt-0.5 leading-snug">Sessions achieving Level 4+ quality &amp; heavy focus endurance.</p>
                    </div>
                    <div class="p-3 rounded-xl bg-slate-900/85 border border-slate-800">
                        <div class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">🍵 Crucible Pacing</div>
                        <div class="text-xs font-bold text-slate-100 mt-1">${softCapDays} Soft-Cap Days • ${activeDaysCount} Active Days</div>
                        <p class="text-[10px] text-slate-400 mt-0.5 leading-snug">Reached ${formatHours(softCap)}h daily soft cap ${softCapDays} ${softCapDays === 1 ? 'time' : 'times'} this period.</p>
                    </div>
                    <div class="p-3 rounded-xl bg-slate-900/85 border border-slate-800">
                        <div class="text-[10px] font-extrabold uppercase tracking-wider text-sky-300">📐 Archetype Resonance</div>
                        <div class="text-xs font-bold text-slate-100 mt-1">${styleInfo.combo} (${statScores[topStats[0]] || 15} / ${statScores[topStats[1]] || 15})</div>
                        <p class="text-[10px] text-slate-400 mt-0.5 leading-snug">${escapeHtml(styleInfo.desc)}</p>
                    </div>
                    <div class="p-3 rounded-xl bg-slate-900/85 border border-slate-800">
                        <div class="text-[10px] font-extrabold uppercase tracking-wider text-purple-300">🏺 Sanctuary &amp; Relics</div>
                        <div class="text-xs font-bold text-slate-100 mt-1">${formatHours(totalSanctuaryHours)}h Sanctuary • ${unlockedBadgesCount}/${BADGE_CATALOG.length} Relics</div>
                        <p class="text-[10px] text-slate-400 mt-0.5 leading-snug">Life-balance conditioning &amp; lifetime relic mastery.</p>
                    </div>
                </div>
            </div>
            <div class="text-center text-[10px] font-mono text-amber-300/80 pt-2 border-t border-slate-800/70">✨ Click Folio to Return to Allowance Metrics &amp; 30-Day Stat Radar ↻</div>
        </div>`;
}

function renderMonthlyPerformanceCodex() {
    const container = $('monthly-performance-codex-section');
    if (!container) return;

    if (userSettings.showMonthlyCodex === false) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }
    container.classList.remove('hidden');

    const now = new Date();
    const selVal = $('ledger-month-select')?.value || 'current';
    let targetYear = now.getFullYear(), targetMonth = now.getMonth();
    if (selVal !== 'current' && selVal !== 'all' && selVal.includes('-')) {
        const parts = selVal.split('-').map(Number);
        if (!isNaN(parts[0]) && !isNaN(parts[1])) { targetYear = parts[0]; targetMonth = parts[1]; }
    }

    const monthYearTitle = new Date(targetYear, targetMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const isCurrentMonth = (targetYear === now.getFullYear() && targetMonth === now.getMonth());
    const endOfPeriodMs = isCurrentMonth ? Date.now() : new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999).getTime();
    const activeSettings = (loggedInUser === viewedUser) ? userSettings : (spectatorSettings || duoPresenceData[viewedUser]?.settings || userSettings);

    const allLogs = Array.isArray(currentRawLogsCache) ? currentRawLogsCache : [];
    const monthLogs = allLogs.filter(l => { const d = getLogDate(l); return d.getFullYear() === targetYear && d.getMonth() === targetMonth; });
    const logsUpToPeriod = allLogs.filter(l => getLogDate(l).getTime() <= endOfPeriodMs);

    const role = typeof getUserRole === 'function' ? getUserRole(viewedUser) : 'illustrator';
    const domainInfo = typeof getUserDomainInfo === 'function' ? getUserDomainInfo(role) : { roleLabel: 'Illustrator', domain: 'Artisan' };
    const statScores = typeof computeStatScoresFromLogs === 'function' ? computeStatScoresFromLogs(logsUpToPeriod, activeSettings, 30, endOfPeriodMs) : { STR: 40, DEX: 50, INT: 45, VIT: 40, WIS: 45, WIL: 42 };
    const topStats = typeof getTopStatKeysFromMap === 'function' ? getTopStatKeysFromMap(statScores, role) : ['DEX', 'WIS'];
    const hybridTitle = typeof getHybridClassTitle === 'function' ? getHybridClassTitle(role, statScores) : 'Grand Virtuoso';
    const pwrScore = typeof calculateLifetimePWR === 'function' ? calculateLifetimePWR(logsUpToPeriod) : 0;
    const rankDetails = typeof getRankDetails === 'function' ? getRankDetails(pwrScore, logsUpToPeriod, role, activeSettings) : { level: 1, tierName: 'Initiate' };
    const crestSvg = typeof renderClassCrest === 'function' ? renderClassCrest(role, topStats, rankDetails.level, 56) : '';

    const workLogs = monthLogs.filter(l => l.type === 'work');
    const workoutLogs = monthLogs.filter(l => l.type === 'workout');
    const choreLogs = monthLogs.filter(l => l.type === 'chore');

    const totalFocusHours = workLogs.reduce((acc, l) => acc + (l.hours || 0), 0);
    const totalSanctuaryHours = workoutLogs.reduce((acc, l) => acc + (l.hours || 0), 0) + choreLogs.reduce((acc, l) => acc + (l.hours || 0), 0);
    const monthlyPoints = workLogs.reduce((acc, l) => acc + (l.points || 0), 0);

    const targetCash = activeSettings.monthlyCash || 8000;
    const targetPts = (activeSettings.weeklyHours || 10) * 12;
    const pointRate = targetPts > 0 ? (targetCash / targetPts) : 0;
    const maxBonusPct = activeSettings.maxBonusCapPct || 125;
    const maxCash = targetCash * (maxBonusPct / 100);
    const allowancePayout = Math.min(monthlyPoints * pointRate, maxCash);
    const payoutPct = targetCash > 0 ? Math.min(Math.round((allowancePayout / targetCash) * 100), maxBonusPct) : 0;
    const isVaulted = Boolean(activeSettings.vaultedMonths?.[`${targetYear}-${targetMonth}`]);

    let avgQuality = 0, avgEffort = 0, peakFlowCount = 0, stalwartCount = 0;
    if (workLogs.length > 0) {
        let sumQ = 0, sumE = 0;
        workLogs.forEach(l => {
            const q = parseFloat(l.results) || 3, e = parseFloat(l.effort) || 3;
            sumQ += q; sumE += e;
            if (q >= 4) peakFlowCount++;
            if (q >= 4 && e >= 4) stalwartCount++;
        });
        avgQuality = sumQ / workLogs.length; avgEffort = sumE / workLogs.length;
    }

    const qRound = workLogs.length > 0 ? Math.min(5, Math.max(1, Math.round(avgQuality))) : 3;
    const eRound = workLogs.length > 0 ? Math.min(5, Math.max(1, Math.round(avgEffort))) : 3;
    const qMeta = RATING_DATA.results[qRound - 1] || RATING_DATA.results[2];
    const eMeta = RATING_DATA.effort[eRound - 1] || RATING_DATA.effort[2];

    const activeDaysSet = new Set(), dailyWorkHours = {};
    monthLogs.forEach(l => {
        const d = getLogDate(l), k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        activeDaysSet.add(k);
        if (l.type === 'work') dailyWorkHours[k] = (dailyWorkHours[k] || 0) + (l.hours || 0);
    });
    const softCap = activeSettings.dailySoftCap || 4;
    const softCapDays = Object.values(dailyWorkHours).filter(h => h >= softCap).length;
    const standout = _selectMonthlyStandoutReflection(monthLogs, logsUpToPeriod);
    const styleInfo = (typeof WORK_STYLE_INFO !== 'undefined' && WORK_STYLE_INFO[hybridTitle])
        ? WORK_STYLE_INFO[hybridTitle]
        : { icon: '👑', combo: `${topStats[0]} + ${topStats[1]}`, tagline: 'Aureate Synthesis', desc: 'Balanced mastery across daily focus and reflection.' };

    container.innerHTML = _assembleCodexFolioHtml({
        crestSvg, monthYearTitle, isVaulted, hybridTitle, rankDetails, domainInfo, topStats,
        flipBtnText: monthlyCodexFlipped ? '↻ Flip to Front: Metrics & 30d Stat Radar' : '↻ Flip Folio: Standout Reflection & Milestones',
        flipStateClass: monthlyCodexFlipped ? 'is-flipped' : '',
        payoutPct, allowancePayout, targetCash, maxCash, workLogsCount: workLogs.length,
        totalFocusHours, totalSanctuaryHours, activeDaysCount: activeDaysSet.size,
        qMeta, avgQuality, qRound, peakFlowCount, eMeta, avgEffort, eRound, stalwartCount,
        radarSvg: _buildCodexStatRadarSvg(statScores),
        reflectionCardHtml: _buildCodexReflectionCardHtml(standout, monthYearTitle),
        milestonesCardHtml: _buildCodexMilestonesCardHtml(monthYearTitle, styleInfo, hybridTitle, peakFlowCount, stalwartCount, softCapDays, activeDaysSet.size, softCap, statScores, topStats, totalSanctuaryHours, (activeSettings.unlockedBadges || []).length)
    });
}

function _buildCodexFrontGridHtml(d) {
    return `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <div class="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div class="p-4 rounded-2xl bg-slate-950/85 border border-emerald-500/30 flex flex-col justify-between">
                    <div>
                        <div class="flex items-center justify-between gap-2">
                            <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Allowance Payout</span>
                            <span class="text-[10px] font-mono font-extrabold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">${d.payoutPct}% of Target</span>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black text-emerald-400 font-mono mt-1.5 ${d.isVaulted ? 'line-through opacity-75' : ''}">฿${Math.round(d.allowancePayout).toLocaleString()}</div>
                    </div>
                    <div class="pt-2.5 mt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <span>Base: ฿${d.targetCash.toLocaleString()}</span>
                        <span>Cap: ฿${Math.round(d.maxCash).toLocaleString()}</span>
                    </div>
                </div>
                <div class="p-4 rounded-2xl bg-slate-950/85 border border-amber-500/30 flex flex-col justify-between">
                    <div>
                        <div class="flex items-center justify-between gap-2">
                            <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Focus Hours Logged</span>
                            <span class="text-[10px] font-mono font-extrabold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">${d.workLogsCount} ${d.workLogsCount === 1 ? 'Shift' : 'Shifts'}</span>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black theme-accent-text font-mono mt-1.5">${formatHours(d.totalFocusHours)} <span class="text-xs font-bold text-slate-400">hrs</span></div>
                    </div>
                    <div class="pt-2.5 mt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <span>🌿 Sanctuary: ${formatHours(d.totalSanctuaryHours)}h</span>
                        <span>📅 ${d.activeDaysCount}d Active</span>
                    </div>
                </div>
                <div class="p-4 rounded-2xl bg-slate-950/85 border border-slate-800 flex flex-col justify-between">
                    <div>
                        <div class="flex items-center justify-between gap-2">
                            <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Average Quality</span>
                            <span class="text-[10px] font-mono font-bold text-emerald-400">${d.qMeta.icon} ${d.qMeta.title}</span>
                        </div>
                        <div class="flex items-baseline gap-2 mt-1.5">
                            <span class="text-2xl font-black text-slate-100 font-mono">${d.workLogsCount > 0 ? d.avgQuality.toFixed(1) : '—'}</span>
                            <span class="text-xs font-mono text-slate-500">/ 5.0</span>
                        </div>
                    </div>
                    <div class="pt-2.5 mt-2 border-t border-slate-800/80 flex items-center justify-between">
                        <div>${renderSegmentedBar(d.qRound, 5, '#10b981', false)}</div>
                        <span class="text-[10px] font-mono text-slate-400">${d.peakFlowCount} Peak Flow</span>
                    </div>
                </div>
                <div class="p-4 rounded-2xl bg-slate-950/85 border border-slate-800 flex flex-col justify-between">
                    <div>
                        <div class="flex items-center justify-between gap-2">
                            <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Average Effort</span>
                            <span class="text-[10px] font-mono font-bold text-amber-400">${d.eMeta.icon} ${d.eMeta.title}</span>
                        </div>
                        <div class="flex items-baseline gap-2 mt-1.5">
                            <span class="text-2xl font-black text-slate-100 font-mono">${d.workLogsCount > 0 ? d.avgEffort.toFixed(1) : '—'}</span>
                            <span class="text-xs font-mono text-slate-500">/ 5.0</span>
                        </div>
                    </div>
                    <div class="pt-2.5 mt-2 border-t border-slate-800/80 flex items-center justify-between">
                        <div>${renderSegmentedBar(d.eRound, 5, '#f59e0b', false)}</div>
                        <span class="text-[10px] font-mono text-slate-400">${d.stalwartCount} Stalwart</span>
                    </div>
                </div>
            </div>
            <div class="lg:col-span-5 p-4 rounded-2xl bg-slate-950/90 border border-amber-500/30 flex flex-col justify-between items-center">
                <div class="w-full flex items-center justify-between border-b border-slate-800/80 pb-2 mb-1">
                    <span class="text-[10px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5"><span>⚡</span> <span>30-Day Stat Radar Snapshot</span></span>
                    <span class="text-[10px] font-mono text-slate-400">${d.topStats[0]}/${d.topStats[1]} Core</span>
                </div>
                <div class="w-full flex items-center justify-center py-1">${d.radarSvg}</div>
                <div class="w-full text-center text-[10px] font-mono text-amber-300/80 pt-1 border-t border-slate-800/70">✨ Click Folio to Flip for Standout Reflection &amp; Craft Milestones ↻</div>
            </div>
        </div>`;
}






function _assembleCodexFolioHtml(d) {
    return `
        <div class="codex-folio-shell rounded-2xl p-4 sm:p-6 relative">
            <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 420" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                    <linearGradient id="codexGoldFoil" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#fef08a" stop-opacity="0.75" />
                        <stop offset="35%" stop-color="#f59e0b" stop-opacity="0.55" />
                        <stop offset="70%" stop-color="#b45309" stop-opacity="0.65" />
                        <stop offset="100%" stop-color="#fde68a" stop-opacity="0.75" />
                    </linearGradient>
                </defs>
                <rect x="8" y="8" width="984" height="404" rx="14" fill="none" stroke="url(#codexGoldFoil)" stroke-width="1.5" stroke-opacity="0.55" />
                <rect x="14" y="14" width="972" height="392" rx="10" fill="none" stroke="url(#codexGoldFoil)" stroke-width="0.7" stroke-dasharray="6,4" stroke-opacity="0.38" />
                <path d="M8 38 L38 8 M14 48 L48 14" stroke="url(#codexGoldFoil)" stroke-width="1.6" stroke-opacity="0.7" />
                <path d="M992 38 L962 8 M986 48 L952 14" stroke="url(#codexGoldFoil)" stroke-width="1.6" stroke-opacity="0.7" />
                <path d="M8 382 L38 412 M14 372 L48 406" stroke="url(#codexGoldFoil)" stroke-width="1.6" stroke-opacity="0.7" />
                <path d="M992 382 L962 412 M986 372 L952 406" stroke="url(#codexGoldFoil)" stroke-width="1.6" stroke-opacity="0.7" />
            </svg>

            <div class="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-amber-500/25">
                <div class="flex items-center gap-3.5 min-w-0">
                    <div class="p-1.5 rounded-2xl bg-slate-950/95 border border-amber-500/40 shadow-lg shrink-0">${d.crestSvg}</div>
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-[10px] font-mono font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full codex-foil-badge">👑 Monthly Performance Codex</span>
                            <span class="text-xs font-mono font-black text-amber-300 uppercase tracking-wider">• ${escapeHtml(d.monthYearTitle)}</span>
                            ${d.isVaulted ? '<span class="text-[10px] font-mono font-extrabold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">🏛️ Vaulted</span>' : ''}
                        </div>
                        <h2 class="text-lg sm:text-2xl font-black codex-foil-title tracking-tight mt-0.5 truncate">${escapeHtml(getUserDisplayName(viewedUser))} — ${escapeHtml(d.hybridTitle)}</h2>
                        <div class="text-[11px] font-mono text-slate-400 flex items-center gap-2 flex-wrap">
                            <span>Lvl ${d.rankDetails.level} ${escapeHtml(d.rankDetails.tierName)}</span>
                            <span>•</span>
                            <span>${escapeHtml(d.domainInfo.domain)} (${escapeHtml(d.domainInfo.roleLabel)})</span>
                            <span>•</span>
                            <span class="text-amber-300 font-bold">Synergy: ${d.topStats[0]} + ${d.topStats[1]}</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2.5 shrink-0">
                    <button type="button" onclick="toggleMonthlyCodexFlip(event)" class="px-3.5 py-2 rounded-xl theme-accent-btn text-xs font-black flex items-center gap-1.5 shadow-lg">
                        <span id="monthly-codex-flip-btn-label">${d.flipBtnText}</span>
                    </button>
                </div>
            </div>

            <div id="monthly-codex-flip-container" onclick="toggleMonthlyCodexFlip(event)" class="codex-flip-card ${d.flipStateClass} relative z-10 mt-4 cursor-pointer select-none" title="Click to flip between Metrics/Stat Radar and Monthly Reflection/Milestones">
                <div class="codex-flip-card-inner">
                    <div class="codex-flip-card-front">${_buildCodexFrontGridHtml(d)}</div>
                    <div class="codex-flip-card-back">
                        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                            <div class="lg:col-span-6 flex flex-col">${d.reflectionCardHtml}</div>
                            ${d.milestonesCardHtml}
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
}

