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
