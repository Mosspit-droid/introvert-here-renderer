// Standard size guides for every range and garment (Barry, 17 Nov 2026).
// One layout; only the range logo + accent colour and the garment drawing/measurements change.
// Usage: node size-guides/build.js [RANGE] [GARMENT]   e.g. `node size-guides/build.js IP hoodie`
// Output: size-guides/out/<RANGE>_<garment>.png at 4500 x 4500 (the mockup page size), plus preview-sheet.png.
// Measurements live in measurements.json (inches, laid flat); cm are worked out from them.
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'measurements.json'), 'utf8'));
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

// Every stacked logo is 4500 x 1500 with the artwork inside this box, so all logos show at the same scale.
const CROP = { x: 1163, y: 38, w: 3386 - 1163, h: 1393 - 38 };
const logo = (file, width) => {
  const k = width / CROP.w; const b64 = fs.readFileSync(path.join(ROOT, file)).toString('base64');
  return `<div style="width:${width}px;height:${Math.round(CROP.h * k)}px;overflow:hidden;position:relative">
    <img src="data:image/png;base64,${b64}" style="position:absolute;width:${4500 * k}px;left:${-CROP.x * k}px;top:${-CROP.y * k}px"></div>`;
};
const cm = i => Math.round(i * 2.54);
const inch = i => (Math.round(i * 10) / 10).toString();

// Garment drawings, viewBox 0 0 600 640. Each: body path, extra details, and arrow geometry.
const NECK = 'M225 40 C255 78 345 78 375 40';
const G = {
  tshirt: {
    body: `${NECK} L470 70 L575 170 L515 235 L470 200 L470 610 L130 610 L130 200 L85 235 L25 170 L130 70 Z`,
    extra: `<path d="M232 44 C258 70 342 70 368 44" class="rib"/>`,
    chestY: 245, sleeve: 'M300 47 L470 72 L548 200', sleeveLabel: [560, 120],
  },
  longsleeve: {
    body: `${NECK} L470 70 L560 160 L595 560 L535 568 L478 250 L470 610 L130 610 L122 250 L65 568 L5 560 L40 160 L130 70 Z`,
    extra: `<path d="M232 44 C258 70 342 70 368 44" class="rib"/>`,
    chestY: 290, sleeve: 'M300 47 L470 72 L566 560', sleeveLabel: [560, 330],
  },
  sweatshirt: {
    body: `${NECK} L475 70 L565 160 L598 548 L538 556 L482 250 L478 585 L122 585 L118 250 L62 556 L2 548 L35 160 L125 70 Z`,
    extra: `<path d="M232 44 C258 70 342 70 368 44" class="rib"/>
      <path d="M122 585 L478 585 L476 615 L124 615 Z" class="band"/>
      <path d="M538 556 L598 548 L600 590 L541 597 Z" class="band"/><path d="M62 556 L2 548 L0 590 L59 597 Z" class="band"/>`,
    chestY: 290, sleeve: 'M300 47 L475 72 L570 575', sleeveLabel: [560, 330], hem: 615,
  },
  hoodie: {
    body: `M228 44 L475 70 L565 160 L598 548 L538 556 L482 250 L478 585 L122 585 L118 250 L62 556 L2 548 L35 160 L125 70 Z`,
    back: `<path d="M200 95 C175 -25 425 -25 400 95 C380 60 220 60 200 95 Z" class="hood"/>`, hps: 72,
    extra: `<path d="M228 92 C250 140 350 140 372 92" class="rib"/>
      <path d="M282 128 L276 230 M318 128 L324 230" class="cord"/>
      <path d="M195 420 L405 420 L440 560 L160 560 Z" class="pocket"/>
      <path d="M122 585 L478 585 L476 615 L124 615 Z" class="band"/>
      <path d="M538 556 L598 548 L600 590 L541 597 Z" class="band"/><path d="M62 556 L2 548 L0 590 L59 597 Z" class="band"/>`,
    chestY: 290, sleeve: null, hem: 615,
  },
};

const svg = (g, accent) => {
  const hem = g.hem || 610;
  const arrow = (d, id) => `<path d="${d}" class="arr" marker-start="url(#a${id})" marker-end="url(#b${id})"/>`;
  return `<svg viewBox="-20 -40 640 700" width="440" height="481" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="a1" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse"><path d="M10 0 L0 5 L10 10 Z" fill="${accent}"/></marker>
    <marker id="b1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill="${accent}"/></marker>
  </defs>
  <style>.g{fill:#3b3c40;stroke:#8d8e92;stroke-width:3;stroke-linejoin:round}.rib,.cord{fill:none;stroke:#8d8e92;stroke-width:3}
  .band,.pocket,.hood{fill:#34353a;stroke:#8d8e92;stroke-width:3;stroke-linejoin:round}
  .arr{fill:none;stroke:${accent};stroke-width:7;stroke-linejoin:round}.dash{stroke:${accent};stroke-width:3;stroke-dasharray:8 8;opacity:.7}</style>
  ${g.back || ''}<path d="${g.body}" class="g"/>${g.extra}
  ${arrow(`M${g.chestY < 260 ? 140 : 132} ${g.chestY} L${g.chestY < 260 ? 460 : 468} ${g.chestY}`, 1)}
  ${arrow(`M425 ${(g.hps || 52) + 4} L425 ${hem - 4}`, 1)}
  ${g.sleeve ? arrow(g.sleeve, 1) : ''}
  </svg>`;
};

const page = (rk, gk) => {
  // Look matches the Find Your Range graphic (Barry, 18 Nov): dark header, rounded cards in the range colour,
  // letter-spaced capitals, centred text, stacked logo.
  const r = M.ranges[rk]; const g = M.garments[gk]; const d = G[gk]; const a = r.accent;
  const white = rk === 'IH';
  const hasSleeve = !!g.sleeve;
  const cols = [['CHEST WIDTH', g.chest], ['BODY LENGTH', g.length]].concat(hasSleeve ? [['SLEEVE LENGTH', g.sleeve]] : []);
  const head = `<tr><th rowspan="2" class="szh">SIZE</th>${cols.map(c => `<th colspan="2">${c[0]}</th>`).join('')}</tr>
    <tr class="u">${cols.map(() => '<th>cm</th><th>in</th>').join('')}</tr>`;
  const rows = M.sizes.map((s, i) => `<tr><td class="sz">${s}</td>${cols.map(c => `<td>${cm(c[1][i])}</td><td class="in">${inch(c[1][i])}</td>`).join('')}</tr>`).join('');
  const how = [
    ['CHEST WIDTH', 'Laid flat, straight across the chest, 2.5 cm (1 in) below the armholes.'],
    ['BODY LENGTH', 'From the highest point of the shoulder, next to the collar, to the bottom hem.'],
  ].concat(hasSleeve ? [['SLEEVE LENGTH', 'From the centre back of the neck, along the shoulder, to the end of the sleeve.']] : []);
  const todo = M.status !== 'CONFIRMED' ? `<div class="todo">PREVIEW · MEASUREMENTS ${M.status}</div>` : '';
  return `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;800&display=block" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}
body{width:1500px;height:1500px;font-family:Montserrat;color:#f2f0ec;position:relative;overflow:hidden;
 background:linear-gradient(#1c1d1f 0,#1c1d1f 280px,#26272a 280px,#46474a 1500px)}
.top{height:280px;padding:0 80px;display:flex;justify-content:space-between;align-items:center}
.pre{font-weight:700;font-size:26px;letter-spacing:.2em;color:#b8b6b1}
.big{font-weight:800;font-size:104px;letter-spacing:.06em;line-height:1;margin-top:14px}
.sub{font-size:30px;color:#c9c7c2;margin-top:20px}
.bar{height:8px;background:#6b6c6f}
.card{border:5px solid ${a};border-radius:34px;background:rgba(40,41,44,.85);margin:0 80px}
.k{font-weight:700;letter-spacing:.2em;color:${white ? '#f2f0ec' : a}}
.main{margin-top:44px;padding:26px 30px 26px 40px;display:flex;align-items:center;gap:20px}
table{border-collapse:collapse;width:850px;font-size:40px}
th{font-weight:700;font-size:21px;letter-spacing:.16em;color:${white ? '#f2f0ec' : a};padding:10px 4px 2px}
th.szh{text-align:left;padding-left:10px}
tr.u th{font-weight:500;font-size:22px;letter-spacing:.06em;color:#a9a7a2;padding:2px 4px 14px}
td{text-align:center;padding:22px 4px;font-weight:700;border-top:2px solid ${white ? 'rgba(154,152,147,.5)' : a + '73'}}
td.in{color:#a9a7a2;font-weight:500}
td.sz{text-align:left;padding-left:10px;font-weight:800;color:${white ? '#f2f0ec' : a};letter-spacing:.06em}
.draw{flex:1;display:flex;justify-content:center}
.how{margin-top:32px;padding:26px 36px;display:flex;gap:34px;text-align:center}
.how>div{flex:1}.how .k{font-size:22px}.how .t{font-size:24px;color:#c9c7c2;line-height:1.35;margin-top:10px}
.foot{position:absolute;left:100px;right:100px;bottom:62px;border-top:3px solid #6f7073;padding-top:34px;text-align:center}
.foot .a{font-weight:800;font-size:36px;letter-spacing:.07em}.foot .b{font-size:29px;color:#a9a7a2;margin-top:16px}
.todo{position:absolute;bottom:14px;right:16px;background:#ffd400;color:#000;font-weight:800;font-size:18px;padding:5px 16px;border-radius:8px;letter-spacing:.08em}
</style></head><body>${todo}
<div class="top"><div><div class="pre">${g.label}</div><div class="big">SIZE GUIDE.</div><div class="sub">Garment measurements, laid flat. Allow ±2.5 cm (1 in).</div></div>${logo(r.logo, 330)}</div>
<div class="bar"></div>
<div class="card main"><table>${head}${rows}</table><div class="draw">${svg(d, white ? '#f2f0ec' : a)}</div></div>
<div class="card how">${how.map(h => `<div><div class="k">${h[0]}</div><div class="t">${h[1]}</div></div>`).join('')}</div>
<div class="foot"><div class="a">PLEASE CHECK THE SIZE GUIDE BEFORE ORDERING.</div><div class="b">All items are made to order especially for you. For a looser fit, size up.</div></div>
</body></html>`;
};

(async () => {
  const [onlyR, onlyG] = process.argv.slice(2);
  // Exclusive. sells all four garments (topical brief); every range does.
  const jobs = [];
  for (const rk of Object.keys(M.ranges)) for (const gk of Object.keys(M.garments))
    if ((!onlyR || onlyR === rk) && (!onlyG || onlyG === gk)) jobs.push([rk, gk]);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 1500 }, deviceScaleFactor: 3 });
  const made = [];
  for (const [rk, gk] of jobs) {
    await p.setContent(page(rk, gk), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    const over = await p.evaluate(() => {
      const f = document.querySelector('.foot').getBoundingClientRect().top + 10;
      const els = [...document.querySelectorAll('.card')];
      return els.filter(e => e.getBoundingClientRect().bottom > f - 10).map(e => e.className || e.tagName);
    });
    if (over.length) console.log('OVERLAP', rk, gk, over);
    const f = path.join(OUT, `${rk}_${gk}.png`); await p.screenshot({ path: f }); made.push(f);
    console.log('made', path.relative(ROOT, f));
  }
  await b.close();
})();
