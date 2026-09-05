// Reuse the author's actual lowering, without editing his file or executing its
// expensive midpoint reference. Fail if its expected declaration markers change.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { gaussianChirpMoments } from '../gaussian-chirp.mjs';

export function loadCoverageAdapter() {
  const url=new URL('../../author-probes/correlated-coverage-adapter.mjs',import.meta.url);
  const source=fs.readFileSync(url,'utf8');
  const marker='for (const cs of cases) {';
  if(!source.includes(marker) || !source.includes('function jointTerm(')) throw new Error('Adapter layout changed; inspect before replay');
  const body=source.slice(0,source.indexOf(marker)).split('\n')
    .filter(line=>!line.startsWith('import ') && !line.startsWith('const here =') && !line.startsWith('const { gaussianChirpMoments }'))
    .join('\n')+`
    return cases.map(cs=>{
      const xi=cs.xi==='ridge'?rotQuad(-0.6,0,-0.02,0,0.15,0.2,0.3):rotQuad(0.7,0.4,-0.3,0.05,0,-0.1,0.3);
      return {name:cs.name,result:jointTerm(xi,cs.amp,cs.eta)};
    });`;
  const run=new Function('gaussianChirpMoments',body);
  const trace=[];
  const baseline=run(args=>{
    const result=gaussianChirpMoments(args);
    trace.push({args,result});
    return result;
  });
  return {run,trace,baseline,sourceSha256:createHash('sha256').update(source).digest('hex')};
}

export function packCoverage({a=-Infinity,b=Infinity,sigma=1,beta=0,q=0},tolerance=1e-4) {
  if(![sigma,beta,q,tolerance].every(Number.isFinite)||sigma<=0||tolerance<=0
      ||typeof a!=='number'||typeof b!=='number'||Number.isNaN(a)||Number.isNaN(b))
    throw new RangeError('Invalid Gaussian-chirp input');
  let sign=1;
  if(a>b) { [a,b]=[b,a]; sign=-1; }
  const B=beta*sigma,Q=q*sigma*sigma;
  let center,halfWidth=0,mode;
  if(a===-Infinity && b===Infinity) { center=0; mode=3; }
  else if(a===-Infinity) { center=b/sigma; mode=1; }
  else if(b===Infinity) { center=a/sigma; mode=2; }
  else { halfWidth=(b-a)/(2*sigma); center=a/sigma+halfWidth; mode=0; }
  const packed=Array.from(new Float32Array([center,halfWidth,B,Q,mode,tolerance,sign,0]));
  if(!packed.every(Number.isFinite)||packed[5]<=0)
    throw new RangeError('Input is not representable in the shader contract');
  return packed;
}
