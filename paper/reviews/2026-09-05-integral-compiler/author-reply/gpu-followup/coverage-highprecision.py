"""Validate a recorded real-GPU run at its EXACT packed float32 inputs.

Requires mpmath==1.3.0. No GPU or compiler changes. Output is always a new file:
  python coverage-highprecision.py --input coverage-results-....json --out new.json
"""
import argparse
import json
import math
from pathlib import Path
import mpmath as mp

parser=argparse.ArgumentParser()
parser.add_argument('--input',required=True,type=Path)
parser.add_argument('--out',required=True,type=Path)
args=parser.parse_args()
if args.out.exists():
    raise SystemExit('Refusing to overwrite '+str(args.out))
data=json.loads(args.input.read_text())


def parameters(row):
    c,h,B,Q,mode,tol,sign,_=map(lambda x:mp.mpf(float(x)),row['packed'])
    a,b=c-h,c+h
    if mode==1:
        a,b=-mp.inf,c
    elif mode==2:
        a,b=c,mp.inf
    elif mode==3:
        a,b=-mp.inf,mp.inf
    return a,b,B,Q,sign


def reference(row,dps):
    with mp.workdps(dps):
        a,b,B,Q,sign=parameters(row)
        if a==b:
            return [mp.mpc(0)]*3
        D=1-1j*Q
        root=mp.sqrt(D)
        def erf_at(t):
            return mp.sign(t) if mp.isinf(t) else mp.erf((root*t-1j*B/root)/mp.sqrt(2))
        def density(t):
            return mp.mpc(0) if mp.isinf(t) else mp.exp(-D*t*t/2+1j*B*t)/mp.sqrt(2*mp.pi)
        fa,fb=density(a),density(b)
        m0=mp.exp(-B*B/(2*D))*(erf_at(b)-erf_at(a))/(2*root)
        m1=(1j*B*m0-(fb-fa))/D
        endpoint=(0 if mp.isinf(b) else b*fb)-(0 if mp.isinf(a) else a*fa)
        m2=(m0+1j*B*m1-endpoint)/D
        return [sign*m for m in [m0,m1,m2]]


def quadrature(row):
    with mp.workdps(60):
        a,b,B,Q,sign=parameters(row)
        a,b=max(a,-mp.mpf(18)),min(b,mp.mpf(18))
        n=max(1,int(mp.ceil((b-a)*max(1,max(abs(B+Q*a),abs(B+Q*b))/8))))
        points=[a+(b-a)*k/n for k in range(n+1)]
        return [sign*mp.quadgl(lambda t:t**j*mp.exp(-t*t/2+1j*(B*t+Q*t*t/2))/mp.sqrt(2*mp.pi),points) for j in range(3)]


count=0
maximum=mp.mpf(0)
max_ratio=mp.mpf(0)
worst=None
quad_checks=[]
targets={'gaussian-finite','halfline-correlated','finite-chirp','far-tail','grid-0','grid-13','adapter-300'}
for row in data['cases']:
    if row['status'] not in [0,4]:
        continue
    ref80,ref100=reference(row,80),reference(row,100)
    with mp.workdps(100):
        precision_difference=max(abs(a-b) for a,b in zip(ref80,ref100))
        assert precision_difference<mp.mpf('1e-60'),(row['name'],precision_difference)
        for j,(expected,pair) in enumerate(zip(ref100,row['moments'])):
            actual=mp.mpc(*map(lambda x:mp.mpf(float(x)),pair))
            error=abs(actual-expected)
            estimate=mp.mpf(float(row['errors'][j]))
            assert error<=estimate+mp.mpf('1e-36'),(row['name'],j,error,estimate)
            if row['status']==0:
                assert error<=mp.mpf(float(row['packed'][5])),(row['name'],j,error)
            if error>maximum:
                maximum=error
                worst={'name':row['name'],'moment':j,'expected':[mp.nstr(expected.real,65),mp.nstr(expected.imag,65)],'actual':pair}
            if estimate>0:
                max_ratio=max(max_ratio,error/estimate)
            count+=1
    if row['name'] in targets:
        quad=quadrature(row)
        with mp.workdps(100):
            difference=max(abs(x-y) for x,y in zip(quad,ref100))
            assert difference<mp.mpf('1e-47'),(row['name'],difference)
            quad_checks.append({'name':row['name'],'absoluteDifference':mp.nstr(difference,8)})

report={'input':args.input.name,'method':'mpmath 1.3.0; exact packed binary32 inputs; complex erf/endpoint moments at 80/100 dps',
    'checkedMoments':count,'checkedCalls':count//3,'refusedWithoutValue':sum(row['status'] in [1,2] for row in data['cases']),
    'largestAbsoluteError':float(maximum),'largestErrorToReportedEstimate':float(max_ratio),'worst':worst,
    'independent60DigitGaussLegendreChecks':quad_checks,
    'scope':'Evidence for recorded calls on this GPU; not a uniform floating-point certificate.'}
with args.out.open('x') as f:
    json.dump(report,f,indent=2)
    f.write('\n')
print(json.dumps(report,indent=2))
