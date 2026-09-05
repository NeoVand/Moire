import assert from 'node:assert/strict';
import {
  checkerPointCpu, gaussianCharacterCpu, spectralCheckerCpu, projectiveCheckerCpu, projectiveCoverageCpu,
  type CheckerJet, type Pair,
} from './spectral.ts';

function rule(n: number): [number[], number[]] {
  const nodes = new Array<number>(n);
  const weights = new Array<number>(n);
  for (let i = 0; i < (n + 1) / 2; i++) {
    let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 30; it++) {
      let p0 = 1, p1 = z;
      for (let k = 2; k <= n; k++) {
        const next = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k;
        p0 = p1; p1 = next;
      }
      dp = n * (z * p1 - p0) / (z * z - 1);
      const next = z - p1 / dp;
      if (Math.abs(next - z) < 2e-15) { z = next; break; }
      z = next;
    }
    nodes[i] = -z; nodes[n - 1 - i] = z;
    weights[i] = weights[n - 1 - i] = 2 / ((1 - z * z) * dp * dp);
  }
  return [nodes, weights];
}

// Independent real-space quadrature of the original continuous chirp. The
// determinant formula is not used to construct these expected values.
const [nodes, weights] = rule(320);
function directCharacter(theta: number, g: Pair, h: readonly [number, number, number], sigma: number) {
  let sum = 0;
  for (let i = 0; i < nodes.length; i++) for (let j = 0; j < nodes.length; j++) {
    const x = 8 * nodes[i], y = 8 * nodes[j];
    const sx = sigma * x, sy = sigma * y;
    sum += 64 * weights[i] * weights[j] * Math.exp(-0.5 * (x * x + y * y)) /
      (2 * Math.PI) * Math.cos(theta + g[0] * sx + g[1] * sy +
        0.5 * (h[0] * sx * sx + 2 * h[1] * sx * sy + h[2] * sy * sy));
  }
  return sum;
}
const chirps: [number, Pair, [number, number, number], number][] = [
  [0.4, [1.2, -2.3], [0, 0, 0], 0.5],
  [-1.1, [0, 0], [2, 3, -1], 0.5],
  [0.2, [4, -3], [6, -2, 4], 0.5],
  [1.6, [0.2, 1.4], [-3, 5, 7], 0.65],
  [0.8, [0, 0], [0, 8, 0], 0.5],
  // First-order exp(-sigma²|g|²/2) would discard this visible curved phase.
  [0.2, [0, 20], [0, 0, 40], 0.5],
];
for (const args of chirps) {
  const result = gaussianCharacterCpu(...args);
  const reference = directCharacter(...args);
  assert.ok(Math.abs(result - reference) < 2e-10, `chirp: ${result} vs ${reference}`);
}
assert.ok(Math.abs(gaussianCharacterCpu(...chirps[5])) > 0.05);

// Independent eigenframe formula without either pruning decision. This checks
// that shortening the box and dropping individual characters obey the stated
// finite-box error budget, including positive, negative and mixed curvature.
function eigenCharacter(theta: number, g: Pair, h: readonly [number, number, number], sigma: number) {
  const angle = 0.5 * Math.atan2(2 * h[1], h[0] - h[2]);
  const c = Math.cos(angle), s = Math.sin(angle);
  const radius = Math.hypot(0.5 * (h[0] - h[2]), h[1]);
  const eigenvalues = [0.5 * (h[0] + h[2]) + radius, 0.5 * (h[0] + h[2]) - radius];
  const gradients = [c * g[0] + s * g[1], -s * g[0] + c * g[1]];
  let amplitude = 1, phase = theta;
  for (let j = 0; j < 2; j++) {
    const q = sigma * sigma * eigenvalues[j];
    const denominator = 1 + q * q;
    amplitude *= denominator ** -0.25 * Math.exp(-0.5 * sigma * sigma * gradients[j] ** 2 / denominator);
    phase += 0.5 * Math.atan(q) - 0.5 * sigma * sigma * gradients[j] ** 2 * q / denominator;
  }
  return amplitude * Math.cos(phase);
}
function unprunedChecker(jet: CheckerJet) {
  let value = 0.5;
  for (let m = 1; m <= 31; m += 2) for (let n = 1; n <= 31; n += 2) {
    for (const sign of [-1, 1]) {
      const combine = (v: Pair) => 2 * Math.PI * (m * v[0] + sign * n * v[1]);
      value -= sign * 4 / (Math.PI * Math.PI * m * n) * eigenCharacter(
        combine(jet.uv), [combine(jet.dx), combine(jet.dy)],
        [combine(jet.dxx), combine(jet.dxy), combine(jet.dyy)], 0.5,
      );
    }
  }
  return Math.min(1, Math.max(0, value));
}
let pruningWorst = 0;
for (const g of [0.03, 0.2, 0.7, 3, 10]) for (const h of [0, 0.002, -0.1, 2]) {
  const jet: CheckerJet = {
    uv: [0.499, 0.511], dx: [g, 0.2 * g], dy: [-0.05 * g, 0.8 * g],
    dxx: [h, -0.2 * h], dxy: [-0.8 * h, h], dyy: [0.1 * h, 0.7 * h],
  };
  const error = Math.abs(spectralCheckerCpu(jet) - unprunedChecker(jet));
  pruningWorst = Math.max(pruningWorst, error);
  assert.ok(error < 9e-8, `character pruning exceeded its finite-box budget: ${error}`);
}

// Independent conditional probability integral for an affine checker. Rotate
// the Gaussian so v varies in Y alone, integrate u's alternating intervals by
// normal CDF, and split the outer quadrature at every checker edge in v.
// This CDF approximation's absolute error is < 1.5e-7; the comparison tolerance
// is deliberately wider than that arithmetic floor.
function cdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t -
    0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + Math.sign(z) * erf);
}
function squareMean(u: number, width: number): number {
  if (width < 1e-12) return u - Math.floor(u) < 0.5 ? 1 : -1;
  let probability = 0;
  for (let k = Math.floor(u - 8 * width) - 1; k <= Math.ceil(u + 8 * width); k++) {
    probability += cdf((k + 0.5 - u) / width) - cdf((k - u) / width);
  }
  return 2 * probability - 1;
}
const [outerNodes, outerWeights] = rule(64);
function affineReference(jet: CheckerJet, sigma = 0.5): number {
  const lengthV = Math.hypot(jet.dx[1], jet.dy[1]);
  const vWidth = sigma * lengthV;
  if (vWidth === 0) return 0.5 + 0.5 * squareMean(jet.uv[1], 0) *
    squareMean(jet.uv[0], sigma * Math.hypot(jet.dx[0], jet.dy[0]));
  const uY = sigma * (jet.dx[0] * jet.dx[1] + jet.dy[0] * jet.dy[1]) / lengthV;
  const uWidth = sigma * Math.abs(jet.dx[0] * jet.dy[1] - jet.dy[0] * jet.dx[1]) / lengthV;
  const cuts = [-8, 8];
  for (let k = Math.ceil(2 * (jet.uv[1] - 8 * vWidth)); k < 2 * (jet.uv[1] + 8 * vWidth); k++) {
    cuts.push((0.5 * k - jet.uv[1]) / vWidth);
  }
  cuts.sort((a, b) => a - b);
  let integral = 0;
  for (let p = 1; p < cuts.length; p++) {
    const mid = (cuts[p] + cuts[p - 1]) / 2, half = (cuts[p] - cuts[p - 1]) / 2;
    const vSign = squareMean(jet.uv[1] + vWidth * mid, 0);
    for (let i = 0; i < outerNodes.length; i++) {
      const y = mid + half * outerNodes[i];
      integral += half * outerWeights[i] * Math.exp(-0.5 * y * y) / Math.sqrt(2 * Math.PI) *
        vSign * squareMean(jet.uv[0] + uY * y, uWidth);
    }
  }
  return 0.5 + 0.5 * integral;
}
const affine = (uv: Pair, dx: Pair, dy: Pair): CheckerJet =>
  ({ uv, dx, dy, dxx: [0, 0], dxy: [0, 0], dyy: [0, 0] });
const checkers = [
  affine([0.17, 0.61], [0.17, 0], [0, 0.27]),
  affine([0.48, 0.51], [0.18, 0.15], [-0.08, 0.13]),
  affine([0.24, 0.26], [0.14, 1.7], [0.07, 1.2]),
  affine([0.12, 0.16], [1.5, 1.5], [0.04, -0.04]),
  affine([-0.73, 4.4], [0.2, -0.3], [0.6, 0.11]),
];
let worst = 0;
for (const jet of checkers) {
  const actual = spectralCheckerCpu(jet);
  const expected = affineReference(jet);
  worst = Math.max(worst, Math.abs(actual - expected));
  assert.ok(Math.abs(actual - expected) < 2e-5, `checker: ${actual} vs ${expected}`);
}

// The cancellation case has almost no marginal contrast but clear joint
// contrast. An implementation that filters the axes independently fails here.
const correlated = checkers[3];
const separate = 0.5 + 0.5 * squareMean(correlated.uv[0], 0.5 * Math.hypot(correlated.dx[0], correlated.dy[0])) *
  squareMean(correlated.uv[1], 0.5 * Math.hypot(correlated.dx[1], correlated.dy[1]));
assert.ok(spectralCheckerCpu(correlated) - separate > 0.25);

for (const uv of [[0.2, 0.2], [-2.8, 5.7], [0, 0.5], [0.5, 0.5]] as const) {
  assert.equal(spectralCheckerCpu(affine(uv, [0, 0], [0, 0]), 0), checkerPointCpu(uv));
}
const constant = affine([0.17, 0.73], [0, 0], [0, 0]);
assert.equal(spectralCheckerCpu(constant), checkerPointCpu(constant.uv));

// Near-field edges: an independent original-coordinate integral of a rational
// homography, including its changing horizontal Gaussian width. v has no X
// rate in this family, so every v crossing can be split exactly in Y.
function projectiveReference(jet: CheckerJet, sigma = 0.5): number {
  assert.equal(jet.denominator?.[0], 0);
  assert.equal(jet.dx[1], 0);
  const r = jet.denominator![1];
  const valueV = (z: number) => jet.uv[1] + jet.dy[1] * sigma * z / (1 + r * sigma * z);
  const low = Math.min(valueV(-8), valueV(8)), high = Math.max(valueV(-8), valueV(8));
  const cuts = [-8, 8];
  for (let k = Math.ceil(2 * low); k < 2 * high; k++) {
    const e = 0.5 * k;
    const y = (e - jet.uv[1]) / (jet.dy[1] + (jet.uv[1] - e) * r);
    if (Math.abs(y / sigma) < 8) cuts.push(y / sigma);
  }
  cuts.sort((a, b) => a - b);
  let sum = 0;
  for (let p = 1; p < cuts.length; p++) {
    const mid = (cuts[p] + cuts[p - 1]) / 2, half = (cuts[p] - cuts[p - 1]) / 2;
    const vSign = squareMean(valueV(mid), 0);
    for (let i = 0; i < outerNodes.length; i++) {
      const z = mid + half * outerNodes[i], y = sigma * z;
      const d = 1 + r * y;
      const uMean = jet.uv[0] + jet.dy[0] * y / d;
      const uWidth = sigma * Math.abs(jet.dx[0] / d);
      sum += half * outerWeights[i] * Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) *
        vSign * squareMean(uMean, uWidth);
    }
  }
  return 0.5 + 0.5 * sum;
}
let nearWorst = 0;
let nearCases = 0;
for (const width of [0.001, 0.008, 0.02]) for (const rho of [-0.9, 0, 0.7, 0.97]) {
  for (const shift of [-1.3, -0.2, 0, 0.7, 2]) {
    const r = 0.015;
    const dx: Pair = [width * Math.sqrt(1 - rho * rho), 0];
    const dy: Pair = [width * rho, width];
    const jet: CheckerJet = {
      uv: [0.5 + shift * width * 0.5, 0.5 + 0.3 * width * 0.5], dx, dy,
      dxx: [0, 0], dxy: [-r * dx[0], 0], dyy: [-2 * r * dy[0], -2 * r * dy[1]],
      denominator: [0, r],
    };
    assert.notEqual(projectiveCoverageCpu(jet), null, 'small rational footprint must use its exact edge geometry');
    const reference = projectiveReference(jet);
    const actual = projectiveCheckerCpu(jet);
    nearWorst = Math.max(nearWorst, Math.abs(actual - reference));
    assert.ok(Math.abs(actual - reference) < 3e-6, `projective ${rho}/${shift}: ${actual} vs ${reference}`);
    nearCases++;
  }
}
const pole = { ...affine([0.17, 0.23], [0.01, 0], [0, 0.01]), denominator: [0, 0.1] as Pair };
assert.equal(projectiveCoverageCpu(pole), null, 'near-pole footprint must decline the single-edge path');
const multiple = { ...affine([0.17, 0.23], [0.5, 0], [0, 0.5]), denominator: [0, 0] as Pair };
assert.equal(projectiveCoverageCpu(multiple), null, 'multiple checker edges must stay spectral');

console.log(`Spectral checker: ${chirps.length} independent chirps, 20 pruning checks (max ${pruningWorst.toExponential(3)}), ${checkers.length} conditional checker integrals, max checker error ${worst.toExponential(3)}; ${nearCases} original projective integrals, max edge error ${nearWorst.toExponential(3)}; cancellation, zero-footprint and rejection gates passed.`);
