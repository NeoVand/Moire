// The compiler's traced model as a control variate at the Stein probe's pixel.
// Run: node model-control-probe.mjs [case=sinQuadratic] [x=300] [y=12]
// The analytic model as a control variate, at the Stein probe's pixel:
// q(z) = the compiler's traced element evaluated at displacement z (its
// point value), E q from the compiler's expectation, S(z) the original
// shader. Reports Var S, Var(S - q), the estimate E q + mean(S - q), the
// 500k reference, and per-sample costs. Same RNG and seeds as the Stein probe.
process.env.FJET_LIB = '1';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const REPO = process.env.MOIRE_REPO || fileURLToPath(new URL('../../../../', import.meta.url));
import { performance } from 'node:perf_hooks';
const F = await import(pathToFileURL(resolve(REPO, 'paper/tools/exp/fjet.mjs')).href);
const YB = await import(pathToFileURL(resolve(REPO, 'paper/tools/exp/fjet-yb.mjs')).href);
const SIG = YB.SIG, TAU = 2 * Math.PI;
const name = process.argv[2] || 'sinQuadratic', x = Number(process.argv[3] || 300), y = Number(process.argv[4] || 12);
const N = 100000, NR = 500000;
const cs = YB.CASES.find((c) => c.name === name);
function rng(seed){return()=>{seed|=0;seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function pair(r){const a=SIG*Math.sqrt(-2*Math.log(1-r())),b=TAU*r();return[a*Math.cos(b),a*Math.sin(b)];}
function points(n,seed){const p=new Float64Array(2*n),r=rng(seed);for(let i=0;i<n;i++){const[u,v]=pair(r);p[2*i]=u;p[2*i+1]=v;}return p;}
// the model and its expectation
F.resetAxes();
const t0 = performance.now();
const px = new F.Pixel(SIG, 1e-4);
const el = cs.eval(YB.FJ, x, y, true)[0];
const Eq = px.expect(el);
const modelMs = performance.now() - t0;
// reference
const ref = (() => { const p = points(NR, 73013); let s = 0, ss = 0; const t = performance.now(); for (let i = 0; i < p.length; i += 2) { const v = cs.eval(YB.NUM, x + p[i], y + p[i + 1], false)[0]; s += v; ss += v * v; } const n = p.length / 2; return { mean: s / n, var: ss / n - (s / n) ** 2, ms: performance.now() - t }; })();
console.log(JSON.stringify({ kind: 'protocol', name, pixel: [x, y], modelExpectation: Eq, modelMs, reference: ref, refSe: Math.sqrt(ref.var / NR) }));
for (const seed of [173, 917]) {
  const p = points(N, seed);
  let s = 0, ss = 0; let t = performance.now();
  for (let i = 0; i < p.length; i += 2) { const v = cs.eval(YB.NUM, x + p[i], y + p[i + 1], false)[0]; s += v; ss += v * v; }
  const rawMs = performance.now() - t;
  let d = 0, dd = 0, qs = 0, qq = 0; t = performance.now();
  const coords = new Map();
  for (let i = 0; i < p.length; i += 2) {
    const S = cs.eval(YB.NUM, x + p[i], y + p[i + 1], false)[0];
    const q = px.pointValue(el.terms, [p[i], p[i + 1]], coords);
    const r = S - q; d += r; dd += r * r; qs += q; qq += q * q;
  }
  const cvMs = performance.now() - t;
  const n = N;
  const rawMean = s / n, rawVar = ss / n - rawMean * rawMean;
  const resMean = d / n, resVar = dd / n - resMean * resMean;
  const qMean = qs / n, qVar = qq / n - qMean * qMean;
  const est = Eq + resMean;
  const gain = rawVar / resVar, cost = cvMs / rawMs;
  console.log(JSON.stringify({ kind: 'result', seed, rawMean, rawVar, rawSe: Math.sqrt(rawVar / n), qMean, qVar, modelMinusQmean: Eq - qMean, resMean, resVar, resSe: Math.sqrt(resVar / n), estimate: est, estimateMinusRef: est - ref.mean, modelMinusRef: Eq - ref.mean, rawMinusRef: rawMean - ref.mean, varianceGain: gain, costRatio: cost, equalTimeGain: gain / cost, rawMs, cvMs }));
}
