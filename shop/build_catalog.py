"""Build the Introvert Here shop catalogue.

Joins three sources into one JSON file the shop worker serves from KV:
  - Core LISTING_REGISTRY (only STATUS = LIVE) and PRODUCT_RULES  -> core.json
  - Printify products (variants, prices, order codes)             -> printify_products.json
  - Etsy listing photos                                           -> etsy_images.json

Usage: python3 build_catalog.py <folder with the three input files> <output catalog.json>
"""
import json, re, sys

src, out = sys.argv[1], sys.argv[2]
core = json.load(open(f"{src}/core.json"))
printify = {p["id"]: p for p in json.load(open(f"{src}/printify_products.json"))}
photos = json.load(open(f"{src}/etsy_images.json"))

COLL = {"INTROVERT HERE…": "IH", "SHHH.": "SH", "PER CONTRACT": "PC", "OFF THE SHELF": "OS"}
GARMENTS = [("T-SHIRT", "T-shirt"), ("LONG-SLEEVE", "Long sleeve"), ("SWEATSHIRT", "Sweatshirt"), ("HOODIE", "Hoodie")]
SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"]

reg = core["registry"]; H = reg[0]
rules = core["rules"]; RH = rules[0]
rule = {(r[RH.index("COLLECTION")], r[RH.index("PRODUCT_TYPE")]): dict(zip(RH, r)) for r in rules[1:]}

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

designs, problems = {}, []
for r in reg[1:]:
    row = dict(zip(H, r))
    if row["STATUS"] != "LIVE":
        continue
    code = str(row["PRODUCT_CODE"])
    gag_id, gtype = code[:8], code[9:]
    p = printify.get(str(row["PRINTIFY_PRODUCT_ID"]))
    if not p:
        problems.append(f"{code}: Printify product {row['PRINTIFY_PRODUCT_ID']} not found"); continue
    opts = {o["type"]: {v["id"]: v for v in o["values"]} for o in p["options"]}
    variants = []
    for v in p["variants"]:
        if not v.get("is_enabled") or not v.get("is_available", True):
            continue
        size = colour = None; hexv = None
        for oid in v["options"]:
            if oid in opts.get("size", {}): size = opts["size"][oid]["title"]
            if oid in opts.get("color", {}):
                colour = opts["color"][oid]["title"]; hexv = (opts["color"][oid].get("colors") or [None])[0]
        variants.append({"id": v["id"], "size": size, "colour": colour, "hex": hexv, "price": v["price"]})
    if not variants:
        problems.append(f"{code}: no enabled variants"); continue
    variants.sort(key=lambda v: (v["colour"] or "", SIZE_ORDER.index(v["size"]) if v["size"] in SIZE_ORDER else 99))
    pics = photos.get(str(row["ETSY_LISTING_ID"]))
    if not isinstance(pics, list) or not pics:
        problems.append(f"{code}: no Etsy photos"); pics = []
    gallery = [{"url": i["url"], "thumb": i.get("url570") or i["url"], "alt": i["alt"]} for i in pics]
    size_guide = next((g for g in gallery if "SIZE_GUIDE" in g["alt"]), None)
    gallery = [g for g in gallery if "SIZE_GUIDE" not in g["alt"]]
    rl = rule.get((row["COLLECTION"], gtype), {})
    d = designs.setdefault(gag_id, {
        "id": gag_id, "coll": COLL.get(row["COLLECTION"], "IH"), "collection": row["COLLECTION"],
        "title": str(row["TITLE_STEM"]).strip(), "slug": slug(str(row["TITLE_STEM"])) + "-" + gag_id.lower(),
        "text": str(row["GAG_TEXT"]).strip(), "garments": {}})
    d["garments"][gtype] = {
        "label": dict(GARMENTS)[gtype], "code": code, "printifyId": p["id"], "etsyId": str(row["ETSY_LISTING_ID"]),
        "etsyUrl": f"https://www.etsy.com/listing/{row['ETSY_LISTING_ID']}",
        "priceFrom": min(v["price"] for v in variants), "variants": variants,
        "images": gallery, "sizeGuide": size_guide["url"] if size_guide else None,
        "features": str(rl.get("PRODUCT_FEATURES") or "").strip()}

# Order: newest designs first within the file; the site sorts per page.
cat = {"designs": sorted(designs.values(), key=lambda d: d["id"], reverse=True),
       "garmentOrder": [g for g, _ in GARMENTS], "problems": problems}
json.dump(cat, open(out, "w"), ensure_ascii=False)
print(f"{len(cat['designs'])} designs, {sum(len(d['garments']) for d in cat['designs'])} garments, {len(problems)} problems")
for p in problems: print("  -", p)
