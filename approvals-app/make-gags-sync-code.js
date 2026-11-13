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
    tag12: str(v[4]), tag13: str(v[5]), stem: str(v[6]), rawStem: v[6] == null ? "" : String(v[6]), status: str(v[7]), dates: [8, 9, 10, 11].map((c) => toISO(v[c])) };
}).filter((g) => g.id);
const prefixOf = (id) => { const m = /^([A-Z]+)-(\d+)$/.exec(id); return m ? m[1] : null; };
const numOf = (id) => { const m = /^([A-Z]+)-(\d+)$/.exec(id); return m ? Number(m[2]) : 0; };
// collection name -> ID prefix, learnt from gags that have both
const prefixMap = (gags) => { const c = {}; for (const g of gags) { const p = prefixOf(g.id); if (g.collection && p) { c[g.collection] = c[g.collection] || {}; c[g.collection][p] = (c[g.collection][p] || 0) + 1; } }
  const out = {}; for (const [k, v] of Object.entries(c)) out[k] = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0]; return out; };
const gags = parseGags(input.gags);
const built = new Set(list(input.reg, "value").map((r) => str(rowVals(r)[0])).filter(Boolean));
const collections = (input.lists && Array.isArray(input.lists.values) ? input.lists.values : []).map((r) => str(Array.isArray(r) ? r[0] : r)).filter(Boolean);
const categories = (input.cats && Array.isArray(input.cats.values) ? input.cats.values.slice(1) : list(input.cats, "value").map(rowVals)).map((r) => str(r[0])).filter(Boolean);
const pmap = prefixMap(gags);
let latest = null; const maxNum = {};
for (const g of gags) { for (const d of g.dates) if (d && (!latest || d > latest)) latest = d; const p = prefixOf(g.id); if (p) maxNum[p] = Math.max(maxNum[p] || 0, numOf(g.id)); }
const plus1 = latest ? new Date(Date.parse(latest + "T00:00:00Z") + 86400000).toISOString().slice(0, 10) : null;
const perCollection = {};
for (const c of collections) {
  const p = pmap[c] || null;
  const empty = p ? gags.find((g) => prefixOf(g.id) === p && !g.text) : null;
  perCollection[c] = {
    prefix: p,
    next: empty ? { mode: "fill", id: empty.id, dates: empty.dates } :
      { mode: "append", id: p ? `${p}-${String((maxNum[p] || 0) + 1).padStart(5, "0")}` : null, dates: [plus1, plus1, plus1, plus1] },
    emptyLeft: p ? gags.filter((g) => prefixOf(g.id) === p && !g.text).length : 0,
  };
}
const editable = gags.filter((g) => g.text && g.status !== "LIVE_EXISTING" && !TYPES.some((t) => built.has(`${g.id}-${t}`)))
  .map((g) => ({ id: g.id, text: g.text, collection: g.collection, category: g.category, tag12: g.tag12, tag13: g.tag13, stem: g.stem, dates: g.dates }));
// Every written gag, compact, for the app's "Check Core for problems" tool.
const all = gags.filter((g) => g.text).map((g) => ({ id: g.id, row: g.index + 2, text: g.text, stem: g.rawStem, status: g.status, t12: g.tag12, t13: g.tag13 }));
// Full release schedule for the app's Calendar: every written gag with a date from two weeks ago on,
// including part-live gags, with which garments are already built.
const cutoff = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
const sched = gags.filter((g) => g.text && g.dates.some((d) => d && d >= cutoff))
  .map((g) => ({ id: g.id, s: g.stem, d: g.dates, b: TYPES.map((t) => (built.has(`${g.id}-${t}`) ? 1 : 0)) }));
return { json: JSON.stringify({ at: Date.now(), collections, categories, perCollection, latestDate: latest, editable, all, sched }) };
