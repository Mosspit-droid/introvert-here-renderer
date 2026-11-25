const { chromium } = require('playwright');
const jobs = [
  ['avatar-1080', 'avatar', 1080, 1080],
  ['youtube-banner-2560x1440', 'banner', 2560, 1440, 1546, 423],   // safe area for all devices
  ['facebook-cover-1640x624', 'banner', 1640, 624, 1300, 624],
  ['bluesky-banner-1500x500', 'banner', 1500, 500, 1300, 500],
];
(async () => {
  const b = await chromium.launch();
  for (const [name, kind, w, h, sw, sh] of jobs) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('file://' + require('path').resolve('profile.html') + `?kind=${kind}&w=${w}&h=${h}&sw=${sw||w}&sh=${sh||h}`);
    await p.waitForFunction(() => document.title === 'ready'); await p.waitForTimeout(300);
    await p.screenshot({ path: name + '.png' }); await p.close();
  }
  await b.close();
})();
