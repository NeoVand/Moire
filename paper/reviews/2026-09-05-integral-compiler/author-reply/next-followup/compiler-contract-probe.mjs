// Two counterexamples to Reply 4's error/pruning conclusions. Read-only compiler.
// Run with optional --out NEW.json. Historical and author files stay untouched.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir,cpus} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {tableJ} from '../gpu-followup/bessel-f32.mjs';
const here=fileURLToPath(new URL('.',import.meta.url));
const args=process.argv.slice(2);
assert(args.length===0||(args.length===2&&args[0]==='--out'),'Usage: node compiler-contract-probe.mjs [--out NEW.json]');
const output=args.length?resolve(args[1]):join(here,`compiler-contract-results-${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}.json`);
const hash=b=>createHash('sha256').update(b).digest('hex');
const result={dateUTC:new Date().toISOString(),node:process.version,cpu:cpus()[0]?.model,
 scope:'Frozen bounded counterexamples; not a complete compiler or full-image error audit.'};

// Absolute error is not relative error, even for a single coefficient/recipe.
const base=new URL('../gpu-followup/',import.meta.url);
const tableBytes=readFileSync(new URL('bessel-table-v1/bessel-table.f32',base));
const table=new Float32Array(tableBytes.buffer,tableBytes.byteOffset,tableBytes.byteLength/4);
const certificate=JSON.parse(readFileSync(new URL('bessel-table-v1/bessel-table-certificate.json',base)));
assert.equal(hash(tableBytes),certificate.sha256);
const cases=JSON.parse(readFileSync(new URL('bessel-reference-v1/bessel-cases.json',base)));
const refBytes=readFileSync(new URL('bessel-reference-v1/bessel-reference.f64',base));
const refs=new Float64Array(refBytes.buffer,refBytes.byteOffset,refBytes.byteLength/8);
const eps=certificate.singleValueAbsoluteErrorBound;
let worst;
for(let i=0;i<cases.length;i++)for(let n=0;n<=40;n++){
 const exact=refs[i*43+n],computed=tableJ(table,n,cases[i].x),error=Math.abs(computed-exact);
 if(Math.abs(exact)<1e-10||error<1e-9)continue;
 const incorrectlyPredicted=eps*Math.abs(exact),ratio=error/incorrectlyPredicted;
 if(!worst||ratio>worst.ratio)worst={x:cases[i].x,order:n,reference:exact,computed,error,absoluteBound:eps,
  contributionMagnitude:Math.abs(exact),incorrectlyPredicted,ratio};
}
assert(worst&&worst.error<worst.absoluteBound&&worst.ratio>100);
result.absoluteVersusRelative={...worst,meaning:'For pixel I=1*J_n(x), sum|contribution|=|J_n(x)|, whereas absolute-error sensitivity is1. Actual float32 mirror error exceeds eps*sum|contribution|. This does not claim the compiler uses this particular coefficient at a benchmark pixel.'};

// Exercise the actual private multiplier and expectation functions in a source
// copy. No algorithm changes; add private exports only, then remove the copy.
// next-followup -> author-reply -> review -> reviews -> paper -> tools
const actualSourceURL=new URL('../../../../tools/exp/fjet.mjs',import.meta.url);
const source=readFileSync(actualSourceURL,'utf8');
assert(!/^import\s/m.test(source),'Compiler now has imports; inspect its copy dependencies before reusing this probe.');
result.compiler={path:fileURLToPath(actualSourceURL),sha256:hash(source),privateExports:['termExpectation','logMult','cj']};
const temp=mkdtempSync(join(tmpdir(),'moire-contract-'));
try{
 const copy=join(temp,'fjet.mjs');writeFileSync(copy,source+'\nexport {termExpectation as reviewExpectation,logMult as reviewLogMult,cj as reviewCJ};\n');
 const F=await import(pathToFileURL(copy));
 const sigma=.5,d0=6,b=9,cut=1e-4;
 const integrate=(N,L)=>{
  let re=0,im=0,mass=0;const step=2*L*sigma/N;
  for(let i=0;i<N;i++){
   const y=-L*sigma+(i+.5)*step,w=-d0*y/(d0+y),p=step*Math.exp(-.5*(y/sigma)**2)/(sigma*Math.sqrt(2*Math.PI));
   re+=p*Math.cos(b*w);im+=p*Math.sin(b*w);mass+=p;
  }
  return{N,L,mean:[re,im],mass};
 };
 const refs=[integrate(32768,9),integrate(65536,9)];
 const truth=refs[1].mean,refDelta=Math.hypot(truth[0]-refs[0].mean[0],truth[1]-refs[0].mean[1]);
 assert(refDelta<1e-11);
 const omittedDepthMassBound=2*Math.exp(-.5*9**2)/(Math.sqrt(2*Math.PI)*9);
 const constant=F.reviewCJ(F.Jet.c(1),F.Jet.c(0));
 const modes=[];
 for(const n of[32,64,128,256]){
  const px=new F.Pixel(sigma,cut);assert(px.setDepth(d0,n));
  const cond={dim:2,sig:sigma,depth:px.depth};
  const integrated=F.reviewExpectation(constant,0,0,b,0,0,0,cond);
  modes.push({nodes:n,compilerDepthMean:integrated,errorVsUntruncated:Math.hypot(integrated[0]-truth[0],integrated[1]-truth[1]),
   pruningMultiplier:Math.exp(F.reviewLogMult(0,b,0,0,0,cond))});
 }
 // Fixed phase0 bounded grayscale source, without fitting to the answer:
 // S(y)=.5+.5*cos(9W(y)). The phase is exactly affine in W.
 const means=[];
 for(const threshold of[cut,1e-8]){
  const px=new F.Pixel(sigma,threshold);px.setDepth(d0,64);F.resetAxes();
  const model=F.add(.5,F.scale(F.cos(new F.Jet(0,0,b)),.5));
  means.push({cut:threshold,value:px.expect(model),recipes:px.stats.recipes});
 }
 const sourceMean=.5+.5*truth[0];
 assert(Math.abs(means[0].value-.5)<1e-12);
 assert(Math.abs(means[0].value-sourceMean)>4*cut);
 assert(Math.abs(means[1].value-sourceMean)<1e-6);
 result.depthPruning={sigma,d0,b,source:'S(Y)=0.5+0.5*cos(9W); W=-6Y/(6+Y); Y~N(0,0.5²)',
  modelIsExact:'The phase is exactly affine in the compiler depth coordinate W. No omitted Taylor terms.',
  reference:refs,referenceRefinementError:refDelta,omittedDepthMassBound,
  trueComplexMultiplierMagnitude:Math.hypot(...truth),sourceMean,compiler:modes,pixelMeans:means,
  errorAtDefaultCut:Math.abs(means[0].value-sourceMean),
  meaning:'logMult ignores cond.depth and prices a Gaussian W. termExpectation integrates the non-Gaussian W. The default pruning discards an exactly modeled bounded source whose mean error exceeds the configured cut. Depth quadrature and five-sigma renormalization have separate, much smaller errors in this case.'};
}finally{rmSync(temp,{recursive:true,force:true});}
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,absoluteRelativeRatio:result.absoluteVersusRelative.ratio,depthError:result.depthPruning.errorAtDefaultCut,reference:result.depthPruning.sourceMean}));
