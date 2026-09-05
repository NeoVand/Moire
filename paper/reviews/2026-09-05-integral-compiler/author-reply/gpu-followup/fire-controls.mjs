// Fixed-budget CPU comparison on the original fire-with-bumps shader.
// Optional --budget=750 --reference=500000 --scale=1 --out=NEW_FILE.jsonl.
// Source samples are iid Gaussian. Pilot and final samples are independent.
import assert from 'node:assert/strict';
import {writeFileSync, readFileSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
const options=Object.fromEntries(process.argv.slice(2).map(x=>{
  assert(x.startsWith('--') && x.includes('='),'Use --name=value');const at=x.indexOf('=');return[x.slice(2,at),x.slice(at+1)];
}));
const budget=+(options.budget??750), NR=+(options.reference??500000), scale=+(options.scale??1), NP=4096;
assert(budget>=100&&budget<=10000&&Number.isInteger(NR)&&NR>=10000&&Number.isFinite(scale)&&scale>0);
for(const key of Object.keys(options))assert(['budget','reference','scale','out'].includes(key),`Unknown option ${key}`);
assert(!process.env.MOIRE_REPO,'This frozen probe uses its local repo for source and provenance; unset MOIRE_REPO.');
process.env.STEIN_LIB='1';process.env.FJET_BUMPSCALE=String(scale);
const {YB,J,Jet,SIG,TAU,points}=await import('../../stein-control-probe/stein-phase-probe.mjs');
assert(SIG===.5,'This frozen probe requires sigma=0.5; unset FJET_SIG. Its control support must avoid the perspective pole.');
const cs=YB.CASES.find(c=>c.name==='fireBumps');assert(cs);
const here=fileURLToPath(new URL('.',import.meta.url));
const output=options.out??join(here,'runs',`fire-controls-${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}.jsonl`);
const repo=fileURLToPath(new URL('../../../../../',import.meta.url));
const rows=[];const emit=r=>{rows.push(r);console.log(JSON.stringify(r));};
let lastSin, modulation, palette;
const lift=x=>x instanceof Jet?x:Jet.c(x);
const O={...J,
 sin:a=>{lastSin=lift(a);return J.sin(a);},
 sign:a=>{modulation=lastSin;return J.sign(a);},
 mod:(a,m)=>{palette??=lift(a).scale(TAU/m);return J.mod(a,m);},
};
function evaluate(x,y){lastSin=modulation=palette=undefined;const S=cs.eval(O,x,y,true)[0].v;assert(modulation&&palette);return{S,phases:[palette,modulation]};}
const rawSource=(x,y)=>cs.eval(YB.NUM,x,y,false)[0];
function mask(q,multiplier=1){
 const s=Math.sin(multiplier*q.v),c=Math.cos(multiplier*q.v),delta=.15,d=s*s+delta*delta;
 const dv=2*s*delta*delta*multiplier*c/(d*d);
 return{v:s*s/d,gx:dv*q.gx,gy:dv*q.gy};
}
function controls(phases,zx,zy,K,masked){
 const d=4*K,h=new Float64Array(masked?2*d:d),r=Math.hypot(zx,zy);
 if(r>=5*SIG)return h;
 let w=1,wx=0,wy=0;
 if(r>4*SIG){const t=(r-4*SIG)/SIG,p=(-30*t*t+60*t**3-30*t**4)/SIG;w=1-10*t**3+15*t**4-6*t**5;wx=p*zx/r;wy=p*zy/r;}
 let offset=0;
 if(masked){
  const a=mask(phases[0],6),b=mask(phases[1]);
  const eta=a.v*b.v,ex=a.gx*b.v+a.v*b.gx,ey=a.gy*b.v+a.v*b.gy;
  wx=wx*eta+w*ex;wy=wy*eta+w*ey;w*=eta;
  // Branch restriction has no missing boundary flux: eta and its gradient
  // vanish at sin(modulation)=0. Palette mask also vanishes at all half-integers.
  offset=Math.sin(phases[1].v)>=0?0:d;
 }
 phases.forEach((q,j)=>{
  const g2=q.gx*q.gx+q.gy*q.gy,ghg=q.gx*q.gx*q.hxx+2*q.gx*q.gy*q.hxy+q.gy*q.gy*q.hyy;
  const tr=q.hxx+q.hyy,zg=zx*q.gx+zy*q.gy,dwg=wx*q.gx+wy*q.gy;
  const s=Math.sin(q.v),c=Math.cos(q.v);let sn=0,cn=1;
  for(let k=1;k<=K;k++){
   const ss=sn*c+cn*s,cc=cn*c-sn*s;sn=ss;cn=cc;
   const D=k*k*g2+1/(SIG*SIG),a=w*k*k*g2/D,b=w*(k*tr/D-2*k*k*k*ghg/(D*D))+k*(dwg-w*zg/(SIG*SIG))/D;
   h[offset+j*2*K+2*k-2]=a*cn+b*sn;h[offset+j*2*K+2*k-1]=a*sn-b*cn;
  }
 });return h;
}
function solve(G,b){
 const n=b.length,s=G.map((r,i)=>Math.sqrt(Math.max(0,r[i]))),L=Array.from({length:n},()=>new Float64Array(n));
 const ridge=1e-3;
 for(let i=0;i<n;i++)for(let j=0;j<=i;j++){
  let v=s[i]>1e-15&&s[j]>1e-15?G[i][j]/(s[i]*s[j]):0;if(i===j)v+=ridge;
  for(let k=0;k<j;k++)v-=L[i][k]*L[j][k];assert(Number.isFinite(v));
  if(i===j){assert(v>0,'Pilot Gram failed positive-definiteness');L[i][j]=Math.sqrt(v);}else L[i][j]=v/L[j][j];
 }
 const t=new Float64Array(n),z=new Float64Array(n);
 for(let i=0;i<n;i++){let v=s[i]>1e-15?b[i]/s[i]:0;for(let k=0;k<i;k++)v-=L[i][k]*t[k];t[i]=v/L[i][i];}
 for(let i=n-1;i>=0;i--){let v=t[i];for(let k=i+1;k<n;k++)v-=L[k][i]*z[k];z[i]=v/L[i][i];}
 return z.map((v,i)=>s[i]>1e-15?v/s[i]:0);
}
function pilot(x,y,K,masked,seed){
 const t=performance.now(),p=points(NP,seed),d=(masked?8:4)*K;
 const hm=new Float64Array(d),b=new Float64Array(d),G=Array.from({length:d},()=>new Float64Array(d));let sm=0;
 for(let i=0;i<p.length;i+=2){const {S,phases}=evaluate(x+p[i],y+p[i+1]),h=controls(phases,p[i],p[i+1],K,masked);sm+=S;
 for(let a=0;a<d;a++){hm[a]+=h[a];b[a]+=S*h[a];for(let c=0;c<=a;c++)G[a][c]+=h[a]*h[c];}}
 for(let a=0;a<d;a++){b[a]=b[a]/NP-sm*hm[a]/(NP*NP);for(let c=0;c<=a;c++)G[c][a]=G[a][c]=G[a][c]/NP-hm[a]*hm[c]/(NP*NP);}
 const beta=solve(G,b);return{beta,ms:performance.now()-t};
}
function estimate(x,y,N,seed,K=0,masked=false,beta=[]){
 const t=performance.now(),p=points(N,seed);let s=0,ss=0,raw=0,raw2=0,dm=0,dd=0;
 for(let i=0;i<p.length;i+=2){let S,v;
 if(K){const e=evaluate(x+p[i],y+p[i+1]);S=e.S;const h=controls(e.phases,p[i],p[i+1],K,masked);v=S;for(let j=0;j<h.length;j++)v-=beta[j]*h[j];}
 else S=v=rawSource(x+p[i],y+p[i+1]);
 s+=v;ss+=v*v;raw+=S;raw2+=S*S;const delta=S-v;dm+=delta;dd+=delta*delta;
 }
 const mean=s/N,variance=Math.max(0,ss/N-mean*mean),deltaMean=dm/N,deltaVar=Math.max(0,dd/N-deltaMean*deltaMean);
 return{N,mean,variance,meanSE:Math.sqrt(variance/N),rawMean:raw/N,rawVariance:Math.max(0,raw2/N-(raw/N)**2),correctionMean:deltaMean,correctionSE:Math.sqrt(deltaVar/N),ms:performance.now()-t};
}
if(!process.env.FIRE_CONTROLS_LIB){
const manifest={};for(const f of ['fjet.mjs','fjet-yb.mjs'])manifest[f]=createHash('sha256').update(readFileSync(join(repo,'paper/tools/exp',f))).digest('hex');
emit({kind:'protocol',case:'fireBumps',channel:0,amplitudeScale:scale,sigma:SIG,pixels:[[300,12],[400,60],[100,120]],seeds:[173,917],pilotSamples:NP,targetBudgetMs:budget,referenceSamples:NR,source:manifest,
 note:'CPU iid Gaussian fixed sample counts chosen by independent calibration. Final costs include RNG, per-sample source/derivatives, controls, pilot and fit. Module load/JIT warmup and benchmark calibration excluded. Cost mismatch reported; normalized efficiency is estimated, not a timed image or 10^7-reference accuracy result.',maskedField:'chi * eta(sin(6*palettePhase)) * eta(sin(modulationPhase)); two modulation branches; eta(r)=r²/(r²+.15²), full derivative included; palettePhase=2pi*base/6'});
// Exact-source and phase-derivative gates at fresh sample positions.
let maxSourceError=0,maxRelativeGradientError=0;
for(const [x,y]of[[300,12],[400,60],[100,120]]){
 const p=points(40,8291);for(let i=0;i<p.length;i+=2){const xx=x+p[i],yy=y+p[i+1],e=evaluate(xx,yy);maxSourceError=Math.max(maxSourceError,Math.abs(e.S-rawSource(xx,yy)));
 const h=1e-5,px=evaluate(xx+h,yy).phases,mx=evaluate(xx-h,yy).phases,py=evaluate(xx,yy+h).phases,my=evaluate(xx,yy-h).phases;
 e.phases.forEach((q,j)=>{for(const [g,fd]of[[q.gx,(px[j].v-mx[j].v)/(2*h)],[q.gy,(py[j].v-my[j].v)/(2*h)]])maxRelativeGradientError=Math.max(maxRelativeGradientError,Math.abs(g-fd)/(1+Math.abs(g)));});
 }}
assert(maxSourceError<1e-9);assert(maxRelativeGradientError<1e-3);
emit({kind:'extraction_gates',maxSourceError,maxRelativeGradientError});
for(const [x,y]of[[300,12],[400,60],[100,120]]){
 const reference=estimate(x,y,NR,73013);emit({kind:'reference',pixel:[x,y],...reference});
 // Warm all branches without training on either final or pilot samples.
 for(const masked of[false,true])estimate(x,y,3000,67231,16,masked,new Float64Array(masked?128:64));
 const rawCal=[estimate(x,y,12000,90210),estimate(x,y,12000,90211)].reduce((s,r)=>s+r.ms/r.N,0)/2;
 const rawN=Math.min(3000000,Math.max(5000,Math.floor(budget/rawCal)));
 for(const seed of[173,917]){
  const raw=estimate(x,y,rawN,seed);emit({kind:'plain',pixel:[x,y],seed,...raw,referenceZ:(raw.mean-reference.mean)/Math.hypot(raw.meanSE,reference.meanSE)});
  for(const [K,masked]of[[1,false],[4,false],[8,false],[16,false],[16,true]]){
   const fit=pilot(x,y,K,masked,seed+1000);
   const cal=[estimate(x,y,4000,56013,K,masked,fit.beta),estimate(x,y,4000,56014,K,masked,fit.beta)].reduce((s,r)=>s+r.ms/r.N,0)/2;
   const N=Math.min(1000000,Math.max(5000,Math.floor(Math.max(0,budget-fit.ms)/cal)));
   const cv=estimate(x,y,N,seed,K,masked,fit.beta),totalMs=cv.ms+fit.ms;
   emit({kind:'controlled',pixel:[x,y],seed,K,masked,dimensions:fit.beta.length,beta:[...fit.beta],pilotMs:fit.ms,final:cv,totalMs,
    budgetFeasible:fit.ms<budget&&totalMs<=1.2*budget,costMatchToPlain:totalMs/raw.ms,
    perSampleVarianceGain:cv.rawVariance/cv.variance,estimatedEqualCostGain:(raw.variance*raw.ms/raw.N)/(cv.variance*totalMs/N),
    fixedBudgetVarianceRatio:(raw.variance/raw.N)/(cv.variance/N),referenceZ:(cv.mean-reference.mean)/Math.hypot(cv.meanSE,reference.meanSE),
    correctionMeanZ:cv.correctionSE?cv.correctionMean/cv.correctionSE:0});
  }
 }
}
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,rows.map(x=>JSON.stringify(x)).join('\n')+'\n',{flag:'wx'});console.log(JSON.stringify({output,rows:rows.length}));
}
export {evaluate,rawSource,controls,SIG,points};
