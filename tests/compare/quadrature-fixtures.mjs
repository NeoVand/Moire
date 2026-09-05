// Independent targets for the shared homography kernel's changed quadrature.
// This module deliberately imports no shader, compiler, or shader quadrature.
// The source is the equal-parity checker or the union of radius-5/12 discs at
// (i + 1/2, j + 1/2), filtered by the same infinite Gaussian as the GPU API.

const ROOT_TAU = Math.sqrt(2 * Math.PI);
const RADIUS = 5 / 12;
const EXTENT = 9;

export const normalDensity = x => Math.exp(-x * x / 2) / ROOT_TAU;

// Integrate the smooth Gaussian itself, rather than using the kernel's CDF
// approximation. Sixteen-point Gauss-Legendre on intervals no wider than 1
// agrees with the known CDF targets below to double precision.
function gaussLegendre(order) {
  const nodes = [];
  for (let i = 0; i < order; i++) {
    let x = Math.cos(Math.PI * (i + 0.75) / (order + 0.5));
    let derivative;
    for (let iteration = 0; iteration < 20; iteration++) {
      let p = 1, previous = 0;
      for (let k = 1; k <= order; k++) {
        const next = ((2 * k - 1) * x * p - (k - 1) * previous) / k;
        previous = p; p = next;
      }
      derivative = order * (x * p - previous) / (x * x - 1);
      const delta = p / derivative;
      x -= delta;
      if (Math.abs(delta) < 2e-16) break;
    }
    nodes.push([x, 2 / ((1 - x * x) * derivative * derivative)]);
  }
  return nodes;
}
const CDF_NODES = gaussLegendre(16);

export function normalCDF(x) {
  if (Number.isNaN(x)) throw new TypeError('CDF argument must be a number.');
  if (x <= -10) return 0;
  if (x >= 10) return 1;
  const extent = Math.abs(x), panels = Math.max(1, Math.ceil(extent));
  let integral = 0;
  for (let i = 0; i < panels; i++) {
    const half = extent / (2 * panels), mid = (2 * i + 1) * half;
    for (const [node, weight] of CDF_NODES) integral += half * weight * normalDensity(mid + half * node);
  }
  return Math.max(0, Math.min(1, 0.5 + Math.sign(x) * integral));
}

function adaptiveSimpson(fn, a, b, tolerance) {
  if (!(b > a)) return 0;
  const recurse = (lo, hi, fa, fm, fb, whole, tol, depth) => {
    const mid = (lo + hi) / 2;
    const fl = fn((lo + mid) / 2), fr = fn((mid + hi) / 2);
    const left = (mid - lo) * (fa + 4 * fl + fm) / 6;
    const right = (hi - mid) * (fm + 4 * fr + fb) / 6;
    const delta = left + right - whole;
    if (Math.abs(delta) <= 15 * tol) return left + right + delta / 15;
    if (depth === 0) throw new Error('Independent conditional integral did not converge.');
    return recurse(lo, mid, fa, fl, fm, left, tol / 2, depth - 1)
      + recurse(mid, hi, fm, fr, fb, right, tol / 2, depth - 1);
  };
  const fa = fn(a), fm = fn((a + b) / 2), fb = fn(b);
  return recurse(a, b, fa, fm, fb, (b - a) * (fa + 4 * fm + fb) / 6, tolerance, 28);
}

function integratePieces(fn, cuts, tolerance) {
  const sorted = [...new Set(cuts)].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 1; i < sorted.length; i++) sum += adaptiveSimpson(fn, sorted[i - 1], sorted[i], tolerance / (sorted.length - 1));
  return sum;
}

// U = offsetU + Z1, V = offsetV + rho Z1 + sqrt(1-rho²) Z2.
// Integrate each half-plane joint event conditionally on Z1; no arcsine/Genz
// formula is used to generate the fixture targets.
export function cornerReference({ offsetU, offsetV, rho }, tolerance = 2e-12) {
  if (!(Math.abs(rho) < 1)) throw new RangeError('Corner reference requires |rho| < 1.');
  const conditionalSigma = Math.sqrt(1 - rho * rho), threshold = -offsetU;
  const left = Math.max(-EXTENT, Math.min(EXTENT, threshold));
  const integrateSide = (a, b, positive) => {
    const cuts = [a, b];
    for (let z = Math.ceil(a * 2) / 2; z < b; z += 0.5) if (z > a) cuts.push(z);
    return integratePieces(z => {
      const p = normalCDF((offsetV + rho * z) / conditionalSigma);
      return normalDensity(z) * (positive ? p : 1 - p);
    }, cuts, tolerance / 2);
  };
  return integrateSide(-EXTENT, left, false) + integrateSide(left, EXTENT, true);
}

// Original repeated-disc source, integrated in count coordinates. Conditional
// on V's standard normal z, U is Gaussian and each intersected disc supplies
// its literal horizontal interval. v = centre + R sin(theta) removes only
// the circle interval's endpoint square root; it does not approximate a conic.
export function circlesReference({ u, v, su, sv, rho }, tolerance = 2e-12) {
  if (!(su > 0 && sv > 0 && Math.abs(rho) < 1)) throw new RangeError('Nondegenerate count covariance required.');
  const conditionalSigma = su * Math.sqrt(1 - rho * rho);
  const minU = Math.floor(u - EXTENT * su - RADIUS - 0.5);
  const maxU = Math.ceil(u + EXTENT * su + RADIUS - 0.5);
  const minV = Math.floor(v - EXTENT * sv - RADIUS - 0.5);
  const maxV = Math.ceil(v + EXTENT * sv + RADIUS - 0.5);
  let sum = 0;
  for (let row = minV; row <= maxV; row++) {
    const center = row + 0.5;
    const za = Math.max(-EXTENT, (center - RADIUS - v) / sv);
    const zb = Math.min(EXTENT, (center + RADIUS - v) / sv);
    if (!(zb > za)) continue;
    const angle = z => Math.asin(Math.max(-1, Math.min(1, (v + sv * z - center) / RADIUS)));
    const cuts = [angle(za), angle(zb)];
    for (let z = Math.ceil(za * 2) / 2; z < zb; z += 0.5) if (z > za) cuts.push(angle(z));
    sum += integratePieces(theta => {
      const cosine = Math.max(0, Math.cos(theta));
      const z = (center + RADIUS * Math.sin(theta) - v) / sv;
      const mean = u + rho * su * z, radius = RADIUS * cosine;
      let horizontal = 0;
      for (let col = minU; col <= maxU; col++) {
        horizontal += normalCDF((col + 0.5 + radius - mean) / conditionalSigma)
          - normalCDF((col + 0.5 - radius - mean) / conditionalSigma);
      }
      return horizontal * normalDensity(z) * RADIUS * cosine / sv;
    }, cuts, tolerance / (maxV - minV + 1));
  }
  return sum;
}

function affineFixture(name, material, { u, v, su, sv, rho, rotation = 0 }) {
  const sigma = 0.5, x = 0.5, y = 0.5;
  const c = Math.cos(rotation), s = Math.sin(rotation), r = Math.sqrt(1 - rho * rho);
  const gu = [su / sigma * c, su / sigma * s];
  const gv = [sv / sigma * (rho * c - r * s), sv / sigma * (rho * s + r * c)];
  const row = (q, g) => [g[0], g[1], q - x * g[0] - y * g[1]];
  return { name, material, hu: row(u, gu), hv: row(v, gv), hd: [0, 0, 1], x, y, period: 1, variance: sigma * sigma };
}

const cornerSpecs = [];
for (const rho of [-0.751, -0.75, -0.749, 0.749, 0.75, 0.751]) {
  for (const [offsetU, offsetV] of [[0.7, -0.45], [1.3, 0.8]]) {
    cornerSpecs.push({ name: `quadrature-corner-rho${rho}-offset${offsetU},${offsetV}`, rho, offsetU, offsetV });
  }
}
for (const rho of [-0.75, 0.75]) cornerSpecs.push({ name: `quadrature-corner-rho${rho}-center`, rho, offsetU: 0, offsetV: 0 });

const circleSpecs = [
  { name: 'quadrature-circle-thin-tangent', u: 0.56, v: 0.912, su: 0.16, sv: 0.006, rho: 0 },
  { name: 'quadrature-circle-thin-tangent-rotated', u: 0.56, v: 0.912, su: 0.16, sv: 0.006, rho: 0, rotation: 0.83 },
  { name: 'quadrature-circle-skew-positive', u: 0.57, v: 0.9, su: 0.17, sv: 0.012, rho: 0.72, rotation: 0.37 },
  { name: 'quadrature-circle-skew-negative', u: 0.57, v: 0.9, su: 0.17, sv: 0.012, rho: -0.72, rotation: 1.12 },
  { name: 'quadrature-circle-edge-oblique', u: 0.87, v: 0.66, su: 0.085, sv: 0.024, rho: 0.6, rotation: 0.64 },
  { name: 'quadrature-circle-edge-oblique-reflected', u: 0.13, v: 0.66, su: 0.085, sv: 0.024, rho: -0.6, rotation: -0.64 },
  { name: 'quadrature-circle-two-neighbors', u: 0.985, v: 0.51, su: 0.145, sv: 0.015, rho: 0.48, rotation: 0.21 },
  { name: 'quadrature-circle-anisotropic-center', u: 0.5, v: 0.5, su: 0.195, sv: 0.018, rho: -0.8, rotation: 0.91 },
];

const evidence = [];
export const quadratureFixtures = [
  ...cornerSpecs.map(spec => {
    const coarse = cornerReference(spec, 2e-10), expected = cornerReference(spec);
    const su = 0.025, sv = 0.03;
    // Outside (-1/2, 1/2)^2, equal parity need not equal equal signs. The
    // nearest omitted boundary is more than 15 standard deviations away.
    const nearestOtherEdgeSigma = Math.min((0.5 - Math.abs(spec.offsetU * su)) / su, (0.5 - Math.abs(spec.offsetV * sv)) / sv);
    evidence.push({ name: spec.name, family: 'conditional joint halfplanes', inputs: spec,
      coarse, expected, refinementDifference: Math.abs(coarse - expected), nearestOtherEdgeSigma });
    return { ...affineFixture(spec.name, 'checker', { u: spec.offsetU * su, v: spec.offsetV * sv, su, sv, rho: spec.rho }),
      expected, tolerance: 2e-6, expectedRegime: 1 };
  }),
  ...circleSpecs.map(spec => {
    const coarse = circlesReference(spec, 2e-10), expected = circlesReference(spec);
    const count = (q, sd) => Math.floor(q + 5.5 * sd + RADIUS) - Math.floor(q - 5.5 * sd - RADIUS) + 1;
    const coverageCells = count(spec.u, spec.su) * count(spec.v, spec.sv);
    if (coverageCells > 9) throw new Error(`${spec.name} does not exercise accepted coverage.`);
    evidence.push({ name: spec.name, family: 'conditional original repeated discs', inputs: spec,
      coarse, expected, refinementDifference: Math.abs(coarse - expected), coverageCells });
    return { ...affineFixture(spec.name, 'circles', spec), expected, tolerance: 3e-6, expectedRegime: 1 };
  }),
];

for (const item of evidence) {
  if (item.refinementDifference > 2e-9) throw new Error(`Independent reference refinement failed: ${item.name}`);
}

export const quadratureReferenceEvidence = {
  method: 'Original-source conditional Gaussian probabilities; adaptive Simpson outer integration, direct normal-density CDF quadrature. No kernel import, Genz formula, Taylor count, finite-pixel box, or horizon.',
  extentSigma: EXTENT,
  // Mills' inequality: P(|Z| > L) < 2 phi(L)/L. Union over two count
  // coordinates bounds both discarded rows and discarded disc columns.
  omittedGaussianMassBound: 4 * normalDensity(EXTENT) / EXTENT,
  referenceTolerance: 2e-12,
  coarseReferenceTolerance: 2e-10,
  maximumRefinementDifference: Math.max(...evidence.map(item => item.refinementDifference)),
  note: 'Refinement is a practical convergence check, not a formal bound on all floating-point quadrature error. GPU tolerances include float32 input arithmetic and the kernel’s separate 5.5-sigma truncation.',
  cases: evidence,
};
