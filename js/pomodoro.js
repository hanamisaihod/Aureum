// ============================================================================
// AUREUM — Pomodoro Timer Engine, Unlogged Focus Export & Spectator Sync
// ============================================================================

let myPomoMode='focus',myPomoRound=1,myPomoTime=_cachedFocus*60,myPomoEndTime=null,myPomoInitialTime=_cachedFocus*60,myPomoIsRunning=false,myPomoInterval=null,currentSessionWasPaused=false;
let pomoUIRenderInterval=null,pomoSyncUnsubscribe=null,spectatorSettings=null,shadowSpectatorTime=_cachedFocus*60,shadowSpectatorIsRunning=false,shadowSpectatorInterval=null;

try{
    const _initTEl=$('pomo-timer-display'),_initFBtn=$('pomo-mode-focus');
    if(_initTEl)_initTEl.innerText=`${_cachedFocus.toString().padStart(2,'0')}:00`;
    if(_initFBtn)_initFBtn.innerText=`Focus (${_cachedFocus}m)`;
}catch(e){}

document.addEventListener('keydown',e=>{
    if(e.code==='Space'&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){
        e.preventDefault();if(loggedInUser===viewedUser)toggleMyPomoTimer();
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && myPomoIsRunning && myPomoEndTime) {
        myPomoTime = Math.max(0, Math.ceil((myPomoEndTime - Date.now()) / 1000));
    }
});

function handleUserSelectPomoMode(mode) {
    if (loggedInUser !== viewedUser) return;
    setMyPomoMode(mode);
}

async function syncMyPomoToCloud(){
    if(!loggedInUser)return;
    try{
        db.collection('settings').doc(loggedInUser).set({
            lastActiveTimestamp:Date.now(),
            livePomoState:{
                mode:myPomoMode,round:myPomoRound,isRunning:myPomoIsRunning,
                pomoTime:myPomoTime,pomoEndTime:myPomoEndTime,updatedAtMillis:Date.now()
            }
        },{merge:true});
    }catch(e){}
}

function startMyPomoBackgroundTimer(){
    if(myPomoInterval)clearInterval(myPomoInterval);
    let ticks=0;
    myPomoInterval=setInterval(()=>{
        if(!myPomoIsRunning || !myPomoEndTime)return;
        
        myPomoTime = Math.max(0, Math.ceil((myPomoEndTime - Date.now()) / 1000));
        ticks++;
        if(ticks>=4){syncMyPomoToCloud();ticks=0}
        
        if(myPomoTime<=0){
            myPomoTime=0;myPomoIsRunning=false;myPomoEndTime=null;clearInterval(myPomoInterval);
            playPomoSound(userSettings.pomoSound);syncMyPomoToCloud();
            const totalRounds=parseInt(userSettings.pomoRounds)||4;
            if(myPomoMode==='focus'){
                userSettings.completedPomoHistory=userSettings.completedPomoHistory||[];
                userSettings.completedPomoHistory.push({durationSecs:myPomoInitialTime,wasPaused:currentSessionWasPaused,timestamp:Date.now()});
                userSettings.unloggedFocusSecs=(userSettings.unloggedFocusSecs||0)+myPomoInitialTime;
                updateUnloggedFocusDisplay();
                
                db.collection('settings').doc(loggedInUser).set({
                    unloggedFocusSecs:userSettings.unloggedFocusSecs,
                    completedPomoHistory:userSettings.completedPomoHistory
                },{merge:true});

                evaluateBadges(currentRawLogsCache,userSettings.completedPomoHistory,loggedInUser);
                if(myPomoRound<totalRounds){triggerDesktopNotification("✨ Round Complete!",`Round ${myPomoRound} finished.`);myPomoRound++;setMyPomoMode('short')}
                else{triggerDesktopNotification("🎉 All Rounds Complete!",`All ${totalRounds} rounds finished!`);myPomoRound=1;setMyPomoMode('long')}
            }else{triggerDesktopNotification("🔔 Break Complete!","Ready for next focus round?");setMyPomoMode('focus')}
        }
    },1000);
}

function updateUnloggedFocusDisplay(){
    const secs=(loggedInUser===viewedUser?userSettings:spectatorSettings)?.unloggedFocusSecs||0;
    $('pomo-unlogged-hours').innerText=`${(secs/3600).toFixed(2)} hrs`;
}

function togglePomoExportDrawer(){
    const panel=$('pomo-export-panel');if(panel)panel.classList.toggle('hidden');
}

async function resetUnloggedFocusTime(e){
    if(loggedInUser!==viewedUser)return;
    userSettings.unloggedFocusSecs=0;updateUnloggedFocusDisplay();
    await db.collection('settings').doc(loggedInUser).set({unloggedFocusSecs:0},{merge:true});
    playTone('delete');
    showToast({title:'⏱️ Focus Cleared',subtitle:'Counter reset to 0.00 hrs.',icon:'⏱️',tier:'bronze',originEvt:e});
}

async function confirmLogUnloggedFocusToCrucible(e){
    if(loggedInUser!==viewedUser)return;
    const secs=userSettings.unloggedFocusSecs||0;
    if(secs<=0){
        showToast({title:'⏱️ Focus Tracker Empty',subtitle:'No unlogged hours to export.',icon:'⏳',tier:'bronze'});
        return;
    }
    const hours=Math.max(0.25,Math.round((secs/3600)*4)/4);
    const R=parseInt($('pomo-export-quality').value)||3,E=parseInt($('pomo-export-effort').value)||3;
    const baseRate=(R+E)/2,softCap=userSettings.dailySoftCap||4;
    const normH=Math.min(hours,Math.max(0,softCap-currentTodayHoursLogged)),overH=hours-normH;
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

    await db.collection('logs').add({type:'work',user:loggedInUser,hours:hours,normalHours:normH,overCapHours:overH,results:R,effort:E,points:pts,timestamp:firebase.firestore.FieldValue.serverTimestamp()});
    userSettings.unloggedFocusSecs=0;
    updateUnloggedFocusDisplay();
    await db.collection('settings').doc(loggedInUser).set({unloggedFocusSecs:0},{merge:true});
    if($('work-time'))$('work-time').value="1.00";
    if($('pomo-export-quality'))$('pomo-export-quality').value="3";
    if($('pomo-export-effort'))$('pomo-export-effort').value="3";
    
    $('pomo-export-panel').classList.add('hidden');
    showToast({title:'🚀 Exported to Crucible',subtitle:`<strong>+฿${Math.round(netCashEarned).toLocaleString()} Earned</strong> (${hours}h @ Lvl ${R}/${E})`,icon:'🎯',tier:'gold',originEvt:e});
    loadUserData();
}

function setMyPomoMode(mode){
    myPomoMode=mode;myPomoIsRunning=false;currentSessionWasPaused=false;myPomoEndTime=null;
    if(myPomoInterval)clearInterval(myPomoInterval);
    const f=parseInt(userSettings.pomoFocus)||25,s=parseInt(userSettings.pomoShort)||5,l=parseInt(userSettings.pomoLong)||15;
    myPomoInitialTime=(mode==='focus'?f:(mode==='short'?s:l))*60;myPomoTime=myPomoInitialTime;syncMyPomoToCloud();
}

function toggleMyPomoTimer(){
    if(loggedInUser!==viewedUser)return;requestNotificationPermission();
    if(myPomoIsRunning){
        myPomoIsRunning=false;currentSessionWasPaused=true;myPomoEndTime=null;clearInterval(myPomoInterval);
    }else{
        myPomoIsRunning=true;
        myPomoEndTime = Date.now() + (myPomoTime * 1000);
        startMyPomoBackgroundTimer();
    }
    syncMyPomoToCloud();
}
function resetMyPomoTimer(){if(loggedInUser===viewedUser){clearInterval(myPomoInterval);myPomoIsRunning=false;myPomoEndTime=null;myPomoRound=1;setMyPomoMode('focus')}}
function handleClockClick(){if(loggedInUser===viewedUser)toggleMyPomoTimer()}

async function applyPomoPreset(f,s,l){
    if(loggedInUser!==viewedUser)return;
    userSettings.pomoFocus=f;userSettings.pomoShort=s;userSettings.pomoLong=l;
    try{
        localStorage.setItem('aureum_pomo_focus',f);
        localStorage.setItem('aureum_pomo_short',s);
        localStorage.setItem('aureum_pomo_long',l);
    }catch(e){}
    $('setting-pomo-focus').value=f;$('setting-pomo-short').value=s;$('setting-pomo-long').value=l;
    await db.collection('settings').doc(loggedInUser).set({pomoFocus:f,pomoShort:s,pomoLong:l},{merge:true});
    playTone('save');setMyPomoMode('focus');
    showToast({title:'⏳ Preset Applied',subtitle:`${f}m Focus (${(f/60).toFixed(2)}h) / ${s}m Break`,icon:'⌛',tier:'gold'});
}

async function initAndRecoverMyPomoState(){
    try{
        const docSnap=await db.collection('settings').doc(loggedInUser).get();
        if(docSnap.exists){
            const data=docSnap.data();
            userSettings={...userSettings,...data};
            try{
                if(userSettings.pomoFocus)localStorage.setItem('aureum_pomo_focus',userSettings.pomoFocus);
                if(userSettings.pomoShort)localStorage.setItem('aureum_pomo_short',userSettings.pomoShort);
                if(userSettings.pomoLong)localStorage.setItem('aureum_pomo_long',userSettings.pomoLong);
            }catch(e){}
            const d=data.livePomoState;
            myPomoMode=d?.mode||'focus';myPomoRound=parseInt(d?.round)||1;
            const f=parseInt(userSettings.pomoFocus)||25,s=parseInt(userSettings.pomoShort)||5,l=parseInt(userSettings.pomoLong)||15;
            myPomoInitialTime=(myPomoMode==='focus'?f:(myPomoMode==='short'?s:l))*60;
            if(d&&d.isRunning&&d.pomoEndTime){
                const rem=Math.max(0,Math.ceil((d.pomoEndTime-Date.now())/1000));
                if(rem>0){myPomoTime=rem;myPomoEndTime=d.pomoEndTime;myPomoIsRunning=true;startMyPomoBackgroundTimer()}
                else{myPomoTime=myPomoInitialTime;myPomoIsRunning=false;myPomoEndTime=null;syncMyPomoToCloud()}
            }else{
                myPomoTime=myPomoInitialTime;myPomoIsRunning=false;myPomoEndTime=null;syncMyPomoToCloud();
            }
        }else{setMyPomoMode('focus')}
    }catch(e){setMyPomoMode('focus')}
}

function startShadowSpectatorTimer(){
    clearInterval(shadowSpectatorInterval);
    shadowSpectatorInterval=setInterval(()=>{
        if(shadowSpectatorIsRunning&&spectatorSettings?.livePomoState?.pomoEndTime){
            shadowSpectatorTime=Math.max(0,Math.ceil((spectatorSettings.livePomoState.pomoEndTime-Date.now())/1000));
        }
    },1000);
}

function startGlobalUIRenderer(){
    clearInterval(pomoUIRenderInterval);
    pomoUIRenderInterval=setInterval(()=>{
        const isSelf=(loggedInUser===viewedUser);
        let secs=isSelf?myPomoTime:shadowSpectatorTime,isR=isSelf?myPomoIsRunning:shadowSpectatorIsRunning,mode=isSelf?myPomoMode:(spectatorSettings?.livePomoState?.mode||'focus'),round=isSelf?myPomoRound:(spectatorSettings?.livePomoState?.round||1);
        let f=parseInt((isSelf?userSettings:spectatorSettings)?.pomoFocus)||25,s=parseInt((isSelf?userSettings:spectatorSettings)?.pomoShort)||5,l=parseInt((isSelf?userSettings:spectatorSettings)?.pomoLong)||15,totR=parseInt((isSelf?userSettings:spectatorSettings)?.pomoRounds)||4;
        let initT=(mode==='focus'?f:(mode==='short'?s:l))*60;

        $('pomo-mode-focus').innerText=`Focus (${f}m)`;$('pomo-mode-short').innerText=`Short (${s}m)`;$('pomo-mode-long').innerText=`Long (${l}m)`;
        $('pomo-timer-display').innerText=`${Math.floor(secs/60).toString().padStart(2,'0')}:${(secs%60).toString().padStart(2,'0')}`;
        $('pomo-progress-bar').style.width=`${initT>0?(secs/initT)*100:0}%`;

        const activeHgIcon=$('timer-active-hourglass');
        if(activeHgIcon){
            if(isR){
                activeHgIcon.classList.remove('hidden');
                activeHgIcon.classList.add('hourglass-spin-active');
            }else{
                activeHgIcon.classList.add('hidden');
                activeHgIcon.classList.remove('hourglass-spin-active');
            }
        }

        const statusEl=$('pomo-status-label'),toggleBtn=$('pomo-toggle-btn');
        if(isSelf){
            statusEl.innerText=isR?(mode==='focus'?"Focus Active":"Resting..."):(secs===initT?"Click Timer or Press Spacebar":"Paused");
            toggleBtn.innerText=isR?"Pause":(secs===initT?(mode==='focus'?"Start Focus":"Start Break"):"Resume");
        }else{statusEl.innerText=isR?`LIVE: ${mode.toUpperCase()}`:"PAUSED / IDLE"}

        ['focus','short','long'].forEach(m=>{$(`pomo-mode-${m}`).className=m===mode?"px-4 py-1.5 rounded-lg font-extrabold transition-all theme-accent-btn":"px-4 py-1.5 rounded-lg font-semibold text-slate-400 hover:text-white transition-all"});
        $('pomo-round-badge').innerText=`Round ${round} of ${totR}`;
        const dots=$('pomo-round-dots');
        if(dots.children.length!==totR){dots.innerHTML='';for(let i=0;i<totR;i++)dots.appendChild(document.createElement('div'))}
        Array.from(dots.children).forEach((d,i)=>d.className=i<round?"w-2.5 h-2.5 rounded-full theme-accent-bg":"w-2.5 h-2.5 rounded-full bg-slate-700");
        updateUnloggedFocusDisplay();
        renderDuoHUDCards();
    },250);
}

function attachPomoSpectatorListener(){
    if(pomoSyncUnsubscribe)pomoSyncUnsubscribe();
    const isSelf=(loggedInUser===viewedUser);
    $('pomo-spectator-banner').classList.toggle('hidden',isSelf);$('pomo-controls-box').classList.toggle('hidden',!isSelf);
    if(!isSelf){
        $('pomo-spectator-target').innerText=viewedUser;
        pomoSyncUnsubscribe=db.collection('settings').doc(viewedUser).onSnapshot(doc=>{
            if(doc.exists){
                spectatorSettings=doc.data();applyThemeToBody(userSettings.userTheme);applyCursorToBody(userSettings.userCursor);
                applyBackgroundPattern(userSettings.bgPattern,userSettings.bgOpacity);
                renderBadgeGrid(new Set(spectatorSettings.unlockedBadges||[]));renderTodoList();
                const live=spectatorSettings.livePomoState;
                if(live){
                    shadowSpectatorIsRunning=!!live.isRunning;
                    if(shadowSpectatorIsRunning&&live.pomoEndTime){
                        shadowSpectatorTime=Math.max(0,Math.ceil((live.pomoEndTime-Date.now())/1000));
                        startShadowSpectatorTimer();
                    }else{
                        shadowSpectatorTime=live.pomoTime!==undefined?parseInt(live.pomoTime):1500;
                        clearInterval(shadowSpectatorInterval);
                    }
                }
            }
        });
    }else{applyThemeToBody(userSettings.userTheme);applyCursorToBody(userSettings.userCursor);applyBackgroundPattern(userSettings.bgPattern,userSettings.bgOpacity);renderTodoList()}
}
