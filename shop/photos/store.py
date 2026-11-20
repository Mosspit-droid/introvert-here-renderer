"""Store a garment's full Canva mockup set for the shop (the catch-up tool; see "Photos" in docs/SHOP_HANDOVER.md).

For each product code: export every page of its Canva design "MOCKUPS <code>" (through the Make scenario 8698322
"Introvert Here: Tool - Canva Lookup"), save each page to R2 bucket introvert-here-shop-photos as
p/<code>/<NN>.jpg (1600px) and p/<code>/<NN>t.jpg (600px), then record it in KV "shop:photos" ({code: {n, at, design}}).

Usage: python3 store.py <work folder> list            -> finds every "MOCKUPS <code>" design (newest per code), saves designs.json
       python3 store.py <work folder> CODE [CODE ...]  -> stores those garments (needs designs.json)
Runs from the Claude build sandbox: Make and Cloudflare calls go through its proxy, which adds the keys.
"""
import io, json, re, subprocess, sys, time, os
from urllib.parse import quote
from PIL import Image

ACCOUNT, KV, BUCKET, SCENARIO = "82725ced954062d2cb0d30912fbd923c", "1c5342ad32504af1abd1da52c342f3ce", "introvert-here-shop-photos", 8698322
CF = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}"
RUNS = {"n": 0}

def curl(*args, binary=False):
    r = subprocess.run(["curl", "-s", *args], capture_output=True)
    return r.stdout if binary else r.stdout.decode()

def canva(path, method="GET", body=None):
    data = {"path": path, "method": method}
    if body is not None:
        data["body"] = json.dumps(body); data["header"] = [{"key": "Content-Type", "value": "application/json"}]
    for attempt in range(4):
        out = curl("-X", "POST", "-H", "Authorization: Token x", "-H", "Content-Type: application/json",
                   f"https://eu1.make.com/api/v2/scenarios/{SCENARIO}/run", "--data", json.dumps({"responsive": True, "data": data}))
        RUNS["n"] += 1
        try:
            j = json.loads(out)
        except ValueError:
            j = {}
        if "outputs" in j:
            b = j["outputs"].get("data")
            return json.loads(b) if isinstance(b, str) else b
        if "already being executed" not in out and "rate" not in out.lower(): break   # a real refusal: don't repeat it
        time.sleep(8 * (attempt + 1))   # busy ("already being executed") or a blip: wait and try again
    raise RuntimeError("Canva tool: " + out[:300])

def list_designs(work):
    found, cont, pages = {}, None, 0
    while True:
        try:
            r = canva("/v1/designs?query=MOCKUPS&sort_by=modified_descending" + ("&continuation=" + quote(cont) if cont else ""))
        except RuntimeError as e:   # Canva stops paging a search after a while; what was found so far (the newest) is kept
            print("stopped after", pages, "pages:", str(e)[:160]); break
        pages += 1
        for d in r.get("items", []):
            m = re.fullmatch(r"MOCKUPS ([A-Z]{2}-\d{5}-[A-Z-]+)", d.get("title") or "")
            if m:
                found.setdefault(m.group(1), []).append({"id": d["id"], "updated": d.get("updated_at", 0), "pages": d.get("page_count")})
        cont = r.get("continuation")
        if not cont or pages > 60: break
    best = {c: max(v, key=lambda x: x["updated"]) | {"copies": len(v)} for c, v in found.items()}
    json.dump(best, open(f"{work}/designs.json", "w"), indent=1)
    print(len(best), "garments have a MOCKUPS design;", pages, "Canva requests")

def kv_get(key):
    out = curl("-H", "Authorization: Bearer x", f"{CF}/storage/kv/namespaces/{KV}/values/{quote(key, safe='')}")
    try:
        j = json.loads(out)
    except ValueError:
        return None
    return None if isinstance(j, dict) and j.get("success") is False else j

def r2_put(key, data):
    for attempt in range(3):   # R2 now and then answers "internal error, please try again"
        p = subprocess.run(["curl", "-s", "-X", "PUT", "-H", "Authorization: Bearer x", "-H", "Content-Type: image/jpeg",
                            f"{CF}/r2/buckets/{BUCKET}/objects/{quote(key, safe='')}", "--data-binary", "@-"], input=data, capture_output=True)
        if b'"success":true' in p.stdout: return
        time.sleep(3 * (attempt + 1))
    raise RuntimeError("R2: " + p.stdout.decode()[:200])

def store(code, design):
    job = canva("/v1/exports", "POST", {"design_id": design["id"], "format": {"type": "jpg", "quality": 88, "width": 1600}})["job"]
    for _ in range(40):
        if job.get("status") != "in_progress": break
        time.sleep(6); job = canva("/v1/exports/" + job["id"])["job"]
    if job.get("status") != "success": raise RuntimeError(f"{code}: export {job.get('status')} {json.dumps(job.get('error'))}")
    urls = job["urls"]
    for i, u in enumerate(urls, 1):
        raw = curl(u, binary=True)
        im = Image.open(io.BytesIO(raw)).convert("RGB")   # also proves the download is a real picture
        r2_put(f"p/{code}/{i:02d}.jpg", raw)
        small = io.BytesIO(); im.resize((600, round(600 * im.height / im.width)), Image.LANCZOS).save(small, "JPEG", quality=82, optimize=True)
        r2_put(f"p/{code}/{i:02d}t.jpg", small.getvalue())
    return len(urls)

def main():
    work, what = sys.argv[1], sys.argv[2:]
    if what == ["list"]:
        return list_designs(work)
    designs = json.load(open(f"{work}/designs.json"))
    for code in what:
        if code not in designs: print(code, "has no MOCKUPS design in Canva"); continue
        before = RUNS["n"]
        try:
            n = store(code, designs[code])
        except Exception as e:
            print(code, "FAILED:", e); continue
        index = kv_get("shop:photos") or {}   # re-read each time: the approvals app may add to it too
        index[code] = {"n": n, "at": int(time.time()), "design": designs[code]["id"]}
        curl("-X", "PUT", "-H", "Authorization: Bearer x", f"{CF}/storage/kv/namespaces/{KV}/values/shop:photos", "--data", json.dumps(index))
        print(code, n, "pages stored;", RUNS["n"] - before, "Canva requests")
    print("total Canva requests:", RUNS["n"])

if __name__ == "__main__":
    main()
