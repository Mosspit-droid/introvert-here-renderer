"""Umbrella end card v2: shadow follows the underside of the canopy every frame, sweeping in from the right as the
umbrella swings over; umbrella levelled once overhead; beam narrower than the canopy so only the canopy is lit."""
from PIL import Image, ImageFilter
import numpy as np, glob, os, math
os.makedirs('comp_u2', exist_ok=True)
fs=sorted(glob.glob('ug/*.png')); N=len(fs)
H,W=1920,1080; K=0.72; FEET=(540,1560); SRCFEET=(540,1589)
on=np.array(Image.open('stage5-on.png').convert('RGB')).astype(np.float32)
_b=(on.max(axis=2)>10).astype(np.uint8)*255
VIS=(np.array(Image.fromarray(_b).filter(ImageFilter.GaussianBlur(3))).astype(np.float32)/255)[...,None]
ox=int(FEET[0]-SRCFEET[0]*K); oy=int(FEET[1]-SRCFEET[1]*K); SW,SH=int(W*K),int(H*K)
def key(f):
    im=Image.open(f).convert('RGB').resize((SW,SH),Image.LANCZOS)
    a=np.array(im).astype(np.float32); r,g,b=a[...,0],a[...,1],a[...,2]
    al=np.clip(1-((g-np.maximum(r,b))-40)/80,0,1); a[...,1]=np.minimum(g,np.maximum(r,b)+10)
    A=np.zeros((H,W,3),np.float32); L=np.zeros((H,W),np.float32)
    y0,x0=max(0,oy),max(0,ox); y1,x1=min(H,oy+SH),min(W,ox+SW)
    A[y0:y1,x0:x1]=a[y0-oy:y1-oy,x0-ox:x1-ox]; L[y0:y1,x0:x1]=al[y0-oy:y1-oy,x0-ox:x1-ox]
    return A,L
# tilt of the open umbrella (final frame): the line between its two outer tips
_,Lf=key(fs[-1]); m=Lf>0.5; ys,xs=np.where(m); ctop,feet=ys.min(),ys.max()
cm=m.copy(); cm[int(ctop+0.5*(feet-ctop)):]=False; cy,cx=np.where(cm)
LT=(cx.min(),np.where(cm[:,cx.min()])[0].max()); RT=(cx.max(),np.where(cm[:,cx.max()])[0].max())
ANG=math.degrees(math.atan2(RT[1]-LT[1],RT[0]-LT[0]))      # negative = right side high
PIV=((LT[0]+RT[0])/2,(LT[1]+RT[1])/2)
print('tilt',round(ANG,1),'pivot',PIV)
def rot(A,L,deg):
    if abs(deg)<0.05: return A,L
    ia=Image.fromarray(np.clip(A,0,255).astype(np.uint8)).rotate(deg,resample=Image.BICUBIC,center=PIV)
    il=Image.fromarray((L*255).astype(np.uint8)).rotate(deg,resample=Image.BICUBIC,center=PIV)
    return np.array(ia).astype(np.float32),np.array(il).astype(np.float32)/255
T=300                                                      # max canopy thickness (px) when tracing its underside
def shadow(L):
    m=L>0.5; tops=np.argmax(m,axis=0); has=m.any(axis=0)
    if not has.any(): return None
    mt=tops[has].min()
    canopy=has&(tops<mt+170)                               # columns whose highest pixel is the canopy
    xsC=np.where(canopy)[0]
    x0,x1=xsC.min(),xsC.max()
    if x1-x0<380: return None                              # umbrella not open yet
    rim=np.full(W,np.nan)
    for x in range(x0,x1+1):
        if not canopy[x]: continue
        col=m[:,x]; y=tops[x]
        while y+1<H and col[y+1] and y-tops[x]<T: y+=1
        if y-tops[x]<T: rim[x]=y
    idx=np.arange(W); ok=~np.isnan(rim)
    if ok.sum()<50: return None
    xv,yv=idx[ok],rim[ok]
    for _ in range(3):                                     # smooth curve through the clean underside columns
        c=np.polyfit(xv,yv,2); res=yv-np.polyval(c,xv); keep=np.abs(res)<25
        if keep.sum()<30: break
        xv,yv=xv[keep],yv[keep]
    fit=np.polyval(c,idx[x0:x1+1]); rr=rim[x0:x1+1]
    r=np.where(np.isnan(rr),fit,np.maximum(rr,fit-6))      # never above the curve: no cuts into the canopy
    r=np.where(np.abs(r-fit)>40,fit,r)
    S=np.zeros((H,W),np.float32); Y=np.arange(H)[:,None]
    S[:,x0:x1+1]=(Y>r[None,:]-1).astype(np.float32)
    edge=np.clip(np.minimum(idx-x0,x1-idx)/4.0,0,1)
    return (S*edge[None,:])[...,None]
def tilt(L):
    m=L>0.5; ys,xs=np.where(m)
    if len(ys)==0: return 0.0
    ct,ft=ys.min(),ys.max(); cm=m.copy(); cm[int(ct+0.5*(ft-ct)):]=False; cy,cx=np.where(cm)
    if len(cx)==0: return 0.0
    l=(cx.min(),np.where(cm[:,cx.min()])[0].max()); r=(cx.max(),np.where(cm[:,cx.max()])[0].max())
    return math.degrees(math.atan2(r[1]-l[1],r[0]-l[0]))
LV0,LV1=112,128
TILT={}
for j in range(LV0,N):
    _,Lj=key(fs[j]); TILT[j]=tilt(Lj)
ks=sorted(TILT); vals=np.array([TILT[k] for k in ks])
vals=np.convolve(np.pad(vals,7,mode='edge'),np.ones(15)/15,mode='valid')
TILT={k:v for k,v in zip(ks,vals)}
sm=lambda x:0 if x<=0 else 1 if x>=1 else x*x*(3-2*x)
FPS=30; T0=1.2; T1=1.7; CLIP0=12; HOLD=1.6
END=T1+(N-1-CLIP0)/FPS; first_full=None
for i in range(int((END+HOLD)*FPS)):
    t=i/FPS
    if t<T0:
        A,L=key(fs[0]); out=A*0.45*L[...,None]
    else:
        j=0 if t<T1 else min(N-1,CLIP0+int((t-T1)*FPS))
        A,L=key(fs[j]); A,L=rot(A,L,TILT.get(j,0.0)*sm((j-LV0)/(LV1-LV0)))
        S=shadow(L) if j>=106 else None
        L3=(L[...,None])*VIS
        out=on*(1-L3)+A*L3
        if S is not None:
            rows=np.where(S[...,0].max(axis=1)>0.5)[0]
            if len(rows) and j>=LV1-6:                     # beam fully blocked: nothing below the canopy is lit
                yb=4+rows.min()+int(1.0*(np.argmax(S[...,0]>0.5,axis=0)[S[...,0].max(axis=0)>0.5].max()-rows.min()))
                full=np.zeros((H,W,1),np.float32); full[yb:]=sm((j-(LV1-6))/8)
                S=np.maximum(S,full)
            out=out*(1-S)
            if first_full is None and j>=LV1: first_full=t
    Image.fromarray(np.clip(out,0,255).astype(np.uint8)).save('comp_u2/%04d.png'%i)
open('umb2_times.txt','w').write('%f %f'%(first_full or END, END+HOLD))
print('levelled/full at',first_full,'total',END+HOLD)
