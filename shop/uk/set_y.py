import json, sys, hashlib
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
v72 = {x["id"]: x for x in json.load(open("variants_72.json"))}
im = next(i for i in out["images"] if i["src"].endswith("camera_label=front-2") and v72[i["variant_ids"][0]]["options"]["color"] == "Black")
lst = [{"k": "mirror:" + hashlib.sha1(im["src"].encode()).hexdigest()[:16] + f"-y{y}", "u": im["src"] + f"&y={y}"}]
json.dump(lst, open("put.json", "w")); print("y set to", y, [pa["placeholders"][0]["images"][0]["y"] for pa in out["print_areas"]], lst[0]["k"])
