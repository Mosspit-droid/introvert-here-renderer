"""Introvert Here mascot: cut-outs from Barry's master sheet (ChatGPT, simplified flat version, 21 Nov 2026).

The sheet is a 3 x 3 grid on flat green: walk, peek, sit / head, wave, silhouette / stand, stand (sticker), head (sticker).
This removes the green (and the green fringe on the edges), crops each figure, and adds a white die-cut "sticker"
border to the ones used on the site's dark backgrounds. The head icon has its dangling drawstrings trimmed.

Usage: python3 build.py <output folder>
"""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, binary_erosion, gaussian_filter, label

HERE = __file__.rsplit("/", 1)[0]
OUT = sys.argv[1]
im = np.asarray(Image.open(HERE + "/master-sheet.png").convert("RGB")).astype(np.float32)
H, W = im.shape[:2]
r, g, b = im[..., 0], im[..., 1], im[..., 2]
green = (g - np.maximum(r, b)) / 255.0                                         # how green each pixel is
alpha = np.clip(1 - (green - 0.18) / 0.32, 0, 1)                             # soft edge between figure and background
rgb = im.copy()
spill = np.maximum(g - np.maximum(r, b), 0)                                  # take the green tint off the edges
rgb[..., 1] -= spill * (1 - alpha) + np.where(alpha < 1, spill * 0.6, 0)
NAMES = ["walk", "peek", "sit", "head", "wave", "silhouette", "stand", "stand-sticker", None]   # the sheet's own head sticker isn't used: ours is made from the cleaned-up head

def cell(i):
    rr, cc = divmod(i, 3)
    y0, y1, x0, x1 = rr * H // 3, (rr + 1) * H // 3, cc * W // 3, (cc + 1) * W // 3
    a = alpha[y0:y1, x0:x1].copy(); c = rgb[y0:y1, x0:x1]
    keep = a > 0.5; lab, n = label(keep)                                     # keep only the figure (the biggest shape)
    if n > 1:
        sizes = np.bincount(lab.ravel()); sizes[0] = 0
        main = sizes >= sizes.max() * 0.02
        a *= gaussian_filter(main[lab].astype(np.float32), 1) > 0.2
    return c, a

def sticker(c, a, width):
    pad = width + 4
    c = np.pad(c, ((pad, pad), (pad, pad), (0, 0))); a = np.pad(a, pad)
    yy, xx = np.mgrid[-width:width + 1, -width:width + 1]
    grown = binary_dilation(a > 0.5, structure=(xx ** 2 + yy ** 2) <= width ** 2)
    border = gaussian_filter(grown.astype(np.float32), 0.7)
    out_rgb = c * a[..., None] + 255 * (1 - a[..., None])
    return out_rgb, np.maximum(a, border)

def save(c, a, name, size=None):
    img = Image.fromarray(np.dstack([np.clip(c, 0, 255), np.clip(a, 0, 1) * 255]).astype(np.uint8), "RGBA")
    img = img.crop(img.getbbox())
    if name.startswith("icon"):                                              # icons are square, the figure centred
        sq = max(img.size); pad = Image.new("RGBA", (sq, sq)); pad.paste(img, ((sq - img.width) // 2, (sq - img.height) // 2)); img = pad
    if size: img = img.resize((size, size), Image.LANCZOS) if name.startswith("icon") else img
    if size and not name.startswith("icon"): img.thumbnail((size, size), Image.LANCZOS)
    img.save(f"{OUT}/{name}.png", optimize=True); print(name, img.size)

for i, n in enumerate(NAMES):
    if not n: continue
    c, a = cell(i)
    if n == "head":                                                          # paint out the dangling drawstrings
        c = c.copy(); a = a.copy(); hh, ww = a.shape
        cr, cg, cb = c[..., 0], c[..., 1], c[..., 2]
        cream = (cr > 190) & (cg > 175) & (cb > 140) & (cg > cr * 0.85) & (a > 0.5)
        cream[: int(hh * 0.55)] = False                                      # only below the nose
        lab, k = label(cream); sizes = np.bincount(lab.ravel()); sizes[0] = 0
        cream = np.isin(lab, np.where(sizes > 30)[0])                        # the two strings, not stray specks
        strings = binary_dilation(cream, iterations=8)                       # with their black outlines
        cols = np.where(strings.any(0))[0]
        body = (a > 0.5) & ~strings
        bottom = np.array([np.where(body[:, x])[0].max() if body[:, x].any() else -1 for x in range(ww)], float)
        x0, x1 = cols.min() - 1, cols.max() + 1                              # the hood's lower edge, carried straight across
        for x in range(x0 + 1, x1):
            bottom[x] = bottom[x0] + (bottom[x1] - bottom[x0]) * (x - x0) / (x1 - x0)
        yy = np.arange(hh)[:, None]
        span = np.zeros(ww, bool); span[x0 + 1:x1] = True
        below = (yy > bottom[None, :]) & span[None, :]
        inside = (yy <= bottom[None, :]) & span[None, :] & strings
        c[inside] = [16, 14, 13]
        a[below] = 0; a[inside] = 1
    save(c, a, "mascot-" + n)
    if n in ("peek", "sit", "wave", "walk"):                                 # sticker versions for dark backgrounds
        sc, sa = sticker(c, a, 12); save(sc, sa, "mascot-" + n + "-sticker")
    if n == "head":
        sc, sa = sticker(c, a, 14); save(sc, sa, "mascot-head-sticker"); save(sc, sa, "icon-512", 512); save(sc, sa, "icon-192", 192); save(sc, sa, "icon-32", 32)
