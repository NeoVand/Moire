/**
 * CPU mirror of the WGSL inverse. Used to lock the math:
 * no maxRings, closed-form where it exists, a bounded window otherwise.
 *
 * Rotation makes the nearest ring index wander away from |p|/spacing —
 * far from the origin a 45° square family lives near |p|/(s√2), not |p|/s.
 * `shapeKappa` measures that fan exactly, so the index window is a proven
 * superset of the answer instead of a seeded guess with a sample budget.
 */

export type ShapeKind = 1 | 2 | 3 | 4;

const EPS = 1e-6;
const TAU = Math.PI * 2;

function rotate2d(p: { x: number; y: number }, a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: c * p.x - s * p.y, y: s * p.x + c * p.y };
}

function length2(v: { x: number; y: number }) {
  return Math.hypot(v.x, v.y);
}

function dot(a: { x: number; y: number }, b: { x: number; y: number }) {
  return a.x * b.x + a.y * b.y;
}

function wrapToHalf(ang: number, seg: number): number {
  const half = seg * 0.5;
  let a = ((ang + half) % seg) - half;
  if (a < -half) a += seg;
  if (a > half) a -= seg;
  return a;
}

export function shapeRadius(
  q: { x: number; y: number },
  shape: ShapeKind,
  sides: number
): number {
  if (shape <= 1) return length2(q);
  if (shape === 2) return Math.max(Math.abs(q.x), Math.abs(q.y));
  const n = shape === 3 ? 3 : Math.max(3, sides);
  const ang = Math.atan2(q.y, q.x);
  const seg = TAU / n;
  return length2(q) * Math.cos(wrapToHalf(ang, seg));
}

function evalRing(
  p: { x: number; y: number },
  n: number,
  offset: { x: number; y: number },
  theta: number,
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number
): number {
  if (n < 0) return 1e6;
  const radius = n * spacing + phase;
  if (radius < 0) return 1e6;
  const center = rotate2d({ x: offset.x * n, y: offset.y * n }, n * theta);
  const q = rotate2d({ x: p.x - center.x, y: p.y - center.y }, -n * theta);
  return Math.abs(shapeRadius(q, shape, sides) - radius);
}

function checkWindow(
  p: { x: number; y: number },
  t: number,
  offset: { x: number; y: number },
  theta: number,
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number,
  half: number
): number {
  const n0 = Math.floor(t);
  const h = Math.min(16, Math.max(0, Math.round(half)));
  let d = 1e6;
  for (let k = -h; k <= h; k++) {
    d = Math.min(d, evalRing(p, n0 + k, offset, theta, spacing, phase, shape, sides));
  }
  return d;
}

function periodicDist(value: number, spacing: number): number {
  const s = Math.abs(spacing);
  if (s < 1e-8) return Math.abs(value);
  const q = value / s;
  const f = q - Math.floor(q);
  return Math.min(f, 1 - f) * s;
}

export function centeredMod(r: number, spacing: number, phase: number): number {
  const adj = r - phase;
  if (adj < 0) return -adj;
  return periodicDist(adj, spacing);
}

function consider(
  d: number,
  p: { x: number; y: number },
  t: number,
  offset: { x: number; y: number },
  theta: number,
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number,
  half: number
): number {
  if (!Number.isFinite(t)) return d;
  return Math.min(d, checkWindow(p, t, offset, theta, spacing, phase, shape, sides, half));
}

export function circleQuadratic(
  p: { x: number; y: number },
  offset: { x: number; y: number },
  spacing: number,
  phase: number,
  shape: ShapeKind = 1,
  sides = 3
): number {
  const r = length2(p);
  const scale = Math.max(r, 1);
  const A = dot(offset, offset) - spacing * spacing;
  const B = -2 * (dot(p, offset) + spacing * phase);
  const C = r * r - phase * phase;
  const guess = Math.max(0, (r - phase) / Math.max(spacing, 1e-5));
  let d = checkWindow(p, guess, offset, 0, spacing, phase, shape, sides, 3);

  if (Math.abs(A) < 1e-8) {
    if (Math.abs(B) > 1e-8) {
      d = consider(d, p, -C / B, offset, 0, spacing, phase, shape, sides, 3);
    }
    return d;
  }

  const Bs = B / scale;
  const Cs = C / (scale * scale);
  const disc = Bs * Bs - 4 * A * Cs;
  if (disc >= 0) {
    const sd = Math.sqrt(disc);
    const q = -0.5 * (Bs + (Bs >= 0 ? sd : -sd));
    if (Math.abs(q) > 1e-12) {
      d = consider(d, p, (q / A) * scale, offset, 0, spacing, phase, shape, sides, 3);
      d = consider(d, p, (Cs / q) * scale, offset, 0, spacing, phase, shape, sides, 3);
    }
  }
  return d;
}

/** Closed-form L∞ candidates: σ (p_a − n δ_a) = n s + φ */
export function squareTranslated(
  p: { x: number; y: number },
  offset: { x: number; y: number },
  spacing: number,
  phase: number
): number {
  const rInf = Math.max(Math.abs(p.x), Math.abs(p.y));
  let d = checkWindow(p, Math.max(0, (rInf - phase) / spacing), offset, 0, spacing, phase, 2, 4, 3);

  const tryAxis = (coord: number, delta: number) => {
    const plus = spacing + delta;
    if (Math.abs(plus) > 1e-6) {
      d = consider(d, p, (coord - phase) / plus, offset, 0, spacing, phase, 2, 4, 3);
    }
    const minus = spacing - delta;
    if (Math.abs(minus) > 1e-6) {
      d = consider(d, p, (-coord - phase) / minus, offset, 0, spacing, phase, 2, 4, 3);
    }
  };

  tryAxis(p.x, offset.x);
  tryAxis(p.y, offset.y);
  return d;
}

/**
 * Indices the strided scan will visit. The old solver's worst case was 32 × 33
 * ring evaluations, each costing two rotations, so this budget is a cheaper
 * ceiling than what it replaced.
 */
export const RING_BUDGET = 2048;
/**
 * When κ|δ| ≤ s ≤ |δ| every ring sweeps past the origin, so infinitely many can
 * pass near any point and no finite bound exists. Cap the window there.
 */
const RING_SPAN_CAP = 8192;

/**
 * Tightest constants with `shapeRadius(q) ∈ [κ·|q|, |q|]`.
 *
 * κ = cos(π/N) is exactly how far the radial metric can dip between two
 * vertices, which is exactly how far a rotation can fan the nearest ring
 * index away from |p|/spacing. Bounding that fan is what makes the window
 * provable instead of heuristic.
 */
export function shapeKappa(shape: ShapeKind, sides: number): number {
  if (shape <= 1) return 1;
  if (shape === 2) return Math.SQRT1_2;
  const n = shape === 3 ? 3 : Math.max(3, sides);
  return Math.cos(Math.PI / n);
}

/**
 * Ring n's frame, `R(-nθ)p − nδ`, in one angle instead of two rotations.
 * Rotating the offset out is free because R preserves inner products.
 */
function ringLocal(
  radius: number,
  angle: number,
  n: number,
  theta: number,
  offset: { x: number; y: number }
): { x: number; y: number } {
  const psi = n * theta - angle;
  return {
    x: radius * Math.cos(psi) - n * offset.x,
    y: -radius * Math.sin(psi) - n * offset.y,
  };
}

/**
 * Integer indices that can possibly land within `guard` of p. With
 * `h(n) = shapeRadius(qₙ) − (n·s + φ)` and `|qₙ| ∈ [ | |p| − n|δ| |, |p| + n|δ| ]`:
 *
 *   κ·| |p| − n|δ| | − (n·s + φ)  ≤  h(n)  ≤  (|p| + n|δ|) − (n·s + φ)
 *
 * `h(n) ≤ guard` gives the low end, `h(n) ≥ −guard` the high end. Every index
 * outside is *proven* farther than guard, so this is a superset of the answer —
 * no ring can hide outside it, which is what kills the zoom-out holes.
 */
export function ringIndexWindow(
  radius: number,
  offLen: number,
  spacing: number,
  phase: number,
  kappa: number,
  guard: number
): { lo: number; hi: number } {
  const lo = Math.max(
    0,
    Math.floor((kappa * radius - phase - guard) / (spacing + kappa * offLen))
  );
  let hi = Number.POSITIVE_INFINITY;
  if (spacing > offLen) {
    hi = (radius - phase + guard) / (spacing - offLen);
  } else if (kappa * offLen > spacing) {
    hi = (guard + phase + kappa * radius) / (kappa * offLen - spacing);
  }
  const capped = Number.isFinite(hi) ? Math.ceil(hi) : lo + RING_SPAN_CAP;
  return { lo, hi: Math.max(lo, Math.min(capped, lo + RING_SPAN_CAP)) };
}

/**
 * Walk the window, skipping indices the Lipschitz bound proves cannot win.
 * Sphere tracing, but in ring-index space: from a sample `gap` away, no index
 * within `(gap − bar)/slope` can beat `bar`, so that whole run is skippable
 * without ever evaluating it.
 */
function ringScan(
  p: { x: number; y: number },
  offset: { x: number; y: number },
  theta: number,
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number,
  acceptBelow: number,
  guard: number
): number {
  const radius = length2(p);
  const angle = Math.atan2(p.y, p.x);
  const offLen = length2(offset);
  const spin = Math.abs(theta);
  const kappa = shapeKappa(shape, sides);
  const { lo, hi } = ringIndexWindow(radius, offLen, spacing, phase, kappa, guard);
  // qₙ = R(-nθ)p − nδ, so dqₙ/dn = −θ·perp(R(-nθ)p) − δ and the bound is a
  // constant: |h'(n)| ≤ |θ||p| + |δ| + s. shapeRadius is 1-Lipschitz in q,
  // including across the corners where its gradient jumps.
  const slope = spin * radius + offLen + spacing;

  let best = 1e6;
  let n = lo;
  for (let i = 0; i < RING_BUDGET; i++) {
    if (n > hi) break;
    const q = ringLocal(radius, angle, n, theta, offset);
    const gap = Math.abs(shapeRadius(q, shape, sides) - (n * spacing + phase));
    if (gap < best) best = gap;
    if (acceptBelow > 0 && best <= acceptBelow) return best;
    // No index within (gap − bar)/slope of here can beat bar, so skip the run.
    const bar = Math.min(best, guard);
    const safe = Math.floor((gap - bar) / slope);
    // Keep the tail inside the budget. Only bites when the window is enormous.
    const reach = Math.ceil((hi - n) / Math.max(RING_BUDGET - i, 1));
    n += Math.max(1, safe, reach);
  }
  return Math.min(best, guard);
}

export function ringDistanceCpu(
  p: { x: number; y: number },
  offset: { x: number; y: number },
  theta: number,
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number,
  acceptBelow = 0,
  rejectAbove = 0
): number {
  const s = Math.max(spacing, 1e-4);
  const hasOff = dot(offset, offset) > 1e-8;
  const hasRot = Math.abs(theta) > 1e-8;

  // Circles ignore θ when δ = 0: rotating a radial metric is a no-op.
  if (!hasOff && (!hasRot || shape <= 1)) {
    return centeredMod(shapeRadius(p, shape, sides), s, phase);
  }
  if (!hasRot) {
    if (shape === 2) return squareTranslated(p, offset, s, phase);
    if (shape <= 1) return circleQuadratic(p, offset, s, phase, shape, sides);
  }

  // Anything past `guard` renders as no ink, so the window only has to be exact below it.
  const guard = Math.max(rejectAbove, s * 0.75);
  return ringScan(p, offset, theta, s, phase, shape, sides, acceptBelow, guard);
}

export function lineDistanceCpu(
  p: { x: number; y: number },
  angle: number,
  spacing: number,
  phase: number,
  progressive: number
): number {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const proj = dot(p, dir) - phase;
  const pitch = spacing + progressive;
  const s = Math.abs(pitch) > 1e-4 ? pitch : spacing;
  return periodicDist(proj, s);
}

const WAVE_CYCLE = 32;
const PARABOLA_BEND = 0.01;

/** 0 wave, 1 parabola, 2 hyperbola, 3 spiral. */
export function curveDistanceCpu(
  p: { x: number; y: number },
  kind: number,
  spacing: number,
  phase: number,
  bend: number,
  frequency = 1
): number {
  const s = Math.abs(spacing) > 1e-4 ? Math.abs(spacing) : 1e-4;
  const k = Math.round(kind);
  if (k <= 0) {
    const lambda = WAVE_CYCLE / Math.max(frequency, 0.05);
    const osc = bend * Math.sin((TAU * p.y) / lambda + phase);
    return periodicDist(p.x - osc, s);
  }
  if (k === 1) {
    const a = bend * PARABOLA_BEND;
    const psi = p.y - a * p.x * p.x - phase;
    const grad = Math.hypot(1, 2 * a * p.x);
    return periodicDist(psi, s) / Math.max(grad, 1e-4);
  }
  if (k === 2) {
    const u = p.x * p.x - p.y * p.y;
    const adj = Math.sqrt(Math.abs(u)) - phase;
    const n = Math.max(Math.round(adj / s), 1);
    return Math.abs(adj - n * s);
  }
  const r = length2(p);
  if (r < EPS) return periodicDist(-phase, s);
  if (Math.abs(bend) < 1e-4) return periodicDist(r - phase, s);
  const starts = Math.max(1, Math.round(Math.abs(bend) / s));
  const pitch = starts * s;
  const th = Math.atan2(p.y, p.x);
  return periodicDist(r - (pitch / TAU) * th - phase, s);
}

/** N undirected lines through the origin, equally spaced over π. `start` opens a hole at the center. */
export function radialLineDistanceCpu(
  p: { x: number; y: number },
  count: number,
  start = 0
): number {
  const n = Math.max(1, Math.round(count));
  const r = length2(p);
  const inner = Math.max(0, start);
  if (r < EPS) return inner;
  const seg = Math.PI / n;
  const dLine = r * Math.abs(Math.sin(wrapToHalf(Math.atan2(p.y, p.x), seg)));
  return Math.max(dLine, inner - r);
}
