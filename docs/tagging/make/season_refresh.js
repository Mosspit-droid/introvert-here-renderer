// Seasonal tag refresh (runs daily before the builder). For each live listing, any seasonal tag that is out of season
// today is swapped for an in-season phrase from SEASON_POOL. Each gag gets its own rotation so listings don't all share
// the same pair. Only tags from SEASON_POOL are touched; gag, product and title tags never change.
const rows = (s) => JSON.parse(s).value.map((r) => ({ index: r.index, v: r.values[0] }));
const LT = rows(input.listingTags), SP = rows(input.seasonPool), GT = rows(input.gagTags), REG = rows(input.registry);
const today = String(input.today || new Date().toISOString().slice(0, 10));
const md = Number(today.slice(5, 7)) * 100 + Number(today.slice(8, 10));
const inWindow = (s, e) => (s <= e ? md >= s && md <= e : md >= s || md <= e);
const pool = SP.map((x) => ({ tag: String(x.v[0] || "").trim().toLowerCase(), s: Number(x.v[2]), e: Number(x.v[3]), on: String(x.v[4]).toUpperCase() === "Y", ok: x.v[6] === true || String(x.v[6]).toUpperCase() === "TRUE" })).filter((p) => p.tag && p.on && p.ok);
const seasonal = new Set(pool.map((p) => p.tag));
const inSeason = pool.filter((p) => inWindow(p.s, p.e)).map((p) => p.tag).sort();
const split = (s) => { s = String(s || ""); return s.startsWith("|") && s.endsWith("|") ? s.slice(1, -1).split("|").filter(Boolean) : []; };
const listingId = {}; REG.forEach((x) => { const code = String(x.v[0] || "").trim(), id = String(x.v[6] || "").trim(); if (code && id) listingId[code] = id; });
const gagRow = {}; GT.forEach((x) => { gagRow[String(x.v[0] || "").trim()] = x.index + 2; });
const max = Number(input.max) || 40;
const byGag = {};
LT.forEach((x) => { const code = String(x.v[0] || "").trim(), gag = String(x.v[1] || "").trim(); if (code && gag && listingId[code]) (byGag[gag] = byGag[gag] || []).push({ x, code, tags: split(x.v[3]) }); });
const updates = [], gagPatches = [];
for (const gag of Object.keys(byGag).sort()) {
  const ls = byGag[gag];
  const stale = new Set(); ls.forEach((l) => l.tags.forEach((t) => { if (seasonal.has(t) && !inSeason.includes(t)) stale.add(t); }));
  if (!stale.size) continue;
  // This gag's rotation through the in-season phrases.
  const n = Number(gag.replace(/\D/g, "")) || 0, rot = inSeason.map((_, i) => inSeason[(i + n) % inSeason.length]);
  // Too few in-season phrases: top up with all-year gift phrases so no stale holiday tag is left behind.
  const EVERGREEN = ["birthday gift", "introvert gift", "gift for introvert", "funny gift idea", "gift for friend"];
  EVERGREEN.forEach((t, i) => { const e = EVERGREEN[(i + n) % EVERGREEN.length]; if (!rot.includes(e)) rot.push(e); });
  let pair = null;
  for (const l of ls) {
    const keep = l.tags.filter((t) => !stale.has(t));
    const pick = rot.filter((t) => !keep.includes(t)).slice(0, l.tags.length - keep.length);
    if (pick.length < l.tags.length - keep.length) continue; // not enough fresh phrases: leave this listing alone
    const next = l.tags.map((t) => (stale.has(t) ? pick.shift() : t));
    if (new Set(next).size !== next.length) continue;
    if (updates.length >= max) break;
    updates.push({ listingId: listingId[l.code], code: l.code, ltRow: l.x.index + 2, tags: next, tagsFinal: "|" + next.join("|") + "|" });
    pair = next.filter((t, i) => seasonal.has(l.tags[i])).slice(0, 2); // the gag's seasonal pair, as now on Etsy
  }
  if (pair && pair.length === 2 && gagRow[gag]) gagPatches.push({ row: gagRow[gag], seas: "|" + pair.join("|") + "|" });
  if (updates.length >= max) break;
}
return { updates, gagPatches, count: updates.length, summary: updates.length ? "Seasonal tags refreshed on " + updates.length + " listing" + (updates.length === 1 ? "" : "s") + " (now in season: " + inSeason.slice(0, 6).join(", ") + ")." : "" };
