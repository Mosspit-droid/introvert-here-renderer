"""Introvert Here Christmas logo (Barry's idea, 22 Nov 2026): the white wide logo with a Santa hat on the top-left
corner, holly on the top-right corner, the three dots of the ellipsis turned into baubles, and tinsel along the bottom.
Drawn here on the unaltered logo file. Usage: python3 build.py <output folder>  ->  christmas-wide.png
"""
import sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
HERE = __file__.rsplit("/", 1)[0]; OUT = sys.argv[1]
logo = Image.open(HERE + "/../main-collections/introvert-here-wide.png").convert("RGBA")
PAD_T, PAD_B, PAD_L, PAD_R = 260, 140, 160, 120
W, H = logo.width + PAD_L + PAD_R, logo.height + PAD_T + PAD_B
ox, oy = PAD_L, PAD_T
EDGE = (30, 14, 10, 255)
K = 2   # draw at double size, then shrink for smooth edges

def layer():
    im = Image.new("RGBA", (W * K, H * K)); return im, ImageDraw.Draw(im)
def S(*v): return [x * K for x in v]
def shade(im, light=(-0.6, -0.8), strength=0.35):
    """a soft light from the top left over everything drawn on the layer, kept inside the shapes"""
    a = np.asarray(im).astype(np.float32); al = a[..., 3] / 255
    soft = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(14 * K))).astype(np.float32) / 255
    gy, gx = np.gradient(soft); f = 1 + strength * 40 * (gx * light[0] + gy * light[1])
    a[..., :3] = np.clip(a[..., :3] * f[..., None], 0, 255); return Image.fromarray(a.astype(np.uint8))

base = Image.new("RGBA", (W, H)); base.alpha_composite(logo, (ox, oy))
FL, FR, FT, FB = 117 + ox, 4383 + ox, 433 + oy, 1067 + oy      # the logo frame's outer edges

# --- tinsel: a gold garland drooping along the bottom edge, in two swags ---
tin, d = layer()
def swag(x0, x1, y, sag):
    pts = [(x0 + (x1 - x0) * t / 60, y + sag * math.sin(math.pi * t / 60)) for t in range(61)]
    rng = np.random.default_rng(int(x0))
    for (x, yy) in pts:
        for _ in range(16):
            ang = rng.uniform(0, 2 * math.pi); L = rng.uniform(18, 46)
            col = (int(rng.uniform(215, 255)), int(rng.uniform(165, 205)), int(rng.uniform(30, 70)), 255)
            d.line(S(x, yy, x + L * math.cos(ang), yy + L * math.sin(ang)), fill=col, width=4 * K)
    d.line([(px * K, py * K) for px, py in pts], fill=(180, 120, 20, 255), width=10 * K)
for i in range(3):
    x0 = FL + 40 + i * (FR - FL - 80) / 3; swag(x0, x0 + (FR - FL - 80) / 3, FB - 10, 95)
base.alpha_composite(tin.resize((W, H), Image.LANCZOS))

# --- holly on the top-right corner: three leaves and three berries ---
hol, d = layer()
def leaf(cx, cy, ang, L=210, Wd=86):
    pts = []
    for t in range(0, 181, 6):
        s = t / 180; r = Wd / 2 * math.sin(math.pi * s) * (1 + 0.18 * math.cos(math.pi * s * 6))   # wavy, spiky edge
        pts.append((s * L, r))
    pts += [(x, -y) for x, y in reversed(pts)]
    c, sn = math.cos(ang), math.sin(ang)
    P = [(cx + x * c - y * sn, cy + x * sn + y * c) for x, y in pts]
    d.polygon(S(*sum(P, ())), fill=(38, 120, 52, 255), outline=EDGE, width=7 * K)
    d.line(S(cx, cy, cx + L * 0.92 * c, cy + L * 0.92 * sn), fill=(20, 70, 30, 255), width=5 * K)
hx, hy = FR - 30, FT + 10
for ang in (math.radians(-160), math.radians(-60), math.radians(150)):
    leaf(hx, hy, ang)
for bx, by in ((hx - 34, hy - 6), (hx + 22, hy - 30), (hx + 10, hy + 30)):
    d.ellipse(S(bx - 34, by - 34, bx + 34, by + 34), fill=(205, 22, 30, 255), outline=EDGE, width=7 * K)
    d.ellipse(S(bx - 18, by - 22, bx - 4, by - 8), fill=(255, 200, 200, 255))
base.alpha_composite(shade(hol).resize((W, H), Image.LANCZOS))

# --- the ellipsis dots become baubles (red, gold, green), each with a little cap and loop ---
bau, d = layer()
for (x0, x1), col in zip(((3882, 3959), (3979, 4056), (4076, 4152)), ((214, 28, 36), (230, 176, 34), (34, 140, 64))):
    cx, cy, r = (x0 + x1) / 2 + ox, 857 + oy, 52
    d.ellipse(S(cx - r, cy - r, cx + r, cy + r), fill=col + (255,), outline=EDGE, width=6 * K)
    d.rounded_rectangle(S(cx - 17, cy - r - 18, cx + 17, cy - r + 6), radius=4 * K, fill=(205, 205, 210, 255), outline=EDGE, width=5 * K)
    d.ellipse(S(cx - 10, cy - r - 36, cx + 10, cy - r - 16), outline=(205, 205, 210, 255), width=5 * K)
    d.ellipse(S(cx - r * 0.55, cy - r * 0.6, cx - r * 0.15, cy - r * 0.2), fill=(255, 255, 255, 190))
# the original dots are covered by the baubles
base.alpha_composite(shade(bau, strength=0.5).resize((W, H), Image.LANCZOS))

# --- the Santa hat on the top-left corner, tipped to the left, its bobble hanging off the corner ---
hat, d = layer()
cx, cy = FL + 160, FT + 46    # where the brim sits: over the corner of the frame
tilt = math.radians(-18)
def R(x, y): c, s = math.cos(tilt), math.sin(tilt); return (cx + x * c - y * s, cy + x * s + y * c)
cone = [R(-200, 0), R(-150, -150), R(-40, -250), R(70, -280), R(150, -230), R(200, 0)]
tip = R(-260, -170)
d.polygon(S(*sum([R(-200, 0), R(-170, -120), R(-120, -200), tip, R(-40, -240), R(60, -260), R(150, -190), R(200, 0)], ())), fill=(206, 24, 32, 255), outline=EDGE, width=8 * K)
d.ellipse(S(tip[0] - 52, tip[1] - 52, tip[0] + 52, tip[1] + 52), fill=(248, 248, 244, 255), outline=EDGE, width=7 * K)
brim = [R(-230, -20), R(230, -20), R(230, 50), R(-230, 50)]
d.polygon(S(*sum(brim, ())), fill=(248, 248, 244, 255), outline=EDGE, width=8 * K)
rng = np.random.default_rng(3)
for _ in range(90):   # a little fur texture on the brim and bobble
    x, y = R(rng.uniform(-220, 220), rng.uniform(-12, 42)); d.ellipse(S(x - 5, y - 5, x + 5, y + 5), fill=(222, 222, 216, 255))
base.alpha_composite(shade(hat).resize((W, H), Image.LANCZOS))

base = base.crop(base.getbbox()); base.save(f"{OUT}/christmas-wide.png", optimize=True); print("christmas-wide", base.size)
