// Instrument only a temporary compiler copy, to measure absolute Q-jet sensitivity.
// The rendering decisions/coefficients are unchanged. These are weights for the
// assembled complex Q,Q',Q'', not directly for raw Bessel calls before convolution.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const args=process.argv.slice(2);assert(args.length===0||(args.length===2&&args[0]==='--out'));
const here=fileURLToPath(new URL('.',import.meta.url));
const output=args.length?resolve(args[1]):join(here,`coefficient-sensitivity-results-${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}.json`);
process.env.FJET_LIB='1';process.env.FJET_BUMPSCALE='1';process.env.FJET_SIG='.5';process.env.FJET_DEPTH='0';
process.env.FJET_CUT='1e-4';process.env.FJET_SHIFT='analytic';
for(const key of ['FJET_PART','FJET_MAXK','FJET_SPLIT','FJET_OTERMS','FJET_OCUT'])assert(!process.env[key],`Unset ${key} for this frozen probe`);
const dir=mkdtempSync(join(tmpdir(),'moire-sensitivity-')),source={};
try{
 for(const name of['fjet.mjs','fjet-yb.mjs']){
  const text=readFileSync(new URL('../../../../tools/exp/'+name,import.meta.url),'utf8');
  source[name]=createHash('sha256').update(text).digest('hex');
  let copy=text;
  if(name==='fjet.mjs'){
   const anchor='this.stats.shiftAmp += Math.hypot(v[0], v[1]);';
   assert.equal(text.split(anchor).length,2,'Instrumentation anchor changed; inspect source');
   copy=text.replace(anchor,anchor+`
          const weights = this.stats.reviewAbsoluteWeights ||= [0,0,0];
          for (let j=0;j<3;j++) {
            const basis = jetOf(j===0?1:0,j===1?1:0,j===2?1:0);
            const unitCoef = cjMul(cj(basis,J0),cj(Jet.c(Pr),Jet.c(Pi)));
            const influence=termExpectation(cjScaleC(cjMul(c,unitCoef),cr,ci),ph3,nbx,nby,nq00,nq01,nq11,cond);
            weights[j] += Math.hypot(influence[0],influence[1]);
          }
`);
  }else{
   const anchor='stats.shiftAmp = (stats.shiftAmp || 0) + (px.stats.shiftAmp || 0);';
   assert.equal(text.split(anchor).length,2,'Harness instrumentation anchor changed');
   copy=text.replace(anchor,anchor+`
    stats.reviewAbsoluteWeights ||= [0,0,0];
    for(let j=0;j<3;j++) stats.reviewAbsoluteWeights[j] += px.stats.reviewAbsoluteWeights?.[j] || 0;
`);
  }
  writeFileSync(join(dir,name),copy);
 }
 const Y=await import(pathToFileURL(join(dir,'fjet-yb.mjs')));
 const rows=[];
 for(const [name,x,y]of[['zigzagRipples',400,60],['checkerboardBumps',400,60],['colorCirclesBumps',120,34]]){
  const stats={terms:0,recipes:0,dfts:0,overflow:0};
  const value=Y.oursPixel(Y.CASES.find(c=>c.name===name),x,y,stats);
  assert(stats.shiftRecipes>0&&stats.reviewAbsoluteWeights.every(Number.isFinite));
  rows.push({case:name,pixel:[x,y],value,stats});console.log(JSON.stringify(rows.at(-1)));
 }
 writeFileSync(output,JSON.stringify({source,amplitude:1,sigma:.5,depth:false,cut:1e-4,rows,
  meaning:'For fixed surviving recipes, if assembled complex Q derivatives have absolute errors E0,E1,E2, this records weights Wj so |pixel delta| <= sum Wj Ej, before changes to enumeration and other arithmetic. The author statistic sum|contribution| prices a common relative scaling of each complete contribution; it cannot price absolute primitive errors. Raw Bessel errors must first pass through parity/products/lighting convolution and derivative chain rules.'},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({output}));
}finally{rmSync(dir,{recursive:true,force:true});}
