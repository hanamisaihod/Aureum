// ============================================================================
// AUREUM — Scratchpad Tasks / Todo List Engine
// ============================================================================

async function syncTodosToFirestore(list){
    if(loggedInUser!==viewedUser)return;
    userSettings.scratchpadTodos=list;renderTodoList();
    try{await db.collection('settings').doc(loggedInUser).set({scratchpadTodos:list},{merge:true})}catch(e){}
}

function addTodoItem(e){
    if(e)e.preventDefault();if(loggedInUser!==viewedUser)return;
    const input=$('todo-input');if(!input)return;
    const text=input.value.trim();if(!text)return;
    const list=[...(userSettings.scratchpadTodos||[])];
    list.push({id:Date.now().toString(),text,done:false});
    input.value='';playTone('save');syncTodosToFirestore(list);
}

function toggleTodoStatus(id){
    if(loggedInUser!==viewedUser)return;
    const list=[...(userSettings.scratchpadTodos||[])];
    const item=list.find(t=>t.id===id);
    if(item){item.done=!item.done;playTone(item.done?'save':'delete');syncTodosToFirestore(list)}
}

function removeTodoItem(id,e){
    if(e)e.stopPropagation();if(loggedInUser!==viewedUser)return;
    const list=(userSettings.scratchpadTodos||[]).filter(t=>t.id!==id);playTone('delete');syncTodosToFirestore(list);
}

function clearCompletedTodos(){
    if(loggedInUser!==viewedUser)return;
    const list=(userSettings.scratchpadTodos||[]).filter(t=>!t.done);playTone('delete');syncTodosToFirestore(list);
}

function renderTodoList(){
    const activeListEl=$('todo-active-list'),doneListEl=$('todo-completed-list');
    const isSelf=(loggedInUser===viewedUser),todoData=isSelf?(userSettings.scratchpadTodos||[]):(spectatorSettings?.scratchpadTodos||[]);
    const activeItems=[],doneItems=[];
    for(let i=0;i<todoData.length;i++){if(todoData[i].done)doneItems.push(todoData[i]);else activeItems.push(todoData[i])}
    
    if(activeListEl&&doneListEl){
        $('todo-count-active').innerText=`${activeItems.length} Active`;$('todo-count-done').innerText=`${doneItems.length} Done`;
        const cursorClass=isSelf?"cursor-pointer":"cursor-default";
        activeListEl.innerHTML=activeItems.length===0?'<div class="text-xs text-slate-500 italic py-2 text-center">No active tasks.</div>':activeItems.map(t=>`<div ${isSelf?`onclick="toggleTodoStatus('${t.id}')"`:''} class="todo-item ${cursorClass} p-2.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 rounded-xl flex items-center justify-between gap-2 text-xs text-slate-200 select-none"><div class="flex items-center gap-2.5 min-w-0 flex-1"><span class="w-4 h-4 rounded border border-slate-600 flex items-center justify-center shrink-0"></span><span class="font-semibold text-xs leading-relaxed break-words">${t.text}</span></div>${isSelf?`<button onclick="removeTodoItem('${t.id}', event)" class="text-slate-500 hover:text-red-400 px-1.5 py-0.5 rounded text-xs font-bold shrink-0">×</button>`:''}</div>`).join('');
        doneListEl.innerHTML=doneItems.length===0?'<div class="text-xs text-slate-500 italic py-2 text-center">No completed tasks.</div>':doneItems.map(t=>`<div ${isSelf?`onclick="toggleTodoStatus('${t.id}')"`:''} class="todo-item done ${cursorClass} p-2.5 bg-slate-900/60 border border-slate-800/80 rounded-xl flex items-center justify-between gap-2 text-xs text-slate-400 select-none"><div class="flex items-center gap-2.5 min-w-0 flex-1"><span class="w-4 h-4 rounded theme-accent-bg text-slate-950 flex items-center justify-center shrink-0 font-bold text-[10px]">✓</span><span class="font-semibold text-xs leading-relaxed break-words">${t.text}</span></div>${isSelf?`<button onclick="removeTodoItem('${t.id}', event)" class="text-slate-500 hover:text-red-400 px-1.5 py-0.5 rounded text-xs font-bold shrink-0">×</button>`:''}</div>`).join('');
    }
}
