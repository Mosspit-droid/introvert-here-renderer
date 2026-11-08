// Listings to re-price, with the price rule for their collection + product type (PRODUCT_RULES: Q = base, AW/AX = 2XL/3XL extras).
const reg = JSON.parse(input.reg).value.map(r => r.values[0]);
const rules = JSON.parse(input.rules).value.map(r => r.values[0]);
const only = String(input.only || "").split(",").map(s => s.trim()).filter(Boolean);
const list = [], skipped = [];
reg.forEach(v => {
  const code = String(v[0] || "").trim(), coll = String(v[1] || "").trim(), type = String(v[2] || "").trim();
  const productId = String(v[8] || "").trim(), listingId = String(v[6] || "").trim();
  if (!code || !productId || !listingId) return;
  if (only.length && !only.includes(code)) return;
  const r = rules.find(x => String(x[0]).trim() === coll && String(x[1]).trim() === type);
  if (!r || !Number(r[16])) { skipped.push(code); return; }
  list.push({ code, productId, listingId, base: Number(r[16]), x2: Number(r[48] || 0), x3: Number(r[49] || 0) });
});
return { list, count: list.length, skipped: skipped.join(",") };
