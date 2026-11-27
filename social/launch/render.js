// usage: node render.js <html> <outprefix> <w> <h> [seconds]
const { chromium } = require('playwright');
const [,, html, out, w, h, secs] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  await p.goto('file://' + require('path').resolve(html) + `?w=${w}&h=${h}`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  await p.evaluate(() => frame(-1));
  await p.screenshot({ path: out + '.png' });
  if (secs) {
    const fs = require('fs'); fs.mkdirSync(out + '_f', { recursive: true });
    const n = Math.round(+secs * 30);
    for (let i = 0; i < n; i++) {
      await p.evaluate(t => frame(t), i / 30);
      await p.screenshot({ path: `${out}_f/${String(i).padStart(4, '0')}.png` });
    }
  }
  await b.close();
})();
