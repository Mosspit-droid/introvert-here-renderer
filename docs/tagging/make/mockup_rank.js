const pages = Array.isArray(input.pages) ? input.pages : [];
const mockupCount = Number(input.mockupCount) || 0;
const hero = String(input.heroColour || "").toUpperCase().replace(/\s+/g, "_");
const nm = function(p){ return String(p.page_name || "").toUpperCase(); };
// Rank by list order (pages sorted by position), so a listing can use any set of template pages.
const sorted = pages.slice().sort(function(a, b){ return Number(a.position) - Number(b.position); });
const thumbs = sorted.filter(function(p){ return /THUMBNAIL/.test(nm(p)); });
// Colours this template comes in = the colour endings on its thumbnails (e.g. BLACK, DARK_HEATHER).
const colours = thumbs.map(function(p){ const m = nm(p).match(/THUMBNAIL_(.+)$/); return m ? m[1] : ""; })
  .filter(Boolean).sort(function(a, b){ return b.length - a.length; });
const colourOf = function(p){ const n = nm(p); return colours.find(function(c){ return n.endsWith("_" + c); }) || ""; };
// Same picture in another colour = same name once the "IH_12_" prefix and the colour ending are dropped.
const baseOf = function(p){ const c = colourOf(p); let n = nm(p).replace(/^[A-Z]+_\d+_/, ""); return c ? n.slice(0, -(c.length + 1)) : n; };
// Non-thumbnail pages: keep one colour of each picture, the lead colour if the template has it, else Black, else the first.
// The kept page takes the slot of the first copy, so photo positions (and the video slots) never move.
const groups = {};
sorted.forEach(function(p){
  if (/THUMBNAIL/.test(nm(p)) || !colourOf(p)) return;
  const b = baseOf(p); (groups[b] = groups[b] || {})[colourOf(p)] = ((groups[b] || {})[colourOf(p)] || []).concat([p]);
});
const swap = new Map(), drop = new Set();
Object.keys(groups).forEach(function(b){
  const g = groups[b];
  const want = g[hero] ? hero : (g.BLACK ? "BLACK" : Object.keys(g)[0]);
  const n = Math.max.apply(null, Object.keys(g).map(function(c){ return g[c].length; }));
  for (let k = 0; k < n; k++) {
    // k-th copy of this picture in each colour (a template can use the same picture twice, e.g. two setups).
    const copies = Object.keys(g).map(function(c){ return g[c][k]; }).filter(Boolean)
      .sort(function(a, b){ return Number(a.position) - Number(b.position); });
    const keep = (g[want] && g[want][k]) || copies[0];
    copies.forEach(function(p){ if (p !== copies[0]) drop.add(p); });
    swap.set(copies[0], keep);
  }
});
let order = sorted.filter(function(p){ return !drop.has(p); }).map(function(p){ return swap.get(p) || p; });
// The thumbnail in this listing's lead colour goes first; the other thumbnails and every other page keep their order.
const lead = hero ? thumbs.find(function(p){ return nm(p).endsWith("_" + hero); }) : null;
if (lead && thumbs.length > 1 && lead !== thumbs[0]) {
  const at = order.indexOf(thumbs[0]);
  order = order.filter(function(p){ return p !== lead; });
  order.splice(at, 0, lead);
}
const list = order.map(function(p, i){
  return { position: Number(p.position), page_name: p.page_name, rank: i === 0 ? 1 : (i + 1 + mockupCount) };
});
return { list: list, lead: order.length ? order[0].page_name : null, colour: hero || "BLACK" };
