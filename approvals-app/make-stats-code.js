const rows = JSON.parse(input.rows).value.map(r => (r.values && r.values[0]) || []);
const parts = String(input.results || "").split("␞").filter(Boolean);
const L = {};
parts.forEach(p => { try { (JSON.parse(p).results || []).forEach(l => { L[String(l.listing_id)] = l; }); } catch (e) {} });
const s = v => (v == null ? "" : String(v)).trim();
const byProduct = {}, byStem = {};
const listings = [];
rows.forEach(v => {
  const code = s(v[0]); if (!code) return;
  const id = s(v[6]); const l = L[id];
  const item = { code, coll: s(v[1]), type: s(v[2]), stem: s(v[4]), listingId: id, url: id ? "https://www.etsy.com/listing/" + id : "",
    state: l ? s(l.state) : (id ? "missing" : "not built"), views: l ? Number(l.views || 0) : 0, favs: l ? Number(l.num_favorers || 0) : 0,
    price: l && l.price ? Number(l.price.amount) / Number(l.price.divisor || 100) : null };
  listings.push(item);
  if (s(v[8])) byProduct[s(v[8])] = code;
  if (item.stem) byStem[item.stem.toLowerCase() + "|" + item.type.replace(/[^A-Z]/gi, "").toLowerCase()] = code;
});
let od = {}; try { od = JSON.parse(input.orders || "{}"); } catch (e) {}
const orders = [];
(od.data || []).forEach(o => {
  if (String(o.status || "") === "canceled") return;
  if (String((o.metadata || {}).order_type || "") === "sample") return; // your own sample orders are not sales
  (o.line_items || []).forEach(li => {
    const md = li.metadata || {};
    const title = s(md.title);
    const stem = title.split(" | ")[0].toLowerCase();
    const typeGuess = /hoodie/i.test(title) ? "hoodie" : /sweatshirt/i.test(title) ? "sweatshirt" : /long sleeve/i.test(title) ? "longsleeve" : "tshirt";
    const code = byProduct[s(li.product_id)] || byStem[stem + "|" + typeGuess] || "";
    orders.push({ date: s(o.created_at).slice(0, 10), title, variant: s(md.variant_label), qty: Number(li.quantity || 1),
      price: Number(md.price || 0) / 100, cost: (Number(li.cost || 0) + Number(li.shipping_cost || 0)) / 100, code, status: s(o.status) });
  });
});
return { json: JSON.stringify({ at: new Date().toISOString(), listings, orders, orderTotal: od.total || orders.length }) };
