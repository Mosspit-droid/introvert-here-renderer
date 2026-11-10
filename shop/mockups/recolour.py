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
from scipy.ndimage import label, gaussian_filter, binary_closing, binary_fill_holes, binary_dilation, binary_opening


def _morph(fn, m, it):
    """Closing/opening that doesn't shave pixels touching the photo edge (scipy treats outside as empty)."""
    p = np.pad(m, it, mode="edge")
    return fn(p, iterations=it)[it:-it, it:-it]
from skimage import color


def garment_mask(rgb, ref_lab=None, grow=True, hue_tol=16, cmin=6, dark_strict=True):
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
    loose = (np.abs(((hue - href + 180) % 360) - 180) < hue_tol) & (chroma > cmin) & lmax
    if dark_strict and ref_lab[0] < 30 and np.hypot(ref_lab[1], ref_lab[2]) < 25:   # dark, low-colour garment (e.g. Dark Chocolate): strict match only
        grow = False; core = (d < 9) & lmax
    near = _morph(binary_closing, core, 3)
    grown_ids, _ = label(near | loose) if grow else label(near)
    keep = np.unique(grown_ids[near]); keep = keep[keep > 0]
    near = np.isin(grown_ids, keep)
    near = _morph(binary_closing, near, 3)
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


def glow_weight(lab, m, reach=0.08):
    """Sunlit rims and edge pixels just outside the garment mask: bright, but still the garment's hue
    (red-orange for maroon) rather than the backdrop's (tan/orange). Returns a 0..1 weight."""
    from scipy.ndimage import distance_transform_edt
    h, w = m.shape
    near = distance_transform_edt(~m) < reach * max(h, w)
    hue = np.degrees(np.arctan2(lab[..., 2], lab[..., 1])); chroma = np.hypot(lab[..., 1], lab[..., 2])
    href = np.median(hue[m])
    dh = np.abs(((hue - href + 180) % 360) - 180)
    wgt = np.clip((26 - dh) / 8, 0, 1) * np.clip((chroma - 24) / 10, 0, 1)   # rims are vivid; leather/wood is dull
    # strongly sunlit rims drift further towards orange; the backdrop sits there too but is much less vivid
    orange = np.clip((36 - dh) / 6, 0, 1) * np.clip((chroma - 62) / 5, 0, 1) * (lab[..., 0] < 74)
    wgt = np.maximum(wgt, orange)
    # cracked leather can be vivid enough to pass; rims are smooth along the edge or far more vivid
    sg = 0.0025 * max(h, w)
    mu = gaussian_filter(lab[..., 0], sg)
    tex = np.sqrt(np.clip(gaussian_filter(lab[..., 0] ** 2, sg) - mu * mu, 0, None))
    wgt = wgt * (1 - (tex > 2.5) * (chroma < 44) * (((hue - href + 180) % 360 - 180) > 8))   # only orange-leaning texture (leather), not sharp rims in the garment's own hue
    # deep shadow right at the garment's edge (under cuffs and hems): dark and garment-coloured
    dark = (dh < 14) & (chroma > 6) & (lab[..., 0] < 18) & (distance_transform_edt(~m) < 0.004 * max(h, w))
    wgt = np.maximum(wgt, dark.astype(float)) * near
    wgt[m] = 0
    # only glow that touches the garment (not a stray red prop further away)
    ids, _ = label(wgt > 0.05)
    edge = distance_transform_edt(~m) < 3
    keep = np.unique(ids[edge & (ids > 0)])
    return wgt * np.isin(ids, keep)


def recolour(photo, src_ref, tgt_ref, seed_by_ref=True, glow=False, space="lab", hue_keep=0.4, box=None, poly=None, clip=None):
    P = np.asarray(Image.open(photo).convert("RGB")).astype(np.float64) / 255
    S = np.asarray(Image.open(src_ref).convert("RGB")).astype(np.float64) / 255
    T = np.asarray(Image.open(tgt_ref).convert("RGB")).astype(np.float64) / 255
    # references: strict detection only (a brown garment can sit close in hue to a brown/orange backdrop)
    sm, _ = garment_mask(S, color.rgb2lab(S)[S.shape[0] // 2, S.shape[1] // 2], grow=False)
    tm, _ = garment_mask(T, color.rgb2lab(T)[T.shape[0] // 2, T.shape[1] // 2], grow=False)
    # find the garment in the photo by the source garment's colour (wearers are often off-centre)
    seed = np.median(color.rgb2lab(S)[sm], 0) if seed_by_ref else None
    # with glow on: bright rims are caught by glow_weight, so growth only needs to reach deep shadow folds
    # (dark, red-leaning); the tighter hue window keeps it off orange-brown leather and wood
    def find(Q):
        if glow:
            strict, _ = garment_mask(Q, seed, grow=False)
            loose, _ = garment_mask(Q, seed, hue_tol=12, cmin=3)
            # dark folds sit inside the garment's outline; leaks onto shaded leather stick out of it
            r = max(2, round(0.025 * max(strict.shape)))
            env = binary_fill_holes(_morph(binary_closing, strict, r))
            env = binary_dilation(env, iterations=max(1, r // 3))
            pm = strict | (loose & env)
        else:
            pm, _ = garment_mask(Q, seed, dark_strict=not box)   # inside a tight box, brown wood can't leak in
        if glow:   # trim thin spikes where the outline leaks into similar-coloured surroundings (book spines)
            r = max(2, round(0.004 * max(pm.shape)))
            op = _morph(binary_opening, pm, r)
            ids, _ = label(op); sz = np.bincount(ids.ravel()); sz[0] = 0
            pm = binary_fill_holes(pm & binary_dilation(ids == sz.argmax(), iterations=r))   # keep edges, lose spikes
            # cracked leather next to the garment can match maroon; it is far more textured and a touch more orange
            L0 = color.rgb2lab(Q)
            sg = 0.0025 * max(pm.shape)
            mu = gaussian_filter(L0[..., 0], sg)
            tex = np.sqrt(np.clip(gaussian_filter(L0[..., 0] ** 2, sg) - mu * mu, 0, None))
            hue0 = np.degrees(np.arctan2(L0[..., 2], L0[..., 1]))
            href0 = np.median(hue0[pm])
            pm = pm & ~((tex > 2.5) & (hue0 - href0 > 10))
            ids, _ = label(pm); sz = np.bincount(ids.ravel()); sz[0] = 0
            pm = ids == sz.argmax()
        return pm
    inbox = np.ones(P.shape[:2], bool)
    if box:   # only look inside this part of the photo (fractions x0, y0, x1, y1), e.g. a small figure in a busy scene
        h, w = P.shape[:2]
        x0, y0, x1, y1 = round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)
        pm = np.zeros((h, w), bool); pm[y0:y1, x0:x1] = find(P[y0:y1, x0:x1])
        inbox[:] = False; inbox[y0:y1, x0:x1] = True
    else:
        pm = find(P)
    if poly:   # hand-traced garment outline (fractions), for fabric the colour rules can't tell from the background
        from PIL import ImageDraw
        h, w = P.shape[:2]
        im = Image.new('L', (w, h), 0)
        ImageDraw.Draw(im).polygon([(x * w, y * h) for x, y in poly], fill=1)
        pm = pm | np.asarray(im, bool)
    if clip:   # hand-traced outer limit (fractions): nothing outside it is recoloured
        from PIL import ImageDraw
        h, w = P.shape[:2]
        im = Image.new('L', (w, h), 0)
        ImageDraw.Draw(im).polygon([(x * w, y * h) for x, y in clip], fill=1)
        inbox = inbox & np.asarray(im, bool)
        pm = pm & inbox
    Pl, Sl, Tl = color.rgb2lab(P), color.rgb2lab(S), color.rgb2lab(T)
    ms, ss = stats(Sl, sm)          # source garment in its reference photo
    mt, st = stats(Tl, tm)          # target garment in its reference photo
    mp, sp = stats(Pl, pm)          # garment in the photo being changed
    out = Pl.copy()
    if space == "lab":
        # keep this photo's own lighting: shift relative to how the source ref differs from the target ref
        for c in range(3):
            scale = st[c] / ss[c]
            out[..., c] = (Pl[..., c] - mp[c]) * scale + mp[c] + (mt[c] - ms[c])
    else:
        # "lch": lightness as above, but colour handled as strength + hue. In a maroon photo brighter fabric
        # is "more red"; shifting a/b directly keeps that, so highlights on the new colour glow red.
        # Here a highlight stays a highlight of the new colour.
        def lch(L):
            return L[..., 0], np.hypot(L[..., 1], L[..., 2]), np.arctan2(L[..., 2], L[..., 1])
        def cmean(hh):
            return np.arctan2(np.sin(hh).mean(), np.cos(hh).mean())
        pL, pC, pH = lch(Pl); _, sC, sH = lch(Sl); _, tC, tH = lch(Tl)
        out[..., 0] = (pL - mp[0]) * (st[0] / ss[0]) + mp[0] + (mt[0] - ms[0])
        mpC = pC[pm].mean()
        C = pC * (tC[tm].mean() / mpC)     # garment's average colour strength = the target reference's
        dH = np.angle(np.exp(1j * (pH - cmean(pH[pm]))))       # this pixel's hue relative to the garment's
        H = cmean(tH[tm]) + dH * hue_keep
        out[..., 1], out[..., 2] = C * np.cos(H), C * np.sin(H)
    new = np.clip(color.lab2rgb(out), 0, 1)
    soft = gaussian_filter(pm.astype(float), 1.5)
    if box:   # a small background figure is usually out of focus: blend over its blurred edge, not a hard line
        k = max(1, round(0.001 * max(pm.shape)))
        soft = np.maximum(soft, gaussian_filter(binary_dilation(pm, iterations=k).astype(float), 0.0015 * max(pm.shape)) * inbox)
    if glow:
        gw = glow_weight(Pl, pm) * inbox
        soft = np.maximum.reduce([soft, gw, gaussian_filter(gw, 2)])   # soften outer edges, but keep thin stitch lines at full strength
    soft = soft[..., None]
    res = P * (1 - soft) + new * soft
    return Image.fromarray((res * 255).round().astype(np.uint8)), pm


if __name__ == "__main__":
    img, _ = recolour(sys.argv[1], sys.argv[2], sys.argv[3])
    img.save(sys.argv[4])
