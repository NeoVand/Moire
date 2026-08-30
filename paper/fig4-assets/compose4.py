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

BG=(244,242,238); INK=(21,24,28)

# ---- row 1: union crop, as before
a=Image.open('fig4-panelA.png').convert('RGB'); b=Image.open('fig4-panelB.png').convert('RGB')
def maskim(im):
    arr=np.asarray(im).astype(int)
    return (np.abs(arr-np.array(BG)).sum(axis=2)>18)
m=maskim(a)|maskim(b); ys,xs=np.where(m); pad=70
x0,x1=max(0,xs.min()-pad),min(W,xs.max()+pad); y0,y1=max(0,ys.min()-pad),min(H,ys.max()+pad)
ca=a.crop((x0,y0,x1,y1)); cb=b.crop((x0,y0,x1,y1))
PW,PH=ca.size

# ---- row 2: exact ortho crop of the flat renders
FW2,FH2=3750,2400; hh2=0.70; hw2=hh2*FW2/FH2; ppw=FW2/(2*hw2)
BANDY=0.58
def flatcrop(name):
    im=Image.open(name).convert('RGB')
    X0=round((-1+hw2)*ppw); X1=round((1+hw2)*ppw)
    Y0=round((hh2-BANDY)*ppw); Y1=round((hh2+BANDY)*ppw)
    c=im.crop((X0,Y0,X1,Y1))
    sc=PW/c.size[0]
    c=c.resize((PW, round(c.size[1]*sc)), Image.LANCZOS)
    d=ImageDraw.Draw(c)
    bw=6
    d.rectangle([0,0,c.size[0]-1,c.size[1]-1], outline=INK, width=bw)
    return c
fa=flatcrop('flatA.png'); fb=flatcrop('flatB.png')

# ---- compose
gut=110; padT=210; rowgap=110; padB=55
FW=PW*2+gut
FH=padT+PH+rowgap+fa.size[1]+padB
out=Image.new('RGB',(FW,FH),BG)
out.paste(ca,(0,padT)); out.paste(cb,(PW+gut,padT))
out.paste(fa,(0,padT+PH+rowgap)); out.paste(fb,(PW+gut,padT+PH+rowgap))
out.save('fig4-final4.png')

def frac(panel_idx,p):
    X,Y=px(p)
    X-=x0; Y-=y0
    Y+=padT
    if panel_idx==1: X+=PW+gut
    return (round(X/FW,4), round(1-Y/FH,4))

def remap(fx,fy):
    # old row1-relative fraction (canvas 4238x1694) -> new canvas
    X=fx*(PW*2+110); Y=(1-fy)*PH
    return (round(X/FW,4), round(1-(padT+Y)/FH,4))

ANCH={
 # leader targets kept from the approved layout, remapped
 'cl_tgt': remap(0.352,0.705),
 'wl_tgt': remap(0.276,0.640),
 'rl_tgt': remap(0.272,0.145),
 'pl_tgt': remap(0.752,0.498),
 # new outline targets: on the sheet boundary curves
 'gl_edge_a': frac(0, surf('difference',-0.50,1.0)),
 'gl_edge_b': frac(0, surf('difference',-0.25,1.0)),
 'gl_edge_c': frac(0, surf('difference',-0.75,1.0)),
 'sl_edge_a': frac(1, surf('sum',1.0,0.30)),
 'sl_edge_b': frac(1, surf('sum',1.0,0.05)),
 'sl_edge_c': frac(1, surf('sum',1.0,0.55)),
 # old label positions remapped for reference
 'gl_old': remap(0.012,0.83),
 'cl_old': remap(0.418,0.885),
 'wl_old': remap(0.285,0.955),
 'rl_old': remap(0.055,0.065),
 'sl_old': remap(0.995,0.85),
 'pl_old': remap(0.552,0.935),
}
info={'size':[FW,FH],'row1_y':[padT,padT+PH],'row2_y':[padT+PH+rowgap,padT+PH+rowgap+fa.size[1]],
      'anchors':ANCH}
print(json.dumps(info,indent=1))

dbg=out.copy(); dr=ImageDraw.Draw(dbg)
for k,(fx,fy) in ANCH.items():
    X,Y=fx*FW,(1-fy)*FH
    col=(0,180,0) if 'edge' in k else (230,120,0)
    dr.line([(X-36,Y),(X+36,Y)],fill=col,width=7)
    dr.line([(X,Y-36),(X,Y+36)],fill=col,width=7)
dbg.resize((1800,round(FH*1800/FW))).save('fig4-debug4.png')
