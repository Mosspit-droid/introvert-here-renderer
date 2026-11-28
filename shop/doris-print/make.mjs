// Makes the printable edition of Escape From Aunt Doris as a PDF, from the shop's own print page.
// Usage: node make.mjs <base url, e.g. the preview or a local test server> <output.pdf> [print|paper]
// "paper" (28 Nov) is the screen-free Etsy edition; "print" is the original online-checked booklet.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const [base, out] = process.argv.slice(2);
const b = await chromium.launch(); const pg = await b.newPage();
await pg.goto(base + "/uk/escape-room/aunt-doris/" + (process.argv[4] || "print") + "", { waitUntil: "load" });
await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(1500);
await pg.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
await b.close(); console.log("saved", out);
