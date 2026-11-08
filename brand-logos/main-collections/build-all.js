// Rebuilds the Introvert Here, SHHH. and PER CONTRACT. logos (wide + stacked) as sharp
// 4500x1500 PNGs with a see-through panel. Positions measured from Barry's originals.
const fs=require('fs');const {chromium}=require('playwright');
const dir=process.argv[2];
const fig=n=>'data:image/png;base64,'+fs.readFileSync(`${dir}/fig-${n}.png`).toString('base64');
const COL={ih:'#FFFFFF',sh:'#A8CEA8',pc:'#A7322D'};
function rr(X,Y,W,H,R){return `M${X+R},${Y} H${X+W-R} A${R},${R} 0 0 1 ${X+W},${Y+R} V${Y+H-R} A${R},${R} 0 0 1 ${X+W-R},${Y+H} H${X+R} A${R},${R} 0 0 1 ${X},${Y+H-R} V${Y+R} A${R},${R} 0 0 1 ${X+R},${Y} Z`;}
function ring(c,[x,y,w,h],ro,[t,r,b,l],ri,holes='',mask=''){return `<path fill="${c}" fill-rule="evenodd" ${mask?`mask="url(#${mask})"`:''} d="${rr(x,y,w,h,ro)} ${rr(x+l,y+t,w-l-r,h-t-b,ri)} ${holes}"/>`;}
const svg=inner=>`<svg width="4500" height="1500" style="position:absolute;left:0;top:0">${inner}</svg>`;
// Figures are placed by the centre of their legs (so arm poses don't shift them), a little left of
// halfway between the inside of the frame and the N.
const LEGS={ih:0.499,sh:0.479,pc:0.491};
const figImg=(n,top,bottom,cx)=>`<img class="fig" data-cx="${cx}" data-legs="${LEGS[n]}" src="${fig(n)}" style="position:absolute;top:${top}px;height:${bottom-top}px">`;
const line=(txt,x,r,cap,capb)=>`<div class="t" data-x="${x}" data-r="${r}" data-cap="${cap}" data-capb="${capb}">${txt}</div>`;
// SHHH. tab: mint outline with a see-through inside, tilted. tabMask() cuts the frame away inside it.
const tab=(x,y,w,h,bw,rot,fs)=>`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:rotate(${rot}deg);border:${bw}px solid ${COL.sh};border-radius:${bw*2}px;display:flex;align-items:center;justify-content:center">
 <span style="font:700 ${fs}px Montserrat;color:#fff;letter-spacing:.01em;line-height:1;padding-top:${fs*0.08}px">SHHH.</span></div>`;
const tabMask=(id,x,y,w,h,bw,rot)=>`<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="4500" height="1500"><rect width="4500" height="1500" fill="#fff"/>
 <rect x="${x+bw}" y="${y+bw}" width="${w-2*bw}" height="${h-2*bw}" rx="${bw}" fill="#000" transform="rotate(${rot} ${x+w/2} ${y+h/2})"/></mask></defs>`;
// PER CONTRACT. stamp: white outer border, thin inner white line, black inside, typewriter text
const stamp=(x,y,w,h,rot,fs)=>`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:rotate(${rot}deg);background:#000;border:27px solid #fff;border-radius:22px;padding:10px">
 <div style="width:100%;height:100%;border:13px solid #fff;border-radius:8px;display:flex;align-items:center;justify-content:center">
 <span style="font:700 ${fs}px 'Courier Prime';color:#fff;white-space:nowrap">PER CONTRACT.</span></div></div>`;
// Introvert Here stacked: a see-through pill cut out of the bottom band, with three white dots
const PILL_HOLE=rr(2696,1022,564,99,49.5);
const dots=[2820,2982,3144].map(cx=>`<div style="position:absolute;left:${cx-24.5}px;top:${1072-24.5}px;width:49px;height:49px;border-radius:50%;background:#fff"></div>`).join('');
const STD={
 wide:{frame:[117,433,4266,634],ro:165,th:[86,86,86,86],ri:80,fig:[547,951,332],text:['NTROVERT HERE...',474,4155,615,891]},
 stacked:{frame:[1163,38,2176,1124],ro:60,th:[72,72,179,72],ri:34,fig:[186,911,1397],l1:['NTROVERT',1583,3196,213,415],l2:['HERE',1576,3171,508,910]},
};
const wideBase=(c,f,extra='',holes='',mask='')=>svg(extra+ring(COL[c],STD.wide.frame,STD.wide.ro,STD.wide.th,STD.wide.ri,holes,mask))+figImg(f,...STD.wide.fig)+line(...STD.wide.text);
const stackBase=(c,f,extra='',holes='',mask='')=>svg(extra+ring(COL[c],STD.stacked.frame,STD.stacked.ro,STD.stacked.th,STD.stacked.ri,holes,mask))+figImg(f,...STD.stacked.fig)+line(...STD.stacked.l1)+line(...STD.stacked.l2);
const L={
 'introvert-here-wide': wideBase('ih','ih'),
 'introvert-here-stacked': stackBase('ih','ih','',PILL_HOLE)+dots,
 'shhh-wide': wideBase('sh','sh',tabMask('mw',3753,858,650,290,50,-3),'','mw')+tab(3753,858,650,290,50,-3,150),
 'shhh-stacked': stackBase('sh','sh',tabMask('ms',2700,940,600,272,50,-3),'','ms')+tab(2700,940,600,272,50,-3,124),
 'per-contract-wide': wideBase('pc','pc')+stamp(3090,1081,1262,236,-3,118),
 'per-contract-stacked': stackBase('pc','pc')+stamp(2290,978,985,192,-3,92),
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
   document.querySelectorAll('img.fig').forEach(im=>{const w=im.getBoundingClientRect().width; im.style.left=(+im.dataset.cx - (+im.dataset.legs)*w)+'px';});
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
