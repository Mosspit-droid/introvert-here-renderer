// Which page to export and where it goes on this listing, for a one-photo job (key like "SETUP#2").
const pages = (Array.isArray(input.pages) ? input.pages : []).map(function (p) { return { pos: Number(p.pos), name: String(p.name || "") }; });
const key = String(input.key || "");
const HERO_COLOURS = { "INTROVERT HERE": ["Black", "Dark Heather"], "SHHH": ["Dark Heather"], "PER CONTRACT": ["Navy", "Dark Heather", "Black"], "OFF THE SHELF": ["Maroon", "Forest Green", "Dark Chocolate"] };
const gm = /-(\d+)-/.exec(String(input.productCode || "")); const gagNum = gm ? parseInt(gm[1], 10) : 1;
const cu = String(input.collection || "").toUpperCase(); let hero = "";
Object.keys(HERO_COLOURS).some(function (k) { if (cu.indexOf(k) === 0) { const c = HERO_COLOURS[k]; hero = c[(Math.max(1, gagNum) - 1) % c.length]; return true; } return false; });
__PHOTOPLAN__
const plan = photoPlan(pages, hero);
const hit = plan.filter(function (x) { return x.key === key && !x.thumb; })[0];
if (!hit) return { found: false, reason: "No " + key + " page for this garment", hero: hero };
const s1 = Number(input.slot1) || 0, s2 = Number(input.slot2) || 0;
return { found: true, pos: hit.pos, rank: hit.rank, name: hit.name, video: hit.rank === s1 || hit.rank === s2, hero: hero };
