// ============================================================================
// AUREUM — Forge Settings, Status Picker Modal & Avatar Customization
// ============================================================================

async function updatePresenceTimestamp(){
    if(!loggedInUser)return;
    try{await db.collection('settings').doc(loggedInUser).set({lastActiveTimestamp:Date.now()},{merge:true})}catch(e){}
}

function editUserStatusNote(user,e){
    if(e)e.stopPropagation();if(user!==loggedInUser)return;
    $('status-picker-modal').classList.remove('hidden');
}
function closeStatusPicker(){$('status-picker-modal').classList.add('hidden')}

async function selectStatusPreset(noteText){
    if(!noteText)return;
    userSettings.statusNote=noteText;closeStatusPicker();playTone('save');
    spawnParticleBurst(window.innerWidth/2, window.innerHeight/3);
    renderDuoHUDCards();
    showToast({title:'💬 Status Updated',subtitle:`"${noteText}"`,icon:'✨',tier:'gold'});
    await db.collection('settings').doc(loggedInUser).set({statusNote:noteText},{merge:true});
}

async function promptCustomStatus(){
    closeStatusPicker();
    const current=userSettings.statusNote||(loggedInUser==='North'?'Drawing 🎨':'Writing ✍️');
    const customNote=prompt('Enter status (max 25 chars):',current);
    if(customNote!==null&&customNote.trim()){
        await selectStatusPreset(customNote.trim().substring(0,25));
    }
}

async function applyCustomDisplayName(){
    if(loggedInUser!==viewedUser)return;
    const input=$('setting-display-name');
    if(!input)return;
    const cleaned=input.value.trim().substring(0,24);
    const finalName=cleaned||loggedInUser;
    userSettings.displayName=finalName;
    input.value=finalName;
    if(duoPresenceData[loggedInUser]){
        duoPresenceData[loggedInUser].settings=duoPresenceData[loggedInUser].settings||{};
        duoPresenceData[loggedInUser].settings.displayName=finalName;
    }
    renderDuoHUDCards();
    updateUserSwitcherUI();
    await db.collection('settings').doc(loggedInUser).set({displayName:finalName},{merge:true});
    showToast({title:'🪪 Display Name Updated',subtitle:`You are now known as "${escapeHtml(finalName)}"`,icon:'✨',tier:'gold'});
}

function requestUnlockGoalsTargets(){
    if(loggedInUser!==viewedUser)return;
    goalsUnlockConfirmPending=true;
    playTone('save');
    applyGoalsTargetsLockUI();
}

function cancelUnlockGoalsTargets(){
    goalsUnlockConfirmPending=false;
    applyGoalsTargetsLockUI();
}

function confirmUnlockGoalsTargets(){
    if(loggedInUser!==viewedUser)return;
    goalsUnlockConfirmPending=false;
    goalsTargetsLocked=false;
    playTone('save');
    applyGoalsTargetsLockUI();
    showToast({title:'🔓 Targets Unlocked',subtitle:'You may now carefully edit Goals & Targets.',icon:'⚠️',tier:'gold',duration:3000});
}

function lockGoalsTargets(){
    goalsUnlockConfirmPending=false;
    goalsTargetsLocked=true;
    playTone('save');
    applyGoalsTargetsLockUI();
    showToast({title:'🔒 Targets Locked',subtitle:'Goals & Targets are now protected from accidental changes.',icon:'🛡️',tier:'emerald',duration:2500});
}

function resetGoalsTargetsToSaved(){
    if($('setting-monthly-cash'))$('setting-monthly-cash').value=userSettings.monthlyCash||8000;
    if($('setting-weekly-hrs'))$('setting-weekly-hrs').value=userSettings.weeklyHours||10;
    if($('setting-daily-soft-cap'))$('setting-daily-soft-cap').value=userSettings.dailySoftCap||4;
    if($('setting-bonus-cap'))$('setting-bonus-cap').value=userSettings.maxBonusCapPct||125;
    playTone('delete');
    showToast({title:'↺ Values Reverted',subtitle:'Restored Goals & Targets to last saved values.',icon:'🛡️',tier:'silver',duration:2500});
}

function applyGoalsTargetsLockUI(){
    const isSelf=(loggedInUser===viewedUser);
    const locked=!isSelf||!!goalsTargetsLocked;
    const fieldsBox=$('goals-targets-fields');
    const card=$('goals-targets-card');
    const badge=$('goals-lock-status-badge');
    const helper=$('goals-lock-helper-text');
    const reqBtn=$('goals-unlock-request-btn');
    const confirmBar=$('goals-unlock-confirm-bar');
    const unlockedCtrls=$('goals-unlocked-controls');
    const actionArea=$('goals-lock-action-area');

    if(actionArea){
        actionArea.style.display=isSelf?'flex':'none';
    }

    GOALS_TARGET_FIELD_IDS.forEach(id=>{
        const el=$(id);
        if(el){
            el.disabled=locked;
            el.readOnly=locked;
        }
    });

    document.querySelectorAll('#goals-targets-fields .goals-step-btn').forEach(btn=>{
        btn.disabled=locked;
        btn.style.display=isSelf?'inline-block':'none';
        btn.classList.toggle('opacity-40',locked);
        btn.classList.toggle('cursor-not-allowed',locked);
    });

    if(fieldsBox)fieldsBox.classList.toggle('goals-locked-field',locked);
    if(card)card.classList.toggle('border-amber-500/50',!locked);
    if(badge){
        if(locked){
            badge.className='text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 uppercase tracking-wider flex items-center gap-1';
            badge.innerHTML='<span>🔒</span> <span>Locked</span>';
        }else{
            badge.className='text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider flex items-center gap-1';
            badge.innerHTML='<span>🔓</span> <span>Unlocked for Editing</span>';
        }
    }
    if(helper){
        helper.innerText=locked
            ?'Protected against accidental changes. Unlock deliberately to modify sensitive targets.'
            :'Unlocked! Modify your targets carefully, then click Save All Settings or Lock Values.';
        helper.className=locked?'text-[11px] text-slate-400 mt-0.5':'text-[11px] text-amber-300/90 font-semibold mt-0.5';
    }
    if(reqBtn&&confirmBar&&unlockedCtrls){
        if(!isSelf){
            reqBtn.style.display='none';
            confirmBar.classList.add('hidden');
            confirmBar.classList.remove('flex');
            unlockedCtrls.classList.add('hidden');
            unlockedCtrls.classList.remove('flex');
        }else if(locked){
            unlockedCtrls.classList.add('hidden');
            unlockedCtrls.classList.remove('flex');
            if(goalsUnlockConfirmPending){
                reqBtn.style.display='none';
                confirmBar.classList.remove('hidden');
                confirmBar.classList.add('flex');
                confirmBar.querySelectorAll('button').forEach(b=>b.style.display='inline-block');
            }else{
                reqBtn.style.display='inline-flex';
                confirmBar.classList.add('hidden');
                confirmBar.classList.remove('flex');
            }
        }else{
            reqBtn.style.display='none';
            confirmBar.classList.add('hidden');
            confirmBar.classList.remove('flex');
            unlockedCtrls.classList.remove('hidden');
            unlockedCtrls.classList.add('flex');
            unlockedCtrls.querySelectorAll('button').forEach(b=>b.style.display='inline-flex');
        }
    }
}

async function handleInstantBgPatternChange(){
    const pattern=$('setting-bg-pattern').value;
    const opacity=parseInt($('setting-bg-opacity').value)||0;
    userSettings.bgPattern=pattern;userSettings.bgOpacity=opacity;
    applyBackgroundPattern(pattern,opacity);
    if(loggedInUser===viewedUser)await db.collection('settings').doc(loggedInUser).set({bgPattern:pattern,bgOpacity:opacity},{merge:true});
}

async function handleInstantSoundChange(){
    const val=$('setting-pomo-sound').value;userSettings.pomoSound=val;
    if(loggedInUser===viewedUser)await db.collection('settings').doc(loggedInUser).set({pomoSound:val},{merge:true});
}
async function handleInstantSoundRepeatChange(){
    const val=parseInt($('setting-pomo-repeats').value)||3;userSettings.pomoSoundRepeats=val;
    if(loggedInUser===viewedUser)await db.collection('settings').doc(loggedInUser).set({pomoSoundRepeats:val},{merge:true});
}
const THEME_CATALOG = [
    { id: 'gold', name: 'Aureum Gold', subtitle: 'Amber + Champagne Gold', bgMain: '#0e1117', cardBg: '#161a24', primary: '#f59e0b', secondary: '#fef08a' },
    { id: 'rose', name: 'Rose Quartz', subtitle: 'Rose Pink + Warm Amber Gold', bgMain: '#180e15', cardBg: '#251422', primary: '#f472b6', secondary: '#fbbf24' },
    { id: 'emerald', name: 'Emerald Grove', subtitle: 'Mint + Warm Amber Gold', bgMain: '#071a17', cardBg: '#0f2924', primary: '#10b981', secondary: '#fef08a' },
    { id: 'cyber', name: 'Midnight Cyber', subtitle: 'Neon Violet + Electric Cyan', bgMain: '#0b0f20', cardBg: '#141930', primary: '#a855f7', secondary: '#38bdf8' },
    { id: 'sunset', name: 'Sunset Terracotta', subtitle: 'Peach + Rose Pink', bgMain: '#1c0f0a', cardBg: '#2a160e', primary: '#f97316', secondary: '#f472b6' },
    { id: 'amethyst', name: 'Amethyst Dusk', subtitle: 'Lavender + Mint Emerald', bgMain: '#120e20', cardBg: '#1d1530', primary: '#c084fc', secondary: '#34d399' },
    { id: 'ocean', name: 'Ocean Abyss', subtitle: 'Deep Teal + Solar Gold', bgMain: '#081820', cardBg: '#102633', primary: '#14b8a6', secondary: '#fbbf24' },
    { id: 'crimson', name: 'Crimson Forge', subtitle: 'Ruby Red + Cyan Spark', bgMain: '#1c0a0e', cardBg: '#2b1016', primary: '#ef4444', secondary: '#38bdf8' },
    { id: 'matcha', name: 'Matcha Latte', subtitle: 'Lime Sage + Lavender Bloom', bgMain: '#101c13', cardBg: '#1a2b1d', primary: '#84cc16', secondary: '#c084fc' },
    { id: 'monochrome', name: 'Monochrome Slate', subtitle: 'Obsidian + Amber Glow', bgMain: '#12151c', cardBg: '#1e222d', primary: '#e2e8f0', secondary: '#f59e0b' }
];

function updateThemeTriggerButtonUI(themeId) {
    const t = THEME_CATALOG.find(x => x.id === (themeId || 'gold')) || THEME_CATALOG[0];
    if ($('setting-user-theme')) $('setting-user-theme').value = t.id;
    if ($('theme-btn-name')) $('theme-btn-name').innerText = t.name;
    if ($('theme-btn-sub')) $('theme-btn-sub').innerText = t.subtitle;
    const sw1 = $('theme-btn-swatch-1'), sw2 = $('theme-btn-swatch-2');
    if (sw1) sw1.style.backgroundColor = t.primary;
    if (sw2) sw2.style.backgroundColor = t.secondary;
}

function openThemePickerModal() {
    if (loggedInUser !== viewedUser) return;
    renderThemePickerCards();
    $('theme-picker-modal')?.classList.remove('hidden');
}

function closeThemePickerModal() {
    $('theme-picker-modal')?.classList.add('hidden');
}

function renderThemePickerCards() {
    const grid = $('theme-picker-grid');
    if (!grid) return;
    const activeId = userSettings.userTheme || 'gold';
    grid.innerHTML = THEME_CATALOG.map(t => {
        const isSelected = (t.id === activeId);
        return `
            <button type="button" onclick="selectThemeFromModal('${t.id}')" class="p-3.5 rounded-2xl border text-left transition-all flex flex-col gap-2.5 group relative overflow-hidden" style="background-color: ${t.cardBg}; border-color: ${isSelected ? t.primary : 'rgba(148,163,184,0.22)'}; box-shadow: ${isSelected ? `0 0 18px ${t.primary}44` : 'none'};">
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="w-4 h-4 rounded-full border border-white/20 shrink-0" style="background: linear-gradient(135deg, ${t.primary} 0%, ${t.secondary} 100%);"></span>
                        <span class="text-xs font-black text-slate-100 truncate">${t.name}</span>
                    </div>
                    ${isSelected ? `<span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase shrink-0" style="background: ${t.primary}; color: #020617;">Active</span>` : ''}
                </div>
                <div class="text-[10px] text-slate-400 font-medium truncate">${t.subtitle}</div>
                <!-- Mini UI Preview Box -->
                <div class="p-2 rounded-xl border border-white/10 space-y-1.5" style="background-color: ${t.bgMain};">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-1.5">
                            <span class="w-3 h-3 rounded-md inline-block" style="background-color: ${t.primary};"></span>
                            <span class="w-3 h-3 rounded-md inline-block" style="background-color: ${t.secondary};"></span>
                        </div>
                        <span class="text-[9px] font-mono font-bold" style="color: ${t.primary};">100%</span>
                    </div>
                    <div class="w-full h-1.5 rounded-full overflow-hidden bg-slate-900">
                        <div class="h-full rounded-full" style="width: 78%; background: linear-gradient(135deg, ${t.primary} 0%, ${t.secondary} 100%);"></div>
                    </div>
                </div>
            </button>
        `;
    }).join('');
}

async function selectThemeFromModal(themeId) {
    if (loggedInUser !== viewedUser) return;
    userSettings.userTheme = themeId;
    updateThemeTriggerButtonUI(themeId);
    applyThemeToBody(themeId);
    renderThemePickerCards();
    playTone('save');
    closeThemePickerModal();
    if (loggedInUser === viewedUser) {
        await db.collection('settings').doc(loggedInUser).set({ userTheme: themeId }, { merge: true });
    }
}

async function handleInstantThemeChange(){
    const val=$('setting-user-theme').value;userSettings.userTheme=val;
    updateThemeTriggerButtonUI(val);
    applyThemeToBody(val);
    if(loggedInUser===viewedUser)await db.collection('settings').doc(loggedInUser).set({userTheme:val},{merge:true});
}
async function handleInstantCursorChange(){
    const val=$('setting-user-cursor').value;userSettings.userCursor=val;applyCursorToBody(val);
    if(loggedInUser===viewedUser)await db.collection('settings').doc(loggedInUser).set({userCursor:val},{merge:true});
}
async function handleInstantEffectChange(){
    userSettings.particleIntensity=parseInt($('setting-particle-intensity').value)||0;
    if(loggedInUser===viewedUser)await db.collection('settings').doc(loggedInUser).set({particleIntensity:userSettings.particleIntensity},{merge:true});
}

async function applyCustomAvatarUrl(){
    const url=$('setting-avatar-url').value.trim();if(!url)return;
    userSettings.avatarUrl=url;renderDuoHUDCards();
    if(loggedInUser===viewedUser)await db.collection('settings').doc(loggedInUser).set({avatarUrl:url},{merge:true});
    showToast({title:'🖼️ Avatar Updated',subtitle:'Custom avatar applied!',icon:'✨',tier:'gold'});
}
async function setAvatarPreset(style,seed){
    const url=`https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;
    $('setting-avatar-url').value=url;userSettings.avatarUrl=url;renderDuoHUDCards();
    if(loggedInUser===viewedUser)await db.collection('settings').doc(loggedInUser).set({avatarUrl:url},{merge:true});
    showToast({title:'🤖 Preset Applied',subtitle:'Avatar updated!',icon:'🤖',tier:'gold'});
}
async function randomizeAvatar(){
    const styles=['bottts','adventurer','lorelei','avataaars','personas','micah'];
    const url=`https://api.dicebear.com/7.x/${styles[(Math.random()*styles.length)|0]}/svg?seed=${Math.random().toString(36).substring(7)}`;
    $('setting-avatar-url').value=url;userSettings.avatarUrl=url;renderDuoHUDCards();
    if(loggedInUser===viewedUser)await db.collection('settings').doc(loggedInUser).set({avatarUrl:url},{merge:true});
    showToast({title:'🎲 Surprise!',subtitle:'New avatar generated!',icon:'✨',tier:'gold'});
}

function updateSettingsUI(){
    $('label-weekly-hrs').innerText=userSettings.weeklyHours;
    $('label-monthly-cash').innerText=userSettings.monthlyCash.toLocaleString();
    const dispInput=$('setting-display-name');
    if(dispInput&&document.activeElement!==dispInput){
        dispInput.value=userSettings.displayName||loggedInUser;
    }
    if(goalsTargetsLocked){
        $('setting-monthly-cash').value=userSettings.monthlyCash;
        $('setting-weekly-hrs').value=userSettings.weeklyHours;
        $('setting-daily-soft-cap').value=userSettings.dailySoftCap||4;
        $('setting-bonus-cap').value=userSettings.maxBonusCapPct;
    }
    if($('setting-pomo-sound'))$('setting-pomo-sound').value=userSettings.pomoSound||'zen_bowl';
    if($('setting-pomo-repeats'))$('setting-pomo-repeats').value=userSettings.pomoSoundRepeats||3;
    $('setting-user-theme').value=userSettings.userTheme||'gold';
    updateThemeTriggerButtonUI(userSettings.userTheme||'gold');
    $('setting-user-cursor').value=userSettings.userCursor||'default';
    $('setting-bg-pattern').value=userSettings.bgPattern||'dots';
    const bgOp=userSettings.bgOpacity??20;
    $('setting-bg-opacity').value=bgOp;$('label-bg-opacity-val').innerText=`${bgOp}%`;
    $('setting-avatar-url').value=userSettings.avatarUrl||'';
    const particle=userSettings.particleIntensity??15;
    $('setting-particle-intensity').value=particle;$('label-particle-val').innerText=`${particle}%`;
    applyGoalsTargetsLockUI();
    updateUnloggedFocusDisplay();
}

async function saveAllForgeSettings(e){
    if(e)e.preventDefault();
    const dispInput=$('setting-display-name');
    if(dispInput){
        const cleanedName=dispInput.value.trim().substring(0,24);
        userSettings.displayName=cleanedName||loggedInUser;
    }
    userSettings.role=loggedInUser==='Cream'?'author':'illustrator';
    userSettings.monthlyCash=parseFloat($('setting-monthly-cash').value)||userSettings.monthlyCash||8000;
    userSettings.weeklyHours=parseFloat($('setting-weekly-hrs').value)||userSettings.weeklyHours||10;
    userSettings.dailySoftCap=parseFloat($('setting-daily-soft-cap').value)||userSettings.dailySoftCap||4;
    userSettings.maxBonusCapPct=parseFloat($('setting-bonus-cap').value)||userSettings.maxBonusCapPct||125;
    if($('setting-pomo-sound'))userSettings.pomoSound=$('setting-pomo-sound').value||'zen_bowl';
    if($('setting-pomo-repeats'))userSettings.pomoSoundRepeats=parseInt($('setting-pomo-repeats').value)||3;
    userSettings.userTheme=$('setting-user-theme').value;
    userSettings.userCursor=$('setting-user-cursor').value;
    userSettings.bgPattern=$('setting-bg-pattern').value||'dots';
    userSettings.bgOpacity=parseInt($('setting-bg-opacity').value)||20;
    userSettings.avatarUrl=$('setting-avatar-url').value.trim();
    userSettings.particleIntensity=parseInt($('setting-particle-intensity').value)||0;

    goalsTargetsLocked=true;
    goalsUnlockConfirmPending=false;

    if(duoPresenceData[loggedInUser]){
        duoPresenceData[loggedInUser].settings={...(duoPresenceData[loggedInUser].settings||{}),...userSettings};
    }

    await db.collection('settings').doc(loggedInUser).set(userSettings,{merge:true});
    showToast({title:'⚙️ Settings Saved',subtitle:'Options saved & Goals locked safely.',icon:'🔧',tier:'gold',duration:3000,originEvt:e});
    updateSettingsUI();renderDuoHUDCards();updateUserSwitcherUI();loadUserData();
}

