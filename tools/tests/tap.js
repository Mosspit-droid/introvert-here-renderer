const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  // serve over a secure origin so the real clipboard API is used
  const html = require('fs').readFileSync('/home/user/introvert-here-renderer/tools/phrase-field-planner.html', 'utf8');
  await ctx.route('https://planner.test/', r => r.fulfill({ contentType: 'text/html', body: html }));
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://planner.test' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('https://planner.test/');
  await p.fill('#phrases', 'introvert gift\nchristmas present\ntshirt');
  await p.tap('#process');
  await p.tap('#placed li:nth-child(2)');
  const clip1 = await p.evaluate(() => navigator.clipboard.readText());
  const row2 = await p.$eval('#placed li:nth-child(2)', l => [l.className, l.querySelector('.tick').textContent]);
  const status1 = await p.textContent('#status');
  await p.tap('#placed li:nth-child(1)'); await p.tap('#placed li:nth-child(3)');
  const clip2 = await p.evaluate(() => navigator.clipboard.readText());
  const status2 = await p.textContent('#status');
  await p.tap('#copy'); const clipAll = await p.evaluate(() => navigator.clipboard.readText());
  console.log(JSON.stringify({ clip1, row2, status1, clip2, status2, clipAll, errs }, null, 1));
  await p.screenshot({ path: process.argv[2] + '/pfp_tap.png', fullPage: false, clip: { x: 0, y: 0, width: 390, height: 844 } });
  await p.evaluate(() => document.getElementById('results').scrollIntoView());
  await p.screenshot({ path: process.argv[2] + '/pfp_tap.png' });
  await b.close();
})();
