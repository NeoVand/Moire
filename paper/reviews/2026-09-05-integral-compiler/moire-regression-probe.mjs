// Read-only regression probes. This script never writes into the Moire repo.
// Run: node moire-regression-probe.mjs
// Override checkout: MOIRE_REPO=/absolute/path/to/Moire node moire-regression-probe.mjs
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const repo = process.env.MOIRE_REPO || fileURLToPath(new URL('../../../', import.meta.url));
const F = await import(pathToFileURL(resolve(repo, 'paper/tools/exp/fjet.mjs')).href);
const rows = [];
function check(name, actual, expected, contract, details = {}) {
  const result = { name, actual, expected, absoluteError: Math.abs(actual - expected), contract, ...details };
  rows.push(result);
  console.log(JSON.stringify(result));
}

// 1. Both count and amplitude are exactly quadratic. This tests the
// evaluator of its own representable model, with no Taylor remainder.
// For Z~N(0,1), a=1/sqrt(2):
// E[1{Z^2>=1/2}] = erfc(1/2),
// E[Z^2 1{Z^2>=1/2}] = erfc(1/2)+2a phi(a).
const coverage = 0.4795001221869535;
const weightedCoverage = 0.9188914116546758;
for (const eps of [1, 0.001]) {
  F.resetAxes();
  const X = new F.Jet(0, 1, 0);
  const X2 = F.mul(X, X);
  const mask = F.step(F.scale(F.sub(X2, 0.5), eps));
  const pixel = new F.Pixel(1, 1e-8);
  check('single curved mask', pixel.expect(mask), coverage, 'exact quadratic source and model', { eps });
  check('curved mask times square', pixel.expect(F.mul(X2, mask)), weightedCoverage,
    'exact quadratic source and model; shared Z dependence must survive averaging', { eps });
}

// 2. Positive scaling leaves a threshold event unchanged. The second-order
// model is still exact. Absolute "flat jet" thresholds must not silently
// change this event into a constant.
F.resetAxes();
{
  const X = new F.Jet(0, 1, 0);
  const mask = F.step(F.scale(F.sub(F.mul(X, X), 0.5), 1e-14));
  check('positive rescaling of curved mask', new F.Pixel(1, 1e-8).expect(mask), coverage,
    'exact quadratic source and model; threshold invariant under positive scaling', { eps: 1e-14, axesRetained: mask.axes().length });
}

// 3. This deliberately tests SOURCE semantics, not exactness for a quadratic
// model: Z^3 has zero second-order jet at zero. The quadratic model is zero,
// whose >=0 step is 1, while the source shader has expectation 1/2. This
// requires provenance, a validity check, or fallback; it is not repaired by
// more accurate quadratic integration or by merely retaining an axis.
F.resetAxes();
{
  const X = new F.Jet(0, 1, 0);
  const cubic = F.pow(X, 3);
  const mask = F.step(cubic);
  check('step of cubic at zero', new F.Pixel(1, 1e-8).expect(mask), 0.5,
    'source shader differs from identically-zero quadratic model', {
      quadraticModelExpectation: 1,
      quadraticJet: cubic.smoothPart(),
      axesRetained: mask.axes().length,
    });
}

// 4. Affine base counts and affine field coefficients are represented exactly.
// The sines remain exact pictures. No omitted cubic geometry is involved.
// At the trace centre both coefficient values are zero, but their derivatives
// differ. Trace separately, then together, to isolate semantic axis aliasing.
const at = [0.2, 0.1];
const sourceAt = (multiplier) => Math.sin(0.3 + at[1] + multiplier * at[0] * Math.sin(0.5 + at[0]));
for (const multiplier of [1, 2]) {
  F.resetAxes();
  const X = new F.Jet(0, 1, 0);
  const A = new F.Jet(0.3, 0, 1);
  const B = new F.Jet(0.5, 1, 0);
  const expression = F.sin(F.add(A, F.mul(F.scale(X, multiplier), F.sin(B))));
  check('varying field traced separately', new F.Pixel(1, 1e-8).pointValue(expression.terms, at, new Map()),
    sourceAt(multiplier), 'exact represented point signal', { multiplier, displacement: at });
}
F.resetAxes();
{
  const X = new F.Jet(0, 1, 0);
  const A = new F.Jet(0.3, 0, 1);
  const B = new F.Jet(0.5, 1, 0);
  const bump = F.sin(B);
  const field1 = F.mul(X, bump);
  const field2 = F.mul(F.scale(X, 2), bump);
  const one = F.sin(F.add(A, field1));
  const two = F.sin(F.add(A, field2));
  const difference = F.sub(one, two);
  check('distinct varying fields traced together', new F.Pixel(1, 1e-8).pointValue(difference.terms, at, new Map()),
    sourceAt(1) - sourceAt(2), 'exact represented point signal; joint tracing must preserve both fields', {
      displacement: at,
      fieldKey1: F.elementKey(field1), fieldKey2: F.elementKey(field2),
      fieldCoefficient1: field1.terms[0].c.re, fieldCoefficient2: field2.terms[0].c.re,
      sameAxis: one.terms[0].f[0].axis === two.terms[0].f[0].axis,
    });
}

console.log(JSON.stringify({ measurements: rows.length, note: 'The source/model distinction is intentional. No files or benchmark data were changed.' }));
