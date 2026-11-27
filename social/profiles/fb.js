const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1640, height: 924 } });
await p.goto('file://' + require('path').resolve('profile.html') + '?kind=banner&w=1640&h=924&sw=1400&sh=520');
await p.waitForFunction(() => document.title === 'ready'); await p.waitForTimeout(300);
await p.evaluate(()=>{ const s=document.getElementById('s').style; });
await p.screenshot({ path: 'facebook-cover-1640x924.png' }); await b.close(); })();
