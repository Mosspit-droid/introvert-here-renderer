// node social/launch/gag_reel.js '<json lines>' <out.mp4>
// Records the real gag renderer (buildPage) and keeps only the text phase: no product photos.
const path = require('path'), fs = require('fs'), os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { buildPage } = require('../../buildPage');
const [,, linesJson, out] = process.argv;
(async () => {
  const bg = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, '../../backgrounds/IH.jpg')).toString('base64');
  const black = 'data:image/jpeg;base64,' + fs.readFileSync(process.env.BLACK).toString('base64');
  const { html, totalDurationMs } = buildPage({ textLines: JSON.parse(linesJson), backgroundImageUrl: bg, collection: 'IH',
    productImages: [{ url: black, durationMs: 1500 }], textStyle: 'type', motion: 'zoomOut', teaser: false });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gag-'));
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1080, height: 1080 }, recordVideo: { dir: work, size: { width: 1080, height: 1080 } } });
  const t0 = Date.now(); const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.waitForFunction('window.__DONE__ === true', null, { timeout: totalDurationMs + 15000 });
  const first = await p.evaluate('window.__START_MS__ || 0'); const v = p.video(); await p.close(); await ctx.close(); await b.close();
  const raw = await v.path(); const trim = first ? Math.max(0, (first - t0) / 1000 + 0.08) : 0;
  fs.copyFileSync(raw, out.replace(/\.mp4$/, '.raw.webm')); console.log('trim', trim.toFixed(2), 'total', totalDurationMs);
})();
