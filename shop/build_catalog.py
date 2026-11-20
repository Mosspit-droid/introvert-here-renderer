"""Build the Introvert Here shop catalogue (the old manual way).

Superseded on 20 Nov 2026 by shopCatalogRun in approvals-app/worker.js, which keeps the catalogue current
by itself. Kept for reference.

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
# Mockups already put on range backgrounds by mockups/run_all.py ({printify url: key}); optional.
try:
    composed = json.load(open(f"{src}/processed.json"))
except FileNotFoundError:
    composed = {}

COLL = {"INTROVERT HERE…": "IH", "SHHH.": "SH", "PER CONTRACT": "PC", "OFF THE SHELF": "OS"}
GARMENTS = [("T-SHIRT", "T-shirt"), ("LONG-SLEEVE", "Long sleeve"), ("SWEATSHIRT", "Sweatshirt"), ("HOODIE", "Hoodie")]
# Etsy photo labels end with a colour word when the photo shows one colour.
# "GREY" photos were made when IH/PC used Black + Dark Heather, so GREY = Dark Heather.
PHOTO_COLOUR = {"DARK_HEATHER": "Dark Heather", "GREY": "Dark Heather", "CHARCOAL": "Charcoal", "NAVY": "Navy", "BLACK": "Black"}
# Printify mockup views shown in the shop, in order; each lists the cameras to try (tees only have "front-2").
# Each range's main colour (Barry, 10 Nov). Lifestyle photos without a colour label show this colour.
MAIN_COLOUR = {"IH": "Black", "SH": "Dark Heather", "PC": "Navy", "OS": "Maroon"}
# Photos that show no garment colour (promo cards, gift message, range line-up) show for every colour.
ANY_COLOUR = re.compile(r"_(PROMO|AGM|RANGE)$")
MOCKUP_VIEWS = {"front": ["front", "front-2"], "back": ["back", "back-2"]}

def photo_colour(alt):
    rest = re.sub(r"^[A-Z]{2}_\d+_[A-Z]{2}_", "", alt.upper())
    rest = re.sub(r"^(FOLDED|HANGING)_", "", rest)
    return PHOTO_COLOUR.get(rest)

def printify_mockups(p, variants):
    """One front (and back, where printed) Printify mockup per colour."""
    out = []
    for colour in dict.fromkeys(v["colour"] for v in variants):
        ids = {v["id"] for v in variants if v["colour"] == colour}
        printed = {ph["position"] for pa in p.get("print_areas", []) for ph in pa["placeholders"] if ph.get("images")}
        for view, cams in MOCKUP_VIEWS.items():
            if view not in printed:
                continue  # no back print (only hoodies have one), so skip Printify's picture of a blank back
            # The variant in the mockup's address is the colour it was drawn in (its variant_ids list can span colours).
            mine = [i for i in p.get("images", []) if int(i["src"].split("/mockup/")[1].split("/")[1]) in ids]
            im = next((i for cam in cams for i in mine if i["src"].split("camera_label=")[-1] == cam), None)
            if im:
                k = composed.get(im["src"])
                url = f"/m/{k}.jpg" if k else im["src"]
                out.append({"url": url, "thumb": url, "src": im["src"], "alt": f"{colour}, {view}", "colour": colour, "mockup": True})
    return out

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
    # Photos with no label are the single mockup Printify adds to Etsy; the shop uses its own per-colour mockups instead.
    gallery = [{"url": i["url"], "thumb": i.get("url570") or i["url"], "alt": i["alt"], "colour": photo_colour(i["alt"])}
               for i in pics if (i.get("alt") or "").strip()]
    is_sg = lambda g: re.search(r"SIZE[ _]GUIDE", g["alt"].upper())
    size_guide = next((g for g in gallery if is_sg(g)), None)
    gallery = [g for g in gallery if not is_sg(g)]
    main = MAIN_COLOUR.get(COLL.get(row["COLLECTION"], "IH"))
    for g in gallery:
        if g["colour"] is None and not ANY_COLOUR.search(g["alt"].upper()):
            g["colour"] = main
    shop_colours = {v["colour"] for v in variants}
    if main not in shop_colours:
        problems.append(f"{code}: main colour {main} not offered, so its lifestyle photos are hidden")
    gallery = [g for g in gallery if g["colour"] is None or g["colour"] in shop_colours]
    tile = gallery[0]["thumb"] if gallery else None
    mockups = printify_mockups(p, variants)
    if not mockups:
        problems.append(f"{code}: no Printify mockups")
    elif composed and any(m["url"] == m["src"] for m in mockups):
        problems.append(f"{code}: some mockups not on range backgrounds yet (run the mirror + mockups/run_all.py)")
    rl = rule.get((row["COLLECTION"], gtype), {})
    d = designs.setdefault(gag_id, {
        "id": gag_id, "coll": COLL.get(row["COLLECTION"], "IH"), "collection": row["COLLECTION"],
        "title": str(row["TITLE_STEM"]).strip(), "slug": slug(str(row["TITLE_STEM"])) + "-" + gag_id.lower(),
        "text": str(row["GAG_TEXT"]).strip(), "garments": {}})
    d["garments"][gtype] = {
        "label": dict(GARMENTS)[gtype], "code": code, "printifyId": p["id"], "etsyId": str(row["ETSY_LISTING_ID"]),
        "etsyUrl": f"https://www.etsy.com/listing/{row['ETSY_LISTING_ID']}",
        "priceFrom": min(v["price"] for v in variants), "variants": variants,
        "images": gallery, "mockups": mockups, "tile": tile, "mainColour": main if main in shop_colours else None, "sizeGuide": size_guide["url"] if size_guide else None,
        "features": str(rl.get("PRODUCT_FEATURES") or "").strip()}

# Order: newest designs first within the file; the site sorts per page.
cat = {"designs": sorted(designs.values(), key=lambda d: d["id"], reverse=True),
       "garmentOrder": [g for g, _ in GARMENTS], "problems": problems}
json.dump(cat, open(out, "w"), ensure_ascii=False)
print(f"{len(cat['designs'])} designs, {sum(len(d['garments']) for d in cat['designs'])} garments, {len(problems)} problems")
for p in problems: print("  -", p)
