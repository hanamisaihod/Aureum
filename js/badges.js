// ============================================================================
// AUREUM — Relics / Badges Grid, Toast Notifications & Unlock Evaluator
// ============================================================================

function renderBadgeGrid(unlockedSet=new Set()){
    const gridEl=$('badge-grid');if(!gridEl)return;
    $('badge-completion-count').innerText=`${unlockedSet.size} / ${BADGE_CATALOG.length}`;
    gridEl.innerHTML=BADGE_CATALOG.map(b=>{
        const isUnlocked=unlockedSet.has(b.id);
        return `<div class="badge-card ${isUnlocked?'':'locked'} badge-tier-${b.tier} p-4 rounded-xl flex items-start gap-3 select-none"><div class="text-3xl p-2 bg-slate-900/80 rounded-xl border border-slate-700/60 shrink-0">${isUnlocked?b.icon:'🔒'}</div><div class="space-y-0.5"><div class="flex items-center gap-2"><span class="text-xs font-bold ${isUnlocked?'text-slate-100':'text-slate-400'}">${b.title}</span><span class="text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">${b.tier}</span></div><p class="text-[11px] text-slate-400 leading-snug">${b.desc}</p></div></div>`;
    }).join('');
}

function showToast({title,subtitle,icon,tier='gold',duration=3800,originEvt}){
    const container=$('badge-toast-container');if(!container)return;
    const toast=document.createElement('div');
    toast.className=`badge-toast card p-4 rounded-xl shadow-2xl border-2 badge-tier-${tier} flex items-center gap-3 bg-slate-950/90 backdrop-blur-md`;
    toast.innerHTML=`<div class="text-3xl p-2 bg-slate-900 rounded-xl border border-slate-700 shrink-0">${icon}</div><div><div class="text-[10px] font-extrabold text-amber-400 uppercase tracking-widest">${title}</div><div class="text-xs text-slate-200 mt-0.5 font-medium leading-snug">${subtitle}</div></div>`;
    container.appendChild(toast);playTone('save');
    spawnParticleBurst(originEvt?.clientX||120,originEvt?.clientY||window.innerHeight-80);
    setTimeout(()=>{toast.classList.add('toast-hiding');setTimeout(()=>toast.remove(),500)},duration);
}

function evaluateBadges(logs,pRoundsList=[],targetUser=viewedUser){
    if(!logs)return;
    if(loggedInUser!==viewedUser){renderBadgeGrid(new Set(spectatorSettings?.unlockedBadges||[]));return}
    userSettings.unlockedBadges=userSettings.unlockedBadges||[];
    const unlockedSet=new Set(userSettings.unlockedBadges),newlyUnlocked=[];
    const workLogs=logs.filter(l=>l.type==='work'),totalWorkHours=workLogs.reduce((acc,l)=>acc+(l.hours||0),0);
    const workHoursByDay={};
    for(let i=0;i<workLogs.length;i++){
        const l=workLogs[i];const d=getLogDate(l);
        const key=`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        workHoursByDay[key]=(workHoursByDay[key]||0)+(l.hours||0);
    }
    const unlock=(id)=>{
        if(!unlockedSet.has(id)){
            unlockedSet.add(id);newlyUnlocked.push(id);
            const b=BADGE_CATALOG.find(x=>x.id===id);
            if(b)showToast({title:'🏺 Relic Unlocked!',subtitle:`<strong>${b.title}</strong> — ${b.desc}`,icon:b.icon,tier:b.tier,duration:4500})
        }
    };
    if(workLogs.length>=1)unlock('work_1');
    if(Object.values(workHoursByDay).some(dailyHrs=>dailyHrs>=(userSettings.dailySoftCap||4)))unlock('work_cap');
    if(totalWorkHours>=100)unlock('work_100');if(totalWorkHours>=1000)unlock('work_1000');if(totalWorkHours>=10000)unlock('work_10000');
    if(logs.some(l=>l.type==='workout'))unlock('workout_1');
    const choreLogs=logs.filter(l=>l.type==='chore'),totalChoreHours=choreLogs.reduce((acc,l)=>acc+(l.hours||0),0);
    if(choreLogs.length>=1)unlock('chore_1');if(totalChoreHours>=25)unlock('chore_25');if(totalChoreHours>=100)unlock('chore_100');
    const diaryLogs=logs.filter(l=>l.type==='diary');
    if(diaryLogs.length>=1)unlock('diary_1');if(diaryLogs.length>=30)unlock('diary_30');if(diaryLogs.length>=100)unlock('diary_100');
    if(pRoundsList.length>=1)unlock('pomo_1');
    const pomoByDay={};
    pRoundsList.forEach(p=>{const key=new Date(p.timestamp).toDateString();pomoByDay[key]=(pomoByDay[key]||0)+1});
    const maxPomoDay=Math.max(0,...Object.values(pomoByDay));
    if(maxPomoDay>=4)unlock('pomo_flow');if(maxPomoDay>=8)unlock('pomo_overdrive');if(maxPomoDay>=12)unlock('pomo_marathon');
    pRoundsList.forEach(p=>{
        if(p.durationSecs>=3000)unlock('pomo_deep');
        if(p.durationSecs>=3000&&!p.wasPaused)unlock('pomo_unbroken');
    });
    let cleanStreak=0;
    pRoundsList.forEach(p=>{if(!p.wasPaused){cleanStreak++;if(cleanStreak>=4)unlock('pomo_zen')}else{cleanStreak=0}});
    if(newlyUnlocked.length>0){
        userSettings.unlockedBadges=Array.from(unlockedSet);renderBadgeGrid(unlockedSet);
        try{db.collection('settings').doc(loggedInUser).set({unlockedBadges:userSettings.unlockedBadges},{merge:true})}catch(e){}
    }else{renderBadgeGrid(unlockedSet)}
}
