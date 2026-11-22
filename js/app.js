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
        initDuoHUDListeners();
        if(typeof initHudInfoPopup==='function')initHudInfoPopup();
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

        // ZONE 2: Live Habit Thermostat Trigger & Rolling 7-Day Info Popup
        const uLogs = duoPresenceData[u].logs || (u === viewedUser ? currentRawLogsCache : []);
        const thermostat = typeof computeHabitThermostat === 'function'
            ? computeHabitThermostat(uLogs, s || {}, Date.now())
            : { state: 'STEADY_CRUISE', label: '🌿 Steady Cruise', message: '', metrics: { workH: 0, choreH: 0, workoutH: 0, totalH: 0, activeDays: 0, avgQuality: 0 } };

        hudThermostatCache[u] = { user: u, displayName: dispName, thermostat };

        const thermostatBadgeEl = $(`hud-thermostat-badge-${u.toLowerCase()}`);
        if(thermostatBadgeEl) {
            thermostatBadgeEl.innerText = thermostat.label;
            thermostatBadgeEl.className = `text-[10px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap ${typeof getThermostatBadgeClasses === 'function' ? getThermostatBadgeClasses(thermostat.state) : 'bg-slate-800 text-slate-300 border-slate-700'}`;
        }

        const triggerEl = $(`hud-thermostat-trigger-${u.toLowerCase()}`);
        if(triggerEl && triggerEl.setAttribute){
            triggerEl.setAttribute('aria-expanded', hudInfoPopupUser === u ? 'true' : 'false');
            triggerEl.classList.toggle('is-open', hudInfoPopupUser === u);
        }

        if(hudInfoPopupUser === u) renderHudInfoPopup(u);

        if($(`hud-hours-${u.toLowerCase()}`)) $(`hud-hours-${u.toLowerCase()}`).innerText=`${formatHours(duoPresenceData[u].hoursToday||0)}/${formatHours(s.dailySoftCap||4)}h`;
    });
}

function initRealtimeSettingsListener(){
    if(settingsUnsubscribe)settingsUnsubscribe();
    settingsUnsubscribe=db.collection('settings').doc(viewedUser).onSnapshot(doc=>{
        if(doc.exists){
            const data=doc.data();
            if(loggedInUser===viewedUser){
                userSettings={...userSettings,...data};
                if(typeof data.showMonthlyCodex==='boolean'){
                    userSettings.showMonthlyCodex=data.showMonthlyCodex;
                    try{localStorage.setItem('aureum_show_monthly_codex_v2',String(data.showMonthlyCodex))}catch(e){}
                }else{
                    userSettings.showMonthlyCodex=false;
                    try{localStorage.setItem('aureum_show_monthly_codex_v2','false')}catch(e){}
                    db.collection('settings').doc(loggedInUser).set({showMonthlyCodex:false},{merge:true}).catch(()=>{});
                }
                if(typeof data.audioMuted==='boolean'){
                    audioMuted=data.audioMuted;
                    if($('audio-toggle-btn'))$('audio-toggle-btn').innerText=audioMuted?"🔇":"🔊";
                }
                if(duoPresenceData[loggedInUser]){
                    duoPresenceData[loggedInUser].settings={...(duoPresenceData[loggedInUser].settings||{}),...userSettings};
                }
                applyThemeToBody(userSettings.userTheme);
                applyCursorToBody(userSettings.userCursor);
                applyBackgroundPattern(userSettings.bgPattern,userSettings.bgOpacity);
            }else{
                spectatorSettings={...data,showMonthlyCodex:Boolean(data.showMonthlyCodex===true)};
                applyThemeToBody(userSettings.userTheme);
                applyCursorToBody(userSettings.userCursor);
                applyBackgroundPattern(userSettings.bgPattern,userSettings.bgOpacity);
            }
        }else if(loggedInUser===viewedUser&&loggedInUser){
            userSettings.showMonthlyCodex=false;
            db.collection('settings').doc(loggedInUser).set(userSettings,{merge:true}).catch(()=>{});
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
    const sanctuaryLoggersCol=$('sanctuary-loggers-col'),guildFeedSanctuary=$('guild-activity-sanctuary');
    if(sanctuaryLoggersCol)sanctuaryLoggersCol.style.display=isSelf?'':'none';
    if(guildFeedSanctuary){
        guildFeedSanctuary.classList.toggle('lg:col-span-5',isSelf);
        guildFeedSanctuary.classList.toggle('lg:col-span-12',!isSelf);
    }
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
    if(t==='sanctuary'&&typeof renderGuildActivityFeed==='function')renderGuildActivityFeed();
    if(t==='chronicles'&&typeof renderMonthlyPerformanceCodex==='function')renderMonthlyPerformanceCodex();
    if(t==='crucible')attachPomoSpectatorListener();
}

/**
 * Builds the compact tier-ladder rows shown in the allowance hover panel.
 * Reads the shared chore-multiplier constants so the ladder never drifts from
 * the pure calculation engine in js/choreMultiplier.js.
 */
function buildChoreTierLadderHtml(info){
    if(!info)return '';
    const stepHours=(typeof CHORE_TIER_STEP_HOURS==='number')?CHORE_TIER_STEP_HOURS:10;
    const maxTier=(typeof CHORE_MAX_TIER==='number')?CHORE_MAX_TIER:5;
    const bonusStepPct=(typeof CHORE_TIER_BONUS_RATE==='number')?Math.round(CHORE_TIER_BONUS_RATE*100):5;
    let html='';
    for(let tier=0;tier<=maxTier;tier++){
        const floorHours=tier*stepHours;
        const isCurrent=info.tier===tier,isUnlocked=tier<=info.tier;
        const rangeLabel=(tier===maxTier)?`${formatHours(floorHours)}h+`:`${formatHours(floorHours)}–${formatHours(floorHours+stepHours)}h`;
        const rowClass=isCurrent
            ?'bg-sky-500/15 border border-sky-500/40 text-sky-100'
            :isUnlocked
                ?'bg-slate-900/70 border border-emerald-500/20 text-slate-300'
                :'bg-slate-900/40 border border-slate-800/70 text-slate-500';
        const icon=isCurrent?(info.isMaxTier?'🏆':'🎯'):(isUnlocked?'✓':'🔒');
        const pctClass=isUnlocked?'text-emerald-400':'text-slate-600';
        html+=`<div class="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-1.5 py-0.5 rounded-md font-mono text-[9px] ${rowClass}">
            <span class="font-black whitespace-nowrap">${icon} T${tier}</span>
            <span class="opacity-80 truncate">${rangeLabel}</span>
            <span class="font-black ${pctClass}">+${tier*bonusStepPct}%</span>
        </div>`;
    }
    return html;
}

/**
 * Binds the allowance card's chore-bonus bar. Hover/focus reveals the breakdown
 * via CSS; this only adds a tap/click pin so touch devices can open it too.
 */
function initChoreBonusPanel(){
    const zone=$('chore-bonus-zone'),track=$('chore-tier-track');
    if(!zone||!track||zone.dataset.choreBonusBound==='true')return;
    zone.dataset.choreBonusBound='true';

    track.addEventListener('click',event=>{
        event.stopPropagation();
        const willOpen=!zone.classList.contains('is-open');
        zone.classList.toggle('is-open',willOpen);
        // Blur on close so :focus-within does not immediately reopen the panel.
        if(!willOpen&&typeof track.blur==='function')track.blur();
    });
    document.addEventListener('pointerdown',event=>{
        if(!zone.classList.contains('is-open'))return;
        if(zone.contains(event.target))return;
        zone.classList.remove('is-open');
    });
    document.addEventListener('keydown',event=>{
        if(event.key==='Escape')zone.classList.remove('is-open');
    });
}

function renderAllowanceMultiplierUI(info){
    if(!info)return;
    initChoreBonusPanel();
    const tierPill=$('allowance-tier-pill');
    if(tierPill){
        tierPill.innerText=info.isMaxTier?`🏆 Tier 5 · +${info.bonusPercent}`:`🧹 ${info.tierLabel} · +${info.bonusPercent}`;
        tierPill.className=info.tier>0
            ?"text-[10px] font-extrabold px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30"
            :"text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700";
        tierPill.title=`${formatHours(info.totalHours)} chore hrs this month • ×${info.multiplier.toFixed(2)} allowance multiplier`;
    }

    const baseEl=$('allowance-base-amount');
    if(baseEl)baseEl.innerText=`฿${Math.round(info.baseAllowance).toLocaleString()}`;

    const rateEl=$('allowance-bonus-rate');
    if(rateEl){
        rateEl.innerText=`(+${info.bonusPercent})`;
        rateEl.title=info.payoutCapped
            ?`Chore bonus trimmed so the payout never exceeds the ฿${Math.round(info.monthlyAllowanceLimit||0).toLocaleString()} monthly limit (target × max bonus cap).`
            :'';
    }

    const bonusEl=$('allowance-bonus-amount');
    if(bonusEl){
        bonusEl.innerText=`+฿${Math.round(info.choreBonusAmount).toLocaleString()}`;
        bonusEl.className=info.choreBonusAmount>0
            ?'text-xs font-black font-mono text-emerald-400 mt-0.5'
            :'text-xs font-black font-mono text-slate-500 mt-0.5';
    }

    // Hover-panel headline stats
    const multEl=$('allowance-multiplier-badge');
    if(multEl)multEl.innerText=`×${info.multiplier.toFixed(2)}`;

    const loggedEl=$('allowance-hours-logged');
    if(loggedEl)loggedEl.innerText=`${formatHours(info.totalHours)}h`;

    const nextEl=$('allowance-hours-to-next');
    if(nextEl){
        nextEl.innerText=info.isMaxTier?'MAX':`${formatHours(info.hoursToNextTier)}h`;
        nextEl.className=info.isMaxTier
            ?'text-xs font-black font-mono text-amber-300 mt-0.5'
            :'text-xs font-black font-mono text-emerald-400 mt-0.5';
    }

    const ladderEl=$('chore-tier-ladder');
    if(ladderEl)ladderEl.innerHTML=buildChoreTierLadderHtml(info);

    const stepHintEl=$('chore-tier-step-hint');
    if(stepHintEl){
        const stepHours=(typeof CHORE_TIER_STEP_HOURS==='number')?CHORE_TIER_STEP_HOURS:10;
        const bonusStepPct=(typeof CHORE_TIER_BONUS_RATE==='number')?Math.round(CHORE_TIER_BONUS_RATE*100):5;
        stepHintEl.innerText=`${formatHours(stepHours)}h → +${bonusStepPct}% / tier`;
    }

    const bar=$('chore-tier-bar'),pct=$('chore-tier-progress-pct'),label=$('chore-tier-progress-label');
    const progressPct=Math.min(100,Math.max(0,info.progressPercent));
    if(bar){
        bar.style.width=`${progressPct}%`;
        const track=bar.parentElement;
        if(track&&track.setAttribute){
            track.setAttribute('aria-valuenow',String(Math.round(progressPct)));
            track.setAttribute('aria-valuetext',info.isMaxTier
                ?`Max tier unlocked • ${formatHours(info.totalHours)}h chore hours • +${info.bonusPercent} allowance`
                :`${formatHours(info.totalHours)}h of ${info.nextTierHours}h chore hours • ${formatHours(info.hoursToNextTier)}h to ${info.nextTierLabel}`);
        }
    }
    if(pct){
        pct.innerText=info.isMaxTier?'MAX':`${Math.round(info.progressPercent)}%`;
        pct.className=info.isMaxTier?'chore-tier-pct is-max':'chore-tier-pct';
    }
    if(label){
        label.innerText=info.isMaxTier
            ?`🏆 ${formatHours(info.totalHours)}h · Max`
            :`🧹 ${formatHours(info.totalHours)}h / ${info.nextTierHours}h`;
    }

    const payoutEl=$('monthly-payout');
    if(payoutEl){
        const capNote=info.payoutCapped
            ?` · Capped at monthly limit ฿${Math.round(info.monthlyAllowanceLimit||0).toLocaleString()} (target × max bonus cap)`
            :'';
        payoutEl.title=`Base ฿${Math.round(info.baseAllowance).toLocaleString()} + Chore Bonus ฿${Math.round(info.choreBonusAmount).toLocaleString()} = ฿${Math.round(info.finalMonthlyAllowance).toLocaleString()}${capNote}`;
    }
}

function loadUserData(){
    if(userLogsUnsubscribe)userLogsUnsubscribe();
    userLogsUnsubscribe=db.collection('logs').where('user','==',viewedUser).onSnapshot(snapshot=>{
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

        const activeSettings=(loggedInUser===viewedUser)?userSettings:((typeof spectatorSettings!=='undefined'&&spectatorSettings)||duoPresenceData[viewedUser]?.settings||userSettings);
        const targetPts=(activeSettings.weeklyHours||10)*12,pointRate=targetPts>0?((activeSettings.monthlyCash||8000)/targetPts):0,maxCash=(activeSettings.monthlyCash||8000)*((activeSettings.maxBonusCapPct||125)/100);
        const choreHours=sumMonthlyChoreHours(rawLogs,now.getFullYear(),now.getMonth());
        const baseAllowance=Math.min(monthlyPoints*pointRate,maxCash);
        // maxCash is the hard monthly limit: target allowance × max bonus cap %.
        // The chore bonus is applied inside the limit and can never exceed it.
        const allowanceBreakdown=calculateMonthlyAllowanceBreakdown(baseAllowance,choreHours,maxCash);
        const finalPayout=allowanceBreakdown.finalMonthlyAllowance,softCap=userSettings.dailySoftCap||4;
        const isVaulted=activeSettings.vaultedMonths?.[`${now.getFullYear()}-${now.getMonth()}`];

        const pEl=$('monthly-payout');
        pEl.innerText=`฿${Math.round(finalPayout).toLocaleString()}`;
        pEl.className=isVaulted?"text-3xl font-extrabold text-amber-400 mt-1.5 opacity-70 line-through":"text-3xl font-extrabold text-emerald-400 mt-1.5";
        renderAllowanceMultiplierUI(allowanceBreakdown);

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

        if(duoPresenceData[viewedUser]){
            duoPresenceData[viewedUser].logs=rawLogs;
        }
        renderDuoHUDCards();

        aureateInsightsData=calculateAureateInsights(rawLogs,userSettings.completedPomoHistory||[],userSettings);
        renderAureateInsight(currentInsightIndex,false);
        startAureateInsightsAutoCycle();

        updateGoalGauge(finalPayout,(activeSettings.monthlyCash||8000));
        updateChartData('work',rawLogs,pointRate,maxCash);
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

// ============================================================================
// HABIT THERMOSTAT — Personal Card Metrics & Quick Actions
// ============================================================================

function getThermostatMetricItems(metrics) {
    const m = metrics || {};
    return [
        { icon: '⚗️', label: 'Work', value: `${formatHours(m.workH)}h`, tint: 'text-amber-300' },
        { icon: '🧹', label: 'Chores', value: `${formatHours(m.choreH)}h`, tint: 'text-sky-300' },
        { icon: '🏃', label: 'Workout', value: `${formatHours(m.workoutH)}h`, tint: 'text-rose-300' },
        { icon: '📅', label: 'Active Days', value: `${m.activeDays || 0}/7`, tint: 'text-emerald-300' },
        { icon: '✨', label: 'Avg Quality', value: m.avgQuality > 0 ? m.avgQuality.toFixed(1) : '—', tint: 'text-slate-200' },
        { icon: '🗓️', label: 'Total', value: `${formatHours(m.totalH)}h`, tint: 'text-slate-100' }
    ];
}

// ============================================================================
// HUD INFO POPUP — Hover / Click Thermostat Breakdown on the Personal Cards
// ============================================================================

function initHudInfoPopup() {
    const popup = $('hud-info-popup');
    if (!popup || popup.dataset.hudInfoBound === 'true') return;
    popup.dataset.hudInfoBound = 'true';

    ['North', 'Cream'].forEach(user => {
        const trigger = $(`hud-thermostat-trigger-${user.toLowerCase()}`);
        if (!trigger) return;

        trigger.addEventListener('mouseenter', () => showHudInfoPopup(user, false));
        trigger.addEventListener('mouseleave', scheduleHudInfoPopupHide);
        trigger.addEventListener('focus', () => showHudInfoPopup(user, false));
        trigger.addEventListener('blur', scheduleHudInfoPopupHide);
        trigger.addEventListener('click', event => {
            event.stopPropagation();
            toggleHudInfoPopup(user);
        });
    });

    popup.addEventListener('mouseenter', cancelHudInfoPopupHide);
    popup.addEventListener('mouseleave', scheduleHudInfoPopupHide);

    document.addEventListener('pointerdown', event => {
        if (!hudInfoPopupUser) return;
        if (popup.contains(event.target)) return;
        if (event.target && event.target.closest && event.target.closest('.hud-thermostat-trigger')) return;
        hideHudInfoPopup();
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && hudInfoPopupUser) hideHudInfoPopup();
    });

    const reposition = () => {
        if (!hudInfoPopupUser) return;
        positionHudInfoPopup($(`hud-thermostat-trigger-${hudInfoPopupUser.toLowerCase()}`));
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, { passive: true });
}

function getHudThermostatSnapshot(user) {
    if (hudThermostatCache[user]) return hudThermostatCache[user];
    const logs = duoPresenceData[user]?.logs || [];
    const settings = duoPresenceData[user]?.settings || {};
    const thermostat = typeof computeHabitThermostat === 'function'
        ? computeHabitThermostat(logs, settings, Date.now())
        : {
            state: 'STEADY_CRUISE',
            label: '🌿 Steady Cruise',
            message: 'Balanced, sustainable rhythm with no alarms tripped.',
            isCorrective: false,
            quickActions: [],
            recommendedPomo: null,
            metrics: { workH: 0, choreH: 0, workoutH: 0, totalH: 0, activeDays: 0, avgQuality: 0 }
        };
    return { user, displayName: getUserDisplayName(user), thermostat };
}

function cancelHudInfoPopupHide() {
    if (hudInfoPopupHideTimer) {
        clearTimeout(hudInfoPopupHideTimer);
        hudInfoPopupHideTimer = null;
    }
}

function scheduleHudInfoPopupHide() {
    if (hudInfoPopupPinned) return;
    cancelHudInfoPopupHide();
    hudInfoPopupHideTimer = setTimeout(() => {
        hudInfoPopupHideTimer = null;
        if (!hudInfoPopupPinned) hideHudInfoPopup();
    }, 220);
}

function showHudInfoPopup(user, pin) {
    if (!user) return;
    cancelHudInfoPopupHide();
    if (pin) {
        hudInfoPopupPinned = true;
    } else if (hudInfoPopupUser && hudInfoPopupUser !== user) {
        hudInfoPopupPinned = false;
    }
    hudInfoPopupUser = user;
    renderHudInfoPopup(user);
    positionHudInfoPopup($(`hud-thermostat-trigger-${user.toLowerCase()}`));
    updateHudInfoPopupAria();
}

function toggleHudInfoPopup(user) {
    if (hudInfoPopupUser === user && hudInfoPopupPinned) {
        hideHudInfoPopup();
        return;
    }
    showHudInfoPopup(user, true);
}

function hideHudInfoPopup() {
    cancelHudInfoPopupHide();
    hudInfoPopupPinned = false;
    hudInfoPopupUser = null;
    const popup = $('hud-info-popup');
    if (popup) {
        popup.classList.add('hidden');
        popup.setAttribute('aria-hidden', 'true');
    }
    updateHudInfoPopupAria();
}

function updateHudInfoPopupAria() {
    ['North', 'Cream'].forEach(user => {
        const trigger = $(`hud-thermostat-trigger-${user.toLowerCase()}`);
        if (!trigger || !trigger.setAttribute) return;
        const isOpen = hudInfoPopupUser === user;
        trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        trigger.classList.toggle('is-open', isOpen);
    });
}

function positionHudInfoPopup(trigger) {
    const popup = $('hud-info-popup');
    if (!popup || !trigger || typeof trigger.getBoundingClientRect !== 'function') return;
    popup.classList.remove('hidden');
    const gap = 10, margin = 12;
    const rect = trigger.getBoundingClientRect();
    const width = popup.offsetWidth || 304;
    const height = popup.offsetHeight || 240;
    let left = rect.right + gap;
    let top = rect.top;
    if (left + width > window.innerWidth - margin) {
        left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin));
        top = rect.bottom + gap;
    }
    if (top + height > window.innerHeight - margin) top = window.innerHeight - height - margin;
    if (top < margin) top = margin;
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
}

function renderHudInfoPopup(user) {
    const popup = $('hud-info-popup');
    const body = $('hud-info-popup-body');
    if (!popup || !body || !user) return;
    const snapshot = getHudThermostatSnapshot(user);
    const thermostat = snapshot.thermostat;
    const metrics = thermostat.metrics || {};
    const isSelf = loggedInUser === viewedUser && viewedUser === user;
    const badgeClasses = typeof getThermostatBadgeClasses === 'function'
        ? getThermostatBadgeClasses(thermostat.state)
        : 'bg-slate-800 text-slate-300 border-slate-700';

    const metricTiles = getThermostatMetricItems(metrics).map(item => `
        <div class="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-center min-w-0">
            <div class="text-[9px] uppercase tracking-wider font-extrabold text-slate-500 truncate">${item.icon} ${escapeHtml(item.label)}</div>
            <div class="text-sm font-black font-mono ${item.tint} mt-0.5">${escapeHtml(item.value)}</div>
        </div>`).join('');

    let actionsHtml = '';
    if (isSelf && thermostat.isCorrective) {
        const actionBtns = (thermostat.quickActions || []).map(action => `
            <button type="button" onclick="startThermostatQuickAction('${action.type}', ${action.mins})"
                class="px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-all">
                ${escapeHtml(action.label)}
            </button>`).join('');
        const breakBtn = (thermostat.state === 'OVERHEATING' && thermostat.recommendedPomo)
            ? `<button type="button" onclick="startThermostatLongBreak(${thermostat.recommendedPomo.breakMins})"
                class="px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/50 transition-all">
                🧘 Suggested Long Break (${thermostat.recommendedPomo.breakMins}m)
            </button>`
            : '';
        if (actionBtns || breakBtn) {
            actionsHtml = `<div class="flex items-center gap-2 flex-wrap pt-1">${actionBtns}${breakBtn}</div>`;
        }
    }

    body.innerHTML = `
        <div class="flex items-start justify-between gap-2 pb-2 border-b border-slate-800/90">
            <div class="min-w-0">
                <div class="text-[9px] uppercase tracking-widest font-black text-slate-400">🌡️ Habit Thermostat</div>
                <div class="text-sm font-black text-slate-100 truncate">${escapeHtml(snapshot.displayName)}</div>
            </div>
            <button type="button" onclick="hideHudInfoPopup()" aria-label="Close thermostat info"
                class="text-slate-400 hover:text-white text-xs font-black px-2 py-0.5 rounded-lg bg-slate-900/90 border border-slate-700 transition-all shrink-0">✕</button>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[10px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap ${badgeClasses}">${escapeHtml(thermostat.label)}</span>
            <span class="text-[9px] font-mono text-slate-500">Rolling 7 days</span>
        </div>
        <p class="text-[11px] text-slate-300 leading-relaxed">${escapeHtml(thermostat.message || 'Balanced, sustainable rhythm with no alarms tripped.')}</p>
        <div class="grid grid-cols-2 gap-2">${metricTiles}</div>
        ${actionsHtml}
        <div class="text-[9px] font-mono text-slate-500 pt-2 border-t border-slate-800/70">
            ${isSelf ? 'Your personal card • Click the badge to pin this breakdown' : 'Peer card • Read-only preview'}
        </div>`;

    popup.classList.remove('hidden');
    popup.setAttribute('aria-hidden', 'false');
}

function startThermostatQuickAction(type, mins) {
    if (loggedInUser !== viewedUser) return;
    const duration = Math.max(1, parseInt(mins, 10) || 15);

    if (type === 'work') {
        switchTab('crucible');
        userSettings.pomoFocus = duration;
        try { localStorage.setItem('aureum_pomo_focus', String(duration)); } catch (e) {}

        if (typeof setMyPomoMode === 'function') {
            myPomoIsRunning = false;
            myPomoEndTime = null;
            if (myPomoInterval) clearInterval(myPomoInterval);
            setMyPomoMode('focus');
            if (typeof toggleMyPomoTimer === 'function') toggleMyPomoTimer();
        }

        db.collection('settings').doc(loggedInUser).set({ pomoFocus: duration }, { merge: true }).catch(() => {});
        playTone('save');
        showToast({
            title: `⚡ ${duration}m Focus Started`,
            subtitle: 'Thermostat preset applied to the Crucible timer.',
            icon: '🌡️',
            tier: 'gold'
        });
        hideHudInfoPopup();
        return;
    }

    const formMap = {
        chore: { tab: 'sanctuary', input: 'chore-time', card: 'chore-form-card', label: 'Chore' },
        workout: { tab: 'sanctuary', input: 'workout-time', card: 'workout-form-card', label: 'Workout' }
    };
    const cfg = formMap[type];
    if (!cfg) return;

    switchTab(cfg.tab);
    const hours = Math.max(0.25, Math.round((duration / 60) * 100) / 100);
    const input = $(cfg.input);
    if (input) input.value = hours.toFixed(2);

    const card = $(cfg.card);
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (input && input.focus) setTimeout(() => input.focus(), 120);

    playTone('save');
    showToast({
        title: `🌿 ${cfg.label} Quick Log Ready`,
        subtitle: `${duration}m pre-filled in the Sanctuary form.`,
        icon: '🌡️',
        tier: 'emerald'
    });
    hideHudInfoPopup();
}

function startThermostatLongBreak(mins) {
    if (loggedInUser !== viewedUser) return;
    const duration = Math.max(1, parseInt(mins, 10) || 10);

    switchTab('crucible');
    userSettings.pomoLong = duration;
    try { localStorage.setItem('aureum_pomo_long', String(duration)); } catch (e) {}

    if (typeof setMyPomoMode === 'function') {
        myPomoIsRunning = false;
        myPomoEndTime = null;
        if (myPomoInterval) clearInterval(myPomoInterval);
        setMyPomoMode('long');
        if (typeof toggleMyPomoTimer === 'function') toggleMyPomoTimer();
    }

    db.collection('settings').doc(loggedInUser).set({ pomoLong: duration }, { merge: true }).catch(() => {});
    playTone('save');
    showToast({
        title: `🧘 ${duration}m Recovery Break Started`,
        subtitle: 'Overheating guardrail: protect your pacing.',
        icon: '🌡️',
        tier: 'gold'
    });
    hideHudInfoPopup();
}

