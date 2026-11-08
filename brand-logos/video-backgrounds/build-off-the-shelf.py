import numpy as np
from PIL import Image, ImageFilter, ImageDraw
S=2160; K=S/1080
bg=Image.open("/root/.claude/uploads/769316c1-83de-5c23-bdef-f72138378311/e7828f6c-image.png").convert("RGB").resize((S,S),Image.LANCZOS)
B=np.asarray(bg).astype(np.float32)/255
lum=B.mean(2)
blur=np.asarray(Image.fromarray((lum*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32)/255
grain=(lum-blur)  # leather texture
light=np.asarray(Image.fromarray((lum*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(120))).astype(np.float32)/255
light=(light-light.min())/(light.max()-light.min())  # broad lighting incl. beam

# standard placement: canvas frame x1163..3339 -> 286..795 in 1080 frame, frame top y38 -> 53
SC=509/2176; OX=286-1163*SC; OY=53-38*SC
CW=round(4500*SC*K); CH=round(1500*SC*K); X0=round(OX*K); Y0=round(OY*K)
def canvas(path):
    im=Image.open(path).convert("RGBA").resize((CW,CH),Image.LANCZOS)
    o=np.zeros((S,S,4),np.float32)
    ys,xs=max(0,Y0),max(0,X0)
    sub=np.asarray(im).astype(np.float32)[ys-Y0:ys-Y0+S-ys, xs-X0:xs-X0+S-xs]
    o[ys:ys+sub.shape[0], xs:xs+sub.shape[1]]=sub
    return o
F=canvas("/home/user/introvert-here-renderer/brand-logos/off-the-shelf/off-the-shelf-logo-stacked.png")
def place(m): return m
a=F[...,3]/255; r,g,b=F[...,0],F[...,1],F[...,2]
goldM=place(a*((abs(r-188)<40)&(abs(g-156)<40)&(b<110)))
silvM=place(a*((r>248)&(g>248)&(b>248)))
strapM=place(a)-goldM-silvM; strapM=np.clip(strapM,0,1)

# extra tooling: gold double fillet + blind-tooled rule around the frame
tool=Image.new("L",(S,S),0); d=ImageDraw.Draw(tool)
for inset,wd in [(46,6),(62,3)]:
    i=int(inset*K); d.rectangle([i,i,S-i,S-i],outline=255,width=int(wd*K))
# corner fleurons: small diamonds
for cx,cy in [(1,1),(1,-1),(-1,1),(-1,-1)]:
    i=int(54*K); px=i if cx>0 else S-i; py=i if cy>0 else S-i; s=int(14*K)
    d.polygon([(px,py-s),(px+s,py),(px,py+s),(px-s,py)],fill=255)
#goldM=np.maximum(goldM,np.asarray(tool).astype(np.float32)/255)
blind=Image.new("L",(S,S),0); d=ImageDraw.Draw(blind)
i=int(86*K); d.rectangle([i,i,S-i,S-i],outline=255,width=int(4*K))
i=int(96*K); d.rectangle([i,i,S-i,S-i],outline=255,width=int(2*K))
blindM=np.zeros((S,S),np.float32)

rng=np.random.default_rng(7)
def lowfreq(sc,seed):
    n=np.random.default_rng(seed).random((S//sc,S//sc)).astype(np.float32)
    return np.asarray(Image.fromarray((n*255).astype(np.uint8)).resize((S,S),Image.BICUBIC).filter(ImageFilter.GaussianBlur(sc/3))).astype(np.float32)/255
wear=(lowfreq(24,1)*0.6+lowfreq(6,2)*0.4)
fine=rng.random((S,S)).astype(np.float32)

def blurA(m,r): return np.asarray(Image.fromarray((np.clip(m,0,1)*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32)/255
def shift(m,dx,dy): return np.roll(np.roll(m,dy,0),dx,1)

out=B.copy()
def tooling(M,base,hi,depth=1.0):
    global out
    # worn patches and speckle: leather shows through
    keep=np.clip((wear-0.22)*8,0,1)*(fine>0.015)
    foil=M*np.clip(0.8+0.2*keep,0,1)
    # pressed ring around the tooling (darker compressed leather)
    ring=np.clip(blurA(M,3*K)-M,0,1)
    out*= (1-0.35*depth*ring)[...,None]
    # bed of the impression: leather in the stamp is darker
    out*= (1-0.25*depth*M)[...,None]
    # foil colour: base -> highlight by lighting + grain
    t=np.clip(0.15+0.75*light+grain*1.2,0,1)[...,None]
    col=np.array(base)[None,None,:]*(1-t)+np.array(hi)[None,None,:]*t
    col=col*(1+grain[...,None]*0.7)
    # inner shadow top-left (debossed), inner highlight bottom-right
    sh=np.clip(M-shift(blurA(M,1.5*K),int(2*K),int(2*K)),0,1)
    hl=np.clip(M-shift(blurA(M,1.5*K),-int(2*K),-int(2*K)),0,1)
    col=col*(1-0.6*sh[...,None])+0.3*hl[...,None]
    yy,xx=np.mgrid[0:S,0:S].astype(np.float32)/K
    d=(xx*0.8+yy)  # diagonal parallel-ish to the beam
    sheen=np.exp(-((d-430)/38)**2)*0.55+np.exp(-((d-610)/18)**2)*0.35
    spec=np.clip(light-0.35,0,1)**1.5*0.9
    glint=(np.clip(grain*40,0,1)**3)*0.25
    col=col+((sheen+spec)*(0.7+glint))[...,None]*np.array(hi)[None,None,:]
    out=out*(1-foil[...,None])+np.clip(col,0,1)*foil[...,None]

tooling(goldM,(0.55,0.38,0.10),(1.0,0.86,0.45))
tooling(silvM,(0.42,0.43,0.46),(0.88,0.89,0.92))
# blind tooling: just pressed, no foil
tooling(blindM*0,(0,0,0),(0,0,0))
ring=np.clip(blurA(blindM,2*K)-blindM*0.3,0,1)
out*=(1-0.35*blindM-0.15*ring)[...,None]
out+= (0.06*np.clip(shift(blindM,-int(K),-int(K))-blindM,0,1))[...,None]

# parchment label from the metallic logo, pasted on with a soft shadow
Mt=canvas("/home/user/introvert-here-renderer/brand-logos/off-the-shelf/off-the-shelf-logo-stacked-metallic.png")/255
lab=strapM*Mt[...,3]
shadow=shift(blurA(lab,8*K),int(4*K),int(7*K))
out*=(1-0.5*shadow)[...,None]
labcol=Mt[...,:3]*(1+grain[...,None]*0.5)*(0.85+0.2*light[...,None])
out=out*(1-lab[...,None])+np.clip(labcol,0,1)*lab[...,None]

img=Image.fromarray((np.clip(out,0,1)*255).astype(np.uint8)).resize((1080,1080),Image.LANCZOS)
img.save("os_bg_tooled.png")
img.crop((260,30,840,370)).resize((1160,680),Image.LANCZOS).save("os_bg_tooled_zoom.png")
