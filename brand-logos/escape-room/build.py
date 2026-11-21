"""The Escape Room logos: the Introvert Here wide and stacked logos with a yellow DO NOT ENTER door hanger threaded
over the frame (Barry's idea and rough artwork, 21 Nov 2026; redrawn clean here on the sharp logo files).

Barry's notes: a rectangular hanger; the words properly centred; dark lines round the solid shapes, because yellow
straight onto white doesn't always read.

Usage: python3 build.py <Montserrat ExtraBold .ttf> <output folder>
Writes escape-room-wide.png and escape-room-stacked.png (see-through background, like the other range logos).
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import binary_dilation, gaussian_filter

FONT, OUT = sys.argv[1], sys.argv[2]
HERE = __file__.rsplit("/", 1)[0]
YELLOW, INK = (251, 213, 6), (17, 17, 17)
WORDS = ["DO", "NOT", "ENTER"]

def hanger(T, U, tilt):
    """A rectangular door hanger with a round hole near the top. T = thickness of the bar that goes through the
    hole, U = the hanger's unit of size, tilt in degrees clockwise. Returns (picture, the hole's centre in it)."""
    k = 3                                         # drawn large, then shrunk, for smooth edges
    line = 0.085 * U                              # the dark outline
    rh = 0.5 * T + 0.2 * U                        # hole: the bar plus a little air
    W, H = 3.5 * U, 0.55 * U + 2 * rh + 4.15 * U  # top strip, hole, then room for three lines of words
    pad = 0.8 * U; cw, ch = int(W + 2 * pad), int(H + 2 * pad)
    hx, hy = pad + W / 2, pad + 0.55 * U + rh     # the hole's centre
    im = Image.new("RGBA", (cw * k, ch * k)); d = ImageDraw.Draw(im)
    S = lambda *v: [x * k for x in v]
    d.rounded_rectangle(S(pad, pad, pad + W, pad + H), radius=0.34 * U * k, fill=INK + (255,))
    d.rounded_rectangle(S(pad + line, pad + line, pad + W - line, pad + H - line), radius=(0.34 * U - line) * k, fill=YELLOW + (255,))
    d.ellipse(S(hx - rh - line, hy - rh - line, hx + rh + line, hy + rh + line), fill=INK + (255,))
    d.ellipse(S(hx - rh, hy - rh, hx + rh, hy + rh), fill=(0, 0, 0, 0))
    # the words: one size for all three (the widest sets it), each centred on the hanger, the block centred in the
    # space under the hole
    top, bot = hy + rh + line + 0.3 * U, pad + H - line - 0.38 * U
    size = 10
    while max(d.textlength(w, font=ImageFont.truetype(FONT, size + 1)) for w in WORDS) <= (W - 0.62 * U) * k and (size + 1) * 0.9 * 3 <= (bot - top) * k: size += 1
    f = ImageFont.truetype(FONT, size); cap = f.getbbox("H"); caph = cap[3] - cap[1]
    gap = ((bot - top) * k - 3 * caph) / 2 if (bot - top) * k > 3 * caph * 1.25 else caph * 0.3
    gap = min(gap, caph * 0.36); block = 3 * caph + 2 * gap; y = top * k + ((bot - top) * k - block) / 2
    for w in WORDS:
        d.text((hx * k, y + caph / 2), w, font=f, fill=INK + (255,), anchor="mm"); y += caph + gap
    im = im.resize((cw, ch), Image.LANCZOS).rotate(-tilt, resample=Image.BICUBIC, center=(hx, hy))
    return im, (hx, hy), line

def build(base, name, T, U, at, tilt):
    logo = Image.open(base).convert("RGBA")
    out = Image.new("RGBA", (logo.width, 2200)); out.alpha_composite(logo)
    tag, (hx, hy), line = hanger(T, U, tilt)
    layer = Image.new("RGBA", out.size); layer.alpha_composite(tag, (round(at[0] - hx), round(at[1] - hy)))
    out.alpha_composite(layer)
    # Threading: left of the hole the bar passes in front of the hanger, right of it behind. Put the bar back over the
    # hanger on the left, with a dark line along each edge so white never sits straight on yellow.
    L, O = np.asarray(layer), np.asarray(out).copy()
    lg = np.zeros_like(O); lg[:logo.height] = np.asarray(logo)
    ys, xs = np.mgrid[0:O.shape[0], 0:O.shape[1]]
    front = (lg[..., 3] > 128) & (L[..., 3] > 128) & (xs < at[0]) & (np.abs(ys - at[1]) <= T * 0.5 + 2)
    edge = binary_dilation(front, iterations=max(2, round(line))) & ~front & (L[..., 3] > 128) & (xs < at[0] + line)
    O[edge] = INK + (255,); O[front] = lg[front]
    out = Image.fromarray(O); bb = out.getbbox(); out = out.crop((0, 0, out.width, bb[3] + 40))
    out.save(f"{OUT}/{name}.png", optimize=True); print(name, out.size)

M = HERE + "/../main-collections/"
# wide: frame 4266 x 634 at (117, 433), bars 86 thick; the hanger hangs from the bottom bar, under the dots
build(M + "introvert-here-wide.png", "escape-room-wide", 86, 112, (3780, 1024), 7)
# stacked: bottom band 179 thick (983..1162); the hanger hangs from it, left of the three dots
build(M + "introvert-here-stacked.png", "escape-room-stacked", 179, 112, (2300, 1072), 7)
