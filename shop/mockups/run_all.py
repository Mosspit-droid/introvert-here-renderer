"""Compose every Printify mockup in the catalogue onto its range background.

Usage: python3 run_all.py <catalog.json> <raw folder (mirror:<key>.jpg files)> <out folder>
Writes <out>/<key>.jpg and <out>/processed.json ({printify url: key}). build_catalog.py reads
processed.json (put it next to its other inputs) and points the shop at /m/<key>.jpg.
Key = first 16 hex of sha1(url), the same key the mirror worker uses ("mirror:<key>").
"""
import sys, json, hashlib, os
from concurrent.futures import ProcessPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compose import compose
TEX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "textures")
cat, raw, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
jobs = {}
for d in json.load(open(cat))["designs"]:
    for g in d["garments"].values():
        for m in g.get("mockups", []):
            u = m.get("src") or m["url"]
            jobs[u] = d["coll"]
def one(item):
    u, coll = item
    k = hashlib.sha1(u.encode()).hexdigest()[:16]
    src = f"{raw}/mirror:{k}.jpg"
    if not os.path.exists(src): return u, None
    compose(src, coll, TEX).save(f"{out}/{k}.jpg", quality=84, optimize=True)
    return u, k
if __name__ == "__main__":
    with ProcessPoolExecutor() as ex: res = list(ex.map(one, jobs.items()))
    done = {u: k for u, k in res if k}
    json.dump(done, open(f"{out}/processed.json", "w"), indent=0)
    print(len(done), "composed,", len(jobs) - len(done), "missing (not mirrored yet)")
