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
 <svg width="4500" height="1500" style="position:absolute;left:0;top:0"><path fill="#BC9C22" fill-rule="evenodd" d="M287,424 H4213 A170,170 0 0 1 4383,594 V906 A170,170 0 0 1 4213,1076 H287 A170,170 0 0 1 117,906 V594 A170,170 0 0 1 287,424 Z M293,520 H4207 A80,80 0 0 1 4287,600 V900 A80,80 0 0 1 4207,980 H293 A80,80 0 0 1 213,900 V600 A80,80 0 0 1 293,520 Z"/></svg>
 <img src="${fig}" style="left:286px;top:542px;height:422px">
 <div class="t" id="w1" data-x="473" data-r="4155" data-cap="612" data-capb="889">NTROVERT HERE...</div>
 <div style="position:absolute;left:3010px;top:965px">${parchment(1300,330,-2.5,118)}</div>
</div>`;
const stacked=`<div class="c">
 <svg width="4500" height="1500" style="position:absolute;left:0;top:0"><path fill="#BC9C22" fill-rule="evenodd" d="M1224,42 H3277 A60,60 0 0 1 3337,102 V1099 A60,60 0 0 1 3277,1159 H1224 A60,60 0 0 1 1164,1099 V102 A60,60 0 0 1 1224,42 Z M1268,109 H3233 A34,34 0 0 1 3267,143 V953 A34,34 0 0 1 3233,987 H1268 A34,34 0 0 1 1234,953 V143 A34,34 0 0 1 1268,109 Z"/></svg>
 <img src="${fig}" style="left:1285px;top:188px;height:723px">
 <div class="t" id="s1" data-x="1576" data-r="3195" data-cap="215" data-capb="416">NTROVERT</div>
 <div class="t" id="s2" data-x="1576" data-r="3195" data-cap="509" data-capb="911">HERE</div>
 <div style="position:absolute;left:2290px;top:960px">${parchment(1060,250,-2,96)}</div>
</div>`;
(async()=>{
 const b=await chromium.launch();
 for(const [name,body] of [['wide',wide],['stacked',stacked]]){
  const p=await b.newPage({viewport:{width:4500,height:1500}});
  await p.setContent(`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700&family=Libre+Baskerville:wght@700&display=block" rel="stylesheet"><style>${css}</style></head><body>${DEFS}${body}</body></html>`,{waitUntil:'networkidle'});
  await p.evaluate(async()=>{await document.fonts.ready;});
  // Fit each text line: cap top/bottom and left/right as measured from Barry's version.
  const info=await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('.t').forEach(el=>{
      const x=+el.dataset.x,r=+el.dataset.r,cap=+el.dataset.cap,capb=+el.dataset.capb;
      // cap height of Montserrat = 0.70em
      const fs=(capb-cap)/0.70; el.style.fontSize=fs+'px';
      // stretch letter-spacing so the line spans x..r
      const w=el.getBoundingClientRect().width; const n=el.textContent.length;
      el.style.letterSpacing=((r-x)-w)/(n-1)+'px';
      el.style.left=x+'px';
      // place: cap top = top + (lineheight - capheight)/2 approx; measure via canvas
      const c=document.createElement('canvas').getContext('2d'); c.font=`700 ${fs}px Montserrat`;
      const m=c.measureText('H'); const asc=m.actualBoundingBoxAscent;
      const fa=m.fontBoundingBoxAscent;
      el.style.top=(cap-(fa-asc) - (fs - (m.fontBoundingBoxAscent+m.fontBoundingBoxDescent))/2)+'px';
      out.push({t:el.textContent,fs:Math.round(fs),ls:el.style.letterSpacing,ok:document.fonts.check(`700 10px Montserrat`)});
    });
    return out;});
  console.log(name,JSON.stringify(info));
  await p.screenshot({path:`${dir}/off-the-shelf-logo-${name}${METAL?'-metallic':''}.png`,omitBackground:true});
  await p.setContent(`<html><body style="margin:0;background:#000"><img src=""></body></html>`);
 }
 await b.close();
})();
