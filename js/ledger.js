// ============================================================================
// AUREUM — Crucible & Sanctuary Logging + History Ledgers
// ============================================================================

// NOTE: The monthly chore → allowance multiplier engine lives in
// js/choreMultiplier.js (calculateChoreMultiplier, calculateMonthlyAllowanceBreakdown,
// sumMonthlyChoreHours) so it can also be unit-tested outside the browser.

/**
 * Builds the canonical Firestore `logs` payload for a work session plus the
 * allowance deltas the UI uses for its confirmation toast.
 *
 * Shared by the Sanctuary/legacy form (`logWork`) and the inline Quick-Log
 * card so points, soft-cap split, and payout math can never drift apart.
 *
 * @param {number|string} hours
 * @param {number|string} results - quality (1-5)
 * @param {number|string} effort - effort (1-5)
 * @param {string} reflectionText
 * @returns {{payload:Object,choreMultiplier:Object,maxCash:number,cashAfter:number,netCashEarned:number,T:number,R:number,E:number}}
 */
function buildWorkLogPayload(hours, results, effort, reflectionText){
    const parsedHours=parseFloat(hours);
    const T=Number.isFinite(parsedHours)?Math.max(0,parsedHours):0;
    const parsedResults=parseFloat(results);
    const parsedEffort=parseFloat(effort);
    const R=Number.isFinite(parsedResults)?Math.max(1,Math.min(5,parsedResults)):3;
    const E=Number.isFinite(parsedEffort)?Math.max(1,Math.min(5,parsedEffort)):3;
    const note=(reflectionText||'').trim();
    const softCap=userSettings.dailySoftCap||4,baseRate=(R+E)/2;
    const normH=Math.min(T,Math.max(0,softCap-currentTodayHoursLogged)),overH=T-normH;
    const pts=(normH*baseRate)+(overH*baseRate*0.25);
    const targetPts=(userSettings.weeklyHours||10)*12,pointRate=targetPts>0?((userSettings.monthlyCash||8000)/targetPts):0;
    const maxCash=(userSettings.monthlyCash||8000)*((userSettings.maxBonusCapPct||125)/100);

    const now=new Date();
    let currentMonthlyPts=0;
    currentRawLogsCache.forEach(l=>{
        const d=getLogDate(l);
        if(d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&l.type==='work')currentMonthlyPts+=(l.points||0);
    });
    const currentMonthlyChoreHours=sumMonthlyChoreHours(currentRawLogsCache,now.getFullYear(),now.getMonth());

    // The chore tier multiplier applies retroactively to the whole month's allowance,
    // but maxCash (target allowance × max bonus cap %) is a hard ceiling the bonus
    // can never push past.
    const baseCashBefore=Math.min(currentMonthlyPts*pointRate,maxCash);
    const baseCashAfter=Math.min((currentMonthlyPts+pts)*pointRate,maxCash);
    const choreMultiplier=calculateChoreMultiplier(currentMonthlyChoreHours);
    const cashBefore=calculateMonthlyAllowanceBreakdown(baseCashBefore,currentMonthlyChoreHours,maxCash).finalMonthlyAllowance;
    const cashAfter=calculateMonthlyAllowanceBreakdown(baseCashAfter,currentMonthlyChoreHours,maxCash).finalMonthlyAllowance;
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
        reflectionText:note,
        timestamp:firebase.firestore.FieldValue.serverTimestamp()
    };

    return {payload,choreMultiplier,maxCash,cashAfter,netCashEarned,T,R,E};
}

async function logWork(e){
    e.preventDefault();
    const built=buildWorkLogPayload(
        $('work-time')?.value,
        $('work-results')?.value,
        $('work-effort')?.value,
        $('work-reflection')?.value||''
    );
    const {T,R,E,choreMultiplier,maxCash,cashAfter,netCashEarned}=built;

    await db.collection('logs').add(built.payload);

    userSettings.unloggedFocusSecs=0;
    if(typeof updateUnloggedFocusDisplay==='function')updateUnloggedFocusDisplay();
    try{await db.collection('settings').doc(loggedInUser).set({unloggedFocusSecs:0},{merge:true})}catch(err){}

    if($('work-reflection'))$('work-reflection').value='';
    if($('work-time'))$('work-time').value='1.00';
    if(typeof closeLogWorkModal==='function')closeLogWorkModal();

    const multiplierInfo = choreMultiplier.tier > 0 ? ` <span class="text-amber-300">×${choreMultiplier.multiplier.toFixed(2)} Chore Bonus (+${choreMultiplier.bonusPercent})</span>` : '';
    const capInfo = maxCash > 0 && cashAfter >= maxCash - 0.005 ? ` <span class="text-amber-300">⛔ Monthly limit ฿${Math.round(maxCash).toLocaleString()}</span>` : '';
    showToast({title:'⚗️ Work Saved',subtitle:`<strong>+฿${Math.round(netCashEarned).toLocaleString()} Earned</strong> (${T}h @ Lvl ${R}/${E})${multiplierInfo}${capInfo}`,icon:'🎯',tier:'gold',originEvt:e});
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
    const now=new Date();
    const hoursBeforeLog=sumMonthlyChoreHours(currentRawLogsCache,now.getFullYear(),now.getMonth());
    await db.collection('logs').add({type:'chore',user:loggedInUser,hours:hrs,note:note,reflectionText:note,timestamp:firebase.firestore.FieldValue.serverTimestamp()});

    // The realtime snapshot may or may not have delivered the new entry by now,
    // so prefer the snapshot total and otherwise project it from the log itself.
    const snapshotHours=sumMonthlyChoreHours(currentRawLogsCache,now.getFullYear(),now.getMonth());
    const currentMonthlyChoreHours=snapshotHours>hoursBeforeLog?snapshotHours:(hoursBeforeLog+hrs);

    const choreMultiplier = calculateChoreMultiplier(currentMonthlyChoreHours);
    const tierInfo = choreMultiplier.isMaxTier 
        ? `🏆 <strong>Max Tier Unlocked!</strong> +${choreMultiplier.bonusPercent} Bonus Active`
        : `📊 ${choreMultiplier.tierLabel} • +${choreMultiplier.bonusPercent} • ${formatHours(choreMultiplier.hoursToNextTier)}h to ${choreMultiplier.nextTierLabel}`;
    
    showToast({title:'🧹 Chore Logged',subtitle:`${hrs}h saved${note?`: \"${note}\"`:''}<br>${tierInfo}`,icon:'🏰',tier:'silver',originEvt:e, duration: 4000});
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
            btn.setAttribute('aria-pressed', k===activeChronicleFilter ? 'true' : 'false');
        }
    });
    applyLedgerFilter();
}

function _chronicleWorkRole(l){
    return typeof getUserRole === 'function'
        ? getUserRole(l?.role || l?.user || viewedUser)
        : ((l?.user || viewedUser) === 'Cream' ? 'author' : 'illustrator');
}

function _chronicleRecordIcon(l){
    if(l.type==='work')return _chronicleWorkRole(l)==='author'?'✒️':'🎨';
    return ({workout:'🏃',chore:'🧹',health:'🍨'})[l.type]||'📖';
}

function _chronicleRecordLabel(l){
    if(l.type==='work')return _chronicleWorkRole(l)==='author'?'Writing Session':'Illustration Session';
    if(l.type==='workout')return 'Fitness';
    if(l.type==='chore')return 'Chores';
    if(l.type==='health')return 'Recovery';
    return l.type==='diary'?'Diary Reflection':'Reflection';
}

function _chronicleRecordDetails(l){
    const parts=[];
    if(l.type==='work'){
        parts.push(formatActivityDuration(l.hours||0));
        parts.push(`Q${Math.max(1,Math.min(5,parseFloat(l.results)||3))}`);
        parts.push(`E${Math.max(1,Math.min(5,parseFloat(l.effort)||3))}`);
        if((l.overCapHours||0)>0)parts.push('🍵 Soft Cap');
    }else if(l.type==='workout'){
        parts.push(formatActivityDuration(l.hours||0));
        parts.push(`Intensity ${Math.max(1,Math.min(5,parseInt(l.strain)||3))}`);
    }else if(l.type==='chore'){
        parts.push(formatActivityDuration(l.hours||0));
    }else if(l.type==='health'){
        parts.push(`Level ${Math.max(1,parseInt(l.level)||1)}`);
    }else{
        parts.push('Journal entry');
    }
    return parts.join(' · ');
}

function formatActivityCategoryTag(l) {
    const role = typeof getUserRole === 'function'
        ? getUserRole(l?.role || l?.user || viewedUser)
        : ((l?.user || viewedUser) === 'Cream' ? 'author' : 'illustrator');

    if (l.type === 'work') {
        const dur = formatActivityDuration(l.hours || 0);
        const q = parseFloat(l.results) || 3;
        const e = parseFloat(l.effort) || 3;
        const categoryLabel = role === 'author' ? '✒️ Writing' : '🎨 Illustration';
        return {
            title: role === 'author' ? '✒️ Writing Session' : '🎨 Illustration Session',
            tagText: `${categoryLabel} • ${dur} (Quality ${q} • Effort ${e})`,
            shortTagText: `${categoryLabel} • ${dur} (Quality ${q})`,
            durationLabel: dur
        };
    }
    if (l.type === 'workout') {
        const dur = formatActivityDuration(l.hours || 0);
        const strain = parseInt(l.strain) || 3;
        return {
            title: '🏃 Sanctuary Fitness',
            tagText: `🏃 Fitness • ${dur} (Intensity ${strain})`,
            shortTagText: `🏃 Fitness • ${dur}`,
            durationLabel: dur
        };
    }
    if (l.type === 'chore') {
        const dur = formatActivityDuration(l.hours || 0);
        return {
            title: '🧹 Sanctuary Chore',
            tagText: `🧹 Chores • ${dur}`,
            shortTagText: `🧹 Chores • ${dur}`,
            durationLabel: dur
        };
    }
    if (l.type === 'health') {
        const lvl = parseInt(l.level) || 1;
        return {
            title: '🍨 Sanctuary Treat',
            tagText: `🍨 Recovery • Level ${lvl}`,
            shortTagText: `🍨 Recovery • Level ${lvl}`,
            durationLabel: `Level ${lvl}`
        };
    }
    return {
        title: '📖 Chronicle Reflection',
        tagText: '📖 Reflection • Journal Entry',
        shortTagText: '📖 Reflection • Journal Entry',
        durationLabel: 'Journal Entry'
    };
}

function _renderChronicleRecordHtml(l,idx,isSelf,pointRate){
    const d=getLogDate(l);
    const dateStr=d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    const timeStr=d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    const isoStr=isNaN(d.getTime())?'':new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);

    const label=_chronicleRecordLabel(l);
    const details=_chronicleRecordDetails(l);
    const note=String(l.reflectionText||l.text||l.note||'').trim();
    const noteHtml=note?`<div class="text-[10px] text-slate-400 italic truncate" title="${escapeHtml(note)}">"${escapeHtml(note)}"</div>`:'';
    const payoutHtml=l.type==='work'
        ?`<span class="chronicle-record-payout">+฿${Math.round((l.points||0)*pointRate).toLocaleString()}</span>`
        :'';
    const recordId=String(l.id||idx);
    const delBtn=(isSelf&&l.id)
        ?`<button type="button" class="chronicle-delete-btn" onclick="deleteLogEntry('${escapeHtml(recordId)}', event)" title="Delete this record" aria-label="Delete ${escapeHtml(label)} record from ${escapeHtml(dateStr)} ${escapeHtml(timeStr)}">✕</button>`
        :'';

    return `<li class="chronicle-record" data-record-id="${escapeHtml(recordId)}">
        <span class="chronicle-record-icon" aria-hidden="true">${_chronicleRecordIcon(l)}</span>
        <div class="min-w-0 flex-1 space-y-0.5">
            <div class="flex items-baseline justify-between gap-2 min-w-0">
                <span class="text-xs font-black text-slate-100 truncate">${escapeHtml(label)}</span>
                <time class="text-[10px] font-mono text-slate-400 whitespace-nowrap shrink-0"${isoStr?` datetime="${isoStr}"`:''}>${escapeHtml(dateStr)} · ${escapeHtml(timeStr)}</time>
            </div>
            <div class="text-[10px] font-mono text-slate-400 truncate">${escapeHtml(details)}</div>${noteHtml}
        </div>${payoutHtml}${delBtn}
    </li>`;
}

function renderLedgerLists(logs){
    const deckEl=$('chronicle-deck-grid');
    if(!deckEl)return;
    const isSelf=(loggedInUser===viewedUser);
    const sorted=[...(logs||[])].sort((a,b)=>getLogDate(b).getTime()-getLogDate(a).getTime());

    const filtered=sorted.filter(l=>{
        if(activeChronicleFilter==='work')return l.type==='work';
        if(activeChronicleFilter==='sanctuary')return ['workout','chore','health'].includes(l.type);
        if(activeChronicleFilter==='reflections'){
            const hasRefl=Boolean((l.reflectionText&&String(l.reflectionText).trim())||(l.text&&String(l.text).trim()));
            return l.type==='diary'||hasRefl;
        }
        return true;
    });

    if($('chronicle-deck-count'))$('chronicle-deck-count').innerText=`${filtered.length} ${filtered.length===1?'Record':'Records'}`;
    if(filtered.length===0){
        deckEl.innerHTML=`<li class="p-6 rounded-xl bg-slate-900/50 border border-slate-800 text-center text-xs text-slate-400 italic">No chronicle records match this filter.</li>`;
        return;
    }

    const pointRate=((userSettings.weeklyHours||10)*12)>0?(userSettings.monthlyCash/((userSettings.weeklyHours||10)*12)):0;
    deckEl.innerHTML=filtered.map((l,idx)=>_renderChronicleRecordHtml(l,idx,isSelf,pointRate)).join('');
}

// ============================================================================
// PART 1: SANCTUARY GUILD ACTIVITY FEED SHOWCASE & SPAMMABLE REACTIONS
// ============================================================================

const GUILD_REACTION_EMOJIS = ['☕', '👏', '🔥'];
const GUILD_REACTION_DOM_KEYS = { '☕': 'coffee', '👏': 'clap', '🔥': 'fire' };
const GUILD_REACTION_STORAGE_KEY = 'aureum_guild_reactions_v1';
const GUILD_QUIET_FALLBACK_ID = 'guild_quiet_shift';
const MAX_GUILD_ACTIVITY_CARDS = 10;

let _activityFeedLatestReactions = {};
let _optimisticReactionCounts = {};
let _baselineBridgedTargets = { doc: {}, log: {}, settings: {} };
let _deferredFeedRenderTimer = null;

// Clean up any legacy local-only reaction cache so Firestore onSnapshot is always authoritative
try {
    localStorage.removeItem(GUILD_REACTION_STORAGE_KEY);
} catch (e) {}

function _extractReactionsMapFromDocData(data) {
    const extracted = {};
    if (!data || typeof data !== 'object') return extracted;

    const mergeCardCounts = (cardId, emojiMap) => {
        if (!cardId || !emojiMap || typeof emojiMap !== 'object') return;
        extracted[cardId] = extracted[cardId] || {};
        GUILD_REACTION_EMOJIS.forEach(em => {
            const val = parseInt(emojiMap[em]);
            if (!isNaN(val) && val >= 0) {
                extracted[cardId][em] = Math.max(extracted[cardId][em] || 0, val);
            }
        });
    };

    if (data.reactions && typeof data.reactions === 'object') {
        Object.keys(data.reactions).forEach(cardId => {
            mergeCardCounts(cardId, data.reactions[cardId]);
        });
    }

    Object.keys(data).forEach(key => {
        if (key === 'reactions' || key === 'updatedAt') return;
        if (key.startsWith('reactions.')) {
            const parts = key.split('.');
            if (parts.length >= 3) {
                const emoji = parts[parts.length - 1];
                const cardId = parts.slice(1, parts.length - 1).join('.');
                if (cardId && GUILD_REACTION_EMOJIS.includes(emoji)) {
                    const val = parseInt(data[key]);
                    if (!isNaN(val) && val >= 0) {
                        extracted[cardId] = extracted[cardId] || {};
                        extracted[cardId][emoji] = Math.max(extracted[cardId][emoji] || 0, val);
                    }
                }
            }
            return;
        }
        if (data[key] && typeof data[key] === 'object') {
            mergeCardCounts(key, data[key]);
        }
    });

    return extracted;
}

function initGuildActivityFeedListener() {
    if (typeof activityFeedUnsubscribe === 'function' && activityFeedUnsubscribe) {
        activityFeedUnsubscribe();
    }
    try {
        activityFeedUnsubscribe = db.collection('activity_feed').doc('latest').onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data() || {};
                _activityFeedLatestReactions = _extractReactionsMapFromDocData(data);
            } else {
                _activityFeedLatestReactions = {};
            }
            _syncLiveReactionBadgesInDOM();
            renderGuildActivityFeed();
        }, () => {
            _syncLiveReactionBadgesInDOM();
            renderGuildActivityFeed();
        });
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

function formatActivityDuration(hoursVal) {
    const num = Math.max(0, parseFloat(hoursVal) || 0);
    if (num > 0 && num < 1) {
        const mins = Math.max(1, Math.round(num * 60));
        return `${mins}m`;
    }
    return `${formatHours(num)}h`;
}

function getUserAvatarUrl(userKey) {
    const raw = String(userKey || 'North').trim();
    const normUser = raw.toLowerCase() === 'cream' ? 'Cream' : 'North';

    if (normUser === loggedInUser && userSettings && typeof userSettings.avatarUrl === 'string' && userSettings.avatarUrl.trim()) {
        return userSettings.avatarUrl.trim();
    }
    if (typeof spectatorSettings !== 'undefined' && spectatorSettings && normUser === viewedUser && typeof spectatorSettings.avatarUrl === 'string' && spectatorSettings.avatarUrl.trim()) {
        return spectatorSettings.avatarUrl.trim();
    }
    const s = duoPresenceData[normUser]?.settings;
    if (s && typeof s.avatarUrl === 'string' && s.avatarUrl.trim()) {
        return s.avatarUrl.trim();
    }
    return `https://api.dicebear.com/7.x/bottts/svg?seed=${normUser}`;
}

function getRecentGuildActivityLogs(limit = MAX_GUILD_ACTIVITY_CARDS) {
    const sourceLogs = (Array.isArray(globalAllLogsCache) && globalAllLogsCache.length > 0)
        ? globalAllLogsCache
        : (Array.isArray(currentRawLogsCache) ? currentRawLogsCache : []);
    return [...sourceLogs]
        .sort((a, b) => getLogDate(b).getTime() - getLogDate(a).getTime())
        .slice(0, limit);
}

function getRecentGuildLogs48h() {
    return getRecentGuildActivityLogs(MAX_GUILD_ACTIVITY_CARDS);
}

function getActiveTickerTargetLog() {
    const recent = getRecentGuildActivityLogs(MAX_GUILD_ACTIVITY_CARDS);
    return recent.length > 0 ? recent[0] : null;
}

function _getServerReactionBreakdownForTarget(logOrId) {
    const targetId = typeof logOrId === 'string'
        ? logOrId
        : (logOrId?.id || GUILD_QUIET_FALLBACK_ID);
    const recent = getRecentGuildActivityLogs(MAX_GUILD_ACTIVITY_CARDS);
    const logObj = (typeof logOrId === 'object' && logOrId !== null)
        ? logOrId
        : (recent.find(l => String(l.id) === targetId) || null);

    const latestDocReactions = (_activityFeedLatestReactions && _activityFeedLatestReactions[targetId] && typeof _activityFeedLatestReactions[targetId] === 'object')
        ? _activityFeedLatestReactions[targetId]
        : {};
    const legacyLogReactions = (logObj && logObj.reactions && typeof logObj.reactions === 'object')
        ? logObj.reactions
        : {};
    const northSettingsReactions = duoPresenceData?.North?.settings?.guildReactions?.[targetId] || {};
    const creamSettingsReactions = duoPresenceData?.Cream?.settings?.guildReactions?.[targetId] || {};

    const breakdown = {};
    GUILD_REACTION_EMOJIS.forEach(emoji => {
        const docCount = Math.max(0, parseInt(latestDocReactions[emoji]) || 0);
        const logCount = Math.max(0, parseInt(legacyLogReactions[emoji]) || 0);
        const northCount = Math.max(0, parseInt(northSettingsReactions[emoji]) || 0);
        const creamCount = Math.max(0, parseInt(creamSettingsReactions[emoji]) || 0);
        const settingsSum = northCount + creamCount;
        const srvCount = Math.max(docCount, logCount, settingsSum);
        breakdown[emoji] = { docCount, logCount, settingsSum, srvCount };
    });

    return breakdown;
}

function getEffectiveReactionsForTarget(logOrId) {
    const targetId = typeof logOrId === 'string'
        ? logOrId
        : (logOrId?.id || GUILD_QUIET_FALLBACK_ID);
    const breakdown = _getServerReactionBreakdownForTarget(logOrId);
    const optimisticForCard = _optimisticReactionCounts[targetId] || {};
    const now = Date.now();

    const result = {};
    GUILD_REACTION_EMOJIS.forEach(emoji => {
        const { srvCount } = breakdown[emoji];
        const optEntry = optimisticForCard[emoji];
        let optVal = 0;
        if (optEntry && typeof optEntry === 'object') {
            if (srvCount >= optEntry.count || now > optEntry.expiresAt) {
                delete optimisticForCard[emoji];
            } else {
                optVal = optEntry.count;
            }
        }
        result[emoji] = Math.max(srvCount, optVal);
    });

    return result;
}

function formatGuildActivityHeaderInfo(log) {
    const rawUser = log?.user || 'North';
    const userName = escapeHtml(getUserDisplayName(rawUser));
    const role = typeof getUserRole === 'function' ? getUserRole(log?.role || rawUser) : (rawUser === 'Cream' ? 'author' : 'illustrator');
    const avatarUrl = escapeHtml(getUserAvatarUrl(rawUser));
    const timeAgo = escapeHtml(formatTickerTimeAgo(getLogDate(log)));

    let actionSummary = '';
    if (log.type === 'work') {
        const dur = formatActivityDuration(log.hours || 0);
        const craftDomain = role === 'author' ? 'Writing' : 'Illustration';
        actionSummary = `logged <span class="font-mono font-extrabold text-slate-100">${escapeHtml(dur)}</span> <span class="font-bold text-amber-300">${craftDomain}</span>`;
    } else if (log.type === 'workout') {
        const dur = formatActivityDuration(log.hours || 0);
        actionSummary = `logged <span class="font-mono font-extrabold text-slate-100">${escapeHtml(dur)}</span> <span class="font-bold text-emerald-400">Fitness</span>`;
    } else if (log.type === 'chore') {
        const dur = formatActivityDuration(log.hours || 0);
        actionSummary = `logged <span class="font-mono font-extrabold text-slate-100">${escapeHtml(dur)}</span> <span class="font-bold text-sky-300">Chores</span>`;
    } else if (log.type === 'health') {
        actionSummary = `logged <span class="font-mono font-extrabold text-slate-100">Lvl ${parseInt(log.level) || 1}</span> <span class="font-bold text-emerald-300">Recovery</span>`;
    } else {
        actionSummary = `inscribed a <span class="font-bold text-purple-300">Reflection</span>`;
    }

    return { userName, avatarUrl, actionSummary, timeAgo };
}

function _renderGuildActivityCardHtml(log, idx) {
    const cardId = String(log.id || `guild_card_${idx}`);
    const safeCardDomId = cardId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const { userName, avatarUrl, actionSummary, timeAgo } = formatGuildActivityHeaderInfo(log);
    const activityMeta = formatActivityCategoryTag(log);

    const counts = getEffectiveReactionsForTarget(log);
    const reactionButtonsHtml = GUILD_REACTION_EMOJIS.map(emoji => {
        const domKey = GUILD_REACTION_DOM_KEYS[emoji];
        const c = counts[emoji] || 0;
        const activeCls = c > 0 ? 'has-reactions' : '';
        return `
            <button type="button"
                id="card-react-btn-${safeCardDomId}-${domKey}"
                data-card-id="${escapeHtml(cardId)}"
                data-emoji="${emoji}"
                onclick="spamGuildReaction('${escapeHtml(cardId)}', '${emoji}', event)"
                class="ticker-react-btn ${activeCls}"
                title="React with ${emoji} (Spammable!)">
                <span class="text-xs leading-none">${emoji}</span>
                <span id="card-react-count-${safeCardDomId}-${domKey}" class="ticker-react-count font-mono text-[10px] font-black text-amber-300">${c.toLocaleString()}</span>
            </button>
        `;
    }).join('');

    return `
        <article class="guild-activity-card space-y-2.5" data-activity-card-id="${escapeHtml(cardId)}">
            <div class="flex items-center gap-2.5 min-w-0">
                <img src="${avatarUrl}" alt="${userName}" class="guild-card-avatar" loading="lazy">
                <div class="min-w-0 leading-snug">
                    <div class="text-[11px] text-slate-200 break-words">
                        <span class="font-black text-white">${userName}</span>
                        <span class="text-slate-300"> ${actionSummary}</span>
                    </div>
                    <div class="text-[9px] font-mono text-slate-400 mt-0.5">${timeAgo}</div>
                </div>
            </div>
            <div class="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
                <div class="guild-activity-type-tag">
                    <span class="text-[11px] font-extrabold text-amber-200 leading-snug">${escapeHtml(activityMeta.shortTagText)}</span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0 ml-auto">
                    ${reactionButtonsHtml}
                </div>
            </div>
        </article>
    `;
}

function _syncLiveReactionBadgesInDOM() {
    const listEl = $('guild-activity-feed-list');
    if (!listEl) return;
    const recent = getRecentGuildActivityLogs(MAX_GUILD_ACTIVITY_CARDS);
    recent.forEach((log, idx) => {
        const cardId = String(log.id || `guild_card_${idx}`);
        const safeCardDomId = cardId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const counts = getEffectiveReactionsForTarget(log);
        GUILD_REACTION_EMOJIS.forEach(emoji => {
            const domKey = GUILD_REACTION_DOM_KEYS[emoji];
            const countEl = $(`card-react-count-${safeCardDomId}-${domKey}`);
            const btnEl = $(`card-react-btn-${safeCardDomId}-${domKey}`);
            const c = counts[emoji] || 0;
            if (countEl) countEl.innerText = c.toLocaleString();
            if (btnEl) btnEl.classList.toggle('has-reactions', c > 0);
        });
    });
}

function renderGuildActivityFeed() {
    const listEl = $('guild-activity-feed-list');
    const countBadge = $('guild-feed-count-badge');
    if (!listEl) return;

    const recentLogs = getRecentGuildActivityLogs(MAX_GUILD_ACTIVITY_CARDS);
    if (countBadge) {
        countBadge.innerText = `${recentLogs.length} ${recentLogs.length === 1 ? 'Card' : 'Cards'}`;
    }

    if (recentLogs.length === 0) {
        listEl.innerHTML = `
            <div class="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 text-center text-xs text-slate-400 italic">
                The studio is quiet. Awaiting the next shift...
            </div>
        `;
        return;
    }

    const existingCards = Array.from(listEl.querySelectorAll('.guild-activity-card'));
    const sameCardOrder = existingCards.length === recentLogs.length && existingCards.every((el, i) => {
        const expectedId = String(recentLogs[i].id || `guild_card_${i}`);
        return el.getAttribute('data-activity-card-id') === expectedId;
    });
    const hasActiveReactionAnim = Boolean(listEl.querySelector('.ticker-floating-plus, .ticker-react-btn.is-popping'));

    if (sameCardOrder && hasActiveReactionAnim) {
        _syncLiveReactionBadgesInDOM();
        if (_deferredFeedRenderTimer) clearTimeout(_deferredFeedRenderTimer);
        _deferredFeedRenderTimer = setTimeout(() => {
            _deferredFeedRenderTimer = null;
            renderGuildActivityFeed();
        }, 760);
        return;
    }

    listEl.innerHTML = recentLogs.map((log, idx) => _renderGuildActivityCardHtml(log, idx)).join('');
}

const renderGuildActivityTicker = renderGuildActivityFeed;

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

async function _atomicIncrementReactionInFirestore(targetId, emoji, breakdownForEmoji) {
    const { docCount = 0, logCount = 0, settingsSum = 0, srvCount = 0 } = breakdownForEmoji || {};
    const bridgeKey = `${targetId}::${emoji}`;

    let docIncrement = 1;
    if (!_baselineBridgedTargets.doc[bridgeKey] && docCount < srvCount) {
        docIncrement = (srvCount - docCount) + 1;
        _baselineBridgedTargets.doc[bridgeKey] = true;
    } else {
        _baselineBridgedTargets.doc[bridgeKey] = true;
    }

    let logIncrement = 1;
    if (!_baselineBridgedTargets.log[bridgeKey] && logCount < srvCount) {
        logIncrement = (srvCount - logCount) + 1;
        _baselineBridgedTargets.log[bridgeKey] = true;
    } else {
        _baselineBridgedTargets.log[bridgeKey] = true;
    }

    let settingsIncrement = 1;
    if (!_baselineBridgedTargets.settings[bridgeKey] && settingsSum < srvCount) {
        settingsIncrement = (srvCount - settingsSum) + 1;
        _baselineBridgedTargets.settings[bridgeKey] = true;
    } else {
        _baselineBridgedTargets.settings[bridgeKey] = true;
    }

    const feedDocRef = db.collection('activity_feed').doc('latest');
    const ops = [];

    // 1. Primary atomic update on activity_feed/latest (updateDoc with dot-notation, fallback to set merge)
    ops.push(
        feedDocRef.update({
            [`reactions.${targetId}.${emoji}`]: firebase.firestore.FieldValue.increment(docIncrement),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => {
            return feedDocRef.set({
                reactions: {
                    [targetId]: {
                        [emoji]: firebase.firestore.FieldValue.increment(docIncrement)
                    }
                },
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        })
    );

    // 2. Atomic update on the source log document in logs/{targetId}
    if (targetId && targetId !== GUILD_QUIET_FALLBACK_ID) {
        const logDocRef = db.collection('logs').doc(targetId);
        ops.push(
            logDocRef.update({
                [`reactions.${emoji}`]: firebase.firestore.FieldValue.increment(logIncrement)
            }).catch(() => {
                return logDocRef.set({
                    reactions: {
                        [emoji]: firebase.firestore.FieldValue.increment(logIncrement)
                    }
                }, { merge: true });
            })
        );
    }

    // 3. Atomic update on settings/{loggedInUser} (streamed live via initDuoHUDListeners onSnapshot)
    if (loggedInUser) {
        const settingsDocRef = db.collection('settings').doc(loggedInUser);
        ops.push(
            settingsDocRef.set({
                guildReactions: {
                    [targetId]: {
                        [emoji]: firebase.firestore.FieldValue.increment(settingsIncrement)
                    }
                }
            }, { merge: true })
        );
    }

    await Promise.allSettled(ops);
}

function spamGuildReaction(cardIdOrEmoji, emojiOrEvt, maybeEvt) {
    let targetId = GUILD_QUIET_FALLBACK_ID;
    let emoji = '🔥';
    let evt = maybeEvt;

    if (GUILD_REACTION_EMOJIS.includes(cardIdOrEmoji)) {
        emoji = cardIdOrEmoji;
        evt = emojiOrEvt;
        const firstLog = getActiveTickerTargetLog();
        targetId = firstLog?.id || GUILD_QUIET_FALLBACK_ID;
    } else {
        targetId = String(cardIdOrEmoji || GUILD_QUIET_FALLBACK_ID);
        emoji = emojiOrEvt;
        evt = maybeEvt;
    }

    if (evt && evt.stopPropagation) evt.stopPropagation();
    if (!GUILD_REACTION_EMOJIS.includes(emoji)) return;

    const recent = getRecentGuildActivityLogs(MAX_GUILD_ACTIVITY_CARDS);
    const targetLog = recent.find(l => String(l.id) === targetId) || targetId;

    const breakdown = _getServerReactionBreakdownForTarget(targetLog);
    const currentEffective = getEffectiveReactionsForTarget(targetLog);
    const nextVal = (currentEffective[emoji] || 0) + 1;

    _optimisticReactionCounts[targetId] = _optimisticReactionCounts[targetId] || {};
    _optimisticReactionCounts[targetId][emoji] = {
        count: nextVal,
        expiresAt: Date.now() + 4000
    };

    const safeCardDomId = targetId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const domKey = GUILD_REACTION_DOM_KEYS[emoji];
    const countEl = $(`card-react-count-${safeCardDomId}-${domKey}`);
    const btnEl = $(`card-react-btn-${safeCardDomId}-${domKey}`);
    if (countEl) countEl.innerText = nextVal.toLocaleString();
    if (btnEl) {
        btnEl.classList.add('has-reactions', 'is-popping');
        clearTimeout(btnEl._popTimer);
        btnEl._popTimer = setTimeout(() => btnEl.classList.remove('is-popping'), 140);
        _spawnFloatingReactionText(emoji, btnEl);
    }

    _playReactionSpamMicroTone();
    _atomicIncrementReactionInFirestore(targetId, emoji, breakdown[emoji]);
}

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
            ? '↻ Flip to Front: Metrics & Balance Snapshot'
            : '↻ Flip Folio: Standout Reflection & Milestones';
    }
    playTone('save');
}

function _buildCodexBalanceSnapshotHtml(balance) {
    const rows = [
        { icon: '⚗️', label: 'Focus Work', hours: balance.workH, bar: 'from-amber-500 to-orange-400', text: 'text-amber-300' },
        { icon: '🧹', label: 'Chores', hours: balance.choreH, bar: 'from-sky-500 to-cyan-400', text: 'text-sky-300' },
        { icon: '🏃', label: 'Workout', hours: balance.workoutH, bar: 'from-rose-500 to-pink-400', text: 'text-rose-300' }
    ];
    const maxH = Math.max(1, balance.workH, balance.choreH, balance.workoutH);
    const rowsHtml = rows.map(row => {
        const pct = Math.min(100, Math.max(0, (row.hours / maxH) * 100));
        return `
            <div class="space-y-1">
                <div class="flex items-center justify-between text-[10px] font-mono">
                    <span class="text-slate-400">${row.icon} ${row.label}</span>
                    <span class="${row.text} font-bold">${formatHours(row.hours)}h</span>
                </div>
                <div class="w-full bg-slate-900/90 h-2 rounded-full overflow-hidden border border-slate-700/60">
                    <div class="h-full rounded-full bg-gradient-to-r ${row.bar} transition-all duration-700" style="width:${pct}%"></div>
                </div>
            </div>`;
    }).join('');

    return `
        <div class="w-full space-y-2.5">
            ${rowsHtml}
            <div class="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-slate-800/70">
                <span class="text-slate-400">📅 ${balance.activeDays} Active Days</span>
                <span class="text-emerald-300 font-bold">${balance.totalH > 0 ? formatHours(balance.totalH) + 'h Total' : 'No logs yet'}</span>
            </div>
        </div>`;
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

function _buildCodexMilestonesCardHtml(monthYearTitle, peakFlowCount, stalwartCount, softCapDays, activeDaysCount, softCap, totalSanctuaryHours, unlockedBadgesCount, thermostat) {
    const thermostatLabel = thermostat ? thermostat.label : '⏳ Warming Up';
    const thermostatMessage = thermostat ? thermostat.message : 'Thermostat engine unavailable for this snapshot.';
    return `
        <div class="lg:col-span-6 p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-amber-500/35 flex flex-col justify-between space-y-3">
            <div class="space-y-2.5">
                <div class="flex items-center justify-between gap-2 border-b border-slate-800/90 pb-2">
                    <span class="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5"><span>🏛️</span> <span>Craft Milestone Notes • ${escapeHtml(monthYearTitle)}</span></span>
                    <span class="text-[10px] font-mono font-bold text-emerald-400">${escapeHtml(thermostatLabel)}</span>
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
                        <div class="text-[10px] font-extrabold uppercase tracking-wider text-sky-300">🌡️ Habit Thermostat</div>
                        <div class="text-xs font-bold text-slate-100 mt-1">${escapeHtml(thermostatLabel)}</div>
                        <p class="text-[10px] text-slate-400 mt-0.5 leading-snug">${escapeHtml(thermostatMessage)}</p>
                    </div>
                    <div class="p-3 rounded-xl bg-slate-900/85 border border-slate-800">
                        <div class="text-[10px] font-extrabold uppercase tracking-wider text-purple-300">🏺 Sanctuary &amp; Relics</div>
                        <div class="text-xs font-bold text-slate-100 mt-1">${formatHours(totalSanctuaryHours)}h Sanctuary • ${unlockedBadgesCount}/${BADGE_CATALOG.length} Relics</div>
                        <p class="text-[10px] text-slate-400 mt-0.5 leading-snug">Life-balance conditioning &amp; lifetime relic mastery.</p>
                    </div>
                </div>
            </div>
            <div class="text-center text-[10px] font-mono text-amber-300/80 pt-2 border-t border-slate-800/70">✨ Click Folio to Return to Allowance Metrics &amp; Balance Snapshot ↻</div>
        </div>`;
}

function renderMonthlyPerformanceCodex() {
    const container = $('monthly-performance-codex-section');
    if (!container) return;

    if (userSettings.showMonthlyCodex !== true) {
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

    // Monthly chore hours drive a tier multiplier that is applied retroactively
    // to the month's entire accumulated base allowance — hard-capped at maxCash
    // (target allowance × max bonus cap %) so the bonus can never exceed it.
    const monthlyChoreHours = sumMonthlyChoreHours(monthLogs, targetYear, targetMonth);
    const baseAllowance = Math.min(monthlyPoints * pointRate, maxCash);
    const allowanceBreakdown = calculateMonthlyAllowanceBreakdown(baseAllowance, monthlyChoreHours, maxCash);
    const allowancePayout = allowanceBreakdown.finalMonthlyAllowance;
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
    // The Codex thermostat describes the selected month (month-to-date while the
    // current month is selected), not the trailing 7 days. The comparison window
    // is the preceding equal-length span so quality-drop detection still works.
    const thermostatDayMs = (typeof THERMOSTAT_DAY_MS === 'number' && THERMOSTAT_DAY_MS > 0)
        ? THERMOSTAT_DAY_MS
        : 86400000;
    const monthStartMs = new Date(targetYear, targetMonth, 1).getTime();
    const monthWindowDays = Math.max(1, Math.round((endOfPeriodMs - monthStartMs) / thermostatDayMs));
    const monthlyThermostat = typeof computeHabitThermostat === 'function'
        ? computeHabitThermostat(monthLogs, activeSettings, endOfPeriodMs, { windowDays: monthWindowDays })
        : null;
    const monthlyChoreHoursTotal = choreLogs.reduce((acc, l) => acc + (parseFloat(l.hours) || 0), 0);
    const monthlyWorkoutHours = workoutLogs.reduce((acc, l) => acc + (parseFloat(l.hours) || 0), 0);
    const monthlyBalance = {
        workH: totalFocusHours,
        choreH: monthlyChoreHoursTotal,
        workoutH: monthlyWorkoutHours,
        activeDays: activeDaysSet.size,
        totalH: totalFocusHours + monthlyChoreHoursTotal + monthlyWorkoutHours
    };

    container.innerHTML = _assembleCodexFolioHtml({
        monthYearTitle, isVaulted,
        flipBtnText: monthlyCodexFlipped ? '↻ Flip to Front: Metrics & Balance Snapshot' : '↻ Flip Folio: Standout Reflection & Milestones',
        flipStateClass: monthlyCodexFlipped ? 'is-flipped' : '',
        payoutPct, allowancePayout, targetCash, maxCash, workLogsCount: workLogs.length,
        totalFocusHours, totalSanctuaryHours, activeDaysCount: activeDaysSet.size,
        qMeta, avgQuality, qRound, peakFlowCount, eMeta, avgEffort, eRound, stalwartCount,
        balance: monthlyBalance,
        reflectionCardHtml: _buildCodexReflectionCardHtml(standout, monthYearTitle),
        milestonesCardHtml: _buildCodexMilestonesCardHtml(monthYearTitle, peakFlowCount, stalwartCount, softCapDays, activeDaysSet.size, softCap, totalSanctuaryHours, (activeSettings.unlockedBadges || []).length, monthlyThermostat),
        // Chore-to-allowance multiplier breakdown
        choreMultiplier: { ...allowanceBreakdown, monthlyChoreHours }
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
                        <span>Target: ฿${d.targetCash.toLocaleString()}</span>
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
                    <span class="text-[10px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5"><span>🌿</span> <span>Monthly Balance Snapshot</span></span>
                    <span class="text-[10px] font-mono text-slate-400">${d.balance.activeDays}d Active</span>
                </div>
                <div class="w-full flex items-center justify-center py-2">${_buildCodexBalanceSnapshotHtml(d.balance)}</div>
                <div class="w-full text-center text-[10px] font-mono text-amber-300/80 pt-1 border-t border-slate-800/70">✨ Click Folio to Flip for Standout Reflection &amp; Craft Milestones ↻</div>
            </div>
        </div>
        ${_buildChoreMultiplierCardHtml(d.choreMultiplier)}`;
}

function _buildChoreMultiplierCardHtml(cm) {
    if (!cm) return '';
    const baseText = Math.round(cm.baseAllowance || 0).toLocaleString();
    const bonusText = Math.round(cm.choreBonusAmount || 0).toLocaleString();
    const totalText = Math.round(cm.finalMonthlyAllowance || 0).toLocaleString();
    const progress = Math.min(100, Math.max(0, cm.progressPercent || 0));
    const tierPips = [1, 2, 3, 4, 5].map(n => `<span class="flex-1 h-1.5 rounded-full ${cm.tier >= n ? 'bg-sky-400' : 'bg-slate-800 border border-slate-700/60'}"></span>`).join('');
    const nextLabel = cm.isMaxTier
        ? '🏆 Max Tier Unlocked — +25% locked in'
        : `${formatHours(cm.hoursToNextTier)}h to ${cm.nextTierLabel}`;

    return `
        <div class="mt-3.5 p-4 rounded-2xl bg-slate-950/85 border border-sky-500/30">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                <span class="text-[10px] font-black uppercase tracking-widest text-sky-300 flex items-center gap-1.5"><span>🧹</span> <span>Chore-to-Allowance Multiplier</span></span>
                <div class="flex items-center gap-1.5">
                    <span class="text-[10px] font-mono font-extrabold px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">${cm.tierLabel}${cm.isMaxTier ? ' · MAX' : ''}</span>
                    <span class="text-[10px] font-mono font-extrabold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">+${cm.bonusPercent} • ×${cm.multiplier.toFixed(2)}</span>
                </div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-3">
                <div class="lg:col-span-7">
                    <div class="flex items-baseline justify-between gap-2">
                        <div>
                            <span class="text-2xl font-black font-mono text-sky-300">${formatHours(cm.monthlyChoreHours ?? cm.totalHours)}</span>
                            <span class="text-xs font-bold text-slate-400"> / ${cm.maxTierHours || 50}.0 chore hrs this month</span>
                        </div>
                        <span class="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Tier ${cm.tier} of ${cm.maxTier || 5}</span>
                    </div>
                    <div class="w-full bg-slate-900/90 h-2.5 rounded-full mt-2 overflow-hidden border border-slate-700/60" role="progressbar" aria-label="Progress toward next chore allowance tier" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}">
                        <div class="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-700" style="width:${progress}%"></div>
                    </div>
                    <div class="flex items-center justify-between text-[10px] font-mono mt-1.5 gap-2">
                        <span class="text-slate-400">${nextLabel}</span>
                        <span class="${cm.isMaxTier ? 'text-amber-300' : 'text-emerald-400'} font-bold">${cm.isMaxTier ? 'MAX' : Math.round(progress) + '%'}</span>
                    </div>
                    <div class="flex items-center gap-1 mt-2">${tierPips}</div>
                    <div class="text-[10px] font-mono text-slate-500 mt-1">Each 10h unlocks +5% · 50h = Tier 5 max</div>
                </div>
                <div class="lg:col-span-5 space-y-1.5 font-mono text-[11px]">
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-slate-400">Base Work Allowance</span>
                        <span class="text-slate-100 font-bold">฿${baseText}</span>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-slate-400">Chore Multiplier Bonus (+${cm.bonusPercent})</span>
                        <span class="text-emerald-400 font-bold">+฿${bonusText}</span>
                    </div>
                    <div class="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-800">
                        <span class="text-slate-300 font-bold">Total Monthly Allowance</span>
                        <span class="text-emerald-300 font-black">฿${totalText}</span>
                    </div>
                    ${cm.payoutCapped ? `<div class="text-[10px] text-amber-300/90 pt-1">⛔ Hard-capped at the monthly limit ฿${Math.round(cm.monthlyAllowanceLimit || 0).toLocaleString()} (target × max bonus cap) — the chore bonus never raises it.</div>` : ''}
                </div>
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
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-[10px] font-mono font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full codex-foil-badge">👑 Monthly Performance Codex</span>
                            <span class="text-xs font-mono font-black text-amber-300 uppercase tracking-wider">• ${escapeHtml(d.monthYearTitle)}</span>
                            ${d.isVaulted ? '<span class="text-[10px] font-mono font-extrabold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">🏛️ Vaulted</span>' : ''}
                        </div>
                        <h2 class="text-lg sm:text-2xl font-black codex-foil-title tracking-tight mt-0.5 truncate">${escapeHtml(getUserDisplayName(viewedUser))} — Monthly Folio</h2>
                        <div class="text-[11px] font-mono text-slate-400 flex items-center gap-2 flex-wrap">
                            <span>${formatHours(d.totalFocusHours)}h Focus</span>
                            <span>•</span>
                            <span>${d.activeDaysCount} Active Days</span>
                            <span>•</span>
                            <span class="text-amber-300 font-bold">🌿 ${formatHours(d.totalSanctuaryHours)}h Sanctuary</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2.5 shrink-0">
                    <button type="button" onclick="toggleMonthlyCodexFlip(event)" class="px-3.5 py-2 rounded-xl theme-accent-btn text-xs font-black flex items-center gap-1.5 shadow-lg">
                        <span id="monthly-codex-flip-btn-label">${d.flipBtnText}</span>
                    </button>
                </div>
            </div>

            <div id="monthly-codex-flip-container" onclick="toggleMonthlyCodexFlip(event)" class="codex-flip-card ${d.flipStateClass} relative z-10 mt-4 cursor-pointer select-none" title="Click to flip between Metrics/Balance Snapshot and Monthly Reflection/Milestones">
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

