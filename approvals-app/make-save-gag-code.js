const list = (v, key) => Array.isArray(v) ? v : (v && Array.isArray(v[key]) ? v[key] : []);
const rowVals = (r) => (r && Array.isArray(r.values) ? (Array.isArray(r.values[0]) ? r.values[0] : r.values) : Array.isArray(r) ? r : []);
const str = (v) => (v === null || v === undefined ? "" : String(v)).trim();
const toISO = (v) => {
  const s = str(v);
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); if (n < 20000 || n > 80000) return null; return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10); }
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
};
const TYPES = ["T-SHIRT", "LONG-SLEEVE", "SWEATSHIRT", "HOODIE"];
const parseGags = (rowsIn) => list(rowsIn, "value").map((r, i) => {
  const v = rowVals(r);
  return { index: typeof r.index === "number" ? r.index : i, id: str(v[0]), text: str(v[1]) ? String(v[1]).replace(/\r\n?/g, "\n").replace(/\s+$/, "") : "", collection: str(v[2]), category: str(v[3]),
    tag12: str(v[4]), tag13: str(v[5]), stem: str(v[6]), status: str(v[7]), dates: [8, 9, 10, 11].map((c) => toISO(v[c])) };
}).filter((g) => g.id);
const prefixOf = (id) => { const m = /^([A-Z]+)-(\d+)$/.exec(id); return m ? m[1] : null; };
const numOf = (id) => { const m = /^([A-Z]+)-(\d+)$/.exec(id); return m ? Number(m[2]) : 0; };
// collection name -> ID prefix, learnt from gags that have both
const prefixMap = (gags) => { const c = {}; for (const g of gags) { const p = prefixOf(g.id); if (g.collection && p) { c[g.collection] = c[g.collection] || {}; c[g.collection][p] = (c[g.collection][p] || 0) + 1; } }
  const out = {}; for (const [k, v] of Object.entries(c)) out[k] = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0]; return out; };
const req = input;
const gags = parseGags(input.gags);
const built = new Set(list(input.reg, "value").map((r) => str(rowVals(r)[0])).filter(Boolean));
const out = (o) => ({ op: o.op, rowNum: o.rowNum || 0, gagId: o.gagId || "", message: o.message || "", valuesJson: o.values ? JSON.stringify({ values: [o.values] }) : "" });
const fail = (message) => out({ op: "error", gagId: str(req.gagId), message });
const action = str(req.action);
const text = String(req.text || "").replace(/\r\n?/g, "\n").replace(/\s+$/, "");
const collection = str(req.collection), category = str(req.category), stem = str(req.stem);
const dates = [req.d1, req.d2, req.d3, req.d4].map(toISO);
if (!["fill", "append", "edit"].includes(action)) return fail("Unknown action.");
if (!text) return fail("The gag text is empty.");
if (!collection) return fail("No collection chosen.");
if (!category) return fail("No category chosen.");
if (!stem) return fail("No title stem.");
// All four dates blank = backlog (saved, never released until dates are added). Otherwise all four are needed.
if (dates.some((d) => !d) && !dates.every((d) => !d)) return fail("Fill in all four release dates, or leave all four empty to keep the gag in the backlog.");
const fields = [text, collection, category, str(req.tag12), str(req.tag13), stem];
// ELLIPSIS_CHECK (column M): every gag should start with "..." or "…"
const ellipsis = /^\s*(\.\.\.|…)/.test(text) ? "OK" : "MISSING";
if (action === "append") {
  const pmap = prefixMap(gags); const p = pmap[collection];
  if (!p) return fail(`Can't work out the ID prefix for "${collection}" - no existing gags in that collection.`);
  if (gags.some((g) => prefixOf(g.id) === p && !g.text)) return fail(`There's now an empty prepared ${p} row in Core - refresh and it will be filled instead.`);
  const max = gags.reduce((m, g) => (prefixOf(g.id) === p ? Math.max(m, numOf(g.id)) : m), 0);
  const id = `${p}-${String(max + 1).padStart(5, "0")}`;
  return out({ op: "add", gagId: id, values: [id, ...fields, "READY_FOR_RELEASE", ...dates, ellipsis], message: `Added to Core as a new row: ${id}` });
}
let g = gags.find((x) => x.id === str(req.gagId));
if (!g) return fail(`${str(req.gagId)} isn't in GAGS any more - refresh.`);
let note = "";
if (action === "fill" && g.text) {
  // That prepared row got used in the meantime (e.g. two gags saved quickly) - use the next empty one instead.
  const taken = g.id;
  const nxt = gags.find((x) => prefixOf(x.id) === prefixOf(taken) && !x.text);
  const useSlotDates = str(req.datesFromSlot) === "true";
  if (!nxt) {
    const p = prefixOf(taken);
    const max = gags.reduce((m, x) => (prefixOf(x.id) === p ? Math.max(m, numOf(x.id)) : m), 0);
    const id = `${p}-${String(max + 1).padStart(5, "0")}`;
    let ds = dates;
    if (useSlotDates) { let latest = null; for (const x of gags) for (const d of x.dates) if (d && (!latest || d > latest)) latest = d;
      const plus1 = new Date(Date.parse(latest + "T00:00:00Z") + 86400000).toISOString().slice(0, 10); ds = [plus1, plus1, plus1, plus1]; }
    return out({ op: "add", gagId: id, values: [id, ...fields, "READY_FOR_RELEASE", ...ds, ellipsis], message: `${taken} was already taken, so it went into a new row: ${id}` });
  }
  if (useSlotDates && nxt.dates.every(Boolean)) dates.splice(0, 4, ...nxt.dates);
  note = `${taken} was already taken, so it went into the next prepared row: `;
  g = nxt;
}
if (action === "edit") {
  if (!g.text) return fail(`${g.id} is empty - nothing to edit.`);
  if (g.status === "LIVE_EXISTING" || TYPES.some((t) => built.has(`${g.id}-${t}`))) return fail(`${g.id} already has listings built, so it can't be edited here (it needs an amendment).`);
}
return out({ op: "patch", rowNum: g.index + 2, gagId: g.id, values: [null, ...fields, action === "fill" ? "READY_FOR_RELEASE" : null, ...dates, ellipsis],
  message: action === "fill" ? (note ? note + g.id : `Added to Core in prepared row ${g.id}`) : `${g.id} updated in Core` });
