// Full original shader stays numeric; only the controls are smooth.
// Run: MOIRE_REPO=/path/to/Moire node stein-full-shader-probe.mjs
process.env.STEIN_LIB='1';
import {performance} from 'node:perf_hooks';
const {YB,J,Jet,SIG,TAU,points}=await import('./stein-phase-probe.mjs');
const N=100000,NP=10000,NR=500000,x=300,y=12;
const cs=YB.CASES.find(c=>c.name==='sinQuadratic');
let phase;
const O={...J,fract:a=>{phase=(a instanceof Jet?a:Jet.c(a)).scale(TAU);return J.fract(a);}};
function evaluate(xx,yy){const S=cs.eval(O,xx,yy,true)[0].v;return {S,q:phase};}
function controls(q,zx,zy,K){
 const out=new Float64Array(2*K),r=Math.hypot(zx,zy),r0=4*SIG,r1=5*SIG;
 if(r>=r1)return out;
 let chi=1,cp=0;
 if(r>r0){const t=(r-r0)/(r1-r0);chi=1-10*t**3+15*t**4-6*t**5;cp=(-30*t*t+60*t**3-30*t**4)/(r1-r0);}
 const g2=q.gx*q.gx+q.gy*q.gy,ghg=q.gx*q.gx*q.hxx+2*q.gx*q.gy*q.hxy+q.gy*q.gy*q.hyy,
 tr=q.hxx+q.hyy,zg=zx*q.gx+zy*q.gy,rad=r?cp*zg/r:0,score=chi*zg/(SIG*SIG);
 const s1=Math.sin(q.v),c1=Math.cos(q.v);let sn=0,cn=1;
 for(let k=1;k<=K;k++){
  const ss=sn*c1+cn*s1,cc=cn*c1-sn*s1;sn=ss;cn=cc;
  const D=k*k*g2+1/(SIG*SIG),a=chi*k*k*g2/D,
   b=chi*(k*tr/D-2*k*k*k*ghg/(D*D))+k*(rad-score)/D;
  out[2*k-2]=a*cn+b*sn;
  out[2*k-1]=a*sn-b*cn;
 }
 return out;
}
function solve(A,b){const n=b.length,L=Array.from({length:n},()=>new Float64Array(n));const ridge=1e-9*A.reduce((s,row,i)=>s+row[i],0)/n;
 for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let v=A[i][j]+(i===j?ridge:0);for(let k=0;k<j;k++)v-=L[i][k]*L[j][k];L[i][j]=i===j?Math.sqrt(Math.max(v,1e-20)):v/L[j][j];}
 const t=new Float64Array(n),z=new Float64Array(n);for(let i=0;i<n;i++){let v=b[i];for(let j=0;j<i;j++)v-=L[i][j]*t[j];t[i]=v/L[i][i];}for(let i=n-1;i>=0;i--){let v=t[i];for(let j=i+1;j<n;j++)v-=L[j][i]*z[j];z[i]=v/L[i][i];}return z;
}
function pilot(p,K){const d=2*K,hm=new Float64Array(d),sh=new Float64Array(d),hh=Array.from({length:d},()=>new Float64Array(d));let s=0;const t=performance.now();
 for(let i=0;i<p.length;i+=2){const{S,q}=evaluate(x+p[i],y+p[i+1]),h=controls(q,p[i],p[i+1],K);s+=S;for(let a=0;a<d;a++){hm[a]+=h[a];sh[a]+=S*h[a];for(let b=0;b<=a;b++)hh[a][b]+=h[a]*h[b];}}
 const n=p.length/2;for(let a=0;a<d;a++){sh[a]=sh[a]/n-(s/n)*(hm[a]/n);for(let b=0;b<=a;b++)hh[b][a]=hh[a][b]=hh[a][b]/n-hm[a]*hm[b]/(n*n);}return{beta:solve(hh,sh),ms:performance.now()-t};
}
function numeric(p){let s=0,ss=0;const t=performance.now();for(let i=0;i<p.length;i+=2){const v=cs.eval(YB.NUM,x+p[i],y+p[i+1],false)[0];s+=v;ss+=v*v;}const n=p.length/2;return{mean:s/n,var:ss/n-(s/n)**2,ms:performance.now()-t};}
function estimate(p,K,beta){let s=0,ss=0,c=0,cc=0,dm=0,dd=0;const t=performance.now();for(let i=0;i<p.length;i+=2){const{S,q}=evaluate(x+p[i],y+p[i+1]),h=controls(q,p[i],p[i+1],K);let cv=S;for(let a=0;a<h.length;a++)cv-=beta[a]*h[a];const delta=S-cv;s+=S;ss+=S*S;c+=cv;cc+=cv*cv;dm+=delta;dd+=delta*delta;}const n=p.length/2;return{rawMean:s/n,rawVar:ss/n-(s/n)**2,mean:c/n,var:cc/n-(c/n)**2,deltaMean:dm/n,deltaVar:dd/n-(dm/n)**2,ms:performance.now()-t};}
const ref=numeric(points(NR,73013));
console.log(JSON.stringify({kind:'protocol',name:cs.name,pixel:[x,y],channel:0,pilot:NP,samples:N,referenceSamples:NR,sigma:SIG,cutoffSigma:[4,5],lambda:1/(SIG*SIG),note:'Full original shader first RGB. Smooth cosine AND sine Stein controls, independently fitted joint coefficients. Source value sampled exactly; no differentiation of hard shader used in controls.',reference:ref}));
for(const K of [1,4])for(const seed of [173,917]){
 const fit=pilot(points(NP,seed+1000),K),p=points(N,seed),raw=numeric(p),cv=estimate(p,K,fit.beta);
 const vg=raw.var/cv.var,cost=(cv.ms+fit.ms)/raw.ms;
 console.log(JSON.stringify({kind:'result',harmonics:K,controls:2*K,seed,beta:[...fit.beta],raw,controlled:cv,pilotMs:fit.ms,varianceGain:vg,totalCostRatio:cost,equalTimeGain:vg/cost,agreementReferenceZ:(cv.mean-ref.mean)/Math.sqrt(cv.var/N+ref.var/NR),meanCorrectionZ:cv.deltaMean/Math.sqrt(cv.deltaVar/N)}));
}
