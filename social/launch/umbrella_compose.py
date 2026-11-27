"""Umbrella end card: Hoodini dim in the dark; click, spotlight; he looks up, pulls a navy umbrella from his pocket,
opens it; everything under it drops into total shadow; logo then website appear in that shadow.
Inputs in out/: ug/*.png (fal clip on green, 1080x1920, 30 fps), stage4-on.png. Writes comp_u/*.png."""
from PIL import Image
import numpy as np, glob, os
os.makedirs('comp_u', exist_ok=True)
fs=sorted(glob.glob('ug/*.png')); N=len(fs)
H,W=1920,1080; K=0.72; FEET=(540,1560); SRCFEET=(540,1589)
on=np.array(Image.open('stage4-on.png').convert('RGB')).astype(np.float32)
ox=int(FEET[0]-SRCFEET[0]*K); oy=int(FEET[1]-SRCFEET[1]*K); SW,SH=int(W*K),int(H*K)
def key(f):
    im=Image.open(f).convert('RGB').resize((SW,SH),Image.LANCZOS)
    a=np.array(im).astype(np.float32); r,g,b=a[...,0],a[...,1],a[...,2]
    al=np.clip(1-((g-np.maximum(r,b))-40)/80,0,1); a[...,1]=np.minimum(g,np.maximum(r,b)+10)
    A=np.zeros((H,W,3),np.float32); L=np.zeros((H,W),np.float32)
    y0,x0=max(0,oy),max(0,ox); y1,x1=min(H,oy+SH),min(W,ox+SW)
    A[y0:y1,x0:x1]=a[y0-oy:y1-oy,x0-ox:x1-ox]; L[y0:y1,x0:x1]=al[y0-oy:y1-oy,x0-ox:x1-ox]
    return A,L[...,None]
# shadow under the umbrella: below the straight line joining the canopy's two outer tips
_,Lf=key(fs[-1]); m=Lf[...,0]>0.5
ys,xs=np.where(m); ctop=ys.min(); feet=ys.max()
cm=m.copy(); cm[int(ctop+0.5*(feet-ctop)):]=False             # canopy half only
cy,cx=np.where(cm)
li=np.argmin(cx); ri=np.argmax(cx)
LT=(cx[li],cy[cm[:,cx[li]].nonzero()[0].max()] if True else 0); RT=(cx[ri],np.where(cm[:,cx[ri]])[0].max())
LT=(cx[li],np.where(cm[:,cx[li]])[0].max())
X=np.arange(W); line=LT[1]+(RT[1]-LT[1])*(X-LT[0])/max(1,(RT[0]-LT[0]))
Y=np.arange(H)[:,None]
S=((Y>line[None,:]+4)&(X[None,:]>=LT[0])&(X[None,:]<=RT[0])).astype(np.float32)
edge=np.clip(np.minimum(X-LT[0],RT[0]-X)/8.0,0,1); S=(S*edge[None,:])[...,None]
print('tips',LT,RT)
# pitch black outside the spotlight beam (hides anything that strays out of the light)
from PIL import ImageFilter
_b=(on.max(axis=2)>10).astype(np.uint8)*255
VIS=(np.array(Image.fromarray(_b).filter(ImageFilter.GaussianBlur(3))).astype(np.float32)/255)[...,None]
sm=lambda x:0 if x<=0 else 1 if x>=1 else x*x*(3-2*x)
FPS=30; T0=1.2; T1=1.7; CLIP0=12; SH0,SH1=111,119; HOLD=1.6
END=T1+(N-1-CLIP0)/FPS
for i in range(int((END+HOLD)*FPS)):
    t=i/FPS
    if t<T0:
        A,L=key(fs[0]); out=A*0.45*L
    else:
        j=0 if t<T1 else min(N-1,CLIP0+int((t-T1)*FPS))
        A,L=key(fs[j]); L=L*VIS; out=on*(1-L)+A*L
        s=sm((j-SH0)/(SH1-SH0)) if t>=T1 else 0
        out=out*(1-S*s)
    Image.fromarray(np.clip(out,0,255).astype(np.uint8)).save('comp_u/%04d.png'%i)
open('umb_times.txt','w').write('%f %f'%(T1+(SH1-CLIP0)/FPS, END+HOLD))
print('shadow full at',T1+(SH1-CLIP0)/FPS,'total',END+HOLD)
