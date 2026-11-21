"""The Escape Room logos: the Introvert Here wide and stacked logos with a yellow DO NOT ENTER door hanger hooked
over the frame (Barry's idea and rough artwork, 21 Nov 2026; redrawn here on the sharp logo files).

Barry's notes: a rectangular hanger; a hook, not a closed loop; the words properly centred; dark lines round the
solid shapes (yellow straight onto white doesn't always read); and it should look like a real object, not flat colour.

Usage: python3 build.py <Montserrat ExtraBold .ttf> <output folder>
Writes escape-room-wide.png, escape-room-stacked.png (see-through background, like the other range logos) and
hanger.png (the hanger on its own).
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import binary_dilation, binary_erosion, gaussian_filter

FONT, OUT = sys.argv[1], sys.argv[2]
HERE = __file__.rsplit("/", 1)[0]
YELLOW, EDGE, INK = np.array([250, 208, 12.0]), np.array([46, 36, 4.0]), (20, 18, 14)
WORDS = ["DO", "NOT", "ENTER"]

def hanger(T, U, tilt):
    """A rectangular card door hanger: a round hole near the top, open to the left edge through a slot, which makes
    the top a hook. T = thickness of the bar it hangs on, U = its unit of size, tilt in degrees clockwise.
    Returns (picture, the hole's centre in it, outline width, its solid shape as a mask)."""
    k = 2
    line = 0.07 * U
    rh = 0.5 * T + 0.2 * U
    W, H = 3.5 * U, 0.6 * U + 2 * rh + 4.15 * U
    pad = 1.2 * U; cw, ch = int(W + 2 * pad), int(H + 2 * pad)
    hx, hy = pad + W / 2, pad + 0.6 * U + rh
    m = Image.new("L", (cw * k, ch * k), 0); d = ImageDraw.Draw(m)
    S = lambda *v: [x * k for x in v]
    d.rounded_rectangle(S(pad, pad, pad + W, pad + H), radius=0.36 * U * k, fill=255)
    d.ellipse(S(hx - rh, hy - rh, hx + rh, hy + rh), fill=0)
    sw = min(1.5 * rh, 0.9 * T + 0.1 * U)        # the slot: from the hole down and out through the left edge
    d.polygon(S(hx, hy - sw * 0.5, hx, hy + sw * 0.5, pad - U, hy + sw * 0.5 + 0.62 * (hx - pad + U), pad - U, hy - sw * 0.5 + 0.62 * (hx - pad + U)), fill=0)
    M = gaussian_filter(np.asarray(m).astype(np.float32) / 255, 0.09 * U * k) > 0.5    # soften every corner a little
    solid = M.copy()
    inner = binary_erosion(M, iterations=max(1, round(line * k)))
    hgt, wid = M.shape; yy, xx = np.mgrid[0:hgt, 0:wid].astype(np.float32)
    # card stock: a soft light from the top left, a rounded edge, and a little grain
    col = np.ones((hgt, wid, 3), np.float32) * YELLOW
    col *= (1.07 - 0.16 * ((xx / wid) * 0.45 + (yy / hgt) * 0.55))[..., None]
    soft = gaussian_filter(M.astype(np.float32), 0.11 * U * k); gy, gx = np.gradient(soft)
    col *= (1 + 2.6 * U * k * 0.02 * (gx * 0.6 + gy * 0.8))[..., None]                # lit top-left edges, shaded bottom-right
    grain = gaussian_filter(np.random.default_rng(4).normal(0, 1, (hgt, wid)).astype(np.float32), 0.8); col *= (1 + 0.012 * grain / grain.std())[..., None]
    sheen = np.exp(-(((xx - yy * 0.55 - wid * 0.12) / (wid * 0.16)) ** 2)); col += 9 * sheen[..., None]   # a faint diagonal sheen
    rgb = np.where(inner[..., None], col, EDGE)
    im = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), gaussian_filter(M.astype(np.float32), 0.6) * 255]).astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(im)
    # the words: one size for all three, each centred on the hanger, the block centred in the space under the hole
    top, bot = (hy + rh + line + 0.34 * U) * k, (pad + H - line - 0.4 * U) * k
    size = 10
    while max(d.textlength(w, font=ImageFont.truetype(FONT, size + 1)) for w in WORDS) <= (W - 0.66 * U) * k: size += 1
    f = ImageFont.truetype(FONT, size); cap = f.getbbox("H"); caph = cap[3] - cap[1]
    gap = min(caph * 0.36, (bot - top - 3 * caph) / 2); y = top + (bot - top - 3 * caph - 2 * gap) / 2
    for w in WORDS:
        d.text((hx * k, y + caph / 2), w, font=f, fill=INK + (242,), anchor="mm"); y += caph + gap
    rot = lambda p, res=Image.BICUBIC: p.resize((cw, ch), Image.LANCZOS).rotate(-tilt, resample=res, center=(hx, hy))
    return rot(im), (hx, hy), line, np.asarray(rot(Image.fromarray((solid * 255).astype(np.uint8)))) > 128

def shadow(mask, blur, dx, dy, strength):
    s = gaussian_filter(mask.astype(np.float32), blur); s = np.roll(np.roll(s, dy, 0), dx, 1)
    return np.dstack([np.zeros(s.shape + (3,), np.float32), s * strength * 255]).astype(np.uint8)

def build(base, name, T, U, at, tilt):
    logo = Image.open(base).convert("RGBA")
    size = (logo.width, 2300)
    lg = Image.new("RGBA", size); lg.alpha_composite(logo); LG = np.asarray(lg)
    tag, (hx, hy), line, solid = hanger(T, U, tilt)
    ox, oy = round(at[0] - hx), round(at[1] - hy)
    S = np.zeros(size[::-1], bool); S[oy:oy + solid.shape[0], ox:ox + solid.shape[1]] = solid
    ys, xs = np.mgrid[0:size[1], 0:size[0]]
    # The hook goes over the bar from the front on the right and down behind it on the left, so: left of the hole
    # the bar is in front of the hanger; right of it the hanger is in front of the bar.
    front = (LG[..., 3] > 128) & S & (xs < at[0]) & (np.abs(ys - at[1]) <= T * 0.5 + 2)
    out = lg.copy()
    # the hanger's shadow on the logo. None on the bar to the left of the hole: there the hook is behind the bar, and
    # must not show through it in any way (no shadow, no outline).
    sh = shadow(S, 0.16 * U, round(0.1 * U), round(0.14 * U), 0.5)
    sh[(LG[..., 3] > 0) & (xs < at[0] + 0.5 * T) & (np.abs(ys - at[1]) <= T * 0.5 + 3), 3] = 0
    out.alpha_composite(Image.fromarray(sh, "RGBA"))
    layer = Image.new("RGBA", size); layer.alpha_composite(tag, (ox, oy)); out.alpha_composite(layer)
    O = np.asarray(out).copy()
    barsh = shadow(front, 0.07 * U, 0, round(0.07 * U), 0.55)[..., 3] / 255.0 * (S & ~front)                    # the bar's shadow on the hanger
    O[..., :3] = (O[..., :3] * (1 - barsh[..., None])).astype(np.uint8)
    behind = (LG[..., 3] > 0) & (xs < at[0]) & (np.abs(ys - at[1]) <= T * 0.5 + 3)   # every pixel of the bar, soft edges included
    O[behind] = LG[behind]
    out = Image.fromarray(O); bb = out.getbbox(); out = out.crop((0, 0, out.width, bb[3] + 40))
    out.save(f"{OUT}/{name}.png", optimize=True); print(name, out.size)

M = HERE + "/../main-collections/"
# wide: frame 4266 x 634 at (117, 433), bars 86 thick; the hanger hangs from the bottom bar, under the dots
build(M + "introvert-here-wide.png", "escape-room-wide", 86, 112, (3780, 1024), 7)
# stacked: bottom band 179 thick (983..1162); the hanger hangs from it, left of the three dots
build(M + "introvert-here-stacked.png", "escape-room-stacked", 179, 112, (2462, 1072), 7)   # as near the three dots as it goes without covering them
