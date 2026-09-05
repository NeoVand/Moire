// A surgical alternative to replacing the nested adapter: regularize its outer
// square-root endpoints. Only in-memory copies change; the author's file stays intact.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {gaussianChirpMoments} from '../gaussian-chirp.mjs';
const here=fileURLToPath(new URL('.',import.meta.url)),args=process.argv.slice(2);
assert(args.length===0||(args.length===2&&args[0]==='--out'));
const output=args.length?resolve(args[1]):join(here,`coverage-outer-results-${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}.json`);
const refName='mask-reference-2026-09-05T16-54-39.569Z.json';
const refBytes=readFileSync(join(here,refName)),ref=JSON.parse(refBytes);
const input=JSON.parse(readFileSync(join(here,ref.input)));
const source=readFileSync(new URL('../../author-probes/correlated-coverage-adapter.mjs',import.meta.url),'utf8');
const sha=b=>createHash('sha256').update(b).digest('hex');assert.equal(sha(source),input.sourceSha256);
const marker='for (const cs of cases) {';assert(source.includes(marker));
const body=source.slice(0,source.indexOf(marker)).split('\n').filter(l=>!l.startsWith('import ')&&!l.startsWith('const here =')&&!l.startsWith('const { gaussianChirpMoments }')).join('\n');
const old='const w1 = m + h * gl.x[qq], wgt = h * gl.w[qq] * Math.exp(-0.5 * (w1 / S) ** 2) / (S * Math.sqrt(TAU));';
const mapped='const t = Math.PI * gl.x[qq] / 2, w1 = m + h * Math.sin(t), wgt = h * Math.PI / 2 * Math.cos(t) * gl.w[qq] * Math.exp(-0.5 * (w1 / S) ** 2) / (S * Math.sqrt(TAU));';
assert.equal(body.split(old).length,2);assert(body.includes('const n = 32, x = []'));assert(body.includes('const S = sigma, L = 6;'));
const end=`return cases.map(cs=>{const xi=cs.xi==='ridge'?rotQuad(-0.6,0,-0.02,0,0.15,0.2,0.3):rotQuad(0.7,0.4,-0.3,0.05,0,-0.1,0.3);const t=performance.now();const value=jointTerm(xi,cs.amp,cs.eta);return {name:cs.name,...value,ms:performance.now()-t};});`;
const variants=[{mapped:false,n:32,L:6},{mapped:true,n:16,L:6},{mapped:true,n:32,L:6},{mapped:true,n:64,L:6},{mapped:true,n:32,L:8},{mapped:true,n:64,L:8}];
const results=[];
for(const v of variants){
 const text=(v.mapped?body.replace(old,mapped):body).replace('const n = 32, x = []',`const n = ${v.n}, x = []`).replace('const S = sigma, L = 6;',`const S = sigma, L = ${v.L};`);
 const run=new Function('gaussianChirpMoments',text+end);run(gaussianChirpMoments);
 const trials=Array.from({length:5},()=>run(gaussianChirpMoments));
 const rows=trials[0].map((r,i)=>{
  const want=ref.rows.find(q=>q.name===r.name).reference.map(Number);
  const times=trials.map(t=>t[i].ms),ms=[...times].sort((a,b)=>a-b)[2];
  return {...r,ms,trialMs:times,reference:want,absoluteError:Math.hypot(r.re-want[0],r.im-want[1])};
 });
 results.push({...v,rows});
}
for(const r of results.find(r=>r.mapped&&r.n===32&&r.L===6).rows)assert(r.absoluteError<1e-8&&r.failed===0);
for(const [i,r] of results.find(r=>r.mapped&&r.n===16&&r.L===6).rows.entries())assert(r.absoluteError<1e-8&&r.failed===0&&r.calls===results[0].rows[i].calls/2);
for(const r of results.find(r=>r.mapped&&r.n===64&&r.L===8).rows)assert(r.absoluteError<1e-10&&r.failed===0);
writeFileSync(output,JSON.stringify({sourceSha256:sha(source),reference:refName,referenceSha256:sha(refBytes),variants:results,
 change:'w1=m+h*sin(pi*x/2); Jacobian=h*pi/2*cos(pi*x/2), at every existing outer subpanel. Original discriminant cuts and inner primitive preserved.',
 scope:'Empirical agreement against independent original-frame high precision; five warm CPU timings. This is not a general outer-quadrature certificate or a GPU/frame benchmark.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,variants:results.map(v=>({...v,rows:v.rows.map(r=>({name:r.name,error:r.absoluteError,calls:r.calls,ms:r.ms}))}))}));
