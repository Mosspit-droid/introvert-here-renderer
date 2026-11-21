"""The Escape Room's room pictures (Barry's, made with ChatGPT, 21 Nov 2026): one landscape, one portrait.
Enlarges each 1.5x and prints DO NOT ENTER on the blank yellow door hanger.
Usage: python3 build.py <landscape.png> <portrait.png> <Montserrat ExtraBold .ttf> <output folder>
Writes room-wide.jpg and room-tall.jpg (stored in R2 as site/<name>.jpg; copies in shop/assets/site/)."""
import sys
from PIL import Image, ImageDraw, ImageFont
L, P, FONT, OUT = sys.argv[1:5]
K = 1.5
def make(src, name, cx, cy, w, h):
    im = Image.open(src).convert("RGB"); im = im.resize((round(im.width * K), round(im.height * K)), Image.LANCZOS)
    S = 4; cw, ch = round(w * K * S), round(h * K * S)                       # draw the words large, then shrink: sharp edges
    t = Image.new("RGBA", (cw, ch)); d = ImageDraw.Draw(t); size = 8
    while max(d.textlength(x, font=ImageFont.truetype(FONT, size + 1)) for x in ("DO", "NOT", "ENTER")) <= cw: size += 1
    f = ImageFont.truetype(FONT, size); cap = f.getbbox("H"); caph = cap[3] - cap[1]; gap = caph * 0.42
    y = (ch - 3 * caph - 2 * gap) / 2
    for x in ("DO", "NOT", "ENTER"): d.text((cw / 2, y + caph / 2), x, font=f, fill=(34, 26, 6, 225), anchor="mm"); y += caph + gap
    t = t.resize((round(w * K), round(h * K)), Image.LANCZOS)
    im.paste(t, (round(cx * K - t.width / 2), round(cy * K - t.height / 2)), t)
    im.save(f"{OUT}/{name}.jpg", quality=84, optimize=True, progressive=True); print(name, im.size)
make(L, "room-wide", 1552.5, 503, 28, 46)
make(P, "room-tall", 631, 610, 20, 28)
