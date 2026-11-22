// ============================================================================
// AUREUM — Pomodoro Timer Engine, Unlogged Focus Export & Spectator Sync
// ============================================================================

let myPomoMode='focus',myPomoRound=1,myPomoTime=_cachedFocus*60,myPomoEndTime=null,myPomoInitialTime=_cachedFocus*60,myPomoIsRunning=false,myPomoInterval=null,currentSessionWasPaused=false;
let pomoUIRenderInterval=null,pomoSyncUnsubscribe=null,spectatorSettings=null,shadowSpectatorTime=_cachedFocus*60,shadowSpectatorIsRunning=false,shadowSpectatorInterval=null;

// Live tab-title sync + synthesized completion chime (no audio files).
const DEFAULT_TITLE=(document.title||'Aureum').trim()||'Aureum';
const TIMER_CHIME_STORAGE_KEY='aureum_timer_chime_muted';
let timerChimeMuted=false;
try{timerChimeMuted=localStorage.getItem(TIMER_CHIME_STORAGE_KEY)==='true';}catch(e){}
let lastAppliedDocumentTitle=document.title||DEFAULT_TITLE;

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

// ----------------------------------------------------------------------------
// TAB TITLE — [12:34] Focus • Aureum / [PAUSED 12:34] Focus • Aureum
// ----------------------------------------------------------------------------
function getPomoModeLabel(mode) {
    if (mode === 'short') return 'Short Break';
    if (mode === 'long') return 'Long Break';
    return 'Focus';
}

function formatPomoClockTitle(secs) {
    const safe = Math.max(0, Math.round(Number(secs) || 0));
    return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}

function applyDocumentTitle(title) {
    const next = title || DEFAULT_TITLE;
    if (next === lastAppliedDocumentTitle && document.title === next) return;
    document.title = next;
    lastAppliedDocumentTitle = next;
}

function restoreDefaultDocumentTitle() {
    applyDocumentTitle(DEFAULT_TITLE);
}

/**
 * Mirrors the live Pomodoro state into the browser tab title.
 * Running -> [mm:ss] Label • Aureum, paused -> [PAUSED mm:ss] Label • Aureum,
 * idle/reset/completed -> the original page title.
 */
function syncPomodoroDocumentTitle(secs, isRunning, mode, initSecs, isSelf, wasPaused) {
    if (!isSelf) { restoreDefaultDocumentTitle(); return; }
    const clock = formatPomoClockTitle(secs);
    if (isRunning) {
        applyDocumentTitle(`[${clock}] ${getPomoModeLabel(mode)} • Aureum`);
        return;
    }
    const initial = Math.max(0, Math.round(Number(initSecs) || 0));
    if (wasPaused || (secs > 0 && secs < initial)) {
        applyDocumentTitle(`[PAUSED ${clock}] ${getPomoModeLabel(mode)} • Aureum`);
        return;
    }
    restoreDefaultDocumentTitle();
}

// ----------------------------------------------------------------------------
// COMPLETION CHIME — warm C5 -> G5 two-note sine/triangle bell
// ----------------------------------------------------------------------------
function unlockPomoAudio() {
    try {
        const c = getAudioContext();
        if (c && c.state === 'suspended' && typeof c.resume === 'function') c.resume().catch(() => {});
    } catch (e) {}
}

function playTimerChime() {
    if (timerChimeMuted || audioMuted) return;
    try {
        const c = getAudioContext();
        if (c.state === 'suspended' && typeof c.resume === 'function') c.resume().catch(() => {});
        const now = c.currentTime;
        // 523.25 Hz (C5) then 783.99 Hz (G5) 180ms later, each with a soft
        // octave shimmer and a 0.8s exponential fade.
        const notes = [
            { freq: 523.25, at: 0, type: 'sine', peak: 0.22 },
            { freq: 1046.50, at: 0, type: 'sine', peak: 0.06 },
            { freq: 783.99, at: 0.18, type: 'triangle', peak: 0.20 },
            { freq: 1567.98, at: 0.18, type: 'sine', peak: 0.05 }
        ];
        notes.forEach(note => {
            const osc = c.createOscillator();
            const gain = c.createGain();
            const start = now + note.at;
            osc.type = note.type;
            osc.frequency.setValueAtTime(note.freq, start);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(note.peak, start + 0.025);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.8);
            osc.connect(gain);
            gain.connect(c.destination);
            osc.start(start);
            osc.stop(start + 0.82);
        });
    } catch (e) {}
}

function updateTimerChimeToggleUI() {
    const btn = $('pomo-chime-toggle');
    if (!btn) return;
    btn.innerText = timerChimeMuted ? '🔇' : '🔔';
    btn.title = timerChimeMuted ? 'Timer chime muted (click to enable)' : 'Timer chime on (click to mute)';
    btn.setAttribute('aria-pressed', timerChimeMuted ? 'false' : 'true');
    btn.classList.toggle('opacity-60', timerChimeMuted);
}

function toggleTimerChime(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    timerChimeMuted = !timerChimeMuted;
    try { localStorage.setItem(TIMER_CHIME_STORAGE_KEY, String(timerChimeMuted)); } catch (err) {}
    updateTimerChimeToggleUI();
    if (!timerChimeMuted) {
        unlockPomoAudio();
        playTimerChime();
    }
}

try { updateTimerChimeToggleUI(); } catch (e) {}

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
            playPomoSound(userSettings.pomoSound);playTimerChime();restoreDefaultDocumentTitle();syncMyPomoToCloud();
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
    const isSelf=(loggedInUser===viewedUser);
    const secs=(isSelf?userSettings:spectatorSettings)?.unloggedFocusSecs||0;
    const hrs=(secs/3600).toFixed(2);
    if($('pomo-unlogged-hours'))$('pomo-unlogged-hours').innerText=`${hrs} h`;
    if($('work-accumulated-pill-text'))$('work-accumulated-pill-text').innerText=`${hrs} h`;
    const pill=$('work-accumulated-pill');
    if(pill){
        pill.disabled=(!isSelf||secs<=0);
        pill.title=secs>0?`Move ${hrs} h of banked focus into the duration box`:'No banked Pomodoro focus yet';
        pill.classList.toggle('opacity-50', secs<=0);
    }
    const resetBtn=$('pomo-reset-accumulated-btn');
    if(resetBtn){
        resetBtn.style.display=isSelf?'inline-flex':'none';
        resetBtn.disabled=(secs<=0);
        resetBtn.classList.toggle('opacity-40', secs<=0);
    }
}

async function resetUnloggedFocusTime(e){
    if(e&&e.stopPropagation)e.stopPropagation();
    if(loggedInUser!==viewedUser)return;
    const secs=userSettings.unloggedFocusSecs||0;
    if(secs<=0)return;
    if(!confirm('Reset accumulated Pomodoro focus time to 0.0 h?'))return;
    userSettings.unloggedFocusSecs=0;updateUnloggedFocusDisplay();
    await db.collection('settings').doc(loggedInUser).set({unloggedFocusSecs:0},{merge:true});
    playTone('delete');
    showToast({title:'⏱️ Focus Cleared',subtitle:'Accumulated time reset to 0.0 h.',icon:'⏱️',tier:'bronze',originEvt:e});
}

function applyAccumulatedHoursToWorkInput(e){
    if(e&&e.stopPropagation)e.stopPropagation();
    if(loggedInUser!==viewedUser)return;
    const secs=userSettings.unloggedFocusSecs||0;
    if(secs<=0)return;
    const accumulatedMinutes=Math.max(1,Math.round(secs/60));
    // The legacy modal is gone — fill the inline Quick-Log card instead.
    if(typeof applyAccumulatedFocusToQuickLog==='function'){
        applyAccumulatedFocusToQuickLog(accumulatedMinutes,e);
        return;
    }
    const timeInput=$('quick-log-duration');
    if(timeInput){
        timeInput.value=`${accumulatedMinutes}m`;
        playTone('step');
    }
}

function openLogWorkModal(prefillHours, e){
    if(e&&e.stopPropagation)e.stopPropagation();
    if(loggedInUser!==viewedUser)return;
    updateUnloggedFocusDisplay();
    const minutes=(prefillHours!==undefined&&prefillHours!==null)
        ? Math.max(1,Math.round(Number(prefillHours)*60))
        : null;
    if(typeof focusQuickLogCard==='function'){
        focusQuickLogCard(minutes);
        playTone('save');
        return;
    }
    const card=$('work-form-card');
    if(card&&card.scrollIntoView)card.scrollIntoView({behavior:'smooth',block:'center'});
}

// Kept as a no-op so any legacy caller can safely close the retired modal.
function closeLogWorkModal(e){
    if(e&&e.stopPropagation)e.stopPropagation();
    const modal=$('log-work-modal');
    if(modal)modal.classList.add('hidden');
}

function openLogAccumulatedHours(e){
    if(e&&e.stopPropagation)e.stopPropagation();
    if(loggedInUser!==viewedUser)return;
    const secs=userSettings.unloggedFocusSecs||0;
    const prefill=secs>0?Math.max(0.1,parseFloat((secs/3600).toFixed(1))):1.00;
    openLogWorkModal(prefill,e);
}

function updatePomoStepButtonsUI(mode, isDisabled){
    const stepSize=mode==='focus'?15:5;
    const minusBtn=$('pomo-step-minus'),plusBtn=$('pomo-step-plus');
    if(minusBtn){
        if(isDisabled!==undefined)minusBtn.disabled=isDisabled;
        minusBtn.innerText=`-${stepSize}m`;
        minusBtn.title=`Decrease timer by ${stepSize} minutes (persistent)`;
    }
    if(plusBtn){
        if(isDisabled!==undefined)plusBtn.disabled=isDisabled;
        plusBtn.innerText=`+${stepSize}m`;
        plusBtn.title=`Increase timer by ${stepSize} minutes (persistent)`;
    }
}

async function adjustPomoTimerDuration(deltaMins,e){
    if(e&&e.stopPropagation)e.stopPropagation();
    if(loggedInUser!==viewedUser||myPomoIsRunning)return;
    const dir=Math.sign(parseInt(deltaMins)||0);
    if(!dir)return;

    const stepSize=myPomoMode==='focus'?15:5;
    const step=dir*stepSize;

    let settingKey='pomoFocus',storageKey='aureum_pomo_focus',minMins=15,maxMins=180;
    if(myPomoMode==='short'){
        settingKey='pomoShort';storageKey='aureum_pomo_short';minMins=5;maxMins=60;
    }else if(myPomoMode==='long'){
        settingKey='pomoLong';storageKey='aureum_pomo_long';minMins=5;maxMins=120;
    }

    const curMins=parseInt(userSettings[settingKey])||(myPomoMode==='focus'?25:(myPomoMode==='short'?5:15));
    let nextMins;
    if(curMins%stepSize!==0){
        nextMins=step>0?(Math.ceil(curMins/stepSize)*stepSize):(Math.floor(curMins/stepSize)*stepSize);
        if(nextMins===curMins)nextMins=curMins+step;
    }else{
        nextMins=curMins+step;
    }
    nextMins=Math.max(minMins,Math.min(maxMins,nextMins));

    userSettings[settingKey]=nextMins;
    myPomoInitialTime=nextMins*60;
    myPomoTime=myPomoInitialTime;
    myPomoEndTime=null;
    currentSessionWasPaused=false;

    try{localStorage.setItem(storageKey,nextMins)}catch(err){}
    if(duoPresenceData[loggedInUser]){
        duoPresenceData[loggedInUser].settings={...(duoPresenceData[loggedInUser].settings||{}),[settingKey]:nextMins};
    }

    if($('pomo-timer-display'))$('pomo-timer-display').innerText=`${nextMins.toString().padStart(2,'0')}:00`;
    if(myPomoMode==='focus'&&$('pomo-mode-focus'))$('pomo-mode-focus').innerText=`Focus (${nextMins}m)`;
    if(myPomoMode==='short'&&$('pomo-mode-short'))$('pomo-mode-short').innerText=`Short (${nextMins}m)`;
    if(myPomoMode==='long'&&$('pomo-mode-long'))$('pomo-mode-long').innerText=`Long (${nextMins}m)`;

    playTone('save');
    syncMyPomoToCloud();
    try{
        await db.collection('settings').doc(loggedInUser).set({[settingKey]:nextMins},{merge:true});
    }catch(err){}
}

function setMyPomoMode(mode){
    myPomoMode=mode;myPomoIsRunning=false;currentSessionWasPaused=false;myPomoEndTime=null;
    if(myPomoInterval)clearInterval(myPomoInterval);
    const f=parseInt(userSettings.pomoFocus)||25,s=parseInt(userSettings.pomoShort)||5,l=parseInt(userSettings.pomoLong)||15;
    myPomoInitialTime=(mode==='focus'?f:(mode==='short'?s:l))*60;myPomoTime=myPomoInitialTime;
    updatePomoStepButtonsUI(mode);
    restoreDefaultDocumentTitle();
    syncMyPomoToCloud();
}

function toggleMyPomoTimer(){
    if(loggedInUser!==viewedUser)return;requestNotificationPermission();
    // Unlock the AudioContext from this direct user gesture so the completion
    // chime is never blocked by autoplay policies.
    unlockPomoAudio();
    if(myPomoIsRunning){
        myPomoIsRunning=false;currentSessionWasPaused=true;myPomoEndTime=null;clearInterval(myPomoInterval);
    }else{
        myPomoIsRunning=true;
        myPomoEndTime = Date.now() + (myPomoTime * 1000);
        startMyPomoBackgroundTimer();
    }
    syncMyPomoToCloud();
}
function resetMyPomoTimer(){if(loggedInUser===viewedUser){clearInterval(myPomoInterval);myPomoIsRunning=false;myPomoEndTime=null;myPomoRound=1;setMyPomoMode('focus');restoreDefaultDocumentTitle()}}
function handleClockClick(){if(loggedInUser===viewedUser)toggleMyPomoTimer()}

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

        // Live tab title: [mm:ss] while running, [PAUSED mm:ss] while paused,
        // original page title when idle / reset / completed.
        syncPomodoroDocumentTitle(secs,isR,mode,initT,isSelf,isSelf?currentSessionWasPaused:false);

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

        updatePomoStepButtonsUI(mode, isR||!isSelf);

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
        $('pomo-spectator-target').innerText=getUserDisplayName(viewedUser);
        pomoSyncUnsubscribe=db.collection('settings').doc(viewedUser).onSnapshot(doc=>{
            if(doc.exists){
                spectatorSettings=doc.data();
                $('pomo-spectator-target').innerText=getUserDisplayName(viewedUser);
                if($('view-target-name'))$('view-target-name').innerText=getUserDisplayName(viewedUser);
                applyThemeToBody(userSettings.userTheme);applyCursorToBody(userSettings.userCursor);
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
