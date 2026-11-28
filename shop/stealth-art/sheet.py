"""Character sheet for the stealth game's introvert: pixel-art options drawn in code, for Barry to pick from.
Run: python3 sheet.py  ->  writes introvert-sheet.png next to this file. Nothing here is used by the game yet."""
from PIL import Image, ImageDraw, ImageFont
import os

HOOD, BODY, ARM, VOID, RIM, STR, AGLET, LEGB, LEGF, SHOE, EYE, POCKET, SOLE = range(1, 14)
NAVY = {"o": "#0b1024", "s": "#18244f", "b": "#25387c", "h": "#3f5fc0"}
COL = {VOID: "#05060c", RIM: "#5d7fe0", STR: "#f4ecd2", AGLET: "#fad00c", LEGB: "#272935", LEGF: "#3a3d4c", SHOE: "#efe9d8", SOLE: "#b3ac98", EYE: "#f4ecd2", POCKET: "#18244f"}
HOODIE = (HOOD, BODY, ARM)

class Sprite:
    def __init__(s, w, h, k=1.0): s.w, s.h, s.k = int(w * k), int(h * k), k; s.g = [[0] * s.w for _ in range(s.h)]
    def put(s, x, y, m):
        if 0 <= x < s.w and 0 <= y < s.h: s.g[y][x] = m
    def ell(s, cx, cy, rx, ry, m, only=None):
        k = s.k; cx, cy, rx, ry = cx * k, cy * k, max(.6, rx * k), max(.6, ry * k)
        for y in range(s.h):
            for x in range(s.w):
                if ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1 and (only is None or s.g[y][x] in only): s.g[y][x] = m
    def rect(s, x0, y0, x1, y1, m, only=None):
        k = s.k
        for y in range(round(y0 * k), max(round(y0 * k) + 1, round(y1 * k))):
            for x in range(round(x0 * k), max(round(x0 * k) + 1, round(x1 * k))):
                if 0 <= x < s.w and 0 <= y < s.h and (only is None or s.g[y][x] in only): s.g[y][x] = m
    def poly(s, pts, m):
        k = s.k; im = Image.new("1", (s.w, s.h)); ImageDraw.Draw(im).polygon([(x * k, y * k) for x, y in pts], fill=1); px = im.load()
        for y in range(s.h):
            for x in range(s.w):
                if px[x, y]: s.g[y][x] = m
    def render(s, shaded=True, outline=True, silhouette=False):
        g, w, h = s.g, s.w, s.h; im = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0)); px = im.load()
        at = lambda x, y: g[y][x] if 0 <= x < w and 0 <= y < h else 0
        for y in range(h):
            for x in range(w):
                m = g[y][x]
                if not m: continue
                if silhouette: px[x + 1, y + 1] = (16, 14, 20, 255); continue
                if m in HOODIE:
                    c = NAVY["b"]
                    if shaded:
                        if at(x - 1, y - 1) == 0 or at(x, y - 2) == 0 or at(x - 2, y) == 0: c = NAVY["h"]
                        if at(x + 1, y + 1) != m and at(x + 1, y + 1) not in (VOID, RIM, STR, AGLET, POCKET) or at(x, y + 2) not in HOODIE + (VOID, RIM, STR, AGLET, POCKET) or at(x + 2, y) == 0: c = NAVY["s"]
                    else:
                        if at(x + 1, y) == 0 or at(x, y + 1) not in HOODIE + (VOID, STR, AGLET, POCKET): c = NAVY["s"]
                else: c = COL[m]
                px[x + 1, y + 1] = tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
        if outline and not silhouette:
            o = tuple(int(NAVY["o"][i:i + 2], 16) for i in (1, 3, 5)) + (255,)
            for y in range(-1, h + 1):
                for x in range(-1, w + 1):
                    if at(x, y) == 0 and any(at(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): px[x + 1, y + 1] = o
        return im

def legs_side(s, x, top, bottom, gap=5):
    s.rect(x, top, x + 4, bottom, LEGB); s.rect(x - 1, bottom - 1, x + 6, bottom + 2, SHOE); s.rect(x - 1, bottom + 1, x + 6, bottom + 2, SOLE)
    s.rect(x + gap, top, x + gap + 5, bottom, LEGF); s.rect(x + gap, bottom - 1, x + gap + 8, bottom + 2, SHOE); s.rect(x + gap, bottom + 1, x + gap + 8, bottom + 2, SOLE)
def legs_front(s, cx, top, bottom, spread=3):
    for d in (-1, 1):
        x = cx + d * spread - (4 if d < 0 else 0); s.rect(x, top, x + 4, bottom, LEGF); s.rect(x - (1 if d < 0 else 0), bottom - 1, x + 4 + (1 if d > 0 else 0), bottom + 2, SHOE); s.rect(x - (1 if d < 0 else 0), bottom + 1, x + 4 + (1 if d > 0 else 0), bottom + 2, SOLE)
def string(s, x, y0, y1): s.rect(x, y0, x + 1, y1, STR); s.rect(x, y1, x + 1, y1 + 2, AGLET)

# A / B: "The Bean" - a huge round hood on a small body
def bean_side(k=1):
    s = Sprite(40, 52, k); legs_side(s, 13, 40, 48)
    s.ell(18, 34, 9, 9, BODY); s.ell(19.5, 15, 13, 13, HOOD); s.ell(20, 33, 4, 6.5, ARM); s.rect(18, 37, 26, 41, POCKET, only=(BODY,))
    s.ell(28, 16, 5, 8, RIM); s.ell(28.6, 16, 3.8, 6.8, VOID); string(s, 29, 24, 32); string(s, 26, 25, 30); return s
def bean_front(k=1):
    s = Sprite(40, 52, k); legs_front(s, 20, 40, 48)
    s.ell(20, 34, 10, 9, BODY); s.ell(20, 15, 13, 13, HOOD); s.rect(14, 35, 26, 40, POCKET, only=(BODY,))
    s.ell(20, 17, 7.5, 8.5, RIM); s.ell(20, 17, 6.3, 7.3, VOID); s.rect(16, 16, 18, 18, EYE); s.rect(22, 16, 24, 18, EYE); string(s, 17, 26, 33); string(s, 22, 26, 31); return s
# C: "The Point" - the hood ends in a long drooping tip
def point_side(k=1):
    s = Sprite(40, 52, k); legs_side(s, 15, 39, 48, gap=4)
    s.ell(20, 34, 7.5, 9.5, BODY); s.poly([(14, 6), (2, 19), (4, 23), (16, 22)], HOOD); s.ell(22, 15, 10.5, 11, HOOD); s.ell(21, 33, 3.5, 6.5, ARM); s.rect(20, 37, 26, 41, POCKET, only=(BODY,))
    s.ell(29, 16, 4.5, 7.5, RIM); s.ell(29.6, 16, 3.3, 6.3, VOID); string(s, 30, 23, 33); string(s, 27, 24, 30); return s
def point_front(k=1):
    s = Sprite(40, 52, k); legs_front(s, 20, 39, 48)
    s.ell(20, 34, 8.5, 9.5, BODY); s.poly([(26, 4), (38, 12), (36, 17), (28, 12)], HOOD); s.ell(20, 15, 11, 11.5, HOOD); s.rect(15, 35, 25, 40, POCKET, only=(BODY,))
    s.ell(20, 17, 7, 8, RIM); s.ell(20, 17, 5.8, 6.8, VOID); s.rect(16, 16, 18, 18, EYE); s.rect(22, 16, 24, 18, EYE); string(s, 17, 25, 34); string(s, 22, 25, 31); return s
# D: "The Slouch" - hood pulled forward like a visor, hoodie three sizes too big
def slouch_side(k=1):
    s = Sprite(40, 52, k); legs_side(s, 15, 43, 48, gap=4)
    s.poly([(13, 24), (27, 24), (30, 45), (10, 45)], BODY); s.ell(20, 14, 11, 10.5, HOOD); s.poly([(22, 4), (36, 9), (37, 14), (30, 13)], HOOD)
    s.poly([(18, 26), (24, 26), (25, 43), (20, 43)], ARM); s.rect(21, 36, 29, 41, POCKET, only=(BODY,))
    s.ell(28.5, 17, 4.5, 6.5, RIM); s.ell(29.4, 17.5, 3.4, 5.5, VOID); string(s, 30, 23, 38); string(s, 27, 24, 34); return s
def slouch_front(k=1):
    s = Sprite(40, 52, k); legs_front(s, 20, 43, 48)
    s.poly([(11, 24), (29, 24), (32, 45), (8, 45)], BODY); s.ell(20, 14, 12, 11, HOOD); s.rect(14, 36, 26, 41, POCKET, only=(BODY,))
    s.ell(20, 17, 7, 6.5, RIM); s.ell(20, 17.6, 5.8, 5.3, VOID); s.rect(16, 17, 18, 19, EYE); s.rect(22, 17, 24, 19, EYE); string(s, 17, 24, 38); string(s, 22, 24, 34); return s

def font(sz, bold=True):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",):
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

ROWS = [("A", "The Bean, 8-bit", "Master System era: few colours, no outline", bean_side(.5), bean_front(.5), dict(shaded=False, outline=False), 16),
        ("B", "The Bean, 16-bit", "Mega Drive era: outline, light and shade", bean_side(), bean_front(), {}, 8),
        ("C", "The Point, 16-bit", "Hood ends in a long drooping tip", point_side(), point_front(), {}, 8),
        ("D", "The Slouch, 16-bit", "Peaked hood, hoodie three sizes too big", slouch_side(), slouch_front(), {}, 8)]
CW, RH, PAD = 380, 500, 30
sheet = Image.new("RGB", (PAD * 2 + CW * 3, 110 + RH * len(ROWS)), "#17151a"); d = ImageDraw.Draw(sheet)
d.text((PAD, 22), "THE INTROVERT: which one?", font=font(34), fill="#fad00c")
for i, t in enumerate(("Side on", "Peeking, front on", "Silhouette")): d.text((PAD + CW * i + 14, 74), t.upper(), font=font(17), fill="#b9ae9c")
for r, (letter, name, note, side, front, opts, z) in enumerate(ROWS):
    y = 110 + RH * r
    for c, (spr, o) in enumerate(((side, opts), (front, opts), (side, dict(silhouette=True)))):
        x = PAD + CW * c; d.rectangle((x + 6, y + 6, x + CW - 6, y + RH - 70), fill="#d9cfb8" if c < 2 else "#efe9d9"); d.rectangle((x + 6, y + RH - 150, x + CW - 6, y + RH - 70), fill="#8b9a94" if c < 2 else "#d6cfbc")
        im = spr.render(**o); im = im.resize((im.width * z, im.height * z), Image.NEAREST); sheet.paste(im, (x + (CW - im.width) // 2, y + RH - 100 - im.height + 2 * z), im)
    d.text((PAD + 8, y + RH - 60), letter + "  " + name, font=font(24), fill="#f6efe0"); d.text((PAD + 8, y + RH - 28), note, font=font(17, False), fill="#b9ae9c")
sheet.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "introvert-sheet.png")); print(sheet.size)
