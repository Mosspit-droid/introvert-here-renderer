"""Put Printify's white-background mockups onto each range's background.

How it works: the white area connected to the picture's edges is "background". Everything else (the
garment and its print, including white lettering) is kept as it is. The background area is blended
with the range texture by multiplying, so Printify's soft shadows and anti-aliased edges darken the
texture naturally instead of leaving a white halo. A soft drop shadow adds depth.

Usage: python3 compose.py <mockup.jpg> <range code IH|SH|PC|OS> <out.jpg> <textures folder>
or import compose() from another script.
"""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import label, gaussian_filter, binary_dilation

SIZE = 1200
_tex = {}

def texture(coll, folder):
    if coll not in _tex:
        if coll == "SH":
            t = Image.open(f"{folder}/SH-wood.jpg").convert("RGB")
            w, h = t.size; s = min(w, h); t = t.crop(((w - s) // 2, h - s, (w - s) // 2 + s, h))
            arr = np.asarray(t.resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float32) / 255 * 0.85
        else:
            name = {"IH": "concrete.jpg", "PC": "bg-PC.jpg", "OS": "bg-OS.jpg"}[coll]
            t = Image.open(f"{folder}/{name}").convert("RGB")
            s = min(t.size + (880,)); t = t.crop((0, 0, s, s))   # stay inside one copy of the mirrored tile (seam at 900px)
            arr = np.asarray(t.resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float32) / 255
        # gentle vignette so the garment sits in a pool of light
        y, x = np.mgrid[0:SIZE, 0:SIZE] / SIZE - 0.5
        arr = arr * (1.08 - 0.45 * (x * x + y * y))[..., None]
        _tex[coll] = np.clip(arr, 0, 1)
    return _tex[coll]

def compose(src, coll, folder):
    im = Image.open(src).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255
    nearwhite = a.min(2) > 0.78   # light enough to be backdrop or Printify's shadow (garment colours are all far darker)
    lab, _ = label(nearwhite)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, edge[edge > 0])
    garment = ~binary_dilation(bg, iterations=2)          # solid garment area, edge pixels excluded
    soft = gaussian_filter(garment.astype(np.float32), 1.2)  # feathered edge
    T = texture(coll, folder)
    shadow = gaussian_filter(garment.astype(np.float32), 18)
    shadow = np.roll(np.roll(shadow, 14, 0), 6, 1)
    T = T * (1 - 0.45 * shadow[..., None])
    outside = T * a                                       # multiply: white -> texture, grey shadow -> darker texture
    out = outside * (1 - soft[..., None]) + a * soft[..., None]
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))

if __name__ == "__main__":
    compose(sys.argv[1], sys.argv[2], sys.argv[4]).save(sys.argv[3], quality=85)
