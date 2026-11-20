"""Put any new Printify mockups in the shop catalogue onto their range backgrounds (run by the GitHub job
"Shop mockups", .github/workflows/shop-mockups.yml; no keys needed).

Usage: python3 auto.py <catalogue address or file> <store folder> [--list]

The catalogue (the shop's /catalog.json) lists every mockup with "src" (Printify's picture) and "url" (what the
shop shows). A mockup still showing Printify's own picture, in a range that has a background, is composed and saved
as <store>/m/<key>.jpg, and <store>/processed.json ({printify address: key}) is updated. The store folder is a
checkout of the repo's "shop-mockups" branch: the approvals app reads processed.json from it and the shop worker
serves /m/<key>.jpg from it. Key = first 16 hex of sha1(address), as everywhere else.
--list only prints how many are waiting (so the job can stop early without installing anything).
"""
import sys, os, json, hashlib, io, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, "textures")
RANGES = ("IH", "SH", "PC", "OS", "EX")   # ranges with a background texture (see compose.py)
UA = {"User-Agent": "IntrovertHereShop/1.0"}

def load(src):
    if src.startswith("http"):
        return json.load(urllib.request.urlopen(urllib.request.Request(src, headers=UA), timeout=60))
    return json.load(open(src))

def main():
    src, store = sys.argv[1], sys.argv[2]
    listing = "--list" in sys.argv
    pj = os.path.join(store, "processed.json")
    done = json.load(open(pj)) if os.path.exists(pj) else {}
    todo = {}
    for d in load(src).get("designs", []):
        if d.get("coll") not in RANGES:
            continue
        for g in d["garments"].values():
            for m in g.get("mockups", []):
                u = m.get("src")
                if u and m.get("url") == u and u not in done:
                    todo[u] = d["coll"]
    print(len(todo), "mockups waiting")
    if listing or not todo:
        return
    sys.path.insert(0, HERE)
    from compose import compose
    os.makedirs(os.path.join(store, "m"), exist_ok=True)
    made = failed = 0
    for u, coll in todo.items():
        k = hashlib.sha1(u.encode()).hexdigest()[:16]
        try:
            raw = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
            compose(io.BytesIO(raw), coll, TEX).save(os.path.join(store, "m", k + ".jpg"), quality=84, optimize=True)
            done[u] = k; made += 1
        except Exception as e:   # one bad picture shouldn't stop the rest; it is tried again next run
            failed += 1; print("  failed:", u, "-", e)
    json.dump(done, open(pj, "w"), indent=0, sort_keys=True)
    print(made, "composed,", failed, "failed")

if __name__ == "__main__":
    main()
