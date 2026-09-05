import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalCDF, cornerReference, circlesReference,
  quadratureFixtures, quadratureReferenceEvidence,
} from './quadrature-fixtures.mjs';

const close = (actual, expected, tolerance, label) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `${label}: got ${actual}, expected ${expected}, difference ${Math.abs(actual - expected)}`,
);

test('normal-density CDF quadrature matches known values and symmetry', () => {
  for (const [x, expected] of [[0, 0.5], [0.5, 0.6914624612740131],
    [1, 0.8413447460685429], [2, 0.9772498680518208], [3, 0.9986501019683699],
    [6, 0.9999999990134123]]) {
    close(normalCDF(x), expected, 8e-16, `CDF(${x})`);
    close(normalCDF(-x), 1 - expected, 8e-16, `CDF(${-x})`);
  }
});

test('conditional corner integral recovers the centered arcsine identity', () => {
  for (const rho of [-0.9, -0.75, 0, 0.75, 0.9]) {
    close(cornerReference({ offsetU: 0, offsetV: 0, rho }),
      0.5 + Math.asin(rho) / Math.PI, 3e-12, `centered correlation ${rho}`);
  }
});

test('offset independent corners recover a product and obey exchange/complement identities', () => {
  const offsetU = 0.7, offsetV = -0.45;
  const a = normalCDF(offsetU), b = normalCDF(offsetV);
  close(cornerReference({ offsetU, offsetV, rho: 0 }), a * b + (1 - a) * (1 - b), 3e-12, 'independent signs');
  for (const rho of [-0.751, 0.749]) {
    const base = cornerReference({ offsetU, offsetV, rho });
    close(base, cornerReference({ offsetU: offsetV, offsetV: offsetU, rho }), 4e-12, 'coordinate exchange');
    close(1 - base, cornerReference({ offsetU: -offsetU, offsetV, rho: -rho }), 4e-12, 'single-axis sign flip');
  }
});

test('isotropic centered disc recovers radial Gaussian probability with bounded neighbor mass', () => {
  const sigma = 0.08, radius = 5 / 12;
  const singleDisc = 1 - Math.exp(-radius * radius / (2 * sigma * sigma));
  // Every other disc lies outside this radius. The whole 2-D Gaussian tail
  // is an upper bound on their combined contribution, without enumeration.
  const neighborMassBound = Math.exp(-((1 - radius) ** 2) / (2 * sigma * sigma));
  const actual = circlesReference({ u: 0.5, v: 0.5, su: sigma, sv: sigma, rho: 0 });
  assert.ok(actual >= singleDisc - 3e-12);
  assert.ok(actual <= singleDisc + neighborMassBound + 3e-12);
});

test('repeated-disc source preserves coordinate exchange and integer translation', () => {
  const spec = { u: 0.57, v: 0.9, su: 0.17, sv: 0.012, rho: 0.72 };
  const base = circlesReference(spec);
  close(base, circlesReference({ u: spec.v, v: spec.u, su: spec.sv, sv: spec.su, rho: spec.rho }), 4e-11, 'disc coordinate exchange');
  close(base, circlesReference({ ...spec, u: spec.u + 2, v: spec.v - 1 }), 4e-12, 'disc integer translation');
});

test('all 22 source targets converge and genuinely exercise accepted coverage', () => {
  assert.equal(quadratureFixtures.length, 22);
  assert.equal(new Set(quadratureFixtures.map(item => item.name)).size, 22);
  assert.ok(quadratureReferenceEvidence.maximumRefinementDifference < 2e-9);
  assert.ok(quadratureReferenceEvidence.omittedGaussianMassBound < 5e-19);
  const evidence = new Map(quadratureReferenceEvidence.cases.map(item => [item.name, item]));
  for (const fixture of quadratureFixtures) {
    const item = evidence.get(fixture.name), spec = item.inputs;
    assert.ok(fixture.expected > 0 && fixture.expected < 1, fixture.name);
    assert.equal(fixture.expectedRegime, 1);
    assert.deepEqual(fixture.hd, [0, 0, 1]);
    assert.equal(fixture.period, 1);
    assert.equal(fixture.variance, 0.25);
    const center = row => row[0] * fixture.x + row[1] * fixture.y + row[2];
    const covariance = (a, b) => fixture.variance * (a[0] * b[0] + a[1] * b[1]);
    const su = fixture.material === 'checker' ? 0.025 : spec.su;
    const sv = fixture.material === 'checker' ? 0.03 : spec.sv;
    close(center(fixture.hu), fixture.material === 'checker' ? spec.offsetU * su : spec.u, 2e-16, `${fixture.name} U`);
    close(center(fixture.hv), fixture.material === 'checker' ? spec.offsetV * sv : spec.v, 2e-16, `${fixture.name} V`);
    close(covariance(fixture.hu, fixture.hu), su * su, 2e-16, `${fixture.name} VarU`);
    close(covariance(fixture.hv, fixture.hv), sv * sv, 2e-16, `${fixture.name} VarV`);
    close(covariance(fixture.hu, fixture.hv), spec.rho * su * sv, 2e-16, `${fixture.name} CovUV`);
    if (fixture.material === 'checker') assert.ok(item.nearestOtherEdgeSigma > 15);
    else assert.ok(item.coverageCells <= 9);
  }
});

test('held-out rotations and reflections preserve the source targets', () => {
  const byName = new Map(quadratureFixtures.map(item => [item.name, item]));
  for (const [a, b] of [['quadrature-circle-thin-tangent', 'quadrature-circle-thin-tangent-rotated'],
    ['quadrature-circle-edge-oblique', 'quadrature-circle-edge-oblique-reflected']]) {
    close(byName.get(a).expected, byName.get(b).expected, 4e-12, `${a} symmetry`);
  }
});
