const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///home/user/introvert-here-renderer/tools/phrase-field-planner.html');
  const run = async (text, platform = 'etsy') => {
    await p.selectOption('#platform', platform); await p.fill('#phrases', text); await p.click('#process');
    return p.evaluate(() => ({
      rows: [...document.querySelectorAll('#placed li[data-phrase]')].map(l => ({ t: l.dataset.phrase, amber: l.classList.contains('shared'), marks: [...l.querySelectorAll('mark')].map(m => m.textContent) })),
      bad: [...document.querySelectorAll('#bad-chars li')].map(l => l.textContent), badShown: !document.getElementById('bad-wrap').hidden,
      notes: [...document.querySelectorAll('#notes li')].map(l => l.textContent), left: document.getElementById('s-left').textContent }));
  };
  const out = []; const check = (n, ok, got) => out.push((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' -> ' + JSON.stringify(got)));
  let r = await run('Introvert gift\nholiday gift');
  check('"gift" shared: both rows amber, gift highlighted, note gift ×2', r.rows.every(x => x.amber && x.marks.join() === 'gift') && r.notes[0].startsWith('Words in more than one tag: gift ×2') && r.notes[0].includes('Etsy accepts this'), r);
  check('unused-tags note (11 of 13)', r.notes.some(n => n.startsWith('11 of your 13 tags are unused')), r);
  r = await run('gift for him\ngift for her');
  check('"for" ignored, only "gift" shared', r.rows.every(x => x.marks.join() === 'gift'), r);
  r = await run('introvert gift\nsocial battery');
  check('no shared words: rows green, no warning note', r.rows.every(x => !x.amber) && !r.notes.some(n => n.startsWith('Words')), r);
  r = await run("café & co\n-leading\nmum's gift\nt-shirt\nfunny!\nemoji 😀");
  check('Etsy rules: & ! emoji and leading - rejected; café, mum\'s, t-shirt fine', r.rows.map(x => x.t).join('|') === "mum's gift|t-shirt" && r.bad.length === 4 && r.bad.some(x => x.includes('-leading (starts with -)')) && r.bad.some(x => x.includes('café & co (contains “&”)')) && r.left === '4', r);
  r = await run("café & co\nfunny!", 'custom');
  check('Custom: no character rules, list hidden', r.rows.length === 2 && !r.badShown, r);
  await p.selectOption('#platform', 'etsy'); await p.fill('#limit', '40');
  check('changing limit switches menu to Custom', await p.inputValue('#platform') === 'custom', await p.inputValue('#platform'));
  await p.selectOption('#platform', 'etsy');
  check('choosing Etsy resets to 13 / 20', (await p.inputValue('#fields')) === '13' && (await p.inputValue('#limit')) === '20', '');
  await run('Introvert gift\nholiday gift\nfunny gift for her\ncafé & co\nsocial battery\nintrovert social exhaustion coffee mug');
  await p.evaluate(() => document.getElementById('results').scrollIntoView());
  await p.screenshot({ path: process.argv[2] + '/pfp_v3.png' });
  out.push(errs.length ? 'FAIL errors: ' + errs.join(';') : 'PASS no script errors');
  console.log(out.join('\n')); await b.close();
})();
