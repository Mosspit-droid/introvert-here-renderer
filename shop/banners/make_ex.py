"""Exclusive's shop banner: a tabloid front page (Barry, 20 Nov 2026).

Soft cream newsprint made here (no stock photo), with the red EXCLUSIVE. logo printed into it like a masthead (ink
only darkens the paper, so the white lettering is bare paper), then a headline in Anton (the tee headline font), an
italic sub-heading between two rules, and a last line, all set to the same width.
The italic is Playfair Display, standing in for the tee's body font until Barry confirms its name.

Usage: python3 make_ex.py <fonts folder> <output folder>
The fonts folder holds Anton_400Regular.ttf and PlayfairDisplay_400Regular_Italic.ttf (Google Fonts).
"""
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make import W, H, SC, OX, OY, LOGOS, R, logo_layer   # same size and logo position as the other range banners
FONTS, OUT = sys.argv[1], sys.argv[2]
LOGOS["EX"] = R + "brand-logos/main-collections/exclusive-stacked.png"
rng=np.random.default_rng(21)
def n(sig,sy=None):
    x=gaussian_filter(rng.normal(0,1,(H,W)),sig if sy is None else (sy,sig)); return x/x.std()
def paper(base=(241,227,194)):
    """Soft, warm, slightly blotchy tabloid paper (made here, in the style of Barry's reference pictures)."""
    B=np.ones((H,W,3),np.float32)*np.array(base,np.float32)/255
    cloud=0.6*n(90)+0.4*n(35)                     # big soft blotches
    B=B*(1+0.045*cloud)[...,None]
    B[...,2]*=(1-0.035*cloud)                     # darker patches are also yellower
    vein=np.clip(np.abs(n(28))<0.035,0,1).astype(np.float32); vein=gaussian_filter(vein,1.2)
    B=B*(1-0.0*vein)[...,None]                   # faint creases
    B=B*(1+0.018*n(0.7)+0.012*n(3,0.5))[...,None] # fine pulp grain
    return np.clip(B,0,1)
def printed(P,layer,seed,strength=1.0,spread=0.7,dropout=0.10):
    """Print a layer onto the paper with ink: ink only darkens (multiplies), so whites are bare paper; coverage is a
    little uneven, edges soak slightly into the pulp, and specks of paper show through."""
    r=np.random.default_rng(seed)
    a=gaussian_filter(layer[...,3],spread); c=layer[...,:3]
    cb=np.stack([gaussian_filter(c[...,i]*layer[...,3],spread) for i in range(3)],-1)/np.maximum(a,1e-4)[...,None]
    cov=gaussian_filter(r.normal(0,1,(H,W)),1.0); cov/=cov.std(); patch=gaussian_filter(r.normal(0,1,(H,W)),25); patch/=patch.std()
    tex=P.mean(2); tex=(tex-gaussian_filter(tex,4))/0.02      # paper's own grain pushes the ink around
    k=np.clip(strength*(0.96+0.012*cov+0.012*patch+0.012*tex),0,1)
    k=k*(1-np.clip((gaussian_filter(r.random((H,W)),0.6)-0.5)*14-3.6,0,1)*dropout*4)   # tiny missed specks
    ink=1-(a*np.clip(k,0,1))[...,None]*(1-np.clip(cb,0,1))    # transmittance per channel
    return P*ink

def sun_red(layer):
    """Repaint the logo's red as a brighter, flatter tabloid red; whites stay white (bare paper once printed)."""
    c=layer[...,:3]; red=np.clip((c[...,0]-c[...,1])*1.6,0,1)[...,None]; grey=c.mean(2,keepdims=True)
    out=layer.copy(); out[...,:3]=red*np.array([0.93,0.07,0.11])+(1-red)*np.where(grey>0.5,1.0,c)
    return out
PF=FONTS+"/PlayfairDisplay_400Regular_Italic.ttf"; AN=FONTS+"/Anton_400Regular.ttf"
X0,X1=934,1768
def fit(d,text,path,k,width,start):
    size=start
    while d.textlength(text,font=ImageFont.truetype(path,size*k))>width*k: size-=1
    while d.textlength(text,font=ImageFont.truetype(path,(size+1)*k))<=width*k: size+=1
    return ImageFont.truetype(path,size*k)
def front_page(body):
    """Headline, a rule, the sub-heading, a rule and a last line, all set to the same width like a front page."""
    k=3; o=Image.new("RGBA",(W*k,H*k)); d=ImageDraw.Draw(o); ink=(16,15,15,255); wd=X1-X0
    y=round(OY+38*SC)*k                              # level with the top of the logo
    def line(text,path,gap_after,start=60):
        nonlocal y
        f=fit(d,text,path,k,wd,start); b=d.textbbox((0,0),text,font=f)
        d.text((X0*k-b[0],y-b[1]),text,font=f,fill=ink); y+=b[3]-b[1]+gap_after*k
    def rule(gap_after):
        nonlocal y
        d.rectangle([X0*k,y,X1*k,y+3*k],fill=ink); y+=(3+gap_after)*k
    line("NO FURTHER COMMENT",AN,58,120); rule(56)
    line(body,PF,60,40); rule(56)
    line("SPOKESPERSON UNAVAILABLE. BY CHOICE.",AN,0,40)
    return np.asarray(o.resize((W,H),Image.LANCZOS)).astype(np.float32)/255
P=paper()
B=printed(P,sun_red(logo_layer("EX")),3,strength=1.0)
B=printed(B,front_page("Introvert declines to elaborate. Predictably."),5,strength=0.97,spread=0.55,dropout=0.05)
Image.fromarray((np.clip(B,0,1)*255).astype(np.uint8)).save(OUT+"/hero-EX.jpg",quality=90)
