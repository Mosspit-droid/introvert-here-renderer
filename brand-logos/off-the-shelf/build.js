const fs=require('fs');const {chromium}=require('playwright');
const dir=process.argv[2];
const fig='data:image/png;base64,'+fs.readFileSync(dir+'/figure-knockout.png').toString('base64');
const GOLD='#BC9C22';
const parchment=(w,h,rot,fs)=>`
<div class="strap" style="width:${w}px;height:${h}px;transform:rotate(${rot}deg)">
 <svg width="${w}" height="${h}" style="position:absolute;inset:0">
  <defs>
   <filter id="p${w}" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="4" seed="7" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.93  0 0 0 0 0.88  0 0 0 0 0.76  0 0 0 -0.9 0.75" result="blot"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.45  0 0 0 0 0.3  0 0 0 0.10 0" result="grain"/>
    <feMerge><feMergeNode in="blot"/><feMergeNode in="grain"/></feMerge>
   </filter>
   <radialGradient id="v${w}" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="#7a5a2a" stop-opacity="0"/><stop offset="100%" stop-color="#7a5a2a" stop-opacity="0.35"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#F1E6C8"/>
  <rect width="${w}" height="${h}" filter="url(#p${w})" opacity="0.55"/>
  <rect width="${w}" height="${h}" fill="url(#v${w})"/>
 </svg>
 <span style="font-size:${fs}px">OFF THE SHELF.</span>
</div>`;
const METAL=process.argv[3]==="metal";
const DEFS=METAL?`<svg width="0" height="0" style="position:absolute"><defs>
 <filter id="goldleaf" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="3" seed="11" result="big"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="5" result="fine"/>
  <feComposite in="big" in2="fine" operator="arithmetic" k2="0.7" k3="0.3" result="mix"/>
  <feColorMatrix in="mix" type="matrix" values="0.85 0 0 0 0.36  0.66 0 0 0 0.24  0.22 0 0 0 0.04  0 0 0 0 1" result="goldtex"/>
  <feGaussianBlur in="SourceAlpha" stdDeviation="9" result="ab"/>
  <feSpecularLighting in="ab" surfaceScale="7" specularConstant="1.1" specularExponent="22" lighting-color="#fff4c8" result="spec">
   <feDistantLight azimuth="225" elevation="48"/></feSpecularLighting>
  <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
  <feComposite in="goldtex" in2="SourceAlpha" operator="in" result="g1"/>
  <feComposite in="g1" in2="specIn" operator="arithmetic" k2="1" k3="0.45" result="lit0"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="1" seed="9" result="flk"/>
  <feColorMatrix in="flk" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 0 0 0 1.55" result="flakes"/>
  <feComposite in="flakes" in2="SourceAlpha" operator="in" result="flakesIn"/>
  <feComposite in="flakesIn" in2="lit0" operator="arithmetic" k1="0" k2="0.25" k3="1" result="lit"/>
  <feDropShadow in="lit" dx="0" dy="5" stdDeviation="6" flood-color="#000" flood-opacity="0.55"/>
 </filter>
 <filter id="silver" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.0015 0.35" numOctaves="2" seed="2" result="brush"/>
  <feColorMatrix in="brush" type="matrix" values="0.55 0 0 0 0.36  0.55 0 0 0 0.37  0.55 0 0 0 0.40  0 0 0 0 1" result="steel"/>
  <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="ab"/>
  <feSpecularLighting in="ab" surfaceScale="5" specularConstant="1" specularExponent="28" lighting-color="#ffffff" result="spec">
   <feDistantLight azimuth="225" elevation="50"/></feSpecularLighting>
  <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
  <feComposite in="steel" in2="SourceAlpha" operator="in" result="s1"/>
  <feComposite in="s1" in2="specIn" operator="arithmetic" k2="1" k3="0.4" result="lit"/>
  <feDropShadow in="lit" dx="0" dy="4" stdDeviation="5" flood-color="#000" flood-opacity="0.55"/>
 </filter>
</defs></svg>`:"";
const css=`*{margin:0;padding:0;box-sizing:border-box}
html,body{width:4500px;height:1500px;background:transparent;overflow:hidden}
.c{position:relative;width:4500px;height:1500px}
.frame{position:absolute}
.panel{position:absolute;background:#000}
.t{position:absolute;font-family:'Montserrat';font-weight:700;color:#fff;white-space:nowrap;line-height:1}
.strap{position:absolute;box-shadow:0 6px 14px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}
.strap span{position:relative;font-family:'Libre Baskerville';font-weight:700;color:#2B1D12;letter-spacing:.04em;white-space:nowrap}
img{position:absolute}
${METAL?'.t,img{filter:url(#silver)} path{filter:url(#goldleaf)}':''}`;
const wide=`<div class="c">
 <svg width="4500" height="1500" style="position:absolute;left:0;top:0"><path fill="#BC9C22" fill-rule="evenodd" d="M282,433 H4218 A165,165 0 0 1 4383,598 V902 A165,165 0 0 1 4218,1067 H282 A165,165 0 0 1 117,902 V598 A165,165 0 0 1 282,433 Z M283,519 H4217 A80,80 0 0 1 4297,599 V901 A80,80 0 0 1 4217,981 H283 A80,80 0 0 1 203,901 V599 A80,80 0 0 1 283,519 Z"/></svg>
 <img class="fig" data-cx="332" data-legs="0.495" src="${fig}" style="top:547px;height:404px">
 <div class="t" id="w1" data-x="474" data-r="4155" data-cap="615" data-capb="891">NTROVERT HERE...</div>
 <div style="position:absolute;left:3010px;top:956px">${parchment(1300,330,-2.5,118)}</div>
</div>`;
const stacked=`<div class="c">
 <svg width="4500" height="1500" style="position:absolute;left:0;top:0"><path fill="#BC9C22" fill-rule="evenodd" d="M1223,38 H3279 A60,60 0 0 1 3339,98 V1102 A60,60 0 0 1 3279,1162 H1223 A60,60 0 0 1 1163,1102 V98 A60,60 0 0 1 1223,38 Z M1269,110 H3233 A34,34 0 0 1 3267,144 V949 A34,34 0 0 1 3233,983 H1269 A34,34 0 0 1 1235,949 V144 A34,34 0 0 1 1269,110 Z"/></svg>
 <img class="fig" data-cx="1397" data-legs="0.495" src="${fig}" style="top:186px;height:725px">
 <div class="t" id="s1" data-x="1583" data-r="3196" data-cap="213" data-capb="415">NTROVERT</div>
 <div class="t" id="s2" data-x="1576" data-r="3171" data-cap="508" data-capb="910">HERE</div>
 <div style="position:absolute;left:2290px;top:963px">${parchment(1060,250,-2,96)}</div>
</div>`;
(async()=>{
 const b=await chromium.launch();
 for(const [name,body] of [['wide',wide],['stacked',stacked]]){
  const p=await b.newPage({viewport:{width:4500,height:1500}});
  await p.setContent(`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700&family=Libre+Baskerville:wght@700&display=block" rel="stylesheet"><style>${css}</style></head><body>${DEFS}${body}</body></html>`,{waitUntil:'networkidle'});
  await p.evaluate(async()=>{await document.fonts.ready;});
  // Fit each text line: cap top/bottom and left/right as measured from Barry's version.
  const info=await p.evaluate(()=>{
    document.querySelectorAll('img.fig').forEach(im=>{const w=im.getBoundingClientRect().width; im.style.left=(+im.dataset.cx - (+im.dataset.legs)*w)+'px';});
    const c=document.createElement('canvas').getContext('2d'); const out=[];
    document.querySelectorAll('.t').forEach(el=>{
      const x=+el.dataset.x,r=+el.dataset.r,cap=+el.dataset.cap,capb=+el.dataset.capb,txt=el.textContent;
      c.font='700 100px Montserrat'; const hh=c.measureText('H').actualBoundingBoxAscent;
      const fs=(capb-cap)/hh*100; el.style.fontSize=fs+'px'; c.font=`700 ${fs}px Montserrat`;
      const m=c.measureText(txt); const ink=m.actualBoundingBoxLeft+m.actualBoundingBoxRight;
      el.style.letterSpacing=((r-x)-ink)/(txt.length-1)+'px'; el.style.left=(x+m.actualBoundingBoxLeft)+'px';
      const fa=m.fontBoundingBoxAscent, fd=m.fontBoundingBoxDescent;
      el.style.top=(cap-(fa-c.measureText('H').actualBoundingBoxAscent)-(fs-(fa+fd))/2)+'px';
      out.push(txt);
    });
    return out;});
  console.log(name,JSON.stringify(info));
  await p.screenshot({path:`${dir}/off-the-shelf-logo-${name}${METAL?'-metallic':''}.png`,omitBackground:true});
  await p.setContent(`<html><body style="margin:0;background:#000"><img src=""></body></html>`);
 }
 await b.close();
})();
