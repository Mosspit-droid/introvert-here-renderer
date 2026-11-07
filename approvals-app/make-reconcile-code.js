const rows = typeof input.rows === "string" ? JSON.parse(input.rows).value : input.rows.value;
const parts = String(input.results || "").split("␞").filter(Boolean);
const state = {}; let returned = 0;
parts.forEach(p => { let d; try { d = JSON.parse(p); } catch (e) { return; } (d.results || []).forEach(l => { state[String(l.listing_id)] = String(l.state || ""); returned++; }); });
const expectedIds = Number(input.idCount || 0);
const map = s => s === "active" ? "LIVE" : s === "draft" ? "ETSY_DRAFT_READY_FOR_REVIEW" : "ETSY_STATE_" + s.toUpperCase();
const column = []; const changes = [];
rows.forEach((r, i) => {
  const v = r.values && r.values[0] ? r.values[0] : [];
  const cur = v[29] == null ? "" : String(v[29]);
  const id = String(v[6] == null ? "" : v[6]).trim();
  let next = cur;
  if (id && /^\d+$/.test(id)) next = state[id] !== undefined ? map(state[id]) : "ETSY_LISTING_DELETED";
  column.push([next]);
  if (next !== cur) changes.push((i + 2) + ": " + cur + " -> " + next);
});
// Safety: if Etsy returned nothing at all, write nothing (avoids marking everything deleted).
const safe = expectedIds === 0 || returned > 0;
return { safe, changed: safe && changes.length > 0, changeCount: changes.length, changes: changes.join("\n"), lastRow: rows.length + 1, body: JSON.stringify({ values: column }), returned, expectedIds };
