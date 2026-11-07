const list = (v, key) => Array.isArray(v) ? v : (v && Array.isArray(v[key]) ? v[key] : []);
const conns = list(input.conns, "connections");
const scens = list(input.scens, "scenarios");
const gags = list(input.gags, "value");
const reg = list(input.reg, "value");

let today;
try { today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }); } catch (e) { today = new Date().toISOString().slice(0, 10); }
const plus7 = new Date(Date.parse(today + "T00:00:00Z") + 7 * 86400000).toISOString().slice(0, 10);

const toISO = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n < 20000 || n > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
  }
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
};
const rowVals = (r) => (r && Array.isArray(r.values) ? (Array.isArray(r.values[0]) ? r.values[0] : r.values) : Array.isArray(r) ? r : []);

// Connections: skip ones superseded by a newer login to the same account.
const connections = conns.filter((c) => c && c.expire).filter((c) =>
  !conns.some((o) => o !== c && o.accountName === c.accountName && o.uid && o.uid === c.uid && o.expire && Date.parse(o.expire) > Date.parse(c.expire))
).map((c) => ({
  id: c.id, name: c.name, label: c.accountLabel || c.accountName, expire: c.expire,
  usedBy: Array.isArray(c.scenarioUsages) ? c.scenarioUsages.map((u) => u.name) : undefined,
}));

const scenarios = scens.map((s) => ({ id: s.id, name: s.name, errors: s.errors || 0, dlq: s.dlqCount || 0 }));

const built = new Set(reg.map((r) => String(rowVals(r)[0] || "").trim()).filter(Boolean));
const types = [[8, "T-SHIRT"], [9, "LONG-SLEEVE"], [10, "SWEATSHIRT"], [11, "HOODIE"]];
const upcoming = [];
const last = {};
for (const r of gags) {
  const v = rowVals(r);
  const gag = String(v[0] || "").trim();
  if (!gag || !String(v[1] || "").trim()) continue; // skip placeholder rows with no gag text
  const coll = String(v[2] || "").trim() || "Other";
  for (const [col, type] of types) {
    const d = toISO(v[col]);
    if (!d) continue;
    if (!last[coll] || d > last[coll]) last[coll] = d;
    if (d >= today && d <= plus7) {
      upcoming.push({ date: d, gag, title: String(v[6] || "").trim(), type, collection: coll, built: built.has(`${gag}-${type}`) });
    }
  }
}
upcoming.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.gag < b.gag ? -1 : 1));
const runway = Object.keys(last).sort().map((c) => ({ collection: c, lastDate: last[c] }));

return { json: JSON.stringify({ today, connections, scenarios, upcoming, runway }) };
