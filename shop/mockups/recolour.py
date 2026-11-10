"""Recolour the garment in one of Barry's mockup photos (e.g. Maroon -> Forest Green / Dark Chocolate).

Method:
- Garment mask = the largest connected area of pixels close to the source garment colour (so props that
  happen to share the colour, like a leather book, are left alone). Edges are feathered.
- Colour transfer in Lab space inside the mask: match the mean and spread of each channel to a reference
  photo of the target colour (ideally Barry's own photo of the same garment in that colour), keeping all
  the folds, shadows and fabric texture.
- Everything outside the mask is untouched. Print/logo layers live in Canva on top, so they're unaffected.

Usage: python3 recolour.py <photo.png> <source ref.png> <target ref.png> <out.png>
The two refs are photos showing the source colour and target colour garments (their garment is found the same way).
"""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import label, gaussian_filter, binary_closing, binary_fill_holes
from skimage import color


def garment_mask(rgb, ref_lab=None, grow=True):
    lab = color.rgb2lab(rgb)
    if ref_lab is None:
        # seed: the colour at the centre of the image (the garment is always centred)
        h, w = lab.shape[:2]
        ref_lab = np.median(lab[h // 2 - h // 10:h // 2 + h // 10, w // 2 - w // 10:w // 2 + w // 10].reshape(-1, 3), 0)
    d = np.sqrt(((lab[..., 1:] - ref_lab[1:]) ** 2).sum(-1))           # chroma distance (lighting-independent)
    lmax = lab[..., 0] < ref_lab[0] + 16          # fabric (even in highlights) is darker than skin and lit wood
    core = (d < 14) & lmax
    # sunlit or shaded fabric drifts in brightness and warmth, so also accept pixels whose hue angle is close
    # to the garment's (background orange/brown sits at a clearly different angle), if they touch the core
    hue = np.degrees(np.arctan2(lab[..., 2], lab[..., 1])); href = np.degrees(np.arctan2(ref_lab[2], ref_lab[1]))
    chroma = np.hypot(lab[..., 1], lab[..., 2])
    loose = (np.abs(((hue - href + 180) % 360) - 180) < 16) & (chroma > 6) & lmax
    if ref_lab[0] < 30 and np.hypot(ref_lab[1], ref_lab[2]) < 25:   # dark, low-colour garment (e.g. Dark Chocolate): strict match only
        grow = False; core = (d < 9) & lmax
    near = binary_closing(core, iterations=3)
    grown_ids, _ = label(near | loose) if grow else label(near)
    keep = np.unique(grown_ids[near]); keep = keep[keep > 0]
    near = np.isin(grown_ids, keep)
    near = binary_closing(near, iterations=3)
    lab_ids, n = label(near)
    if n == 0:
        raise SystemExit("garment not found")
    sizes = np.bincount(lab_ids.ravel())[1:]
    m = lab_ids == (1 + sizes.argmax())
    m = binary_fill_holes(m)
    return m, ref_lab


def stats(lab, m):
    v = lab[m]
    return v.mean(0), v.std(0) + 1e-6


def recolour(photo, src_ref, tgt_ref, seed_by_ref=True):
    P = np.asarray(Image.open(photo).convert("RGB")).astype(np.float64) / 255
    S = np.asarray(Image.open(src_ref).convert("RGB")).astype(np.float64) / 255
    T = np.asarray(Image.open(tgt_ref).convert("RGB")).astype(np.float64) / 255
    # references: strict detection only (a brown garment can sit close in hue to a brown/orange backdrop)
    sm, _ = garment_mask(S, color.rgb2lab(S)[S.shape[0] // 2, S.shape[1] // 2], grow=False)
    tm, _ = garment_mask(T, color.rgb2lab(T)[T.shape[0] // 2, T.shape[1] // 2], grow=False)
    # find the garment in the photo by the source garment's colour (wearers are often off-centre)
    seed = np.median(color.rgb2lab(S)[sm], 0) if seed_by_ref else None
    pm, _ = garment_mask(P, seed)
    Pl, Sl, Tl = color.rgb2lab(P), color.rgb2lab(S), color.rgb2lab(T)
    ms, ss = stats(Sl, sm)          # source garment in its reference photo
    mt, st = stats(Tl, tm)          # target garment in its reference photo
    mp, sp = stats(Pl, pm)          # garment in the photo being changed
    out = Pl.copy()
    # keep this photo's own lighting: shift relative to how the source ref differs from the target ref
    for c in range(3):
        scale = st[c] / ss[c]
        out[..., c] = (Pl[..., c] - mp[c]) * scale + mp[c] + (mt[c] - ms[c])
    new = np.clip(color.lab2rgb(out), 0, 1)
    soft = gaussian_filter(pm.astype(float), 1.5)[..., None]
    res = P * (1 - soft) + new * soft
    return Image.fromarray((res * 255).round().astype(np.uint8)), pm


if __name__ == "__main__":
    img, _ = recolour(sys.argv[1], sys.argv[2], sys.argv[3])
    img.save(sys.argv[4])
