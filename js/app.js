// ============================================================================
// AUREUM — App Initialization, Auth, Duo HUD Listeners & Main Data Loader
// ============================================================================

auth.onAuthStateChanged(async u=>{
    const modal=$('login-modal'),app=$('app-content');
    if(u){
        currentUserUid=u.uid;if(modal)modal.classList.add('hidden');if(app)app.classList.remove('hidden');
        loggedInUser=(u.uid==="ioxjbBLDH0NDLDWVoYCjq8p3PYU2"||u.email?.toLowerCase().includes("cream"))?'Cream':'North';
        viewedUser=loggedInUser;
        userSettings.role=loggedInUser==='Cream'?'author':'illustrator';
        duoPresenceData.North.role='illustrator';
        duoPresenceData.Cream.role='author';
        initDuoHUDListeners();
        initRealtimeSettingsListener();initGlobalHeaderGlowListener();
        if(typeof initGuildActivityFeedListener==='function')initGuildActivityFeedListener();
        await initAndRecoverMyPomoState();
        updateUserSwitcherUI();initCharts();loadUserData();
        updateRatingUI('results');updateRatingUI('effort');updateWorkoutStrainUI();
        startGlobalUIRenderer();attachPomoSpectatorListener();
        updatePresenceTimestamp();
    }else{
        if(modal)modal.classList.remove('hidden');
        if(app)app.classList.add('hidden');
    }
});

function initDuoHUDListeners(){
    if(unsubscribeNorthSettings)unsubscribeNorthSettings();
    if(unsubscribeCreamSettings)unsubscribeCreamSettings();

    unsubscribeNorthSettings=db.collection('settings').doc('North').onSnapshot(doc=>{
        if(doc.exists)duoPresenceData.North.settings=doc.data();
        renderDuoHUDCards();
        if(typeof renderGuildActivityTicker==='function')renderGuildActivityTicker();
    });
    unsubscribeCreamSettings=db.collection('settings').doc('Cream').onSnapshot(doc=>{
        if(doc.exists)duoPresenceData.Cream.settings=doc.data();
        renderDuoHUDCards();
        if(typeof renderGuildActivityTicker==='function')renderGuildActivityTicker();
    });
}

function renderDuoHUDCards(){
    ['North','Cream'].forEach(u=>{
        const isMe=(u===loggedInUser),isViewing=(u===viewedUser);
        const s=isMe?userSettings:(spectatorSettings&&viewedUser===u?spectatorSettings:(duoPresenceData[u]?.settings||{}));
        
        const cardEl=$(`hud-card-${u.toLowerCase()}`);
        if(cardEl){
            if(isViewing)cardEl.className="hud-card card active-space p-3.5 rounded-2xl border flex flex-col gap-2.5 cursor-pointer";
            else cardEl.className="hud-card card view-space p-3.5 rounded-2xl border flex flex-col gap-2.5 cursor-pointer";
        }

        // ZONE 1: Header Zone (Avatar, Display Name, Live Status Indicator)
        const nameEl=$(`hud-name-${u.toLowerCase()}`);
        const dispName=getUserDisplayName(u);
        if(nameEl)nameEl.innerText=dispName;

        const imgEl=$(`hud-avatar-${u.toLowerCase()}`);
        if(imgEl){
            imgEl.src=s.avatarUrl||`https://api.dicebear.com/7.x/bottts/svg?seed=${u}`;
            imgEl.alt=dispName;
            applyDynamicAvatarGlow(imgEl,duoPresenceData[u].hoursToday||0);
        }
        const dotEl=$(`hud-presence-dot-${u.toLowerCase()}`);
        if(dotEl){
            const lastActive=s.lastActiveTimestamp||0;
            const isOnline=(Date.now()-lastActive)<300000;
            dotEl.className=isOnline?"absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-950 presence-pulse":"absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-slate-600 border-2 border-slate-950";
        }

        const spinIcon=$(`hud-timer-spin-${u.toLowerCase()}`);
        if(spinIcon){
            const isRunningTimer = isMe ? myPomoIsRunning : !!s.livePomoState?.isRunning;
            if(isRunningTimer){
                spinIcon.classList.remove('hidden');
                spinIcon.classList.add('hourglass-spin-active');
            }else{
                spinIcon.classList.add('hidden');
                spinIcon.classList.remove('hourglass-spin-active');
            }
        }

        const badgeEl=$(`hud-badge-${u.toLowerCase()}`);
        if(badgeEl){
            if(isMe){badgeEl.innerText="YOU";badgeEl.className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase shrink-0"}
            else if(isViewing){badgeEl.innerText="VIEW";badgeEl.className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase shrink-0"}
            else{badgeEl.innerText="PEER";badgeEl.className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 uppercase shrink-0"}
        }

        const statusEl=$(`hud-status-${u.toLowerCase()}`);
        if(statusEl){
            const note=s.statusNote||(u==='North'?'Drawing 🎨':'Writing ✍️');
            statusEl.innerText=note;
        }

        // ZONE 2: Dynamic Title, SVG Class Crest & Level Zone
        const pwr = duoPresenceData[u].powerScore || 0;
        const uLogs = duoPresenceData[u].logs || (u === viewedUser ? currentRawLogsCache : []);
        const rankDetails = getRankDetails(pwr, uLogs, u, s);

        const crestEl = $(`hud-crest-${u.toLowerCase()}`);
        if(crestEl && typeof renderClassCrest === 'function') {
            crestEl.innerHTML = renderClassCrest(rankDetails.role, rankDetails.topStats, rankDetails.level, 30);
        }

        const titleEl = $(`hud-title-${u.toLowerCase()}`);
        if(titleEl) {
            titleEl.innerText = rankDetails.hybridTitle;
            titleEl.title = `${rankDetails.tierName} • ${rankDetails.hybridTitle} (${rankDetails.roleLabel} — ${rankDetails.domain} Domain)`;
        }

        const rankEl = $(`hud-rank-${u.toLowerCase()}`);
        if(rankEl) rankEl.innerText = `Lvl ${rankDetails.level}`;

        // ZONE 3: Progress Zone (Accumulated Power EXP vs Target EXP + Single Progress Bar)
        const pwrEl = $(`hud-pwr-${u.toLowerCase()}`);
        if(pwrEl) {
            if(rankDetails.nextThreshold !== null) {
                pwrEl.innerText = `${pwr.toLocaleString()} / ${rankDetails.nextThreshold.toLocaleString()} EXP`;
            } else {
                pwrEl.innerText = `${pwr.toLocaleString()} EXP (MAX)`;
            }
        }

        const progPctEl = $(`hud-rank-progress-pct-${u.toLowerCase()}`);
        if(progPctEl) {
            progPctEl.innerText = `${Math.round(rankDetails.progressPct)}%`;
        }

        const progBarEl = $(`hud-rank-bar-${u.toLowerCase()}`);
        if(progBarEl) {
            progBarEl.style.width = `${Math.min(100, Math.max(0, rankDetails.progressPct))}%`;
        }

        if($(`hud-hours-${u.toLowerCase()}`)) $(`hud-hours-${u.toLowerCase()}`).innerText=`${formatHours(duoPresenceData[u].hoursToday||0)}/${formatHours(s.dailySoftCap||4)}h`;
    });
}

function initRealtimeSettingsListener(){
    if(settingsUnsubscribe)settingsUnsubscribe();
    settingsUnsubscribe=db.collection('settings').doc(viewedUser).onSnapshot(doc=>{
        if(doc.exists){
            const data=doc.data();
            if(loggedInUser===viewedUser){
                const prevShowCodex=userSettings.showMonthlyCodex;
                userSettings={...userSettings,...data};
                if(data.showMonthlyCodex===undefined){
                    userSettings.showMonthlyCodex=prevShowCodex!==false;
                }else{
                    try{localStorage.setItem('aureum_show_monthly_codex',String(Boolean(data.showMonthlyCodex)))}catch(e){}
                }
                applyThemeToBody(userSettings.userTheme);
                applyCursorToBody(userSettings.userCursor);
                applyBackgroundPattern(userSettings.bgPattern,userSettings.bgOpacity);
            }else{
                spectatorSettings=data;
                applyThemeToBody(userSettings.userTheme);
                applyCursorToBody(userSettings.userCursor);
                applyBackgroundPattern(userSettings.bgPattern,userSettings.bgOpacity);
            }
        }
        updateSettingsUI();renderTodoList();renderDuoHUDCards();
        if(typeof renderGuildActivityTicker==='function')renderGuildActivityTicker();
        if(typeof renderMonthlyPerformanceCodex==='function')renderMonthlyPerformanceCodex();
        if(currentRawLogsCache.length>0)loadUserData();
    });
}

function initGlobalHeaderGlowListener(){
    if(globalLogsUnsubscribe)globalLogsUnsubscribe();
    const now=new Date(),startToday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    globalLogsUnsubscribe=db.collection('logs').onSnapshot(snapshot=>{
        let nH=0,cH=0,nLogs=[],cLogs=[],allLogs=[];
        snapshot.forEach(doc=>{
            const d=doc.data();
            d.id=doc.id;
            allLogs.push(d);
            const logDate=getLogDate(d);
            if(d.user==='North'){
                nLogs.push(d);
                if(logDate>=startToday&&d.type==='work')nH+=(d.hours||0);
            }else if(d.user==='Cream'){
                cLogs.push(d);
                if(logDate>=startToday&&d.type==='work')cH+=(d.hours||0);
            }
        });
        globalAllLogsCache=allLogs;
        duoPresenceData.North.hoursToday=nH;duoPresenceData.Cream.hoursToday=cH;
        duoPresenceData.North.logs=nLogs;duoPresenceData.Cream.logs=cLogs;
        duoPresenceData.North.powerScore=calculateLifetimePWR(nLogs);
        duoPresenceData.Cream.powerScore=calculateLifetimePWR(cLogs);
        duoPresenceData.North.workStyle=calculateRolling30DayQE(nLogs,'North',duoPresenceData.North.settings).archetype;
        duoPresenceData.Cream.workStyle=calculateRolling30DayQE(cLogs,'Cream',duoPresenceData.Cream.settings).archetype;
        renderDuoHUDCards();
        if(typeof renderGuildActivityTicker==='function')renderGuildActivityTicker();
    });
}

async function handleLogin(e){
    e.preventDefault();
    try{await auth.signInWithEmailAndPassword($('login-email').value,$('login-password').value);$('login-error').classList.add('hidden')}
    catch(err){$('login-error').innerText="Incorrect email or password.";$('login-error').classList.remove('hidden')}
}
function handleLogout(){auth.signOut()}

function switchActiveUser(target){viewedUser=target;initRealtimeSettingsListener();updateUserSwitcherUI();attachPomoSpectatorListener();loadUserData()}

function updateUserSwitcherUI(){
    const isSelf=loggedInUser===viewedUser;
    ['work-form-card','diary-form-card','health-form-card','chore-form-card','workout-form-card','todo-form'].forEach(id=>{const el=$(id);if(el)el.style.display=isSelf?'':'none'});
    if(!isSelf&&typeof closeLogWorkModal==='function')closeLogWorkModal();
    const clearBtn=$('todo-clear-btn');if(clearBtn)clearBtn.style.display=isSelf?'inline-block':'none';
    document.querySelectorAll('#tab-forge input, #tab-forge select').forEach(i=>{i.disabled=!isSelf;i.classList.toggle('opacity-50',!isSelf)});
    document.querySelectorAll('#tab-forge button').forEach(b=>b.style.display=isSelf?'inline-block':'none');
    if(typeof applyGoalsTargetsLockUI==='function')applyGoalsTargetsLockUI();
    $('read-only-banner').classList.toggle('hidden',isSelf);
    if(!isSelf)$('view-target-name').innerText=getUserDisplayName(viewedUser);
    renderTodoList();renderDuoHUDCards();
}

function switchTab(t){
    if(t==='hourglass')t='crucible';
    if(t!=='forge'){
        goalsTargetsLocked=true;
        goalsUnlockConfirmPending=false;
    }
    ['crucible','sanctuary','chronicles','relics','forge'].forEach(x=>{
        $(`tab-${x}`)?.classList.add('hidden');
        const nav=$(`nav-${x}`);
        if(nav)nav.className=x===t?"tab-btn active px-3.5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-3 w-full justify-start whitespace-nowrap":"tab-btn px-3.5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-3 w-full justify-start whitespace-nowrap";
    });
    $(`tab-${t}`)?.classList.remove('hidden');
    if(t==='forge'&&typeof applyGoalsTargetsLockUI==='function')applyGoalsTargetsLockUI();
    if(t==='chronicles'&&typeof renderMonthlyPerformanceCodex==='function')renderMonthlyPerformanceCodex();
    if(t==='crucible')attachPomoSpectatorListener();
}

function loadUserData(){
    db.collection('logs').where('user','==',viewedUser).onSnapshot(snapshot=>{
        let rawLogs=[],monthlyPoints=0,todayHours=0,todayLogs=[];
        const now=new Date(),startToday=new Date(now.getFullYear(),now.getMonth(),now.getDate());

        snapshot.forEach(doc=>{
            const d=doc.data();d.id=doc.id;rawLogs.push(d);
            const lDate=getLogDate(d);
            if(lDate>=startToday)todayLogs.push(d);
            if(d.type==='work'){
                if(lDate.getFullYear()===now.getFullYear()&&lDate.getMonth()===now.getMonth())monthlyPoints+=(d.points||0);
                if(lDate>=startToday)todayHours+=(d.hours||0);
            }
        });

        rawLogs.sort((a,b)=>getLogDate(b).getTime()-getLogDate(a).getTime());
        currentTodayHoursLogged=todayHours;currentRawLogsCache=rawLogs;

        const targetPts=userSettings.weeklyHours*12,pointRate=userSettings.monthlyCash/targetPts,maxCash=userSettings.monthlyCash*(userSettings.maxBonusCapPct/100);
        const finalPayout=Math.min(monthlyPoints*pointRate,maxCash),softCap=userSettings.dailySoftCap||4;
        const isVaulted=userSettings.vaultedMonths?.[`${now.getFullYear()}-${now.getMonth()}`];

        const pEl=$('monthly-payout');
        pEl.innerText=`฿${Math.round(finalPayout).toLocaleString()}`;
        pEl.className=isVaulted?"text-3xl font-extrabold text-amber-400 mt-1.5 opacity-70 line-through":"text-3xl font-extrabold text-emerald-400 mt-1.5";

        $('today-hours-label').innerText=`${formatHours(todayHours)} / ${formatHours(softCap)} hrs`;
        $('daily-bar').style.width=`${Math.min((todayHours/softCap)*100,100)}%`;

        const statusEl=$('daily-cap-status'),badge=$('milestone-2h-badge'),notice=$('work-form-softcap-notice'),yieldPill=$('allowance-yield-pill');
        if(todayHours>=softCap){
            statusEl.innerText="🍵 Soft Cap Active (25% Yield)";statusEl.className="text-xs font-semibold theme-accent-text";
            badge.innerText="✨ Baseline Reached";badge.className="text-[10px] font-bold theme-accent-text";notice?.classList.remove('hidden');
            yieldPill.innerText="🍵 Soft Cap";yieldPill.className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20";
        }else if(todayHours>=2.0){
            statusEl.innerText=`${formatHours(softCap-todayHours)} hrs remaining today`;statusEl.className="text-xs text-slate-400 font-medium";
            badge.innerText="🎯 2.0h Reached!";badge.className="text-[10px] font-bold text-emerald-400";notice?.classList.add('hidden');
            yieldPill.innerText="⚡ Standard";yieldPill.className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
        }else{
            statusEl.innerText=`${formatHours(softCap-todayHours)} hrs remaining today`;statusEl.className="text-xs text-slate-400 font-medium";
            badge.innerText="2.0h Base";badge.className="text-[10px] font-semibold text-slate-500";notice?.classList.add('hidden');
            yieldPill.innerText="⚡ Standard";yieldPill.className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
        }

        const lifetimePWR=calculateLifetimePWR(rawLogs);
        if(duoPresenceData[viewedUser]){
            duoPresenceData[viewedUser].powerScore=lifetimePWR;
            duoPresenceData[viewedUser].logs=rawLogs;
            duoPresenceData[viewedUser].workStyle=calculateRolling30DayQE(rawLogs,viewedUser,userSettings).archetype;
        }
        renderDuoHUDCards();
        calculateAndRenderPowerMeter(rawLogs);

        aureateInsightsData=calculateAureateInsights(rawLogs,userSettings.completedPomoHistory||[],userSettings);
        renderAureateInsight(currentInsightIndex,false);
        startAureateInsightsAutoCycle();

        updateGoalGauge(finalPayout,userSettings.monthlyCash);
        updateChartData('work',rawLogs.filter(l=>l.type==='work'),pointRate,maxCash);
        updateChartData('sanctuary',rawLogs,pointRate,maxCash);

        const todayDiary=rawLogs.find(l=>l.type==='diary'&&getLogDate(l)>=startToday);
        $('diary-text').value=todayDiary?todayDiary.text:'';
        $('diary-status-badge').innerText=todayDiary?"Reflection Saved ✨":"Jot down thoughts";

        const diaryLogs=rawLogs.filter(l=>l.type==='diary');
        renderJournalBookView(diaryLogs);

        populateAndFilterLedger();
        if(typeof renderGuildActivityTicker==='function')renderGuildActivityTicker();
        if(typeof renderMonthlyPerformanceCodex==='function')renderMonthlyPerformanceCodex();
        evaluateBadges(rawLogs,userSettings.completedPomoHistory||[],viewedUser);
    });
}

try {
    if (typeof renderGuildActivityTicker === 'function') renderGuildActivityTicker();
    if (typeof renderMonthlyPerformanceCodex === 'function') renderMonthlyPerformanceCodex();
    setInterval(() => {
        if (typeof renderGuildActivityTicker === 'function') renderGuildActivityTicker();
    }, 30000);
} catch (e) {}
