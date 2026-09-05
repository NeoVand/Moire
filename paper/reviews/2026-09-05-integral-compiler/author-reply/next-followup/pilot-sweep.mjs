// Fire-with-bumps pilot pricing, preserving the previous frozen construction.
// node pilot-sweep.mjs [--seeds=8] [--holdout=65536] [--out=NEW.jsonl]
// All timings are CPU timings. Heldout samples never fit/select a coefficient.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import os from 'node:os';

const here=fileURLToPath(new URL('.',import.meta.url));
const repo=fileURLToPath(new URL('../../../../../',import.meta.url));
const options=Object.fromEntries(process.argv.slice(2).map(x=>{
  assert(x.startsWith('--')&&x.includes('='),'Use --name=value');const p=x.indexOf('=');return[x.slice(2,p),x.slice(p+1)];
}));
for(const key of Object.keys(options))assert(['seeds','holdout','out'].includes(key),'Unknown option '+key);
const seedCount=+(options.seeds??8),NH=+(options.holdout??65536),NB=8;
assert(Number.isInteger(seedCount)&&seedCount>=2&&seedCount<=32);
assert(Number.isInteger(NH)&&NH>=8192&&NH%NB===0);
const path=options.out??join(here,`pilot-results-${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}.jsonl`);
const sourceFiles=['paper/tools/exp/fjet.mjs','paper/tools/exp/fjet-yb.mjs',
  'paper/reviews/2026-09-05-integral-compiler/stein-control-probe/stein-phase-probe.mjs',
  'paper/reviews/2026-09-05-integral-compiler/author-reply/gpu-followup/fire-controls.mjs'];
const hashes=()=>Object.fromEntries(sourceFiles.map(f=>[f,createHash('sha256').update(readFileSync(join(repo,f))).digest('hex')]));
const source=hashes();
// The imported module has its own CLI parser. Keep our CLI out of that parser,
// invoke its library guard, then restore argv. No old files are edited.
const argv=process.argv;
process.argv=argv.slice(0,2);process.env.FIRE_CONTROLS_LIB='1';
const {evaluate,rawSource,controls,SIG,points}=await import('../gpu-followup/fire-controls.mjs');
process.argv=argv;
assert(SIG===.5);
const NPS=[32,64,128,256,512,1024,4096];
const ARMS=[{K:1,masked:false},{K:4,masked:false},{K:8,masked:false},{K:16,masked:false},{K:16,masked:true}].map(a=>({...a,d:(a.masked?8:4)*a.K,name:a.masked?'masked16':`K${a.K}`}));
const PIXELS=[[300,12],[400,60],[100,120]];
const SEEDS=Array.from({length:seedCount},(_,i)=>710173+104729*i);
const now=()=>performance.now();
const median=a=>{const b=a.slice().sort((x,y)=>x-y),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2;};
const quantile=(a,p)=>{const b=a.slice().sort((x,y)=>x-y),x=(b.length-1)*p,i=Math.floor(x);return b[i]+(b[Math.min(i+1,b.length-1)]-b[i])*(x-i);};
const distribution=a=>({min:Math.min(...a),p10:quantile(a,.1),median:median(a),p90:quantile(a,.9),max:Math.max(...a)});
const rows=[];function emit(r){rows.push(r);}
let checksum=0;

function newMoments(d){return {n:0,s:0,ss:0,hm:new Float64Array(d),b:new Float64Array(d),G:new Float64Array(d*d),d};}
function accumulate(m,S,h){
  m.n++;m.s+=S;m.ss+=S*S;
  const d=m.d;
  for(let a=0;a<d;a++){
    const v=h[a];if(v===0)continue;
    m.hm[a]+=v;m.b[a]+=S*v;const offset=a*d;
    for(let c=0;c<=a;c++)if(h[c]!==0)m.G[offset+c]+=v*h[c];
  }
}
function mergeMoments(ms){
  const out=newMoments(ms[0].d);
  for(const m of ms){out.n+=m.n;out.s+=m.s;out.ss+=m.ss;
    for(let i=0;i<out.d;i++){out.hm[i]+=m.hm[i];out.b[i]+=m.b[i];}
    for(let i=0;i<out.G.length;i++)out.G[i]+=m.G[i];}
  return out;
}
function covariance(m){
  const {n,d}=m,mean=m.s/n;
  const b=Float64Array.from(m.b,(v,i)=>v/n-mean*m.hm[i]/n),G=Array.from({length:d},()=>new Float64Array(d));
  for(let a=0;a<d;a++)for(let c=0;c<=a;c++)G[a][c]=G[c][a]=m.G[a*d+c]/n-(m.hm[a]/n)*(m.hm[c]/n);
  return {b,G,sourceMean:mean,sourceVariance:Math.max(0,m.ss/n-mean*mean),controlMean:Float64Array.from(m.hm,v=>v/n)};
}

// Numerical policy copied from gpu-followup/fire-controls.mjs solve():
// standardize each covariance diagonal, ridge=0.001, Cholesky, unscale.
// Added diagnostics/decline status; no change to the finite fit when it succeeds.
function solve(G,b){
  const d=b.length,s=G.map((r,i)=>Math.sqrt(Math.max(0,r[i]))),L=Array.from({length:d},()=>new Float64Array(d));
  const ridge=.001;let minimumCholeskyDiagonal=Infinity;
  for(let i=0;i<d;i++)for(let j=0;j<=i;j++){
    let v=s[i]>1e-15&&s[j]>1e-15?G[i][j]/(s[i]*s[j]):0;if(i===j)v+=ridge;
    for(let k=0;k<j;k++)v-=L[i][k]*L[j][k];
    if(!Number.isFinite(v)||(i===j&&v<=0))return {beta:new Float64Array(d),declined:'nonfinite or nonpositive Cholesky pivot'};
    if(i===j){L[i][j]=Math.sqrt(v);minimumCholeskyDiagonal=Math.min(minimumCholeskyDiagonal,L[i][j]);}else L[i][j]=v/L[j][j];
  }
  const t=new Float64Array(d),z=new Float64Array(d);
  for(let i=0;i<d;i++){let v=s[i]>1e-15?b[i]/s[i]:0;for(let k=0;k<i;k++)v-=L[i][k]*t[k];t[i]=v/L[i][i];}
  for(let i=d-1;i>=0;i--){let v=t[i];for(let k=i+1;k<d;k++)v-=L[k][i]*z[k];z[i]=v/L[i][i];}
  const beta=z.map((v,i)=>s[i]>1e-15?v/s[i]:0);
  if(!beta.every(Number.isFinite))return {beta:new Float64Array(d),declined:'nonfinite coefficients'};
  return {beta,declined:null,activeDimensions:s.filter(x=>x>1e-15).length,minimumCholeskyDiagonal,
    standardizedCoefficientNorm:Math.hypot(...z),maxAbsCoefficient:Math.max(...beta.map(Math.abs))};
}
function residual(moment,beta){
  let bh=0,bs=0,hh=0;const d=moment.d,N=moment.n;
  for(let i=0;i<d;i++){
    bh+=beta[i]*moment.hm[i];bs+=beta[i]*moment.b[i];
    hh+=beta[i]*beta[i]*moment.G[i*d+i];
    for(let j=0;j<i;j++)hh+=2*beta[i]*beta[j]*moment.G[i*d+j];
  }
  const sourceMean=moment.s/N,mean=(moment.s-bh)/N;
  const variance=(moment.ss-2*bs+hh)/N-mean*mean;
  const correctionMean=bh/N,correctionVariance=hh/N-correctionMean*correctionMean;
  assert(Number.isFinite(variance)&&variance>-1e-8,'Invalid heldout variance');
  return {mean,variance:Math.max(0,variance),sourceVariance:Math.max(0,moment.ss/N-sourceMean**2),correctionMean,
    correctionMeanSE:Math.sqrt(Math.max(0,correctionVariance)/N)};
}
function heldout(x,y,seed){
  const ps=points(NH,seed),perBatch=NH/NB,sets=ARMS.map(a=>Array.from({length:NB},()=>newMoments(a.d)));
  let sourceError=0;
  for(let i=0;i<NH;i++){
    const zx=ps[2*i],zy=ps[2*i+1],e=evaluate(x+zx,y+zy);
    if(i<48)sourceError=Math.max(sourceError,Math.abs(e.S-rawSource(x+zx,y+zy)));
    const large=controls(e.phases,zx,zy,16,false),mask=controls(e.phases,zx,zy,16,true);
    ARMS.forEach((a,at)=>{
      const h=a.masked?mask:a.K===16?large:Float64Array.from({length:a.d},(_,j)=>large[j<2*a.K?j:32+j-2*a.K]);
      accumulate(sets[at][Math.floor(i/perBatch)],e.S,h);
    });
  }
  assert(sourceError<1e-9,'Imported exact source no longer agrees with numeric source');
  return {sourceError,sets:sets.map(batches=>({batches,total:mergeMoments(batches)}))};
}
function pilot(x,y,NP,arm,seed){
  const times={},overall=now();let t=now();const p=points(NP,seed);times.rngMs=now()-t;
  const samples=new Array(NP);t=now();
  for(let i=0;i<NP;i++)samples[i]=evaluate(x+p[2*i],y+p[2*i+1]);
  times.sourceAndDerivativesMs=now()-t;
  const hs=new Array(NP);t=now();
  for(let i=0;i<NP;i++)hs[i]=controls(samples[i].phases,p[2*i],p[2*i+1],arm.K,arm.masked);
  times.controlsMs=now()-t;
  const moment=newMoments(arm.d);t=now();
  for(let i=0;i<NP;i++)accumulate(moment,samples[i].S,hs[i]);
  const cov=covariance(moment);times.gramMs=now()-t;
  t=now();const fit=solve(cov.G,cov.b);times.solveMs=now()-t;
  const measuredStages=Object.values(times).reduce((s,v)=>s+v,0);
  times.totalMs=now()-overall;
  times.allocationAndBookkeepingMs=Math.max(0,times.totalMs-measuredStages);
  const train=residual(moment,fit.beta);
  checksum+=fit.beta[0]??0;
  return {fit,times,train,rankUpperBound:Math.min(NP-1,fit.activeDimensions??0)};
}
function sampleCost(x,y,arm,seed,N=4096){
  let t=now();const p=points(N,seed);const rngMs=now()-t;
  let sourceMs=0,evaluationMs=0,controlsMs=0,dotMs=0;
  if(!arm){t=now();for(let i=0;i<N;i++)checksum+=rawSource(x+p[2*i],y+p[2*i+1]);sourceMs=now()-t;}
  else{
    const es=new Array(N),hs=new Array(N),beta=Float64Array.from({length:arm.d},(_,i)=>Math.sin(i+1));
    t=now();for(let i=0;i<N;i++)es[i]=evaluate(x+p[2*i],y+p[2*i+1]);evaluationMs=now()-t;
    t=now();for(let i=0;i<N;i++)hs[i]=controls(es[i].phases,p[2*i],p[2*i+1],arm.K,arm.masked);controlsMs=now()-t;
    t=now();for(let i=0;i<N;i++){let v=es[i].S;for(let j=0;j<arm.d;j++)v-=hs[i][j]*beta[j];checksum+=v;}dotMs=now()-t;
  }
  // Price final estimation with its streaming loop, separately from the staged
  // pass above used to attribute evaluation/feature/dot costs.
  let streamingMs=sourceMs;
  if(arm){
    const beta=Float64Array.from({length:arm.d},(_,i)=>Math.sin(i+1));t=now();
    for(let i=0;i<N;i++){
      const e=evaluate(x+p[2*i],y+p[2*i+1]),h=controls(e.phases,p[2*i],p[2*i+1],arm.K,arm.masked);
      let v=e.S;for(let j=0;j<arm.d;j++)v-=h[j]*beta[j];checksum+=v;
    }
    streamingMs=now()-t;
  }
  return {N,rngMs,sourceMs,sourceAndDerivativesMs:evaluationMs,controlsMs,dotMs,streamingMs,
    stagedTotalMs:rngMs+sourceMs+evaluationMs+controlsMs+dotMs,totalMs:rngMs+streamingMs};
}
function timingSummary(records){return Object.fromEntries(Object.keys(records[0]).filter(k=>k!=='N').map(k=>[k,distribution(records.map(r=>r[k]))]));}
function budgetGain(B,T,c0,c1,v0,vr){
  const rawN=Math.floor(B/c0),controlledN=Math.floor(Math.max(0,B-T)/c1);
  return {rawN,controlledN,gain:rawN>0&&controlledN>0&&vr>0?(v0/rawN)/(vr/controlledN):null};
}
const start=now();
emit({kind:'protocol',case:'fireBumps',channel:0,amplitude:1,sigma:SIG,pixels:PIXELS,pilotSamples:NPS,arms:ARMS,pilotSeeds:SEEDS,
  heldoutSamples:NH,heldoutBatches:NB,heldoutSeedBase:940001,calibrationSeeds:[840011,840012,840013,840014,840015],
  source,codeSHA256:createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,
  method:'Same-point pilot covariance with sample centering and standardized ridge. Heldout moments are disjoint iid samples. Nested NP pilot prefixes and shared heldout samples make cross-arm/NP estimates paired, not independent.',
  timing:'Warm CPU stage timings, including RNG/source derivatives/controls/Gram/solve. Model budget uses separate warm final-sample cost and fixed integer sample counts. No GPU/frame benchmark.',
  caution:'Reported heldout best choice is an oracle diagnostic, not an implemented selector. Every-arm search setup costs are also reported; heldout data never chooses a delivered estimator.'});
for(let pi=0;pi<PIXELS.length;pi++){
  const [x,y]=PIXELS[pi];console.log(`Pixel ${x},${y}: warmup and heldout`);
  // Warm imported source/feature branches and each covariance/solve dimension.
  for(const arm of ARMS){sampleCost(x,y,arm,830001,1536);pilot(x,y,128,arm,830002);pilot(x,y,512,arm,830003);}
  sampleCost(x,y,null,830004,8192);
  const hold=heldout(x,y,940001+pi*8191);
  const rawMoment=hold.sets[0].total,rawMean=rawMoment.s/NH,rawVariance=rawMoment.ss/NH-rawMean**2;
  emit({kind:'heldout',pixel:[x,y],N:NH,sourceMaxError:hold.sourceError,sourceMean:rawMean,sourceVariance:rawVariance,sourceMeanSE:Math.sqrt(rawVariance/NH)});
  const cost={};
  for(const arm of [null,...ARMS]){
    const name=arm?.name??'plain',records=Array.from({length:5},(_,i)=>sampleCost(x,y,arm,840011+i));
    cost[name]=median(records.map(r=>r.totalMs/r.N));
    emit({kind:'sample_cost',pixel:[x,y],arm:name,millisecondsPerSample:cost[name],stageMilliseconds:timingSummary(records),records});
  }
  const fitRows=[];
  // Alternate arm order each replicate to reduce monotonic JIT/thermal bias.
  for(let si=0;si<SEEDS.length;si++)for(const NP of (si%2?NPS.slice().reverse():NPS))for(const arm of (si%2?ARMS.slice().reverse():ARMS)){
    const a=ARMS.indexOf(arm),r=pilot(x,y,NP,arm,SEEDS[si]),test=residual(hold.sets[a].total,r.fit.beta);
    const bv=hold.sets[a].batches.map(b=>residual(b,r.fit.beta).variance),avg=bv.reduce((s,v)=>s+v,0)/NB;
    const varianceSE=Math.sqrt(bv.reduce((s,v)=>s+(v-avg)**2,0)/(NB*(NB-1)));
    const asymptoticGain=rawVariance/test.variance*cost.plain/cost[arm.name];
    const breakeven=asymptoticGain>1?r.times.totalMs/(1-1/asymptoticGain):null;
    const record={kind:'fit',pixel:[x,y],NP,seed:SEEDS[si],arm:arm.name,K:arm.K,masked:arm.masked,dimensions:arm.d,
      times:r.times,fit:{...r.fit,beta:[...r.fit.beta]},rankUpperBound:r.rankUpperBound,
      trainingSourceVariance:r.train.sourceVariance,trainingVariance:r.train.variance,trainingGain:r.train.sourceVariance/Math.max(1e-30,r.train.variance),
      heldout:{...test,varianceSE,varianceBatchValues:bv,meanSE:Math.sqrt(test.variance/NH),
        varianceGain:rawVariance/test.variance,trainToHeldoutVariance:test.variance/Math.max(1e-30,r.train.variance)},
      asymptoticEqualCostGain:asymptoticGain,breakevenBudgetMs:breakeven,
      budgets:Object.fromEntries([.001,.01,.1,1,10,100,750].map(B=>[B,{
        ...budgetGain(B,r.times.totalMs,cost.plain,cost[arm.name],rawVariance,test.variance),
        trainingPredictedGain:budgetGain(B,r.times.totalMs,cost.plain,cost[arm.name],r.train.sourceVariance,r.train.variance).gain,
      }]))};
    fitRows.push(record);emit(record);
  }
  for(const NP of NPS){
    const current=fitRows.filter(r=>r.NP===NP);
    const searchMs=SEEDS.map(seed=>current.filter(r=>r.seed===seed).reduce((s,r)=>s+r.times.totalMs,0));
    emit({kind:'all_arm_setup',pixel:[x,y],NP,naiveIndependentFiveFitMs:distribution(searchMs),
      note:'Actual measured sum of five separately constructed fits; a shared-feature/Gram selector could reduce this but is not implemented or timed here.'});
    for(const arm of ARMS){
      const set=current.filter(r=>r.arm===arm.name),stages=Object.keys(set[0].times);
      emit({kind:'summary',pixel:[x,y],NP,arm:arm.name,dimensions:arm.d,replicates:set.length,
        times:Object.fromEntries(stages.map(k=>[k,distribution(set.map(r=>r.times[k]))])),
        heldoutVarianceGain:distribution(set.map(r=>r.heldout.varianceGain)),
        heldoutToTrainVariance:distribution(set.map(r=>r.heldout.trainToHeldoutVariance)),
        asymptoticEqualCostGain:distribution(set.map(r=>r.asymptoticEqualCostGain)),
        lossesAfterSampleCost:set.filter(r=>r.asymptoticEqualCostGain<=1).length,
        declinedFits:set.filter(r=>r.fit.declined).length,
        breakevenBudgetMs:set.some(r=>r.breakevenBudgetMs!==null)?distribution(set.map(r=>r.breakevenBudgetMs).filter(v=>v!==null)):null,
        budgets:Object.fromEntries([.001,.01,.1,1,10,100,750].map(B=>{
          const good=set.map(r=>r.budgets[B].gain).filter(v=>v!==null);
          return[B,{feasible:good.length,wins:good.filter(v=>v>1).length,
            trainingPredictedWins:set.filter(r=>r.budgets[B].trainingPredictedGain>1).length,
            falseTrainingWins:set.filter(r=>r.budgets[B].trainingPredictedGain>1&&r.budgets[B].gain!==null&&r.budgets[B].gain<=1).length,
            gain:good.length?distribution(good):null}];
        }))});
    }
    // A deliberately naive selector diagnostic: train all five independent
    // fits, select by training residual price, then inspect heldout loss.
    // The selection uses no heldout quantities; the latter only audits it.
    for(const B of [1,10,100,750]){
      const decisions=[];
      for(const seed of SEEDS){
        const candidates=current.filter(r=>r.seed===seed),T=candidates.reduce((s,r)=>s+r.times.totalMs,0),remaining=B-T,rawN=Math.floor(B/cost.plain);
        if(remaining<=0||rawN===0){decisions.push({seed,feasible:false,setupMs:T});continue;}
        let choice='plain',remainingN=Math.floor(remaining/cost.plain),best=candidates[0].trainingSourceVariance/Math.max(1,remainingN),actualVariance=rawVariance;
        for(const r of candidates){const n=Math.floor(remaining/cost[r.arm]);if(n>0&&r.trainingVariance/n<best){best=r.trainingVariance/n;choice=r.arm;remainingN=n;actualVariance=r.heldout.variance;}}
        decisions.push({seed,feasible:remainingN>0,setupMs:T,choice,finalSamples:remainingN,
          heldoutEqualBudgetGain:remainingN>0?(rawVariance/rawN)/(actualVariance/remainingN):null});
      }
      const feasible=decisions.filter(r=>r.feasible);
      emit({kind:'naive_selector_diagnostic',pixel:[x,y],NP,budgetMs:B,
        setup:'sum of measured five independent fits; no feature reuse; pilot values not reused in final estimate',
        criterion:'minimum training residual variance divided by affordable final sample count; explicit plain candidate after paid setup',
        feasible:feasible.length,wins:feasible.filter(r=>r.heldoutEqualBudgetGain>1).length,
        gain:feasible.length?distribution(feasible.map(r=>r.heldoutEqualBudgetGain)):null,decisions});
    }
  }
  console.log(`Pixel ${x},${y}: ${fitRows.length} fits complete`);
}
emit({kind:'frame_budget_arithmetic',width:1920,height:1080,fps:60,frameMs:1000/60,
  allocations:[1,.01,.001,.0001].map(f=>({fallbackFraction:f,expectedFallbackPixels:1920*1080*f,budgetMsPerFallbackPixel:(1000/60)/(1920*1080*f)})),
  note:'Entire frame budget allocated to fallback, already optimistic. These CPU numbers cannot be transferred to a GPU; no sharing/amortization assumed.'});
emit({kind:'complete',seconds:(now()-start)/1000,rows:rows.length+1,finiteChecksum:Number.isFinite(checksum),sourceAtEnd:hashes(),sourceChangedDuringRun:JSON.stringify(source)!==JSON.stringify(hashes())});
assert(Number.isFinite(checksum));mkdirSync(dirname(path),{recursive:true});writeFileSync(path,rows.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx'});
console.log(JSON.stringify({output:path,rows:rows.length,seconds:(now()-start)/1000}));
