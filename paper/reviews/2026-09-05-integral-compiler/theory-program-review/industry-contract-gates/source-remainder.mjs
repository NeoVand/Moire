// Independent CPU fixtures. No imports from the author's field jet or enclosure.
import { pathToFileURL } from 'node:url';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const norm = (a) => Math.hypot(...a);
const covariance = (L) => [[dot(L[0], L[0]), dot(L[0], L[1])], [dot(L[1], L[0]), dot(L[1], L[1])]];
const unit = (angle) => [Math.cos(angle), Math.sin(angle)];

function sineMinusArgument(x) {
  if (Math.abs(x) >= 0.5) return Math.sin(x) - x;
  let term = -(x ** 3) / 6, sum = term;
  for (let j = 1; j < 12; j++) { term *= -x * x / ((2 * j + 2) * (2 * j + 3)); sum += term; }
  return sum;
}
function cosineRemainder(x) {
  if (Math.abs(x) >= 0.5) return Math.cos(x) - 1 + x * x / 2;
  let term = x ** 4 / 24, sum = term;
  for (let j = 2; j < 13; j++) { term *= -x * x / ((2 * j + 1) * (2 * j + 2)); sum += term; }
  return sum;
}

function rationalBound(component, R) {
  const { numerator: N, denominator: D, phase, amplitude } = component;
  if (D.constant === 0) return { status: 'declined', reason: 'zero center denominator' };
  const ratio = N.constant / D.constant;
  const v = N.linear.map((n, j) => (n - ratio * D.linear[j]) / D.constant);
  const w = D.linear.map((d) => d / D.constant);
  const G = norm(v), K = norm(w), rho = K * R, theta = ratio + phase;
  if (!(rho < 1)) return { status: 'declined', reason: 'rho >= 1: ball reaches denominator zero', rho };
  const eta = 1 - rho;
  const terms = [Math.abs(Math.cos(theta)) * G * K * K / eta,
    Math.abs(Math.sin(theta)) * G * G * K * (2 + rho) / (2 * eta * eta), G ** 3 / (6 * eta ** 3)];
  return { status: 'bounded', v, w, G, K, rho, theta, C: Math.abs(amplitude) * terms.reduce((a, b) => a + b, 0), terms };
}

function residual(component, bound, z) {
  const v = dot(bound.v, z), w = dot(bound.w, z), delta = v / (1 + w);
  // Algebraically identical to source minus its quadratic jet; no subtraction of nearby sine values.
  const stable = component.amplitude * (Math.cos(bound.theta) *
    (sineMinusArgument(delta) + v * w * w / (1 + w)) + Math.sin(bound.theta) *
    (cosineRemainder(delta) + v * v * w * (2 + w) / (2 * (1 + w) ** 2)));
  const phase = (component.numerator.constant + dot(component.numerator.linear, z)) /
    (component.denominator.constant + dot(component.denominator.linear, z)) + component.phase;
  const source = component.amplitude * Math.sin(phase);
  const model = component.amplitude * (Math.sin(bound.theta) + Math.cos(bound.theta) * (v - v * w) - Math.sin(bound.theta) * v * v / 2);
  return { stable, direct: source - model, scale: 1 + Math.abs(source) + Math.abs(model) + Math.abs(phase) + Math.abs(bound.theta) };
}

function planeCase(id, mean, L, components, expected = 'pass', R = 6) {
  return { version: 1, id, source: { type: 'sum of amplitude * sin(k_s*s + k_t*t + phase)', components },
    map: { type: 'benchmark plane', equations: ['s=-50*(x-240)/(y+1)', 't=-12000/(y+1)'] },
    window: { distribution: 'Gaussian', mean, whitening: L, covariance: covariance(L) },
    domain: { coordinates: 'whitened z', radius: R }, errorNorm: 'pointwise |source-quadratic source jet| <= C*||z||^3',
    expected, rationalComponents: components.map(({ k, phase, amplitude }) => ({ amplitude, phase,
      numerator: { constant: -50 * k[0] * (mean[0] - 240) - 12000 * k[1], linear: L[0].map((x) => -50 * k[0] * x) },
      denominator: { constant: mean[1] + 1, linear: [...L[1]] } })) };
}

function fixtures() {
  const L = [[0.5, 0], [0, 0.5]], wave = [{ k: [0.01, 0], phase: Math.PI / 2, amplitude: 1 }];
  const cases = [planeCase('legacy-mixed-third-counterexample', [240, 9], L, wave),
    planeCase('offset-negative-amplitude', [218, 17], L, [{ k: [0.03, -0.01], phase: 1.37, amplitude: -0.8 }]),
    planeCase('anisotropic-correlated-whitening', [205, 16], [[0.8, 0.3], [0.15, 0.22]], [
      { k: [0.1, -0.04], phase: 0.6, amplitude: 1 }, { k: [-0.08, 0.02], phase: -2.2, amplitude: -0.8 },
      { k: [0.013, 0.007], phase: 1.8, amplitude: 0.6 }]),
    planeCase('near-pole-valid', [240, 2.1], L, wave),
    planeCase('negative-denominator-valid', [240, -11], L, wave),
    planeCase('pole-touch-decline', [240, 2], L, wave, 'decline'),
    planeCase('pole-cross-decline', [240, 1], L, wave, 'decline')];
  const affine = planeCase('affine-positive-control', [0, 0], [[1, 0], [0, 1]], []);
  affine.map = { type: 'affine phase in whitened coordinates', equation: '(0.4+0.2*zx-0.3*zy)/2+0.6' };
  affine.source = { type: '-0.8*sin(affine phase)' };
  affine.rationalComponents = [{ amplitude: -0.8, phase: 0.6, numerator: { constant: 0.4, linear: [0.2, -0.3] }, denominator: { constant: 2, linear: [0, 0] } }];
  return [...cases, affine];
}

function sweep(fixture) {
  const R = fixture.domain.radius, bounds = fixture.rationalComponents.map((c) => rationalBound(c, R));
  if (bounds.some((b) => b.status === 'declined')) return { status: 'declined', bounds, sampleCount: 0 };
  const C = bounds.reduce((s, b) => s + b.C, 0);
  const angles = Array.from({ length: 192 }, (_, i) => i * 2 * Math.PI / 192);
  for (const b of bounds) if (b.K) angles.push(Math.atan2(-b.w[1], -b.w[0]));
  const radii = [0, 1e-6, 1e-4, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1 - 1e-6, 1].map((f) => f * R);
  let sampleCount = 0, maxResidualOverBound = 0, maxDirectAgreementScaledError = 0, maxComponentResidualOverBound = 0;
  let worst = null;
  for (const r of radii) for (const angle of (r === 0 ? [0] : angles)) {
    const z = unit(angle).map((v) => v * r);
    const values = fixture.rationalComponents.map((c, i) => residual(c, bounds[i], z));
    const value = values.reduce((s, v) => s + v.stable, 0), allowance = C * r ** 3;
    const ratio = allowance ? Math.abs(value) / allowance : (value === 0 ? 0 : Infinity);
    if (ratio > maxResidualOverBound) { maxResidualOverBound = ratio; worst = { r, angle, residual: value, allowance }; }
    values.forEach((v, i) => {
      const componentAllowance = bounds[i].C * r ** 3;
      if (componentAllowance) maxComponentResidualOverBound = Math.max(maxComponentResidualOverBound, Math.abs(v.stable) / componentAllowance);
      // Only moderate increments compare against ordinary subtraction; tiny residuals use stable algebra above.
      if (r >= 0.05) maxDirectAgreementScaledError = Math.max(maxDirectAgreementScaledError, Math.abs(v.stable - v.direct) / v.scale);
    });
    sampleCount++;
  }
  return { status: 'bounded', C, bounds, sampleCount, maxResidualOverBound, maxComponentResidualOverBound, maxDirectAgreementScaledError, worst,
    sampling: { radii, angularGridSize: 192, extraDirections: 'toward each denominator pole', directComparisonMinimumRadius: 0.05 } };
}

export function runSourceRemainderGates() {
  const descriptions = fixtures(), cases = descriptions.map((descriptor) => ({ descriptor, result: sweep(descriptor) }));
  const counter = descriptions[0], c = counter.rationalComponents[0], bound = rationalBound(c, 6);
  const direction = [Math.sqrt(2 / 3), 1 / Math.sqrt(3)], sigma = 0.5, D = 10, A = 0.5;
  const legacyC = (A / D) ** 3 / 6 * sigma ** 3; // legacy s_yyy and t contribution are zero here
  const exactLeadingCoefficient = sigma ** 3 * A * A / D ** 3 * direction[0] ** 2 * direction[1];
  const finiteRadii = [1e-6, 1e-4, 1e-3, 0.01, 0.1, 0.25, 0.5, 1].map((r) => {
    const value = residual(c, bound, direction.map((x) => x * r)).stable;
    return { r, residual: value, coefficient: value / r ** 3, legacyRatio: Math.abs(value) / (legacyC * r ** 3), correctedRatio: Math.abs(value) / (bound.C * r ** 3) };
  });
  const original = descriptions[1].rationalComponents[0];
  const absorbed = { ...original, phase: 0, numerator: {
    constant: original.numerator.constant + original.phase * original.denominator.constant,
    linear: original.numerator.linear.map((n, j) => n + original.phase * original.denominator.linear[j]) } };
  const externalBound = rationalBound(original, 6), absorbedBound = rationalBound(absorbed, 6);
  const offsetDifference = Math.max(Math.abs(externalBound.theta - absorbedBound.theta), Math.abs(externalBound.C - absorbedBound.C), ...externalBound.v.map((v, i) => Math.abs(v - absorbedBound.v[i])));
  const checks = cases.map(({ descriptor, result }) => ({ id: descriptor.id,
    passed: descriptor.expected === 'decline' ? result.status === 'declined' && result.sampleCount === 0 :
      result.status === 'bounded' && result.maxResidualOverBound <= 1 + 1e-11 && result.maxComponentResidualOverBound <= 1 + 1e-11 && result.maxDirectAgreementScaledError <= 1e-11,
    expectation: descriptor.expected }));
  checks.push({ id: 'legacy-bound-fails-at-every-listed-radius', passed: finiteRadii.every((r) => r.legacyRatio > 1) },
    { id: 'stable-small-radius-limit-matches-exact-mixed-coefficient', passed: Math.abs(finiteRadii[0].coefficient / exactLeadingCoefficient - 1) < 1e-6 },
    { id: 'additive-phase-external-vs-absorbed-equivalence', passed: offsetDifference < 1e-13, maxAbsoluteDifference: offsetDifference });
  return { version: 1, contract: {
    source: 'finite real sum of sinusoidal rational-affine phases; quadratic jet of the source, not sine of a quadratic phase',
    model: 'amplitude * [sin(theta0)+cos(theta0)*(v-v*w)-sin(theta0)*v^2/2]',
    phaseIdentity: 'Delta=v/(1+w); Delta-(v-v*w)=v*w^2/(1+w); Delta^2-v^2=-v^2*w*(2+w)/(1+w)^2',
    bound: 'sum |amplitude| * [|cos(theta0)|*G*K^2/(1-rho) + |sin(theta0)|*G^2*K*(2+rho)/(2*(1-rho)^2) + G^3/(6*(1-rho)^3)]',
    domain: 'closed whitened radius-R ball with rho=||w coefficients||*R<1', errorNorm: 'absolute pointwise source remainder divided by r^3',
    mathematicalStatus: 'derivation-based whole-ball bound in exact arithmetic, contingent on the declared source and coefficients',
    floatingStatus: 'finite deterministic probe agreement only; no outward-rounded floating certificate',
    residualEvaluation: 'stable trigonometric identities; Taylor series for sin(delta)-delta and cos(delta)-1+delta^2/2 when |delta|<0.5',
    probeTolerances: { ratioSlack: 1e-11, directScaledAbsolute: 1e-11, leadingRelative: 1e-6, offsetAbsolute: 1e-13 } },
    cases, counterexample: { descriptorId: counter.id, direction, legacyC, exactLeadingCoefficient, leadingViolationFactor: exactLeadingCoefficient / legacyC, finiteRadii }, checks,
    passed: checks.every((c) => c.passed), limitations: [
      'The angular/radial sample set is finite and cannot prove a continuum bound or discover every implementation defect.',
      'Stable residual evaluation still uses IEEE double arithmetic and platform trigonometry; its accuracy is not certified by interval arithmetic.',
      'Ordinary direct subtraction is a secondary moderate-radius check, not a reliable reference for tiny residuals.',
      'Pole-touching/crossing balls are declined; no bound is asserted there. Coverage, threshold topology, cubic root isolation, and pixel integration are not tested.',
      'Coefficient rounding, shader arithmetic, Gaussian tail allocation, GPU behavior, performance, and general material graphs are outside these gates.' ] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runSourceRemainderGates();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}
