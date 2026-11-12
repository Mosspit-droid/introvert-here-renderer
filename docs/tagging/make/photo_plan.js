// One listing's photos in Etsy order, for a template (pages = [{pos, name}]) and a lead colour.
// Same rules as the builder (docs/tagging/make/mockup_rank.js): one colour of each picture (lead colour, else Black),
// lead thumbnail first, one Printify mockup at rank 2. Each photo gets a stable key like "SETUP#2" that means the
// same picture whatever the colour or garment, so "replace just this photo" can be asked across a whole range.
function photoPlan(pages, hero) {
  hero = String(hero || "").toUpperCase().replace(/\s+/g, "_");
  var nm = function (p) { return String(p.name || "").toUpperCase(); };
  var sorted = pages.slice().sort(function (a, b) { return Number(a.pos) - Number(b.pos); });
  var thumbs = sorted.filter(function (p) { return /THUMBNAIL/.test(nm(p)); });
  var colours = thumbs.map(function (p) { var m = nm(p).match(/THUMBNAIL_(.+)$/); return m ? m[1] : ""; }).filter(Boolean).sort(function (a, b) { return b.length - a.length; });
  var colourOf = function (p) { var n = nm(p); for (var i = 0; i < colours.length; i++) if (n.slice(-(colours[i].length + 1)) === "_" + colours[i]) return colours[i]; return ""; };
  var baseOf = function (p) { var c = colourOf(p), n = nm(p).replace(/^[A-Z]+_\d+_/, "").replace(/^(TS|LS|SW|HD)_/, ""); return c ? n.slice(0, -(c.length + 1)) : n; };
  var groups = {};
  sorted.forEach(function (p) { if (/THUMBNAIL/.test(nm(p)) || !colourOf(p)) return; var b = baseOf(p), c = colourOf(p); groups[b] = groups[b] || {}; (groups[b][c] = groups[b][c] || []).push(p); });
  var swap = [], drop = [];
  Object.keys(groups).forEach(function (b) {
    var g = groups[b], want = g[hero] ? hero : (g.BLACK ? "BLACK" : Object.keys(g)[0]);
    var n = Math.max.apply(null, Object.keys(g).map(function (c) { return g[c].length; }));
    for (var k = 0; k < n; k++) {
      var copies = Object.keys(g).map(function (c) { return g[c][k]; }).filter(Boolean).sort(function (a, b) { return Number(a.pos) - Number(b.pos); });
      var keep = (g[want] && g[want][k]) || copies[0];
      copies.forEach(function (p) { if (p !== copies[0]) drop.push(p); });
      swap.push([copies[0], keep]);
    }
  });
  var order = sorted.filter(function (p) { return drop.indexOf(p) < 0; }).map(function (p) { for (var i = 0; i < swap.length; i++) if (swap[i][0] === p) return swap[i][1]; return p; });
  var lead = null; for (var j = 0; j < thumbs.length; j++) if (hero && nm(thumbs[j]).slice(-(hero.length + 1)) === "_" + hero) lead = thumbs[j];
  if (lead && thumbs.length > 1 && lead !== thumbs[0]) { var at = order.indexOf(thumbs[0]); order = order.filter(function (p) { return p !== lead; }); order.splice(at, 0, lead); }
  var seen = {};
  return order.map(function (p, i) {
    var thumb = /THUMBNAIL/.test(nm(p)), b = thumb ? "THUMBNAIL" : baseOf(p);
    seen[b] = (seen[b] || 0) + 1;
    var label = b.toLowerCase().replace(/_/g, " "); label = label.charAt(0).toUpperCase() + label.slice(1);
    return { pos: Number(p.pos), name: p.name, key: b + "#" + seen[b], label: label + (seen[b] > 1 ? " " + seen[b] : ""), thumb: thumb, rank: i === 0 ? 1 : i + 2 };
  });
}
