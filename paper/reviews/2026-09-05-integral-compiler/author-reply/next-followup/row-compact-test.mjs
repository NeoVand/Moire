// node --expose-gc row-compact-test.mjs [--out NEW_FILE.json]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {cpus} from 'node:os';
import {createHash} from 'node:crypto';
import {buildCompactRow} from './row-compact.mjs';
import {directMode,exactCirclesPanels,circleCoefficients,LIGHT} from './row-reference.mjs';
const clock=()=>performance.now(), distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]), median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const rotate=(a,p)=>[a[0]*Math.cos(p)-a[1]*Math.sin(p),a[0]*Math.sin(p)+a[1]*Math.cos(p)];
const began=new Date(), started=clock();
const previous=JSON.parse(readFileSync(new URL('../gpu-followup/row-results-2026-09-05T16-08-03-190Z.json',import.meta.url),'utf8'));
process.env.FJET_LIB='1';
const yb=await import('../../../../tools/exp/fjet-yb.mjs'),source=yb.CASES.find(c=>c.name==='circles');
assert.equal(yb.SIG,.5,'The primary source fixture uses sigma .5; unset FJET_SIG.');
let sourceValueChecks=0,maxSourceError=0;
for(const x of[0,30.25,120.7,240,300,479])for(const y of[-2,-.7,1,5,6.25]){
 const u=-2.5*(x-240)/(y+1),v=-600/(y+1),radius=Math.hypot(u-Math.floor(u)-.5,v-Math.floor(v)-.5);
 const want=LIGHT*(.5-.5*Math.sign(radius-5/12)),got=source.eval(yb.NUM,x,y,false)[0];
 maxSourceError=Math.max(maxSourceError,Math.abs(want-got));sourceValueChecks++;
}
assert(maxSourceError<1e-14);
function rng(seed){return()=>{seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const random=rng(551729), modeRecords=[];
const cold=buildCompactRow();
const warmSetup=[];
for(let i=0;i<3;i++){const r=buildCompactRow();warmSetup.push(r.protocol.setupMs);}
global.gc?.();global.gc?.();const memoryBefore=process.memoryUsage();
const row=buildCompactRow();
global.gc?.();global.gc?.();const memoryAfter=process.memoryUsage();
const memoryDelta=Object.fromEntries(Object.keys(memoryAfter).map(k=>[k,memoryAfter[k]-memoryBefore[k]]));
if(global.gc)assert.equal(memoryDelta.arrayBuffers,row.protocol.memory.retainedNumericBytes,'Retained ArrayBuffers differ from allocation accounting.');
const refined=buildCompactRow({quadratureRefinement:2}), tighter=buildCompactRow({absTol:1e-9});
const families=[{d0:6,sigma:.5,row},{d0:13,sigma:.5,row:buildCompactRow({d0:13})},{d0:6,sigma:.625,row:buildCompactRow({sigma:.625})}];
let maxConjugacyError=0,maxRefinement=0,maxTighterDifference=0;
for(const p of previous.modes){
 const got=row.query(p.ks,p.kt,p.x),error=distance(got,p.reference);
 assert(error<1e-8,JSON.stringify({previous:p,got,error}));
 modeRecords.push({kind:'previous mode',ks:p.ks,kt:p.kt,x:p.x,error});
}
for(const family of families){
 const {d0,sigma,row:table}=family;
 const cases=[];
 for(const m of table.protocol.metadata){
  const bound=m.dropped?0:m.cutoff;
  for(const f of m.dropped?[0,.1,51.566,5000]:[0,.137, .5*bound,.999999*bound,1.000001*bound,1.5*bound])cases.push([m.ks,f]);
  if(!m.dropped){
   for(let i=0;i<8;i++)cases.push([m.ks,random()*m.cutoff]);
   for(const j of [1,Math.floor(m.segments/2),m.segments-1])if(j>0&&j<m.segments)for(const q of[-1e-7,0,1e-7])cases.push([m.ks,(j+q)*m.width]);
  }
 }
 for(const [ks,f]of cases){
  const referenceA=directMode(ks,f,{d0,sigma},32768), reference=directMode(ks,f,{d0,sigma},65536);
  const got=table.queryFrequency(ks,f), error=distance(got,reference), convergence=distance(reference,referenceA);
  assert(convergence<3e-11,`Reference not converged ${d0},${sigma},${ks},${f}: ${convergence}`);
  assert(error<1e-8,`Compact mismatch ${d0},${sigma},${ks},${f}: ${error}`);
  const m=table.protocol.metadata[ks],reported=m.dropped?m.uniformModulusBound:f>=m.cutoff?m.omittedFrequencyBound:m.analyticQueryErrorBound;
  assert(error<=reported+2e-11,`Observed error exceeds analytic budget plus roundoff allowance: ${error} > ${reported}`);
  const negative=table.queryFrequency(-ks,-f),conjugacy=distance(negative,[got[0],-got[1]]);
  maxConjugacyError=Math.max(maxConjugacyError,conjugacy);assert(conjugacy<1e-15);
  if(d0===6&&sigma===.5){maxRefinement=Math.max(maxRefinement,distance(got,refined.queryFrequency(ks,f)));maxTighterDifference=Math.max(maxTighterDifference,distance(got,tighter.queryFrequency(ks,f)));}
  modeRecords.push({kind:'fresh depth reference',d0,sigma,ks,frequency:f,error,referenceConvergence:convergence,reportedAnalyticBudget:reported,zeroShortcut:m.dropped||f>=m.cutoff});
 }
}
// The Gaussian-in-W cutoff incorrectly discards this actual depth multiplier.
const frequency=324/(2*Math.PI),m=row.queryFrequency(0,frequency),depthWitness=rotate(m,-54);
const witnessRef=rotate(directMode(0,frequency),-54);
assert(distance(depthWitness,witnessRef)<1e-8);assert(Math.hypot(...depthWitness)>9e-4);
const witness={phase:'9W, W=36*(1/d-1/6)',frequency,compact:depthWitness,reference:witnessRef,actualModulus:Math.hypot(...witnessRef),incorrectGaussianModulus:Math.exp(-.5*.5**2*9**2),cut:1e-4};

const coefficients=[4,8,12].map(K=>circleCoefficients(K)),pixels=[];
function pixel(table,c,x){let s=c.area;for(const{ks,kt,c:coefficient}of c.list)s+=2*coefficient*table.query(ks,kt,x)[0];return LIGHT*s;}
for(const x of[0,30,30.137,120,120.317,239.75,240,240.001,300,479]){
 const a=exactCirclesPanels(x,32).value,b=exactCirclesPanels(x,64).value,values=coefficients.map(c=>pixel(row,c,x));
 const e=Math.abs(values[2]-b);assert(Math.abs(a-b)<2e-11);assert(e<2e-8);
 pixels.push({x,y:5,reference:b,referenceConvergence:Math.abs(a-b),cutoffs:[4,8,12],values,error:e,cutoffRefinement:Math.abs(values[2]-values[1])});
}

const refusals=[];
for(const [name,fn]of[['pole window',()=>buildCompactRow({d0:4})],['crossing pole',()=>buildCompactRow({d0:-1})],['unrepresentable sigma',()=>buildCompactRow({sigma:1e-300})],['bad harmonic',()=>row.queryFrequency(13,1)],['nonfinite frequency',()=>row.queryFrequency(0,Infinity)],['unfunded depth tail',()=>buildCompactRow({absTol:1e-20})],['quadrature budget',()=>buildCompactRow({maxQuadratureNodes:8})]]){assert.throws(fn,RangeError);refusals.push(name);}
assert.deepEqual(row.query(0,0,30),[1,0]);assert.deepEqual(row.queryFrequency(0,1e300),[0,0]);

// Timings distinguish active interpolation from certified zero shortcuts.
const activeQueries=[],mixedQueries=[];
for(const m of row.protocol.metadata){if(!m.dropped)for(let i=0;i<9;i++)activeQueries.push([m.ks,m.cutoff*(i+.31)/10]);}
for(const p of previous.modes)if(p.ks!==0||p.kt!==0)mixedQueries.push([p.ks,-2.5*p.ks*(p.x-240)-600*p.kt]);
let checksum=0;const out=new Float64Array(2);
function batch(queries,count){const t=clock();for(let i=0;i<count;i++){row.queryFrequencyInto(...queries[i%queries.length],out);checksum+=out[0];}return(clock()-t)*1e6/count;}
batch(activeQueries,20000);batch(mixedQueries,20000);
const activeNs=[],mixedNs=[],rowMs=[];
for(let i=0;i<5;i++){activeNs.push(batch(activeQueries,200000));mixedNs.push(batch(mixedQueries,200000));const t=clock();for(let x=0;x<480;x++)checksum+=pixel(row,coefficients[2],x);rowMs.push(clock()-t);}
const sourceHashes={};for(const name of['fjet-yb.mjs','fjet-exacty.mjs'])sourceHashes[name]=createHash('sha256').update(readFileSync(new URL(`../../../../tools/exp/${name}`,import.meta.url))).digest('hex');
const result={timestamp:began.toISOString(),machine:{node:process.version,cpu:cpus()[0]?.model,platform:process.platform,arch:process.arch,gcExposed:!!global.gc},sourceHashes,
 sourceGeometry:{sourceValueChecks,maxSourceError,contract:'Plain-circle numeric source, fixed affine phase in unit-period s/20,t/20, constant amplitude; full unclipped Gaussian footprint. Additional d0/sigma families test the same exact geometry.'},
 protocol:row.protocol,additionalFamilies:families.slice(1).map(f=>f.row.protocol),previousDenseNumericBytes:27262976,
 memory:{before:memoryBefore,afterGc:memoryAfter,deltaAfterGc:memoryDelta,...row.protocol.memory,
  caveat:'Numeric allocation accounting includes all owned typed-array construction buffers; logical release is distinct from GC. JS objects/metadata, JIT, and runtime overhead appear in process heap/RSS observations, not in numeric byte totals. Process checkpoints are sampled, not a continuous high-water monitor.'},
 timing:{coldSetupMs:cold.protocol.setupMs,warmSetupMs:warmSetup,measuredSetupMs:row.protocol.setupMs,activeInterpolationNs:activeNs,activeInterpolationNsMedian:median(activeNs),mixedNs,mixedNsMedian:median(mixedNs),complete480PixelRowMs:rowMs,complete480PixelRowMsMedian:median(rowMs),setupPlus480PixelRowMs:row.protocol.setupMs+median(rowMs),note:'CPU Float64/JIT, no GPU or sustained frame claim. Active path and shortcut-heavy query mix reported separately.'},
 depthPruningWitness:witness,pixels,modeRecords,refusals,
 summary:{modeChecks:modeRecords.length,maxModeError:Math.max(...modeRecords.map(r=>r.error)),maxReferenceConvergence:Math.max(...modeRecords.map(r=>r.referenceConvergence??0)),maxPixelError:Math.max(...pixels.map(p=>p.error)),maxPixelReferenceConvergence:Math.max(...pixels.map(p=>p.referenceConvergence)),maxConjugacyError,maxQuadratureRefinement:maxRefinement,maxTighterToleranceDifference:maxTighterDifference,numericMemoryReduction:27262976/row.protocol.memory.retainedNumericBytes,wallMs:clock()-started,checksum},gates:'all passed'};
const args=process.argv.slice(2),i=args.indexOf('--out'),output=i>=0?args[i+1]:args.find(a=>a.startsWith('--out='))?.slice(6)??fileURLToPath(new URL(`row-results-${began.toISOString().replace(/[:.]/g,'-')}.json`,import.meta.url));
if(!output)throw Error('--out needs a path');
writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,summary:result.summary,memory:{...result.memory,processCheckpoints:undefined},timing:result.timing,depthPruningWitness:witness,gates:result.gates},null,2));
