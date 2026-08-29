import assert from 'node:assert/strict';
import {
  compileField,
  EXPR_EPS,
  EXPR_MAX_LITERALS,
  EXPR_MAX_OPS,
  EXPR_OPS,
  EXPR_STACK,
  FIELD_PRESETS,
  type CompiledField,
  type FieldCompileError,
} from './expr.ts';
import { evalField } from './evalExpr.ts';
import { emitField, wgslBackend, type EmitBackend } from './emit.ts';
import { fieldWarpCpu, type FieldCode } from '../gpu/inverseCpu.ts';

function compiled(source: string): CompiledField {
  const result = compileField(source);
  if (!result.ok) throw new Error(`expected '${source}' to compile: ${result.error}`);
  return result;
}

function failure(source: string): FieldCompileError {
  const result = compileField(source);
  if (result.ok) throw new Error(`expected '${source}' not to compile`);
  return result;
}

function valueAt(source: string, x: number, y: number): number {
  const program = compiled(source);
  return evalField(program.code, program.literals, x, y).f;
}

function approx(actual: number, expected: number, tol = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);
}

// ---------------------------------------------------------------- parsing

// Precedence and associativity, the two things a hand-rolled parser gets wrong.
approx(valueAt('1 + 2 * 3', 0, 0), 7);
approx(valueAt('2 * 3 + 1', 0, 0), 7);
approx(valueAt('(1 + 2) * 3', 0, 0), 9);
approx(valueAt('1 - 2 - 3', 0, 0), -4);
approx(valueAt('8 / 4 / 2', 0, 0), 1);
approx(valueAt('2 ^ 3 ^ 2', 0, 0), 512);
approx(valueAt('2 * 3 ^ 2', 0, 0), 18);
approx(valueAt('-2 ^ 2', 0, 0), -4);
approx(valueAt('(-2) ^ 2', 0, 0), 4);
approx(valueAt('-x ^ 2', 3, 0), -9);
approx(valueAt('- -x', 3, 0), 3);
approx(valueAt('-x * y', 3, 5), -15);
approx(valueAt('x ^ -2', 4, 0), 1 / 16);

// Names, constants and the zero-argument conveniences. Constants land in the
// f32 literal pool, so what comes back is exactly what the shader will read.
approx(valueAt('pi', 0, 0), Math.fround(Math.PI), 0);
approx(valueAt('tau', 0, 0), Math.fround(Math.PI * 2), 0);
approx(valueAt('e', 0, 0), Math.fround(Math.E), 0);
approx(valueAt('r', 3, 4), 5);
approx(valueAt('r()', 3, 4), 5);
approx(valueAt('theta', 0, 2), Math.PI / 2);
approx(valueAt('hypot(x, y)', 3, 4), 5);

// Nested calls, and every arity.
approx(valueAt('sin(cos(0) + max(x, y))', 1, 2), Math.sin(3));
approx(valueAt('clamp(x, 0, 1)', 2.5, 0), 1);
approx(valueAt('clamp(x, 0, 1)', -2.5, 0), 0);
approx(valueAt('smoothstep(0, 1, x)', 0.5, 0), 0.5);
approx(valueAt('smoothstep(0, 1, x)', -1, 0), 0);
approx(valueAt('smoothstep(0, 1, x)', 4, 0), 1);
approx(valueAt('atan2(y, x)', 1, 1), Math.PI / 4);
approx(valueAt('min(x, y) + max(x, y)', 3, 8), 11);
approx(valueAt('floor(x) + sign(y) + abs(x)', -2.5, -4), -3 - 1 + 2.5);

// Malformed sources are errors, never exceptions.
const BROKEN = [
  '',
  '   ',
  'x +',
  '+ x',
  '(x',
  'x)',
  '((x)',
  'sin',
  'sin(',
  'sin(x',
  'sin(x, y)',
  'atan2(x)',
  'clamp(x, y)',
  'sinh(x)',
  'foo',
  'x(1)',
  'pi(2)',
  'x y',
  '2 x',
  'x , y',
  '1..2',
  'x @ y',
  'x $ 1',
  '#',
  ',',
  '^x',
  '*x',
  'x**y',
  '1e',
  '1e+',
  'clamp(x, 0, 1, 2)',
  'smoothstep(x)',
  'r(x)',
  'theta(1)',
];
for (const source of BROKEN) {
  assert.ok(failure(source).error.length > 0, `'${source}' needs a message`);
}

// Nothing throws, whatever lands in the box. Random bytes from the alphabet a
// user can actually type, plus the presets mangled by deletion.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = 'xy0123456789.+-*/^(), sincotaqrhmp_@#';
const fuzz = mulberry32(0x5eed);
for (let i = 0; i < 4000; i++) {
  const length = 1 + Math.floor(fuzz() * 24);
  let source = '';
  for (let j = 0; j < length; j++) {
    source += ALPHABET[Math.floor(fuzz() * ALPHABET.length)];
  }
  compileField(source);
}
for (const preset of FIELD_PRESETS) {
  for (let i = 0; i < preset.source.length; i++) {
    compileField(preset.source.slice(0, i));
    compileField(preset.source.slice(0, i) + preset.source.slice(i + 1));
  }
}

// Errors point at an offset, which is what the expression box underlines.
const unknownFn = failure('1 + sinh(x)');
assert.match(unknownFn.error, /unknown function 'sinh' at 4/);
assert.equal(unknownFn.at, 4);
assert.match(failure('sin(x + y').error, /expected '\)' at 9/);

// ------------------------------------------------------------------ limits

for (const preset of FIELD_PRESETS) {
  const program = compiled(preset.source);
  assert.ok(
    program.code.length <= EXPR_MAX_OPS,
    `${preset.id} uses ${program.code.length} ops, limit ${EXPR_MAX_OPS}`
  );
  assert.ok(
    program.literals.length <= EXPR_MAX_LITERALS,
    `${preset.id} uses ${program.literals.length} literals, limit ${EXPR_MAX_LITERALS}`
  );
  assert.ok(
    program.stackDepth <= EXPR_STACK,
    `${preset.id} needs ${program.stackDepth} stack slots, limit ${EXPR_STACK}`
  );
  assert.equal(program.code[program.code.length - 1], EXPR_OPS.halt);
}

// Overrunning a limit is a compile error with a message, not a crash and not a
// program the shader would read past the end of.
assert.match(failure(Array.from({ length: 200 }, () => 'x').join(' + ')).error, /too long/);
// Distinct constants added onto `x` so nothing folds away, two ops apiece, which
// exhausts the literal table while the op budget still has room.
const many = (count: number) =>
  `x + ${Array.from({ length: count }, (_, i) => `${i + 1}.5`).join(' + ')}`;
assert.equal(compiled(many(EXPR_MAX_LITERALS)).literals.length, EXPR_MAX_LITERALS);
assert.match(failure(many(EXPR_MAX_LITERALS + 1)).error, /too many constants/);
// Right-nested addition holds one operand per level, so it is the shape that
// outruns the stack long before it outruns the op budget.
const deep = (levels: number) => 'x + ('.repeat(levels) + 'x' + ')'.repeat(levels);
assert.equal(compiled(deep(EXPR_STACK - 2)).stackDepth, EXPR_STACK - 1);
assert.match(failure(deep(EXPR_STACK + 4)).error, /too deeply nested/);

// -------------------------------------------------------------- round trip

// The bytecode has to mean what the source says, so check it against closures
// written straight from the text.
const ROUND_TRIP: { source: string; f: (x: number, y: number) => number }[] = [
  { source: 'x^2 - y^2', f: (x, y) => x * x - y * y },
  { source: '3 * x + y / 2 - 1', f: (x, y) => 3 * x + y / 2 - 1 },
  { source: 'sin(x) * cos(y)', f: (x, y) => Math.sin(x) * Math.cos(y) },
  { source: 'exp(-(x^2 + y^2))', f: (x, y) => Math.exp(-(x * x + y * y)) },
  { source: 'sqrt(x^2 + y^2 + 1)', f: (x, y) => Math.sqrt(x * x + y * y + 1) },
  { source: 'atan2(y, x) * hypot(x, y)', f: (x, y) => Math.atan2(y, x) * Math.hypot(x, y) },
  { source: 'min(x, y) * max(x, -y)', f: (x, y) => Math.min(x, y) * Math.max(x, -y) },
  { source: 'log(x^2 + 2) / tau', f: (x) => Math.log(x * x + 2) / (Math.PI * 2) },
  { source: 'clamp(x * y, -1, 1)', f: (x, y) => Math.min(Math.max(x * y, -1), 1) },
  { source: '2 * pi * r', f: (x, y) => 2 * Math.PI * Math.hypot(x, y) },
  { source: 'x^3 - 3 * x * y^2', f: (x, y) => x * x * x - 3 * x * y * y },
];
let roundTripWorst = 0;
for (const probe of ROUND_TRIP) {
  const program = compiled(probe.source);
  for (let i = 0; i < 60; i++) {
    const x = Math.cos(i * 1.37) * (0.2 + (i % 7) * 0.31);
    const y = Math.sin(i * 2.11) * (0.2 + (i % 5) * 0.43);
    const got = evalField(program.code, program.literals, x, y).f;
    const want = probe.f(x, y);
    roundTripWorst = Math.max(roundTripWorst, Math.abs(got - want) / Math.max(1, Math.abs(want)));
  }
}
assert.ok(roundTripWorst < 1e-6, `bytecode drifts from its source, worst=${roundTripWorst}`);

// --------------------------------------------------------------- gradients

/**
 * Fourth-order central difference. Its error is O(h^4) in truncation and
 * O(eps/h) in roundoff, so at h = 1e-3 in doubles it is good to ~1e-12 — far
 * tighter than the tolerance, which is the point: what is being tested is the
 * dual-number gradient, not the stencil.
 */
function centralDiff(f: (t: number) => number, h: number): number {
  return (f(-2 * h) - 8 * f(-h) + 8 * f(h) - f(2 * h)) / (12 * h);
}

const GRAD_STEP = 1e-3;
const GRAD_TOL = 1e-7;

interface AxisProbe {
  /** `|analytic - stencil|`, relative to the slope where the slope is large. */
  error: number;
  /** What the stencil can be trusted to, here. */
  tolerance: number;
  /** True when the stencil's own noise is far below `GRAD_TOL`. */
  clean: boolean;
}

/**
 * One axis of the analytic gradient against finite differences, or null where
 * the point is unusable.
 *
 * Two things make a point unusable. A kink — `abs`, `floor`, `min` and friends
 * are not differentiable everywhere, and a stencil straddling a corner reports
 * its own opinion of the corner rather than the chain rule — which shows up as
 * the two step sizes disagreeing. And a non-finite sample.
 *
 * What is left still has a floor: differencing costs about `eps * |f| / h`, so
 * a field of size 1e8 cannot resolve a zero slope to better than about 1e-5 no
 * matter how exact the analytic answer is. That floor rides in `tolerance`, and
 * probes where it matters are excluded from the headline number instead of
 * quietly loosening it.
 */
function probeAxis(g: number, line: (t: number) => number): AxisProbe | null {
  let scale = 0;
  for (const t of [-4e-3, -2e-3, -1e-3, 0, 1e-3, 2e-3, 4e-3]) {
    const v = line(t);
    if (!Number.isFinite(v)) return null;
    scale = Math.max(scale, Math.abs(v));
  }
  const fine = centralDiff(line, GRAD_STEP);
  const coarse = centralDiff(line, 2 * GRAD_STEP);
  if (!Number.isFinite(fine) || !Number.isFinite(coarse)) return null;
  const noise = (32 * Number.EPSILON * scale) / GRAD_STEP;
  if (Math.abs(fine - coarse) > 1e-6 * Math.max(1, Math.abs(fine)) + noise) return null;
  const span = Math.max(1, Math.abs(fine));
  return {
    error: Math.abs(g - fine) / span,
    tolerance: GRAD_TOL + noise / span,
    clean: noise < GRAD_TOL * span,
  };
}

const gradWorst = { preset: 0, random: 0 };
let gradWorstAt = '';
let gradChecked = 0;
let gradGroup: 'preset' | 'random' = 'preset';

function checkGradients(label: string, source: string, span = 1.4): void {
  const program = compiled(source);
  const at = (px: number, py: number) => evalField(program.code, program.literals, px, py).f;
  for (let i = 0; i < 220; i++) {
    const x = ((i * 0.61803398875) % 1) * 2 * span - span + 0.0137;
    const y = ((i * 0.38196601125) % 1) * 2 * span - span - 0.0091;
    const here = evalField(program.code, program.literals, x, y);
    if (!Number.isFinite(here.gx) || !Number.isFinite(here.gy)) continue;
    const axes = [
      probeAxis(here.gx, (t) => at(x + t, y)),
      probeAxis(here.gy, (t) => at(x, y + t)),
    ];
    for (const axis of axes) {
      if (!axis) continue;
      gradChecked += 1;
      if (axis.clean && axis.error > gradWorst[gradGroup]) {
        gradWorst[gradGroup] = axis.error;
        if (gradGroup === 'random') {
          gradWorstAt = `${label} at (${x.toFixed(3)}, ${y.toFixed(3)})`;
        }
      }
      assert.ok(
        axis.error <= axis.tolerance,
        `${label} gradient off by ${axis.error.toExponential(2)} at (${x}, ${y})`
      );
    }
  }
}

for (const preset of FIELD_PRESETS) checkGradients(preset.id, preset.source);

// Random programs, so the chain rule is checked on shapes nobody wrote by hand.
const LEAVES = ['x', 'y', 'r', 'theta', 'pi', 'tau'];
const UNARY = ['sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'floor', 'sign'];
const BINARY = ['min', 'max', 'atan2', 'hypot', 'pow'];
const TERNARY = ['clamp', 'smoothstep'];
const INFIX = ['+', '-', '*', '/', '^'];

function randomSource(rng: () => number, depth: number): string {
  if (depth <= 0 || rng() < 0.28) {
    if (rng() < 0.45) return (rng() * 4 - 2).toFixed(3);
    return LEAVES[Math.floor(rng() * LEAVES.length)];
  }
  const roll = rng();
  if (roll < 0.34) {
    const op = INFIX[Math.floor(rng() * INFIX.length)];
    // A random exponent is almost always a domain error, so `^` gets a small
    // integer — the case the compiler unrolls, and the one presets rely on.
    const rhs = op === '^' ? String(Math.floor(rng() * 5) - 1) : randomSource(rng, depth - 1);
    return `(${randomSource(rng, depth - 1)} ${op} ${rhs})`;
  }
  if (roll < 0.62) return `${UNARY[Math.floor(rng() * UNARY.length)]}(${randomSource(rng, depth - 1)})`;
  if (roll < 0.82) {
    const fn = BINARY[Math.floor(rng() * BINARY.length)];
    return `${fn}(${randomSource(rng, depth - 1)}, ${randomSource(rng, depth - 1)})`;
  }
  if (roll < 0.92) return `-(${randomSource(rng, depth - 1)})`;
  const fn = TERNARY[Math.floor(rng() * TERNARY.length)];
  return `${fn}(${randomSource(rng, depth - 1)}, ${randomSource(rng, depth - 1)}, ${randomSource(rng, depth - 1)})`;
}

const rng = mulberry32(0xf1e1d);
gradGroup = 'random';
let generated = 0;
for (let i = 0; generated < 600 && i < 6000; i++) {
  const source = randomSource(rng, 3 + (i % 2));
  const program = compileField(source);
  if (!program.ok) continue;
  generated += 1;
  checkGradients(`random '${source}'`, source, 1.1);
}
assert.ok(generated >= 400, `too few random programs compiled, ${generated}`);
assert.ok(gradChecked > 20000, `too few gradient probes admissible, ${gradChecked}`);

// ------------------------------------------------- presets vs the old fields

// Every preset has to *be* the field it replaces, not resemble it. Literals are
// f32 on both sides, so what is left is that quantisation against the doubles
// baked into `fieldWarpCpu`.
const PRESET_TOL = 2e-6;
let presetWorst = 0;
let presetWorstAt = '';
const presetReport: string[] = [];

for (let index = 0; index < FIELD_PRESETS.length; index++) {
  const preset = FIELD_PRESETS[index];
  const kind = (index + 1) as FieldCode;
  const program = compiled(preset.source);
  let worst = 0;
  for (const scale of [1, 37, 200, 640]) {
    const L = Math.max(Math.abs(scale), 1e-3);
    for (let i = -12; i <= 12; i++) {
      for (let j = -12; j <= 12; j++) {
        const q = { x: (i / 12) * 1.25 * L, y: (j / 12) * 1.25 * L };
        const want = fieldWarpCpu(q, kind, scale);
        const got = evalField(program.code, program.literals, q.x / L, q.y / L);
        const diff = Math.max(
          Math.abs(got.f - want.f),
          Math.abs(got.gx / L - want.gx) * L,
          Math.abs(got.gy / L - want.gy) * L
        );
        if (diff > worst) {
          worst = diff;
          if (diff > presetWorst) {
            presetWorst = diff;
            presetWorstAt = `${preset.id} scale=${scale} q=(${q.x.toFixed(2)}, ${q.y.toFixed(2)})`;
          }
        }
      }
    }
  }
  presetReport.push(`${preset.id} ${worst.toExponential(1)}`);
  assert.ok(worst <= PRESET_TOL, `${preset.id} diverges from fieldWarpCpu by ${worst}`);
}

// What is left of that disagreement is the literal pool being f32, not the
// expressions being wrong. Ripple carries exactly one constant, so re-running it
// with `tau` at full precision isolates the claim: the residual collapses.
const rippleIndex = FIELD_PRESETS.findIndex((preset) => preset.id === 'ripple');
const ripple = compiled(FIELD_PRESETS[rippleIndex].source);
assert.equal(ripple.literals.length, 1);
assert.equal(ripple.literals[0], Math.fround(Math.PI * 2));
const exactLiterals = Float64Array.of(Math.PI * 2);
let rippleExact = 0;
for (let i = -12; i <= 12; i++) {
  for (let j = -12; j <= 12; j++) {
    const q = { x: (i / 12) * 1.25, y: (j / 12) * 1.25 };
    const want = fieldWarpCpu(q, (rippleIndex + 1) as FieldCode, 1);
    const got = evalField(ripple.code, exactLiterals, q.x, q.y);
    rippleExact = Math.max(
      rippleExact,
      Math.abs(got.f - want.f),
      Math.abs(got.gx - want.gx),
      Math.abs(got.gy - want.gy)
    );
  }
}
assert.ok(rippleExact < 1e-12, `ripple is not the field it replaces, worst=${rippleExact}`);

// A layer with no field is a program that halts before pushing anything.
const empty = evalField(Int32Array.of(EXPR_OPS.halt), new Float32Array(0), 3, 4);
assert.equal(empty.f, 0);
assert.equal(empty.gx, 0);
assert.equal(empty.gy, 0);

// ------------------------------------------------------- unrolled vs interpreted

/**
 * The shader does not run the interpreter above; `emit.ts` unrolls the bytecode
 * into straight-line code and the GPU runs that. Nothing in node can execute WGSL,
 * so the emitter carries a second backend — JavaScript — and the same unrolling is
 * checked against the interpreter it has to agree with. The two differ only in
 * syntax, so a mistake in an opcode's rule shows up here rather than as a wrong
 * picture on someone's screen.
 */
function guardDen(v: number): number {
  return v < 0 ? Math.min(v, -EXPR_EPS.den) : Math.max(v, EXPR_EPS.den);
}

const jsBackend: EmitBackend = {
  bind: (name, expr) => `const ${name} = ${expr};`,
  declare: (name, expr) => `let ${name} = ${expr};`,
  assign: (name, expr) => `${name} = ${expr};`,
  branch: (cond, whenTrue, whenFalse) => [
    `if (${cond}) {`,
    ...whenTrue,
    ...(whenFalse ? ['} else {', ...whenFalse] : []),
    '}',
  ],
  // Both backends have to spell a number the same way for the emitter's own
  // constant folding to fold in the same places, which is why this is not
  // `String(value)`.
  num: (value) =>
    Number.isFinite(value) ? String(value) : value > 0 ? '3.4028235e38' : '-3.4028235e38',
  call: (name, args) => `Math.${name}(${args.join(', ')})`,
  pick: (whenFalse, whenTrue, cond) => `((${cond}) ? (${whenTrue}) : (${whenFalse}))`,
  guard: (expr) => `guard(${expr})`,
};

function unrolled(program: CompiledField): (x: number, y: number) => number[] {
  const { body, result } = emitField(program, jsBackend);
  const tail = result ? `return [${result.v}, ${result.y}, ${result.z}];` : 'return [0, 0, 0];';
  const make = new Function(
    'guard',
    `"use strict"; return (ux, uy) => {\n${body.join('\n')}\n${tail}\n};`
  ) as (g: typeof guardDen) => (x: number, y: number) => number[];
  return make(guardDen);
}

/** The two run the same f64 operations in the same order, so this is tight. */
function agrees(a: number, b: number): boolean {
  if (a === b) return true;
  return Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
}

let unrolledProbes = 0;
let unrolledSkipped = 0;

function checkUnrolled(label: string, source: string): void {
  const program = compiled(source);
  const straight = unrolled(program);
  for (let i = -7; i <= 7; i++) {
    for (let j = -7; j <= 7; j++) {
      const x = i / 5.5;
      const y = j / 5.5;
      const want = evalField(program.code, program.literals, x, y);
      const got = straight(x, y);
      const parts: [string, number, number][] = [
        ['f', got[0], want.f],
        ['df/dx', got[1], want.gx],
        ['df/dy', got[2], want.gy],
      ];
      for (const [part, mine, theirs] of parts) {
        // A random program can overflow to an infinity, and from there the two
        // sides are entitled to disagree: the unrolled code drops a term whose
        // coefficient it can see is zero, while the interpreter can only drop one
        // whose factors are zero at the time. Neither number means anything, and a
        // field that overflows is not one anybody is drawing with.
        if (!Number.isFinite(mine) || !Number.isFinite(theirs)) {
          unrolledSkipped += 1;
          continue;
        }
        assert.ok(
          agrees(mine, theirs),
          `${label}: unrolled ${part} is ${mine}, interpreted ${theirs} at (${x}, ${y})`
        );
        unrolledProbes += 1;
      }
    }
  }
}

for (const preset of FIELD_PRESETS) checkUnrolled(preset.id, preset.source);

const emitRng = mulberry32(0x5eed17);
let unrolledPrograms = 0;
for (let i = 0; unrolledPrograms < 400 && i < 6000; i++) {
  const source = randomSource(emitRng, 3 + (i % 2));
  if (!compileField(source).ok) continue;
  unrolledPrograms += 1;
  checkUnrolled(`random '${source}'`, source);
}
assert.ok(unrolledPrograms >= 300, `too few random programs unrolled, ${unrolledPrograms}`);

// What the unrolling is *for*: no loop, no dispatch, no stack, and — the part
// that cost the most — nothing to pass in. If any of those come back, so does the
// fifty-millisecond frame.
const saddle = emitField(compiled('x^2 - y^2'), wgslBackend).body.join('\n');
for (const shape of ['for (', 'while (', 'switch', 'array<', 'code[', 'st[']) {
  assert.ok(!saddle.includes(shape), `emitted WGSL should not contain '${shape}'`);
}
// `dup` is what `^` unrolls a base with, and it is free: three names, twice.
assert.ok(!saddle.includes('dup'), 'dup should leave no trace in emitted code');
const emittedLines = FIELD_PRESETS.map((preset) => {
  const program = compiled(preset.source);
  return `${preset.id} ${emitField(program, wgslBackend).body.length}/${program.code.length}`;
});

console.log(
  `  gradients: ${gradChecked} probes; worst relative error ` +
    `${gradWorst.preset.toExponential(1)} over ${FIELD_PRESETS.length} presets, ` +
    `${gradWorst.random.toExponential(1)} over ${generated} random programs (${gradWorstAt})`
);
console.log(`  presets vs fieldWarpCpu: ${presetReport.join(', ')} (worst at ${presetWorstAt})`);
console.log(
  `  ripple with its one constant at full precision: ${rippleExact.toExponential(1)}`
);
console.log(`  round trip vs hand-written closures: ${roundTripWorst.toExponential(1)}`);
console.log(
  `  unrolled vs interpreted: ${unrolledProbes} probes agree over ` +
    `${FIELD_PRESETS.length} presets and ${unrolledPrograms} random programs ` +
    `(${unrolledSkipped} skipped as non-finite)`
);
console.log(`  emitted statements per opcode: ${emittedLines.join(', ')}`);
console.log('field expression checks passed');
