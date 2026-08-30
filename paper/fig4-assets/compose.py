import math, json
import numpy as np
from PIL import Image, ImageDraw

F=0.215; LEVELS=5; S=2*F/LEVELS; C0=1.6; Z0=0.61; RELIEF=0.6
theta=-2.354731089361497; phi=1.0044190919213134; dist=7.504901222914241
target=np.array([0.18675738877168327,-0.061573325384655875,0.23436154747516444])
W,H=3750,2922; aspect=W/H; hh=dist*math.tan(math.radians(16)); hw=hh*aspect

def Hfun(panel,x,y):
    r1=math.hypot(x+F,y); r2=math.hypot(x-F,y)
    return (r1-r2)/S if panel=='difference' else (r1+r2-C0)/S

def zparams(panel):
    lo,hi=1e9,-1e9
    for i in range(65):
        for j in range(65):
            h=Hfun(panel,-1+i/32,-1+j/32)
            lo=min(lo,h); hi=max(hi,h)
    mid=(lo+hi)/2; zs=RELIEF/(hi-lo)
    return mid,zs

camPos=target+dist*np.array([math.sin(phi)*math.cos(theta),math.sin(phi)*math.sin(theta),math.cos(phi)])
back=(camPos-target); back/=np.linalg.norm(back)
up=np.array([0,0,1.0])
xAxis=np.cross(up,back); xAxis/=np.linalg.norm(xAxis)
yAxis=np.cross(back,xAxis)
def px(p):
    d=np.array(p)-camPos
    return ((d@xAxis/hw+1)/2*W,(1-(d@yAxis/hh+1)/2)*H)

def surf(panel,x,y):
    mid,zs=zparams(panel)
    return (x,y,Z0+zs*(Hfun(panel,x,y)-mid))

BG=(244,242,238)

a=Image.open('fig4-panelA.png').convert('RGB'); b=Image.open('fig4-panelB.png').convert('RGB')
def maskim(im):
    arr=np.asarray(im).astype(int)
    return (np.abs(arr-np.array(BG)).sum(axis=2)>18)
m=maskim(a)|maskim(b); ys,xs=np.where(m); pad=70
x0,x1=max(0,xs.min()-pad),min(W,xs.max()+pad); y0,y1=max(0,ys.min()-pad),min(H,ys.max()+pad)
ca=a.crop((x0,y0,x1,y1)); cb=b.crop((x0,y0,x1,y1))
PW,PH=ca.size

gut=110; padT=210
FW=PW*2+gut; FH=padT+PH
out=Image.new('RGB',(FW,FH),BG)
out.paste(ca,(0,padT)); out.paste(cb,(PW+gut,padT))
out.save('fig4-final.png')

def frac(panel_idx,p):
    X,Y=px(p)
    X-=x0; Y-=y0; Y+=padT
    if panel_idx==1: X+=PW+gut
    return (round(X/FW,4), round(1-Y/FH,4))

def remap(fx,fy):
    # fraction in the FH=3266 four-panel canvas -> this canvas (same padT)
    Y=(1-fy)*3266
    return (fx, round(1-Y/FH,4))

ANCH={
 'cl_tgt': remap(0.352,0.7827),
 'wl_tgt': remap(0.276,0.7490),
 'rl':     remap(0.055,0.4507),
 'rl_tgt': remap(0.272,0.4923),
 'sl':     remap(0.995,0.8579),
 'sl_tgt': remap(0.8543,0.8098),
 'pl':     remap(0.552,0.9020),
 'pl_tgt': remap(0.752,0.6754),
 'cl':     remap(0.418,0.8761),
 'wl_s':   remap(0.285,0.9486),
 # difference-sheet geometry for the gl label
 'corner_left':  frac(0, surf('difference',-1.0,1.0)),
 'corner_top':   frac(0, surf('difference',1.0,1.0)),
 'edge_-0.9':    frac(0, surf('difference',-0.9,1.0)),
 'edge_-0.8':    frac(0, surf('difference',-0.8,1.0)),
 'edge_-0.7':    frac(0, surf('difference',-0.7,1.0)),
 'edge_-0.6':    frac(0, surf('difference',-0.6,1.0)),
 'edge_-0.5':    frac(0, surf('difference',-0.5,1.0)),
 'edge_-0.4':    frac(0, surf('difference',-0.4,1.0)),
 'edge_-0.3':    frac(0, surf('difference',-0.3,1.0)),
}
print(json.dumps({'size':[FW,FH],'anchors':ANCH},indent=1))

dbg=out.copy(); dr=ImageDraw.Draw(dbg)
for k,(fx,fy) in ANCH.items():
    X,Y=fx*FW,(1-fy)*FH
    col=(0,180,0) if 'edge' in k or 'corner' in k else (230,120,0)
    dr.line([(X-36,Y),(X+36,Y)],fill=col,width=7)
    dr.line([(X,Y-36),(X,Y+36)],fill=col,width=7)
dbg.resize((1800,round(FH*1800/FW))).save('fig4-debug2.png')
