"""Hoodini end card: dim, click, spotlight on, he steps backwards out of the light (facing right), empty light + logo.
Inputs (in out/): gs/*.png (fal side-profile walk on green, 30 fps), stage3-on.png, brand-top.png. Writes comp/*.png."""
from PIL import Image
import numpy as np, glob, os
os.makedirs('comp', exist_ok=True)
fs=sorted(glob.glob('gs60/*.png'))[::-1][42:]               # 60 fps in-betweens, reversed: backwards steps; feet together at the start
H,W=1920,1080
on=np.array(Image.open('stage3-on.png').convert('RGB')).astype(np.float32)
brand=np.array(Image.open('brand-top.png').convert('RGBA')).astype(np.float32)
EDGE=270                                                     # left edge of the light: one straight vertical cut
vis=np.clip((np.arange(W)-EDGE)/6.0,0,1)[None,:,None]
def key(f):
    a=np.array(Image.open(f).convert('RGB').resize((W,H),Image.LANCZOS)).astype(np.float32)
    r,g,b=a[...,0],a[...,1],a[...,2]
    al=np.clip(1-((g-np.maximum(r,b))-40)/80,0,1); a[...,1]=np.minimum(g,np.maximum(r,b)+10)
    return a,al
def headpos(al):
    ys,xs=np.where(al>0.5); top=ys.min(); hgt=ys.max()-top
    sel=ys<top+0.3*hgt
    return xs[sel].mean(), top, xs.mean(), ys.max()
HP=[]
for f in fs:
    _,al=key(f); HP.append(headpos(al))
HP=np.array(HP); n=len(HP); idx=np.arange(n)
slope=np.polyfit(idx,HP[:,0],1)[0]                          # his natural walking speed (head x per frame)
SPEED=1.5; EXAG=1.3; START=(470,1570); RISE=-110
# head position of the first frame when its feet sit on START
H0=(START[0]-HP[0,2]+HP[0,0], START[1]-HP[0,3]+HP[0,1])
def frame_at(j,prog):
    a,al=key(fs[j]); hx,hy=HP[j,0],HP[j,1]
    tx=H0[0]+slope*j*EXAG; ty=H0[1]+RISE*prog              # the head glides on a straight line
    dx=int(round(tx-hx)); dy=int(round(ty-hy))
    A=np.zeros((H,W,3),np.float32); L=np.zeros((H,W),np.float32)
    y0,y1=max(0,dy),min(H,H+dy); x0,x1=max(0,dx),min(W,W+dx)
    A[y0:y1,x0:x1]=a[y0-dy:y1-dy,x0-dx:x1-dx]; L[y0:y1,x0:x1]=al[y0-dy:y1-dy,x0-dx:x1-dx]
    return A,L[...,None]
# Barry's standing drawing, sized and placed to match the first walk frame
_a,_al=key(fs[0]); _ys,_xs=np.where(_al>0.5); FH=_ys.max()-_ys.min()
stand=Image.open('../assets/hoodini-full.png'); stand=stand.resize((int(stand.width*FH/stand.height),FH),Image.LANCZOS)
SA=np.array(stand).astype(np.float32)
def standing():
    A=np.zeros((H,W,3),np.float32); L=np.zeros((H,W),np.float32)
    al=SA[...,3]/255; ys,xs=np.where(al>0.5)
    dx=int(round(START[0]-xs.mean())); dy=int(round(START[1]-ys.max()))
    h,w=al.shape; A[dy:dy+h,dx:dx+w]=SA[...,:3]; L[dy:dy+h,dx:dx+w]=al
    return A,L[...,None]
sm=lambda x:0 if x<=0 else 1 if x>=1 else x*x*(3-2*x)
FPS=30; T0=1.2; T1=1.8; i=0; gone=None
while True:
    t=i/FPS
    if t<T0:
        A,L=standing(); out=A*0.45*L
    else:
        out=on.copy()
        if gone is None:
            j=0 if t<T1 else min(n-1,int((t-T1)*FPS*SPEED))
            if t<T1: A,Lraw=standing()
            else:
                A,Lraw=frame_at(j,min(1,j/120)); x=(t-T1)/0.25
                if x<1:                                    # brief blend from the drawing into the walk
                    SAx,SLx=standing(); A=A*x+SAx*(1-x); Lraw=np.maximum(Lraw*x,SLx*(1-x))
            L=Lraw*vis
            lit=(L[...,0]>0.5).sum()/max(1,(Lraw[...,0]>0.5).sum())
            if t>T1+0.3 and lit<0.08: gone=t
            else: out=out*(1-L)+A*L
    Image.fromarray(np.clip(out,0,255).astype(np.uint8)).save('comp/%04d.png'%i); i+=1
    if (gone and t>gone+3.0) or t>14: break
print('gone at', gone); open('gone.txt','w').write(str(gone))
