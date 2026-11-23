"""Cuts Barry's green-screen drawings (src/) into the pictures the stealth game uses.
Run: python3 cut.py  ->  out/*.webp (the pictures), art.js (the same pictures plus their measurements, for the worker),
cut-check.png (everything on one sheet, to eyeball). PPH = picture pixels per "height" (1 height = the introvert standing)."""
from PIL import Image
import numpy as np, base64, os, json
HERE = os.path.dirname(os.path.abspath(__file__)); SRC = os.path.join(HERE, "src"); OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
PPH = 236

def key(path):
    a = np.asarray(Image.open(os.path.join(SRC, path)).convert("RGB")).astype(np.float32); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = g - np.maximum(r, b); bright = np.clip((g - 90) / 90, 0, 1)           # only bright green counts as screen (the fire exit sign is dark green)
    gone = np.clip((d - 35) / 60, 0, 1) * bright
    g2 = g - np.clip(d, 0, None) * bright                                     # take the green cast off the edges
    return np.dstack([r, g2, b, (1 - gone) * 255]).astype(np.uint8)
def key2(path):
    """For sheets with green clothes in them: only the pure screen green goes (hardly any red or blue in it)."""
    a = np.asarray(Image.open(os.path.join(SRC, path)).convert("RGB")).astype(np.float32); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    screen = (r < 40) & (b < 40); gone = np.where(screen, np.clip((g - 110) / 110, 0, 1), 0); g2 = np.where(screen, np.minimum(g, 25), g)
    return np.dstack([r, g2, b, (1 - gone) * 255]).astype(np.uint8)
def runs(mask, gap):
    out, start, last = [], None, None
    for i, v in enumerate(mask):
        if v:
            if start is None: start = i
            last = i
        elif start is not None and i - last > gap: out.append((start, last + 1)); start = None
    if start is not None: out.append((start, last + 1))
    return [r for r in out if r[1] - r[0] > 25]
def figures(img, rows=1, gap=14):
    solid = img[..., 3] > 128; figs = []
    bands = runs(solid.any(axis=1), 12) if rows > 1 else [(0, img.shape[0])]
    for y0, y1 in bands:
        for x0, x1 in runs(solid[y0:y1].any(axis=0), gap):
            ys = np.where(solid[y0:y1, x0:x1].any(axis=1))[0]; figs.append(img[y0 + ys[0]:y0 + ys[-1] + 1, x0:x1])
    return figs
def scaled(fig, s): im = Image.fromarray(fig, "RGBA"); return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
def cell(fig, s, cw, ch, ax, base, top=.45):
    im = scaled(fig, s); a = np.asarray(im)[..., 3] > 128; xs = np.where(a[: max(1, int(a.shape[0] * top))].any(axis=0))[0]; cx = (xs[0] + xs[-1]) / 2
    c = Image.new("RGBA", (cw, ch), (0, 0, 0, 0)); c.alpha_composite(im, (round(ax - cx), base - im.height)); return c
def strip(cells):
    s = Image.new("RGBA", (sum(c.width for c in cells), max(c.height for c in cells)), (0, 0, 0, 0)); x = 0
    for c in cells: s.alpha_composite(c, (x, s.height - c.height)); x += c.width
    return s
ART = {}
def save(name, im, **meta):
    p = os.path.join(OUT, name + ".webp"); im.save(p, quality=86, method=6); ART[name] = dict(meta, W=im.width, H=im.height, kb=os.path.getsize(p) // 1024)

# The introvert: walk 0-5, stand 6, crouch 7, air 8, land 9, slump 10, step 11, crouch-walk 12-17
walk = figures(key("introvert-walk.png"), 2); acts = figures(key("introvert-actions.png"))
ws, as_ = PPH / walk[2].shape[0], PPH / acts[0].shape[0]
C = dict(cw=250, ch=300, ax=118, base=292)
iv = [cell(walk[i], ws, **C) for i in (0, 1, 2, 3, 5, 6)] + [cell(acts[i], as_ * k, **C) for i, k in ((0, 1), (1, 1), (2, 1), (3, 1), (4, .93), (5, .96))]
cr = figures(key("introvert-crawl.png"), 2); crs = acts[1].shape[0] * as_ / max(f.shape[0] for f in cr)      # crouch-walk 12-17, as tall as the crouch pose
iv += [cell(f, crs, **C) for f in cr]
nd = figures(key("introvert-nod.png")); assert len(nd) == 6, len(nd); nds = PPH / nd[0].shape[0]                                  # nodding: up 18, half 19, down 20, backing away 21-22, hurrying off 23 (faces left)
iv += [cell(f, nds, **C) for f in nd]
save("introvert", strip(iv), w=250, h=300, ax=118, base=292, n=len(iv))

# The flat "sticker" art for the platformer (Barry, 21 Nov). PPT = picture pixels per square of the level.
# Hero: stand 0, stride 1, sitting with hood up 2, wave 3, run 4-7, jump 8, fall 9, land 10, knocked back 11.
PPT = 118
hf = figures(key("hero-flat.png"), 3); assert len(hf) == 9, len(hf); hs = 200 / hf[6].shape[0]; HC = dict(cw=220, ch=230, ax=110, base=226, top=.4)
hm = figures(key("hero-moves.png"), 2); assert len(hm) == 8, len(hm); ms = 196 / hm[1].shape[0]
save("hero", strip([cell(hf[i], hs, **HC) for i in (6, 0, 2, 4)] + [cell(f, ms, **HC) for f in hm]), w=220, h=230, ax=110, base=226, n=12, pph=200)
save("hero-head", scaled(hf[3], 96 / hf[3].shape[0]))
# Left standing too long: foot tap 0-1, phone 2, drawstring 3, sitting 4, asleep 5. Always a hand in a pocket (Barry, 22 Nov).
hi = figures(key("hero-idle.png")); assert len(hi) == 6, len(hi); isc = 200 / hi[1].shape[0]
save("hero-idle", strip([cell(f, isc, **HC) for f in hi]), w=220, h=230, ax=110, base=226, n=6)
# Hanging from the balloons or the umbrella by one fist (the other hand in a pocket): still 0, legs forward 1, legs back 2, tucked 3, letting go 4
def cellt(fig, s, cw, ch, ax, top):
    im = scaled(fig, s); a_ = np.asarray(im)[..., 3] > 128; xs = np.where(a_[: max(1, int(a_.shape[0] * .08))].any(axis=0))[0]; cxf = (xs[0] + xs[-1]) / 2
    c = Image.new("RGBA", (cw, ch), (0, 0, 0, 0)); c.alpha_composite(im, (round(ax - cxf), top)); return c
hh = figures(key("hero-hang.png")); assert len(hh) == 5, len(hh)
save("hero-hang", strip([cellt(f, isc, 320, 280, 160, 6) for f in hh]), w=320, h=280, ax=160, top=6, n=5)
# Hood Up: drawstrings pulled tight, a four-step shuffle (Barry, 23 Nov)
hd = figures(key("hero-hood.png")); assert len(hd) == 4, len(hd)
hsc = 186 / hd[1].shape[0]   # sized to match him standing (hunched, so a touch shorter), not by the sheet
save("hero-hood", strip([cell(f, hsc, **HC) for f in hd]), w=220, h=230, ax=110, base=226, n=4)
# Extra poses: on a call 0, sliding 1, cringing 2, soaked 3, carrying 4, the small win 5
hx = figures(key("hero-extra.png")); assert len(hx) == 6, len(hx)
esc = 200 / hx[0].shape[0]
save("hero-extra", strip([cell(f, esc, cw=300, ch=230, ax=120, base=226, top=.4) for f in hx]), w=300, h=230, ax=120, base=226, n=6)
# More poses: teetering forward 0 and back 1, walking while carrying 2-3, skidding 4, looking up 5. Cut by boxes (the skid's dust puff is loose);
# each is placed by where his feet (or hips, when walking) are, as a fraction of the pose's width.
km = key("hero-more.png"); mq = km.shape[1] / 2000
def cellx(fig, s, cw, ch, ax, base, fr): im = scaled(fig, s); c = Image.new("RGBA", (cw, ch), (0, 0, 0, 0)); c.alpha_composite(im, (round(ax - im.width * fr), base - im.height)); return c
def trim_(f): m = f[..., 3] > 128; ys = np.where(m.any(axis=1))[0]; xs_ = np.where(m.any(axis=0))[0]; return f[ys[0]:ys[-1] + 1, xs_[0]:xs_[-1] + 1]
mf = [(trim_(km[round(140 * mq):round(580 * mq), round(x0 * mq):round(x1 * mq)]), fr) for x0, x1, fr in [(20, 345, .23), (375, 670, .6), (700, 1000, .42), (1030, 1325, .44), (1360, 1716, .45), (1718, 1930, .66)]]
msc = 203 / mf[5][0].shape[0]
save("hero-more", strip([cellx(f, msc, 340, 230, 170, 226, fr) for f, fr in mf]), w=340, h=230, ax=170, base=226, n=6)
# The title page (Barry's own picture, 23 Nov)
save("title", Image.open(os.path.join(SRC, "title.png")).convert("RGB"))
# The "Introvert Here... presents" logo for the top of the title page (the site's own file, shrunk)
_pl = Image.open(os.path.join(SRC, "..", "..", "assets", "site", "presents-black.png")).convert("RGBA"); save("presents", _pl.resize((1200, round(1200 * _pl.height / _pl.width)), Image.LANCZOS))
# People who stand: teal mug woman 0-1, orange shouting man 2-3, cake woman 4-5, clipboard man 6-7 (idle, then talking)
fp = figures(key("flat-people.png"), 2); assert len(fp) == 8, len(fp); s = 2.1 * PPT / fp[0].shape[0]
save("flat-people", strip([cell(f, s, cw=250, ch=262, ax=105, base=258, top=.4) for f in fp]), w=250, h=262, ax=105, base=258, n=8)
# People who move: pink walker 0-3, red hugger running 4-6 and out of breath 7
fm = figures(key("flat-movers.png"), 2); assert len(fm) == 8, len(fm); s1 = 2.05 * PPT / max(f.shape[0] for f in fm[:4]); s2 = 2.0 * PPT / fm[5].shape[0]
save("flat-movers", strip([cell(f, s1, cw=340, ch=262, ax=165, base=258, top=.4) for f in fm[:4]] + [cell(f, s2, cw=340, ch=262, ax=165, base=258, top=.4) for f in fm[4:]]), w=340, h=262, ax=165, base=258, n=8)
# Things, each at its own size (in squares high)
ft = figures(key("flat-things.png"), 2); assert len(ft) == 9, len(ft); fu = figures(key("flat-ups.png")); assert len(fu) == 2, len(fu); ft += fu
names = ["tea", "note", "phones", "bubble", "chair", "cabinet", "quiet", "exit", "shelf", "coffee", "phone"]; tall_ = [.72, .78, .78, .8, 1.3, 1.0, 2.3, 2.1, .5, .95, .95]
cells = [scaled(f, tall_[i] * PPT / f.shape[0]) for i, f in enumerate(ft)]; xs = np.cumsum([0] + [c.width for c in cells]).tolist()
save("flat-things", strip(cells), items={n: dict(x=xs[i], w=cells[i].width, h=cells[i].height) for i, n in enumerate(names)}, ppt=PPT)

# Background furniture (drawn faded behind the action), each at its own height in squares:
# 0 desk 1 partition 2 bookshelf 3 photocopier 4 whiteboard | 5 canteen table 6 vending machine 7 kitchen counter 8 fridge | 9 lockers 10 water cooler 11 plant 12 sofa 13 reception desk
fd = figures(key("flat-decor.png"), 3); assert len(fd) == 14, len(fd); dh = [2.2, 2.3, 2.9, 2.4, 2.6, 1.7, 2.8, 2.1, 2.8, 2.6, 2.0, 2.2, 1.6, 1.6]
cells = [scaled(f, dh[i] * PPT * .75 / f.shape[0]) for i, f in enumerate(fd)]; xs = np.cumsum([0] + [c.width for c in cells]).tolist()
save("flat-decor", strip(cells), items=[dict(x=xs[i], w=cells[i].width, h=cells[i].height) for i in range(len(cells))], ppt=PPT * .75)

# Level 2, the high street. People are lined up on their feet (props like leads and musical notes stick out sideways).
def cellf(fig, s, cw, ch, ax, base):
    im = scaled(fig, s); a = np.asarray(im)[..., 3] > 128; xs = np.where(a[int(a.shape[0] * .9):].any(axis=0))[0]; cxf = (xs[0] + xs[-1]) / 2
    c = Image.new("RGBA", (cw, ch), (0, 0, 0, 0)); c.alpha_composite(im, (round(ax - cxf), base - im.height)); return c
# Standers: neighbour 0-1, busker 2-3, hen in a sash 4-5, hen in a boa 6-7 (idle, then talking)
sp = figures(key2("street-people.png"), 2); assert len(sp) == 8, len(sp)
for f in sp[:2]:      # the neighbour: trim the lead that trails off to the right, leaving the loop in his hands (the dog brings its own lead)
    h = f.shape[0]; xs = np.where((f[int(h * .9):, :, 3] > 128).any(axis=0))[0]; cut = xs[-1] + int(h * .13); f[int(h * .35):, cut:, 3] = 0
s = 2.1 * PPT / sp[0].shape[0]
save("street-people", strip([cellf(f, s, 380, 262, 150, 258) for f in sp]), w=380, h=262, ax=150, base=258, n=8)
# Movers: charity collector walking 0-3, old school friend running 4-6 and out of breath 7. The cyclist has his own strip.
sm = figures(key("street-movers.png"), 3); assert len(sm) == 10, len(sm); s1 = 2.05 * PPT / max(f.shape[0] for f in sm[:4]); s2 = 2.05 * PPT / sm[5].shape[0]
save("street-movers", strip([cell(f, s1, cw=340, ch=262, ax=165, base=258, top=.4) for f in sm[:4]] + [cell(f, s2, cw=340, ch=262, ax=165, base=258, top=.4) for f in sm[4:8]]), w=340, h=262, ax=165, base=258, n=8)
s3 = 2.05 * PPT / sm[8].shape[0]; save("street-bike", strip([cellf(f, s3, 300, 250, 150, 246) for f in sm[8:]]), w=300, h=250, ax=150, base=246, n=2)
st = figures(key("street-things.png"), 2); assert len(st) == 7, len(st); names = ["dog", "brolly", "crate", "awning", "box", "bus", "gate"]; tall_ = [1.05, 1.5, 1.0, 1.35, 2.35, 1.85, 3.3]
cells = [scaled(f, tall_[i] * PPT / f.shape[0]) for i, f in enumerate(st)]; xs = np.cumsum([0] + [c.width for c in cells]).tolist()
save("street-things", strip(cells), items={n: dict(x=xs[i], w=cells[i].width, h=cells[i].height) for i, n in enumerate(names)}, ppt=PPT)
sh = figures(key("street-shops.png"), 2, gap=8); assert len(sh) == 10, len(sh); cells = [scaled(f, 5.0 * PPT * .6 / f.shape[0]) for f in sh]; xs = np.cumsum([0] + [c.width for c in cells]).tolist()
save("street-shops", strip(cells), items=[dict(x=xs[i], w=cells[i].width, h=cells[i].height) for i in range(10)], ppt=PPT * .6)

# Level 3, the house party.
# The host: running 0-2, out of breath 3, then lost in the dark 4-7 (feeling about, tiptoe, peering, stubbed toe)
ph = figures(key2("party-host.png"), 2, gap=40); assert len(ph) == 8, len(ph); s = 2.5 * PPT / ph[1].shape[0]
save("party-host", strip([cell(f, s, cw=400, ch=310, ax=190, base=306, top=.5) for f in ph]), w=400, h=310, ax=190, base=306, n=8)
pd = figures(key2("party-dancer.png")); assert len(pd) == 4, len(pd); s = 2.75 * PPT / pd[1].shape[0]
save("party-dancer", strip([cellf(f, s, 340, 340, 170, 336) for f in pd]), w=340, h=340, ax=170, base=336, n=4)
# Guests who stand: arguing man 0-1, arguing woman 2-3, the oversharer 4-5, the man with the buffet plate 6-7
pp_ = figures(key2("party-people.png"), 2); assert len(pp_) == 8, len(pp_); s = 2.1 * PPT / pp_[0].shape[0]
save("party-people", strip([cellf(f, s, 380, 262, 150, 258) for f in pp_]), w=380, h=262, ax=150, base=258, n=8)
pt = figures(key2("party-things.png"), 2); assert len(pt) == 9, len(pt); names = ["plate", "punch", "switch", "sofa", "bed", "trampoline", "cupboard", "engaged", "gate"]; tall_ = [.75, .85, .6, 1.5, 1.6, 1.0, 2.7, 2.35, 2.4]
cells = [scaled(f, tall_[i] * PPT / f.shape[0]) for i, f in enumerate(pt)]; xs = np.cumsum([0] + [c.width for c in cells]).tolist()
save("party-things", strip(cells), items={n: dict(x=xs[i], w=cells[i].width, h=cells[i].height) for i, n in enumerate(names)}, ppt=PPT)
# Background: 0 coat rack 1 hall table 2 bunting 3 speaker 4 punch table | 5 counter 6 fridge 7 bin 8 buffet | 9 boxes 10 rocking horse 11 dummy 12 barbecue 13 fairy lights 14 bench
dk = key2("party-decor.png")      # things like the speaker's music notes float free of their object, so this sheet is cut by hand-measured boxes
def trimmed(f): m = f[..., 3] > 128; ys = np.where(m.any(axis=1))[0]; xs_ = np.where(m.any(axis=0))[0]; return f[ys[0]:ys[-1] + 1, xs_[0]:xs_[-1] + 1]
BOX = [(50, 320, 0, 305), (365, 650, 0, 305), (680, 1105, 0, 305), (1150, 1410, 0, 305), (1420, 1774, 0, 305), (30, 515, 310, 610), (555, 805, 310, 610), (865, 1085, 310, 610), (1110, 1774, 310, 610),
       (20, 240, 615, 887), (255, 535, 615, 887), (580, 735, 615, 887), (770, 1000, 615, 887), (1035, 1345, 615, 887), (1360, 1774, 615, 887)]
pdc = [trimmed(dk[y0:y1, x0:x1]) for x0, x1, y0, y1 in BOX]; dh = [2.6, 2.0, 1.6, 2.4, 2.0, 2.2, 2.8, 1.9, 2.1, 2.0, 1.9, 2.4, 2.2, .8, 1.7]
cells = [scaled(f, dh[i] * PPT * .75 / f.shape[0]) for i, f in enumerate(pdc)]; xs = np.cumsum([0] + [c.width for c in cells]).tolist()
save("party-decor", strip(cells), items=[dict(x=xs[i], w=cells[i].width, h=cells[i].height) for i in range(len(cells))], ppt=PPT * .75)

# The crying corner, as a pair: both sobbing 0, ranting and sniffling 1, hugging it out 2; and the box of tissues 3. Cut by measured boxes (tears float free).
ck_ = key2("party-criers.png"); cwid = ck_.shape[1] / 2000; pcs = [trimmed(ck_[:, round(x0 * cwid):round(x1 * cwid)]) for x0, x1 in ((0, 600), (610, 1210), (1260, 1720), (1740, 2000))]; s = 2.3 * PPT / pcs[0].shape[0]
ims = [scaled(f, s) for f in pcs[:3]] + [scaled(pcs[3], .62 * PPT / pcs[3].shape[0])]; cw_ = max(i.width for i in ims) + 4; ch_ = max(i.height for i in ims) + 4; cells = []
for im in ims: c = Image.new("RGBA", (cw_, ch_), (0, 0, 0, 0)); c.alpha_composite(im, ((cw_ - im.width) // 2, ch_ - 2 - im.height)); cells.append(c)
save("party-criers", strip(cells), w=cw_, h=ch_, ax=cw_ // 2, base=ch_ - 2, n=4)

# Level 4, the park. These sheets are cut by boxes measured on a 1774 x 887 picture (and scaled to the real size).
def boxes(path, bs):
    k_ = key2(path); fx, fy = k_.shape[1] / 1774, k_.shape[0] / 887
    return k_, [trimmed(k_[round(y0 * fy):round(y1 * fy), round(x0 * fx):round(x1 * fx)]) for x0, x1, y0, y1 in bs], fx, fy
def sheet_(name, figs, px, names):
    cells = [scaled(f, px[i] / f.shape[0]) for i, f in enumerate(figs)]; xs = np.cumsum([0] + [c.width for c in cells]).tolist()
    save(name, strip(cells), items={n: dict(x=xs[i], w=cells[i].width, h=cells[i].height) for i, n in enumerate(names)})
kp, pf, fx, fy = boxes("park-play.png", [(20, 580, 20, 390), (1215, 1774, 90, 390), (20, 560, 520, 840), (580, 1180, 505, 860), (1240, 1730, 410, 870)])
sw = kp[round(20 * fy):round(390 * fy), round(620 * fx):round(1170 * fx)].copy(); sx0, sx1, sy0 = round(170 * fx), round(380 * fx), round(78 * fy)      # the swing: frame and seat separately, so the seat can swing
seat = trimmed(sw[sy0:, sx0:sx1].copy()); sw[sy0:, sx0:sx1, 3] = 0
sheet_("park-play", pf + [trimmed(sw), seat], [520, 260, 240, 380, 420, 460, 330], ["slide", "roundabout", "seesaw", "castle", "treehouse", "swingframe", "swingseat"])
_, pt_, _, _ = boxes("park-things.png", [(95, 380, 20, 405), (460, 820, 120, 335), (925, 1295, 20, 385), (1380, 1685, 15, 405), (70, 795, 395, 875), (860, 1700, 440, 870)])
sheet_("park-things", pt_, [230, 110, 150, 290, 420, 330], ["balloons", "baby", "flask", "loo", "bandstand", "gate"])
# Background: 0 picnic rug 1 bench 2 ice-cream van 3 bin 4 duck 5 tree 6 tulips 7 lamp post 8 pram 9 kite
_, pdk, _, _ = boxes("park-decor.png", [(15, 395, 100, 405), (400, 735, 130, 405), (745, 1130, 25, 405), (1170, 1380, 45, 405), (1410, 1760, 135, 385), (20, 360, 465, 865), (375, 745, 620, 830), (785, 965, 455, 865), (1030, 1395, 485, 865), (1450, 1700, 460, 860)])
dh = [1.6, 1.7, 2.9, 2.3, 1.2, 4.4, 1.4, 3.8, 2.3, 3.0]; cells = [scaled(f, dh[i] * PPT * .75 / f.shape[0]) for i, f in enumerate(pdk)]; xs = np.cumsum([0] + [c.width for c in cells]).tolist()
save("park-decor", strip(cells), items=[dict(x=xs[i], w=cells[i].width, h=cells[i].height) for i in range(len(cells))], ppt=PPT * .75)
# Relatives: Gran 0-1, the uncle with the joke 2-3, the aunt 4-5, the cousin 6-7 (idle, then talking)
_, ppl, _, _ = boxes("park-people.png", [(80, 425, 0, 440), (520, 835, 0, 440), (950, 1185, 0, 440), (1370, 1665, 0, 440), (85, 345, 450, 887), (495, 805, 450, 887), (935, 1170, 450, 887), (1345, 1645, 450, 887)])
s = 2.05 * PPT / ppl[4].shape[0]; save("park-people", strip([cellf(f, s, 380, 290, 160, 286) for f in ppl]), w=380, h=290, ax=160, base=286, n=8)
# The girl: crying 0, pointing 1, jumping with her balloons 2, happy with them 3. Her parents: worried 0, delighted 1.
_, pk_, _, _ = boxes("park-kid.png", [(150, 390, 0, 400), (540, 790, 0, 400), (930, 1215, 0, 400), (1330, 1610, 0, 400), (240, 720, 420, 887), (1010, 1480, 420, 887)])
s = 1.25 * PPT / pk_[0].shape[0]; save("park-kid", strip([cellf(f, s, 260, 300, 130, 296) for f in pk_[:4]]), w=260, h=300, ax=130, base=296, n=4)
s = 2.25 * PPT / pk_[4].shape[0]; save("park-parents", strip([cellf(f, s, 360, 290, 180, 286) for f in pk_[4:]]), w=360, h=290, ax=180, base=286, n=2)

# The arch nemesis, the colleague who points and laughs: smug 0, laughing 1-2, peeking (head and arm only) 3, caught 4, defeated 5
kn = key("nemesis.png"); nq = kn.shape[1] / 2000; nf = [trimmed(kn[round(90 * nq):round(610 * nq), round(x0 * nq):round(x1 * nq)]) for x0, x1 in [(40, 270), (340, 652), (655, 1005), (1040, 1320), (1350, 1650), (1700, 1970)]]
# Gary in pieces, for the title page (jointed, so he can laugh properly): boxes measured on a 1536 x 1024 sheet, kept UNtrimmed so the joints stay where they were measured
kg = key("gary-parts.png"); gq = kg.shape[1] / 1536; gb = dict(head=(270, 50, 670, 490), head2=(860, 50, 1265, 490), torso=(70, 580, 440, 950), point=(545, 600, 1035, 835), fist=(1110, 600, 1420, 935))
gcells = [Image.fromarray(kg[round(y0 * gq):round(y1 * gq), round(x0 * gq):round(x1 * gq)], "RGBA") for x0, y0, x1, y1 in gb.values()]; gxs = np.cumsum([0] + [c.width for c in gcells]).tolist()
save("gary-parts", strip(gcells), items={n: dict(x=gxs[i], w=gcells[i].width, h=gcells[i].height) for i, n in enumerate(gb)}, q=gq)
save("nemesis-big", strip([cellf(f, 1, 460, 590, 170, 586) for f in nf[1:3]]), w=460, h=590, n=2)   # the title page: his two laughing poses at full size (his legs sit below the screen)
save("nemesis-peek", Image.fromarray(nf[3], "RGBA"))           # the title page: just his head, shoulders and pointing arm, leaning in from the corner
s = 2.1 * PPT / nf[0].shape[0]; save("nemesis", strip([cellf(f, s, 440, 270, 170, 266) for f in nf]), w=440, h=270, ax=170, base=266, n=6)

# More park people (Barry, 23 Nov). Cast: uncle filming 0, camera lowered 1, the aunt standing 2, walking 3-4, the cannonball boy 5.
pc = figures(key2("park-cast.png")); assert len(pc) == 6, len(pc); s = 2.1 * PPT / pc[1].shape[0]
save("park-cast", strip([cellf(f, s, 420, 290, 170, 286) for f in pc]), w=420, h=290, ax=170, base=286, n=6)
# The megaphone cousin: pointing down 0, level 1, up 2, straight up 3, shouting 4
pm = figures(key2("park-mega.png")); assert len(pm) == 5, len(pm); s = 2.0 * PPT / pm[1].shape[0]
save("park-mega", strip([cellf(f, s, 460, 310, 170, 306) for f in pm]), w=460, h=310, ax=170, base=306, n=5)

# The Pacer: walk 0-5, then clipboard 6, spotted 7, talking 8, laughing 9, then the cupcake: noticing 10, picking up 11, delighted 12, eating 13
pw = figures(key("pacer-walk2.png"), 2); pp = figures(key("pacer-poses.png")); ck = figures(key("pacer-cake.png"), gap=30)
# In the first pose the cupcake sits by her feet (under the overhang of her hair): lift it out of the bottom of the picture.
f0 = ck[0].copy(); y0 = int(f0.shape[0] * .82); parts = runs((f0[y0:, :, 3] > 128).any(axis=0), 2); assert len(parts) == 2, parts
cup = f0[y0:, parts[1][0]:parts[1][1]].copy(); ys = np.where((cup[..., 3] > 128).any(axis=1))[0]; cup = cup[ys[0]:]
f0[y0:, parts[1][0]:] = 0; xs = np.where((f0[..., 3] > 128).any(axis=0))[0]; ck[0] = f0[:, xs[0]:xs[-1] + 1]
C = dict(cw=330, ch=330, ax=140, base=324, top=.25)
pws, pps, cks = 1.24 * PPH / max(f.shape[0] for f in pw), 1.3 * PPH / pp[1].shape[0], 1.3 * PPH / ck[0].shape[0]
pc = [cell(pw[i], pws, **C) for i in (0, 1, 2, 3, 5, 6)] + [cell(f, pps, **C) for f in pp] + [cell(f, cks, **C) for f in ck]
save("pacer", strip(pc), w=330, h=330, ax=140, base=324, n=len(pc))
save("cupcake", scaled(cup, cks * 1.5))

# The Boss at his desk, three sheets of four, all lined up on the desk's left leg and the floor (the fishing rod sticks out to the left):
# asleep 0, stirring 1, greeting 2, holding forth 3 | bleary 4, looking left 5, looking right 6, drooping 7 | spots cupcake 8, casts 9, reels 10, scoffs 11
bs = [f for n in ("boss.png", "boss-wake.png", "boss-cake.png") for f in figures(key(n), 2, gap=30)]; assert len(bs) == 12, len(bs)
def legs(f): xs = np.where((f[-60:-25, :, 3] > 128).any(axis=0))[0]; return xs[0], xs[-1]
dl = [legs(f) for f in bs]; s = 1.15 * PPH / (dl[0][1] - dl[0][0]); ml = round(max(d[0] for d in dl) * s) + 2
bw = ml + round(max(f.shape[1] - d[0] for f, d in zip(bs, dl)) * s) + 2; bh = round(max(f.shape[0] for f in bs) * s) + 2; cells = []
for f, d in zip(bs, dl): im = scaled(f, s); c = Image.new("RGBA", (bw, bh), (0, 0, 0, 0)); c.alpha_composite(im, (ml - round(d[0] * s), bh - im.height)); cells.append(c)
deskw = (dl[0][1] - dl[0][0]) * s
save("boss", strip(cells), w=bw, h=bh, n=12, ax=round(ml + .6 * deskw), rodx=round(ml + .42 * deskw), rody=bh - round(254 * s))

# Hiding places. Coat stand: empty 0, with you in it 1. Locker: shut 0, open 1, shut with your nose at the vents 2 (lined up on the right-hand side).
co = figures(key("coats.png")); s = 1.32 * PPH / co[0].shape[0]; cells = [scaled(f, s) for f in co]; cw = max(c.width for c in cells); out = []
for c in cells: k = Image.new("RGBA", (cw, max(x.height for x in cells)), (0, 0, 0, 0)); k.alpha_composite(c, (0, k.height - c.height)); out.append(k)
save("coats", strip(out), w=cw, h=out[0].height, n=2)
pl = figures(key("plant.png")); assert len(pl) == 2, len(pl); s = 1.28 * PPH / pl[0].shape[0]; cells = [scaled(f, s) for f in pl]; pw_ = max(c.width for c in cells); out = []     # the plant: on its own 0, with you behind it 1
for c in cells: k = Image.new("RGBA", (pw_, max(x.height for x in cells)), (0, 0, 0, 0)); k.alpha_composite(c, (0, k.height - c.height)); out.append(k)
save("plant", strip(out), w=pw_, h=out[0].height, n=2, mid=round(cells[0].width / 2))
lo = figures(key("locker.png")); s = 1.36 * PPH / lo[0].shape[0]; cells = [scaled(f, s) for f in lo]; lw = max(c.width for c in cells); out = []
for c in cells: k = Image.new("RGBA", (lw, max(x.height for x in cells)), (0, 0, 0, 0)); k.alpha_composite(c, (lw - c.width, k.height - c.height)); out.append(k)
save("locker", strip(out), w=lw, h=out[0].height, n=3, body=cells[0].width)

# Corridor objects, all at the scale where a door is 1.4 heights tall
pr = figures(key("props.png")); ps = 1.4 * PPH / pr[1].shape[0]; names = ["doorway", "door", "cooler", "sign", "exit"]; cells = [scaled(f, ps) for f in pr]; xs = np.cumsum([0] + [c.width for c in cells]).tolist()
a = np.asarray(cells[0])[..., 3] < 128; mid = a[a.shape[0] // 2]; hole = max(runs(mid, 0), key=lambda r: r[1] - r[0]); hx = (hole[0] + hole[1]) // 2; top = int(np.argmax(a[:, hx][10:])) + 10 if not a[5, hx] else 0
save("props", strip(cells), items={n: dict(x=xs[i], w=cells[i].width, h=cells[i].height) for i, n in enumerate(names)}, hole=dict(x0=hole[0], x1=hole[1], top=top))

# The recycling bin, empty and occupied (the body is .62 of a height tall so a hop clears the rim)
bn = figures(key("bin.png")); s = PPH / bn[0].shape[0]; cells = [scaled(f, s) for f in bn]
save("bin", strip(cells), w=cells[0].width, h=cells[0].height, w2=cells[1].width, rim=.62)

# The corridor wall: made to repeat, and shrunk
bg = Image.open(os.path.join(SRC, "corridor.png")).convert("RGB"); a = np.asarray(bg).astype(np.float32); B = 60; W = a.shape[1] - B; out = a[:, :W].copy()
for x in range(B): t = x / B; out[:, x] = a[:, W + x] * (1 - t) + a[:, x] * t
bgim = Image.fromarray(out.astype(np.uint8)); k = 620 / bgim.height; bgim = bgim.resize((round(bgim.width * k), 620), Image.LANCZOS); fl = np.asarray(bgim)[-6:].reshape(-1, 3).mean(axis=0)
p = os.path.join(OUT, "corridor.webp"); bgim.save(p, quality=82, method=6); ART["corridor"] = dict(W=bgim.width, H=bgim.height, floor="#%02x%02x%02x" % tuple(int(v) for v in fl), kb=os.path.getsize(p) // 1024)

# "Caught by the Boss": Barry's drawing of the introvert across the desk, hoodie turned navy
ca = np.asarray(Image.open(os.path.join(SRC, "cast-original.png")).convert("RGB")).astype(np.float32)[378:700, 325:1170]; r, g, b = ca[..., 0], ca[..., 1], ca[..., 2]
hood = np.zeros(r.shape, bool); hood[10:168, 20:215] = True; grey = (np.max(ca, axis=2) - np.min(ca, axis=2) < 34) & (np.max(ca, axis=2) < 150) & hood
lum = (r + g + b) / 3; ca[grey] = np.stack([lum * .42, lum * .5, lum * .78 + 6], axis=-1)[grey]
save("caught-boss", Image.fromarray(np.clip(ca, 0, 255).astype(np.uint8)).convert("RGBA"))

with open(os.path.join(HERE, "art.js"), "w") as f:
    f.write("// Made by cut.py from Barry's drawings in src/. Do not edit by hand.\nexport const PPH = %d;\nexport const ART = %s;\nexport const FILES = {\n" % (PPH, json.dumps(ART)))
    for n in ART: f.write('  "%s": "%s",\n' % (n, base64.b64encode(open(os.path.join(OUT, n + ".webp"), "rb").read()).decode()))
    f.write("};\n")
chk = Image.new("RGB", (2000, 2200), "#fbf1e7"); y = 10
for n in ("park-cast", "park-mega", "hero-idle", "hero-hang", "nemesis", "park-play", "park-things", "park-people", "park-kid", "park-parents", "park-decor"):
    im = Image.open(os.path.join(OUT, n + ".webp")).convert("RGBA")
    if im.width > 1980: im = im.resize((1980, round(im.height * 1980 / im.width)))
    chk.paste(im, (10, y), im); y += im.height + 10
chk.crop((0, 0, 2000, y)).save(os.path.join(HERE, "cut-check.png")); print({k: v["kb"] for k, v in ART.items()}, ART["props"], ART["bin"], ART["corridor"], ART["boss"])
