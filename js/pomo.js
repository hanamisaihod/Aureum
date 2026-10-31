// POMODORO CLOCK & SPECTATOR ENGINE
let myPomoMode = 'focus';
let myPomoRound = 1;
let myPomoTime = 1500;
let myPomoInitialTime = 1500;
let myPomoIsRunning = false;
let myPomoInterval = null;

let pomoUIRenderInterval = null;
let pomoSyncUnsubscribe = null;
let spectatorSettings = null;

let shadowSpectatorTime = 1500;
let shadowSpectatorIsRunning = false;
let shadowSpectatorInterval = null;
let currentSessionWasPaused = false;

// SPACEBAR SHORTCUT LISTENERS
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        const activeEl = document.activeElement;
        const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
        if (!isInput) {
            e.preventDefault();
            if (loggedInUser === viewedUser) {
                toggleMyPomoTimer();
            }
        }
    }
});

async function syncMyPomoToCloud() {
    if (!loggedInUser) return;
    try {
        await db.collection('settings').doc(loggedInUser).set({
            livePomoState: {
                mode: myPomoMode,
                round: myPomoRound,
                isRunning: myPomoIsRunning,
                pomoTime: myPomoTime,
                updatedAtMillis: Date.now()
            }
        }, { merge: true });
    } catch (err) { console.error("Error syncing pomo state:", err); }
}

function startMyPomoBackgroundTimer() {
    if (myPomoInterval) clearInterval(myPomoInterval);
    let tickCount = 0;
    myPomoInterval = setInterval(() => {
        if (!myPomoIsRunning) return;
        myPomoTime--;
        tickCount++;
        
        if (tickCount >= 4) {
            syncMyPomoToCloud();
            tickCount = 0;
        }

        if (myPomoTime <= 0) {
            myPomoTime = 0;
            myPomoIsRunning = false;
            clearInterval(myPomoInterval);
            playTone('pomoDone');
            syncMyPomoToCloud();
            
            const totalRounds = parseInt(userSettings.pomoRounds) || 4;
            if (myPomoMode === 'focus') {
                userSettings.completedPomoHistory = userSettings.completedPomoHistory || [];
                userSettings.completedPomoHistory.push({
                    durationSecs: myPomoInitialTime,
                    wasPaused: currentSessionWasPaused,
                    timestamp: Date.now()
                });
            
                // Trigger immediate badge evaluation
                if (typeof evaluateBadges === 'function' && currentRawLogsCache) {
                    evaluateBadges(currentRawLogsCache, userSettings.completedPomoHistory);
                }
                if (myPomoRound < totalRounds) {
                    triggerDesktopNotification("✨ Focus Round Complete!", `Round ${myPomoRound} finished. Take a short break!`);
                    myPomoRound++;
                    setMyPomoMode('short');
                } else {
                    triggerDesktopNotification("🎉 All Rounds Complete!", `You crushed all ${totalRounds} focus rounds! Take a long break.`);
                    myPomoRound = 1;
                    setMyPomoMode('long');
                }
            } else {
                triggerDesktopNotification("🔔 Break Complete!", "Ready to begin your next focus round?");
                setMyPomoMode('focus');
            }
        }
    }, 1000);
}

function setMyPomoMode(mode) {
    myPomoMode = mode;
    myPomoIsRunning = false;
    currentSessionWasPaused = false; // Reset clean flag
    if (myPomoInterval) clearInterval(myPomoInterval);

    const focusMins = parseInt(userSettings.pomoFocus) || 25;
    const shortMins = parseInt(userSettings.pomoShort) || 5;
    const longMins = parseInt(userSettings.pomoLong) || 15;

    if (mode === 'focus') myPomoInitialTime = focusMins * 60;
    else if (mode === 'short') myPomoInitialTime = shortMins * 60;
    else myPomoInitialTime = longMins * 60;

    myPomoTime = myPomoInitialTime;
    syncMyPomoToCloud(); 
}

function handleUserSelectPomoMode(mode) {
    if (loggedInUser !== viewedUser) return;
    setMyPomoMode(mode);
}

function toggleMyPomoTimer() {
    if (loggedInUser !== viewedUser) return;
    requestNotificationPermission();

    if (myPomoIsRunning) {
        myPomoIsRunning = false;
        currentSessionWasPaused = true; // Flips pause flag
        if (myPomoInterval) clearInterval(myPomoInterval);
        syncMyPomoToCloud();
    } else {
        myPomoIsRunning = true;
        syncMyPomoToCloud();
        startMyPomoBackgroundTimer();
    }
}

function resetMyPomoTimer() {
    if (loggedInUser !== viewedUser) return;
    if (myPomoInterval) clearInterval(myPomoInterval);
    myPomoIsRunning = false;
    myPomoRound = 1;
    setMyPomoMode('focus');
}

function handleClockClick() {
    if (loggedInUser === viewedUser) {
        toggleMyPomoTimer();
    }
}

async function applyPomoPreset(focus, shortBreak, longBreak) {
    if (loggedInUser !== viewedUser) return;
    userSettings.pomoFocus = focus;
    userSettings.pomoShort = shortBreak;
    userSettings.pomoLong = longBreak;

    document.getElementById('setting-pomo-focus').value = focus;
    document.getElementById('setting-pomo-short').value = shortBreak;
    document.getElementById('setting-pomo-long').value = longBreak;

    try {
        await db.collection('settings').doc(loggedInUser).set({
            pomoFocus: focus, pomoShort: shortBreak, pomoLong: longBreak
        }, { merge: true });
        playTone('save');
        setMyPomoMode(myPomoMode);
    } catch (err) { console.error("Error saving preset:", err); }
}

async function initAndRecoverMyPomoState() {
    try {
        const fMins = parseInt(userSettings.pomoFocus) || 25;
        const sMins = parseInt(userSettings.pomoShort) || 5;
        const lMins = parseInt(userSettings.pomoLong) || 15;

        const docSnap = await db.collection('settings').doc(loggedInUser).get();
        if (docSnap.exists && docSnap.data().livePomoState) {
            const data = docSnap.data().livePomoState;
            myPomoMode = data.mode || 'focus';
            myPomoRound = parseInt(data.round) || 1;
            myPomoInitialTime = myPomoMode === 'focus' ? (fMins * 60) : (myPomoMode === 'short' ? (sMins * 60) : (lMins * 60));

            if (data.isRunning && data.updatedAtMillis) {
                const elapsedSecs = Math.floor((Date.now() - data.updatedAtMillis) / 1000);
                const remainingSecs = (parseInt(data.pomoTime) || myPomoInitialTime) - elapsedSecs;
                
                if (remainingSecs > 0) {
                    myPomoTime = remainingSecs;
                    myPomoIsRunning = true;
                    startMyPomoBackgroundTimer();
                } else {
                    myPomoTime = 0;
                    myPomoIsRunning = false;
                    playTone('pomoDone');
                    
                    const totalRounds = parseInt(userSettings.pomoRounds) || 4;
                    if (myPomoMode === 'focus') {
                        if (myPomoRound < totalRounds) {
                            myPomoRound++;
                            setMyPomoMode('short');
                        } else {
                            myPomoRound = 1;
                            setMyPomoMode('long');
                        }
                    } else {
                        setMyPomoMode('focus');
                    }
                }
            } else {
                myPomoTime = (data.pomoTime !== undefined && data.pomoTime > 0) ? parseInt(data.pomoTime) : myPomoInitialTime;
                myPomoIsRunning = false;
                syncMyPomoToCloud(); 
            }
        } else {
            setMyPomoMode('focus');
        }
    } catch (err) { setMyPomoMode('focus'); }
}

function startShadowSpectatorTimer() {
    if (shadowSpectatorInterval) clearInterval(shadowSpectatorInterval);
    shadowSpectatorInterval = setInterval(() => {
        if (shadowSpectatorIsRunning && shadowSpectatorTime > 0) {
            shadowSpectatorTime--;
        }
    }, 1000);
}

function startGlobalUIRenderer() {
    if (pomoUIRenderInterval) clearInterval(pomoUIRenderInterval);
    
    pomoUIRenderInterval = setInterval(() => {
        const isSelf = (loggedInUser === viewedUser);
        let displaySecs = 0, initialTime = 1500, isRunning = false, mode = 'focus', round = 1;
        
        let targetFocusMins = parseInt(userSettings.pomoFocus) || 25;
        let targetShortMins = parseInt(userSettings.pomoShort) || 5;
        let targetLongMins = parseInt(userSettings.pomoLong) || 15;
        let targetRounds = parseInt(userSettings.pomoRounds) || 4;

        if (isSelf) {
            displaySecs = myPomoTime;
            initialTime = myPomoInitialTime;
            isRunning = myPomoIsRunning;
            mode = myPomoMode;
            round = myPomoRound;
        } else {
            if (spectatorSettings) {
                targetFocusMins = parseInt(spectatorSettings.pomoFocus) || 25;
                targetShortMins = parseInt(spectatorSettings.pomoShort) || 5;
                targetLongMins = parseInt(spectatorSettings.pomoLong) || 15;
                targetRounds = parseInt(spectatorSettings.pomoRounds) || 4;
                
                initialTime = targetFocusMins * 60;
                displaySecs = initialTime;

                const liveData = spectatorSettings.livePomoState;
                if (liveData) {
                    mode = liveData.mode || 'focus';
                    round = parseInt(liveData.round) || 1;
                    initialTime = mode === 'focus' ? (targetFocusMins * 60) : (mode === 'short' ? (targetShortMins * 60) : (targetLongMins * 60));
                    isRunning = shadowSpectatorIsRunning;
                    displaySecs = shadowSpectatorTime;
                    if (displaySecs <= 0 && !isRunning) displaySecs = initialTime;
                }
            }
        }

        document.getElementById('pomo-mode-focus').innerText = `Focus (${targetFocusMins}m)`;
        document.getElementById('pomo-mode-short').innerText = `Short Break (${targetShortMins}m)`;
        document.getElementById('pomo-mode-long').innerText = `Long Break (${targetLongMins}m)`;

        const mins = Math.floor(displaySecs / 60);
        const secs = displaySecs % 60;
        document.getElementById('pomo-timer-display').innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        const pct = initialTime > 0 ? (displaySecs / initialTime) * 100 : 0;
        document.getElementById('pomo-progress-bar').style.width = `${pct}%`;

        const statusEl = document.getElementById('pomo-status-label');
        const toggleBtn = document.getElementById('pomo-toggle-btn');
        
        if (isSelf) {
            if (isRunning) {
                statusEl.innerText = mode === 'focus' ? "Focus Session Active" : "Resting...";
                toggleBtn.innerText = "Pause";
            } else {
                statusEl.innerText = displaySecs === initialTime ? "Click Clock or Press Spacebar" : "Paused";
                toggleBtn.innerText = displaySecs === initialTime ? (mode === 'focus' ? "Start Focus" : "Start Break") : "Resume";
            }
        } else {
            statusEl.innerText = isRunning ? `LIVE: ${mode.toUpperCase()} SESSION ACTIVE` : (displaySecs === initialTime ? "PAUSED / IDLE" : `PAUSED (${mode.toUpperCase()})`);
        }

        ['focus', 'short', 'long'].forEach(m => {
            const btn = document.getElementById(`pomo-mode-${m}`);
            btn.className = m === mode ? "px-4 py-1.5 rounded-md font-medium transition-all bg-blue-600 text-white" : "px-4 py-1.5 rounded-md font-medium text-slate-400 hover:text-white transition-all";
        });

        document.getElementById('pomo-round-badge').innerText = `Round ${round} of ${targetRounds}`;
        const dotsContainer = document.getElementById('pomo-round-dots');
        if (dotsContainer.children.length !== targetRounds) {
            dotsContainer.innerHTML = '';
            for (let i = 1; i <= targetRounds; i++) {
                dotsContainer.appendChild(document.createElement('div'));
            }
        }
        Array.from(dotsContainer.children).forEach((dot, index) => {
            dot.className = index < round ? "w-2.5 h-2.5 rounded-full theme-accent-bg" : "w-2.5 h-2.5 rounded-full bg-slate-700";
        });

    }, 100);
}

function attachPomoSpectatorListener() {
    if (pomoSyncUnsubscribe) pomoSyncUnsubscribe();

    const isSelf = (loggedInUser === viewedUser);
    const spectatorBanner = document.getElementById('pomo-spectator-banner');
    const controlsBox = document.getElementById('pomo-controls-box');
    const modeBox = document.getElementById('pomo-mode-box');
    const presetsBox = document.getElementById('pomo-presets-box');
    const clockContainer = document.getElementById('pomo-clock-container');

    if (!isSelf) {
        spectatorBanner.classList.remove('hidden');
        document.getElementById('pomo-spectator-target').innerText = viewedUser;
        controlsBox.classList.add('hidden');
        if (presetsBox) presetsBox.classList.add('hidden');
        modeBox.style.pointerEvents = 'none';
        modeBox.style.opacity = '0.6';
        clockContainer.classList.remove('cursor-pointer', 'hover:bg-slate-800/50');
        clockContainer.classList.add('cursor-default');

        pomoSyncUnsubscribe = db.collection('settings').doc(viewedUser).onSnapshot(async doc => {
            if (doc.exists) {
                spectatorSettings = doc.data();
                if (spectatorSettings.userTheme) applyThemeToBody(spectatorSettings.userTheme);

                const liveData = spectatorSettings.livePomoState;
                if (liveData) {
                    let dbTime = liveData.pomoTime !== undefined ? parseInt(liveData.pomoTime) : 1500;
                    shadowSpectatorIsRunning = !!liveData.isRunning;
                    
                    if (shadowSpectatorIsRunning && liveData.updatedAtMillis) {
                        let elapsedSecs = Math.floor((Date.now() - liveData.updatedAtMillis) / 1000);
                        shadowSpectatorTime = Math.max(0, dbTime - Math.max(0, elapsedSecs));
                        startShadowSpectatorTimer();
                    } else {
                        shadowSpectatorTime = dbTime;
                        if (shadowSpectatorInterval) clearInterval(shadowSpectatorInterval);
                    }
                } else {
                    shadowSpectatorIsRunning = false;
                    if (shadowSpectatorInterval) clearInterval(shadowSpectatorInterval);
                }
            } else {
                spectatorSettings = null;
                shadowSpectatorIsRunning = false;
            }
        });
    } else {
        spectatorBanner.classList.add('hidden');
        controlsBox.classList.remove('hidden');
        if (presetsBox) presetsBox.classList.remove('hidden');
        modeBox.style.pointerEvents = 'auto';
        modeBox.style.opacity = '1';
        clockContainer.classList.add('cursor-pointer', 'hover:bg-slate-800/50');
        clockContainer.classList.remove('cursor-default');
    }
}
