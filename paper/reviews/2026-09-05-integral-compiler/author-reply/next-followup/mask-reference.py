"""Independent reference in the ORIGINAL x/y frame, not the mask eigenframe.

Requires mpmath==1.3.0. Exact binary64 input coefficients; conditional complex-erf
moments and split tanh-sinh outer integration at 40/55 decimal digits.
Always writes a fresh --out path, leaving the input/author files untouched.
"""
import argparse,json,math
from pathlib import Path
import mpmath as mp

parser=argparse.ArgumentParser()
parser.add_argument('--input',required=True,type=Path)
parser.add_argument('--out',required=True,type=Path)
args=parser.parse_args()
if args.out.exists(): raise SystemExit('Refusing to overwrite '+str(args.out))
data=json.loads(args.input.read_text())
keys=['v','gx','gy','hxx','hxy','hyy']


def white(q,s):
    q={k:mp.mpf(float(q[k])) for k in keys}
    return {k:v*(s if k in ['gx','gy'] else s*s if k.startswith('h') else 1) for k,v in q.items()}


def conditional_reference(row,dps):
    with mp.workdps(dps):
        s=mp.mpf(float(row['sigma']))
        X,A,P=[white(row[k],s) for k in ['mask','amplitude','phase']]
        L=mp.mpf(12)
        qa=X['hxy']**2-X['hyy']*X['hxx']
        qb=2*(X['gy']*X['hxy']-X['hyy']*X['gx'])
        qc=X['gy']**2-2*X['hyy']*X['v']
        cuts=[-L,L]
        if qa:
            disc=qb*qb-4*qa*qc
            if disc>=0:
                for root in [(-qb-mp.sqrt(disc))/(2*qa),(-qb+mp.sqrt(disc))/(2*qa)]:
                    if -L<root<L: cuts.append(root)
        elif qb:
            root=-qc/qb
            if -L<root<L: cuts.append(root)
        cuts.sort()
        def inner(x):
            k=X['v']+X['gx']*x+X['hxx']*x*x/2
            b=X['gy']+X['hxy']*x
            h=X['hyy']
            intervals=[]
            if h==0:
                if b==0:
                    if k>0: intervals=[(-mp.inf,mp.inf)]
                elif b>0: intervals=[(-k/b,mp.inf)]
                else: intervals=[(-mp.inf,-k/b)]
            else:
                disc=b*b-2*h*k
                if disc<0:
                    if h>0: intervals=[(-mp.inf,mp.inf)]
                else:
                    lo,hi=sorted([(-b-mp.sqrt(disc))/h,(-b+mp.sqrt(disc))/h])
                    intervals=[(-mp.inf,lo),(hi,mp.inf)] if h>0 else [(lo,hi)]
            beta=P['gy']+P['hxy']*x
            D=1-1j*P['hyy'];root=mp.sqrt(D)
            def erf_at(t): return mp.sign(t) if mp.isinf(t) else mp.erf((root*t-1j*beta/root)/mp.sqrt(2))
            def f(t): return mp.mpc(0) if mp.isinf(t) else mp.exp(-D*t*t/2+1j*beta*t)/mp.sqrt(2*mp.pi)
            value=mp.mpc(0)
            for lo,hi in intervals:
                m0=mp.exp(-beta*beta/(2*D))*(erf_at(hi)-erf_at(lo))/(2*root)
                m1=(1j*beta*m0-f(hi)+f(lo))/D
                boundary=(0 if mp.isinf(hi) else hi*f(hi))-(0 if mp.isinf(lo) else lo*f(lo))
                m2=(m0+1j*beta*m1-boundary)/D
                value+=(A['v']+A['gx']*x+A['hxx']*x*x/2)*m0+(A['gy']+A['hxy']*x)*m1+A['hyy']*m2/2
            return value*mp.exp(1j*(P['v']+P['gx']*x+P['hxx']*x*x/2))*mp.exp(-x*x/2)/mp.sqrt(2*mp.pi)
        value=mp.quadts(inner,cuts)
        # Absolute outer |x|>12 tail: bound the polynomial amplitude, integrate y.
        phi=mp.exp(-L*L/2)/mp.sqrt(2*mp.pi)
        T0=2*phi/L;T1=2*phi;T2=2*(L+1/L)*phi
        tail=(abs(A['v'])+abs(A['gy'])*mp.sqrt(2/mp.pi)+abs(A['hyy'])/2)*T0
        tail+=(abs(A['gx'])+abs(A['hxy'])*mp.sqrt(2/mp.pi))*T1+abs(A['hxx'])*T2/2
        return value,tail


def full_transform(row,t):
    A,P,M=[{k:mp.mpf(float(row['compiled'][name][k])) for k in keys} for name in ['amplitude','phase','mask']]
    R=mp.matrix([[P['hxx']+t*M['hxx'],P['hxy']+t*M['hxy']],[P['hxy']+t*M['hxy'],P['hyy']+t*M['hyy']]])
    b=mp.matrix([P['gx']+t*M['gx'],P['gy']+t*M['gy']])
    D=mp.eye(2)-1j*R;V=D**-1;mu=1j*V*b
    coeff=A['v']+A['gx']*mu[0]+A['gy']*mu[1]+A['hxx']*(V[0,0]+mu[0]**2)/2+A['hxy']*(V[0,1]+mu[0]*mu[1])+A['hyy']*(V[1,1]+mu[1]**2)/2
    return coeff*mp.exp(1j*(P['v']+t*M['v'])-(b.T*V*b)[0]/2)/mp.sqrt(mp.det(D))


reports=[]
for row in data['rows']:
    print('Reference:',row['name'],flush=True)
    low,_=conditional_reference(row,40)
    high,tail=conditional_reference(row,55)
    with mp.workdps(75):
        agreement=abs(high-low)
        assert agreement<mp.mpf('1e-18'),agreement
        f_errors=[]
        for sample in row['compiled']['samples']:
            expected=full_transform(row,mp.mpf(sample['t']))
            actual=mp.mpc(*sample['F'])
            f_errors.append(abs(expected-actual))
        g0=mp.diff(lambda t:full_transform(row,t),0)/(1j*mp.pi)
        zero_error=abs(g0-mp.mpc(*row['compiled']['atZero']))
        assert max(f_errors+[zero_error])<mp.mpf('1e-13')
        runs=[]
        for run in row['runs']:
            discrepancy=abs(mp.mpc(*run['value'])-high)
            assert discrepancy<=mp.mpf(float(run['estimatedError']))+agreement+tail,(row['name'],run['T'],discrepancy,run['estimatedError'])
            runs.append({'T':run['T'],'absoluteError':float(discrepancy),'tailBound':run['tailBound'],'ms':run['ms']})
        reports.append({'name':row['name'],'reference':[mp.nstr(high.real,50),mp.nstr(high.imag,50)],'precisionAgreement':float(agreement),'outerTailBound':float(tail),
            'maximumFullTransformError':float(max(f_errors)),'removableLimitError':float(zero_error),
            'nestedAdapterError':float(abs(mp.mpc(row['nested']['re'],row['nested']['im'])-high)),'runs':runs})
report={'input':args.input.name,'method':'mpmath1.3.0; original-frame conditional complex erf; split tanh-sinh40/55digits, cutoff12sigma; transform/limit checked75digits','rows':reports}
with args.out.open('x') as f: json.dump(report,f,indent=2);f.write('\n')
print(json.dumps(report,indent=2))
