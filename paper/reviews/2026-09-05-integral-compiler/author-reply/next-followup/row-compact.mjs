/**
 * Compact characteristic-function compiler for the exact plane perspective.
 * No dense FFT, no source/app imports. Float64 CPU implementation.
 * Every omitted mode/frequency has a bound for the actual reciprocal measure.
 * Analytic bounds below assume exact arithmetic; the implementation pads bound
 * arithmetic but is not a directed-rounding special-function certificate.
 */
const TAU = 2 * Math.PI;
const factorial = n => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };
const binomial = (n, k) => factorial(n) / (factorial(k) * factorial(n - k));
const phi = x => Math.exp(-x * x / 2) / Math.sqrt(TAU);
const clock = () => performance.now();

function memoryMeter() {
  let live = 0, peak = 0, allocated = 0;
  const owned = new Set();
  const checkpoints = [];
  return {
    f64(n) { const a = new Float64Array(n); owned.add(a); live += a.byteLength; allocated += a.byteLength; peak = Math.max(peak, live); return a; },
    release(a) { if (owned.delete(a)) live -= a.byteLength; },
    checkpoint(name) { if (globalThis.process?.memoryUsage) checkpoints.push({ name, ...process.memoryUsage() }); },
    report() { return { retainedNumericBytes: live, peakLiveNumericBytes: peak, cumulativeNumericAllocatedBytes: allocated, processCheckpoints: checkpoints }; },
  };
}

function multiply(a, b, mem) {
  const p = mem.f64(a.length + b.length - 1);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) p[i + j] += a[i] * b[j];
  return p;
}
function polynomialRange(p, lo, hi) {
  let a = 0, b = 0, absolute = 0;
  const z = Math.max(Math.abs(lo), Math.abs(hi));
  for (let j = p.length - 1; j >= 0; j--) {
    const v0 = a * lo, v1 = a * hi, v2 = b * lo, v3 = b * hi;
    a = Math.min(v0, v1, v2, v3) + p[j]; b = Math.max(v0, v1, v2, v3) + p[j];
    absolute = absolute * z + Math.abs(p[j]);
  }
  // Cover ordinary Horner roundoff generously. This is not interval arithmetic
  // for the transcendental constants/functions in the entire calculation.
  return Math.max(Math.abs(a), Math.abs(b)) + 1e-11 * absolute;
}

function legendre8(mem) {
  const x = mem.f64(8), w = mem.f64(8);
  for (let j = 0; j < 4; j++) {
    let z = Math.cos(Math.PI * (j + 0.75) / 8.5), derivative;
    for (let step = 0; step < 20; step++) {
      let p0 = 1, p1 = z;
      for (let k = 2; k <= 8; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
      derivative = 8 * (z * p1 - p0) / (z * z - 1);
      const delta = p1 / derivative; z -= delta; if (Math.abs(delta) < 1e-15) break;
    }
    x[j] = -z; x[7 - j] = z; w[j] = w[7 - j] = 2 / ((1 - z * z) * derivative * derivative);
  }
  return { x, w };
}

/**
 * query(k_s,k_t,x) returns E exp(2pi i(k_s*u+k_t*w)) for
 * u=A*(x-centerX+X)/(d0+Y), w=B/(d0+Y), X,Y iid N(0,sigma²).
 * Integer k_s with |k_s|<=maxKs; real k_t and x. Full unclipped Gaussian source.
 */
export function buildCompactRow({ d0 = 6, sigma = 0.5, A = -2.5, B = -600, centerX = 240,
  maxKs = 12, absTol = 1e-8, L = 8, degree = 15, bins = 512,
  maxSegments = 4096, maxQuadratureNodes = 65536, quadratureRefinement = 1 } = {}) {
  const started = clock(), mem = memoryMeter(); mem.checkpoint('start');
  if (![d0, sigma, A, B, centerX, absTol, L].every(Number.isFinite) || !(sigma > 0 && absTol > 0 && L >= 6)) throw new RangeError('Finite positive sigma/tolerance and L>=6 are required.');
  if (!(d0 > L * sigma)) throw new RangeError('Pole-domain refusal: kept depth interval must be positive; both branches and a pole-tail budget are required otherwise.');
  if (!Number.isInteger(maxKs) || maxKs < 0 || maxKs > 256 || degree !== 15 || !Number.isInteger(bins) || bins < 128 || ![1,2,4].includes(quadratureRefinement)) throw new RangeError('Unsupported finite construction budget.');
  const n = degree + 1, tailBound = 2 * phi(L) / L;
  if (tailBound > absTol * 0.01) throw new RangeError('Depth tail exceeds allocated error; increase L while keeping the pole outside.');
  const lowD = d0 - L * sigma, highD = d0 + L * sigma, lowV = 1 / highD, highV = 1 / lowD;
  if (!(Number.isFinite(sigma * sigma) && sigma * sigma > 0 && lowD < highD && lowV > 0 && lowV < highV && Number.isFinite(highV))) throw new RangeError('Unrepresentable finite depth/window scale.');
  const centerV = 1 / d0, interval = highV - lowV, zeroBudget = absTol * 0.2, interpolationBudget = absTol * 0.2;
  // Perturbing each Chebyshev sample by e perturbs every nonconstant DCT
  // coefficient by <=2e; |T_j|<=1 gives the conservative (2n-1)e bound.
  const sampleBudget = absTol * 0.2 / (2 * n - 1);
  const descriptors = mem.f64((maxKs + 1) * 5); // cutoff, segments, coefficient offset, norm bound, interpolation bound
  const metadata = [], active = [];
  const D = mem.f64(2); D[0] = d0; D[1] = sigma;
  const D2 = multiply(D, D, mem), D3 = multiply(D2, D, mem);

  for (let ks = 0; ks <= maxKs; ks++) {
    const groupStarted = clock(), gamma = 2 * Math.PI ** 2 * sigma ** 2 * A ** 2 * ks ** 2;
    let normBound = 0, momentBound = 0;
    for (let b = 0; b < bins; b++) {
      const za = -L + 2 * L * b / bins, zb = za + 2 * L / bins, da = d0 + sigma * za, db = d0 + sigma * zb;
      const nearest = Math.max(za, Math.min(zb, 0)), density = phi(nearest) / sigma * Math.exp(-gamma / (db * db));
      const mass = (db - da) * density;
      normBound += mass;
      momentBound += mass * Math.max(Math.abs(1 / da - centerV), Math.abs(1 / db - centerV)) ** n;
    }
    normBound *= 1 + 1e-10; momentBound *= 1 + 1e-10;
    descriptors[5 * ks + 3] = normBound + tailBound;
    if (normBound + tailBound <= zeroBudget) {
      metadata.push({ ks, dropped: true, uniformModulusBound: normBound + tailBound, setupMs: clock() - groupStarted });
      continue;
    }

    // g^(p)(v)=g(v) R_p(z)/d^p, d=d0+sigma*z, v=1/d.
    // R_(p+1)=-d^3/sigma R'_p+[(p-2)d²+d³*z/sigma-2gamma]R_p.
    const polys = [], first = mem.f64(1); first[0] = 1; polys.push(first);
    for (let p = 0; p < 16; p++) {
      const prev = polys[p], next = mem.f64(prev.length + 4);
      for (let j = 1; j < prev.length; j++) for (let k = 0; k < D3.length; k++) next[j - 1 + k] -= j * prev[j] * D3[k] / sigma;
      for (let j = 0; j < prev.length; j++) {
        for (let k = 0; k < D2.length; k++) next[j + k] += (p - 2) * D2[k] * prev[j];
        for (let k = 0; k < D3.length; k++) next[j + k + 1] += D3[k] * prev[j] / sigma;
        next[j] -= 2 * gamma * prev[j];
      }
      polys.push(next);
    }
    const l1 = mem.f64(17), sup = mem.f64(17), boundary = mem.f64(17);
    for (let b = 0; b < bins; b++) {
      const za = -L + 2 * L * b / bins, zb = za + 2 * L / bins, da = d0 + sigma * za, db = d0 + sigma * zb;
      const nearest = Math.max(za, Math.min(zb, 0)), density = phi(nearest) / sigma * Math.exp(-gamma / (db * db));
      let power = 1;
      for (let p = 0; p <= 16; p++) {
        const bound = polynomialRange(polys[p], za, zb) / power;
        l1[p] += (db - da) * density * bound;
        sup[p] = Math.max(sup[p], db * db * density * bound);
        power *= da;
      }
    }
    for (let p = 0; p <= 16; p++) {
      for (const [z, d] of [[-L, lowD], [L, highD]]) boundary[p] += d * d * phi(z) / sigma * Math.exp(-gamma / (d * d)) * polynomialRange(polys[p], z, z) / d ** p;
      l1[p] *= 1.000001; sup[p] *= 1.000001; boundary[p] *= 1.000001;
    }
    const fourierBound = f => {
      const w = TAU * f; let power = 1, edge = 0, best = normBound;
      for (let p = 1; p <= 8; p++) { power *= w; edge += boundary[p - 1] / power; best = Math.min(best, edge + l1[p] / power); }
      return best + tailBound;
    };
    let cutoff = 1;
    while (fourierBound(cutoff) > zeroBudget) { cutoff *= 2; if (cutoff > 1e8) throw new RangeError('Unresolved reciprocal-frequency tail.'); }
    let left = cutoff / 2, right = cutoff;
    for (let j = 0; j < 40; j++) { const mid = (left + right) / 2; if (fourierBound(mid) <= zeroBudget) right = mid; else left = mid; }
    cutoff = right * 1.000001;
    const widthLimit = 2 / Math.PI * (interpolationBudget * factorial(n) / (2 * momentBound)) ** (1 / n);
    const segments = Math.max(1, Math.ceil(cutoff / widthLimit));
    if (segments > maxSegments) throw new RangeError('Chebyshev segment budget exceeded.');
    const width = cutoff / segments;
    const interpolationBound = 2 * (Math.PI * width / 2) ** n * momentBound / factorial(n);
    let integrandDerivativeBound = 0;
    for (let p = 0; p <= 16; p++) integrandDerivativeBound += binomial(16, p) * (TAU * cutoff) ** (16 - p) * sup[p];
    const gaussConstant = factorial(8) ** 4 / (17 * factorial(16) ** 3);
    const panels = quadratureRefinement * Math.max(1, Math.ceil((gaussConstant * interval ** 17 * integrandDerivativeBound / sampleBudget) ** (1 / 16)));
    if (panels * 8 > maxQuadratureNodes || !Number.isFinite(integrandDerivativeBound)) throw new RangeError('Quadrature construction budget exceeded.');
    const quadratureBound = gaussConstant * interval ** 17 * integrandDerivativeBound / panels ** 16;
    const m = { ks, gamma, dropped: false, cutoff, segments, width, nodes: panels * 8, panels,
      uniformModulusBound: normBound + tailBound, omittedFrequencyBound: fourierBound(cutoff),
      interpolationBound, quadratureBound, sampleErrorAmplification: 2 * n - 1,
      analyticQueryErrorBound: tailBound + interpolationBound + (2 * n - 1) * quadratureBound,
      boundSetupMs: clock() - groupStarted };
    metadata.push(m); active.push(m);
    descriptors[5 * ks] = cutoff; descriptors[5 * ks + 1] = segments; descriptors[5 * ks + 4] = interpolationBound;
    polys.forEach(p => mem.release(p)); mem.release(l1); mem.release(sup); mem.release(boundary);
  }
  mem.release(D); mem.release(D2); mem.release(D3); mem.checkpoint('bounds complete');
  const totalSegments = active.reduce((s, m) => s + m.segments, 0), coefficients = mem.f64(totalSegments * n * 2);
  const gl = legendre8(mem), angles = mem.f64(n), cosines = mem.f64(n * n), re = mem.f64(n), im = mem.f64(n);
  for (let j = 0; j < n; j++) { const angle = Math.PI * (j + 0.5) / n; angles[j] = Math.cos(angle); for (let k = 0; k < n; k++) cosines[k * n + j] = Math.cos(k * angle); }
  let offset = 0;
  for (const m of active) {
    const stageStarted = clock(), v = mem.f64(m.nodes), weights = mem.f64(m.nodes), step = interval / m.panels;
    descriptors[5 * m.ks + 2] = offset;
    for (let p = 0; p < m.panels; p++) for (let j = 0; j < 8; j++) {
      const at = 8 * p + j, vv = lowV + (p + 0.5 + 0.5 * gl.x[j]) * step;
      v[at] = vv - centerV;
      weights[at] = 0.5 * step * gl.w[j] * phi((1 / vv - d0) / sigma) / (sigma * vv * vv) * Math.exp(-m.gamma * vv * vv);
    }
    for (let segment = 0; segment < m.segments; segment++) {
      const mid = (segment + 0.5) * m.width;
      for (let j = 0; j < n; j++) {
        const frequency = mid + 0.5 * m.width * angles[j]; let r = 0, t = 0;
        for (let k = 0; k < m.nodes; k++) { const phase = TAU * frequency * v[k]; r += weights[k] * Math.cos(phase); t += weights[k] * Math.sin(phase); }
        re[j] = r; im[j] = t;
      }
      for (let k = 0; k < n; k++) {
        let r = 0, t = 0;
        for (let j = 0; j < n; j++) { r += re[j] * cosines[k * n + j]; t += im[j] * cosines[k * n + j]; }
        coefficients[offset++] = (k === 0 ? 1 : 2) * r / n; coefficients[offset++] = (k === 0 ? 1 : 2) * t / n;
      }
    }
    mem.checkpoint(`ks=${m.ks} quadrature allocated`); mem.release(v); mem.release(weights); m.coefficientSetupMs = clock() - stageStarted;
  }
  for (const a of [gl.x, gl.w, angles, cosines, re, im]) mem.release(a);
  mem.checkpoint('finished');
  function queryFrequencyInto(ks, frequency, out, at = 0) {
    if (!Number.isInteger(ks) || Math.abs(ks) > maxKs || !Number.isFinite(frequency)) throw new RangeError('Query outside finite harmonic/frequency contract.');
    if (ks === 0 && frequency === 0) { out[at] = 1; out[at + 1] = 0; return out; }
    const d = 5 * Math.abs(ks), cutoff = descriptors[d], f = Math.abs(frequency);
    if (cutoff === 0 || f >= cutoff) { out[at] = 0; out[at + 1] = 0; return out; }
    const segments = descriptors[d + 1], width = cutoff / segments, segment = Math.min(segments - 1, Math.floor(f / width));
    const z = 2 * (f / width - segment) - 1, off = descriptors[d + 2] + segment * n * 2;
    let r1 = 0, r2 = 0, i1 = 0, i2 = 0;
    for (let k = n - 1; k >= 1; k--) { const r = 2 * z * r1 - r2 + coefficients[off + 2 * k], i = 2 * z * i1 - i2 + coefficients[off + 2 * k + 1]; r2 = r1; r1 = r; i2 = i1; i1 = i; }
    const re = z * r1 - r2 + coefficients[off], im = frequency === 0 ? 0 : (z * i1 - i2 + coefficients[off + 1]) * (frequency < 0 ? -1 : 1);
    const phase = TAU * frequency * centerV, c = Math.cos(phase), s = Math.sin(phase);
    out[at] = re * c - im * s; out[at + 1] = re * s + im * c; return out;
  }
  const queryFrequency = (ks, frequency) => queryFrequencyInto(ks, frequency, [0, 0]);
  const query = (ks, kt, x) => {
    if (!Number.isFinite(kt) || !Number.isFinite(x)) throw new RangeError('Finite coordinate and vertical harmonic required.');
    return queryFrequency(ks, A * ks * (x - centerX) + B * kt);
  };
  return { query, queryFrequency, queryFrequencyInto, protocol: { d0, sigma, A, B, centerX, maxKs, absTol, L, degree, bins,
    keptDepth: [lowD, highD], keptReciprocal: [lowV, highV], tailBound, zeroBudget, interpolationBudget, sampleBudget,
    totalSegments, metadata, memory: mem.report(), setupMs: clock() - started,
    boundContract: 'Exact-arithmetic truncation/interpolation/Gauss/IBP bounds with padded Float64 bound evaluation; not a directed-rounding certificate.' } };
}
