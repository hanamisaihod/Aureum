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
    updateThemeTriggerButtonUI(userSettings.userTheme||'gold');
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

