// New print_areas: same areas, variants and placement; only the image ids change
// (front = page 1 of the print template, back = page 2 when the template has one).
const p = JSON.parse(input.product);
const front = String(input.front || ""), back = String(input.back || "");
const hasBack = Number(input.pages) >= 2;
let changed = 0;
const areas = (p.print_areas || []).map(a => ({
  variant_ids: a.variant_ids,
  placeholders: (a.placeholders || []).filter(ph => (ph.images || []).length).map(ph => ({  // Printify rejects empty positions
    position: ph.position,
    images: (ph.images || []).map(im => {
      let id = im.id;
      if (ph.position === "front" && front) { id = front; changed++; }
      else if (ph.position === "back" && hasBack && back) { id = back; changed++; }
      return { id, x: im.x, y: im.y, scale: im.scale, angle: im.angle };
    })
  }))
}));
if (!changed) throw new Error("No print image found to replace on " + input.code);
return { body: JSON.stringify({ print_areas: areas }), changed };
