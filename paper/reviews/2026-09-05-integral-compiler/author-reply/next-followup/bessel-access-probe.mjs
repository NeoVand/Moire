// Read-only instrumentation of actual raw Bessel orders after O convolution.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const args=process.argv.slice(2);assert(args.length===0||(args.length===2&&args[0]==='--out'));
const here=fileURLToPath(new URL('.',import.meta.url));
const output=args.length?resolve(args[1]):join(here,`bessel-access-results-${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}.json`);
const hashes={},rows=[];
for(const scale of[1,2]){
 const dir=mkdtempSync(join(tmpdir(),'moire-bessel-access-'));
 try{
  for(const name of['fjet.mjs','fjet-yb.mjs']){
   const src=readFileSync(new URL('../../../../tools/exp/'+name,import.meta.url),'utf8');
   hashes[name]=createHash('sha256').update(src).digest('hex');let copy=src;
   if(name==='fjet.mjs'){
    const anchor='const jAt = (k) => {\n    const a = Math.abs(k);';assert.equal(src.split(anchor).length,2);
    copy='export const reviewAccess={calls:0,above42:0,maxOrder:0,maxArgument:0,maxAbove42Value:0,worst:null};\n'+src.replace(anchor,anchor+`
    reviewAccess.calls++;
    reviewAccess.maxOrder=Math.max(reviewAccess.maxOrder,a);
    reviewAccess.maxArgument=Math.max(reviewAccess.maxArgument,Math.abs(nS===1?cachedTheta:cachedTheta/2));
    if(a>42){
      reviewAccess.above42++;
      const value=Math.abs(J[a]||0);
      if(value>reviewAccess.maxAbove42Value){reviewAccess.maxAbove42Value=value;reviewAccess.worst={order:a,argument:nS===1?cachedTheta:cachedTheta/2,value};}
    }
`);
   }
   writeFileSync(join(dir,name),copy);
  }
  process.env.FJET_LIB='1';process.env.FJET_BUMPSCALE=String(scale);process.env.FJET_DEPTH='0';process.env.FJET_CUT='1e-4';
  process.env.FJET_SIG='.5';process.env.FJET_SHIFT='analytic';
  for(const key of ['FJET_PART','FJET_MAXK','FJET_SPLIT','FJET_OTERMS','FJET_OCUT'])assert(!process.env[key],`Unset ${key}`);
  const Y=await import(pathToFileURL(join(dir,'fjet-yb.mjs'))),F=await import(pathToFileURL(join(dir,'fjet.mjs')));
  const stats={terms:0,recipes:0,dfts:0,overflow:0};
  const value=Y.oursPixel(Y.CASES.find(c=>c.name==='zigzagRipples'),400,60,stats);
  rows.push({scale,case:'zigzagRipples',pixel:[400,60],value,retainedSidebandOrder:stats.shiftOrderMax,access:{...F.reviewAccess}});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
assert(rows[1].access.maxOrder>42);
writeFileSync(output,JSON.stringify({source:hashes,rows,meaning:'Retained sideband order differs from primitive Bessel order after lighting convolution and adjacent derivative shifts. Raw values above order42 are actually accessed. This is not a bound on their weighted pixel effect: they may be omitted only after that error is budgeted, or supported by extending the kernel.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,rows}));
