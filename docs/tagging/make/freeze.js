// Freeze approved tag sets (runs at the start of each build).
// input.read = Graph $batch reply with: t GAG_TAGS, p TAG_POOL, f PRODUCT_TAGS_FLAT, s TAG_SETTINGS A2:B14, r GAG_TAGS row-2 formulas, g GAGS GAG_IDs.
// Modes: TagEngine ON -> freeze every approved, unfrozen gag. DryRun -> freeze test gags (IH-999…) only, report real ones as "would freeze".
// Engine OFF and no dry run -> nothing is frozen (only the season date and new-gag rows are kept up to date).
const J = (v) => (typeof v === "string" ? JSON.parse(v) : v || {});
const BY = {}; (J(input.read).responses || []).forEach((x) => { BY[x.id] = x.body; });
if (input.read) { input.tags = BY.t; input.pool = BY.p; input.prod = BY.f; input.settings = BY.s; }
const vals = (v) => { const o = J(v); return Array.isArray(o) ? o : (o.values || []); };
const S = {}; vals(input.settings).forEach((r) => { if (r && r[0]) S[String(r[0]).trim()] = r[1]; });
const yes = (v) => v === true || String(v).toUpperCase() === "TRUE" || String(v).toUpperCase() === "ON";
const engineOn = yes(S.TagEngine), dryRun = yes(S.DryRun), dryId = String(S.DryRunGagId || "").trim();
const cap = Number(S.TagCap) || 3, maxLen = Number(S.TagMaxLen) || 20, maxWords = Number(S.StemMaxWords) || 4;
const allowed = String(S.TagAllowed || "abcdefghijklmnopqrstuvwxyz0123456789 '-");
const today = String(input.today || new Date().toISOString().slice(0, 10)).slice(0, 10);

const T = vals(input.tags), H = T[0] || [], c = (n) => H.indexOf(n);
const P = vals(input.pool), F = vals(input.prod);
const split = (s) => { s = String(s || ""); return s.startsWith("|") && s.endsWith("|") ? s.slice(1, -1).split("|").filter(Boolean) : []; };
const tagErr = (t) => {
  if (!t) return "empty tag";
  if (t.length > maxLen) return `"${t}" is over ${maxLen} characters`;
  if (t[0] === "'" || t[0] === "-") return `"${t}" starts with ' or -`;
  if ([...t].some((ch) => !allowed.includes(ch))) return `"${t}" has a character Etsy rejects`;
  if (t.includes("  ")) return `"${t}" has a double space`;
  return "";
};
// Flavour phrases per type, and how many gags had each frozen when this run started.
const flavour = {}; P.slice(1).forEach((r) => { if (r[1] === "GAG" && r[2] === "Flavour") (flavour[r[0]] = flavour[r[0]] || new Set()).add(String(r[5] || "").trim()); });
const usesAtStart = {}, uses = {};
T.slice(1).forEach((r) => split(r[c("GAG5_FROZEN")]).forEach((t) => { usesAtStart[t] = (usesAtStart[t] || 0) + 1; }));
Object.assign(uses, usesAtStart);
const prodBy = {}; F.slice(1).forEach((r) => { (prodBy[r[0] + "|" + r[1]] = prodBy[r[0] + "|" + r[1]] || []).push(String(r[3] || "").trim()); });
const garments = ["T-SHIRT", "LONG-SLEEVE", "SWEATSHIRT", "HOODIE"];

let deferred = 0;
const patches = [], frozen = {}, would = {}, report = [];
const rows = T.slice(1).map((r, i) => ({ r, row: i + 2 })).filter((x) => x.r[0] && x.r[1])
  .sort((a, b) => String(a.r[0]).localeCompare(String(b.r[0])));
for (const { r, row } of rows) {
  const id = String(r[0]);
  if (String(r[c("GAG5_FROZEN")] || "") !== "") continue;            // already frozen: never rewritten
  if (r[c("APPROVED")] !== true) continue;                              // only explicit approvals
  const isTest = id.startsWith("IH-999");
  const act = engineOn && !dryRun ? true : dryRun ? isTest : false;
  if (!engineOn && !dryRun) continue;
  const stem = String(r[c("TAG13")] || "").trim().toLowerCase();
  const g5 = split(r[c("GAG5_SUGGESTED")]), s2 = split(r[c("SEAS2_SUGGESTED")]);
  if (act && patches.length + 2 > 15) { deferred++; continue; }    // one Graph batch per run; the rest freeze tomorrow
  const why = [];
  const se = tagErr(stem); if (se) why.push("stem: " + se);
  if (stem.split(" ").length > maxWords) why.push(`stem has more than ${maxWords} words`);
  if (g5.length !== 5) why.push(`needs 5 gag-level tags (has ${g5.length})`);
  if (s2.length !== 2) why.push(`needs 2 seasonal/gift tags (has ${s2.length})`);
  [...g5, ...s2].forEach((t) => { const e = tagErr(t); if (e) why.push(e); });
  for (const gt of garments) {
    const p = prodBy[r[c("COLLECTION")] + "|" + gt] || [];
    const all = [...g5, ...s2, ...p, stem].map((x) => x.toLowerCase());
    if (p.length !== 5 || new Set(all).size !== 13) { why.push(`${gt.toLowerCase()}: the 13 tags are not all different`); break; }
  }
  // Reservation: a flavour phrase that was free when the run started but has filled up during this run is a race. Reject.
  const fl = flavour[r[1]] || new Set();
  const raced = g5.filter((t) => fl.has(t) && (usesAtStart[t] || 0) < cap && (uses[t] || 0) >= cap);
  if (raced.length) why.push(`"${raced.join('", "')}" was just used up by another gag; check the new suggestion and approve again`);
  if (why.length) {
    if (act) patches.push({ address: `N${row}`, values: [[false]] }, { address: `S${row}`, values: [["Not frozen " + today + ": " + why.join("; ")]] });
    report.push({ id, result: act ? "rejected" : "would be rejected", why: why.join("; ") });
    continue;
  }
  g5.forEach((t) => { uses[t] = (uses[t] || 0) + 1; });
  const set = { stem, gag5: g5, seas2: s2 };
  if (act) {
    patches.push({ address: `O${row}:S${row}`, values: [[stem, "|" + g5.join("|") + "|", "|" + s2.join("|") + "|", today, "Frozen " + today]] });
    frozen[id] = set; report.push({ id, result: "frozen" });
  } else { would[id] = set; report.push({ id, result: "would freeze" }); }
}
// New gags saved since the last run get a GAG_TAGS row; rows added from outside need their formulas re-entered before Excel calculates them.
const pre = [];
const f2 = ((J(BY.r).formulas || [])[0] || []), known = new Set(T.slice(1).map((r) => String(r[0])));
const formulasFor = (isNew) => f2.map((x, i) => (i === 13 ? (isNew ? false : null) : String(x).startsWith("=") ? x : null));
if (f2.length) {
  const missing = vals(BY.g).map((r) => String(r[0] || "").trim()).filter((id) => /^[A-Z]{2}-\d{5}$/.test(id) && !known.has(id)).slice(0, 5);
  if (missing.length) {
    pre.push({ method: "POST", path: "/tables/GAG_TAGS/rows/add", body: { values: missing.map((id) => [id, ...Array(H.length - 1).fill(null)]) } });
    const first = T.length + 1;
    pre.push({ method: "PATCH", path: `/worksheets/GAG_TAGS/range(address='A${first}:AC${first + missing.length - 1}')`, body: { formulas: missing.map((id) => [id, ...formulasFor(true).slice(1)]) } });
  }
  T.slice(1).forEach((r, i) => { if (pre.length < 4 && r[1] && String(r[c("TAG_STATUS")] || "") === "") pre.push({ method: "PATCH", path: `/worksheets/GAG_TAGS/range(address='A${i + 2}:AC${i + 2}')`, body: { formulas: [[r[0], ...formulasFor(false).slice(1)]] } }); });
}
const [y, m, d] = today.split("-").map(Number);
pre.unshift({ method: "PATCH", path: "/worksheets/TAG_SETTINGS/range(address='B3')", body: { formulas: [[`=DATE(${y},${m},${d})`]] } });
const status = {}; T.slice(1).forEach((r) => { if (r[1]) status[r[0]] = String(r[c("TAG_STATUS")] || ""); });
// Graph $batch body (max 20 requests). Always at least one harmless read so the step never has nothing to send.
const base = String(input.base || "");
const all = [...pre, ...patches.map((p) => ({ method: "PATCH", path: `/worksheets/GAG_TAGS/range(address='${p.address}')`, body: { values: p.values } }))];
const reqs = all.map((p, i) => ({ id: String(i + 1), method: p.method, url: base + p.path, headers: { "Content-Type": "application/json" }, body: p.body, ...(i ? { dependsOn: [String(i)] } : {}) }));
reqs.push({ id: "99", method: "GET", url: base + "/worksheets/TAG_SETTINGS/range(address='B2')?$select=values", ...(reqs.length ? { dependsOn: [String(reqs.length)] } : {}) });
// Gags that may be built today: frozen already (READY), frozen this run, or (dry run only) would freeze.
const ready = []; T.slice(1).forEach((r) => { if (r[c("TAG_STATUS")] === "READY") ready.push(String(r[0])); });
const sets = {}; T.slice(1).forEach((r) => { if (String(r[c("GAG5_FROZEN")] || "")) sets[r[0]] = { stem: String(r[c("STEM_FROZEN")]), gag5: split(r[c("GAG5_FROZEN")]), seas2: split(r[c("SEAS2_FROZEN")]) }; });
Object.assign(sets, frozen, would);
return { engineOn, dryRun, dryId, tagMode: engineOn || dryRun, status: JSON.stringify(status), repairs: pre.length - 1, batch: JSON.stringify({ requests: reqs }), ready: JSON.stringify([...new Set([...ready, ...Object.keys(frozen), ...Object.keys(would)])]),
  sets: JSON.stringify(sets), report: (() => { const g = (k) => report.filter((x) => x.result === k).map((x) => x.id + (x.why ? " (" + x.why + ")" : ""));
    return [["Frozen", g("frozen")], ["Would freeze", g("would freeze")], ["Not frozen", g("rejected")], ["Would not freeze", g("would be rejected")]]
      .filter(([, v]) => v.length).map(([k, v]) => k + ": " + v.join(", ")).join("\n") || "nothing to freeze"; })(), patchCount: patches.length, deferred };
