"""I'll wait: approach (clip A), camera drifts right to reveal the traveller at the well (clip B, keyed), bubble, hold."""
from PIL import Image, ImageFilter
import numpy as np, glob, os
A=sorted(glob.glob('wa/*.png')); B=sorted(glob.glob('wb/*.png'))
W,H,EXT=1920,1080,820; FPS=30
bub=np.array(Image.open('bubble.png').convert('RGBA')).astype(np.float32)
# traveller: key green, find a common bounding box over all frames
def keyB(f):
    a=np.array(Image.open(f).convert('RGB')).astype(np.float32); r,g,b=a[...,0],a[...,1],a[...,2]
    al=np.clip(1-((g-np.maximum(r,b))-40)/60,0,1); a[...,1]=np.minimum(g,np.maximum(r,b)+20); return a,al
boxes=[]
for f in B[::10]:
    _,al=keyB(f); ys,xs=np.where(al>0.5); boxes.append((xs.min(),ys.min(),xs.max(),ys.max()))
x0=min(b[0] for b in boxes)-6; y0=min(b[1] for b in boxes)-6; x1=max(b[2] for b in boxes)+6; y1=min(703,max(b[3] for b in boxes)+6)
TH=760; sc=TH/(y1-y0); TW=int((x1-x0)*sc)
TX=W+EXT-TW-50; TY=H-TH
print('traveller box',(x0,y0,x1,y1),'size',TW,TH,'at',TX, 'left edge vs crop0 right', TX-W)
def trav(i):
    n=len(B); k=i%(2*n-2); k=k if k<n else 2*n-2-k
    a,al=keyB(B[k]); im=Image.fromarray(np.dstack([a,al*255]).astype('uint8'),'RGBA').crop((x0,y0,x1,y1)).resize((TW,TH),Image.LANCZOS)
    t=np.array(im).astype(np.float32); return t[...,:3],t[...,3:]/255
sm=lambda x:0 if x<=0 else 1 if x>=1 else x*x*(3-2*x)
HOLD0=1.5; APP=len(A)/FPS; P0=HOLD0+APP; P1=P0+2.6; B0=P1+0.5; END=B0+3.8
for i in range(int(END*FPS)):
    t=i/FPS
    j=0 if t<HOLD0 else min(len(A)-1,int((t-HOLD0)*FPS))
    fr=np.array(Image.open(A[j]).convert('RGB')).astype(np.float32)
    fr[:,W-12:]=fr[:,W-13:W-12]; wide=np.concatenate([fr,np.repeat(fr[:,W-13:W-12],EXT,axis=1)],axis=1)
    tc,ta=trav(i); reg=wide[TY:TY+TH,TX:TX+TW]; wide[TY:TY+TH,TX:TX+TW]=reg*(1-ta)+tc*ta
    off=int(round(EXT*sm((t-P0)/(P1-P0))))
    out=wide[:,off:off+W]
    if t>=B0:
        k=sm((t-B0)/0.35); ba=bub[...,3:]/255*k; out=out*(1-ba)+bub[...,:3]*ba
    Image.fromarray(np.clip(out,0,255).astype('uint8')).save('comp_w/%04d.png'%i)
print('total',round(END,2),'pan',round(P0,2),round(P1,2),'bubble',round(B0,2))
