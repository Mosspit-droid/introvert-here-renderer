// node excuse_render.js "<EXCUSE>" <outdir>  -> frames of the excuse card typing on, then "You're welcome."
const { chromium } = require('playwright');
const [,, text, out] = process.argv;
(async () => {
  const fs = require('fs'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.goto('file://' + require('path').resolve('excusecard2.html') + '?text=' + encodeURIComponent(text));
  await p.waitForFunction(() => document.title === 'ready'); await p.waitForTimeout(300);
  const n = await p.evaluate(() => { const ex = document.getElementById('ex'); const t = ex.textContent;
    ex.innerHTML = [...t].map(c => '<span style="visibility:hidden">' + (c === ' ' ? ' ' : c.replace(/&/g,'&amp;').replace(/</g,'&lt;')) + '</span>').join('');
    document.getElementById('yw').style.opacity = 0; return t.length; });
  const FPS = 30, start = 0.8, per = 0.06, after = start + n * per;
  const total = after + 3.2;
  for (let i = 0; i < Math.round(total * FPS); i++) {
    const t = i / FPS, k = Math.max(0, Math.min(n, Math.floor((t - start) / per)));
    const yw = Math.max(0, Math.min(1, (t - after - 0.5) / 0.5));
    await p.evaluate(([k, yw]) => { document.querySelectorAll('#ex span').forEach((s, j) => s.style.visibility = j < k ? 'visible' : 'hidden'); document.getElementById('yw').style.opacity = yw; }, [k, yw]);
    await p.screenshot({ path: `${out}/${String(i).padStart(4, '0')}.png` });
  }
  await b.close(); console.log('frames', Math.round(total * FPS), 'secs', total.toFixed(1));
})();
