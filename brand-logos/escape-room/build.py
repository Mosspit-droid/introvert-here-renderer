"""The Escape Room logos: the Introvert Here wide and stacked logos with a yellow DO NOT ENTER door hanger hooked
over the frame (Barry's idea and rough artwork, 21 Nov 2026; redrawn clean here on the sharp logo files).

Usage: python3 build.py <Montserrat ExtraBold .ttf> <output folder>
Writes escape-room-wide.png and escape-room-stacked.png (see-through background, like the other range logos).
"""
import sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter

FONT, OUT = sys.argv[1], sys.argv[2]
HERE = __file__.rsplit("/", 1)[0]
YELLOW, INK = (251, 213, 6), (17, 17, 17)

def hanger(T, U, tilt):
    """A door hanger. T = thickness of the bar it hooks over, U = its body's unit of size, tilt in degrees clockwise.
    Returns (picture, where the middle of the hooked bar is inside it)."""
    k = 3                                    # drawn large, then shrunk, for smooth edges
    ri, ro = 0.64 * T, 0.64 * T + 0.62 * U   # the hook's hole fits the bar; its band is as thick as the body is bold
    W, H = int(ro * 2 + U * 5), int(ro * 2 + U * 7.2)
    cx, cy = W / 2, ro + U * 0.5
    m = Image.new("L", (W * k, H * k), 0); d = ImageDraw.Draw(m)
    P = lambda x, y: ((cx + x) * k, (cy + y) * k)
    d.ellipse([P(-ro, -ro), P(ro, ro)], fill=255)                                   # the hook, as a full ring for now
    xr, top, bot = ro, ro + 0.55 * U, ro + 0.55 * U + 4.3 * U                       # body: right edge, top, bottom
    d.polygon([P(xr - 3.5 * U, top + 0.75 * U), P(xr - 1.5 * U, top), P(xr - 0.9 * U, ro * 0.55), P(xr, 0),
               P(xr + 0.12 * U, bot), P(xr - 3.9 * U, bot - 0.3 * U)], fill=255)    # shoulder sloping up to the neck
    a = np.asarray(m).astype(np.float32) / 255
    a = (gaussian_filter(a, 0.16 * U * k) > 0.5).astype(np.float32)                 # round every corner
    hole = Image.new("L", (W * k, H * k), 0); h = ImageDraw.Draw(hole)
    h.ellipse([P(-ri, -ri), P(ri, ri)], fill=255)                                   # the hole the bar passes through
    h.polygon([P(-ri * 0.2, 0), P(-ro * 1.2, ro * 1.35), P(ri * 0.25, ro * 1.6), P(ri * 0.7, ri * 0.4)], fill=255)   # the hook's opening
    hm = (gaussian_filter(np.asarray(hole).astype(np.float32) / 255, 0.05 * U * k) > 0.5)
    body = Image.new("L", (W * k, H * k), 0); ImageDraw.Draw(body).rectangle([P(xr - 4.2 * U, top + 0.3 * U), P(xr + U, bot + U)], fill=255)
    keep = np.asarray(body) > 0
    a = np.where(hm & ~keep, 0, a)
    a = gaussian_filter(a, 0.7 * k / 2)
    im = Image.new("RGBA", (W * k, H * k), YELLOW + (0,)); im.putalpha(Image.fromarray((a * 255).astype(np.uint8)))
    f = ImageFont.truetype(FONT, int(0.92 * U * k)); dd = ImageDraw.Draw(im)
    bx = (xr - 1.9 * U)                                                               # middle of the body
    for i, t in enumerate(["DO", "NOT", "ENTER"]):
        w = dd.textlength(t, font=f); x, y = P(bx, top + (1.0 + i * 0.98) * U)
        dd.text((x - w / 2, y), t, font=f, fill=INK + (255,))
    im = im.resize((W, H), Image.LANCZOS).rotate(-tilt, resample=Image.BICUBIC, center=(cx, cy))
    return im, (cx, cy)

def build(base, name, T, U, at, tilt, canvas_h):
    logo = Image.open(base).convert("RGBA")
    out = Image.new("RGBA", (logo.width, canvas_h)); out.alpha_composite(logo)
    tag, (hx, hy) = hanger(T, U, tilt)
    out.alpha_composite(tag, (round(at[0] - hx), round(at[1] - hy)))
    # the hook's tip passes behind the bar: put the bar back over it, to the left of the hook's middle
    box = (round(at[0] - (0.64 * T + 0.62 * U) * 1.25), round(at[1] - T * 0.6), round(at[0] - 0.64 * T * 0.2), round(at[1] + T * 0.6))
    out.alpha_composite(logo.crop(box), box[:2])
    bb = out.getbbox(); out = out.crop((0, 0, out.width, bb[3] + 40))
    out.save(f"{OUT}/{name}.png", optimize=True); print(name, out.size)

M = HERE + "/../main-collections/"
# wide: frame 4266 x 634 at (117, 433), bars 86 thick; the hanger hooks over the bottom bar, under the dots
build(M + "introvert-here-wide.png", "escape-room-wide", 86, 118, (3770, 1024), 8, 1900)
# stacked: bottom band 179 thick (983..1162); the hanger hooks over it, left of the three dots
build(M + "introvert-here-stacked.png", "escape-room-stacked", 179, 118, (2330, 1072), 8, 1900)
