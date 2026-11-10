"""Second pass for OTS photos where sunlight left a red glow (Barry, 10 Nov 2026).
Usage: python3 ots_redo.py <raw folder> <tee refs folder> <out folder> SCENE[,SCENE...]
Uses recolour(..., glow=True, space="lch"): catches sunlit rims and recolours by hue + strength, so highlights
become highlights of the new colour instead of staying red. Also writes cmp_<scene>.jpg side-by-sides.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recolour import recolour
from PIL import Image
raw, tee, out = sys.argv[1:4]; scenes = sys.argv[4].split(',')
R = lambda n: f"{raw}/{n}.jpg"
refs = {"TS": {"MAROON": f"{tee}/maroon.png", "FOREST_GREEN": f"{tee}/green.png", "DARK_CHOCOLATE": f"{tee}/brown.png"},
        "SW": {"MAROON": R("SW_THUMB"), "FOREST_GREEN": R("REF_SW_GREEN"), "DARK_CHOCOLATE": R("REF_SW_BROWN")},
        "HD": {"MAROON": R("REF_HD_MAROON"), "FOREST_GREEN": R("REF_HD_GREEN"), "DARK_CHOCOLATE": R("REF_HD_BROWN")}}
refs["LS"] = refs["SW"]
os.makedirs(out, exist_ok=True)
for s in scenes:
    g = s[:2]; ims = [Image.open(R(s))]
    for tgt in ("FOREST_GREEN", "DARK_CHOCOLATE"):
        img, m = recolour(R(s), refs[g]["MAROON"], refs[g][tgt], glow=True, space="lch")
        img.save(f"{out}/OS_{s}_{tgt}.jpg", quality=92); ims.append(img)
    W = Image.new('RGB', (1500, 500))
    for i, im in enumerate(ims): W.paste(im.resize((500, 500)), (i * 500, 0))
    W.save(f"{out}/cmp_{s}.jpg", quality=85); print(s, flush=True)
