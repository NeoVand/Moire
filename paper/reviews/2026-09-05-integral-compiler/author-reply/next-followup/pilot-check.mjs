// Independent checks of the recorded pilot fit, feature slicing, and residuals.
// Reconstruct samples and test the ridge normal equations without rerunning the
// benchmark's covariance builder or Cholesky solver. No timing claims here.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const here=fileURLToPath(new URL('.',import.meta.url));
const repo=fileURLToPath(new URL('../../../../../',import.meta.url));
const opts=Object.fromEntries(process.argv.slice(2).map(a=>{
  const at=a.indexOf('=');assert(a.startsWith('--')&&at>2,'Use --name=value');return[a.slice(2,at),a.slice(at+1)];
}));
for(const k of Object.keys(opts))assert(['results','out'].includes(k));
const input=opts.results??join(here,'pilot-results-2026-09-05T16-50-24.702Z-967bf3a4.jsonl');
const output=opts.out??join(here,`pilot-check-results-${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}.json`);
const inputBytes=readFileSync(input),rows=inputBytes.toString().trim().split('\n').map(JSON.parse),protocol=rows[0];
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const [name,sha]of Object.entries(protocol.source))assert.equal(hash(readFileSync(join(repo,name))),sha,'Source changed: '+name);
assert.equal(hash(readFileSync(join(here,'pilot-sweep.mjs'))),protocol.codeSHA256);
const argv=process.argv;process.argv=argv.slice(0,2);process.env.FIRE_CONTROLS_LIB='1';
const {evaluate,controls,points}=await import('../gpu-followup/fire-controls.mjs');process.argv=argv;
const selected=rows.filter(r=>r.kind==='fit'&&[32,128,4096].includes(r.NP)&&protocol.pilotSeeds.slice(0,2).includes(r.seed));
let maxFeatureSliceError=0,maxVarianceError=0,maxNormalEquationError=0;
const results=[];
for(const r of selected){
  const p=points(r.NP,r.seed),d=r.dimensions,beta=r.fit.beta,ss=[],hs=[];
  let meanS=0,meanR=0,sumR2=0;const mh=new Float64Array(d),h2=new Float64Array(d),hR=new Float64Array(d);
  for(let i=0;i<r.NP;i++){
    const zx=p[2*i],zy=p[2*i+1],e=evaluate(r.pixel[0]+zx,r.pixel[1]+zy),h=controls(e.phases,zx,zy,r.K,r.masked);
    if(!r.masked&&r.K<16&&i<32){
      const full=controls(e.phases,zx,zy,16,false);
      for(let j=0;j<d;j++)maxFeatureSliceError=Math.max(maxFeatureSliceError,Math.abs(h[j]-full[j<2*r.K?j:32+j-2*r.K]));
    }
    let residual=e.S;for(let j=0;j<d;j++)residual-=h[j]*beta[j];
    meanS+=e.S;meanR+=residual;sumR2+=residual*residual;
    for(let j=0;j<d;j++){mh[j]+=h[j];h2[j]+=h[j]*h[j];hR[j]+=h[j]*residual;}
    ss.push(e.S);hs.push(h);
  }
  meanS/=r.NP;meanR/=r.NP;
  const variance=sumR2/r.NP-meanR*meanR;
  let sourceVariance=0;for(const s of ss)sourceVariance+=(s-meanS)**2;sourceVariance/=r.NP;
  let normalEquationError=0;
  for(let j=0;j<d;j++){
    const vh=Math.max(0,h2[j]/r.NP-(mh[j]/r.NP)**2),covHR=hR[j]/r.NP-(mh[j]/r.NP)*meanR;
    const rhs=.001*vh*beta[j];
    // The standardized active system should satisfy Cov(h,R)=ridge*Var(h)*β.
    if(Math.sqrt(vh)>1e-15)normalEquationError=Math.max(normalEquationError,Math.abs(covHR-rhs)/Math.max(1e-14,Math.sqrt(vh*sourceVariance)));
  }
  const varianceError=Math.abs(variance-r.trainingVariance);
  assert(varianceError<1e-8,'Direct residual variance mismatch');
  assert(normalEquationError<1e-8,'Saved coefficients fail ridge normal equations');
  maxVarianceError=Math.max(maxVarianceError,varianceError);maxNormalEquationError=Math.max(maxNormalEquationError,normalEquationError);
  results.push({pixel:r.pixel,arm:r.arm,NP:r.NP,seed:r.seed,varianceError,normalEquationError});
}
assert.equal(selected.length,90);assert.equal(maxFeatureSliceError,0);
const result={dateUTC:new Date().toISOString(),input,inputSHA256:hash(inputBytes),checks:selected.length,
  maxFeatureSliceError,maxVarianceError,maxNormalEquationError,
  meaning:'Reconstruction tests heldout feature-index slicing and the 90 saved pilot solutions against direct residual variance and standardized ridge normal equations. It does not certify sampling error, GPU speed, or the zero-mean identity of the previously validated control construction.',results};
writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,checks:selected.length,maxFeatureSliceError,maxVarianceError,maxNormalEquationError}));
