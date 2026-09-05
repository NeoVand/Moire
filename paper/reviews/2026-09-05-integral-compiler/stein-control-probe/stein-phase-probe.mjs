// Read-only probe of smooth phase features extracted from Moire shader source.
// Run: node stein-phase-probe.mjs [samples=100000] [reference=500000]
process.env.FJET_LIB = '1';
import { performance } from 'node:perf_hooks';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const ROOT = pathToFileURL(resolve(process.env.MOIRE_REPO || fileURLToPath(new URL('../../../../', import.meta.url)),'paper/tools/exp')+'/').href;
const { Jet } = await import(ROOT + 'fjet.mjs');
const YB = await import(ROOT + 'fjet-yb.mjs');
const SIG = YB.SIG, TAU = 2 * Math.PI;
const N = Number(process.argv[2] || 100000), NR = Number(process.argv[3] || 500000), NP = 10000;
const lift = x => x instanceof Jet ? x : Jet.c(x), val = x => x instanceof Jet ? x.v : x;
const J = {
 add:(a,b)=>lift(a).add(lift(b)), sub:(a,b)=>lift(a).sub(lift(b)), mul:(a,b)=>lift(a).mul(lift(b)), div:(a,b)=>lift(a).div(lift(b)), neg:a=>lift(a).neg(), scale:(a,s)=>lift(a).scale(s),
 sin:a=>lift(a).sin(), cos:a=>lift(a).cos(), exp:a=>lift(a).exp(), sqrt:a=>lift(a).sqrt(), pow:(a,n)=>lift(a).pow(n),
 fract:a=>{a=lift(a);return a.unary(a.v-Math.floor(a.v),1,0);}, floor:a=>Jet.c(Math.floor(val(a))), mod:(a,m)=>{a=lift(a);return a.unary((a.v%m+m)%m,1,0);},
 step:a=>Jet.c(val(a)>=0?1:0), relu:a=>val(a)>0?lift(a):Jet.c(0), sign:a=>Jet.c(Math.sign(val(a))), abs:a=>val(a)>=0?lift(a):lift(a).neg(),
 ge:(a,b)=>Jet.c(val(a)>=val(b)?1:0), gt:(a,b)=>Jet.c(val(a)>val(b)?1:0), max:(a,b)=>val(a)>=val(b)?lift(a):lift(b), min:(a,b)=>val(a)<=val(b)?lift(a):lift(b),
 select:(c,a,b)=>val(c)?lift(a):lift(b), eq:(a,b)=>Jet.c(Math.abs(val(a)-val(b))<1e-9?1:0), const:Jet.c,
 dot:(u,v)=>u.reduce((s,x,i)=>s.add(lift(x).mul(lift(v[i]))),Jet.c(0)),
 cross:(a,b)=>[J.sub(J.mul(a[1],b[2]),J.mul(a[2],b[1])),J.sub(J.mul(a[2],b[0]),J.mul(a[0],b[2])),J.sub(J.mul(a[0],b[1]),J.mul(a[1],b[0]))],
 normalize:v=>{const n=J.dot(v,v).sqrt();return v.map(x=>lift(x).div(n));}
};
function extract(cs, backend, jets) {
 let phase;
 const isZigzag=cs.name==='zigzag';
 const O={...backend};
 // Zigzag's actual smooth palette feature is cos(sinArg/2).
 // For quadratic shaders use the first Fourier feature cos(2*pi*arg),
 // where arg is the source expression immediately before fract.
 const op=isZigzag?'cos':'fract';
 O[op]=a=>{phase=jets?lift(a).scale(isZigzag?1:TAU):a*(isZigzag?1:TAU);return backend[op](a);};
 return (x,y)=>{phase=undefined;cs.eval(O,x,y,jets);if(phase===undefined)throw Error('phase not found');return phase;};
}
function rng(seed){return()=>{seed|=0;seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function pair(r){const a=SIG*Math.sqrt(-2*Math.log(1-r())),b=TAU*r();return[a*Math.cos(b),a*Math.sin(b)];}
function points(n,seed){const p=new Float64Array(2*n),r=rng(seed);for(let i=0;i<n;i++){const[x,y]=pair(r);p[2*i]=x;p[2*i+1]=y;}return p;}
function control(q,zx,zy){
 // F = chi(z) grad(theta)/(abs(grad(theta))^2+lambda) sin(theta).
 // chi is C2, equals one within 4 sigma and zero outside 5 sigma.
 // All benchmark pixels are >5 sigma from the perspective horizon.
 const r=Math.hypot(zx,zy),r0=4*SIG,r1=5*SIG;
 if(r>=r1)return 0;
 let chi=1,chiPrime=0;
 if(r>r0){const t=(r-r0)/(r1-r0);chi=1-10*t**3+15*t**4-6*t**5;chiPrime=(-30*t*t+60*t**3-30*t**4)/(r1-r0);}
 const gx=q.gx,gy=q.gy,g2=gx*gx+gy*gy,D=g2+1/(SIG*SIG),
   ghg=gx*gx*q.hxx+2*gx*gy*q.hxy+gy*gy*q.hyy,
   radial=r?chiPrime*(zx*gx+zy*gy)/(r*D):0,
   div=chi*((q.hxx+q.hyy)/D-2*ghg/(D*D))+radial,
   score=chi*(zx*gx+zy*gy)/(SIG*SIG*D);
 return chi*g2/D*Math.cos(q.v)+(div-score)*Math.sin(q.v);
}
function moments(sums,n){const[s,ss,h,hh,sh]=sums;return{mean:s/n,var:ss/n-(s/n)**2,hmean:h/n,hvar:hh/n-(h/n)**2,cov:sh/n-(s/n)*(h/n)};}
function accumulate(phase,x,y,p){let s=0,ss=0,h=0,hh=0,sh=0;const t=performance.now();for(let i=0;i<p.length;i+=2){const q=phase(x+p[i],y+p[i+1]),a=Math.cos(q.v),b=control(q,p[i],p[i+1]);s+=a;ss+=a*a;h+=b;hh+=b*b;sh+=a*b;}return{...moments([s,ss,h,hh,sh],p.length/2),ms:performance.now()-t};}
function numeric(phase,x,y,p){let s=0,ss=0;const t=performance.now();for(let i=0;i<p.length;i+=2){const a=Math.cos(phase(x+p[i],y+p[i+1]));s+=a;ss+=a*a;}const n=p.length/2;return{mean:s/n,var:ss/n-(s/n)**2,ms:performance.now()-t};}
if (!process.env.STEIN_LIB) {
console.log(JSON.stringify({kind:'protocol',sigma:SIG,pilot:NP,estimation:N,reference:NR,lambda:1/(SIG*SIG),cutoffSigma:[4,5],note:'Smooth extracted phases only; timings include full source evaluation, exclude RNG; no transform setup; beta fitted on independent pilot.'}));
for(const name of ['zigzag','sinQuadratic','sinQuadraticRipples']){
 const cs=YB.CASES.find(c=>c.name===name),num=extract(cs,YB.NUM,false),jet=extract(cs,J,true);
 for(const[x,y]of[[300,12],[240,34],[300,120]]){
  if(y+1<=5*SIG)throw Error('cutoff touches horizon');
  const centre=jet(x,y),hv=1e-5,fd=[(num(x+hv,y)-num(x-hv,y))/(2*hv),(num(x,y+hv)-num(x,y-hv))/(2*hv)];
  const ref=numeric(num,x,y,points(NR,73013));
  const runs=[];
  for(const seed of [173,917]){
   const pilot=accumulate(jet,x,y,points(NP,seed+1000));
   const beta=pilot.hvar>1e-20?pilot.cov/pilot.hvar:0;
   const p=points(N,seed),raw=numeric(num,x,y,p),m=accumulate(jet,x,y,p);
   const cvmean=m.mean-beta*m.hmean,cvvar=Math.max(0,m.var+beta*beta*m.hvar-2*beta*m.cov),
    gain=raw.var/cvvar,cost=(m.ms+pilot.ms)/raw.ms,
    agreementZ=(cvmean-ref.mean)/Math.sqrt(cvvar/N+ref.var/NR);
   runs.push({seed,beta,rawMean:raw.mean,cvMean:cvmean,rawVar:raw.var,cvVar:cvvar,varianceGain:gain,rawMs:raw.ms,cvMs:m.ms,pilotMs:pilot.ms,totalCostRatio:cost,equalTimeGain:gain/cost,controlMeanZ:m.hmean/Math.sqrt(m.hvar/N),agreementWithReferenceZ:agreementZ,fixedBeta1Gain:raw.var/(m.var+m.hvar-2*m.cov)});
  }
  console.log(JSON.stringify({kind:'result',name,pixel:[x,y],centrePhase:centre.v,grad:[centre.gx,centre.gy],fd,reference:ref,runs}));
 }
}
}
export {Jet,YB,J,SIG,TAU,points,control,extract};
