// Rebuilds the Introvert Here, SHHH. and PER CONTRACT. logos (wide + stacked) as sharp
// 4500x1500 PNGs with a see-through panel. Positions measured from Barry's originals.
const fs=require('fs');const {chromium}=require('playwright');
const dir=process.argv[2];
const fig=n=>'data:image/png;base64,'+fs.readFileSync(`${dir}/fig-${n}.png`).toString('base64');
const COL={ih:'#FFFFFF',sh:'#A8CEA8',pc:'#A7322D'};
function rr(X,Y,W,H,R){return `M${X+R},${Y} H${X+W-R} A${R},${R} 0 0 1 ${X+W},${Y+R} V${Y+H-R} A${R},${R} 0 0 1 ${X+W-R},${Y+H} H${X+R} A${R},${R} 0 0 1 ${X},${Y+H-R} V${Y+R} A${R},${R} 0 0 1 ${X+R},${Y} Z`;}
function ring(c,[x,y,w,h],ro,[t,r,b,l],ri){return `<path fill="${c}" fill-rule="evenodd" d="${rr(x,y,w,h,ro)} ${rr(x+l,y+t,w-l-r,h-t-b,ri)}"/>`;}
const svg=inner=>`<svg width="4500" height="1500" style="position:absolute;left:0;top:0">${inner}</svg>`;
const figImg=(n,top,bottom,right)=>`<img class="fig" data-right="${right}" src="${fig(n)}" style="position:absolute;top:${top}px;height:${bottom-top}px">`;
const line=(txt,x,r,cap,capb)=>`<div class="t" data-x="${x}" data-r="${r}" data-cap="${cap}" data-capb="${capb}">${txt}</div>`;
// SHHH. tab: mint rounded label with black inside, tilted; drawn under the frame so the frame band covers its top
const tab=(x,y,w,h,bw,rot,fs,tx)=>`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:rotate(${rot}deg);background:${COL.sh};border-radius:${bw*2}px;padding:${bw}px">
 <div style="width:100%;height:100%;background:#000;border-radius:${bw*1.15}px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:${tx}px">
 <span style="font:700 ${fs}px Montserrat;color:#fff;letter-spacing:.01em">SHHH.</span></div></div>`;
// PER CONTRACT. stamp: white outer border, thin inner white line, black inside, typewriter text
const stamp=(x,y,w,h,rot,fs)=>`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:rotate(${rot}deg);background:#000;border:27px solid #fff;border-radius:22px;padding:10px">
 <div style="width:100%;height:100%;border:13px solid #fff;border-radius:8px;display:flex;align-items:center;justify-content:center">
 <span style="font:700 ${fs}px 'Courier Prime';color:#fff;white-space:nowrap">PER CONTRACT.</span></div></div>`;
// Introvert Here stacked: black pill with three white dots in the bottom band
const pill=`<div style="position:absolute;left:2696px;top:1022px;width:564px;height:99px;border-radius:50px;background:#000"></div>`+
 [2820,2982,3144].map(cx=>`<div style="position:absolute;left:${cx-24.5}px;top:${1072-24.5}px;width:49px;height:49px;border-radius:50%;background:#fff"></div>`).join('');
const L={
 'introvert-here-wide': svg(ring(COL.ih,[117,433,4266,634],165,[86,86,86,86],80))+figImg('ih',547,951,420)+line('NTROVERT HERE...',474,4155,615,891),
 'introvert-here-stacked': svg(ring(COL.ih,[1163,38,2176,1124],60,[72,72,179,72],34))+pill+figImg('ih',186,911,1533)+line('NTROVERT',1583,3196,213,415)+line('HERE',1576,3171,508,910),
 'shhh-wide': tab(3594,770,815,483,60,-3,190,40)+svg(ring(COL.sh,[149,207,4268,634],165,[85,85,85,85],80))+figImg('sh',324,734,461)+line('NTROVERT HERE...',508,4189,388,666),
 'shhh-stacked': svg(ring(COL.sh,[1124,37,2177,1125],60,[72,73,177,73],34))+tab(2595,848,693,333,59,-3,140,34)+figImg('sh',174,917,1510)+line('NTROVERT',1545,3159,213,417)+line('HERE',1538,3126,507,910),
 'per-contract-wide': svg(ring(COL.pc,[117,423,4266,653],170,[96,96,96,96],80))+figImg('pc',542,962,438)+line('NTROVERT HERE...',474,4155,615,891)+stamp(3090,1090,1262,236,-3,118),
 'per-contract-stacked': svg(ring(COL.pc,[1164,42,2173,1117],60,[67,70,172,70],34))+figImg('pc',196,917,1543)+line('NTROVERT',1584,3193,215,415)+line('HERE',1577,3168,510,911)+stamp(2290,975,985,192,-3,92),
};
const css=`*{margin:0;padding:0;box-sizing:border-box}html,body{width:4500px;height:1500px;background:transparent;overflow:hidden}
.t{position:absolute;font-family:'Montserrat';font-weight:700;color:#fff;white-space:nowrap;line-height:1}`;
(async()=>{
 const b=await chromium.launch(); const only=process.argv[3];
 for(const [name,body] of Object.entries(L)){
  if(only&&!name.startsWith(only))continue;
  const p=await b.newPage({viewport:{width:4500,height:1500}});
  await p.setContent(`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700&family=Courier+Prime:wght@700&display=block" rel="stylesheet"><style>${css}</style></head><body>${body}</body></html>`,{waitUntil:'networkidle'});
  await p.evaluate(async()=>{await document.fonts.load("700 100px Montserrat");await document.fonts.load("700 100px 'Courier Prime'");await document.fonts.ready;
   document.querySelectorAll('img.fig').forEach(im=>{const w=im.getBoundingClientRect().width; im.style.left=(+im.dataset.right-w)+'px';});
   const c=document.createElement('canvas').getContext('2d');
   document.querySelectorAll('.t').forEach(el=>{
    const x=+el.dataset.x,r=+el.dataset.r,cap=+el.dataset.cap,capb=+el.dataset.capb,txt=el.textContent;
    c.font='700 100px Montserrat'; const hh=c.measureText('H').actualBoundingBoxAscent; // cap height at 100px
    const fs=(capb-cap)/hh*100; el.style.fontSize=fs+'px'; c.font=`700 ${fs}px Montserrat`;
    const m=c.measureText(txt); const ink=m.actualBoundingBoxLeft+m.actualBoundingBoxRight;
    const ls=((r-x)-ink)/(txt.length-1); el.style.letterSpacing=ls+'px';
    el.style.left=(x+m.actualBoundingBoxLeft)+'px';
    // line-height 1: the em box top sits (fs - (fontAscent+fontDescent))/2 above the font ascent line
    const fa=m.fontBoundingBoxAscent, fd=m.fontBoundingBoxDescent;
    el.style.top=(cap - (fa - c.measureText('H').actualBoundingBoxAscent) - (fs-(fa+fd))/2)+'px';
   });});
  await p.screenshot({path:`${dir}/${name}.png`,omitBackground:true}); await p.close(); console.log('made',name);
 }
 await b.close();
})();
