/**
 * The reference evaluator for compiled field bytecode.
 *
 * Every stack slot is a dual number `(v, dx, dy)`: the value, and its partials
 * against the two coordinates the program was entered with. Seeding `x` with
 * `(x, 1, 0)` and `y` with `(y, 0, 1)` and pushing those partials through each
 * opcode's chain rule leaves the exact gradient on the stack beside the value —
 * no finite differences, and nothing to hand-derive when a user types a new
 * field.
 *
 * `expr.wgsl.ts` is the twin of this file. When an opcode's rule changes here it
 * changes there, and `EXPR_OPS` / `EXPR_EPS` are shared so neither side can
 * drift on numbering or on where a singularity is clamped.
 */

// Explicit extension: this file is the CPU twin and runs under
// `node --experimental-strip-types`, which does not resolve extensionless paths.
import { EXPR_EPS, EXPR_OPS, EXPR_STACK } from './expr.ts';

/** A field value and its gradient, in the coordinates `evalField` was given. */
export interface FieldSample {
  f: number;
  gx: number;
  gy: number;
}

// One stack for the process. `evalField` runs per pixel in the CPU mirror, so it
// allocates nothing per call and is, like the shader, not reentrant.
const stackV = new Float64Array(EXPR_STACK);
const stackX = new Float64Array(EXPR_STACK);
const stackY = new Float64Array(EXPR_STACK);

/** Keeps a divisor away from zero without flipping its sign. */
function guard(v: number): number {
  return v < 0 ? Math.min(v, -EXPR_EPS.den) : Math.max(v, EXPR_EPS.den);
}

/**
 * One term of the chain rule: this function's partial against an argument, times
 * whatever that argument was carrying.
 *
 * Written out rather than multiplied because either factor being exactly zero
 * means the term contributes nothing, and that has to hold even when the other
 * factor is not a number. A constant's partials are zero, `floor`'s slope is zero,
 * and a plain multiply would turn either of those against an overflowed partial
 * into a NaN that then poisons the whole gradient — a zero times a pole is still a
 * derivative that does not vary. `emit.ts` reaches the same rule by folding those
 * zeros away while it generates code, which is how the two agree.
 */
function term(slope: number, carried: number): number {
  return slope === 0 || carried === 0 ? 0 : slope * carried;
}

/**
 * `a^b` where `b` is an integer and constant, which `pow` cannot do for a
 * negative base — and `x^2` over the whole plane is the commonest field there is.
 */
function integerPower(a: number, n: number): { v: number; d: number } {
  const m = Math.max(Math.abs(a), EXPR_EPS.den);
  const odd = Math.abs(n - 2 * Math.round(n * 0.5)) > 0.5;
  let sn = 1;
  let sm = 1;
  if (a < 0) {
    if (odd) sn = -1;
    else sm = -1;
  }
  return { v: sn * Math.pow(m, n), d: n * sm * Math.pow(m, n - 1) };
}

/**
 * Run a compiled program at `(x, y)`.
 *
 * `code` and `literals` come from `compileField`; the gradient is against the
 * coordinates passed in, so a caller that normalised by a scale divides the two
 * partials by that same scale to get world-space slopes. An empty program — one
 * that halts before pushing anything — samples as flat zero, which is how a
 * layer carries no field.
 */
export function evalField(
  code: ArrayLike<number>,
  literals: ArrayLike<number>,
  x: number,
  y: number
): FieldSample {
  let sp = 0;

  for (let i = 0; i < code.length; i++) {
    const op = code[i];
    if (op === EXPR_OPS.halt) break;

    if (op >= EXPR_OPS.literal) {
      stackV[sp] = literals[op - EXPR_OPS.literal];
      stackX[sp] = 0;
      stackY[sp] = 0;
      sp += 1;
      continue;
    }
    if (op === EXPR_OPS.x) {
      stackV[sp] = x;
      stackX[sp] = 1;
      stackY[sp] = 0;
      sp += 1;
      continue;
    }
    if (op === EXPR_OPS.y) {
      stackV[sp] = y;
      stackX[sp] = 0;
      stackY[sp] = 1;
      sp += 1;
      continue;
    }
    if (op === EXPR_OPS.dup) {
      stackV[sp] = stackV[sp - 1];
      stackX[sp] = stackX[sp - 1];
      stackY[sp] = stackY[sp - 1];
      sp += 1;
      continue;
    }

    if (op <= EXPR_OPS.tan) {
      const t = sp - 1;
      const av = stackV[t];
      const ax = stackX[t];
      const ay = stackY[t];
      let v = av;
      let g = 1;
      if (op === EXPR_OPS.neg) {
        v = -av;
        g = -1;
      } else if (op === EXPR_OPS.abs) {
        v = Math.abs(av);
        g = Math.sign(av);
      } else if (op === EXPR_OPS.floor) {
        v = Math.floor(av);
        g = 0;
      } else if (op === EXPR_OPS.sign) {
        v = Math.sign(av);
        g = 0;
      } else if (op === EXPR_OPS.sqrt) {
        // Outside the domain the clamped value is flat, so its slope is zero.
        // Carrying the unclamped `0.5 / sqrt` there would report a cliff where
        // the field is level, and the renderer divides strokes by that slope.
        v = Math.sqrt(Math.max(av, 0));
        g = av > 0 ? 0.5 / Math.max(v, EXPR_EPS.root) : 0;
      } else if (op === EXPR_OPS.exp) {
        v = Math.exp(av);
        g = v;
      } else if (op === EXPR_OPS.log) {
        const m = Math.max(av, EXPR_EPS.den);
        v = Math.log(m);
        g = av > EXPR_EPS.den ? 1 / m : 0;
      } else if (op === EXPR_OPS.sin) {
        v = Math.sin(av);
        g = Math.cos(av);
      } else if (op === EXPR_OPS.cos) {
        v = Math.cos(av);
        g = -Math.sin(av);
      } else {
        const c = Math.cos(av);
        v = Math.tan(av);
        g = 1 / Math.max(c * c, EXPR_EPS.den);
      }
      stackV[t] = v;
      stackX[t] = term(g, ax);
      stackY[t] = term(g, ay);
      continue;
    }

    if (op <= EXPR_OPS.hypot) {
      const t = sp - 2;
      const av = stackV[t];
      const ax = stackX[t];
      const ay = stackY[t];
      const bv = stackV[t + 1];
      const bx = stackX[t + 1];
      const by = stackY[t + 1];
      sp -= 1;
      let v = av;
      // Partials of the result against a and b; the chain rule then folds in
      // whatever a and b carried.
      let da = 1;
      let db = 0;
      if (op === EXPR_OPS.add) {
        v = av + bv;
        db = 1;
      } else if (op === EXPR_OPS.sub) {
        v = av - bv;
        db = -1;
      } else if (op === EXPR_OPS.mul) {
        v = av * bv;
        da = bv;
        db = av;
      } else if (op === EXPR_OPS.div) {
        // Once the guard bites, the quotient stops depending on the divisor, so
        // the partial against it is zero and not the pole it would otherwise be.
        const d = guard(bv);
        v = av / d;
        da = 1 / d;
        db = d === bv ? -av / (d * d) : 0;
      } else if (op === EXPR_OPS.pow) {
        const n = Math.round(bv);
        if (Math.abs(bv - n) < 1e-6 && bx === 0 && by === 0) {
          const p = integerPower(av, n);
          v = p.v;
          da = p.d;
          db = 0;
        } else {
          const m = Math.max(av, EXPR_EPS.den);
          v = Math.exp(bv * Math.log(m));
          da = av > EXPR_EPS.den ? (bv * v) / m : 0;
          db = v * Math.log(m);
        }
      } else if (op === EXPR_OPS.min) {
        const takeA = av <= bv;
        v = takeA ? av : bv;
        da = takeA ? 1 : 0;
        db = takeA ? 0 : 1;
      } else if (op === EXPR_OPS.max) {
        const takeA = av >= bv;
        v = takeA ? av : bv;
        da = takeA ? 1 : 0;
        db = takeA ? 0 : 1;
      } else if (op === EXPR_OPS.atan2) {
        const d2 = Math.max(av * av + bv * bv, EXPR_EPS.den);
        v = Math.atan2(av, bv);
        da = bv / d2;
        db = -av / d2;
      } else {
        const h = Math.sqrt(av * av + bv * bv);
        const hd = Math.max(h, EXPR_EPS.radius);
        v = h;
        da = av / hd;
        db = bv / hd;
      }
      stackV[t] = v;
      stackX[t] = term(da, ax) + term(db, bx);
      stackY[t] = term(da, ay) + term(db, by);
      continue;
    }

    const t = sp - 3;
    sp -= 2;
    if (op === EXPR_OPS.clamp) {
      // clamp(a, lo, hi): the value and the gradient both come from whichever
      // of the three the result is currently equal to.
      const src = stackV[t] > stackV[t + 1] ? t : t + 1;
      const pick = stackV[src] < stackV[t + 2] ? src : t + 2;
      stackV[t] = stackV[pick];
      stackX[t] = stackX[pick];
      stackY[t] = stackY[pick];
      continue;
    }
    // smoothstep(e0, e1, a). Flat outside the edges — smoothstep is C1 there,
    // so a zero gradient is the true one, not a clamp.
    const den = guard(stackV[t + 1] - stackV[t]);
    const s = (stackV[t + 2] - stackV[t]) / den;
    if (s <= 0 || s >= 1) {
      stackV[t] = s <= 0 ? 0 : 1;
      stackX[t] = 0;
      stackY[t] = 0;
      continue;
    }
    const w = (6 * s * (1 - s)) / den;
    stackV[t] = s * s * (3 - 2 * s);
    stackX[t] = w * (stackX[t + 2] - stackX[t] - s * (stackX[t + 1] - stackX[t]));
    stackY[t] = w * (stackY[t + 2] - stackY[t] - s * (stackY[t + 1] - stackY[t]));
  }

  if (sp < 1) return { f: 0, gx: 0, gy: 0 };
  return { f: stackV[sp - 1], gx: stackX[sp - 1], gy: stackY[sp - 1] };
}
