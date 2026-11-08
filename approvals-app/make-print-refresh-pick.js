// Listings whose print file should be remade from the current print template.
const reg = JSON.parse(input.reg).value.map(r => r.values[0]);
const gags = JSON.parse(input.gags).value.map(r => r.values[0]);
const rules = JSON.parse(input.rules).value.map(r => r.values[0]);
const only = String(input.only || "").split(",").map(s => s.trim()).filter(Boolean);
const want = String(input.collections || "IH,SH,PC").split(",");
const gagById = {}; gags.forEach(g => { gagById[String(g[0] || "").trim()] = g; });
const list = [], skipped = [];
reg.forEach(v => {
  const code = String(v[0] || "").trim(), coll = String(v[1] || "").trim(), type = String(v[2] || "").trim();
  const productId = String(v[8] || "").trim(), listingId = String(v[6] || "").trim();
  if (!code || !productId || !listingId) return;
  if (!want.includes(code.slice(0, 2))) return;
  if (only.length && !only.includes(code)) return;
  const gagId = code.split("-").slice(0, 2).join("-");
  const g = gagById[gagId]; const rule = rules.find(r => String(r[0]).trim() === coll && String(r[1]).trim() === type);
  const templateId = rule ? String(rule[45] || "").trim() : "";
  if (!g || !templateId) { skipped.push(code); return; }
  list.push({ code, productId, gagId, gagText: String(g[1] || ""), templateId });
});
return { list, count: list.length, skipped: skipped.join(",") };
