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
async function handleInstantThemeChange(){
    const val=$('setting-user-theme').value;userSettings.userTheme=val;applyThemeToBody(val);
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
    $('setting-monthly-cash').value=userSettings.monthlyCash;
    $('setting-weekly-hrs').value=userSettings.weeklyHours;
    $('setting-daily-soft-cap').value=userSettings.dailySoftCap||4;
    $('setting-bonus-cap').value=userSettings.maxBonusCapPct;
    $('setting-pomo-focus').value=userSettings.pomoFocus||25;
    $('setting-pomo-short').value=userSettings.pomoShort||5;
    $('setting-pomo-long').value=userSettings.pomoLong||15;
    $('setting-pomo-rounds').value=userSettings.pomoRounds||4;
    $('setting-pomo-sound').value=userSettings.pomoSound||'zen_bowl';
    $('setting-pomo-repeats').value=userSettings.pomoSoundRepeats||3;
    $('setting-user-theme').value=userSettings.userTheme||'gold';
    $('setting-user-cursor').value=userSettings.userCursor||'default';
    $('setting-bg-pattern').value=userSettings.bgPattern||'dots';
    const bgOp=userSettings.bgOpacity??20;
    $('setting-bg-opacity').value=bgOp;$('label-bg-opacity-val').innerText=`${bgOp}%`;
    $('setting-avatar-url').value=userSettings.avatarUrl||'';
    const particle=userSettings.particleIntensity??15;
    $('setting-particle-intensity').value=particle;$('label-particle-val').innerText=`${particle}%`;
    updateUnloggedFocusDisplay();
}

async function saveAllForgeSettings(e){
    if(e)e.preventDefault();
    userSettings.monthlyCash=parseFloat($('setting-monthly-cash').value)||8000;
    userSettings.weeklyHours=parseFloat($('setting-weekly-hrs').value)||10;
    userSettings.dailySoftCap=parseFloat($('setting-daily-soft-cap').value)||4;
    userSettings.maxBonusCapPct=parseFloat($('setting-bonus-cap').value)||125;
    userSettings.pomoFocus=parseInt($('setting-pomo-focus').value)||25;
    userSettings.pomoShort=parseInt($('setting-pomo-short').value)||5;
    userSettings.pomoLong=parseInt($('setting-pomo-long').value)||15;
    userSettings.pomoRounds=parseInt($('setting-pomo-rounds').value)||4;
    userSettings.pomoSound=$('setting-pomo-sound').value||'zen_bowl';
    userSettings.pomoSoundRepeats=parseInt($('setting-pomo-repeats').value)||3;
    userSettings.userTheme=$('setting-user-theme').value;
    userSettings.userCursor=$('setting-user-cursor').value;
    userSettings.bgPattern=$('setting-bg-pattern').value||'dots';
    userSettings.bgOpacity=parseInt($('setting-bg-opacity').value)||20;
    userSettings.avatarUrl=$('setting-avatar-url').value.trim();
    userSettings.particleIntensity=parseInt($('setting-particle-intensity').value)||0;

    try{
        localStorage.setItem('aureum_pomo_focus',userSettings.pomoFocus);
        localStorage.setItem('aureum_pomo_short',userSettings.pomoShort);
        localStorage.setItem('aureum_pomo_long',userSettings.pomoLong);
    }catch(e){}

    await db.collection('settings').doc(loggedInUser).set(userSettings,{merge:true});
    showToast({title:'⚙️ Settings Saved',subtitle:'Options saved successfully.',icon:'🔧',tier:'gold',duration:3000,originEvt:e});
    updateSettingsUI();loadUserData();setMyPomoMode('focus');
}

