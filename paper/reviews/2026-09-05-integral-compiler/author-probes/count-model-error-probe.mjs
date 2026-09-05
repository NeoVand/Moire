// The centre-expanded model's count against the source's count across the pixel.
// Run: node count-model-error-probe.mjs [case=sinQuadratic] [x=300] [y=12]
process.env.FJET_LIB = '1';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const REPO = process.env.MOIRE_REPO || fileURLToPath(new URL('../../../../', import.meta.url));
const F = await import(pathToFileURL(resolve(REPO, 'paper/tools/exp/fjet.mjs')).href);
const YB = await import(pathToFileURL(resolve(REPO, 'paper/tools/exp/fjet-yb.mjs')).href);
const SIG = YB.SIG;
const name = process.argv[2] || 'sinQuadratic', x = Number(process.argv[3] || 300), y = Number(process.argv[4] || 12);
const cs = YB.CASES.find((c) => c.name === name);
F.resetAxes();
const px = new F.Pixel(SIG, 1e-4);
const el = cs.eval(YB.FJ, x, y, true)[0];
const ax = el.axes().find((a) => a.label === 'fract');
console.log('fract count at centre', ax.count.v.toFixed(4), 'rate', ax.count.gx.toFixed(2), ax.count.gy.toFixed(2));
for (const [dx, dy] of [[0.25, 0], [0.5, 0], [1, 0], [0, 0.25], [0, 0.5], [0, 0.75], [0, 1], [0, 1.5]]) {
  const model = px.countAt(ax, [dx, dy]);
  F.resetAxes();
  const el2 = cs.eval(YB.FJ, x + dx, y + dy, true)[0];
  const exact = el2.axes().find((a) => a.label === 'fract').count.v;
  console.log(`z=(${dx},${dy}) model count ${model.toFixed(4)} exact ${exact.toFixed(4)} error ${(model - exact).toFixed(4)} periods`);
}
