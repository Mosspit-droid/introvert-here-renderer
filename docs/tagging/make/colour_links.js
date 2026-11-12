// Link each colour on the Etsy listing to Barry's own mockup in that colour (Etsy shows it when a shopper picks the colour).
// Pages are named like IH_01_TS_THUMBNAIL_BLACK / IH_02_TS_THUMBNAIL_DARK_HEATHER; the colour is the end of the name.
// Thumbnails win over other pages of the same colour. Unmatched colours are left without a linked photo.
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
const inv = typeof input.inventory === "string" ? JSON.parse(input.inventory || "{}") : (input.inventory || {});
const pages = (Array.isArray(input.pages) ? input.pages : []).filter((p) => p && p.image && p.page);
let prop = null; const values = {};
(inv.products || []).forEach((pr) => (pr.property_values || []).forEach((pv) => {
  if (!/colou?r/i.test(String(pv.property_name || ""))) return;
  prop = pv.property_id;
  (pv.values || []).forEach((v, i) => { const id = (pv.value_ids || [])[i]; if (id != null) values[norm(v)] = { id, name: v }; });
}));
const links = [];
if (prop != null) {
  for (const key of Object.keys(values)) {
    const hit = pages.filter((p) => norm(p.page).endsWith(key)).sort((a, b) => (/THUMBNAIL/i.test(b.page) ? 1 : 0) - (/THUMBNAIL/i.test(a.page) ? 1 : 0))[0];
    if (hit) links.push({ property_id: prop, value_id: values[key].id, image_id: Number(hit.image) });
  }
}
return { body: JSON.stringify({ variation_images: links }), count: links.length, colours: Object.values(values).map((v) => v.name).join(", ") };
