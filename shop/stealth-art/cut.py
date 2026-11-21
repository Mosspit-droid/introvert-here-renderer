"""Cuts Barry's green-screen drawings (src/) into the pictures the stealth game uses.
Run: python3 cut.py  ->  out/*.webp (the pictures), art.js (the same pictures plus their measurements, for the worker),
cut-check.png (everything on one sheet, to eyeball). PPH = picture pixels per "height" (1 height = the introvert standing)."""
from PIL import Image
import numpy as np, base64, os, json
HERE = os.path.dirname(os.path.abspath(__file__)); SRC = os.path.join(HERE, "src"); OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
PPH = 236

def key(path):
    a = np.asarray(Image.open(os.path.join(SRC, path)).convert("RGB")).astype(np.float32); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = g - np.maximum(r, b); bright = np.clip((g - 90) / 90, 0, 1)           # only bright green counts as screen (the fire exit sign is dark green)
    gone = np.clip((d - 35) / 60, 0, 1) * bright
    g2 = g - np.clip(d, 0, None) * bright                                     # take the green cast off the edges
    return np.dstack([r, g2, b, (1 - gone) * 255]).astype(np.uint8)
def runs(mask, gap):
    out, start, last = [], None, None
    for i, v in enumerate(mask):
        if v:
            if start is None: start = i
            last = i
        elif start is not None and i - last > gap: out.append((start, last + 1)); start = None
    if start is not None: out.append((start, last + 1))
    return [r for r in out if r[1] - r[0] > 25]
def figures(img, rows=1, gap=14):
    solid = img[..., 3] > 128; figs = []
    bands = runs(solid.any(axis=1), 12) if rows > 1 else [(0, img.shape[0])]
    for y0, y1 in bands:
        for x0, x1 in runs(solid[y0:y1].any(axis=0), gap):
            ys = np.where(solid[y0:y1, x0:x1].any(axis=1))[0]; figs.append(img[y0 + ys[0]:y0 + ys[-1] + 1, x0:x1])
    return figs
def scaled(fig, s): im = Image.fromarray(fig, "RGBA"); return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
def cell(fig, s, cw, ch, ax, base, top=.45):
    im = scaled(fig, s); a = np.asarray(im)[..., 3] > 128; xs = np.where(a[: max(1, int(a.shape[0] * top))].any(axis=0))[0]; cx = (xs[0] + xs[-1]) / 2
    c = Image.new("RGBA", (cw, ch), (0, 0, 0, 0)); c.alpha_composite(im, (round(ax - cx), base - im.height)); return c
def strip(cells):
    s = Image.new("RGBA", (sum(c.width for c in cells), max(c.height for c in cells)), (0, 0, 0, 0)); x = 0
    for c in cells: s.alpha_composite(c, (x, s.height - c.height)); x += c.width
    return s
ART = {}
def save(name, im, **meta):
    p = os.path.join(OUT, name + ".webp"); im.save(p, quality=86, method=6); ART[name] = dict(meta, W=im.width, H=im.height, kb=os.path.getsize(p) // 1024)

# The introvert: walk 0-5, stand 6, crouch 7, air 8, land 9, slump 10, step 11
walk = figures(key("introvert-walk.png"), 2); acts = figures(key("introvert-actions.png"))
ws, as_ = PPH / walk[2].shape[0], PPH / acts[0].shape[0]
C = dict(cw=250, ch=300, ax=118, base=292)
iv = [cell(walk[i], ws, **C) for i in (0, 1, 2, 3, 5, 6)] + [cell(acts[i], as_ * k, **C) for i, k in ((0, 1), (1, 1), (2, 1), (3, 1), (4, .93), (5, .96))]
save("introvert", strip(iv), w=250, h=300, ax=118, base=292, n=len(iv))

# The Pacer: walk 0-5, then clipboard 6, spotted 7, talking 8, laughing 9, then the cupcake: noticing 10, picking up 11, delighted 12, eating 13
pw = figures(key("pacer-walk2.png"), 2); pp = figures(key("pacer-poses.png")); ck = figures(key("pacer-cake.png"), gap=30)
# In the first pose the cupcake sits by her feet (under the overhang of her hair): lift it out of the bottom of the picture.
f0 = ck[0].copy(); y0 = int(f0.shape[0] * .82); parts = runs((f0[y0:, :, 3] > 128).any(axis=0), 2); assert len(parts) == 2, parts
cup = f0[y0:, parts[1][0]:parts[1][1]].copy(); ys = np.where((cup[..., 3] > 128).any(axis=1))[0]; cup = cup[ys[0]:]
f0[y0:, parts[1][0]:] = 0; xs = np.where((f0[..., 3] > 128).any(axis=0))[0]; ck[0] = f0[:, xs[0]:xs[-1] + 1]
C = dict(cw=330, ch=330, ax=140, base=324, top=.25)
pws, pps, cks = 1.24 * PPH / max(f.shape[0] for f in pw), 1.3 * PPH / pp[1].shape[0], 1.3 * PPH / ck[0].shape[0]
pc = [cell(pw[i], pws, **C) for i in (0, 1, 2, 3, 5, 6)] + [cell(f, pps, **C) for f in pp] + [cell(f, cks, **C) for f in ck]
save("pacer", strip(pc), w=330, h=330, ax=140, base=324, n=len(pc))
save("cupcake", scaled(cup, cks * 1.5))

# The Boss at his desk: asleep 0, stirring 1, beckoning 2, holding forth 3. Lined up on the desk's left edge and the floor.
bs = figures(key("boss.png"), 2, gap=30); s = 1.15 * PPH / max(f.shape[1] for f in bs); bw = round(max(f.shape[1] for f in bs) * s) + 4; bh = round(max(f.shape[0] for f in bs) * s) + 4
cells = []
for f in bs: im = scaled(f, s); c = Image.new("RGBA", (bw, bh), (0, 0, 0, 0)); c.alpha_composite(im, (0, bh - im.height)); cells.append(c)
save("boss", strip(cells), w=bw, h=bh, n=4)

# Corridor objects, all at the scale where a door is 1.4 heights tall
pr = figures(key("props.png")); ps = 1.4 * PPH / pr[1].shape[0]; names = ["doorway", "door", "cooler", "sign", "exit"]; cells = [scaled(f, ps) for f in pr]; xs = np.cumsum([0] + [c.width for c in cells]).tolist()
a = np.asarray(cells[0])[..., 3] < 128; mid = a[a.shape[0] // 2]; hole = max(runs(mid, 0), key=lambda r: r[1] - r[0]); hx = (hole[0] + hole[1]) // 2; top = int(np.argmax(a[:, hx][10:])) + 10 if not a[5, hx] else 0
save("props", strip(cells), items={n: dict(x=xs[i], w=cells[i].width, h=cells[i].height) for i, n in enumerate(names)}, hole=dict(x0=hole[0], x1=hole[1], top=top))

# The recycling bin, empty and occupied (the body is .62 of a height tall so a hop clears the rim)
bn = figures(key("bin.png")); s = PPH / bn[0].shape[0]; cells = [scaled(f, s) for f in bn]
save("bin", strip(cells), w=cells[0].width, h=cells[0].height, w2=cells[1].width, rim=.62)

# The corridor wall: made to repeat, and shrunk
bg = Image.open(os.path.join(SRC, "corridor.png")).convert("RGB"); a = np.asarray(bg).astype(np.float32); B = 60; W = a.shape[1] - B; out = a[:, :W].copy()
for x in range(B): t = x / B; out[:, x] = a[:, W + x] * (1 - t) + a[:, x] * t
bgim = Image.fromarray(out.astype(np.uint8)); k = 620 / bgim.height; bgim = bgim.resize((round(bgim.width * k), 620), Image.LANCZOS); fl = np.asarray(bgim)[-6:].reshape(-1, 3).mean(axis=0)
p = os.path.join(OUT, "corridor.webp"); bgim.save(p, quality=82, method=6); ART["corridor"] = dict(W=bgim.width, H=bgim.height, floor="#%02x%02x%02x" % tuple(int(v) for v in fl), kb=os.path.getsize(p) // 1024)

# "Caught by the Boss": Barry's drawing of the introvert across the desk, hoodie turned navy
ca = np.asarray(Image.open(os.path.join(SRC, "cast-original.png")).convert("RGB")).astype(np.float32)[378:700, 325:1170]; r, g, b = ca[..., 0], ca[..., 1], ca[..., 2]
hood = np.zeros(r.shape, bool); hood[10:168, 20:215] = True; grey = (np.max(ca, axis=2) - np.min(ca, axis=2) < 34) & (np.max(ca, axis=2) < 150) & hood
lum = (r + g + b) / 3; ca[grey] = np.stack([lum * .42, lum * .5, lum * .78 + 6], axis=-1)[grey]
save("caught-boss", Image.fromarray(np.clip(ca, 0, 255).astype(np.uint8)).convert("RGBA"))

with open(os.path.join(HERE, "art.js"), "w") as f:
    f.write("// Made by cut.py from Barry's drawings in src/. Do not edit by hand.\nexport const PPH = %d;\nexport const ART = %s;\nexport const FILES = {\n" % (PPH, json.dumps(ART)))
    for n in ART: f.write('  "%s": "%s",\n' % (n, base64.b64encode(open(os.path.join(OUT, n + ".webp"), "rb").read()).decode()))
    f.write("};\n")
chk = Image.new("RGB", (2000, 1500), "#fbf1e7"); y = 10
for n in ("introvert", "pacer", "cupcake", "boss", "props", "bin", "caught-boss"):
    im = Image.open(os.path.join(OUT, n + ".webp")).convert("RGBA")
    if im.width > 1980: im = im.resize((1980, round(im.height * 1980 / im.width)))
    chk.paste(im, (10, y), im); y += im.height + 10
chk.crop((0, 0, 2000, y)).save(os.path.join(HERE, "cut-check.png")); print({k: v["kb"] for k, v in ART.items()}, ART["props"], ART["bin"], ART["corridor"], ART["boss"])
