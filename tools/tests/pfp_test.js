const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('request', r => { if (!r.url().startsWith('file:')) errs.push('NETWORK ' + r.url()); });
  await p.goto('file:///home/user/introvert-here-renderer/tools/phrase-field-planner.html');
  const run = async (text, fields = 13, limit = 20) => {
    await p.fill('#phrases', text); await p.fill('#fields', String(fields)); await p.fill('#limit', String(limit));
    await p.click('#process');
    return p.evaluate(() => ({
      placed: [...document.querySelectorAll('#placed li')].map(l => l.textContent),
      tooLong: [...document.querySelectorAll('#too-long li')].map(l => l.textContent),
      noRoom: [...document.querySelectorAll('#no-room li')].map(l => l.textContent),
      dupes: [...document.querySelectorAll('#dupes li')].map(l => l.textContent),
      stats: ['s-fields','s-placed','s-left'].map(i => document.getElementById(i).textContent) }));
  };
  const out = []; const check = (name, ok, got) => out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' -> ' + JSON.stringify(got)));
  let r = await run('introvert gift');
  check('"introvert gift" placed as 14/20', r.placed.length === 1 && r.placed[0].includes('introvert gift') && r.placed[0].includes('[14/20]'), r);
  r = await run('introvert social exhaustion coffee mug');
  check('long phrase rejected as 38/20', r.placed[0] === 'No phrases placed.' && r.tooLong[0] === 'introvert social exhaustion coffee mug [38/20]', r);
  r = await run('Coffee Mug\ncoffee mug');
  check('Coffee Mug duplicate', r.placed.length === 1 && r.placed[0].includes('Coffee Mug') && r.dupes.length === 1 && r.dupes[0].includes('coffee mug'), r);
  r = await run(Array.from({ length: 14 }, (_, i) => 'phrase ' + (i + 1)).join('\n'));
  check('14 short -> 13 placed, 1 no free fields', r.placed.length === 13 && r.noRoom.length === 1 && r.noRoom[0].startsWith('phrase 14') && r.stats[2] === '1', r);
  r = await run('\n\n  introvert gift  \n\n   \ncoffee mug\n\n');
  check('blank lines ignored', r.placed.length === 2 && r.dupes[0] === 'None' && r.tooLong[0] === 'None', r);
  r = await run('introvert social exhaustion coffee mug', 13, 40);
  check('limit 40 -> fits as 38/40', r.placed.length === 1 && r.placed[0].includes('[38/40]'), r);
  // screenshot with a realistic mix, phone width
  await run('introvert gift\nCoffee Mug\ncoffee mug\nintrovert social exhaustion coffee mug\nsocial battery\nquiet person\nbook lover gift\nhermit mode\nstay home club\ndo not disturb\nsocial anxiety\nantisocial club\npeople free zone\nnap queen\nhomebody humor\nme time');
  await p.screenshot({ path: process.argv[2] + '/pfp_mobile.png', fullPage: true });
  const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  out.push((wide ? 'FAIL' : 'PASS') + ' no sideways scroll at phone width');
  out.push(errs.length ? 'FAIL errors/network: ' + errs.join('; ') : 'PASS no script errors, no network requests');
  console.log(out.join('\n')); await b.close();
})();
