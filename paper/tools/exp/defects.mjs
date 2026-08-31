// The defect theorem, tested: fringe endings are quantized and count the
// enclosed charge.
//
// A field on a layer displaces its index by D(p) = A f(p / L) members
// (evalExpr.ts is the CPU twin of what the shader runs). Against the
// unmodulated twin, the fringes are the integer level sets of D. A level
// set can only end where D is singular, and around any closed loop the
// signed count of integer crossings of D is a winding number — so the
// number of fringe endings inside, counted with sign, equals the enclosed
// charge times the amount, additively over defects, whatever the loop.
//
// The probe: sample D around a circle and sum the wrapped per-step
// differences. Small steps pass through; the evaluator's branch cut (a
// jump of exactly A for an integer amount) wraps away, which is the
// probe's way of agreeing that the drawn fringes never see the cut. Valid
// while the true step stays under half a member, i.e. sampling finer than
// the local fringe pitch.
//
// The second claim is metric, not topological: |grad D| = A / (tau r) for
// a charge-A defect, so eta = |grad D| s crosses the regime threshold 1/4
// at r* = 2 A s / pi — the defect core, inside which the fringe law fails
// and the tool's own mask engages. Measured against the evaluator's exact
// gradients.
//
// Writes paper/data/defects.json; prints a summary. Run with
//   node --experimental-strip-types paper/tools/exp/defects.mjs

import { writeFileSync } from 'node:fs';
import { compileField } from '../../../src/fields/expr.ts';
import { evalField } from '../../../src/fields/evalExpr.ts';

const OUT = new URL('../../data/defects.json', import.meta.url);

const SCALE = 200; // the app's default field extent
const STEPS = 4096;

function program(source) {
  const c = compileField(source);
  if (!c.ok) throw new Error(`compile failed: ${source} — ${c.message}`);
  return c;
}

/** D and its world gradient at a world point, for a field at amount A. */
function sample(prog, amount, x, y) {
  const s = evalField(prog.code, prog.literals, x / SCALE, y / SCALE);
  return { d: s.f * amount, gx: (s.gx * amount) / SCALE, gy: (s.gy * amount) / SCALE };
}

/** Signed integer crossings of D around a circle: the winding probe. */
function winding(prog, amount, cx, cy, radius) {
  let total = 0;
  let prev = sample(prog, amount, cx + radius, cy).d;
  for (let i = 1; i <= STEPS; i += 1) {
    const t = (i / STEPS) * Math.PI * 2;
    const cur = sample(prog, amount, cx + radius * Math.cos(t), cy + radius * Math.sin(t)).d;
    const step = cur - prev;
    total += step - Math.round(step);
    prev = cur;
  }
  return total;
}

const results = [];
let failures = 0;
function check(name, field, amount, cx, cy, radius, expect) {
  const prog = program(field);
  const w = winding(prog, amount, cx, cy, radius);
  const pass = Math.abs(w - expect) < 1e-3;
  if (!pass) failures += 1;
  results.push({
    name,
    field,
    amount,
    center: [cx, cy],
    radius,
    expect,
    measured: Number(w.toFixed(6)),
    pass,
  });
  return w;
}

// Quantization: a charge-1 field at integer amounts, the authored pinwheel.
for (const A of [1, 2, 3, 5, 10]) {
  for (const R of [40, 90, 200]) {
    check(`pinwheel A=${A} R=${R}`, 'theta / tau', A, 0, 0, R, A);
  }
}

// Localization: a displaced defect is enclosed or it is not.
const OFF = 'atan2(y, x - 0.3) / tau'; // defect at world (60, 0)
check('displaced, enclosing', OFF, 4, 60, 0, 30, 4);
check('displaced, missing', OFF, 4, 0, 0, 30, 0);
check('displaced, wide loop', OFF, 4, 0, 0, 150, 4);

// Additivity: a dipole's charges cancel from far enough away.
const DIPOLE = '(atan2(y, x - 0.3) - atan2(y, x + 0.3)) / tau'; // world (±60, 0)
check('dipole, + pole', DIPOLE, 3, 60, 0, 30, 3);
check('dipole, - pole', DIPOLE, 3, -60, 0, 30, -3);
check('dipole, both', DIPOLE, 3, 0, 0, 150, 0);

// Robustness: adding an exact (single-valued) field moves every fringe and
// no ending — winding is blind to the exact part.
check('mixed exact + defect', 'theta / tau + 0.4 * cos(r * 3)', 5, 0, 0, 90, 5);

// A non-integer amount is its own creature: the branch cut becomes a real
// tear in the drawing. The probe still reports an integer (the tear
// carries the fractional remainder), recorded here without a pass gate.
{
  const prog = program('theta / tau');
  const w = winding(prog, 2.5, 0, 0, 90);
  results.push({
    name: 'non-integer amount (observation)',
    field: 'theta / tau',
    amount: 2.5,
    center: [0, 0],
    radius: 90,
    expect: null,
    measured: Number(w.toFixed(6)),
    pass: Math.abs(w - Math.round(w)) < 1e-3,
  });
  if (Math.abs(w - Math.round(w)) >= 1e-3) failures += 1;
}

// The metric claim: eta(r) = A s / (tau r) crosses 1/4 at r* = 2 A s / pi.
// Measured from the evaluator's own gradients along a ray.
const core = [];
{
  const prog = program('theta / tau');
  const s = 12; // carrier spacing, world units
  for (const A of [2, 5, 10]) {
    const rStar = (2 * A * s) / Math.PI;
    // Find the eta = 1/4 crossing by bisection between r*/4 and 4 r*.
    let lo = rStar / 4;
    let hi = rStar * 4;
    for (let i = 0; i < 60; i += 1) {
      const mid = 0.5 * (lo + hi);
      const g = sample(prog, A, mid * Math.SQRT1_2, mid * Math.SQRT1_2);
      const eta = Math.hypot(g.gx, g.gy) * s;
      if (eta > 0.25) lo = mid;
      else hi = mid;
    }
    const measured = 0.5 * (lo + hi);
    const err = Math.abs(measured - rStar) / rStar;
    if (err > 0.02) failures += 1;
    core.push({
      amount: A,
      spacing: s,
      predicted: Number(rStar.toFixed(3)),
      measured: Number(measured.toFixed(3)),
      relError: Number(err.toFixed(5)),
    });
  }
}

writeFileSync(OUT, JSON.stringify({ probes: results, core }, null, 1));

console.log('T4: fringe endings vs enclosed charge (signed crossings on probe loops)');
for (const r of results) {
  const tag = r.pass ? 'ok  ' : 'FAIL';
  const want = r.expect === null ? 'integer' : r.expect;
  console.log(
    `  ${tag} ${r.name.padEnd(28)} expect ${String(want).padEnd(7)} measured ${r.measured}`
  );
}
console.log('defect core: eta = 1/4 at r* = 2 A s / pi');
for (const c of core) {
  console.log(
    `  A=${String(c.amount).padEnd(3)} predicted ${c.predicted}  measured ${c.measured}  rel err ${c.relError}`
  );
}
console.log(failures === 0 ? 'all gates pass' : `${failures} GATE FAILURE(S)`);
process.exitCode = failures === 0 ? 0 : 1;
