import { EXPR_EPS, EXPR_OPS, type CompiledField } from './expr.ts';

/**
 * Bytecode to straight-line code.
 *
 * `evalExpr.ts` interprets a program: fetch an opcode, dispatch on it, push a
 * dual number, repeat. That is the right shape for a CPU evaluating a field once
 * for a preview and the wrong shape entirely for a fragment shader evaluating it
 * a few million times a frame. Interpreted, a sixty-instruction program cost
 * about fifty milliseconds a frame — and, the part that is easy to miss, nearly
 * as much when the program was *empty*, because the call had to hand the whole
 * program over before it could discover there was nothing in it.
 *
 * So the shader does not interpret. The opcodes are unrolled here, once, into
 * arithmetic with no loop, no dispatch, no stack and no program to pass: the
 * compile-time stack holds the *names* of values rather than the values, `dup`
 * costs nothing at all because it pushes a name twice, constants are spelled
 * into the source where the shader compiler can fold them, and a layer with no
 * field emits no instructions rather than a branch around them. What reaches the
 * GPU is close to what a person would have written by hand for that one
 * expression.
 *
 * The price is that a new expression is a new shader, which is why the renderer
 * waits for typing to stop before it rebuilds.
 *
 * A backend is a dozen lines of syntax, and there are two: WGSL, which ships,
 * and JavaScript, which exists so the tests can check the unrolled arithmetic
 * against the interpreter it has to agree with. Without that second backend the
 * emitted code would be unverifiable outside a browser.
 */
export interface EmitBackend {
  /** An immutable binding. */
  bind(name: string, expr: string): string;
  /** A rebindable one, for opcodes whose value comes out of a branch. */
  declare(name: string, expr: string): string;
  assign(name: string, expr: string): string;
  branch(cond: string, whenTrue: string[], whenFalse?: string[]): string[];
  /** A number, spelled so the target reads it as a float. */
  num(value: number): string;
  call(name: string, args: string[]): string;
  /** `cond ? whenTrue : whenFalse`, in the target's spelling. */
  pick(whenFalse: string, whenTrue: string, cond: string): string;
  /** Holds a divisor away from zero without flipping its sign. */
  guard(expr: string): string;
}

/** A dual number as three expressions: the value and its two partials. */
interface Dual {
  v: string;
  y: string;
  z: string;
}

export interface EmitResult {
  body: string[];
  /** Null when the program pushes nothing, which is how a layer carries no field. */
  result: Dual | null;
}

/** Whether an expression is already a bare number, so it needs no binding. */
const LITERAL = /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i;
/** Or already a name — every name `keep` could hand back is an immutable one. */
const NAME = /^[A-Za-z_]\w*$/;

/** WGSL wants a decimal point or an exponent; `String(6)` alone is an integer. */
export function f32(value: number): string {
  if (!Number.isFinite(value)) return value > 0 ? '3.4028235e38' : '-3.4028235e38';
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}

const indent = (lines: string[]): string[] => lines.map((line) => `  ${line}`);

/**
 * The backend that ships. `exprGuard` is a `wgslFn` include that `expr.wgsl.ts`
 * attaches; everything else is WGSL's own vocabulary.
 */
export const wgslBackend: EmitBackend = {
  bind: (name, expr) => `let ${name} = ${expr};`,
  declare: (name, expr) => `var ${name} = ${expr};`,
  assign: (name, expr) => `${name} = ${expr};`,
  branch: (cond, whenTrue, whenFalse) => [
    `if (${cond}) {`,
    ...indent(whenTrue),
    ...(whenFalse ? ['} else {', ...indent(whenFalse)] : []),
    '}',
  ],
  num: f32,
  call: (name, args) => `${name}(${args.join(', ')})`,
  pick: (whenFalse, whenTrue, cond) => `select(${whenFalse}, ${whenTrue}, ${cond})`,
  guard: (expr) => `exprGuard(${expr})`,
};

/**
 * Unroll `compiled` into statements plus the dual number they leave behind.
 *
 * The two coordinates arrive as the names `ux` and `uy`, which the backend's
 * preamble is responsible for binding; the partials that come back are against
 * those, so a caller that normalised by a scale divides them by the same scale.
 */
export function emitField(compiled: CompiledField, back: EmitBackend): EmitResult {
  const body: string[] = [];
  const stack: Dual[] = [];
  const zero = back.num(0);
  const one = back.num(1);
  let at = 0;

  /**
   * Name a value, unless it is already a literal — then pass the literal on so
   * the target's own folding can see it. Most of a gradient is literal zeros, and
   * keeping them visible is what lets `times` and `plus` below drop whole terms of
   * the chain rule: an expression full of constants ends up with almost no
   * derivative arithmetic at all.
   *
   * Dropping them is also the correct rule and not only the cheap one — a term
   * with an exactly-zero factor contributes nothing even when the other factor
   * overflowed, which is the `term` helper in `evalExpr.ts`, reached here at
   * compile time instead of per evaluation.
   */
  const keep = (base: string, expr: string): string => {
    if (LITERAL.test(expr) || NAME.test(expr)) return expr;
    const name = `${base}${at}`;
    body.push(back.bind(name, expr));
    return name;
  };

  const isZero = (expr: string) => expr === zero;
  const negate = (expr: string) => (isZero(expr) ? zero : `-(${expr})`);
  // Dropping a factor of one is exact for every value including the infinities, so
  // unlike the zeros above it needs no argument. It is here because a coordinate's
  // own partial is one, and left in it would multiply through a whole gradient.
  const times = (a: string, b: string) => {
    if (isZero(a) || isZero(b)) return zero;
    if (a === one) return b;
    if (b === one) return a;
    return `${a} * ${b}`;
  };
  const plus = (a: string, b: string) => {
    if (isZero(a)) return b;
    if (isZero(b)) return a;
    return `${a} + ${b}`;
  };
  const minus = (a: string, b: string) => {
    if (isZero(b)) return a;
    if (isZero(a)) return negate(b);
    return `${a} - ${b}`;
  };

  const push = (d: Dual) => {
    stack.push({ v: keep('v', d.v), y: keep('y', d.y), z: keep('z', d.z) });
  };

  /**
   * A value that comes out of a branch, so all three parts have to be rebindable.
   * Seeded with zero rather than left undeclared: WGSL infers the type from the
   * initialiser, and an arm that never runs must still leave a defined number.
   */
  const mutable = (): Dual => {
    const d = { v: `v${at}`, y: `y${at}`, z: `z${at}` };
    body.push(back.declare(d.v, zero), back.declare(d.y, zero), back.declare(d.z, zero));
    return d;
  };

  const copy = (into: Dual, from: Dual): string[] => [
    back.assign(into.v, from.v),
    back.assign(into.y, from.y),
    back.assign(into.z, from.z),
  ];

  for (let i = 0; i < compiled.code.length; i++) {
    const op = compiled.code[i];
    if (op === EXPR_OPS.halt) break;
    at = i;

    if (op >= EXPR_OPS.literal) {
      push({ v: back.num(compiled.literals[op - EXPR_OPS.literal]), y: zero, z: zero });
      continue;
    }
    if (op === EXPR_OPS.x) {
      push({ v: 'ux', y: one, z: zero });
      continue;
    }
    if (op === EXPR_OPS.y) {
      push({ v: 'uy', y: zero, z: one });
      continue;
    }
    if (op === EXPR_OPS.dup) {
      stack.push(stack[stack.length - 1]);
      continue;
    }

    // One argument: the value, then this function's own derivative at it. The
    // chain rule folds in whatever the argument was already carrying. Every case
    // is the one in `evalExpr.ts`, written the same way round, so the two cannot
    // quietly disagree about a guard or a sign.
    if (op <= EXPR_OPS.tan) {
      const a = stack.pop() as Dual;
      let value: string;
      let slope: string;
      if (op === EXPR_OPS.neg) {
        value = negate(a.v);
        slope = back.num(-1);
      } else if (op === EXPR_OPS.abs) {
        value = back.call('abs', [a.v]);
        slope = keep('g', back.call('sign', [a.v]));
      } else if (op === EXPR_OPS.floor) {
        value = back.call('floor', [a.v]);
        slope = zero;
      } else if (op === EXPR_OPS.sign) {
        value = back.call('sign', [a.v]);
        slope = zero;
      } else if (op === EXPR_OPS.sqrt) {
        // Outside the domain the clamped value is flat, so its slope is zero.
        // Carrying the unclamped 0.5 / sqrt there would report a cliff where the
        // field is level, and strokes are divided by that slope.
        value = keep('s', back.call('sqrt', [back.call('max', [a.v, zero])]));
        slope = keep(
          'g',
          back.pick(
            zero,
            `${back.num(0.5)} / ${back.call('max', [value, back.num(EXPR_EPS.root)])}`,
            `${a.v} > ${zero}`
          )
        );
      } else if (op === EXPR_OPS.exp) {
        value = keep('s', back.call('exp', [a.v]));
        slope = value;
      } else if (op === EXPR_OPS.log) {
        const m = keep('m', back.call('max', [a.v, back.num(EXPR_EPS.den)]));
        value = back.call('log', [m]);
        slope = keep('g', back.pick(zero, `${one} / ${m}`, `${a.v} > ${back.num(EXPR_EPS.den)}`));
      } else if (op === EXPR_OPS.sin) {
        value = back.call('sin', [a.v]);
        slope = keep('g', back.call('cos', [a.v]));
      } else if (op === EXPR_OPS.cos) {
        value = back.call('cos', [a.v]);
        slope = keep('g', negate(back.call('sin', [a.v])));
      } else {
        const c = keep('c', back.call('cos', [a.v]));
        value = back.call('tan', [a.v]);
        slope = keep('g', `${one} / ${back.call('max', [`${c} * ${c}`, back.num(EXPR_EPS.den)])}`);
      }
      push({ v: value, y: times(slope, a.y), z: times(slope, a.z) });
      continue;
    }

    if (op <= EXPR_OPS.hypot) {
      const b = stack.pop() as Dual;
      const a = stack.pop() as Dual;

      if (op === EXPR_OPS.add) {
        push({ v: `${a.v} + ${b.v}`, y: plus(a.y, b.y), z: plus(a.z, b.z) });
        continue;
      }
      if (op === EXPR_OPS.sub) {
        push({ v: `${a.v} - ${b.v}`, y: minus(a.y, b.y), z: minus(a.z, b.z) });
        continue;
      }
      if (op === EXPR_OPS.mul) {
        push({
          v: `${a.v} * ${b.v}`,
          y: plus(times(b.v, a.y), times(a.v, b.y)),
          z: plus(times(b.v, a.z), times(a.v, b.z)),
        });
        continue;
      }
      if (op === EXPR_OPS.div) {
        // Once the guard bites, the quotient stops depending on the divisor, so
        // the partial against it is zero and not the pole it would otherwise be.
        const d = keep('d', back.guard(b.v));
        const da = keep('da', `${one} / ${d}`);
        const db = keep('db', back.pick(zero, `${negate(a.v)} / (${d} * ${d})`, `${d} == ${b.v}`));
        push({
          v: `${a.v} / ${d}`,
          y: plus(times(da, a.y), times(db, b.y)),
          z: plus(times(da, a.z), times(db, b.z)),
        });
        continue;
      }
      if (op === EXPR_OPS.pow) {
        // `^` with a small integer exponent never reaches here — the compiler
        // unrolls those into multiplies — so this is the rare general case, and
        // the integral test stays at runtime rather than being specialised.
        const out = mutable();
        const da = `da${at}`;
        const db = `db${at}`;
        const n = `n${at}`;
        const m = `m${at}`;
        body.push(back.declare(da, zero), back.declare(db, zero));
        body.push(back.bind(n, back.call('round', [b.v])));
        // pow() has no answer for a negative base, so an integral exponent goes
        // through the magnitude with the sign put back on afterwards.
        const integral = [
          back.bind(m, back.call('max', [back.call('abs', [a.v]), back.num(EXPR_EPS.den)])),
          back.bind(
            `odd${at}`,
            `${back.call('abs', [
              `${n} - ${back.num(2)} * ${back.call('round', [`${n} * ${back.num(0.5)}`])}`,
            ])} > ${back.num(0.5)}`
          ),
          back.declare(`sn${at}`, one),
          back.declare(`sm${at}`, one),
          ...back.branch(
            `${a.v} < ${zero}`,
            back.branch(
              `odd${at}`,
              [back.assign(`sn${at}`, back.num(-1))],
              [back.assign(`sm${at}`, back.num(-1))]
            )
          ),
          back.assign(out.v, `sn${at} * ${back.call('pow', [m, n])}`),
          back.assign(da, `${n} * sm${at} * ${back.call('pow', [m, `${n} - ${one}`])}`),
        ];
        const real = [
          back.bind(m, back.call('max', [a.v, back.num(EXPR_EPS.den)])),
          back.assign(out.v, back.call('exp', [`${b.v} * ${back.call('log', [m])}`])),
          back.assign(
            da,
            back.pick(zero, `${b.v} * ${out.v} / ${m}`, `${a.v} > ${back.num(EXPR_EPS.den)}`)
          ),
          back.assign(db, `${out.v} * ${back.call('log', [m])}`),
        ];
        body.push(
          ...back.branch(
            `${back.call('abs', [`${b.v} - ${n}`])} < ${back.num(1e-6)} && ${b.y} == ${zero} && ${b.z} == ${zero}`,
            integral,
            real
          ),
          back.assign(out.y, plus(times(da, a.y), times(db, b.y))),
          back.assign(out.z, plus(times(da, a.z), times(db, b.z)))
        );
        stack.push(out);
        continue;
      }
      if (op === EXPR_OPS.min || op === EXPR_OPS.max) {
        // The whole winning dual is copied rather than the interpreter's `1 * a +
        // 0 * b`: the same number, without multiplying the loser's gradient by a
        // zero the shader compiler cannot see through.
        const out = mutable();
        const takeA = op === EXPR_OPS.min ? `${a.v} <= ${b.v}` : `${a.v} >= ${b.v}`;
        body.push(...back.branch(takeA, copy(out, a), copy(out, b)));
        stack.push(out);
        continue;
      }
      if (op === EXPR_OPS.atan2) {
        const d2 = keep(
          'd',
          back.call('max', [`${a.v} * ${a.v} + ${b.v} * ${b.v}`, back.num(EXPR_EPS.den)])
        );
        const da = keep('da', `${b.v} / ${d2}`);
        const db = keep('db', `${negate(a.v)} / ${d2}`);
        push({
          v: back.call('atan2', [a.v, b.v]),
          y: plus(times(da, a.y), times(db, b.y)),
          z: plus(times(da, a.z), times(db, b.z)),
        });
        continue;
      }
      const h = keep('s', back.call('sqrt', [`${a.v} * ${a.v} + ${b.v} * ${b.v}`]));
      const hd = keep('d', back.call('max', [h, back.num(EXPR_EPS.radius)]));
      const da = keep('da', `${a.v} / ${hd}`);
      const db = keep('db', `${b.v} / ${hd}`);
      push({
        v: h,
        y: plus(times(da, a.y), times(db, b.y)),
        z: plus(times(da, a.z), times(db, b.z)),
      });
      continue;
    }

    const s2 = stack.pop() as Dual;
    const s1 = stack.pop() as Dual;
    const s0 = stack.pop() as Dual;

    if (op === EXPR_OPS.clamp) {
      // clamp(a, lo, hi): the value and the gradient both come from whichever of
      // the three the result is currently equal to.
      const out = mutable();
      body.push(
        ...copy(out, s1),
        ...back.branch(`${s0.v} > ${s1.v}`, copy(out, s0)),
        ...back.branch(`${out.v} >= ${s2.v}`, copy(out, s2))
      );
      stack.push(out);
      continue;
    }

    // smoothstep(e0, e1, a). Flat outside the edges, where smoothstep is C1 — a
    // zero gradient there is the true one and not a clamp.
    const out = mutable();
    const den = keep('d', back.guard(`${s1.v} - ${s0.v}`));
    const t = keep('t', `(${s2.v} - ${s0.v}) / ${den}`);
    const w = `w${at}`;
    const ramp = (a: string, b: string, c: string) =>
      `${w} * (${a} - ${b} - ${t} * (${c} - ${b}))`;
    body.push(
      ...back.branch(`${t} <= ${zero} || ${t} >= ${one}`, [
        ...copy(out, { v: back.pick(zero, one, `${t} >= ${one}`), y: zero, z: zero }),
      ], [
        back.bind(w, `${back.num(6)} * ${t} * (${one} - ${t}) / ${den}`),
        back.assign(out.v, `${t} * ${t} * (${back.num(3)} - ${back.num(2)} * ${t})`),
        back.assign(out.y, ramp(s2.y, s0.y, s1.y)),
        back.assign(out.z, ramp(s2.z, s0.z, s1.z)),
      ])
    );
    stack.push(out);
  }

  return { body, result: stack.length ? stack[stack.length - 1] : null };
}
