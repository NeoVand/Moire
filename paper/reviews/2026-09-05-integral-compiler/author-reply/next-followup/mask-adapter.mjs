import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { gaussianChirpMoments } from '../gaussian-chirp.mjs';

export function loadMaskAdapter() {
  const source=fs.readFileSync(new URL('../../author-probes/correlated-coverage-adapter.mjs',import.meta.url),'utf8');
  const marker='for (const cs of cases) {';
  if(!source.includes(marker)) throw new Error('Adapter layout changed');
  const body=source.slice(0,source.indexOf(marker)).split('\n').filter(l=>!l.startsWith('import ')&&!l.startsWith('const here =')&&!l.startsWith('const { gaussianChirpMoments }')).join('\n')+`
    const strip=q=>Object.fromEntries(['v','gx','gy','hxx','hxy','hyy'].map(k=>[k,q[k]]));
    return cases.map(cs=>{const xi=cs.xi==='ridge'?rotQuad(-0.6,0,-0.02,0,0.15,0.2,0.3):rotQuad(0.7,0.4,-0.3,0.05,0,-0.1,0.3);
      const start=performance.now();const nested=jointTerm(xi,cs.amp,cs.eta);const nestedMs=performance.now()-start;
      return {name:cs.name,sigma,mask:strip(xi),amplitude:strip(cs.amp),phase:Object.fromEntries(Object.entries(strip(cs.eta)).map(([k,v])=>[k,TAU*v])),nested,nestedMs};});`;
  return {cases:new Function('gaussianChirpMoments',body)(gaussianChirpMoments),sourceSha256:createHash('sha256').update(source).digest('hex')};
}
