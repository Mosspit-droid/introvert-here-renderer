"""Recolour Barry's Off The Shelf mockup photos into the other two colours.

Usage: python3 ots_batch.py <raw folder> <tee refs folder> <out folder> [preview]
raw folder holds the exported photos (TS_GIFT.jpg ... and REF_*.jpg); tee refs folder holds
maroon.png / green.png / brown.png (Barry's T-shirt colour photos).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recolour import recolour
from PIL import Image

raw, tee, out = sys.argv[1], sys.argv[2], sys.argv[3]
preview = len(sys.argv) > 4
os.makedirs(out, exist_ok=True)
R = lambda n: f"{raw}/{n}.jpg"
refs = {
    "TS": {"MAROON": f"{tee}/maroon.png", "FOREST_GREEN": f"{tee}/green.png", "DARK_CHOCOLATE": f"{tee}/brown.png"},
    "SW": {"MAROON": R("SW_THUMB"), "FOREST_GREEN": R("REF_SW_GREEN"), "DARK_CHOCOLATE": R("REF_SW_BROWN")},
    "HD": {"MAROON": R("REF_HD_MAROON"), "FOREST_GREEN": R("REF_HD_GREEN"), "DARK_CHOCOLATE": R("REF_HD_BROWN")},
}
refs["LS"] = refs["SW"]
jobs = []
for n in sorted(os.listdir(raw)):
    n = n[:-4]
    if n.startswith("REF_") or n == "HD_HOODCLOSE" and False:
        continue
    g = n[:2]
    src = "DARK_CHOCOLATE" if n.endswith("_BROWN") else "MAROON"
    scene = n[3:].replace("_BROWN", "")
    for tgt in ("MAROON", "FOREST_GREEN", "DARK_CHOCOLATE"):
        if tgt != src:
            jobs.append((n, g, scene, src, tgt))
for n, g, scene, src, tgt in jobs:
    img, m = recolour(R(n), refs[g][src], refs[g][tgt])
    name = f"OS_{g}_{scene}_{tgt}"
    if preview:
        img.resize((600, 600)).save(f"{out}/{name}.jpg", quality=85)
    else:
        img.save(f"{out}/{name}.jpg", quality=90)
    print(name, round(float(m.mean()), 3))
