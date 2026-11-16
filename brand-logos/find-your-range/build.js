const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const dir=process.argv[2]||__dirname;
const K=248/1214; // same logo scale as the current image (2206x1214 canvas shown 248px tall)
const sz=n=>{const b=fs.readFileSync(path.join(dir,n+'.png'));return [b.readUInt32BE(16),b.readUInt32BE(20)];};
const img=(n,k=K)=>{const [w,h]=sz(n);return `<img src="data:image/png;base64,${fs.readFileSync(path.join(dir,n+'.png')).toString('base64')}" style="width:${Math.round(w*k)}px;height:${Math.round(h*k)}px">`;};
const R=[
 {logo:'introvert-here',c:'#F2F0EC',k:'THE ORIGINAL RANGE',h:'EVERYDAY INTROVERSION.',s:'Social plans. Small talk. Other people.',f:'FOR GENERAL AVOIDANCE.',w:1},
 {logo:'shhh',c:'#A8CEA8',k:'THE QUIETER RANGE',h:'COMMUNICATION. YOUR WAY.',s:'Low-verbal. Non-verbal. Sensory-aware.',f:'NONVERBAL. NOT ABSENT.'},
 {logo:'per-contract',c:'#D2443C',k:'THE WORKPLACE RANGE',h:'PROFESSIONALLY PRESENT.',s:'Meetings. Colleagues. Compulsory enthusiasm.',f:'INTERACTION: CONTRACTUALLY OBLIGED.'},
 {logo:'off-the-shelf',c:'#E0B52C',k:'THE READING RANGE',h:'FICTION. YOUR WAY.',s:'Books. Characters. Preferable company.',f:'READING: CONVERSATION OPTIONAL.'},
 {logo:'exclusive',c:'#E5333A',k:'THE TOPICAL RANGE',h:'THIS WEEK, MOSTLY.',s:'The news. The noise. Briefly. T-shirts only.',f:'HERE TODAY. GONE IN SIX WEEKS.'},
 {logo:'in-person',c:'#4A8FE7',k:'THE PERSONALISED RANGE',h:'YOUR WORDS. OUR WAY.',s:'Names. Notes. Specific grievances.',f:'PERSONALISED. STILL NOT SOCIAL.'},
];
const tx=r=>`<div class="tx"><div class="k">${r.k}</div><div class="h">${r.h}</div><div class="s">${r.s}</div><div class="rule"></div><div class="f">${r.f}</div></div>`;
const css=(H)=>`*{margin:0;padding:0;box-sizing:border-box}
body{width:2000px;height:${H}px;font-family:Montserrat;color:#f2f0ec;background:linear-gradient(#1c1d1f 0,#1c1d1f 330px,#26272a 330px,#46474a ${H}px)}
.top{height:330px;padding:92px 108px 0}.pre{font-weight:700;font-size:31px;letter-spacing:.2em;color:#b8b6b1}
.big{font-weight:800;font-size:96px;letter-spacing:.07em;margin-top:18px;line-height:1}.sub{font-size:36px;color:#c9c7c2;margin-top:26px}
.bar{height:8px;background:#6b6c6f}
.card{border:5px solid var(--c);border-radius:34px;background:rgba(40,41,44,.85)}
.k{font-weight:700;font-size:28px;letter-spacing:.2em;color:var(--c)}.h{font-weight:800;font-size:46px;letter-spacing:.07em;margin-top:18px;white-space:nowrap}
.s{font-size:32px;color:#c9c7c2;margin-top:14px}.rule{height:2px;background:var(--c);opacity:.45;margin:20px 0 18px}
.f{font-weight:700;font-size:28px;letter-spacing:.16em;color:var(--c);white-space:nowrap}
.w .k,.w .f{color:#f2f0ec}.w .rule{background:#9a9893}
.foot{border-top:3px solid #6f7073;padding-top:46px;text-align:center}.prod{font-weight:800;font-size:40px;letter-spacing:.07em}.prod span{margin:0 26px;color:#c9c7c2}
.tag{font-size:31px;color:#a9a7a2;margin-top:34px}
.sec{font-weight:700;font-size:30px;letter-spacing:.24em;color:#b8b6b1;display:flex;align-items:center;gap:28px}.sec::before,.sec::after{content:"";flex:1;height:3px;background:#6f7073}`;
const head=`<div class="top"><div class="pre">INTROVERT HERE... PRESENTS</div><div class="big">FIND YOUR RANGE.</div><div class="sub">Same outlook. Different circumstances.</div></div><div class="bar"></div>`;
const foot=(m)=>`<div class="foot" style="margin:${m}px 108px 0"><div class="prod">TEES<span>•</span>LONG SLEEVES<span>•</span>SWEATSHIRTS<span>•</span>HOODIES</div><div class="tag">Six ranges. One entirely reasonable desire to be left the hell alone.</div></div>`;
// Six ranges as a 2 x 3 grid (Barry, 16 Nov); logos at the same scale as the earlier four-range image.
const row=r=>`<div class="card${r.w?' w':''}" style="--c:${r.c};height:270px;display:flex;align-items:center"><div style="width:820px;display:flex;justify-content:center">${img(r.logo)}</div>${tx(r)}</div>`;
const tile=r=>`<div class="card${r.w?' w':''}" style="--c:${r.c};padding:30px 44px 34px;display:flex;flex-direction:column;align-items:center"><div style="height:${Math.round(1393*K*0.92)}px;display:flex;align-items:center">${img(r.logo,K)}</div><div style="align-self:stretch;margin-top:22px">${tx(r)}</div></div>`;
const L={
 B:[2500,`${head}<div style="padding:44px 90px 0;display:grid;grid-template-columns:1fr 1fr;gap:34px">${R.map(tile).join('')}</div>${foot(40)}`],
};
(async()=>{const b=await chromium.launch();
for(const [n,[H,body]] of Object.entries(L)){const p=await b.newPage({viewport:{width:2000,height:H}});
 const extra=n==='B'?'.h{font-size:40px}.s{font-size:29px}.k,.f{font-size:25px}.tx{text-align:center}':'';
 await p.setContent(`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;800&display=block" rel="stylesheet"><style>${css(H)}${extra}</style></head><body>${body}</body></html>`,{waitUntil:'networkidle'});
 await p.evaluate(()=>document.fonts.ready);
 const info=await p.evaluate(()=>({over:[...document.querySelectorAll('.h,.s,.f,.prod,.tag')].filter(e=>e.scrollWidth>e.clientWidth+1||e.getBoundingClientRect().right>1990).map(e=>e.textContent),h:document.body.scrollHeight}));
 console.log(n,info);await p.screenshot({path:path.join(dir,'find-your-range.png')});await p.close();}
await b.close();})();
