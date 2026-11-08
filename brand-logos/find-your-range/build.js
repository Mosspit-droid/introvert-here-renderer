const fs=require('fs');const {chromium}=require('playwright');
const dir=process.argv[2];
const img=n=>'data:image/png;base64,'+fs.readFileSync(`${dir}/${n}.png`).toString('base64');
const R=[
 {logo:'introvert-here',c:'#F2F0EC',k:'THE ORIGINAL RANGE',h:'EVERYDAY INTROVERSION.',s:'Social plans. Small talk. Other people.',f:'FOR GENERAL AVOIDANCE.'},
 {logo:'per-contract',c:'#C2403A',k:'THE WORKPLACE RANGE',h:'PROFESSIONALLY PRESENT.',s:'Meetings. Colleagues. Compulsory enthusiasm.',f:'INTERACTION: CONTRACTUALLY OBLIGED.'},
 {logo:'off-the-shelf',c:'#C9A62A',k:'THE READING RANGE',h:'ACHIEVABLE ESCAPE.',s:'Books. Characters. Preferable company.',f:'READING: CONVERSATION OPTIONAL.'},
 {logo:'shhh',c:'#A8CEA8',k:'THE QUIETER RANGE',h:'COMMUNICATION. YOUR WAY.',s:'Low-verbal. Non-verbal. Sensory-aware.',f:'NON-VERBAL. NOT ABSENT.'},
];
const card=r=>`<div class="card" style="--c:${r.c}"><div class="lg"><img src="${img(r.logo)}"></div><div class="tx">
 <div class="k">${r.k}</div><div class="h">${r.h}</div><div class="s">${r.s}</div><div class="rule"></div><div class="f">${r.f}</div></div></div>`;
const html=`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;800&display=block" rel="stylesheet"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:2000px;height:2000px;font-family:Montserrat;color:#f2f0ec;background:linear-gradient(#1c1d1f 0,#1c1d1f 330px,#26272a 330px,#46474a 2000px)}
.top{height:330px;padding:92px 108px 0}
.pre{font-weight:700;font-size:31px;letter-spacing:.2em;color:#b8b6b1}
.big{font-weight:800;font-size:96px;letter-spacing:.07em;margin-top:18px;line-height:1}
.sub{font-size:36px;color:#c9c7c2;margin-top:26px}
.bar{height:8px;background:#6b6c6f}
.cards{padding:40px 90px 0;display:flex;flex-direction:column;gap:30px}
.card{height:282px;border:5px solid var(--c);border-radius:34px;background:rgba(40,41,44,.85);display:flex;align-items:center}
.lg{width:820px;display:flex;justify-content:center;align-items:center}
.lg img{height:248px}
.tx{flex:1;padding-right:90px}
.k{font-weight:700;font-size:28px;letter-spacing:.2em;color:var(--c)}
.h{font-weight:800;font-size:46px;letter-spacing:.07em;margin-top:18px}
.s{font-size:32px;color:#c9c7c2;margin-top:14px}
.rule{height:2px;background:var(--c);opacity:.45;margin:20px 0 18px}
.f{font-weight:700;font-size:28px;letter-spacing:.16em;color:var(--c)}
.card:first-child .k,.card:first-child .f{color:#f2f0ec}.card:first-child .rule{background:#9a9893}
.foot{margin:58px 108px 0;border-top:3px solid #6f7073;padding-top:46px;text-align:center}
.prod{font-weight:800;font-size:40px;letter-spacing:.07em}
.prod span{margin:0 26px;color:#c9c7c2}
.tag{font-size:31px;color:#a9a7a2;margin-top:34px}
</style></head><body>
<div class="top"><div class="pre">INTROVERT HERE... PRESENTS</div><div class="big">FIND YOUR RANGE.</div><div class="sub">Same outlook. Different circumstances.</div></div>
<div class="bar"></div>
<div class="cards">${R.map(card).join('')}</div>
<div class="foot"><div class="prod">TEES<span>•</span>LONG SLEEVES<span>•</span>SWEATSHIRTS<span>•</span>HOODIES</div><div class="tag">Four ranges. One entirely reasonable desire to be left the hell alone.</div></div>
</body></html>`;
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:2000,height:2000}});
await p.setContent(html,{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);
const over=await p.evaluate(()=>[...document.querySelectorAll('.h,.s,.f,.prod,.tag')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent));
console.log('overflowing:',over, 'page height', await p.evaluate(()=>document.body.scrollHeight));
await p.screenshot({path:`${dir}/find-your-range.png`});await b.close();})();
