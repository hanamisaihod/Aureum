// ============================================================================
// AUREUM — Particle Canvas Engine, Background Patterns, Themes & Cursors
// ============================================================================

const canvas=$('fx-canvas'),ctx=canvas.getContext('2d');
const MAX_PARTICLES=150;
const particlePool=Array.from({length:MAX_PARTICLES},()=>({x:0,y:0,vx:0,vy:0,size:0,color:'',alpha:0,decay:0,active:false}));
let isFxAnimating=false;

function resizeFxCanvas(){canvas.width=window.innerWidth;canvas.height=window.innerHeight}
window.addEventListener('resize',resizeFxCanvas,{passive:true});resizeFxCanvas();

function spawnParticleBurst(x,y){
    const intensity=(userSettings.particleIntensity??15)/100;if(intensity<=0)return;
    const colors=['#fef08a','#f59e0b','#b45309','#38bdf8','#10b981','#a855f7'];
    const count=Math.min(MAX_PARTICLES,Math.max(1,Math.round(35*intensity)));
    let spawned=0;
    for(let i=0;i<MAX_PARTICLES&&spawned<count;i++){
        const p=particlePool[i];
        if(!p.active){
            const angle=Math.random()*Math.PI*2,speed=(Math.random()*5+1.5)*(0.4+intensity*0.6);
            p.x=x;p.y=y;p.vx=Math.cos(angle)*speed;p.vy=Math.sin(angle)*speed-1.0;
            p.size=(Math.random()*3.5+2)*(0.5+intensity*0.5);p.color=colors[(Math.random()*colors.length)|0];
            p.alpha=1;p.decay=Math.random()*0.03+0.02;p.active=true;spawned++;
        }
    }
    if(!isFxAnimating&&spawned>0){isFxAnimating=true;animateParticles()}
}

function animateParticles(){
    let activeCount=0;ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<MAX_PARTICLES;i++){
        const p=particlePool[i];
        if(p.active){
            p.x+=p.vx;p.y+=p.vy;p.vy+=0.12;p.alpha-=p.decay;
            if(p.alpha<=0){p.active=false}
            else{
                activeCount++;ctx.save();ctx.globalAlpha=p.alpha;ctx.fillStyle=p.color;
                ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();ctx.restore();
            }
        }
    }
    if(activeCount>0){requestAnimationFrame(animateParticles)}else{isFxAnimating=false}
}

function applyBackgroundPattern(pattern, opacity){
    const layer=$('bg-pattern-layer');if(!layer)return;
    const op=(opacity??20)/100;layer.style.opacity=op;
    const currentTheme=document.body.getAttribute('data-theme')||userSettings.userTheme||'gold';
    const colorHex=THEME_PATTERN_COLORS[currentTheme]||'%23f59e0b';
    let bgStyle='';
    if(pattern==='dots'||pattern==='dotmatrix'){
        bgStyle=`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='2' fill='${colorHex}' opacity='0.5'/%3E%3C/svg%3E")`;
    }else if(pattern==='grid'||pattern==='blueprint'){
        bgStyle=`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cg fill='none' stroke='${colorHex}' stroke-width='1'%3E%3Cpath d='M0 10h40M0 20h40M0 30h40M10 0v40M20 0v40M30 0v40' stroke-dasharray='2 2' opacity='0.4'/%3E%3Crect x='0' y='0' width='40' height='40' stroke-width='1' opacity='0.7'/%3E%3C%g%3E%3C%svg%3E")`;
    }else if(pattern==='hex'||pattern==='isometric'){
        bgStyle=`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='104' viewBox='0 0 60 104'%3E%3Cpath d='M30 0l30 17.32v34.64L30 69.28 0 51.96V17.32zm0 104l30-17.32V51.96L30 34.64 0 51.96v34.64z' fill='none' stroke='${colorHex}' stroke-width='1' opacity='0.45'/%3E%3C%svg%3E")`;
    }else if(pattern==='stars'||pattern==='starfield'){
        bgStyle=`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Ccircle cx='10' cy='10' r='1.2' fill='${colorHex}' opacity='0.6'/%3E%3Ccircle cx='50' cy='30' r='1.8' fill='${colorHex}' opacity='0.8'/%3E%3Ccircle cx='20' cy='60' r='1.5' fill='${colorHex}' opacity='0.7'/%3E%3C%svg%3E")`;
    }else if(pattern==='diagonal'){
        const rawHex=colorHex.replace('%23','#');
        bgStyle=`repeating-linear-gradient(45deg, ${rawHex}25, ${rawHex}25 10px, transparent 10px, transparent 20px)`;
    }
    layer.style.background=bgStyle;
}

function applyThemeToBody(t){
    const targetTheme=t||'gold';document.body.setAttribute('data-theme',targetTheme);
    applyBackgroundPattern(userSettings.bgPattern, userSettings.bgOpacity);
}
function applyCursorToBody(c){document.body.setAttribute('data-cursor',c||'default')}

function applyDynamicAvatarGlow(el,hours){
    const softCap=userSettings.dailySoftCap||4;
    if(hours<=0){el.style.boxShadow="0 0 0 2px rgba(100, 116, 139, 0.4)";el.style.opacity="0.75";return}
    el.style.opacity="1";
    if(hours<2.0){
        const p=hours/2.0,r=Math.round(59*p),g=Math.round(130*p+100*(1-p)),b=246,blur=Math.round(10+p*12);
        el.style.boxShadow=`0 0 ${blur}px ${Math.round(2+p*4)}px rgba(${r}, ${g}, ${b}, ${0.5+p*0.35})`;
    }else if(hours<softCap){
        const p=(hours-2.0)/(softCap-2.0),r=Math.round(16+(245-16)*p),g=Math.round(185+(158-185)*p),b=Math.round(129+(11-129)*p),blur=Math.round(20+p*8);
        el.style.boxShadow=`0 0 ${blur}px ${Math.round(4+p*3)}px rgba(${r}, ${g}, ${b}, ${0.75+p*0.2})`;
    }else{
        el.style.boxShadow="0 0 28px 8px rgba(245, 158, 11, 0.95)";
    }
}
