/**
 * A small scalar language for user-authored fields, compiled to flat bytecode.
 *
 * The renderer needs `f` *and* `grad f` — it divides a phase residual by
 * `|grad psi|` to turn it into a Euclidean distance — so every field used to
 * ship with a hand-derived gradient in two languages. Forward-mode dual numbers
 * remove that: the evaluators carry `(value, d/dx, d/dy)` through each opcode
 * and the gradient falls out exactly. Nothing here differentiates; it only has
 * to emit ops the dual evaluators already know.
 *
 * The bytecode is a stack machine so that the WGSL twin can be a single bounded
 * loop over uniform words, with no recursion and no per-expression recompile.
 */

/**
 * Opcode numbering, read by `evalExpr.ts` and by the WGSL emitter in
 * `expr.wgsl.ts`. Both sides index this table rather than repeating literals,
 * so the two evaluators cannot disagree about what an opcode means.
 *
 * The order is load-bearing: arity is a range test (`<= tan` is unary,
 * `<= hypot` is binary, the rest ternary), which is how the shader dispatches
 * without a 25-way comparison chain. `literal` is a *base*: opcode
 * `literal + k` pushes `literals[k]`, so an instruction never needs an operand
 * field and the program stays one word per step.
 */
export const EXPR_OPS = {
  halt: 0,
  x: 1,
  y: 2,
  dup: 3,
  neg: 4,
  abs: 5,
  floor: 6,
  sign: 7,
  sqrt: 8,
  exp: 9,
  log: 10,
  sin: 11,
  cos: 12,
  tan: 13,
  add: 14,
  sub: 15,
  mul: 16,
  div: 17,
  pow: 18,
  min: 19,
  max: 20,
  atan2: 21,
  hypot: 22,
  clamp: 23,
  smoothstep: 24,
  literal: 32,
} as const;

/**
 * Guards shared by both evaluators, so a singular point produces the same
 * finite number on the CPU and on the GPU instead of a NaN on one of them.
 * `radius` matches the clamp the hand-written `fieldWarp` used for the ripple
 * field, which is what keeps that preset numerically identical to its ancestor.
 */
export const EXPR_EPS = {
  /** Smallest magnitude a divisor or a logarithm argument is allowed to reach. */
  den: 1e-12,
  /** Floor on `sqrt(v)` before it divides the derivative. */
  root: 1e-6,
  /** Floor on a hypot before it divides the derivative. */
  radius: 1e-4,
} as const;

/** Instruction slots a program may use, including its trailing halt. */
export const EXPR_MAX_OPS = 96;
/** Distinct constants a program may reference. */
export const EXPR_MAX_LITERALS = 32;
/** Stack slots the evaluators provide. Compiling checks the peak against it. */
export const EXPR_STACK = 16;
/** Largest integer exponent `^` unrolls into multiplies instead of `pow`. */
const POW_UNROLL_MAX = 8;
/** Parser recursion cap, so a pathological source is an error and not a crash. */
const MAX_NESTING = 64;

export interface CompiledField {
  ok: true;
  code: Int32Array;
  literals: Float32Array;
  stackDepth: number;
}

export interface FieldCompileError {
  ok: false;
  error: string;
  at?: number;
}

export interface FieldPreset {
  id: string;
  label: string;
  source: string;
}

const NAMED_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  tau: Math.PI * 2,
  e: Math.E,
};

const FUNCTION_OPS: Record<string, number> = {
  abs: EXPR_OPS.abs,
  floor: EXPR_OPS.floor,
  sign: EXPR_OPS.sign,
  sqrt: EXPR_OPS.sqrt,
  exp: EXPR_OPS.exp,
  log: EXPR_OPS.log,
  sin: EXPR_OPS.sin,
  cos: EXPR_OPS.cos,
  tan: EXPR_OPS.tan,
  min: EXPR_OPS.min,
  max: EXPR_OPS.max,
  pow: EXPR_OPS.pow,
  atan2: EXPR_OPS.atan2,
  hypot: EXPR_OPS.hypot,
  clamp: EXPR_OPS.clamp,
  smoothstep: EXPR_OPS.smoothstep,
};

/** 1, 2 or 3, from where the opcode sits in `EXPR_OPS`. */
function opArity(op: number): number {
  if (op <= EXPR_OPS.tan) return 1;
  if (op <= EXPR_OPS.hypot) return 2;
  return 3;
}

type Expr =
  | { kind: 'number'; value: number }
  | { kind: 'coord'; axis: 'x' | 'y' }
  | { kind: 'negate'; arg: Expr }
  | { kind: 'infix'; op: '+' | '-' | '*' | '/' | '^'; left: Expr; right: Expr }
  | { kind: 'call'; name: string; op: number; args: Expr[]; at: number };

interface Token {
  kind: 'number' | 'name' | 'punct' | 'end';
  text: string;
  value: number;
  at: number;
}

interface Cursor {
  tokens: Token[];
  pos: number;
  depth: number;
}

const FAULT = Symbol('fieldExprFault');

interface Fault {
  [FAULT]: true;
  message: string;
  at: number;
}

/** `at` below zero is a whole-expression complaint with nowhere to point. */
function fault(message: string, at = -1): never {
  const raised: Fault = { [FAULT]: true, message: at >= 0 ? `${message} at ${at}` : message, at };
  throw raised;
}

function isFault(value: unknown): value is Fault {
  return typeof value === 'object' && value !== null && FAULT in value;
}

// Sticky, so scanning a long source stays linear instead of re-slicing it per number.
const NUMBER_HEAD = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y;
const PUNCTUATION = '+-*/^(),';

function isNameStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isNameBody(ch: string): boolean {
  return isNameStart(ch) || (ch >= '0' && ch <= '9');
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (PUNCTUATION.includes(ch)) {
      tokens.push({ kind: 'punct', text: ch, value: 0, at: i });
      i += 1;
      continue;
    }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      NUMBER_HEAD.lastIndex = i;
      const match = NUMBER_HEAD.exec(source);
      if (!match) fault(`malformed number '${ch}'`, i);
      const value = Number(match[0]);
      if (!Number.isFinite(value)) fault(`number '${match[0]}' is out of range`, i);
      tokens.push({ kind: 'number', text: match[0], value, at: i });
      i += match[0].length;
      continue;
    }
    if (isNameStart(ch)) {
      let j = i + 1;
      while (j < source.length && isNameBody(source[j])) j += 1;
      tokens.push({ kind: 'name', text: source.slice(i, j).toLowerCase(), value: 0, at: i });
      i = j;
      continue;
    }
    fault(`unexpected character '${ch}'`, i);
  }
  tokens.push({ kind: 'end', text: '', value: 0, at: source.length });
  return tokens;
}

function peek(cursor: Cursor): Token {
  return cursor.tokens[cursor.pos];
}

function take(cursor: Cursor): Token {
  const token = cursor.tokens[cursor.pos];
  if (token.kind !== 'end') cursor.pos += 1;
  return token;
}

function expect(cursor: Cursor, text: string): Token {
  const token = peek(cursor);
  if (token.kind === 'punct' && token.text === text) return take(cursor);
  fault(`expected '${text}'`, token.at);
}

function describe(token: Token): string {
  return token.kind === 'end' ? 'end of expression' : `'${token.text}'`;
}

/**
 * Binding powers. `^` is right-associative, so its right power is the lower of
 * the pair; unary minus sits between `*` and `^`, which is what makes `-x^2`
 * read as `-(x^2)`.
 */
function infixPower(token: Token): { left: number; right: number } | null {
  if (token.kind !== 'punct') return null;
  switch (token.text) {
    case '+':
    case '-':
      return { left: 1, right: 2 };
    case '*':
    case '/':
      return { left: 3, right: 4 };
    case '^':
      return { left: 6, right: 5 };
    default:
      return null;
  }
}

const UNARY_POWER = 5;

/** `r` and `theta` are spellings of the two-argument forms, not extra opcodes. */
function sugar(name: string, at: number): Expr | null {
  const x: Expr = { kind: 'coord', axis: 'x' };
  const y: Expr = { kind: 'coord', axis: 'y' };
  if (name === 'r') {
    return { kind: 'call', name: 'hypot', op: EXPR_OPS.hypot, args: [x, y], at };
  }
  if (name === 'theta') {
    return { kind: 'call', name: 'atan2', op: EXPR_OPS.atan2, args: [y, x], at };
  }
  return null;
}

function parseCall(cursor: Cursor, name: string, at: number): Expr {
  const op = FUNCTION_OPS[name];
  if (op === undefined) fault(`unknown function '${name}'`, at);
  expect(cursor, '(');
  const args: Expr[] = [];
  if (!(peek(cursor).kind === 'punct' && peek(cursor).text === ')')) {
    args.push(parseExpression(cursor, 0));
    while (peek(cursor).kind === 'punct' && peek(cursor).text === ',') {
      take(cursor);
      args.push(parseExpression(cursor, 0));
    }
  }
  expect(cursor, ')');
  const arity = opArity(op);
  if (args.length !== arity) {
    fault(`'${name}' takes ${arity} argument${arity === 1 ? '' : 's'}, got ${args.length}`, at);
  }
  return { kind: 'call', name, op, args, at };
}

function parsePrefix(cursor: Cursor): Expr {
  const token = take(cursor);
  if (token.kind === 'number') return { kind: 'number', value: token.value };
  if (token.kind === 'name') {
    const next = peek(cursor);
    const called = next.kind === 'punct' && next.text === '(';
    if (token.text === 'x' || token.text === 'y') {
      if (called) fault(`'${token.text}' is a coordinate, not a function`, token.at);
      return { kind: 'coord', axis: token.text };
    }
    const constant = NAMED_CONSTANTS[token.text];
    if (constant !== undefined) {
      if (called) fault(`'${token.text}' is a constant, not a function`, token.at);
      return { kind: 'number', value: constant };
    }
    const shorthand = sugar(token.text, token.at);
    if (shorthand) {
      // `r()` and `r` mean the same thing; an empty argument list is allowed
      // only because it reads naturally, never required.
      if (called) {
        take(cursor);
        expect(cursor, ')');
      }
      return shorthand;
    }
    if (!called) fault(`unknown name '${token.text}'`, token.at);
    return parseCall(cursor, token.text, token.at);
  }
  if (token.kind === 'punct') {
    if (token.text === '(') {
      const inner = parseExpression(cursor, 0);
      expect(cursor, ')');
      return inner;
    }
    if (token.text === '-') return { kind: 'negate', arg: parseExpression(cursor, UNARY_POWER) };
  }
  fault(`unexpected ${describe(token)}`, token.at);
}

function parseExpression(cursor: Cursor, minPower: number): Expr {
  cursor.depth += 1;
  if (cursor.depth > MAX_NESTING) fault('expression nests too deeply', peek(cursor).at);
  let left = parsePrefix(cursor);
  for (;;) {
    const token = peek(cursor);
    const power = infixPower(token);
    if (!power || power.left < minPower) break;
    take(cursor);
    const right = parseExpression(cursor, power.right);
    left = { kind: 'infix', op: token.text as '+' | '-' | '*' | '/' | '^', left, right };
  }
  cursor.depth -= 1;
  return left;
}

function parseField(source: string): Expr {
  const cursor: Cursor = { tokens: tokenize(source), pos: 0, depth: 0 };
  const root = parseExpression(cursor, 0);
  const trailing = peek(cursor);
  if (trailing.kind !== 'end') fault(`unexpected ${describe(trailing)}`, trailing.at);
  return root;
}

/** The exponent `^` can unroll, or null when it has to go through `pow`. */
function unrollableExponent(node: Expr): number | null {
  const value = constantValue(node);
  if (value === null) return null;
  const n = Math.round(value);
  if (Math.abs(value - n) > 1e-9 || Math.abs(n) > POW_UNROLL_MAX) return null;
  return n;
}

/**
 * The value of a subtree that does not read `x` or `y`, or null.
 *
 * Folding is what lets a preset spell out `2 * 0.45^2` and still fit the op
 * budget. It is deliberately narrow — no calls, no division by anything the
 * runtime would have to guard, no exponent the emitter would not unroll — so
 * that every folded form is the *same* sequence of IEEE operations the stack
 * machine would have run. A fold that took a shortcut the runtime does not take
 * would be a silent disagreement between the presets and their own bytecode.
 */
function constantValue(node: Expr): number | null {
  if (node.kind === 'number') return node.value;
  if (node.kind === 'negate') {
    const inner = constantValue(node.arg);
    return inner === null ? null : -inner;
  }
  if (node.kind !== 'infix') return null;
  const left = constantValue(node.left);
  if (left === null) return null;
  if (node.op === '^') {
    const n = unrollableExponent(node.right);
    return n === null ? null : unrollPower(left, n);
  }
  const right = constantValue(node.right);
  if (right === null) return null;
  if (node.op === '+') return left + right;
  if (node.op === '-') return left - right;
  if (node.op === '*') return left * right;
  return Math.abs(right) < EXPR_EPS.den ? null : left / right;
}

/** `v^n` in the multiply order the unrolled bytecode uses, or null for a guarded divide. */
function unrollPower(v: number, n: number): number | null {
  const m = Math.abs(n);
  let acc = 1;
  for (let i = 0; i < m; i++) acc = v * acc;
  if (n >= 0) return acc;
  return Math.abs(acc) < EXPR_EPS.den ? null : 1 / acc;
}

interface Emitter {
  code: number[];
  literals: number[];
  depth: number;
  peak: number;
}

/**
 * Both budgets are enforced here rather than after emission, so an oversized
 * source is rejected after a bounded amount of work instead of being folded and
 * emitted in full first. One slot is held back for the trailing halt.
 */
function push(emitter: Emitter, op: number, delta: number): void {
  if (emitter.code.length + 1 >= EXPR_MAX_OPS) {
    fault(`expression is too long (limit ${EXPR_MAX_OPS} operations)`);
  }
  emitter.code.push(op);
  emitter.depth += delta;
  if (emitter.depth > emitter.peak) emitter.peak = emitter.depth;
  if (emitter.peak > EXPR_STACK) fault(`expression is too deeply nested (limit ${EXPR_STACK} values)`);
}

function emitLiteral(emitter: Emitter, value: number, at: number): void {
  let index = emitter.literals.indexOf(value);
  if (index < 0) {
    if (emitter.literals.length >= EXPR_MAX_LITERALS) {
      fault(`too many constants (limit ${EXPR_MAX_LITERALS})`, at);
    }
    index = emitter.literals.push(value) - 1;
  }
  push(emitter, EXPR_OPS.literal + index, 1);
}

/**
 * `base^n` for a small integer `n` as repeated multiplication.
 *
 * `pow` is only exact for a positive base, and the saddle preset is `x^2 - y^2`
 * over the whole plane, so the common case must not go near a logarithm. `dup`
 * copies the evaluated base rather than re-running it, which matters when the
 * base is a Gaussian rather than a coordinate.
 */
function emitUnrolledPower(emitter: Emitter, base: Expr, n: number, at: number): void {
  const m = Math.abs(n);
  if (n < 0) emitLiteral(emitter, 1, at);
  if (m === 0) {
    emitLiteral(emitter, 1, at);
  } else {
    emit(emitter, base);
    for (let i = 1; i < m; i++) push(emitter, EXPR_OPS.dup, 1);
    for (let i = 1; i < m; i++) push(emitter, EXPR_OPS.mul, -1);
  }
  if (n < 0) push(emitter, EXPR_OPS.div, -1);
}

const INFIX_OPS: Record<'+' | '-' | '*' | '/', number> = {
  '+': EXPR_OPS.add,
  '-': EXPR_OPS.sub,
  '*': EXPR_OPS.mul,
  '/': EXPR_OPS.div,
};

function emit(emitter: Emitter, node: Expr): void {
  const folded = constantValue(node);
  if (folded !== null) {
    emitLiteral(emitter, folded, nodeOffset(node));
    return;
  }
  if (node.kind === 'number') {
    emitLiteral(emitter, node.value, 0);
    return;
  }
  if (node.kind === 'coord') {
    push(emitter, node.axis === 'x' ? EXPR_OPS.x : EXPR_OPS.y, 1);
    return;
  }
  if (node.kind === 'negate') {
    emit(emitter, node.arg);
    push(emitter, EXPR_OPS.neg, 0);
    return;
  }
  if (node.kind === 'infix') {
    if (node.op === '^') {
      const n = unrollableExponent(node.right);
      if (n !== null) {
        emitUnrolledPower(emitter, node.left, n, nodeOffset(node));
        return;
      }
      emit(emitter, node.left);
      emit(emitter, node.right);
      push(emitter, EXPR_OPS.pow, -1);
      return;
    }
    emit(emitter, node.left);
    emit(emitter, node.right);
    push(emitter, INFIX_OPS[node.op], -1);
    return;
  }
  for (const arg of node.args) emit(emitter, arg);
  push(emitter, node.op, 1 - node.args.length);
}

/** Best offset to blame for a node, for limit errors raised deep in emission. */
function nodeOffset(node: Expr): number {
  if (node.kind === 'call') return node.at;
  if (node.kind === 'negate') return nodeOffset(node.arg);
  if (node.kind === 'infix') return nodeOffset(node.left);
  return 0;
}

/**
 * Compile `f(x, y)` to stack-machine bytecode.
 *
 * The result is a program `evalField` and the WGSL twin both run: `code` ends
 * with `EXPR_OPS.halt`, and an opcode at or above `EXPR_OPS.literal` pushes
 * `literals[op - EXPR_OPS.literal]`. Literals are `Float32Array` on purpose —
 * the CPU evaluator then sees exactly the constants the shader will see.
 *
 * Never throws. A source that is malformed, or that overruns the op, literal or
 * stack limits, comes back as `{ ok: false }` with a message and, where one is
 * known, the offset in `source` to point at.
 */
export function compileField(source: string): CompiledField | FieldCompileError {
  try {
    const root = parseField(source);
    const emitter: Emitter = { code: [], literals: [], depth: 0, peak: 0 };
    emit(emitter, root);
    emitter.code.push(EXPR_OPS.halt);
    return {
      ok: true,
      code: Int32Array.from(emitter.code),
      literals: Float32Array.from(emitter.literals),
      stackDepth: emitter.peak,
    };
  } catch (err) {
    if (isFault(err)) {
      return err.at >= 0
        ? { ok: false, error: err.message, at: err.at }
        : { ok: false, error: err.message };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The six fields the renderer used to bake in, as expressions.
 *
 * Constants are transcribed from `fieldWarpCpu` in `src/gpu/inverseCpu.ts`, and
 * the arithmetic is written in the same association order, so each preset is
 * numerically its predecessor rather than a lookalike.
 */
export const FIELD_PRESETS: FieldPreset[] = [
  {
    id: 'saddle',
    label: 'Saddle',
    source: 'x^2 - y^2',
  },
  {
    id: 'dipole',
    label: 'Dipole',
    source:
      '0.5 * (1 / sqrt((x - 1)^2 + y^2 + 0.0625) - 1 / sqrt((x + 1)^2 + y^2 + 0.0625))',
  },
  {
    id: 'bumps',
    label: 'Bumps',
    source:
      'exp(-((x + 0.45)^2 + (y - 0.35)^2) / (2 * 0.45^2))' +
      ' - 1.2 * exp(-((x - 0.55)^2 + (y + 0.4)^2) / (2 * 0.55^2))' +
      ' + 0.65 * exp(-((x - 0.15)^2 + (y - 0.78)^2) / (2 * 0.33^2))',
  },
  {
    id: 'swirl',
    label: 'Swirl',
    source:
      '-0.5 * log((x + 0.6)^2 + (y + 0.7)^2 + 0.0324)' +
      ' + 0.5 * log((x - 0.62)^2 + (y + 0.66)^2 + 0.0324)' +
      ' - 0.425 * log((x - 0.55)^2 + (y - 0.7)^2 + 0.0324)' +
      ' + 0.35 * log((x + 0.58)^2 + (y - 0.72)^2 + 0.0324)',
  },
  {
    id: 'ripple',
    label: 'Ripple',
    source: 'cos(tau * r)',
  },
  {
    id: 'terrain',
    label: 'Terrain',
    source:
      '0.34 * sin(1.9 * x + 1.3 * y + 0.3)' +
      ' + 0.24 * sin(3.1 * x - 2.4 * y + 1.9)' +
      ' + 0.15 * sin(5 * x + 3.9 * y + 3.4)' +
      ' + 0.13 * sin(-1.3 * x + 5.8 * y + 5.1)' +
      ' + 0.09 * sin(7.4 * x - 1.35 * y + 2.2)',
  },
];
