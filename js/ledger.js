// ============================================================================
// AUREUM — Crucible & Sanctuary Logging + History Ledgers
// ============================================================================

async function logWork(e){
    e.preventDefault();
    const T=parseFloat($('work-time').value),R=parseFloat($('work-results').value),E=parseFloat($('work-effort').value);
    const softCap=userSettings.dailySoftCap||4,baseRate=(R+E)/2;
    const normH=Math.min(T,Math.max(0,softCap-currentTodayHoursLogged)),overH=T-normH;
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

    await db.collection('logs').add({type:'work',user:loggedInUser,hours:T,normalHours:normH,overCapHours:overH,results:R,effort:E,points:pts,timestamp:firebase.firestore.FieldValue.serverTimestamp()});
    showToast({title:'⚗️ Work Saved',subtitle:`<strong>+฿${Math.round(netCashEarned).toLocaleString()} Earned</strong> (${T}h @ Lvl ${R}/${E})`,icon:'🎯',tier:'gold',originEvt:e});
    loadUserData();
}

async function logWorkout(e){
    e.preventDefault();
    const hrs=parseFloat($('workout-time').value),strain=parseInt($('workout-strain').value);
    await db.collection('logs').add({type:'workout',user:loggedInUser,hours:hrs,strain:strain,timestamp:firebase.firestore.FieldValue.serverTimestamp()});
    showToast({title:'🏃 Fitness Logged',subtitle:`${hrs}h saved at Level ${strain} effort!`,icon:'🔥',tier:'gold',originEvt:e});
    loadUserData();
}

async function logHealth(e){
    e.preventDefault();
    const lvl=parseInt($('health-level').value),note=$('health-note').value.trim();
    await db.collection('logs').add({type:'health',user:loggedInUser,level:lvl,note:note,timestamp:firebase.firestore.FieldValue.serverTimestamp()});
    showToast({title:'🍨 Snack Logged',subtitle:`Level ${lvl} treat recorded${note?`: "${note}"`:''}`,icon:'🍦',tier:'emerald',originEvt:e});
    $('health-note').value='';loadUserData();
}

async function logChore(e){
    e.preventDefault();
    const hrs=parseFloat($('chore-time').value),note=$('chore-note').value.trim();
    await db.collection('logs').add({type:'chore',user:loggedInUser,hours:hrs,note:note,timestamp:firebase.firestore.FieldValue.serverTimestamp()});
    showToast({title:'🧹 Chore Logged',subtitle:`${hrs}h saved${note?`: "${note}"`:''}`,icon:'🏰',tier:'silver',originEvt:e});
    $('chore-note').value='';loadUserData();
}

async function deleteLogEntry(id){
    if(loggedInUser===viewedUser){
        await db.collection('logs').doc(id).delete();playTone('delete');
        showToast({title:'🗑️ Entry Deleted',subtitle:'Record removed.',icon:'📜',tier:'bronze',duration:2500});
    }
}


function populateAndFilterLedger(){
    const select=$('ledger-month-select');if(!select)return;
    const prev=select.value||'current',monthSet=new Set(),now=new Date(),curKey=`${now.getFullYear()}-${now.getMonth()}`;
    for(let i=0;i<currentRawLogsCache.length;i++){
        const l=currentRawLogsCache[i];
        const d=getLogDate(l);monthSet.add(`${d.getFullYear()}-${d.getMonth()}`);
    }
    monthSet.add(curKey);
    const names=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let opts=`<option value="current">Current Month (${names[now.getMonth()]} ${now.getFullYear()})</option>`;
    Array.from(monthSet).sort().reverse().forEach(k=>{if(k!==curKey){const [y,m]=k.split('-');opts+=`<option value="${k}">${names[m]} ${y}</option>`}});
    opts+=`<option value="all">All Time Records</option>`;
    select.innerHTML=opts;select.value=Array.from(select.options).some(o=>o.value===prev)?prev:'current';
    applyLedgerFilter();
}

function applyLedgerFilter(){
    const val=$('ledger-month-select')?.value||'current',now=new Date();let logs=currentRawLogsCache;
    if(val==='current')logs=currentRawLogsCache.filter(l=>getLogDate(l).getFullYear()===now.getFullYear()&&getLogDate(l).getMonth()===now.getMonth());
    else if(val!=='all'){const [y,m]=val.split('-').map(Number);logs=currentRawLogsCache.filter(l=>getLogDate(l).getFullYear()===y&&getLogDate(l).getMonth()===m)}
    renderLedgerLists(logs);
}

function renderSegmentedBar(val,max=5,activeColor='#10b981'){
    let bars='';
    for(let i=1;i<=max;i++){
        bars+=i<=val?`<span class="inline-block w-2.5 h-1.5 rounded-sm mr-0.5" style="background-color: ${activeColor};"></span>`:`<span class="inline-block w-2.5 h-1.5 rounded-sm mr-0.5 bg-slate-800 border border-slate-700/60"></span>`;
    }
    return bars;
}

function renderLedgerLists(logs){
    const isSelf=loggedInUser===viewedUser;
    const render=(id,items,empty,fmt)=>{
        const el=$(id);
        if(items.length===0){el.innerHTML=`<div class="text-xs text-slate-500 py-2">${empty}</div>`}
        else{
            el.innerHTML=items.map(l=>`<div class="p-2.5 bg-slate-800/70 border border-slate-700/60 rounded-xl text-xs space-y-1.5"><div class="flex justify-between items-center text-slate-400"><span class="text-[10px] text-slate-500 font-medium">${getLogDate(l).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>${isSelf?`<button onclick="deleteLogEntry('${l.id}')" class="text-[10px] text-red-400 font-bold px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20">Delete</button>`:''}</div>${fmt(l)}</div>`).join('');
        }
    };

    const w=logs.filter(l=>l.type==='work'),s=logs.filter(l=>['workout','chore','health'].includes(l.type)),d=logs.filter(l=>l.type==='diary');
    $('ledger-count-work').innerText=`${w.length} entries`;
    $('ledger-count-sanctuary').innerText=`${s.length} entries`;
    $('ledger-count-diary').innerText=`${d.length} entries`;

    render('ledger-list-work',w,'No work logs.',l=>{
        const q=l.results||3,e=l.effort||3,qBars=renderSegmentedBar(q,5,'#10b981'),eBars=renderSegmentedBar(e,5,'#f59e0b');
        const earnedCash=Math.round((l.points||0)*(userSettings.monthlyCash/((userSettings.weeklyHours||10)*12)));
        const isOverCap=(l.overCapHours||0)>0;
        return `<div class="space-y-1.5"><div class="flex justify-between items-center font-bold"><span class="text-slate-100 font-mono">⚗️ ${l.hours}h Work Session</span><span class="text-emerald-400 font-mono">+฿${earnedCash.toLocaleString()}</span></div><div class="flex items-center justify-between text-[11px] text-slate-400 pt-0.5"><div class="flex items-center gap-3"><span class="flex items-center gap-1 font-mono text-[10px]"><span class="text-slate-500 font-bold uppercase tracking-wider">PWR</span>${qBars}</span><span class="flex items-center gap-1 font-mono text-[10px]"><span class="text-slate-500 font-bold uppercase tracking-wider">EFF</span>${eBars}</span></div>${isOverCap?'<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">🍵 Soft Cap</span>':''}</div></div>`;
    });

    render('ledger-list-sanctuary',s,'No entries found.',l=>{
        if(l.type==='workout')return `<div class="flex justify-between font-medium"><span class="text-amber-300">🏃 Fitness (${l.hours}h)</span><span class="text-slate-400 font-bold">Effort Lvl ${l.strain||3}</span></div>`;
        if(l.type==='chore')return `<div class="flex justify-between font-medium"><span class="text-sky-300">🧹 House Chore (${l.hours}h)</span><span class="text-slate-300 italic truncate max-w-[100px]">${l.note||'No note'}</span></div>`;
        return `<div class="flex justify-between font-medium"><span class="text-emerald-300">🍨 Snack (Lvl ${l.level})</span><span class="text-slate-300 italic truncate max-w-[100px]">${l.note||'No note'}</span></div>`;
    });

    render('ledger-list-diary',d,'No reflections.',l=>`<div class="text-slate-200 italic leading-snug break-words">"${l.text}"</div>`);
}
