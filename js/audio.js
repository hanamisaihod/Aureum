// ============================================================================
// AUREUM — Web Audio API Synth Engine & Desktop Notifications
// ============================================================================

let globalAudioCtx = null;
function getAudioContext() {
    if (!globalAudioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        globalAudioCtx = new AudioCtx();
    }
    if (globalAudioCtx.state === 'suspended') globalAudioCtx.resume();
    return globalAudioCtx;
}

function unlockAudioContext(){
    if(globalAudioCtx && globalAudioCtx.state==='suspended')globalAudioCtx.resume();
    else if(!globalAudioCtx)getAudioContext();
}
window.addEventListener('click', unlockAudioContext, {passive:true});
window.addEventListener('keydown', unlockAudioContext, {passive:true});
window.addEventListener('touchstart', unlockAudioContext, {passive:true});

function playSingleToneBurst(key,c,now){
    const k=key||userSettings.pomoSound||'zen_bowl';
    if(k==='zen_bowl'){
        [216,432,648].forEach((freq,idx)=>{
            const o=c.createOscillator(),g=c.createGain();
            o.type='sine';o.frequency.setValueAtTime(freq,now);
            g.gain.setValueAtTime(idx===0?0.35:0.1,now);
            g.gain.exponentialRampToValueAtTime(0.0001,now+3.5);
            o.connect(g);g.connect(c.destination);
            o.start(now);o.stop(now+3.5);
        });
    }else if(k==='ethereal_synth'){
        const notes=[261.63, 329.63, 392.00, 523.25];
        notes.forEach((freq,i)=>{
            const o=c.createOscillator(),g=c.createGain();
            o.type='sine';o.frequency.setValueAtTime(freq,now+i*0.1);
            g.gain.setValueAtTime(0.001,now+i*0.1);
            g.gain.linearRampToValueAtTime(0.2,now+i*0.1+0.1);
            g.gain.exponentialRampToValueAtTime(0.0001,now+i*0.1+2.8);
            o.connect(g);g.connect(c.destination);
            o.start(now+i*0.1);o.stop(now+i*0.1+2.8);
        });
    }else if(k==='harp_glissando'){
        const notes=[261.63, 329.63, 392.00, 440.00, 523.25, 659.25, 783.99];
        notes.forEach((freq,i)=>{
            const o=c.createOscillator(),g=c.createGain();
            o.type='triangle';o.frequency.setValueAtTime(freq,now+i*0.07);
            g.gain.setValueAtTime(0.001,now+i*0.07);
            g.gain.linearRampToValueAtTime(0.25,now+i*0.07+0.02);
            g.gain.exponentialRampToValueAtTime(0.0001,now+i*0.07+1.8);
            o.connect(g);g.connect(c.destination);
            o.start(now+i*0.07);o.stop(now+i*0.07+1.8);
        });
    }else if(k==='arpeggio_chime'){
        const notes=[523.25,659.25,783.99,1046.50];
        notes.forEach((freq,i)=>{
            const o=c.createOscillator(),g=c.createGain();
            o.type='sine';o.frequency.setValueAtTime(freq,now+i*0.18);
            g.gain.setValueAtTime(0.001,now+i*0.18);
            g.gain.linearRampToValueAtTime(0.3,now+i*0.18+0.04);
            g.gain.exponentialRampToValueAtTime(0.0001,now+i*0.18+2.0);
            o.connect(g);g.connect(c.destination);
            o.start(now+i*0.18);o.stop(now+i*0.18+2.0);
        });
    }else if(k==='cosmic_pad'){
        const notes=[146.83,220.00,293.66,440.00];
        const filter=c.createBiquadFilter();
        filter.type='lowpass';filter.frequency.setValueAtTime(300,now);
        filter.frequency.exponentialRampToValueAtTime(1800,now+1.5);
        filter.frequency.exponentialRampToValueAtTime(200,now+3.2);
        filter.connect(c.destination);
        notes.forEach((freq)=>{
            const o=c.createOscillator(),g=c.createGain();
            o.type='sawtooth';o.frequency.setValueAtTime(freq,now);
            g.gain.setValueAtTime(0.001,now);g.gain.linearRampToValueAtTime(0.08,now+0.8);
            g.gain.exponentialRampToValueAtTime(0.0001,now+3.2);
            o.connect(g);g.connect(filter);
            o.start(now);o.stop(now+3.2);
        });
    }else if(k==='marimba_cascade'){
        const pitches=[329.63,392.00,493.88,587.33,659.25];
        pitches.forEach((freq,i)=>{
            const o=c.createOscillator(),g=c.createGain();
            o.type='sine';o.frequency.setValueAtTime(freq,now+i*0.12);
            g.gain.setValueAtTime(0.4,now+i*0.12);
            g.gain.exponentialRampToValueAtTime(0.0001,now+i*0.12+1.5);
            o.connect(g);g.connect(c.destination);
            o.start(now+i*0.12);o.stop(now+i*0.12+1.5);
        });
    }else if(k==='chime_cascade'){
        const notes=[659.25, 783.99, 987.77, 1174.66, 1318.51];
        notes.forEach((freq,i)=>{
            const o=c.createOscillator(),g=c.createGain();
            o.type='sine';o.frequency.setValueAtTime(freq,now+i*0.11);
            g.gain.setValueAtTime(0.001,now+i*0.11);
            g.gain.linearRampToValueAtTime(0.28,now+i*0.11+0.02);
            g.gain.exponentialRampToValueAtTime(0.0001,now+i*0.11+2.2);
            o.connect(g);g.connect(c.destination);
            o.start(now+i*0.11);o.stop(now+i*0.11+2.2);
        });
    }else if(k==='celeste_melody'){
        const notes=[523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq,i)=>{
            const o=c.createOscillator(),g=c.createGain();
            o.type='sine';o.frequency.setValueAtTime(freq,now+i*0.14);
            g.gain.setValueAtTime(0.001,now+i*0.14);
            g.gain.linearRampToValueAtTime(0.25,now+i*0.14+0.03);
            g.gain.exponentialRampToValueAtTime(0.0001,now+i*0.14+1.8);
            o.connect(g);g.connect(c.destination);
            o.start(now+i*0.14);o.stop(now+i*0.14+1.8);
        });
    }else if(k==='starlight_chords'){
        const notes=[349.23, 440.00, 523.25, 659.25];
        notes.forEach((freq,i)=>{
            const o=c.createOscillator(),g=c.createGain();
            o.type='triangle';o.frequency.setValueAtTime(freq,now+i*0.16);
            g.gain.setValueAtTime(0.001,now+i*0.16);
            g.gain.linearRampToValueAtTime(0.2,now+i*0.16+0.04);
            g.gain.exponentialRampToValueAtTime(0.0001,now+i*0.16+2.2);
            o.connect(g);g.connect(c.destination);
            o.start(now+i*0.16);o.stop(now+i*0.16+2.2);
        });
    }else if(k==='aureate_fanfare'){
        const notes=[440.00, 554.37, 659.25, 880.00];
        notes.forEach((freq,i)=>{
            const o=c.createOscillator(),g=c.createGain();
            o.type='sawtooth';
            const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(1200,now);
            o.frequency.setValueAtTime(freq,now+i*0.12);
            g.gain.setValueAtTime(0.001,now+i*0.12);
            g.gain.linearRampToValueAtTime(0.18,now+i*0.12+0.02);
            g.gain.exponentialRampToValueAtTime(0.0001,now+i*0.12+1.5);
            o.connect(filter);filter.connect(g);g.connect(c.destination);
            o.start(now+i*0.12);o.stop(now+i*0.12+1.5);
        });
    }else if(k==='luminous_bell'){
        [880.00, 1760.00, 2640.00].forEach((freq,idx)=>{
            const o=c.createOscillator(),g=c.createGain();
            o.type='sine';o.frequency.setValueAtTime(freq,now);
            g.gain.setValueAtTime(idx===0?0.35:0.1,now);
            g.gain.exponentialRampToValueAtTime(0.0001,now+3.0);
            o.connect(g);g.connect(c.destination);
            o.start(now);o.stop(now+3.0);
        });
    }else if(k==='lullaby_arpeggio'){
        const notes=[392.00, 493.88, 587.33, 783.99, 659.25];
        notes.forEach((freq,i)=>{
            const o=c.createOscillator(),g=c.createGain();
            o.type='sine';o.frequency.setValueAtTime(freq,now+i*0.18);
            g.gain.setValueAtTime(0.001,now+i*0.18);
            g.gain.linearRampToValueAtTime(0.22,now+i*0.18+0.04);
            g.gain.exponentialRampToValueAtTime(0.0001,now+i*0.18+2.0);
            o.connect(g);g.connect(c.destination);
            o.start(now+i*0.18);o.stop(now+i*0.18+2.0);
        });
    }
}

function playPomoSound(key,overrideRepeats){
    if(audioMuted)return;
    try{
        const c=getAudioContext(),k=key||userSettings.pomoSound||'zen_bowl';
        const repeats=overrideRepeats??parseInt(userSettings.pomoSoundRepeats??3);
        for(let r=0;r<repeats;r++){
            playSingleToneBurst(k,c,c.currentTime+(r*3.2));
        }
    }catch(e){}
}

function previewPomoSound(){
    const sel=$('setting-pomo-sound')?.value||'zen_bowl';
    const repeats=parseInt($('setting-pomo-repeats')?.value||3);
    playPomoSound(sel,repeats);
}

function playTone(type){
    if(audioMuted)return;
    try{
        const c=getAudioContext(),o=c.createOscillator(),g=c.createGain();
        o.connect(g);g.connect(c.destination);o.type='sine';
        o.frequency.setValueAtTime(type==='save'?600:(type==='delete'?400:880),c.currentTime);
        if(type==='save')o.frequency.exponentialRampToValueAtTime(1200,c.currentTime+0.1);
        else if(type==='delete')o.frequency.exponentialRampToValueAtTime(200,c.currentTime+0.1);
        g.gain.setValueAtTime(0.25,c.currentTime);g.gain.linearRampToValueAtTime(0.001,c.currentTime+0.15);
        o.start();o.stop(c.currentTime+0.15);
    }catch(e){}
}

function requestNotificationPermission(){if("Notification"in window&&Notification.permission==="default")Notification.requestPermission()}
function triggerDesktopNotification(t,b){if("Notification"in window&&Notification.permission==="granted")new Notification(t,{body:b,icon:"https://fav.farm/✨"})}
async function toggleAudioMute(){
    audioMuted=!audioMuted;
    userSettings.audioMuted=audioMuted;
    if($('audio-toggle-btn'))$('audio-toggle-btn').innerText=audioMuted?"🔇":"🔊";
    if(loggedInUser){
        try{await db.collection('settings').doc(loggedInUser).set({audioMuted},{merge:true})}catch(e){}
    }
}

