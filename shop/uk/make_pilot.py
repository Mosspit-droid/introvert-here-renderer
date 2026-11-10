import json
from pf import api
src = json.load(open("src_product.json"))
img = src["print_areas"][0]["placeholders"][0]["images"][0]
price = next(v["price"] for v in src["variants"] if v["is_enabled"])
v99 = {(x["options"]["color"], x["options"]["size"]): x for x in json.load(open("variants_99.json"))}
v72 = [x for x in json.load(open("variants_72.json")) if x["options"]["color"] in ("Black", "Dark Heather") and x["options"]["size"] in ("S","M","L","XL","2XL","3XL")]
def front(x): return next(p for p in x["placeholders"] if p["position"] == "front")
groups = {}
for x in v72:
    c, s = x["options"]["color"], x["options"]["size"]
    scale = round(front(v99[(c, s)])["width"] / front(x)["width"], 4)   # same physical size as the Printify Choice tee
    assert scale * front(x)["width"] * img["height"] / img["width"] <= front(x)["height"]
    groups.setdefault(scale, []).append(x["id"])
body = {
  "title": "UK DRAFT Do Not Publish - Outside My Duvet T-shirt - Print Clever",
  "description": "Pilot: UK-printed version for the Introvert Here shop. Same artwork, same physical print size as the Etsy (Printify Choice) tee.",
  "blueprint_id": 6, "print_provider_id": 72,
  "variants": [{"id": x["id"], "price": price, "is_enabled": True} for x in v72],
  "print_areas": [{"variant_ids": ids, "placeholders": [{"position": "front", "images": [
      {"id": img["id"], "x": 0.5, "y": 0.5, "scale": sc, "angle": 0}]}]} for sc, ids in groups.items()],
}
p = api("shops/27154106/products.json", "POST", body)
json.dump(p, open("pilot_product.json", "w"))
print("created", p["id"], "| visible:", p.get("visible"), "| external:", p.get("external"))
for i in p["images"]: print(i["src"].split("camera_label=")[-1], i["variant_ids"][:1], i["src"][:110])
