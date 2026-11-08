import numpy as np, sys
from PIL import Image, ImageFilter
from scipy.ndimage import gaussian_filter, binary_dilation
S=1080; SC=509/2176; OX=286-1163*SC; OY=53-38*SC
CW=round(4500*SC); CH=round(1500*SC); X0=round(OX); Y0=round(OY)
def canvas(path):
    im=Image.open(path).convert("RGBA").resize((CW,CH),Image.LANCZOS)
    o=np.zeros((S,S,4),np.float32); A=np.asarray(im).astype(np.float32)/255
    ys,xs=max(0,Y0),max(0,X0); sub=A[ys-Y0:ys-Y0+S-ys, xs-X0:xs-X0+S-xs]
    o[ys:ys+sub.shape[0], xs:xs+sub.shape[1]]=sub; return o
def normconv(img,mask,sig):
    num=np.stack([gaussian_filter(img[...,c]*mask,sig) for c in range(3)],-1); den=gaussian_filter(mask,sig)[...,None]
    return num/np.maximum(den,1e-4)
def run(src,box,shift,logo,out,k,opac,wear,seed,excl_top=0,sig=40):
    B=np.asarray(Image.open(src).convert("RGB").resize((S,S),Image.LANCZOS)).astype(np.float32)/255
    x1,y1,x2,y2=box; hole=np.zeros((S,S),np.float32); hole[y1:y2,x1:x2]=1
    valid=1-hole; valid[:excl_top]=0
    if shift is None:
        g=gaussian_filter(B.mean(2),8); ringm=(np.clip(gaussian_filter(hole,14)-hole,0,1)*valid)>0.03
        tgt=g[ringm]; best=None
        for ddy in range(300,720,12):
            for ddx in range(-260,261,12):
                if y1+ddy<0 or y2+ddy>S or x1+ddx<0 or x2+ddx>S: continue
                sg=np.roll(np.roll(g,-ddy,0),-ddx,1)[ringm]
                e=np.mean((sg-tgt)**2)
                if best is None or e<best[0]: best=(e,ddx,ddy)
        shift=best[1:]; print(src,"best shift",shift,best[0])
    dx,dy=shift; srcp=np.roll(np.roll(B,-dy,0),-dx,1)
    ring=np.clip(gaussian_filter(hole,10)-hole,0,1)*valid
    # match the copied patch to the surroundings with a smooth correction
    diff=normconv(B-srcp,ring/ring.max()*(ring>0.02),sig)
    feather=gaussian_filter(hole,6)[...,None]
    P=B*(1-feather)+np.clip(srcp+diff,0,1)*feather
    L=canvas(logo); a=L[...,3]
    tex=P.mean(2); tex=tex-gaussian_filter(tex,3)
    rng=np.random.default_rng(seed)
    n=gaussian_filter(rng.random((S,S)).astype(np.float32),1.2); n=(n-n.mean())/n.std()
    keep=np.clip(1-wear*np.clip(-n-0.8,0,3),0,1)
    aa=a*opac*keep
    col=np.clip(L[...,:3]*(1+k*tex[...,None]*4)*(0.88+0.24*gaussian_filter(P.mean(2),40)[...,None]/P.mean()),0,1)
    R=P*(1-aa[...,None])+col*aa[...,None]
    Image.fromarray((np.clip(R,0,1)*255).astype(np.uint8)).save(out)
    Image.fromarray((np.clip(P,0,1)*255).astype(np.uint8)).save(out.replace(".png","_clean.png"))
LG="/home/user/introvert-here-renderer/brand-logos/main-collections/"
run("cur_ih.png",(270,38,812,328),None,LG+"introvert-here-stacked.png","new_ih.png",1.6,0.95,0.5,1,0,70)
run("cur_sh.png",(272,36,808,326),None,LG+"shhh-stacked.png","new_sh.png",1.2,0.9,0.0,2,0,40)
run("cur_pc.png",(250,22,822,326),(0,560),LG+"per-contract-stacked.png","new_pc.png",1.8,0.95,0.15,3,22,40)
