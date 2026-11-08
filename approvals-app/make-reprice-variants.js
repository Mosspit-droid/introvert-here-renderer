// New prices for the variants already on the product (only those in its print areas, which Printify requires).
// 2XL gets the 2XL extra; 3XL and bigger get the 3XL extra. Enabled/disabled state is kept as it is.
const p = JSON.parse(input.product);
const inPA = new Set(); (p.print_areas || []).forEach(a => (a.variant_ids || []).forEach(id => inPA.add(id)));
const SZ = /^(XS|S|M|L|XL|2XL|3XL|4XL|5XL)$/;
const base = Number(input.base), x2 = Number(input.x2), x3 = Number(input.x3);
const out = [], seen = {};
(p.variants || []).filter(v => inPA.has(v.id)).forEach(v => {
  const size = String(v.title || "").split("/").map(s => s.trim()).find(s => SZ.test(s)) || "";
  const extra = size === "2XL" ? x2 : (/^[3-5]XL$/.test(size) ? x3 : 0);
  const price = Math.round((base + extra) * 100);
  out.push({ id: v.id, price, is_enabled: v.is_enabled });
  if (v.is_enabled) seen[size || "?"] = price / 100;
});
if (!out.length) throw new Error("No variants found on " + input.code);
return { body: JSON.stringify({ variants: out }), summary: input.code + " " + JSON.stringify(seen) };
