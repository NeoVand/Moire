import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gaussianChirpMoments as moments } from './gaussian-chirp.mjs';

const reference = JSON.parse(fs.readFileSync(new URL('./coverage-reference.json', import.meta.url), 'utf8'));
let checks = 0, largestError = 0, largestErrorToEstimate = 0;
const close = (a, b, tolerance, label) => {
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance, label);
  checks++;
};
const plus = (a, b) => a.map((x, j) => x + b[j]);

for (const row of reference.cases) {
  const result = moments(row.args);
  for (let j = 0; j < 3; j++) {
    const expected = row.moments[j].map(Number);
    const difference = Math.hypot(...result.moments[j].map((x, k) => x - expected[k]));
    const referenceRounding = 2 * Number.EPSILON * Math.hypot(...expected);
    assert.ok(Number.isFinite(result.estimatedError[j]), `${row.id} finite error estimate`);
    close(result.moments[j], expected, result.estimatedError[j] + referenceRounding, `${row.id} moment ${j}`);
    if (result.status === 'estimated-tolerance-met')
      close(result.moments[j], expected, result.tolerance[j] + referenceRounding, `${row.id} tolerance ${j}`);
    largestError = Math.max(largestError, difference);
    if (result.estimatedError[j] > 0)
      largestErrorToEstimate = Math.max(largestErrorToEstimate, difference / result.estimatedError[j]);
  }
}

const args = { sigma: 0.7, beta: 6, q: -8 };
const all = moments(args);
const segments = [moments({ ...args, b: -0.3 }), moments({ ...args, a: -0.3, b: 0.9 }), moments({ ...args, a: 0.9 })];
for (let j = 0; j < 3; j++) {
  close(segments.map(s => s.moments[j]).reduce(plus, [0, 0]), all.moments[j],
    segments.reduce((sum, s) => sum + s.estimatedError[j], all.estimatedError[j]), `partition moment ${j}`);
}
const finite = moments({ ...args, a: -0.3, b: 0.9 });
const conjugate = moments({ ...args, a: -0.3, b: 0.9, beta: -args.beta, q: -args.q });
const reversed = moments({ ...args, a: 0.9, b: -0.3 });
for (let j = 0; j < 3; j++) {
  close(conjugate.moments[j], [finite.moments[j][0], -finite.moments[j][1]], 0, `conjugate ${j}`);
  close(reversed.moments[j], finite.moments[j].map(x => -x), 0, `reversed ${j}`);
}

// This is one complete correlated model term, not an integration of fjet itself.
const probability = 2 * moments({ a: 1 }).moments[0][0];
const maskedChirp = moments({ a: 1, q: 2 }).moments[0].map(x => 2 * x);
const unmaskedChirp = moments({ q: 2 }).moments[0];
const joint = (probability + maskedChirp[0]) / 2;
const factorized = probability * (1 + unmaskedChirp[0]) / 2;
close([joint, 0], [0.128615268351646, 0], 5e-13, 'bounded correlated shader');
assert.ok(Math.abs(joint - factorized) > 0.12);
checks++;

// Finite source endpoints can overflow only after standardization. The correct
// absolute-error response is a tiny tail estimate, never NaN or a fake integral.
for (const interval of [{ a: 1e300, b: Infinity }, { a: -Infinity, b: -1e300 }]) {
  const result = moments({ ...interval, sigma: 1e-100 });
  assert.deepEqual(result.moments, [[0, 0], [0, 0], [0, 0]]);
  assert.ok(result.estimatedError.every(Number.isFinite));
  checks++;
}
for (const invalid of [
  { sigma: 0 }, { sigma: NaN }, { q: Infinity }, { a: NaN }, { absTol: 0 },
  { normalized: 'yes' }, { method: 'unknown' }, { maxPanels: 0 }, { beta: 1e7 },
  { a: -3, b: 3, beta: 1e5, q: 1e5 },
  { a: -1, b: 1, beta: 100, maxPanels: 1 },
  { a: 1e-300, b: 2e-300, sigma: 1e100 },
]) {
  assert.throws(() => moments(invalid));
  checks++;
}
assert.equal(moments({ a: 0.5, b: 0.5001, beta: 62831.85307179586, absTol: 1e-15 }).status, 'roundoff-limited');
checks++;

const report = {
  fixtures: reference.cases.length,
  independentQuadratureFixtures: reference.cases.filter(c => c.quadrature).length,
  checks, largestAbsoluteError: largestError, largestErrorToEstimate,
  correlatedDemo: { probability, maskedChirp, joint, factorized, factorizationError: factorized - joint },
};
if (process.argv.includes('--write'))
  fs.writeFileSync(new URL('./coverage-test-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
