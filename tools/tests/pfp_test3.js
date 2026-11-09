const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///home/user/introvert-here-renderer/tools/phrase-field-planner.html');
  const run = async (text, commas = true, platform = 'etsy') => {
    await p.selectOption('#platform', platform); await p.setChecked('#commas', commas); await p.fill('#phrases', text); await p.click('#process');
    return p.evaluate(() => ({ placed: [...document.querySelectorAll('#placed li[data-phrase]')].map(l => l.dataset.phrase),
      dupes: [...document.querySelectorAll('#dupes li')].map(l => l.textContent), bad: [...document.querySelectorAll('#bad-chars li')].map(l => l.textContent) }));
  };
  const out = []; const check = (n, ok, got) => out.push((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' -> ' + JSON.stringify(got)));
  let r = await run('introvert gift, holiday gift,tshirt , ,  social battery');
  check('comma list split, empty bits ignored', r.placed.join('|') === 'introvert gift|holiday gift|tshirt|social battery', r);
  r = await run('introvert gift\tholiday gift\ttshirt\r\nsocial battery\tquiet person\t\r\nme time');
  check('spreadsheet block (tabs + rows) split', r.placed.join('|') === 'introvert gift|holiday gift|tshirt|social battery|quiet person|me time', r);
  r = await run('"introvert gift"\n"say ""hi"""\nIntrovert Gift');
  check('spreadsheet quotes removed, duplicate still caught', r.placed[0] === 'introvert gift' && r.dupes.some(d => d.includes('Introvert Gift')), r);
  r = await run('mix, of, lines\nand more');
  check('commas and lines together', r.placed.join('|') === 'mix|of|lines|and more', r);
  r = await run('sale, 50% off', false, 'custom');
  check('box unticked: comma kept inside phrase', r.placed.join('|') === 'sale, 50% off', r);
  out.push(errs.length ? 'FAIL errors: ' + errs.join(';') : 'PASS no script errors');
  console.log(out.join('\n')); await b.close();
})();
