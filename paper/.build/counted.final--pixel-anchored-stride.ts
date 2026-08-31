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

/**
 * The residual `h(n) = shapeRadius(qₙ) − (n·s + φ)`, *signed*.
 *
 * Every solver here minimises `|h|`, and for drawing that is all a stroke needs.
 * The sign is what says which side of the member the point is on, and so which
 * way the family moves when its phase advances — the envelope cannot be
 * reconstructed from `|h|` alone, because `|h|` and `g − |h|` are the same
 * distance to two different neighbours and they drift apart in opposite
 * directions. So the residual is carried signed and absolute-valued at the end.
 *
 * `1e6` is the out-of-family sentinel, which no real residual reaches.
 */
function ringResidual(
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
  return shapeRadius(q, shape, sides) - radius;
}

/**
 * A signed residual and the index that attained it. The index is what lets the
 * caller ask the neighbouring rings how far away they are, which is the local
 * member gap — and under rotation that is emphatically not the spacing.
 */
type Hit = [r: number, n: number];

/**
 * A hit plus the scan's two runners-up, signed. The closed forms report the
 * sentinel pair: their residual is monotone around the winner, so the index
 * neighbours ARE the residual neighbours and nothing more is needed. The
 * rotated scan is where they differ — past the fold radius the members
 * adjacent in residual are other branches of the family, indices far from n.
 */
type ScanHit = [r: number, n: number, alt2: number, alt3: number];

const MISS: Hit = [1e6, -1];

/** Whichever of two hits is nearer the family. */
function nearer(a: Hit, b: Hit): Hit {
  return Math.abs(b[0]) < Math.abs(a[0]) ? b : a;
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
): Hit {
  const n0 = Math.floor(t);
  const h = Math.min(16, Math.max(0, Math.round(half)));
  let best = MISS;
  for (let k = -h; k <= h; k++) {
    const n = n0 + k;
    best = nearer(best, [
      ringResidual(p, n, offset, theta, spacing, phase, shape, sides),
      n,
    ]);
  }
  return best;
}

/**
 * Ring n with no rotation: `qₙ = p − nδ`, so there is nothing to rotate and the
 * two `rotate2d` calls of the general evaluator — four transcendentals — drop out.
 */
function ringResidualFlat(
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
  return shapeRadius(q, shape, sides) - radius;
}

/** The two integers around a real crossing. For a convex residual that is all of them. */
function bracketFlat(
  best: Hit,
  p: { x: number; y: number },
  t: number,
  offset: { x: number; y: number },
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number
): Hit {
  if (!Number.isFinite(t)) return best;
  const n0 = Math.max(0, Math.floor(t));
  return nearer(
    nearer(best, [ringResidualFlat(p, n0, offset, spacing, phase, shape, sides), n0]),
    [ringResidualFlat(p, n0 + 1, offset, spacing, phase, shape, sides), n0 + 1]
  );
}

/**
 * A phase residual and pitch, divided into world units by `|∇ψ|`.
 *
 * The residual is measured along the phase, and the phase is not arc length: one
 * unit of `ψ` spans `1/|∇ψ|` of the plane. Skip the divide and a stroke is too
 * thin by exactly the factor the family is steep by, and the hairline floor —
 * which is stated in pixels — stops meaning anything on screen.
 */
function eikonal(residual: number, pitch: number, grad: number): PhaseSample {
  const scale = 1 / Math.max(grad, 1e-4);
  const r = residual * scale;
  const g = Math.abs(pitch) * scale;
  return { r, rUp: r + g, rDown: r - g, floor: 0 };
}

/** `eikonal` for a family missing the member one pitch inwards. */
function oneSided(
  residual: number,
  inner: number,
  pitch: number,
  grad: number
): PhaseSample {
  const scale = 1 / Math.max(grad, 1e-4);
  const r = residual * scale;
  return {
    r,
    rUp: neighbour(inner === 1e6 ? 1e6 : inner * scale, r, pitch * scale, 1),
    rDown: r - Math.abs(pitch) * scale,
    floor: 0,
  };
}

/**
 * The signed distance from `value` to the nearest multiple of `s`, in `[−s/2, s/2)`.
 * `|signedMod(v, s)| = periodicDist(v, s)`.
 */
function signedMod(value: number, spacing: number): number {
  const s = Math.abs(spacing);
  if (s < 1e-8) return value;
  const q = value / s;
  const f = q - Math.floor(q);
  return (f < 0.5 ? f : f - 1) * s;
}

/**
 * The signed residual of a *concentric* family. Unlike a line family this one is
 * one-sided: there is no ring of negative radius, so inside the innermost member
 * the residual keeps growing instead of wrapping to the neighbour that is not
 * there.
 */
function centeredResidual(r: number, spacing: number, phase: number): number {
  const adj = r - phase;
  return adj < 0 ? adj : signedMod(adj, spacing);
}

export function centeredMod(r: number, spacing: number, phase: number): number {
  return Math.abs(centeredResidual(r, spacing, phase));
}

function consider(
  best: Hit,
  p: { x: number; y: number },
  t: number,
  offset: { x: number; y: number },
  theta: number,
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number,
  half: number
): Hit {
  if (!Number.isFinite(t)) return best;
  return nearer(best, checkWindow(p, t, offset, theta, spacing, phase, shape, sides, half));
}

function circleQuadraticResidual(
  p: { x: number; y: number },
  offset: { x: number; y: number },
  spacing: number,
  phase: number,
  shape: ShapeKind = 1,
  sides = 3
): Hit {
  const r = length2(p);
  const scale = Math.max(r, 1);
  const A = dot(offset, offset) - spacing * spacing;
  const B = -2 * (dot(p, offset) + spacing * phase);
  const C = r * r - phase * phase;
  const guess = Math.max(0, (r - phase) / Math.max(spacing, 1e-5));
  let res = checkWindow(p, guess, offset, 0, spacing, phase, shape, sides, 4);

  if (Math.abs(A) < 1e-8) {
    if (Math.abs(B) > 1e-8) {
      res = consider(res, p, -C / B, offset, 0, spacing, phase, shape, sides, 4);
    }
    return res;
  }

  const Bs = B / scale;
  const Cs = C / (scale * scale);
  const disc = Bs * Bs - 4 * A * Cs;
  if (disc >= 0) {
    const sd = Math.sqrt(disc);
    const q = -0.5 * (Bs + (Bs >= 0 ? sd : -sd));
    if (Math.abs(q) > 1e-12) {
      res = consider(res, p, (q / A) * scale, offset, 0, spacing, phase, shape, sides, 4);
      res = consider(res, p, (Cs / q) * scale, offset, 0, spacing, phase, shape, sides, 4);
    }
  }
  return res;
}

export function circleQuadratic(
  p: { x: number; y: number },
  offset: { x: number; y: number },
  spacing: number,
  phase: number,
  shape: ShapeKind = 1,
  sides = 3
): number {
  return Math.abs(circleQuadraticResidual(p, offset, spacing, phase, shape, sides)[0]);
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
function polygonTranslatedResidual(
  p: { x: number; y: number },
  offset: { x: number; y: number },
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number,
  facets: number
): Hit {
  // h is convex and, below the marginal drift, strictly falling: one crossing,
  // bracketed by two integers. So the whole solve is 2N + 2 evaluations with no
  // rotation in any of them — cheaper than the scan it replaces, which is the
  // only reason a closed form is worth having here.
  const seed = Math.max(0, (shapeRadius(p, shape, sides) - phase) / spacing);
  let res = bracketFlat(MISS, p, seed, offset, spacing, phase, shape, sides);

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
    // A facet within 1e-4 of flat takes the constant candidate rather than a
    // crossing solve at n ~ 1/den, mirroring the WGSL twin: the shader's f32
    // turns that far crossing into garbage, and a twin that solved it in f64
    // would silently disagree. The tolerance matches the dispatch's own
    // m ≤ s + 1e-4, so the whole near-marginal band reads as flat.
    if (Math.abs(den) > 1e-4) {
      res = bracketFlat(res, p, (a - phase) / den, offset, spacing, phase, shape, sides);
    } else {
      // s + bₖ = 0 on the facet that leads at large n: h is flat there, so the
      // value it is flat at is the distance, attained at every index past the
      // crossover. Every index does equally well, so there is no one index to
      // report — which is the right answer: the family has no local pitch here.
      res = nearer(res, [a - phase, -1]);
    }
  }
  return res;
}

export function polygonTranslated(
  p: { x: number; y: number },
  offset: { x: number; y: number },
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number,
  facets: number
): number {
  return Math.abs(
    polygonTranslatedResidual(p, offset, spacing, phase, shape, sides, facets)[0]
  );
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
): ScanHit {
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
  // A caller that measures the phase (acceptBelow = 0) gets the runners-up too:
  // the skip bar must then protect the THIRD-nearest member, not just the
  // nearest, so the trio's members are proven rather than sampled. The plain
  // render keeps the tighter bar and its early exit — it only asks for ink.
  const wantTrio = acceptBelow <= 0;

  const ct = Math.cos(theta * stride);
  const st = Math.sin(theta * stride);
  let n = lo;
  let psi = n * theta - angle;
  let c = Math.cos(psi);
  let sn = Math.sin(psi);
  let offX = n * offset.x;
  let offY = n * offset.y;
  let ringR = n * spacing + phase;
  let carried = 0;

  let best = 1e6;
  let bestSigned = 1e6;
  let bestN = -1;
  let alt2 = 1e6;
  let alt2Signed = 1e6;
  let alt3 = 1e6;
  let alt3Signed = 1e6;
  for (let i = 0; i < RING_BUDGET; i++) {
    if (n > hi) break;
    const signed =
      shapeRadius({ x: radius * c - offX, y: -radius * sn - offY }, shape, sides) - ringR;
    const gap = Math.abs(signed);
    if (gap < best) {
      // The runners-up are only ever read when a trio is wanted, and the plain
      // render — which is most frames — never asks for one.
      if (wantTrio) {
        alt3 = alt2;
        alt3Signed = alt2Signed;
        alt2 = best;
        alt2Signed = bestSigned;
      }
      best = gap;
      bestSigned = signed;
      bestN = n;
    } else if (wantTrio && gap < alt2) {
      alt3 = alt2;
      alt3Signed = alt2Signed;
      alt2 = gap;
      alt2Signed = signed;
    } else if (wantTrio && gap < alt3) {
      alt3 = gap;
      alt3Signed = signed;
    }
    if (acceptBelow > 0 && best <= acceptBelow) break;
    // No index within (gap − bar)/slope of here can beat bar, so the next index
    // worth looking at is the first lattice point past that run.
    const bar = Math.min(wantTrio ? alt3 : best, guard);
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
  // `best <= acceptBelow < guard` whenever the loop exited early, so clamping
  // here cannot discard an accepted hit.
  return best <= guard ? [bestSigned, bestN, alt2Signed, alt3Signed] : [guard, -1, 1e6, 1e6];
}

/**
 * A layer's phase at a point: where the three nearest members of the family sit
 * along the phase, plus a distance the layer keeps no matter what the phase does.
 *
 * Advancing a family's phase by `Δ` slides every residual by `−Δ`, so the distance
 * at any phase is `phaseDistance` below — the whole carrier sweep from a single
 * solve, instead of a solve per sample. That is the difference between an envelope
 * that costs one pass and one that costs a pass per tap.
 *
 * Three members rather than a residual and a pitch, because a walking family has
 * no single pitch: `h(n) = shapeRadius(qₙ) − (n·s + φ)` is curved in `n`, so
 * consecutive members are not equally spaced and `r ± g` is only a first-order
 * guess at where the neighbours are. The neighbours are already evaluated in the
 * course of finding the nearest one, so reporting them is free and exact.
 *
 * `floor` carries the parts of a distance no phase can move: the hole at the
 * centre of a radial family, and a solve that saturated without finding a member.
 */
export interface PhaseSample {
  r: number;
  rUp: number;
  rDown: number;
  floor: number;
}

/**
 * A neighbour of the member at `r`, one pitch away in the direction of `sign`.
 *
 * `candidate` is the measured residual of the real neighbour, or `1e6` where the
 * family has no member there — the innermost ring, the n = 1 hyperbola. A missing
 * neighbour is replaced by the nominal pitch, and a candidate *nearer* than `r`
 * is rejected outright, because `r` is the nearest member by construction and a
 * closer one can only be an artefact of that substitution. Without the rejection
 * `phaseDistance` at `delta = 0` would disagree with the solver, and the ordinary
 * render would change.
 */
function neighbour(candidate: number, r: number, pitch: number, sign: number): number {
  if (candidate < 1e5 && Math.abs(candidate) >= Math.abs(r)) return candidate;
  const step = r + sign * pitch;
  return Math.abs(step) >= Math.abs(r) ? step : r - sign * pitch;
}

/** The distance this layer shows once its phase has advanced by `delta`. */
export function phaseDistance(s: PhaseSample, delta = 0): number {
  const near = Math.min(
    Math.abs(s.r - delta),
    Math.abs(s.rUp - delta),
    Math.abs(s.rDown - delta)
  );
  return Math.max(near, s.floor);
}

/** The local member gap: how far the phase advances from one member to the next. */
export function phaseGap(s: PhaseSample): number {
  return Math.max(Math.abs(s.rUp - s.r), 1e-6);
}

/**
 * The concentric families, as a phase rather than a distance.
 *
 * A field enters as `warp`, a shift of the ring radius in world units, and
 * `warpGrad`, what that shift does to `∇ψ`. Away from the origin `∇shapeRadius`
 * is the outward facet normal, of unit length, so the modulated gradient is
 * `q̂ − ∇warp` and both the residual and the member gap divide by its length —
 * the same eikonal correction the line and curve families already make.
 *
 * The gap is *measured*, by asking the winning ring's neighbours where they are,
 * because for a walking family it is not the spacing. `h(n) = shapeRadius(qₙ) −
 * (n·s + φ)` changes with n at rate `∇shapeRadius · dqₙ/dn − s`, and for a
 * polygon `∇shapeRadius` is a facet normal rather than the radial direction, so
 * the rotation term `−θ·(n_facet · perp(qₙ))` survives and grows with radius. A
 * 16-unit hexagon family at 0.02 rad per ring has a local gap anywhere in
 * roughly 13 to 19 units by the time it is 280 units out. Assuming `s` there
 * averages the carrier over the wrong period and mis-states every fringe.
 */
export function ringPhaseCpu(
  p: { x: number; y: number },
  offset: { x: number; y: number },
  theta: number,
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number,
  acceptBelow = 0,
  rejectAbove = 0,
  warp = 0,
  warpGrad: { x: number; y: number } = { x: 0, y: 0 }
): PhaseSample {
  const s = Math.max(spacing, 1e-4);
  const phi = phase + warp;

  const radius = length2(p);
  const nx = radius < EPS ? 0 : p.x / radius;
  const ny = radius < EPS ? 0 : p.y / radius;
  const grad = Math.max(Math.hypot(nx - warpGrad.x, ny - warpGrad.y), 1e-4);
  const scale = radius < EPS ? 1 : 1 / grad;

  // The solvers work in ring-radius units, so the guard has to be there too.
  const guard = Math.max(rejectAbove, s * 0.75) / scale;
  const [r, n, alt2, alt3] = ringSignedCpu(
    p,
    offset,
    theta,
    s,
    phi,
    shape,
    sides,
    acceptBelow / scale,
    guard
  );

  // A saturated solve found no member inside the guard, so there is no residual
  // to slide: the guard is the answer at every phase.
  if (n < 0 && Math.abs(r - guard) < 1e-6) {
    const g = guard * scale;
    return { r: g, rUp: g, rDown: g, floor: g };
  }

  // Rings are ordered by residual, not by index: increasing n lowers h, and past
  // the marginal drift h turns around, so which side a neighbour lands on is not
  // fixed. The trio is a set, so it does not matter. Under rotation past the
  // fold radius (≈ spacing/θ) it is sharper than that: the members adjacent in
  // residual are other BRANCHES of the family, indices far from n, which the
  // scan's runners-up carry — report the index neighbours there and the trio
  // spans a whole fold, the measured gap overstates the local period, and the
  // envelope's slide leaves the carrier standing in sector-shaped patches.
  const above =
    n >= 0 ? ringResidual(p, n + 1, offset, theta, s, phi, shape, sides) : 1e6;
  const below =
    n >= 1 ? ringResidual(p, n - 1, offset, theta, s, phi, shape, sides) : 1e6;
  const cands: number[] = [];
  for (const c of [above, below, alt2, alt3]) {
    if (c < 1e5 && Math.abs(c - r) > 1e-9) cands.push(c);
  }
  cands.sort((a, b) => Math.abs(a - r) - Math.abs(b - r));
  const first = cands.length ? cands[0] : 1e6;
  // The slot partner prefers the nearest member on the OTHER side of r, so the
  // trio flanks the winner when the family does; a one-sided crowd falls back
  // to the second-nearest, keeping the set honest either way.
  const opposite = cands.find((c) => (c - r) * (first - r) < 0);
  const second = opposite ?? (cands.length > 1 ? cands[1] : 1e6);
  const upSlot = first >= 1e5 || first > r ? first : second;
  const downSlot = first >= 1e5 || first > r ? second : first;

  return {
    r: r * scale,
    rUp: neighbour(upSlot, r, s, 1) * scale,
    rDown: neighbour(downSlot, r, s, -1) * scale,
    floor: 0,
  };
}

function ringSignedCpu(
  p: { x: number; y: number },
  offset: { x: number; y: number },
  theta: number,
  s: number,
  phase: number,
  shape: ShapeKind,
  sides: number,
  acceptBelow: number,
  guard: number
): ScanHit {
  const hasOff = dot(offset, offset) > 1e-8;
  const hasRot = Math.abs(theta) > 1e-8;
  const flat = (hit: Hit): ScanHit => [hit[0], hit[1], 1e6, 1e6];

  // Circles ignore θ when δ = 0: rotating a radial metric is a no-op.
  if (!hasOff && (!hasRot || shape <= 1)) {
    const adj = shapeRadius(p, shape, sides) - phase;
    const n = adj < 0 ? 0 : Math.round(adj / s);
    return flat([centeredResidual(shapeRadius(p, shape, sides), s, phase), n]);
  }
  if (!hasRot) {
    if (shape <= 1) return flat(circleQuadraticResidual(p, offset, s, phase, shape, sides));
    // h is convex in n here, so the crossing is a linear solve on one facet.
    // Only a drift that outruns the spacing can hide the answer at a breakpoint
    // instead of a crossing, and that case falls through to the scan.
    const facets = facetCount(shape, sides);
    if (facets > 0 && ringDrift(offset, shape, sides) <= s + 1e-4) {
      return flat(polygonTranslatedResidual(p, offset, s, phase, shape, sides, facets));
    }
  }
  return ringScan(p, offset, theta, s, phase, shape, sides, acceptBelow, guard);
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
  // Anything past `guard` renders as no ink, so the window only has to be exact below it.
  const guard = Math.max(rejectAbove, s * 0.75);
  return Math.abs(
    ringSignedCpu(p, offset, theta, s, phase, shape, sides, acceptBelow, guard)[0]
  );
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
export function linePhaseCpu(
  p: { x: number; y: number },
  angle: number,
  spacing: number,
  phase: number,
  progressive: number,
  warp = 0,
  warpGrad: { x: number; y: number } = { x: 0, y: 0 }
): PhaseSample {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const proj = dot(p, dir) - phase - warp;
  const pitch = spacing + progressive;
  const s = Math.abs(pitch) > 1e-4 ? pitch : spacing;
  const grad = Math.max(Math.hypot(dir.x - warpGrad.x, dir.y - warpGrad.y), 1e-4);
  return eikonal(signedMod(proj, s), s, grad);
}

export function lineDistanceCpu(
  p: { x: number; y: number },
  angle: number,
  spacing: number,
  phase: number,
  progressive: number,
  warp = 0,
  warpGrad: { x: number; y: number } = { x: 0, y: 0 }
): number {
  return phaseDistance(linePhaseCpu(p, angle, spacing, phase, progressive, warp, warpGrad));
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
export function curvePhaseCpu(
  p: { x: number; y: number },
  kind: number,
  spacing: number,
  phase: number,
  bend: number,
  frequency = 1,
  warp = 0,
  warpGrad: { x: number; y: number } = { x: 0, y: 0 }
): PhaseSample {
  const s = Math.abs(spacing) > 1e-4 ? Math.abs(spacing) : 1e-4;
  const k = Math.round(kind);
  const norm = (gx: number, gy: number) =>
    Math.max(Math.hypot(gx - warpGrad.x, gy - warpGrad.y), 1e-4);
  if (k <= 0) {
    const lambda = WAVE_CYCLE / Math.max(frequency, 0.05);
    const w = TAU / lambda;
    const osc = bend * Math.sin(w * p.y + phase);
    const psi = p.x - osc - warp;
    return eikonal(signedMod(psi, s), s, norm(1, -bend * w * Math.cos(w * p.y + phase)));
  }
  if (k === 1) {
    const a = bend * PARABOLA_BEND;
    const psi = p.y - a * p.x * p.x - phase - warp;
    return eikonal(signedMod(psi, s), s, norm(-2 * a * p.x, 1));
  }
  if (k === 2) {
    const u = p.x * p.x - p.y * p.y;
    const m = Math.sqrt(Math.abs(u));
    const adj = m - phase - warp;
    const n = Math.max(Math.round(adj / s), 1);
    const sg = Math.sign(u);
    const md = Math.max(m, 1e-4);
    const grad = norm((sg * p.x) / md, (-sg * p.y) / md);
    // One-sided: there is no n = 0 hyperbola, so the member one pitch inwards of
    // the innermost one is not there to slide onto.
    const inner = n > 1 ? adj - (n - 1) * s : 1e6;
    return oneSided(adj - n * s, inner, s, grad);
  }
  const r = length2(p);
  if (r < EPS) return eikonal(signedMod(-phase - warp, s), s, 1);
  if (Math.abs(bend) < 1e-4) {
    return eikonal(signedMod(r - phase - warp, s), s, norm(p.x / r, p.y / r));
  }
  const starts = Math.max(1, Math.round(Math.abs(bend) / s));
  const b = (starts * s) / TAU;
  const th = Math.atan2(p.y, p.x);
  return eikonal(
    signedMod(r - b * th - phase - warp, s),
    s,
    norm(p.x / r + (b * p.y) / (r * r), p.y / r - (b * p.x) / (r * r))
  );
}

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
  return phaseDistance(curvePhaseCpu(p, kind, spacing, phase, bend, frequency, warp, warpGrad));
}

/**
 * N undirected lines through the origin, equally spaced over π. `start` opens a
 * hole at the center.
 *
 * The index here is angular, so the member gap grows with radius: neighbouring
 * lines stand `2r·sin(seg/2)` apart at radius `r`. The hole is not periodic and
 * so cannot be part of the phase — it clamps the distance afterwards, and under
 * the envelope it reads as a solid disc, which is what it is.
 */
export function radialLinePhaseCpu(
  p: { x: number; y: number },
  count: number,
  start = 0,
  turn = 0,
  turnGrad = { x: 0, y: 0 }
): PhaseSample {
  const n = Math.max(1, Math.round(count));
  const r = length2(p);
  const inner = Math.max(0, start);
  const seg = Math.PI / n;
  if (r < EPS) return { r: 0, rUp: seg, rDown: -seg, floor: inner };
  const signed = r * Math.sin(wrapToHalf(Math.atan2(p.y, p.x) - turn * seg, seg));
  // Near a line ψ = r (θ − k seg − turn seg), whose gradient is the unit tangent
  // until modulation tilts it by seg r ∇turn.
  const scale =
    1 /
    Math.max(
      length2({ x: -p.y / r - turnGrad.x * seg * r, y: p.x / r - turnGrad.y * seg * r }),
      1e-4
    );
  const gap = Math.max(2 * r * Math.sin(seg * 0.5), 1e-4) * scale;
  const g = signed * scale;
  return {
    r: g,
    rUp: g + gap,
    rDown: g - gap,
    floor: Math.max(inner - r, 0),
  };
}

export function radialLineDistanceCpu(
  p: { x: number; y: number },
  count: number,
  start = 0
): number {
  return phaseDistance(radialLinePhaseCpu(p, count, start));
}

export function shapeRadius(...a) {
  COUNT.metric += 1;
  return shapeRadius__raw(...a);
}
