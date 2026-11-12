// Which pages to export and where each goes on this listing, for a photo job (keys like ["SETUP#1","PAYOFF#1"]).
const pages = (Array.isArray(input.pages) ? input.pages : []).map(function (p) { return { pos: Number(p.pos), name: String(p.name || "") }; });
let keys = input.keys;
if (typeof keys === "string") { try { keys = JSON.parse(keys); } catch (e) { keys = keys.split(","); } }
keys = (Array.isArray(keys) ? keys : []).map(String).filter(Boolean);
if (!keys.length && input.key) keys = [String(input.key)];
const HERO_COLOURS = { "INTROVERT HERE": ["Black", "Dark Heather"], "SHHH": ["Dark Heather"], "PER CONTRACT": ["Navy", "Dark Heather", "Black"], "OFF THE SHELF": ["Maroon", "Forest Green", "Dark Chocolate"] };
const gm = /-(\d+)-/.exec(String(input.productCode || "")); const gagNum = gm ? parseInt(gm[1], 10) : 1;
const cu = String(input.collection || "").toUpperCase(); let hero = "";
Object.keys(HERO_COLOURS).some(function (k) { if (cu.indexOf(k) === 0) { const c = HERO_COLOURS[k]; hero = c[(Math.max(1, gagNum) - 1) % c.length]; return true; } return false; });
__PHOTOPLAN__
const plan = photoPlan(pages, hero);
const s1 = Number(input.slot1) || 0, s2 = Number(input.slot2) || 0;
const hits = plan.filter(function (x) { return !x.thumb && keys.indexOf(x.key) >= 0; }).sort(function (a, b) { return a.pos - b.pos; });
if (!hits.length) return { found: false, reason: "None of " + keys.join(", ") + " on this garment", hero: hero, pages: [], posList: "" };
const list = hits.map(function (x, i) { return { idx: i + 1, pos: x.pos, rank: x.rank, name: x.name }; });
return { found: true, pages: list, posList: list.map(function (x) { return x.pos; }).join(","), video: hits.some(function (x) { return x.rank === s1 || x.rank === s2; }), hero: hero,
  pos: list[0].pos, rank: list[0].rank, name: list[0].name };
