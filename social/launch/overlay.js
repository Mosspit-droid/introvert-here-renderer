// node overlay.js <out.png> <query>
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.goto('file://' + require('path').resolve('overlay.html') + '?' + process.argv[3]);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: process.argv[2], omitBackground: true }); await b.close();
})();
