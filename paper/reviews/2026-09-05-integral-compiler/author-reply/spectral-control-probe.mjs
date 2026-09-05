// Source-exact Gaussian polynomial/phase controls, with no fitted pilot.
// Run: node spectral-control-probe.mjs
// No dependencies; no compiler/app imports or writes. Output is JSON.
import assert from 'node:assert/strict';
const C = (r = 0, i = 0) => [r, i];
const add = (a, b) => C(a[0] + b[0], a[1] + b[1]);
const mul = (a, b) => C(a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]);
const scale = (a, v) => C(a[0] * v, a[1] * v);
const conj = a => C(a[0], -a[1]);
const div = (a, b) => scale(mul(a, conj(b)), 1 / (b[0] ** 2 + b[1] ** 2));
const exp = a => scale(C(Math.cos(a[1]), Math.sin(a[1])), Math.exp(a[0]));
const pmul = (a, b) => {
  const p = Array.from({ length: a.length + b.length - 1 }, () => C());
  a.forEach((x, i) => b.forEach((y, j) => { p[i + j] = add(p[i + j], mul(x, y)); }));
  return p;
};
// A term is P(z) exp(i(a+bz+qz²/2)); all phases use radians.
const term = (a, b, q, p) => ({ a, b, q, p });
const negate = t => term(-t.a, -t.b, -t.q, t.p.map(conj));
const times = (t, s) => term(t.a + s.a, t.b + s.b, t.q + s.q, pmul(t.p, s.p));
const weighted = (ts, v) => ts.map(t => ({ ...t, p: t.p.map(x => scale(x, v)) }));
const realPart = t => [...weighted([t], 0.5), ...weighted([negate(t)], 0.5)];
const imagPart = t => [
  { ...t, p: t.p.map(x => mul(C(0, -0.5), x)) },
  { ...negate(t), p: negate(t).p.map(x => mul(C(0, 0.5), x)) },
];
const value = (ts, z) => ts.reduce((s, t) => {
  let p = C();
  for (let i = t.p.length - 1; i >= 0; i--) p = add(scale(p, z), t.p[i]);
  return s + mul(p, exp(C(0, t.a + t.b * z + 0.5 * t.q * z * z)))[0];
}, 0);

// M_j(b,q)=E[Z^j exp(i(bZ+qZ²/2))], Z~N(0,1).
// D=1-iq, M_0=D^(-1/2) exp(-b²/(2D)),
// M_(j+1)=(ib M_j + j M_(j-1))/D.
function moment(t) {
  const D = C(1, -t.q);
  const radius = Math.hypot(...D);
  const invSqrt = scale(C(Math.cos(-Math.atan2(D[1], D[0]) / 2), Math.sin(-Math.atan2(D[1], D[0]) / 2)), 1 / Math.sqrt(radius));
  const m = [mul(invSqrt, exp(div(C(-t.b * t.b / 2), D)))];
  if (t.p.length > 1) m.push(div(mul(C(0, t.b), m[0]), D));
  for (let j = 1; j + 1 < t.p.length; j++) m.push(div(add(mul(C(0, t.b), m[j]), scale(m[j - 1], j)), D));
  const ans = t.p.reduce((s, p, j) => add(s, mul(p, m[j])), C());
  return mul(exp(C(0, t.a)), ans);
}
const mean = ts => ts.reduce((s, t) => s + moment(t)[0], 0);
const inner = (a, b) => a.reduce((s, t) => s + b.reduce((u, v) => u + moment(times(t, v))[0], 0), 0);

// T F = F' - zF, with F=P exp(i theta). Polynomial amplitudes are
// differentiated exactly; no finite differences or omitted denominator terms.
function stein(t) {
  const p = pmul(t.p, [C(0, t.b), C(-1, t.q)]);
  for (let j = 1; j < t.p.length; j++) p[j - 1] = add(p[j - 1], scale(t.p[j], j));
  return { ...t, p };
}

// Symmetric Jacobi eigensolve, allowing exact redundant controls. This is a
// small test implementation, not a proposed GPU linear algebra kernel.
function eigen(A) {
  const n = A.length, M = A.map(r => [...r]);
  const U = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
  for (let iteration = 0; iteration < 100 * n * n; iteration++) {
    let p = 0, q = 1, largest = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.abs(M[i][j]) > largest) { p = i; q = j; largest = Math.abs(M[i][j]); }
    if (largest < 1e-15 * Math.max(1, ...M.map((r, i) => Math.abs(r[i])))) break;
    const angle = 0.5 * Math.atan2(2 * M[p][q], M[q][q] - M[p][p]);
    const c = Math.cos(angle), s = Math.sin(angle), app = M[p][p], aqq = M[q][q], apq = M[p][q];
    for (let k = 0; k < n; k++) if (k !== p && k !== q) {
      const a = M[k][p], b = M[k][q];
      M[k][p] = M[p][k] = c * a - s * b;
      M[k][q] = M[q][k] = s * a + c * b;
    }
    M[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    M[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    M[p][q] = M[q][p] = 0;
    for (let k = 0; k < n; k++) {
      const a = U[k][p], b = U[k][q];
      U[k][p] = c * a - s * b;
      U[k][q] = s * a + c * b;
    }
  }
  return { values: M.map((r, i) => r[i]), vectors: U };
}
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const mv = (A, x) => A.map(row => dot(row, x));
function projection(G, b, ridge = 0) {
  const { values, vectors } = eigen(G);
  const largest = Math.max(...values), threshold = largest * 1e-11;
  assert.ok(Math.min(...values) > -1e-10 * largest, 'Gram must be positive semidefinite');
  const beta = new Array(b.length).fill(0);
  let rank = 0;
  values.forEach((lambda, j) => {
    if (lambda <= threshold) return;
    rank++;
    const u = vectors.map(row => row[j]), coefficient = dot(u, b) / (lambda + ridge);
    u.forEach((v, i) => { beta[i] += coefficient * v; });
  });
  return { beta, eigenvalues: values, rank };
}
const residualVariance = (v, G, b, beta) => v - 2 * dot(beta, b) + dot(beta, mv(G, beta));

// Independent reference: direct evaluations and composite Simpson quadrature
// on [-10,10]. Doubling its resolution is an explicit convergence check.
function quadrature(f, hs, panels = 80000) {
  const n = hs.length, h = 20 / panels, hm = new Array(n).fill(0), b = new Array(n).fill(0);
  const G = Array.from({ length: n }, () => new Array(n).fill(0));
  let mu = 0, ff = 0;
  for (let i = 0; i <= panels; i++) {
    const z = -10 + i * h, w = h / 3 * (i === 0 || i === panels ? 1 : i % 2 ? 4 : 2) * Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
    const y = f(z), x = hs.map(g => g(z));
    mu += w * y; ff += w * y * y;
    for (let j = 0; j < n; j++) {
      hm[j] += w * x[j]; b[j] += w * x[j] * y;
      for (let k = 0; k <= j; k++) G[j][k] += w * x[j] * x[k];
    }
  }
  for (let j = 0; j < n; j++) {
    b[j] -= hm[j] * mu;
    for (let k = 0; k <= j; k++) G[k][j] = G[j][k] = G[j][k] - hm[j] * hm[k];
  }
  return { mean: mu, variance: ff - mu * mu, controlMeans: hm, G, b };
}
function rng(seed) { return () => {
  seed |= 0; seed = seed + 0x6d2b79f5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}; }
function mc(f, hs, beta, count, seed) {
  const random = rng(seed); let sum = 0, sum2 = 0, sum3 = 0, sum4 = 0, raw = 0, raw2 = 0;
  for (let i = 0; i < count; i++) {
    const z = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
    const y = f(z), r = y - dot(beta, hs.map(h => h(z)));
    raw += y; raw2 += y * y; sum += r; sum2 += r * r; sum3 += r ** 3; sum4 += r ** 4;
  }
  const mu = sum / count, variance = sum2 / count - mu * mu;
  const fourth = sum4 / count - 4 * mu * sum3 / count + 6 * mu * mu * sum2 / count - 3 * mu ** 4;
  return { seed, count, mean: mu, variance, meanSe: Math.sqrt(variance / count), varianceSe: Math.sqrt(Math.max(0, fourth - variance * variance) / count), rawVariance: raw2 / count - (raw / count) ** 2 };
}
const near = (a, b, eps = 2e-10) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

const phaseA = term(0.3, 5.2, 0.8, [C(1), C(0.12), C(-0.03)]);
const phaseB = term(-0.7, -3.1, -0.4, [C(1)]);
const source = [term(0, 0, 0, [C(0.2)]), ...weighted(realPart(phaseA), 0.7), ...weighted(imagPart(phaseB), 0.25), ...weighted(realPart(term(0.2, 0.7, 2, [C(1)])), 0.17)];
const fields = [term(0.3, 5.2, 0.8, [C(0, -1 / 5.2)]), term(-0.7, -3.1, -0.4, [C(0, 1 / 3.1)]), term(0.3, 5.2, 0.8, [C(0, -1 / 5.2), C(0, -0.15 / 5.2)])];
const controls = fields.flatMap(F => [realPart(stein(F)), imagPart(stein(F))]);
// An exactly redundant but numerically almost duplicate final control.
controls.push([...controls[0], ...weighted(controls[2], 1e-9)]);
const f = z => value(source, z), hs = controls.map(h => z => value(h, z));
const mu = mean(source), V = inner(source, source) - mu * mu;
const controlMeans = controls.map(mean);
controlMeans.forEach(m => near(m, 0));
const G = controls.map(a => controls.map(b => inner(a, b)));
const b = controls.map(h => inner(source, h));
const fit = projection(G, b), predicted = residualVariance(V, G, b, fit.beta);
const quad = quadrature(f, hs), fine = quadrature(f, hs, 160000);
near(mu, quad.mean); near(V, quad.variance);
for (let i = 0; i < b.length; i++) {
  near(b[i], quad.b[i]); near(quad.controlMeans[i], 0);
  for (let j = 0; j < b.length; j++) near(G[i][j], quad.G[i][j]);
}
near(quad.variance, fine.variance);
const quadResidual = residualVariance(quad.variance, quad.G, quad.b, fit.beta);
near(predicted, quadResidual);
const mcRuns = [173, 917].map(seed => mc(f, hs, fit.beta, 300000, seed));
for (const run of mcRuns) {
  assert.ok(Math.abs(run.mean - mu) < 6 * run.meanSe);
  assert.ok(Math.abs(run.variance - predicted) < 6 * run.varianceSe);
}
const ridge = 1e-3 * Math.max(...fit.eigenvalues);
const regularized = projection(G, b, ridge);
const ridgePredicted = residualVariance(V, G, b, regularized.beta);
const ridgeQuad = residualVariance(quad.variance, quad.G, quad.b, regularized.beta);
near(ridgePredicted, ridgeQuad);

// Same centre value, gradient and Hessian; different source covariance.
const omega = 5, q = omega * omega, e = Math.exp(-2 * q);
const modelV = (1 + e) / 2 - Math.exp(-q);
const hV = ((1 + 1 / q) + (1 - 1 / q) * e) / 2;
const cross = (1 - e) / 2, beta = cross / hV;
const affineControl = z => Math.cos(omega * z) - z / omega * Math.sin(omega * z);
const model = z => Math.cos(omega * z);
const actual = z => Math.cos(omega * z + 4 * z ** 3);
const modelPrediction = modelV - cross * cross / hV;
const modelQuad = quadrature(model, [affineControl]);
near(modelPrediction, residualVariance(modelQuad.variance, modelQuad.G, modelQuad.b, [beta]));
const actualQuad = quadrature(actual, [affineControl]);
const actualFine = quadrature(actual, [affineControl], 160000);
near(actualQuad.mean, actualFine.mean); near(actualQuad.variance, actualFine.variance);
const actualResidual = residualVariance(actualQuad.variance, actualQuad.G, actualQuad.b, [beta]);
const actualMc = mc(actual, [affineControl], [beta], 300000, 2026);
assert.ok(Math.abs(actualMc.mean - actualQuad.mean) < 6 * actualMc.meanSe);
assert.ok(Math.abs(actualMc.variance - actualResidual) < 6 * actualMc.varianceSe);
assert.ok(Math.abs(actualResidual - modelPrediction) > 0.1);
console.log(JSON.stringify({
  protocol: { distribution: 'standard normal', exactSource: 'finite sum of polynomial amplitudes and quadratic phases', controls: controls.length, seeds: [173, 917], samplesPerSeed: 300000, quadraturePanels: [80000, 160000], cutoff: [-10, 10], caveat: 'Quadrature is a convergence check, not a certified error bound; finite Gaussian tails omitted.' },
  polynomialPhase: { mean: mu, sourceVariance: V, rank: fit.rank, controls: controls.length, eigenvalues: fit.eigenvalues, maxAbsControlMean: Math.max(...controlMeans.map(Math.abs)), beta: fit.beta, predictedResidualVariance: predicted, quadratureResidualVariance: quadResidual, varianceReduction: V / predicted, mc: mcRuns, ridge, ridgePredictedResidualVariance: ridgePredicted, ridgeQuadratureResidualVariance: ridgeQuad },
  centreModelMismatch: { model: 'cos(5z)', source: 'cos(5z+4z^3)', sameCentreTwoJet: true, coefficient: beta, predictedModelResidualVariance: modelPrediction, sourceMean: actualQuad.mean, sourceVariance: actualQuad.variance, actualResidualVariance: actualResidual, actualVarianceReduction: actualQuad.variance / actualResidual, mc: actualMc, conclusion: 'The model coefficient remains unbiased as a source-exact Stein correction; its model variance prediction is wrong.' },
  gates: 'all passed'
}, null, 2));
