"""Independent mpmath references on a dense/adversarial FLOAT32 input grid.

Requires mpmath 1.3.0. --out chooses a fresh directory; default timestamped.
Output refs are binary64 values at EXACT binary32 inputs, J_0 through J_42.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import random
import struct
import time
import mpmath as mp

here=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--out',type=Path)
parser.add_argument('--step',type=float,default=.02)
args=parser.parse_args()
out=args.out or here/('bessel-reference-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
out.mkdir(parents=True,exist_ok=True)
if any(out.glob('bessel-*')): raise SystemExit('Choose a fresh output directory.')
start=time.perf_counter()
mp.mp.dps=70
cases={}

def f32(x): return struct.unpack('<f',struct.pack('<f',float(x)))[0]
def bits(x): return struct.unpack('<I',struct.pack('<f',float(x)))[0]
def unbits(x): return struct.unpack('<f',struct.pack('<I',x))[0]
def add(x,tag):
    x=f32(x)
    if math.isfinite(x) and abs(x)<=40:
        key=bits(x)
        if key not in cases: cases[key]={'x':x,'tags':[]}
        if tag not in cases[key]['tags']: cases[key]['tags'].append(tag)
def near(x,tag):
    x=f32(x); b=bits(x)
    for delta in [-2,-1,0,1,2]:
        if b+delta>=0: add(unbits(b+delta),tag)

for i in range(math.ceil(40/args.step)+1): add(min(i*args.step,40),'dense')
for n in range(1,41):
    for d in [-1,-.01,0,.01,1]: near(n+d,'turning/segment')
for x in [0,.25,40]: near(x,'branch/endpoints')
for exponent in range(-149,0): add(2.0**exponent,'small/powers-of-two')
zero_count=0
for n in [0,1,2,8,16,24,32]:
    k=1
    while True:
        z=mp.besseljzero(n,k)
        if z>40: break
        near(z,'Bessel-zero'); zero_count+=1;k+=1
random.seed(19710926)
for _ in range(384): add(40*random.random(),'random')
# Signed inputs, including negative zero and tiny values, exercise argument parity.
positive=list(cases.values())
for i,c in enumerate(positive):
    if i%5==0 or any(t in c['tags'] for t in ['Bessel-zero','branch/endpoints','small/powers-of-two']):
        add(-c['x'],'negative-parity')
ordered=sorted(cases.values(),key=lambda c:c['x'])
data=bytearray()
max_precision_difference=mp.mpf(0)
for i,c in enumerate(ordered):
    x=mp.mpf(c['x'])
    values=[mp.besselj(n,x) for n in range(43)]
    if i%97==0:
        with mp.workdps(100):
            for n in [0,1,16,32,40,42]:
                max_precision_difference=max(max_precision_difference,abs(values[n]-mp.besselj(n,x)))
    for v in values: data.extend(struct.pack('<d',float(v)))
    if i%1000==0: print(f'{i}/{len(ordered)}',flush=True)
assert max_precision_difference<mp.mpf('1e-60')
(out/'bessel-reference.f64').write_bytes(data)
(out/'bessel-cases.json').write_text(json.dumps(ordered,separators=(',',':'))+'\n')
meta={'count':len(ordered),'orders':[0,42],'step':args.step,'rootCount':zero_count,
      'generator':'mpmath '+mp.__version__+' direct besselj at70dps; sampled100dps check',
      'inputContract':'Exact binary32 input promoted exactly to mpmath; references rounded to binary64.',
      'sha256':hashlib.sha256(data).hexdigest(),'maxPrecisionDifference':str(max_precision_difference),
      'seconds':time.perf_counter()-start,'createdUTC':datetime.now(timezone.utc).isoformat()}
(out/'bessel-reference-meta.json').write_text(json.dumps(meta,indent=2)+'\n')
print(json.dumps(meta,indent=2));print(out)
