// Which photo on each listing is the Find Your Range graphic: *_PROMO for Introvert Here / SHHH., *_RANGE for PER CONTRACT.
const rows = JSON.parse(input.rows).value.map(r => r.values[0]);
const only = String(input.only || "").split(",").map(s => s.trim()).filter(Boolean);
const want = String(input.collections || "IH,PC").split(",");
const list = [];
rows.forEach(v => {
  const code = String(v[0] || ""), id = String(v[6] || "").trim();
  const coll = code.slice(0, 2);
  if (!/^\d+$/.test(id) || !want.includes(coll)) return;
  if (only.length && !only.includes(code)) return;
  list.push({ code, id, suffix: coll === "PC" ? "_RANGE" : "_PROMO" });
});
return { list, count: list.length };
