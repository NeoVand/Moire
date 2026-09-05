/**
 * Reciprocal-depth row transform, source-exact geometry for plain circles.
 * CPU Float64 prototype, no dependencies, no compiler/app mutations.
 * Run: node row-transform-probe.mjs [--out PATH]
 * Default output is timestamped beside this file, never overwriting prior runs.
 * See row-transform-notes.md for the source, tail, and accuracy contracts.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
const TAU = 2 * Math.PI, SIGMA = 0.5, D0 = 6, CENTER_X = 240;
const A = -2.5, B = -600; // normalized source counts s/20, t/20
const RADIUS = 5 / 12, LIGHT = 0.76028592126970562;
const phi = z => Math.exp(-0.5 * z * z) / Math.sqrt(TAU);
const norm = ([r, i]) => Math.hypot(r, i);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const clock = () => performance.now();

// Positive-sign, unnormalized FFT. Twiddles and bit reversal are shared by rows.
function fftPlan(N) {
  assert.ok(N > 1 && (N & (N - 1)) === 0);
  const reverse = new Uint32Array(N), cos = new Float64Array(N / 2), sin = new Float64Array(N / 2);
  for (let i = 1; i < N; i++) reverse[i] = (reverse[i >> 1] >> 1) | ((i & 1) ? N >> 1 : 0);
  for (let i = 0; i < N / 2; i++) { cos[i] = Math.cos(TAU * i / N); sin[i] = Math.sin(TAU * i / N); }
  return (re, im) => {
    for (let i = 0; i < N; i++) if (reverse[i] > i) {
      const j = reverse[i]; [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]];
    }
    for (let size = 2; size <= N; size *= 2) {
      const half = size / 2, stride = N / size;
      for (let start = 0; start < N; start += size) for (let j = 0; j < half; j++) {
        const lo = start + j, hi = lo + half, w = j * stride;
        const r = cos[w] * re[hi] - sin[w] * im[hi], t = sin[w] * re[hi] + cos[w] * im[hi];
        re[hi] = re[lo] - r; im[hi] = im[lo] - t; re[lo] += r; im[lo] += t;
      }
    }
  };
}

/** Build one row's tables for |k_s|=0..maxKs. Counts use cycles, not radians. */
export function buildRow({ d0 = D0, sigma = SIGMA, L = 9, T = 4, N = 131072, maxKs = 12 } = {}) {
  const started = clock();
  if (!(d0 > L * sigma)) throw new RangeError('This bounded prototype requires d0 > L*sigma; near-horizon rows need two branches and an explicit pole-tail budget.');
  const lowY = d0 - L * sigma, highY = d0 + L * sigma;
  const lowV = 1 / highY, highV = 1 / lowY, centerV = 1 / d0, dv = T / N;
  if (!(lowV > centerV - T / 2 && highV < centerV + T / 2)) throw new RangeError('Reciprocal support does not fit the FFT interval.');
  const fft = fftPlan(N), base = new Float64Array(N), vv = new Float64Array(N), tables = [];
  let activeNodes = 0;
  for (let j = 0; j < N; j++) {
    const v = centerV + (j - N / 2) * dv;
    if (v >= lowV && v <= highV) {
      base[j] = phi((1 / v - d0) / sigma) / (sigma * v * v);
      vv[j] = v * v; activeNodes++;
    }
  }
  const perKsMs = [];
  for (let ks = 0; ks <= maxKs; ks++) {
    const t = clock(), re = new Float64Array(N), im = new Float64Array(N);
    const gamma = 2 * Math.PI ** 2 * sigma ** 2 * A ** 2 * ks ** 2;
    for (let j = 0; j < N; j++) if (base[j]) re[j] = base[j] * Math.exp(-gamma * vv[j]);
    fft(re, im); tables.push({ re, im }); perKsMs.push(clock() - t);
  }
  // For any |integrand|<=1, the omitted Gaussian depth tails bound the error,
  // including all Y<0 and reciprocal |v|->infinity contributions at this row.
  const depthTailBound = 2 * phi(L) / L; // Mills inequality, exact-arithmetic bound.
  // Bound E[|V-centerV|^4 1{lowY<=Y<=highY}] by interval upper sums in Y.
  // This bounds the fourth derivative of each centered transform (damping<=1).
  let fourthMomentBound = 0;
  const pieces = 4096, dy = (highY - lowY) / pieces;
  for (let j = 0; j < pieces; j++) {
    const a = lowY + j * dy, b = a + dy, nearest = Math.max(a, Math.min(b, d0));
    const pMax = phi((nearest - d0) / sigma) / sigma;
    const rMax = Math.max(Math.abs(1 / a - centerV), Math.abs(1 / b - centerV));
    fourthMomentBound += dy * pMax * rMax ** 4;
  }
  // Four-point cubic interpolation at nodes j-1,j,j+1,j+2. Max product/4! = 3/128.
  const interpolationBound = 3 / 128 * (1 / T) ** 4 * TAU ** 4 * fourthMomentBound;
  const setupMs = clock() - started;
  function query(ks, kt, x) {
    if (!Number.isInteger(ks) || Math.abs(ks) > maxKs || !Number.isFinite(kt) || !Number.isFinite(x)) throw new RangeError('Query outside finite table contract.');
    if (ks === 0 && kt === 0) return [1, 0]; // full-source normalization, not a renormalized truncated density
    const frequency = A * ks * (x - CENTER_X) + B * kt;
    const grid = frequency * T, j = Math.floor(grid), t = grid - j;
    if (j - 1 < -N / 2 || j + 2 >= N / 2) throw new RangeError('Frequency exceeds FFT Nyquist range; do not wrap it.');
    const w = [-t * (t - 1) * (t - 2) / 6, (t + 1) * (t - 1) * (t - 2) / 2,
      -(t + 1) * t * (t - 2) / 2, (t + 1) * t * (t - 1) / 6];
    const table = tables[Math.abs(ks)]; let r = 0, i = 0;
    for (let n = 0; n < 4; n++) {
      const k = j - 1 + n, at = (k + N) % N, sign = (k & 1) ? -1 : 1;
      r += w[n] * sign * table.re[at] * dv; i += w[n] * sign * table.im[at] * dv;
    }
    const phase = TAU * frequency * centerV, c = Math.cos(phase), s = Math.sin(phase);
    return [r * c - i * s, r * s + i * c];
  }
  return { query, protocol: { d0, sigma, L, T, N, maxKs, activeNodes, lowY, highY, lowV, highV, centerV,
    deltaV: dv, frequencyStep: 1 / T, nyquist: N / (2 * T), tableBytes: 16 * N * (maxKs + 1),
    depthTailBound, fourthMomentBound, interpolationBound, setupMs, perKsMs,
    sampledNormalization: tables[0].re[0] * dv } };
}

// Independent coordinate reference: integrate exact X expectation directly in
// depth Y, with no reciprocal FFT, interpolation, or local Taylor model.
function directMultiplier(ks, kt, x, N) {
  const L = 9, dy = 2 * L * SIGMA / N, f = A * ks * (x - CENTER_X) + B * kt;
  const gamma = 2 * Math.PI ** 2 * SIGMA ** 2 * A ** 2 * ks ** 2;
  let re = 0, im = 0;
  for (let j = 0; j < N; j++) {
    const deltaY = -L * SIGMA + (j + 0.5) * dy, y = D0 + deltaY;
    const w = phi(deltaY / SIGMA) / SIGMA * dy * Math.exp(-gamma / (y * y));
    const theta = TAU * f / y; re += w * Math.cos(theta); im += w * Math.sin(theta);
  }
  return [re, im];
}

// J1 from its periodic Bessel integral, independently converged in the report.
function j1Integral(z, N = 256) {
  let sum = 0;
  for (let j = 0; j < N; j++) { const t = TAU * (j + 0.5) / N; sum += Math.cos(z * Math.sin(t) - t); }
  return sum / N;
}
function circleCoefficients(K, N = 256) {
  const list = [], area = Math.PI * RADIUS ** 2;
  for (let ks = 0; ks <= K; ks++) for (let kt = ks === 0 ? 1 : -K; kt <= K; kt++) {
    const z = TAU * RADIUS * Math.hypot(ks, kt), sign = (ks + kt) % 2 === 0 ? 1 : -1;
    list.push({ ks, kt, c: sign * area * 2 * j1Integral(z, N) / z });
  }
  return { area, list };
}
function circlesFromRow(row, coefficients, x) {
  let sum = coefficients.area;
  for (const { ks, kt, c } of coefficients.list) sum += 2 * c * row.query(ks, kt, x)[0];
  return LIGHT * sum;
}

// erfCody is appended below from the read-only exact-y reference, preserving
// the author's high-accuracy real CDF utility. Geometry integration is separate.

function exactCirclesY(x, N = 400000) {
  const L = 9, step = 2 * L * SIGMA / N, X0 = x - CENTER_X;
  let total = 0;
  for (let j = 0; j < N; j++) {
    const dy = -L * SIGMA + (j + 0.5) * step, y = D0 + dy;
    const t = B / y, v = t - Math.floor(t), h2 = RADIUS ** 2 - (v - 0.5) ** 2;
    if (h2 <= 0) continue;
    const h = Math.sqrt(h2), u0 = A * (X0 - L * SIGMA) / y, u1 = A * (X0 + L * SIGMA) / y;
    let inner = 0;
    for (let k = Math.floor(Math.min(u0, u1)) - 1; k <= Math.ceil(Math.max(u0, u1)) + 1; k++) {
      const a = (k + 0.5 - h) * y / A - X0, b = (k + 0.5 + h) * y / A - X0;
      const lo = Math.max(-L * SIGMA, Math.min(a, b)), hi = Math.min(L * SIGMA, Math.max(a, b));
      if (lo < hi) inner += 0.5 * (erfCody(hi / (SIGMA * Math.SQRT2)) - erfCody(lo / (SIGMA * Math.SQRT2)));
    }
    total += phi(dy / SIGMA) / SIGMA * step * inner;
  }
  return LIGHT * total;
}

function legendre(N) {
  const x = new Float64Array(N), w = new Float64Array(N);
  for (let j = 0; j < Math.ceil(N / 2); j++) {
    let z = Math.cos(Math.PI * (j + 0.75) / (N + 0.5)), derivative;
    for (let step = 0; step < 20; step++) {
      let p0 = 1, p1 = z;
      for (let k = 2; k <= N; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
      derivative = N * (z * p1 - p0) / (z * z - 1);
      const delta = p1 / derivative; z -= delta;
      if (Math.abs(delta) < 2e-15) break;
    }
    x[j] = -z; x[N - 1 - j] = z;
    w[j] = w[N - 1 - j] = 2 / ((1 - z * z) * derivative * derivative);
  }
  return { x, w };
}

// Exact vertical support events: t-count n+1/2 +/- radius. The cosine
// parameterization removes the square-root opening of each disc interval.
// This is still integration in depth Y, independent of the Fourier row table.
function exactCirclesPanels(x, order) {
  const lowY = D0 - 9 * SIGMA, highY = D0 + 9 * SIGMA, X0 = x - CENTER_X;
  const gl = legendre(order); let total = 0, panels = 0;
  for (let n = Math.floor(B / lowY) - 1; n <= Math.ceil(B / highY) + 1; n++) {
    const ya = B / (n + 0.5 - RADIUS), yb = B / (n + 0.5 + RADIUS);
    const a = Math.max(lowY, Math.min(ya, yb)), b = Math.min(highY, Math.max(ya, yb));
    if (!(a < b)) continue;
    panels++;
    for (let j = 0; j < order; j++) {
      const theta = Math.PI / 2 * (gl.x[j] + 1), y = (a + b) / 2 - (b - a) / 2 * Math.cos(theta);
      const jacobian = (b - a) / 2 * Math.sin(theta) * Math.PI / 2;
      const v = B / y - n, h = Math.sqrt(Math.max(0, RADIUS ** 2 - (v - 0.5) ** 2));
      const u0 = A * (X0 - 9 * SIGMA) / y, u1 = A * (X0 + 9 * SIGMA) / y;
      let inner = 0;
      for (let k = Math.floor(Math.min(u0, u1)) - 1; k <= Math.ceil(Math.max(u0, u1)) + 1; k++) {
        const da = (k + 0.5 - h) * y / A - X0, db = (k + 0.5 + h) * y / A - X0;
        const lo = Math.max(-9 * SIGMA, Math.min(da, db)), hi = Math.min(9 * SIGMA, Math.max(da, db));
        if (lo < hi) inner += 0.5 * (erfCody(hi / (SIGMA * Math.SQRT2)) - erfCody(lo / (SIGMA * Math.SQRT2)));
      }
      total += gl.w[j] * jacobian * phi((y - D0) / SIGMA) / SIGMA * inner;
    }
  }
  return { value: LIGHT * total, panels, order };
}

async function main() {
  const started = new Date(), wall = clock();
  process.env.FJET_LIB = '1';
  const yb = await import('../../../../tools/exp/fjet-yb.mjs');
  assert.equal(yb.SIG, SIGMA, 'Unset FJET_SIG: this frozen fixture uses sigma=0.5.');
  const circles = yb.CASES.find(x => x.name === 'circles');
  // Compare the manually exposed source coordinates and indicator against the
  // actual numeric shader, on both sides of the horizon (excluding its pole).
  let sourceChecks = 0;
  for (const x of [0, 30.25, 120.7, 240, 300, 479]) for (const y of [-2, -0.7, 1, 5, 6.25]) {
    const u = A * (x - CENTER_X) / (y + 1), v = B / (y + 1);
    const radius = Math.hypot(u - Math.floor(u) - 0.5, v - Math.floor(v) - 0.5);
    const value = LIGHT * (0.5 - 0.5 * Math.sign(radius - RADIUS));
    assert.ok(Math.abs(value - circles.eval(yb.NUM, x, y, false)[0]) < 1e-14); sourceChecks++;
  }
  const configs = [{ T: 2, N: 65536 }, { T: 4, N: 131072 }, { T: 4, N: 262144 }];
  const rows = configs.map(buildRow), final = rows[2];
  assert.throws(() => buildRow({ d0: 0.2 }), /two branches/);
  assert.throws(() => final.query(1, 100000, 240), /Nyquist/);
  const inputs = [];
  for (const ks of [0, 1, 2, 6, 12]) for (const x of [0, 30.25, 239.75, 300.125, 479]) {
    inputs.push([ks, 0, x], [ks, 1, x], [ks, -Math.round(ks * (x - CENTER_X) / 240), x]);
  }
  inputs.push([0, 0.01, 240], [0, 0.0137, 240], [0, 0.03125, 240], [0, 12, 240], [12, -12, 0], [-2, 1, 300.125]);
  const modeResults = [], referenceTiming = [];
  for (const [ks, kt, x] of inputs) {
    const t = clock(), a = directMultiplier(ks, kt, x, 32768), b = directMultiplier(ks, kt, x, 65536);
    referenceTiming.push(clock() - t);
    const c = rows.map(row => row.query(ks, kt, x));
    const err = distance(c[2], b), convergence = distance(a, b);
    assert.ok(convergence < 3e-11, `Unconverged depth reference ${ks},${kt},${x}: ${convergence}`);
    assert.ok(err < 2e-8, `Transform error ${ks},${kt},${x}: ${err}`);
    modeResults.push({ ks, kt, x, reference: b, transform: c[2], absError: err, referenceConvergence: convergence,
      frequencyRefinement: distance(c[0], c[1]), densityGridRefinement: distance(c[1], c[2]) });
  }
  for (const row of rows) assert.ok(Math.abs(row.protocol.sampledNormalization - 1) < 3e-13);
  const coeffStarted = clock(), coeffs = [4, 8, 12].map(K => circleCoefficients(K));
  const coeffMs = clock() - coeffStarted, coarseCoeffs = circleCoefficients(12, 128);
  const coefficientConvergence = Math.max(...coeffs[2].list.map((v, i) => Math.abs(v.c - coarseCoeffs.list[i].c)));
  assert.ok(coefficientConvergence < 3e-14);
  const pixelResults = [];
  for (const x of [0, 30, 120, 239.75, 240, 300, 479]) {
    const start = clock(), panelRefs = [16, 32, 64].map(N => {
      const t = clock(), r = exactCirclesPanels(x, N); return { ...r, ms: clock() - t };
    }), refs = panelRefs.map(x => x.value);
    const referenceMs = clock() - start, values = coeffs.map(c => circlesFromRow(final, c, x));
    const error = Math.abs(values[2] - refs[2]), convergence = Math.abs(refs[2] - refs[1]);
    assert.ok(convergence < 2e-11, `Unconverged circle reference ${x}: ${convergence}`);
    assert.ok(error < 6e-7, `Circle reconstruction ${x}: ${error}`);
    const midpointStarted = clock(), midpointReference = exactCirclesY(x, 400000), midpointMs = clock() - midpointStarted;
    assert.ok(Math.abs(midpointReference - refs[2]) < 3e-6, 'Panel reference disagrees with dense midpoint check.');
    pixelResults.push({ x, y: 5, references: refs, panelOrders: [16, 32, 64], panels: panelRefs[2].panels, referenceConvergence: convergence, referenceMs,
      convergedReferenceMs: panelRefs[2].ms, productionVsFineGrid: Math.abs(circlesFromRow(rows[1], coeffs[2], x) - values[2]),
      midpointReference, midpointMs, midpointDifference: Math.abs(midpointReference - refs[2]),
      modeCutoffs: [4, 8, 12], values, error, cutoffRefinement: Math.abs(values[2] - values[1]) });
  }
  // Warm timings. Include interpolation and phase restoration. Keep a checksum
  // so a JS engine cannot legitimately erase the measured calculations.
  const measured = rows[1], timedInputs = inputs.filter(([ks, kt]) => ks !== 0 || kt !== 0);
  let checksum = 0;
  for (let i = 0; i < 10000; i++) checksum += measured.query(...timedInputs[i % timedInputs.length])[0];
  const batches = [];
  for (let r = 0; r < 5; r++) {
    const t = clock();
    for (let i = 0; i < 200000; i++) checksum += measured.query(...timedInputs[i % timedInputs.length])[0];
    batches.push(clock() - t);
  }
  const rowBatches = [];
  for (let r = 0; r < 5; r++) {
    const t = clock();
    for (let x = 0; x < 480; x++) checksum += circlesFromRow(measured, coeffs[2], x);
    rowBatches.push(clock() - t);
  }
  const singleReferenceTimes = [];
  for (const q of timedInputs.slice(0, 20)) {
    const t = clock(); checksum += directMultiplier(...q, 65536)[0]; singleReferenceTimes.push(clock() - t);
  }
  const sourceHashes = {};
  for (const name of ['fjet-yb.mjs', 'fjet-exacty.mjs']) sourceHashes[name] = createHash('sha256')
    .update(readFileSync(new URL(`../../../../tools/exp/${name}`, import.meta.url))).digest('hex');
  const result = {
    timestamp: started.toISOString(), machine: { node: process.version, cpu: cpus()[0]?.model, platform: process.platform, arch: process.arch },
    sourceHashes,
    contract: { scene: 'plain circles', rowY: 5, sigma: SIGMA, sourceChecks,
      source: 's/20=-2.5*(x-240+X)/(6+Y), t/20=-600/(6+Y), X,Y independent N(0,0.5²)',
      horizon: 'Source algebra continues on both signs of depth; pole has zero Gaussian probability. No front-plane clipping or renormalization.',
      tailScope: 'Rigorous exact-arithmetic Mills bound for omitted depth mass; numerical FFT and quadrature errors are convergence-tested, not interval-certified.' },
    tables: rows.map(row => row.protocol), modes: modeResults, coefficientConvergence, coefficientSetupMs: coeffMs, pixels: pixelResults,
    timing: { tableConfigurationIndex: 1, queryTimingExcludesConstantMode: true, transformQueryNsMedian: median(batches) * 1e6 / 200000, queryBatchMs: batches,
      directMultiplier65536MsMedian: median(singleReferenceTimes), directMultiplierPairMsMedian: median(referenceTiming),
      complete480PixelRowMsMedian: median(rowBatches), completeRowBatchMs: rowBatches,
      queriesPerCirclePixel: coeffs[2].list.length, productionSetupPlus480PixelsMs: measured.protocol.setupMs + median(rowBatches),
      warning: 'Float64 CPU/JIT microbenchmarks on this machine, not GPU timing, not a frame budget, and not a compiler comparison.' },
    summary: { maxModeError: Math.max(...modeResults.map(x => x.absError)),
      maxReferenceModeConvergence: Math.max(...modeResults.map(x => x.referenceConvergence)),
      maxDensityGridRefinement: Math.max(...modeResults.map(x => x.densityGridRefinement)),
      maxFrequencyRefinement: Math.max(...modeResults.map(x => x.frequencyRefinement)),
      maxCircleError: Math.max(...pixelResults.map(x => x.error)),
      maxCircleReferenceConvergence: Math.max(...pixelResults.map(x => x.referenceConvergence)),
      maxCircleCutoffRefinement: Math.max(...pixelResults.map(x => x.cutoffRefinement)), checksum, wallMs: clock() - wall },
    gates: 'all passed',
  };
  const args = process.argv.slice(2), at = args.indexOf('--out');
  const out = at >= 0 ? args[at + 1] : args.find(a => a.startsWith('--out='))?.slice(6)
    ?? fileURLToPath(new URL(`row-results-${started.toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url));
  if (!out) throw new Error('--out needs a path.');
  writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ out, summary: result.summary, timing: result.timing, tables: result.tables.map(({ setupMs, tableBytes, interpolationBound, depthTailBound }) => ({ setupMs, tableBytes, interpolationBound, depthTailBound })), gates: result.gates }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) await main();

// CDF utility copied unchanged from paper/tools/exp/fjet-exacty.mjs.
function erfCody(x) {
  // Cody's rational Chebyshev approximation (1969), accuracy ~1e-16
  const a = [3.16112374387056560e00, 1.13864154151050156e02, 3.77485237685302021e02, 3.20937758913846947e03, 1.85777706184603153e-1];
  const b = [2.36012909523441209e01, 2.44024637934444173e02, 1.28261652607737228e03, 2.84423683343917062e03];
  const c = [5.64188496988670089e-1, 8.88314979438837594e00, 6.61191906371416295e01, 2.98635138197400131e02, 8.81952221241769090e02, 1.71204761263407058e03, 2.05107837782607147e03, 1.23033935479799725e03, 2.15311535474403846e-8];
  const dd = [1.57449261107098347e01, 1.17693950891312499e02, 5.37181101862009858e02, 1.62138957456669019e03, 3.29079923573345963e03, 4.36261909014324716e03, 3.43936767414372164e03, 1.23033935480374942e03];
  const p = [3.05326634961232344e-1, 3.60344899949804439e-1, 1.25781726111229246e-1, 1.60837851487422766e-2, 6.58749161529837803e-4, 1.63153871373020978e-2];
  const q = [2.56852019228982242e00, 1.87295284992346725e00, 5.27905102951428412e-1, 6.05183413124413191e-2, 2.33520497626869185e-3];
  const ax = Math.abs(x);
  let res;
  if (ax <= 0.46875) {
    const z = ax * ax; let xn = a[4] * z, xd = z;
    for (let i = 0; i < 3; i++) { xn = (xn + a[i]) * z; xd = (xd + b[i]) * z; }
    res = x * (xn + a[3]) / (xd + b[3]);
    return res;
  } else if (ax <= 4) {
    let xn = c[8] * ax, xd = ax;
    for (let i = 0; i < 7; i++) { xn = (xn + c[i]) * ax; xd = (xd + dd[i]) * ax; }
    res = (xn + c[7]) / (xd + dd[7]);
    const z = Math.floor(ax * 16) / 16; const del = (ax - z) * (ax + z);
    res = Math.exp(-z * z) * Math.exp(-del) * res;
  } else {
    const z = 1 / (ax * ax); let xn = p[5] * z, xd = z;
    for (let i = 0; i < 4; i++) { xn = (xn + p[i]) * z; xd = (xd + q[i]) * z; }
    res = z * (xn + p[4]) / (xd + q[4]);
    res = (0.5641895835477563 - res) / ax;
    const zz = Math.floor(ax * 16) / 16; const del = (ax - zz) * (ax + zz);
    res = Math.exp(-zz * zz) * Math.exp(-del) * res;
  }
  return x < 0 ? -(1 - res) : 1 - res; // erfc -> erf
}
