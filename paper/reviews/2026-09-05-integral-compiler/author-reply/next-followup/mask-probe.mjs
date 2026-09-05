import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {compileMaskTerm,invertMask,quadratic as Q} from './mask-inversion.mjs';
import {loadMaskAdapter} from './mask-adapter.mjs';
import {gaussianChirpMoments} from '../gaussian-chirp.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const outIndex=process.argv.indexOf('--out');
const out=outIndex<0?path.join(here,`mask-results-${new Date().toISOString().replaceAll(':','-')}.json`):path.resolve(process.argv[outIndex+1]);
if(fs.existsSync(out)) throw new Error(`Refusing to overwrite ${out}`);
const source=loadMaskAdapter();
const rows=[];
for(const row of source.cases) {
  const term=compileMaskTerm(row),runs=[];
  for(const T of [64,256,1024,4096]) {
    const start=performance.now();const result=invertMask(term,{T,absTol:1e-6});
    runs.push({...result,ms:performance.now()-start,nestedDifference:Math.hypot(result.value[0]-row.nested.re,result.value[1]-row.nested.im)});
  }
  // Fixed finite endpoint, halved panels: isolates the finite integration from
  // a separate question about convergence of the omitted infinite tail.
  const refined=invertMask(term,{T:1024,absTol:1e-6,panelWidth:2});
  assert.ok(Math.hypot(refined.value[0]-runs[2].value[0],refined.value[1]-runs[2].value[1])<1e-12);
  const Ts=row.name.startsWith('ridge')?128:4096;
  for(let k=0;k<2;k++) invertMask(term,{T:Ts});
  const times=[];
  for(let k=0;k<5;k++){const start=performance.now();invertMask(term,{T:Ts});times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);
  rows.push({...row,compiled:{mask:term.mask,phase:term.phase,amplitude:term.amplitude,normalization:term.normalization,
    classification:term.classification,kappa:term.kappa,smallestCurvature:term.smallestCurvature,atZero:term.atZero,
    samples:[-100,-10,-1,0,1,10,100].map(t=>({t,F:term.F(t)}))},runs,
    finiteRefinementDifference:Math.hypot(refined.value[0]-runs[2].value[0],refined.value[1]-runs[2].value[1]),
    timing:{T:Ts,repeats:5,warmups:2,medianMs:times[2],minMs:times[0],maxMs:times[4]}});
}
const analyticCases=[
  {name:'radial outside',mask:Q(-1,0,0,2,0,2),expected:[Math.exp(-0.5),0]},
  {name:'radial inside',mask:Q(1,0,0,-2,0,-2),expected:[1-Math.exp(-0.5),0]},
  {name:'radial weighted',mask:Q(-1,0,0,2,0,2),amplitude:Q(0,0,0,2,0,2),expected:[3*Math.exp(-0.5),0]},
  {name:'symmetric saddle kappa zero',mask:Q(0,0,0,2,0,-2),expected:[0.5,0]},
  {name:'rank one',mask:Q(-1,0,0,2,0,0),expected:[0.3173105078629141,0]},
  {name:'linear halfspace',mask:Q(-0.5,1),expected:[0.3085375387259869,0]},
  {name:'linear through zero',mask:Q(0,1),expected:[0.5,0]},
  {name:'positive constant',mask:Q(1),expected:[1,0]},
  {name:'negative constant',mask:Q(-1),expected:[0,0]},
  {name:'identically zero strict',mask:Q(),expected:[0,0]},
  {name:'identically zero inclusive',mask:Q(),zeroWeight:1,expected:[1,0]},
  {name:'identically zero symmetric',mask:Q(),zeroWeight:0.5,expected:[0.5,0]},
  {name:'positive definite touches zero',mask:Q(0,0,0,2,0,2),expected:[1,0]},
  {name:'negative definite touches zero',mask:Q(0,0,0,-2,0,-2),expected:[0,0]},
];
const cmul=(a,b)=>[a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]];
const cadd=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const cscale=(a,s)=>a.map(x=>x*s);
const my=gaussianChirpMoments({beta:-0.7,q:0.8}).moments;
for(const kind of ['linear','rank one']) {
  let mx=gaussianChirpMoments({a:kind==='linear'?0.5:1,beta:1.3,q:0.4}).moments;
  if(kind==='rank one') {
    const left=gaussianChirpMoments({b:-1,beta:1.3,q:0.4}).moments;
    mx=mx.map((z,j)=>cadd(z,left[j]));
  }
  const expected=cmul([Math.cos(0.2),Math.sin(0.2)],cadd(cmul(cadd(mx[0],cscale(mx[1],0.2)),my[0]),cadd(cscale(cmul(mx[1],my[1]),0.1),cscale(cmul(mx[0],my[2]),0.3))));
  analyticCases.push({name:`${kind} mixed complex phase and amplitude`,mask:kind==='linear'?Q(-0.5,1):Q(-1,0,0,2),
    amplitude:Q(1,0.2,0,0,0.1,0.6),phase:Q(0.2,1.3,-0.7,0.4,0,0.8),expected});
}
const analytic=analyticCases.map(cs=>{
  const term=compileMaskTerm(cs),result=invertMask(term,{T:1024});
  const discrepancy=Math.hypot(result.value[0]-cs.expected[0],result.value[1]-cs.expected[1]);
  assert.ok(discrepancy<=result.tailBound+result.quadratureEstimate+1e-12,cs.name);
  return {...cs,classification:term.classification,result,discrepancy};
});
// A zero-critical-value saddle has slow absolute tail bounds even when symmetry
// makes this particular integral trivial. Rank-one with null drift is not given
// a bound we have not derived.
const unsupported=compileMaskTerm({mask:Q(-1,0,0.2,2,0,0)});
assert.equal(unsupported.tail(1024).bound,Infinity);
const unsupportedRun=invertMask(unsupported,{T:64});
assert.equal(unsupportedRun.toleranceMetByEstimate,false);
assert.throws(()=>invertMask(compileMaskTerm(source.cases[0]),{maxEvaluations:10}));
assert.throws(()=>compileMaskTerm({mask:Q(0,1e-300),sigma:1e-100}));
const conjugateCounters=[];
for(const cs of source.cases) {
  const plain=compileMaskTerm(cs);
  const pos=plain.F(1),neg=plain.F(-1);
  const mismatch=Math.hypot(neg[0]-pos[0],neg[1]+pos[1]);
  assert.ok(mismatch>1e-3,'complex weighted F(-t) is not conjugate F(t)');
  conjugateCounters.push({name:cs.name,t:1,Fplus:pos,Fminus:neg,wrongConjugateDifference:mismatch});
  const scaled=compileMaskTerm({...cs,mask:Object.fromEntries(Object.entries(cs.mask).map(([k,v])=>[k,v*1e-12]))});
  for(const t of [0,1e-8,0.1,3]) {
    const a=plain.integrand(t),b=scaled.integrand(t);
    assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-12,'positive scaling');
    const neg=plain.integrand(-t);assert.ok(Math.hypot(a[0]-neg[0],a[1]-neg[1])<1e-14,'even inversion integrand');
  }
}
const report={createdAt:new Date().toISOString(),sourceSha256:source.sourceSha256,
  moduleSha256:createHash('sha256').update(fs.readFileSync(path.join(here,'mask-inversion.mjs'))).digest('hex'),
  node:process.version,cpu:os.cpus()[0].model,rows,analytic,conjugateCounters,unsupportedRankNullDrift:unsupportedRun,
  caveat:'Analytic tail formulas evaluated in binary64; quadrature and roundoff allowances remain estimates. GPU throughput is not inferred from these CPU timings.'};
fs.writeFileSync(out,JSON.stringify(report,(_,v)=>v===Infinity?'Infinity':v,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({out,rows:rows.map(r=>({name:r.name,nested:r.nested,final:r.runs.at(-1),timing:r.timing})),analytic:analytic.map(r=>({name:r.name,discrepancy:r.discrepancy,tailBound:r.result.tailBound}))},null,2));
