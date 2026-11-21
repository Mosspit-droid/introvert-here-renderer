"""Cuts Barry's green-screen drawings of the introvert into one sprite strip for the game.
Run: python3 cut.py  ->  introvert.webp (the strip), introvert.js (the same picture for the preview), cut-check.png (to eyeball).
Frames, left to right: walk 0-5, then stand, crouch, air, land, slump, step."""
from PIL import Image
import numpy as np, base64, os
HERE = os.path.dirname(os.path.abspath(__file__)); CW, CH, AX, BASE, STAND = 250, 300, 118, 292, 236

def key(path):
    a = np.asarray(Image.open(os.path.join(HERE, "src", path)).convert("RGB")).astype(np.float32); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = g - np.maximum(r, b); alpha = np.clip((95 - d) / 60, 0, 1)          # how un-green a pixel is
    g2 = np.where(d > 0, np.maximum(r, b) + np.minimum(d, 8) * 0, g)       # take the green cast off the edges
    return np.dstack([r, g2, b, alpha * 255]).astype(np.uint8)

def runs(mask, gap):
    out, start, last = [], None, None
    for i, v in enumerate(mask):
        if v:
            if start is None: start = i
            last = i
        elif start is not None and i - last > gap: out.append((start, last + 1)); start = None
    if start is not None: out.append((start, last + 1))
    return [r for r in out if r[1] - r[0] > 40]

def figures(img, rows):
    solid = img[..., 3] > 128; figs = []
    bands = runs(solid.any(axis=1), 12) if rows > 1 else [(0, img.shape[0])]
    for y0, y1 in bands:
        for x0, x1 in runs(solid[y0:y1].any(axis=0), 14):
            ys = np.where(solid[y0:y1, x0:x1].any(axis=1))[0]; figs.append(img[y0 + ys[0]:y0 + ys[-1] + 1, x0:x1])
    return figs

def place(fig, scale, feet=True, lift=0):
    im = Image.fromarray(fig, "RGBA"); im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    a = np.asarray(im)[..., 3] > 128; top = a[: int(a.shape[0] * .45)]; xs = np.where(top.any(axis=0))[0]; cx = (xs[0] + xs[-1]) / 2   # centre on the hood and shoulders
    cell = Image.new("RGBA", (CW, CH), (0, 0, 0, 0)); cell.alpha_composite(im, (round(AX - cx), BASE - im.height - lift)); return cell

walk = figures(key("introvert-walk.png"), 2); acts = figures(key("introvert-actions.png"), 1)
print("found", len(walk), "walk frames and", len(acts), "action poses;", [f.shape[:2] for f in walk], [f.shape[:2] for f in acts])
ws = STAND / walk[2].shape[0]; as_ = STAND / acts[0].shape[0]
cells = [place(walk[i], ws) for i in (0, 1, 2, 3, 5, 6)] + [place(acts[0], as_), place(acts[1], as_), place(acts[2], as_), place(acts[3], as_), place(acts[4], as_ * .93), place(acts[5], as_ * .96)]
strip = Image.new("RGBA", (CW * len(cells), CH), (0, 0, 0, 0))
for i, c in enumerate(cells): strip.alpha_composite(c, (i * CW, 0))
strip.save(os.path.join(HERE, "introvert.webp"), quality=88, method=6)
b = base64.b64encode(open(os.path.join(HERE, "introvert.webp"), "rb").read()).decode()
open(os.path.join(HERE, "introvert.js"), "w").write("// Made by cut.py from Barry's drawings in src/: the introvert's sprite strip.\nexport const INTROVERT = { src: \"data:image/webp;base64," + b + "\", w: %d, h: %d, ax: %d, base: %d, n: %d };\n" % (CW, CH, AX, BASE, len(cells)))
chk = Image.new("RGB", (CW * 6, CH * 2), "#fbf1e7")
for i, c in enumerate(cells): chk.paste(c, ((i % 6) * CW, (i // 6) * CH), c)
chk.save(os.path.join(HERE, "cut-check.png")); print(len(b) // 1024, "KB")
