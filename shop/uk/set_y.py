"""Set the vertical print position (Printify y, 0-1) on the UK pilot product. Usage: python3 set_y.py 0.482"""
import json, sys
from pf import api
y = float(sys.argv[1])
p = json.load(open("pilot_product.json"))
pas = []
for pa in p["print_areas"]:
    phs = []
    for ph in pa["placeholders"]:
        imgs = [{k: im[k] for k in ("id", "x", "y", "scale", "angle")} for im in ph["images"]]
        for im in imgs: im["y"] = y
        if imgs: phs.append({"position": ph["position"], "images": imgs})
    pas.append({"variant_ids": pa["variant_ids"], "placeholders": phs})
out = api(f"shops/27154106/products/{p['id']}.json", "PUT", {"print_areas": pas})
json.dump(out, open("pilot_product.json", "w"))
print("y set to", y, [pa["placeholders"][0]["images"][0]["y"] for pa in out["print_areas"]])
