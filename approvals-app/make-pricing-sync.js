// Package prices (PRODUCT_RULES) and the cost table + fee settings (PRICING sheet) for the app's Pricing page.
const rules = JSON.parse(input.rules), sheet = JSON.parse(input.sheet);
const prices = {};
rules.slice(1).forEach(r => {
  const t = String(r[1]).trim();
  if (t && !prices[t]) prices[t] = { price: Number(r[16]) || 0, x2: Number(r[48]) || 0, x3: Number(r[49]) || 0 };
});
const c = (row) => Number(sheet[row - 1][2]);   // column C, 1-based sheet row
const settings = { target: c(3), rate: c(4), card: c(5), txn: c(6), procPct: c(7), procFixed: c(8), reg: c(9), renew: c(10), vatFees: c(11), vatUK: c(12) };
const NAMES = { "T-shirt": "T-SHIRT", "Long-sleeve": "LONG-SLEEVE", "Sweatshirt": "SWEATSHIRT", "Hoodie": "HOODIE" };
const garments = {};
for (let row = 14; row <= 25; row++) {
  const r = sheet[row - 1] || [];
  const t = NAMES[String(r[0]).trim()]; if (!t) continue;
  (garments[t] = garments[t] || {})[String(r[1]).trim()] = { cost: Number(r[2]), shipUS: Number(r[3]), shipUK: Number(r[4]) };
}
const out = { prices, settings, garments };
if (input.action === "save") out.lastSave = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + (input.reprice === "true" ? " (live listings updating)" : "");
return { body: JSON.stringify(out) };
