// Build the explainer page: inline the pedagogy figures into template.html as
// data URIs. Figures come from explainer-figs.mjs and teaser-candidates.mjs.
//
//   node paper/tools/exp/explainer-figs.mjs   (once, for the ex-* panels)
//   node paper/tools/exp/teaser-candidates.mjs (once, for the cand-* panels)
//   node paper/tools/explainer/build.mjs
//
// Output: paper/build/moire-explained.html (published as a claude.ai artifact).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const HERE = new URL('./', import.meta.url);
const FIGS = new URL('../../figures/teaser-candidates/', import.meta.url);
const OUT = new URL('../../build/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const IMAGES = {
  'ex-combs': 'ex-combs.png',
  'ex-rings-D': 'ex-rings-D.png',
  'ex-rings-env': 'ex-rings-env.png',
  'cand-walking': 'cand-02-walking-triangle.png',
  'cand-swirl': 'cand-07-swirl-flow.png',
  'cand-hyper': 'cand-10-hyperbolae.png',
};

let html = readFileSync(new URL('template.html', HERE), 'utf8');
for (const [token, file] of Object.entries(IMAGES)) {
  const b64 = readFileSync(new URL(file, FIGS)).toString('base64');
  const before = html.length;
  html = html.replaceAll(`{{${token}}}`, `data:image/png;base64,${b64}`);
  if (html.length === before) throw new Error(`token not found: ${token}`);
}
if (html.includes('{{')) throw new Error('unreplaced token remains');
writeFileSync(new URL('moire-explained.html', OUT), html);
console.log(`wrote build/moire-explained.html (${(html.length / 1e6).toFixed(2)} MB)`);
