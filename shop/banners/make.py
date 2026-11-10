"""Range banners for the shop: same size (1800x600) and same logo box as the INTROVERT HERE banner.
Usage: python3 make.py <folder with fonts/ (Montserrat ExtraBold) and look/bg-PC.jpg, bg-OS.jpg> <output folder>
Taglines: build(coll, ["line one", "line two"], "hero-SH.jpg")."""
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter
R="/home/user/introvert-here-renderer/"; S=sys.argv[1]; OUT=sys.argv[2]
FONT=S+"/fonts/expo-google-fonts-montserrat-0.4.2/800ExtraBold/Montserrat_800ExtraBold.ttf"
W,H=1800,600
# IH banner (2400x800) logo frame spans x 24..1131, y 68..646 -> logo png frame starts at (1163,38), 2176 wide
SC=(1131-24)/2176*0.75; OX=24*0.75-1163*SC; OY=68*0.75-38*SC
LOGOS={"SH":R+"brand-logos/main-collections/shhh-stacked.png","PC":R+"brand-logos/main-collections/per-contract-stacked.png",
       "OS":R+"brand-logos/off-the-shelf/off-the-shelf-logo-stacked-metallic.png"}
def background(c):
    if c=="SH":
        im=Image.open(R+"backgrounds/SH.jpg").convert("RGB").crop((0,330,1080,690))
    else:
        im=Image.open(S+f"/look/bg-{c}.jpg").convert("RGB"); im=im.crop((0,0,im.width,im.width//3))
    return np.asarray(im.resize((W,H),Image.LANCZOS)).astype(np.float32)/255
def blend(B,layer,k=1.4,seed=1,wear=0.0):
    a=layer[...,3]; tex=B.mean(2); tex=tex-gaussian_filter(tex,3)
    n=gaussian_filter(np.random.default_rng(seed).random((H,W)).astype(np.float32),1.2); n=(n-n.mean())/n.std()
    a=a*np.clip(1-wear*np.clip(-n-0.8,0,3),0,1)
    col=np.clip(layer[...,:3]*(1+k*tex[...,None]*4),0,1)
    return B*(1-a[...,None])+col*a[...,None]
def logo_layer(c):
    L=Image.open(LOGOS[c]).convert("RGBA"); L=L.resize((round(L.width*SC),round(L.height*SC)),Image.LANCZOS)
    o=Image.new("RGBA",(W,H)); o.alpha_composite(L,(round(OX),round(OY))); return np.asarray(o).astype(np.float32)/255
def text_layer(lines,colour=(242,240,234)):
    # IH tagline: left edge x=934, block centred on the logo's height, ~90px per line
    o=Image.new("RGBA",(W,H)); d=ImageDraw.Draw(o); f=ImageFont.truetype(FONT,64)
    # Top of the capitals level with the top of the logo frame (y=51); same left edge as the IH tagline.
    lh=90; logo_top=round(OY+38*SC); cap_top=f.getbbox("H")[1]
    for i,t in enumerate(lines): d.text((934,logo_top-cap_top+i*lh),t.upper(),font=f,fill=colour+(255,))
    right=max(d.textbbox((934,0),t.upper(),font=f)[2] for t in lines); assert right<W-30, f"tagline too wide ({right}px)"
    return np.asarray(o).astype(np.float32)/255
def build(c,lines,name):
    B=background(c)
    if c=="SH": B=B*0.82
    B=blend(B,logo_layer(c),k=1.2,seed=2)
    if lines: B=blend(B,text_layer(lines),k=1.6,seed=5,wear=0.5)
    Image.fromarray((np.clip(B,0,1)*255).astype(np.uint8)).save(f"{OUT}/{name}",quality=86)
if __name__=="__main__":
    TAGLINES={"SH":["Said softly.","Meant completely."],"PC":["Dressed for","mandatory fun"],"OS":["A literal","escape"]}  # Barry, 10 Nov
    for c in "SH PC OS".split(): build(c,TAGLINES[c],f"hero-{c}.jpg")
