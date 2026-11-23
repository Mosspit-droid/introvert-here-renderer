"""'Introvert Here… presents' (Barry, 23 Nov 2026): the unaltered wide logo with PRESENTS beneath, under the dots.
Usage: python3 build.py <Montserrat .ttf (SemiBold or Bold)> <output folder>  ->  presents-white.png, presents-black.png"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
HERE = __file__.rsplit("/", 1)[0]; FONT, OUT = sys.argv[1], sys.argv[2]
logo = Image.open(HERE + "/../main-collections/introvert-here-wide.png").convert("RGBA")
logo = logo.crop(logo.getbbox())                       # frame is 4266 wide
FW = logo.width; word = "PRESENTS"
size = int(FW * 0.052); f = ImageFont.truetype(FONT, size)
track = size * 0.55                                    # wide letter spacing
widths = [f.getlength(c) for c in word]; tw = sum(widths) + track * (len(word) - 1)
gap = int(size * 0.75); H = logo.height + gap + int(size * 1.25)
for name, col in (("white", (242, 240, 234, 255)), ("black", (20, 20, 20, 255))):
    L = logo if name == "white" else Image.fromarray(np.dstack([np.full(np.asarray(logo).shape[:2] + (3,), 20, np.uint8), np.asarray(logo)[..., 3]]), "RGBA")
    im = Image.new("RGBA", (FW, H)); im.alpha_composite(L, (0, 0)); d = ImageDraw.Draw(im)
    x = FW - tw - FW * 0.012; y = logo.height + gap      # right-aligned, ending under the dots
    for c, w in zip(word, widths):
        d.text((x, y), c, font=f, fill=col); x += w + track
    im.save(f"{OUT}/presents-{name}.png", optimize=True); print(name, im.size)
