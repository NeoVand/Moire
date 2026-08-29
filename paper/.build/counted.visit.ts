export const COUNT = { metric: 0, grad: 0 };
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

/** sin(π/3), the height that shows up in every 3- and 6-fold support form. */
const ROOT3_2 = Math.sqrt(3) / 2;

/**
 * Inradius metric: `shapeRadius(q) = R` is the shape with inradius R.
 *
 * It is the support function `max_k q·n_k` over the N outward normals, and for
 * the side counts the Studio names that collapses to a couple of absolute
 * values — no atan2, no cos. The ring scan calls this once per candidate ring,
 * so the free-side n-gon (and the fractional counts a morph passes through) is
 * the only case that pays for the trigonometric form.
 */
function shapeRadius__raw(
  q: { x: number; y: number },
  shape: ShapeKind,
  sides: number
): number {
  if (shape <= 1) return length2(q);
  if (shape === 2) return Math.max(Math.abs(q.x), Math.abs(q.y));
  const n = shape === 3 ? 3 : Math.max(3, sides);
  if (Math.abs(n - 3) < 1e-3) return Math.max(q.x, ROOT3_2 * Math.abs(q.y) - 0.5 * q.x);
  if (Math.abs(n - 4) < 1e-3) return Math.max(Math.abs(q.x), Math.abs(q.y));
  if (Math.abs(n - 6) < 1e-3) {
    const ax = Math.abs(q.x);
    return Math.max(ax, 0.5 * ax + ROOT3_2 * Math.abs(q.y));
  }
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

/**
 * Ring n with no rotation: `qₙ = p − nδ`, so there is nothing to rotate and the
 * two `rotate2d` calls of the general evaluator — four transcendentals — drop out.
 */
function evalRingFlat(
  p: { x: number; y: number },
  n: number,
  offset: { x: number; y: number },
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number
): number {
  if (n < 0) return 1e6;
  const radius = n * spacing + phase;
  if (radius < 0) return 1e6;
  const q = { x: p.x - offset.x * n, y: p.y - offset.y * n };
  return Math.abs(shapeRadius(q, shape, sides) - radius);
}

/** The two integers around a real crossing. For a convex residual that is all of them. */
function bracketFlat(
  d: number,
  p: { x: number; y: number },
  t: number,
  offset: { x: number; y: number },
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number
): number {
  if (!Number.isFinite(t)) return d;
  const n0 = Math.max(0, Math.floor(t));
  return Math.min(
    d,
    evalRingFlat(p, n0, offset, spacing, phase, shape, sides),
    evalRingFlat(p, n0 + 1, offset, spacing, phase, shape, sides)
  );
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

/**
 * Facets of the metric, or 0 when it is not a polygon's support function.
 * A type morph passes through fractional side counts, where the radial form is
 * nobody's polygon and solving for its edges would be solving for edges that do
 * not exist.
 */
export function facetCount(shape: ShapeKind, sides: number): number {
  if (shape <= 1) return 0;
  if (shape === 2) return 4;
  const n = shape === 3 ? 3 : sides;
  const r = Math.round(n);
  if (r < 3 || r > 24 || Math.abs(n - r) > 1e-3) return 0;
  return r;
}

/**
 * Translated polygons in closed form, for every side count.
 *
 * With θ = 0 the ring frame is affine in the index, `qₙ = p − nδ`, and
 * `shapeRadius` is a support function — convex, and for a polygon the max of N
 * linear forms. So the residual
 *
 *   h(n) = shapeRadius(p − nδ) − (n s + φ) = maxₖ (aₖ − n bₖ) − n s − φ
 *
 * with `aₖ = ⟨p, nₖ⟩` and `bₖ = ⟨δ, nₖ⟩` is piecewise linear and convex in n:
 * one straight segment per facet, slopes rising with n. Its asymptotic slope is
 * `−(s − m)` for `m = shapeRadius(−δ)`, the same drift that bounds the rotated
 * window.
 *
 * When `m < s` every slope is negative, so h falls monotonically and crosses
 * zero exactly once, on some facet's own segment. That crossing is one of the N
 * linear solves `(aₖ − φ)/(s + bₖ)`, and the answer is an integer beside it —
 * no window, no scan, no budget, for any N.
 *
 * When `m = s` the leading facet's slope cancels and h is *constant* past the
 * crossover: every large index sits the same `⟨p, nₖ⟩ − φ` away. That is the
 * band where the family piles up along a line, and where a scan of any finite
 * budget walks off the end without ever reaching the indices that matter. One
 * evaluation of the constant replaces all of them.
 *
 * The L∞ square is the N = 4 instance: normals on the axes, solves on ±x, ±y.
 */
export function polygonTranslated(
  p: { x: number; y: number },
  offset: { x: number; y: number },
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number,
  facets: number
): number {
  // h is convex and, below the marginal drift, strictly falling: one crossing,
  // bracketed by two integers. So the whole solve is 2N + 2 evaluations with no
  // rotation in any of them — cheaper than the scan it replaces, which is the
  // only reason a closed form is worth having here.
  const seed = Math.max(0, (shapeRadius(p, shape, sides) - phase) / spacing);
  let d = bracketFlat(1e6, p, seed, offset, spacing, phase, shape, sides);
  const marginal = Math.abs(spacing - ringDrift(offset, shape, sides)) < 1e-4;

  // The normals are a rotation apart, so carry them instead of calling trig N times.
  const step = TAU / facets;
  const cs = Math.cos(step);
  const ss = Math.sin(step);
  let nx = 1;
  let ny = 0;

  for (let k = 0; k < facets; k++) {
    const a = p.x * nx + p.y * ny;
    const b = offset.x * nx + offset.y * ny;
    const rx = cs * nx - ss * ny;
    ny = ss * nx + cs * ny;
    nx = rx;
    const den = spacing + b;
    if (Math.abs(den) > 1e-6) {
      d = bracketFlat(d, p, (a - phase) / den, offset, spacing, phase, shape, sides);
    } else if (marginal) {
      // s + bₖ = 0 on the facet that leads at large n: h is flat there, so the
      // value it is flat at is the distance, attained at every index past the
      // crossover.
      d = Math.min(d, Math.abs(a - phase));
    }
  }
  return d;
}

/**
 * Ring evaluations one pixel may spend. The seed-and-sweep solver this replaced
 * spent a flat ~1050 on every offset pixel, each costing two rotations and an
 * atan2; this loop is transcendental-free, so the same ceiling is far cheaper.
 * Past it the scan strides on a globally anchored lattice of indices: a thinner
 * family of whole rings, never a broken one.
 */
export const RING_BUDGET = 1024;
/**
 * Only `drift == spacing` makes the window truly unbounded — every ring then
 * passes near the origin, so unboundedly many really do pass near any point.
 * Cap the span there so the loop terminates, and so that razor-thin slice of
 * settings thins out the same way the near-degenerate ones do.
 */
export const RING_SPAN_CAP = 1 << 16;

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
 * How fast ring n's far edge outruns its own radius, per index.
 *
 * `shapeRadius(qₙ) = max_k [ p·R(nθ)n_k − n(δ·n_k) ] ≤ |p| + n·shapeRadius(−δ)`,
 * because the offset enters through the *unrotated* normals. So the exact drift
 * rate is `shapeRadius(−δ)` — `|δ|` only for circles, `max(|δx|,|δy|)` for
 * squares, and as little as `|δ|/2` for a triangle pointed the right way. Using
 * `|δ|` instead declares whole bands of settings unbounded that are not.
 */
export function ringDrift(
  offset: { x: number; y: number },
  shape: ShapeKind,
  sides: number
): number {
  return shapeRadius({ x: -offset.x, y: -offset.y }, shape, sides);
}

/**
 * Integer indices that can possibly land within `guard` of p. With
 * `h(n) = shapeRadius(qₙ) − (n·s + φ)`, `m = shapeRadius(−δ)`, and
 * `|qₙ| ≥ | |p| − n|δ| |`:
 *
 *   κ·| |p| − n|δ| | − (n·s + φ)  ≤  h(n)  ≤  (|p| + n·m) − (n·s + φ)
 *
 * `h(n) ≤ guard` gives the low end. For the high end, `h` runs off to −∞ at rate
 * `s − m` when rings outgrow their drift (p ends up deep inside), or to +∞ at
 * rate `m − s` when the drift wins (p ends up outside every ring). Only `m == s`
 * leaves `h` bounded, and there really are unboundedly many rings near p.
 *
 * Every index outside the window is *proven* farther than guard, so this is a
 * superset of the answer — no ring can hide outside it, which is what kills the
 * zoom-out holes.
 */
export function ringIndexWindow(
  radius: number,
  offLen: number,
  drift: number,
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
  const shrink = spacing - drift;
  if (shrink > EPS) {
    hi = (radius - phase + guard) / shrink;
  } else if (-shrink > EPS) {
    hi = (radius + phase + guard) / -shrink;
  }
  const capped = Number.isFinite(hi) ? Math.ceil(hi) : lo + RING_SPAN_CAP;
  return { lo, hi: Math.max(lo, Math.min(capped, lo + RING_SPAN_CAP)) };
}

/** Power of two that brings `span` inside the budget. 1 when the window fits. */
function ringStride(span: number): number {
  if (span <= RING_BUDGET) return 1;
  return 2 ** Math.ceil(Math.log2(span / RING_BUDGET));
}

/**
 * Walk the window, skipping indices the Lipschitz bound proves cannot win.
 * Sphere tracing, but in ring-index space: from a sample `gap` away, no index
 * within `(gap − bar)/slope` can beat `bar`, so that whole run is skippable
 * without ever evaluating it.
 *
 * `qₙ` advances by a fixed rotation and a fixed translation per index, so the
 * loop carries them instead of recomputing: no sin, cos, or atan2 per ring. The
 * carried rotation is re-anchored often enough that f32 drift stays far below a
 * pixel — at large `n` it is in fact steadier than `cos(nθ − α)` evaluated cold.
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
  const kappa = shapeKappa(shape, sides);
  const drift = ringDrift(offset, shape, sides);
  const { lo, hi } = ringIndexWindow(radius, offLen, drift, spacing, phase, kappa, guard);
  // qₙ = R(-nθ)p − nδ, so dqₙ/dn = −θ·perp(R(-nθ)p) − δ and the bound is a
  // constant: |h'(n)| ≤ |θ||p| + |δ| + s. shapeRadius is 1-Lipschitz in q,
  // including across the corners where its gradient jumps.
  const slope = Math.abs(theta) * radius + offLen + spacing;
  // Anchored to multiples of the stride, not to lo, so neighbouring pixels agree
  // on which rings exist. A stride that shifted with p would break rings apart.
  const stride = ringStride(hi - lo + 1);

  const ct = Math.cos(theta * stride);
  const st = Math.sin(theta * stride);
  let n = Math.ceil(lo / stride) * stride;
  let psi = n * theta - angle;
  let c = Math.cos(psi);
  let sn = Math.sin(psi);
  let offX = n * offset.x;
  let offY = n * offset.y;
  let ringR = n * spacing + phase;
  let carried = 0;

  let best = 1e6;
  for (let i = 0; i < RING_BUDGET; i++) {
    if (n > hi) break;
    if (globalThis.__visited) globalThis.__visited.push(n);
    const gap = Math.abs(
      shapeRadius({ x: radius * c - offX, y: -radius * sn - offY }, shape, sides) - ringR
    );
    if (gap < best) best = gap;
    if (acceptBelow > 0 && best <= acceptBelow) return best;
    // No index within (gap − bar)/slope of here can beat bar, so the next index
    // worth looking at is the first lattice point past that run.
    const bar = Math.min(best, guard);
    const safe = Math.floor((gap - bar) / slope) + 1;
    const jump = Math.max(1, Math.ceil(safe / stride)) * stride;
    n += jump;
    offX += jump * offset.x;
    offY += jump * offset.y;
    ringR += jump * spacing;
    carried += 1;
    if (jump === stride && carried < 32) {
      const nc = c * ct - sn * st;
      sn = sn * ct + c * st;
      c = nc;
    } else {
      psi = n * theta - angle;
      c = Math.cos(psi);
      sn = Math.sin(psi);
      carried = 0;
    }
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
    if (shape <= 1) return circleQuadratic(p, offset, s, phase, shape, sides);
    // h is convex in n here, so the crossing is a linear solve on one facet.
    // Only a drift that outruns the spacing can hide the answer at a breakpoint
    // instead of a crossing, and that case falls through to the scan.
    const facets = facetCount(shape, sides);
    if (facets > 0 && ringDrift(offset, shape, sides) <= s + 1e-4) {
      return polygonTranslated(p, offset, s, phase, shape, sides, facets);
    }
  }

  // Anything past `guard` renders as no ink, so the window only has to be exact below it.
  const guard = Math.max(rejectAbove, s * 0.75);
  return ringScan(p, offset, theta, s, phase, shape, sides, acceptBelow, guard);
}

/** Codes match `fieldWarp` in inverse.wgsl.ts. 0 is no field. */
export type FieldCode = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A field value and its world-space gradient, both dimensionless per world unit. */
export interface FieldSample {
  f: number;
  gx: number;
  gy: number;
}

const BUMP_CENTRES = [
  { x: -0.45, y: 0.35, w: 0.45, a: 1 },
  { x: 0.55, y: -0.4, w: 0.55, a: -1.2 },
  { x: 0.15, y: 0.78, w: 0.33, a: 0.65 },
];

const VORTICES = [
  { x: -0.6, y: -0.7, g: 1 },
  { x: 0.62, y: -0.66, g: -1 },
  { x: 0.55, y: 0.7, g: 0.85 },
  { x: -0.58, y: 0.72, g: -0.7 },
];

/** kx, ky, amplitude, phase. Amplitudes sum to just under 1. */
const TERRAIN_MODES = [
  [1.9, 1.3, 0.34, 0.3],
  [3.1, -2.4, 0.24, 1.9],
  [5.0, 3.9, 0.15, 3.4],
  [-1.3, 5.8, 0.13, 5.1],
  [7.4, -1.35, 0.09, 2.2],
];

/**
 * A scalar field and its gradient, in layer coordinates, normalised so the field
 * is dimensionless and O(1) over `|q| < scale`.
 *
 * Subtracting `amount · spacing · f` from a family's phase makes the index
 * difference against the unmodulated family exactly `amount · f`, so the fringes
 * are the level sets of `f` at interval `1/amount`. The gradient is needed
 * because `Eq. (eikonal)` divides the phase residual by `|∇ψ|`, and modulation
 * changes `∇ψ`: drop it and a modulated stroke thins by however steep the field
 * is, exactly the bug the curve families used to have.
 */
export function fieldWarpCpu(
  q: { x: number; y: number },
  kind: FieldCode,
  scale: number
): FieldSample {
  if (kind <= 0) return { f: 0, gx: 0, gy: 0 };
  const L = Math.max(Math.abs(scale), 1e-3);
  const ux = q.x / L;
  const uy = q.y / L;
  let f = 0;
  let gx = 0;
  let gy = 0;

  if (kind === 1) {
    f = ux * ux - uy * uy;
    gx = 2 * ux;
    gy = -2 * uy;
  } else if (kind === 2) {
    const ax = ux - 1;
    const bx = ux + 1;
    const a = Math.sqrt(ax * ax + uy * uy + 0.0625);
    const b = Math.sqrt(bx * bx + uy * uy + 0.0625);
    f = 0.5 * (1 / a - 1 / b);
    gx = 0.5 * (bx / b ** 3 - ax / a ** 3);
    gy = 0.5 * (uy / b ** 3 - uy / a ** 3);
  } else if (kind === 3) {
    for (const c of BUMP_CENTRES) {
      const dx = ux - c.x;
      const dy = uy - c.y;
      const w2 = c.w * c.w;
      const e = c.a * Math.exp(-(dx * dx + dy * dy) / (2 * w2));
      f += e;
      gx -= (e * dx) / w2;
      gy -= (e * dy) / w2;
    }
  } else if (kind === 4) {
    for (const v of VORTICES) {
      const dx = ux - v.x;
      const dy = uy - v.y;
      const r2 = dx * dx + dy * dy + 0.0324;
      f -= v.g * 0.5 * Math.log(r2);
      gx -= (v.g * dx) / r2;
      gy -= (v.g * dy) / r2;
    }
  } else if (kind === 5) {
    const r = Math.hypot(ux, uy);
    f = Math.cos(TAU * r);
    const k = (-TAU * Math.sin(TAU * r)) / Math.max(r, 1e-4);
    gx = k * ux;
    gy = k * uy;
  } else {
    for (const [kx, ky, amp, ph] of TERRAIN_MODES) {
      const arg = kx * ux + ky * uy + ph;
      f += amp * Math.sin(arg);
      gx += amp * Math.cos(arg) * kx;
      gy += amp * Math.cos(arg) * ky;
    }
  }

  return { f, gx: gx / L, gy: gy / L };
}

/**
 * `warp` shifts the phase residual and `warpGrad` is its world-space gradient,
 * both zero unless the layer carries a field. The divide is a no-op at
 * `warpGrad = 0`, since a line family's phase gradient is already a unit vector.
 */
export function lineDistanceCpu(
  p: { x: number; y: number },
  angle: number,
  spacing: number,
  phase: number,
  progressive: number,
  warp = 0,
  warpGrad: { x: number; y: number } = { x: 0, y: 0 }
): number {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const proj = dot(p, dir) - phase - warp;
  const pitch = spacing + progressive;
  const s = Math.abs(pitch) > 1e-4 ? pitch : spacing;
  const grad = Math.hypot(dir.x - warpGrad.x, dir.y - warpGrad.y);
  return periodicDist(proj, s) / Math.max(grad, 1e-4);
}

const WAVE_CYCLE = 32;
const PARABOLA_BEND = 0.01;

/**
 * 0 wave, 1 parabola, 2 hyperbola, 3 spiral.
 *
 * Each of these families is the level sets of a phase function ψ, with member n
 * on `ψ = n·s + φ`. The stroke test wants a Euclidean distance, and the phase
 * residual is not one: it has to be divided by `|∇ψ|`. Skip that and a stroke is
 * too thin by exactly the factor the family is steep by — which also voids the
 * `1.15·pixel` hairline floor, since the floor is then applied in phase units
 * instead of world units and no longer guarantees anything on screen.
 *
 * `∇ψ` is carried as a vector, not a magnitude, so a field's gradient can be
 * added to it: `warp` shifts the residual and `warpGrad` is what that shift does
 * to `∇ψ`.
 */
export function curveDistanceCpu(
  p: { x: number; y: number },
  kind: number,
  spacing: number,
  phase: number,
  bend: number,
  frequency = 1,
  warp = 0,
  warpGrad: { x: number; y: number } = { x: 0, y: 0 }
): number {
  const s = Math.abs(spacing) > 1e-4 ? Math.abs(spacing) : 1e-4;
  const k = Math.round(kind);
  const norm = (gx: number, gy: number) =>
    Math.max(Math.hypot(gx - warpGrad.x, gy - warpGrad.y), 1e-4);
  if (k <= 0) {
    const lambda = WAVE_CYCLE / Math.max(frequency, 0.05);
    const w = TAU / lambda;
    const osc = bend * Math.sin(w * p.y + phase);
    return (
      periodicDist(p.x - osc - warp, s) / norm(1, -bend * w * Math.cos(w * p.y + phase))
    );
  }
  if (k === 1) {
    const a = bend * PARABOLA_BEND;
    const psi = p.y - a * p.x * p.x - phase - warp;
    return periodicDist(psi, s) / norm(-2 * a * p.x, 1);
  }
  if (k === 2) {
    const u = p.x * p.x - p.y * p.y;
    const m = Math.sqrt(Math.abs(u));
    const adj = m - phase - warp;
    const n = Math.max(Math.round(adj / s), 1);
    const sg = Math.sign(u);
    const md = Math.max(m, 1e-4);
    return Math.abs(adj - n * s) / norm((sg * p.x) / md, (-sg * p.y) / md);
  }
  const r = length2(p);
  if (r < EPS) return periodicDist(-phase - warp, s);
  if (Math.abs(bend) < 1e-4) {
    return periodicDist(r - phase - warp, s) / norm(p.x / r, p.y / r);
  }
  const starts = Math.max(1, Math.round(Math.abs(bend) / s));
  const b = (starts * s) / TAU;
  const th = Math.atan2(p.y, p.x);
  return (
    periodicDist(r - b * th - phase - warp, s) /
    norm(p.x / r + (b * p.y) / (r * r), p.y / r - (b * p.x) / (r * r))
  );
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

export function shapeRadius(...a) {
  COUNT.metric += 1;
  return shapeRadius__raw(...a);
}
