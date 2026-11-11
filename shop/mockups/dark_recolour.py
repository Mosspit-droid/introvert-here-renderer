"""Recolour a dark, low-colour garment (Black / Navy) in one of Barry's mockup photos into another dark
neutral (Dark Heather, Charcoal, Black, Navy).

recolour.py finds the garment by its hue, which doesn't work for black or navy. This finds it by brightness:
the garment is the large dark area at the centre of the photo. Thin dark parts (a hanger, a strap) are
trimmed off before the edges are feathered.

Colour: the garment's own shading (folds, shadows) is kept and stretched to the target's brightness, then the
target's fabric texture (the fine speckle of a heather) is borrowed from a reference photo of that colour.

Usage: python3 dark_recolour.py <photo.png> <target ref.png> <out.png> [--mask mask.png] [--seed x,y]
  target ref: a photo of the target-colour garment, centred (e.g. Barry's own Dark Heather photo).
  --seed: a garment pixel (fractions of width,height) when the garment isn't at the centre.
"""
import sys, argparse
import numpy as np
from PIL import Image
from scipy.ndimage import label, gaussian_filter, binary_fill_holes, binary_opening, binary_closing
from skimage import color


def centre_stats(lab, frac=0.1, seed=(0.5, 0.5)):
    h, w = lab.shape[:2]
    cy, cx = int(seed[1] * h), int(seed[0] * w)
    dy, dx = int(h * frac), int(w * frac)
    return lab[max(0, cy - dy):cy + dy, max(0, cx - dx):cx + dx].reshape(-1, 3)


def dark_mask(lab, seed=(0.5, 0.5), chroma_tol=10.0, trim=0.006):
    """The garment = the big smooth dark area around the seed. Brightness is smoothed first, so the fabric's
    gentle folds stay together and textured backdrops (concrete, wood) separate cleanly; the cut-off between
    garment and backdrop is found automatically (Otsu)."""
    from skimage.filters import threshold_otsu
    h, w = lab.shape[:2]
    S = max(h, w)
    c = centre_stats(lab, seed=seed)
    L0 = np.median(c[:, 0]); a0, b0 = np.median(c[:, 1]), np.median(c[:, 2])
    cy, cx = int(seed[1] * h), int(seed[0] * w)
    Ls = gaussian_filter(lab[..., 0], 0.004 * S)
    win = Ls[max(0, cy - h // 3):cy + h // 3, max(0, cx - w // 3):cx + w // 3]
    t = threshold_otsu(win)
    chroma = np.hypot(lab[..., 1] - a0, lab[..., 2] - b0)
    # fabric is smooth, backdrops (concrete, wood, leather) are grainy: local brightness spread
    sg = max(1.0, 0.0013 * S)
    mu = gaussian_filter(lab[..., 0], sg)
    sd = gaussian_filter(np.sqrt(np.clip(gaussian_filter(lab[..., 0] ** 2, sg) - mu * mu, 0, None)), 0.004 * S)
    sd0 = np.median(sd[max(0, cy - h // 10):cy + h // 10, max(0, cx - w // 10):cx + w // 10])
    smooth = sd < max(1.2, 2.2 * sd0)
    m = (Ls < t) & smooth & (gaussian_filter(chroma, 0.004 * S) < chroma_tol)
    r = max(2, int(trim * S))
    st = np.ones((2 * r + 1, 2 * r + 1), bool)
    m = binary_opening(m, structure=st)
    ids, n = label(m)
    if n == 0:
        raise SystemExit("garment not found")
    keep = ids[cy, cx] or 1 + np.bincount(ids.ravel())[1:].argmax()
    m = ids == keep
    m = binary_closing(m, structure=st)
    m = binary_fill_holes(m)
    return m, L0


def grabcut_mask(rgb, seed=(0.5, 0.5), trim=0.012):
    """Cut-out with OpenCV GrabCut: starts from 'dark and near the seed = garment, photo border = backdrop'
    and learns both colour models. More reliable than a brightness cut-off for black on dark backdrops."""
    import cv2
    img = (rgb[..., ::-1] * 255).astype(np.uint8)
    h, w = img.shape[:2]
    L = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)[..., 0].astype(float) * 100 / 255
    Ls = cv2.GaussianBlur(L, (0, 0), 0.004 * max(h, w))
    cy, cx = int(seed[1] * h), int(seed[0] * w)
    c = Ls[max(0, cy - h // 10):cy + h // 10, max(0, cx - w // 10):cx + w // 10]
    mask = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    mask[Ls < np.percentile(c, 95) + 6] = cv2.GC_PR_FGD
    yy, xx = np.mgrid[0:h, 0:w]
    core = (np.abs(xx - cx) < w * 0.1) & (np.abs(yy - cy) < h * 0.12) & (Ls < np.percentile(c, 70))
    mask[core] = cv2.GC_FGD
    b = int(0.03 * w)
    mask[:b, :] = mask[-b:, :] = cv2.GC_BGD; mask[:, :b] = mask[:, -b:] = cv2.GC_BGD
    sc = 750 / max(h, w)
    small = cv2.resize(img, (int(w * sc), int(h * sc)))
    ms = cv2.resize(mask, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_NEAREST)
    bgd = np.zeros((1, 65)); fgd = np.zeros((1, 65))
    cv2.grabCut(small, ms, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    m = ((ms == 1) | (ms == 3)).astype(np.uint8)
    m = cv2.resize(m, (w, h), interpolation=cv2.INTER_LINEAR) > 0
    r = max(2, int(trim * max(h, w)))
    st = np.ones((2 * r + 1, 2 * r + 1), bool)
    m = binary_opening(m, structure=st)            # drops thin parts: hanger wire, straps
    ids, n = label(m)
    if n == 0:
        raise SystemExit("garment not found")
    keep = ids[cy, cx] or 1 + np.bincount(ids.ravel())[1:].argmax()
    m = binary_fill_holes(ids == keep)
    cc = color.rgb2lab(rgb)[max(0, cy - h // 10):cy + h // 10, max(0, cx - w // 10):cx + w // 10].reshape(-1, 3)
    return m, np.median(cc[:, 0])


def texture(ref_lab, ref_mask, shape, sigma):
    """Seamless heather speckle with the same strength and grain size as the reference garment."""
    L = ref_lab[..., 0]
    hp = L - gaussian_filter(L, sigma)
    inner = gaussian_filter(ref_mask.astype(float), sigma * 6) > 0.98
    vals = hp[inner] if inner.any() else hp[ref_mask]
    std = vals.std() + 1e-6
    rng = np.random.default_rng(7)
    n = rng.standard_normal(shape)
    fine = gaussian_filter(n, max(0.6, sigma * 0.35))
    fine = fine / (fine.std() + 1e-6)
    flecks = (rng.random(shape) > 0.985).astype(float)         # occasional lighter fibres
    flecks = gaussian_filter(flecks, max(0.6, sigma * 0.35)); flecks /= (flecks.std() + 1e-6)
    out = 0.8 * fine + 0.35 * flecks
    out = out - out.mean()
    return out / (out.std() + 1e-6) * std, std


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photo"); ap.add_argument("target"); ap.add_argument("out")
    ap.add_argument("--mask"); ap.add_argument("--seed", default="0.5,0.5")
    ap.add_argument("--target-seed", default="0.5,0.5")
    ap.add_argument("--method", default="grabcut", choices=["grabcut", "brightness"])
    ap.add_argument("--contrast", type=float, default=None, help="fold contrast multiplier (default from target)")
    a = ap.parse_args()
    seed = tuple(float(v) for v in a.seed.split(","))
    tseed = tuple(float(v) for v in a.target_seed.split(","))

    rgb = np.asarray(Image.open(a.photo).convert("RGB")).astype(float) / 255
    lab = color.rgb2lab(rgb)
    m, L0 = grabcut_mask(rgb, seed) if a.method == "grabcut" else dark_mask(lab, seed)

    trgb = np.asarray(Image.open(a.target).convert("RGB")).astype(float) / 255
    # match the reference's scale to the photo so the speckle is the same size
    tlab = color.rgb2lab(trgb)
    tc = centre_stats(tlab, seed=tseed)
    Lt, at, bt = np.median(tc, 0)
    tm = (np.abs(tlab[..., 0] - Lt) < 10) & (np.hypot(tlab[..., 1] - at, tlab[..., 2] - bt) < 6)
    ids, _ = label(binary_opening(tm, iterations=3))
    k = ids[int(tseed[1] * tlab.shape[0]), int(tseed[0] * tlab.shape[1])]
    tm = binary_fill_holes(ids == k) if k else tm

    h, w = m.shape
    sig = max(1.5, 0.002 * max(h, w))
    tex, tstd = texture(tlab, tm, (h, w), sig)

    L = lab[..., 0]
    low = gaussian_filter(L, sig)                      # shading (folds/shadows) without the old fabric grain
    src = low[m]
    smu, ssd = np.median(src), src.std() + 1e-6
    tlow = gaussian_filter(tlab[..., 0], sig)[tm]
    tsd = tlow.std() + 1e-6
    k = a.contrast if a.contrast else float(np.clip(tsd / ssd, 1.6, 3.0))
    newL = Lt + (low - smu) * k + tex                  # target brightness, garment's folds, target's speckle
    newA = np.full_like(L, at); newB = np.full_like(L, bt)

    feather = gaussian_filter(m.astype(float), max(1.0, 0.0012 * max(h, w)))
    out = lab.copy()
    out[..., 0] = L * (1 - feather) + newL * feather
    out[..., 1] = lab[..., 1] * (1 - feather) + newA * feather
    out[..., 2] = lab[..., 2] * (1 - feather) + newB * feather
    res = np.clip(color.lab2rgb(out), 0, 1)
    Image.fromarray((res * 255).round().astype(np.uint8)).save(a.out)
    if a.mask:
        Image.fromarray((m * 255).astype(np.uint8)).save(a.mask)
    print(f"done: garment {m.mean()*100:.1f}% of photo, L {smu:.1f} -> {Lt:.1f}, contrast x{k:.2f}")


if __name__ == "__main__":
    main()
