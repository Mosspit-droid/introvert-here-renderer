"""I'll wait, native vertical 1080x1920: dot approaches (clip A, zoomed), camera tilts down to reveal the traveller in the foreground, bubble."""
from PIL import Image
import numpy as np, glob
A=sorted(glob.glob('wa/*.png')); B=sorted(glob.glob('wb/*.png'))
W,H,FPS=1080,1920,30; S=1.3
CW=W/S; CX0=960-CW/2                      # clip columns to use (centred on Hoodini)
CH=int(round(1080*S)); TOP=522; CANH=2676
bub=np.array(Image.open('bubble-v.png').convert('RGBA')).astype(np.float32)
def keyB(f):
    a=np.array(Image.open(f).convert('RGB')).astype(np.float32); r,g,b=a[...,0],a[...,1],a[...,2]
    al=np.clip(1-((g-np.maximum(r,b))-40)/60,0,1); a[...,1]=np.minimum(g,np.maximum(r,b)+20); return a,al
boxes=[]
for f in B[::10]:
    _,al=keyB(f); ys,xs=np.where(al>0.5); boxes.append((xs.min(),ys.min(),xs.max(),ys.max()))
x0=min(b[0] for b in boxes)-6; y0=min(b[1] for b in boxes)-6; x1=max(b[2] for b in boxes)+6; y1=min(703,max(b[3] for b in boxes)+6)
TH=740; sc=TH/(y1-y0); TW=int((x1-x0)*sc); TX=W-TW-20; TY=CANH-TH
def trav(i):
    n=len(B); k=i%(2*n-2); k=k if k<n else 2*n-2-k
    a,al=keyB(B[k]); im=Image.fromarray(np.dstack([a,al*255]).astype('uint8'),'RGBA').crop((x0,y0,x1,y1)).resize((TW,TH),Image.LANCZOS)
    t=np.array(im).astype(np.float32); return t[...,:3],t[...,3:]/255
sm=lambda x:0 if x<=0 else 1 if x>=1 else x*x*(3-2*x)
HOLD0=1.5; APP=len(A)/FPS; P0=HOLD0+APP; P1=P0+2.8; B0=P1+0.5; END=B0+3.8
YEND=756
for i in range(int(END*FPS)):
    t=i/FPS
    j=0 if t<HOLD0 else min(len(A)-1,int((t-HOLD0)*FPS))
    fr=Image.open(A[j]).convert('RGB').crop((int(CX0),0,int(CX0+CW),1080)).resize((W,CH),Image.LANCZOS)
    fr=np.array(fr).astype(np.float32)
    can=np.concatenate([np.repeat(fr[:1],TOP,axis=0),fr,np.repeat(fr[-1:],CANH-TOP-CH,axis=0)],axis=0)
    tc,ta=trav(i); w=min(TW,W-TX); reg=can[TY:TY+TH,TX:TX+w]; can[TY:TY+TH,TX:TX+w]=reg*(1-ta[:,:w])+tc[:,:w]*ta[:,:w]
    y=int(round(YEND*sm((t-P0)/(P1-P0))))
    out=can[y:y+H]
    if t>=B0:
        k=sm((t-B0)/0.35); ba=bub[...,3:]/255*k; out=out*(1-ba)+bub[...,:3]*ba
    Image.fromarray(np.clip(out,0,255).astype('uint8')).save('comp_v/%04d.png'%i)
print('total',round(END,2),'traveller',TW,TH,'at',TX,TY)
