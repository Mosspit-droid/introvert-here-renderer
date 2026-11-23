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
    pts = [(x0 + (x1 - x0) * t / 90, y + sag * math.sin(math.pi * t / 90)) for t in range(91)]
    rng = np.random.default_rng(int(x0))
    d.line([(px * K, py * K) for px, py in pts], fill=(150, 95, 10, 255), width=16 * K)
    for layer_n, (n, lo, hi, w) in enumerate(((22, 26, 58, 5), (18, 14, 36, 3))):
        for (x, yy) in pts:
            for _ in range(n):
                ang = rng.uniform(0, 2 * math.pi); L = rng.uniform(lo, hi)
                g = rng.uniform(0, 1)
                col = (int(200 + 55 * g), int(140 + 75 * g), int(20 + 60 * g), 255) if layer_n == 0 else (255, int(225 + 30 * g), int(120 + 80 * g), 255)
                d.line(S(x, yy, x + L * math.cos(ang), yy + L * math.sin(ang)), fill=col, width=w * K)
    for _ in range(40):   # sparkles
        k = rng.integers(0, len(pts)); x, yy = pts[k]; x += rng.uniform(-30, 30); yy += rng.uniform(-30, 30); r = rng.uniform(6, 11)
        d.line(S(x - r, yy, x + r, yy), fill=(255, 255, 240, 255), width=3 * K); d.line(S(x, yy - r, x, yy + r), fill=(255, 255, 240, 255), width=3 * K)
for i in range(3):
    x0 = FL + 30 + i * (FR - FL - 60) / 3; swag(x0, x0 + (FR - FL - 60) / 3, FB - 14, 120)
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

# --- the Santa hat on the top-left corner: a soft, floppy cone that folds over to the left, a furry brim over the
# frame's corner, and a bobble hanging off the edge. Shaded red, with a darker fold.
hat, d = layer()
cx, cy = FL + 170, FT + 50
tilt = math.radians(-16)
def R(x, y): c, s = math.cos(tilt), math.sin(tilt); return (cx + x * c - y * s, cy + x * s + y * c)
def bez(p0, p1, p2, p3, n=40):
    return [((1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t ** 2 * p2[0] + t ** 3 * p3[0],
             (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t ** 2 * p2[1] + t ** 3 * p3[1]) for t in [k / n for k in range(n + 1)]]
tip = (-290, -150)
# body: right side rises in a curve to a rounded crown, then flops down and left to the tip
right = bez((205, 0), (215, -150), (150, -280), (20, -300))
crown = bez((20, -300), (-110, -315), (-230, -260), tip)
under = bez(tip, (-210, -170), (-190, -110), (-205, 0))
body = [R(x, y) for x, y in right + crown + under]
d.polygon(S(*sum(body, ())), fill=(200, 22, 30, 255), outline=EDGE, width=8 * K)
# the fold: a darker crease where the top flops over
fold = [R(x, y) for x, y in bez((10, -290), (-60, -235), (-150, -205), (-240, -180)) + bez((-240, -180), (-150, -220), (-70, -260), (10, -290))]
d.polygon(S(*sum(fold, ())), fill=(140, 12, 20, 255))
d.line(S(*sum([R(x, y) for x, y in bez((20, -290), (-60, -232), (-150, -200), (-250, -175))], ())), fill=EDGE, width=5 * K)
# a highlight down the right side
d.line(S(*sum([R(x, y) for x, y in bez((150, -20), (165, -130), (120, -230), (40, -275))], ())), fill=(240, 90, 90, 255), width=12 * K)
# brim: a fat, furry band with a scalloped edge
rng = np.random.default_rng(3)
brim = []
for k in range(41):
    t = k / 40; x = -245 + 490 * t
    brim.append((x, -32 + 7 * math.sin(t * math.pi * 9)))
for k in range(41):
    t = 1 - k / 40; x = -245 + 490 * t
    brim.append((x, 52 + 7 * math.sin(t * math.pi * 11 + 1)))
d.polygon(S(*sum([R(x, y) for x, y in brim], ())), fill=(246, 245, 240, 255), outline=EDGE, width=8 * K)
for _ in range(220):
    x, y = rng.uniform(-232, 232), rng.uniform(-22, 44); px, py = R(x, y); r = rng.uniform(4, 9)
    d.ellipse(S(px - r, py - r, px + r, py + r), fill=(214, 214, 206, 255) if rng.random() < .6 else (255, 255, 255, 255))
# bobble
bx, by = R(*tip)
d.ellipse(S(bx - 60, by - 60, bx + 60, by + 60), fill=(246, 245, 240, 255), outline=EDGE, width=7 * K)
for _ in range(90):
    a_, r_ = rng.uniform(0, 2 * math.pi), rng.uniform(0, 48); px, py = bx + r_ * math.cos(a_), by + r_ * math.sin(a_); r = rng.uniform(4, 8)
    d.ellipse(S(px - r, py - r, px + r, py + r), fill=(214, 214, 206, 255) if rng.random() < .6 else (255, 255, 255, 255))
base.alpha_composite(shade(hat, strength=0.45).resize((W, H), Image.LANCZOS))

base = base.crop(base.getbbox()); base.save(f"{OUT}/christmas-wide.png", optimize=True); print("christmas-wide", base.size)
