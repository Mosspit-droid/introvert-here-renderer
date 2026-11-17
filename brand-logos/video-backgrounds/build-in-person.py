# In Person (IP) video background (17 Nov 2026): slate-blue painted tongue-and-groove panelling,
# evening light, the In Person stacked logo printed on with light wear; the name badge stays clean.
# Logo size/position match rebuild-ih-sh-pc.py. Run:
#   python3 build-in-person.py ../main-collections/in-person-stacked.png ../../backgrounds/IP.jpg
import sys, os, subprocess, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = r'''import numpy as np, sys
from PIL import Image, ImageFilter, ImageDraw, ImageFont
S=1080; rng=np.random.default_rng(7)
def blur(a,r):
    lo,hi=float(a.min()),float(a.max()); u=((a-lo)/(hi-lo+1e-9)*65535).astype(np.int32)
    im=Image.fromarray(u,'I').convert('F')
    b=np.asarray(Image.fromarray(((a-lo)/(hi-lo+1e-9)*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32)/255
    return b*(hi-lo)+lo
def make(base, out, light=(1.0,0.86,0.62)):
    y,x=np.mgrid[0:S,0:S].astype(np.float32)
    img=np.ones((S,S,3),np.float32)*np.array(base,np.float32)/255
    # vertical tongue-and-groove planks
    W=96; off=18; px=(x+off)%W
    groove=np.exp(-((px-0)**2)/6)+np.exp(-((px-W)**2)/6)          # dark V-groove
    bevel=np.exp(-((px-4)**2)/5)*0.6                                # lit bevel edge
    # brushed paint + faint grain running vertically
    n=rng.standard_normal((S,S)).astype(np.float32)
    grain=blur(n,0.6)
    streak=np.asarray(Image.fromarray(n,'F').resize((S,S//30)).resize((S,S),Image.BICUBIC))
    plank_id=((x+off)//W).astype(int); tone=(rng.standard_normal(20)*0.025)[plank_id%20]
    shade=1+tone+0.035*streak+0.012*grain-0.55*groove+0.18*bevel
    img*=shade[...,None]
    # soft diagonal window light, warm
    d=(x*0.8+y)/S
    shaft=np.zeros((S,S),np.float32)
    for c,w in [(0.55,0.10),(0.80,0.07),(1.05,0.05)]:
        shaft+=np.exp(-((d-c)**2)/(2*w*w))
    shaft=blur(shaft,25)*np.clip(1.3-y/S,0,1)
    img=img*(1+0.55*shaft[...,None]*np.array(light))
    # vignette
    r=np.sqrt((x-S/2)**2+(y-S*0.45)**2)/(S*0.75); img*= (1-0.45*r**2)[...,None]
    im=Image.fromarray((np.clip(img,0,1)*255).astype(np.uint8)); im.save(out+'_base.png')
    return
    # logo at the same place/size as the other ranges (from rebuild-ih-sh-pc.py)
    SC=509/2176; OX=286-1163*SC; OY=53-38*SC
    L=Image.open(sys.argv[1]).convert('RGBA').resize((round(4500*SC),round(1500*SC)),Image.LANCZOS)
    im=im.convert('RGBA'); im.alpha_composite(L,(round(OX),round(OY))); im=im.convert('RGB')
    im.save(out+'.jpg',quality=93)
    pv=im.copy(); dr=ImageDraw.Draw(pv); f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',54)
    for i,t in enumerate(["… I'M ALEX.","WE'VE MET SIX TIMES."]):
        w=dr.textlength(t,font=f); dr.text(((S-w)/2,520+i*80),t,font=f,fill='white')
    pv.save(out+'_preview.jpg',quality=90)
make((58,70,92), sys.argv[2]+'/ip_slate')'''
FINISH = r'''import numpy as np, sys
from PIL import Image, ImageFilter
S=1080; rng=np.random.default_rng(11)
B=np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32)/255
SC=509/2176; OX=round(286-1163*SC); OY=round(53-38*SC)
L=Image.open(sys.argv[2]).convert('RGBA').resize((round(4500*SC),round(1500*SC)),Image.LANCZOS)
canvas=Image.new('RGBA',(S,S),(0,0,0,0)); canvas.paste(L,(OX,OY)); A=np.asarray(canvas).astype(np.float32)/255
a=A[...,3]; col=A[...,:3]
# surface detail from the wall (grooves and brush) shows through the print
lum=B.mean(2); low=np.asarray(Image.fromarray((lum*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32)/255
tex=lum-low
col=np.clip(col*(1+tex[...,None]*2.0)*(0.9+0.2*lum[...,None]/lum.mean()),0,1)
# worn print: small speckled losses, a little more along groove lines
n=rng.standard_normal((S,S)).astype(np.float32)
n=np.asarray(Image.fromarray(((n-n.min())/(n.max()-n.min())*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32)
n=(n-n.mean())/n.std()
groove=np.clip(-tex*12,0,1)
keep=np.clip(1-0.7*np.clip(-n-1.5,0,3)-0.12*groove,0,1)
lw,lh=L.size; badge=np.zeros((S,S),bool); badge[OY+int(lh*0.60):OY+lh, OX+int(lw*0.60):OX+lw]=True
keep[badge]=1.0
col=np.where(badge[...,None],A[...,:3],col)
op=np.where(badge,1.0,0.94)
aa=(a*op*keep)[...,None]
out=B*(1-aa)+col*aa
Image.fromarray((np.clip(out,0,1)*255).astype(np.uint8)).save(sys.argv[3],quality=92)'''
if __name__ == "__main__":
    logo, out = sys.argv[1], sys.argv[2]
    d = tempfile.mkdtemp()
    open(os.path.join(d, "base.py"), "w").write(BASE); open(os.path.join(d, "finish.py"), "w").write(FINISH)
    subprocess.run([sys.executable, os.path.join(d, "base.py"), logo, d], check=True)
    subprocess.run([sys.executable, os.path.join(d, "finish.py"), os.path.join(d, "ip_slate_base.png"), logo, out], check=True)
