// @ts-nocheck — wgslFn includes are FunctionNodes at runtime.
import { wgslFn } from 'three/tsl';

/**
 * Three.js parses only the first `fn` in a wgslFn string.
 * Each helper is its own function; dependents list includes.
 */

const rotate2d = wgslFn(`
fn rotate2d(p: vec2<f32>, a: f32) -> vec2<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec2<f32>(c * p.x - s * p.y, s * p.x + c * p.y);
}
`);

const wrapToHalfWgsl = wgslFn(`
fn wrapToHalfWgsl(ang: f32, seg: f32) -> f32 {
  let half = seg * 0.5;
  var a = (ang + half) % seg - half;
  if (a < -half) {
    a = a + seg;
  }
  if (a > half) {
    a = a - seg;
  }
  return a;
}
`);

/**
 * Inradius metric: shapeRadius(q) = R is the shape with inradius R.
 *
 * It is the support function max_k dot(q, n_k) over the N outward normals, and
 * for the side counts the Studio names that collapses to a couple of absolute
 * values — no atan2, no cos. The ring scan calls this once per candidate ring,
 * so the free-side n-gon (and the fractional counts a morph passes through) is
 * the only case that pays for the trigonometric form.
 */
const shapeRadiusWgsl = wgslFn(`
fn shapeRadiusWgsl(q: vec2<f32>, shapeType: f32, sides: f32) -> f32 {
  let shape = i32(shapeType + 0.5);
  if (shape <= 1) {
    return length(q);
  }
  if (shape == 2) {
    return max(abs(q.x), abs(q.y));
  }
  var n = max(sides, 3.0);
  if (shape == 3) {
    n = 3.0;
  }
  if (abs(n - 3.0) < 1e-3) {
    return max(q.x, 0.86602540378 * abs(q.y) - 0.5 * q.x);
  }
  if (abs(n - 4.0) < 1e-3) {
    return max(abs(q.x), abs(q.y));
  }
  if (abs(n - 6.0) < 1e-3) {
    let ax = abs(q.x);
    return max(ax, 0.5 * ax + 0.86602540378 * abs(q.y));
  }
  let ang = atan2(q.y, q.x);
  let seg = 6.28318530718 / n;
  return length(q) * cos(wrapToHalfWgsl(ang, seg));
}
`, [wrapToHalfWgsl]);

/**
 * shapeRadius(q) never leaves [kappa * |q|, |q|]. kappa = cos(pi / N) is exactly
 * how far a rotation can fan the nearest ring index away from |p| / spacing.
 */
const ringKappaWgsl = wgslFn(`
fn ringKappaWgsl(shapeType: f32, sides: f32) -> f32 {
  let shape = i32(shapeType + 0.5);
  if (shape <= 1) {
    return 1.0;
  }
  if (shape == 2) {
    return 0.70710678119;
  }
  var n = sides;
  if (shape == 3) {
    n = 3.0;
  }
  n = max(n, 3.0);
  return cos(3.14159265359 / n);
}
`);

/**
 * Integer indices that can possibly land within `guard` of p. With
 * h(n) = shapeRadius(q_n) - (n s + phase), m = shapeRadius(-delta), and
 * |q_n| >= | |p| - n|d| |:
 *
 *   kappa * | |p| - n|d| | - (n s + phase)  <=  h(n)  <=  (|p| + n m) - (n s + phase)
 *
 * h <= guard gives the low end. For the high end h runs off to -inf at rate
 * s - m when rings outgrow their drift (p ends up deep inside every ring), or to
 * +inf at rate m - s when the drift wins (p ends up outside every ring). The
 * drift rate is shapeRadius(-delta), not |delta|, because the offset enters
 * through the unrotated normals. Only m == s leaves h bounded, and there really
 * are unboundedly many rings near p, so the span is capped.
 *
 * Every index outside is proven farther than guard, so no ring can hide outside
 * this window, which is what kills the zoom-out holes.
 */
const ringWindowWgsl = wgslFn(`
fn ringWindowWgsl(radius: f32, offLen: f32, drift: f32, spacing: f32, phase: f32, kappa: f32, guard: f32) -> vec2<f32> {
  let lo = max(0.0, floor((kappa * radius - phase - guard) / (spacing + kappa * offLen)));
  var hi = lo + 65536.0;
  let shrink = spacing - drift;
  if (shrink > 1e-6) {
    hi = ceil((radius - phase + guard) / shrink);
  } else if (-shrink > 1e-6) {
    hi = ceil((radius + phase + guard) / -shrink);
  }
  return vec2<f32>(lo, max(lo, min(hi, lo + 65536.0)));
}
`);

const evalRing = wgslFn(`
fn evalRing(p: vec2<f32>, n: f32, offset: vec2<f32>, theta: f32, spacing: f32, phase: f32, shapeType: f32, sides: f32) -> f32 {
  if (n < 0.0) {
    return 1e6;
  }
  let radius = n * spacing + phase;
  if (radius < 0.0) {
    return 1e6;
  }
  let center = rotate2d(offset * n, n * theta);
  let q = rotate2d(p - center, -n * theta);
  return shapeRadiusWgsl(q, shapeType, sides) - radius;
}
`, [rotate2d, shapeRadiusWgsl]);

/** Whichever of two hits, `vec2(residual, index)`, sits nearer its family. */
const nearerWgsl = wgslFn(`
fn nearerWgsl(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  if (abs(b.x) < abs(a.x)) {
    return b;
  }
  return a;
}
`);

/**
 * A neighbour of the member at `r`, one pitch away in the direction of `sign`.
 *
 * `candidate` is the measured residual of the real neighbour, or 1e6 where the
 * family has no member there: the innermost ring, the n = 1 hyperbola. A missing
 * neighbour is replaced by the nominal pitch, and a candidate *nearer* than `r` is
 * rejected outright, because `r` is the nearest member by construction and a
 * closer one can only be an artefact of that substitution. Without the rejection
 * phaseDistWgsl at delta = 0 would disagree with the solver and the ordinary
 * render would change.
 */
const neighbourWgsl = wgslFn(`
fn neighbourWgsl(candidate: f32, r: f32, pitch: f32, sign: f32) -> f32 {
  if (candidate < 1e5 && abs(candidate) >= abs(r)) {
    return candidate;
  }
  let step = r + sign * pitch;
  if (abs(step) >= abs(r)) {
    return step;
  }
  return r - sign * pitch;
}
`);

const checkNear = wgslFn(`
fn checkNear(p: vec2<f32>, t: f32, offset: vec2<f32>, theta: f32, spacing: f32, phase: f32, shapeType: f32, sides: f32) -> vec2<f32> {
  let n0 = floor(t);
  var best = vec2<f32>(1e6, -1.0);
  for (var k = -4; k <= 4; k = k + 1) {
    let n = n0 + f32(k);
    best = nearerWgsl(best, vec2<f32>(evalRing(p, n, offset, theta, spacing, phase, shapeType, sides), n));
  }
  return best;
}
`, [evalRing, nearerWgsl]);

/**
 * Ring n with no rotation: q_n = p - n delta, so there is nothing to rotate and
 * the two rotate2d calls of the general evaluator drop out along with their four
 * transcendentals.
 */
const evalRingFlat = wgslFn(`
fn evalRingFlat(p: vec2<f32>, n: f32, offset: vec2<f32>, spacing: f32, phase: f32, shapeType: f32, sides: f32) -> f32 {
  if (n < 0.0) {
    return 1e6;
  }
  let radius = n * spacing + phase;
  if (radius < 0.0) {
    return 1e6;
  }
  return shapeRadiusWgsl(p - offset * n, shapeType, sides) - radius;
}
`, [shapeRadiusWgsl]);

/** The two integers around a real crossing. For a convex residual that is all of them. */
const bracketFlat = wgslFn(`
fn bracketFlat(best: vec2<f32>, p: vec2<f32>, t: f32, offset: vec2<f32>, spacing: f32, phase: f32, shapeType: f32, sides: f32) -> vec2<f32> {
  let n0 = max(0.0, floor(t));
  let a = vec2<f32>(evalRingFlat(p, n0, offset, spacing, phase, shapeType, sides), n0);
  let b = vec2<f32>(evalRingFlat(p, n0 + 1.0, offset, spacing, phase, shapeType, sides), n0 + 1.0);
  return nearerWgsl(nearerWgsl(best, a), b);
}
`, [evalRingFlat, nearerWgsl]);

/** Signed distance to the nearest multiple of `spacing`, in [-s/2, s/2). */
const signedModWgsl = wgslFn(`
fn signedModWgsl(value: f32, spacing: f32) -> f32 {
  let s = abs(spacing);
  if (s < 1e-8) {
    return value;
  }
  let q = value / s;
  let f = q - floor(q);
  if (f < 0.5) {
    return f * s;
  }
  return (f - 1.0) * s;
}
`);

/**
 * The signed residual of a *concentric* family. One-sided, unlike a line family:
 * there is no ring of negative radius, so inside the innermost member the
 * residual keeps growing rather than wrapping to a neighbour that is not there.
 */
const centeredResidualWgsl = wgslFn(`
fn centeredResidualWgsl(r: f32, spacing: f32, phase: f32) -> f32 {
  let adj = r - phase;
  if (adj < 0.0) {
    return adj;
  }
  return signedModWgsl(adj, spacing);
}
`, [signedModWgsl]);

const centeredModWgsl = wgslFn(`
fn centeredModWgsl(r: f32, spacing: f32, phase: f32) -> f32 {
  return abs(centeredResidualWgsl(r, spacing, phase));
}
`, [centeredResidualWgsl]);

const circleQuadraticWgsl = wgslFn(`
fn circleQuadraticWgsl(p: vec2<f32>, offset: vec2<f32>, spacing: f32, phase: f32, shapeType: f32, sides: f32) -> vec2<f32> {
  let r = length(p);
  let scale = max(r, 1.0);
  let A = dot(offset, offset) - spacing * spacing;
  let B = -2.0 * (dot(p, offset) + spacing * phase);
  let C = r * r - phase * phase;
  let guess = max(0.0, (r - phase) / max(spacing, 1e-5));
  var d = checkNear(p, guess, offset, 0.0, spacing, phase, shapeType, sides);
  if (abs(A) < 1e-8) {
    if (abs(B) > 1e-8) {
      d = nearerWgsl(d, checkNear(p, -C / B, offset, 0.0, spacing, phase, shapeType, sides));
    }
    return d;
  }
  let Bs = B / scale;
  let Cs = C / (scale * scale);
  let disc = Bs * Bs - 4.0 * A * Cs;
  if (disc >= 0.0) {
    let sd = sqrt(disc);
    var qv = -0.5 * (Bs - sd);
    if (Bs >= 0.0) {
      qv = -0.5 * (Bs + sd);
    }
    if (abs(qv) > 1e-12) {
      d = nearerWgsl(d, checkNear(p, (qv / A) * scale, offset, 0.0, spacing, phase, shapeType, sides));
      d = nearerWgsl(d, checkNear(p, (Cs / qv) * scale, offset, 0.0, spacing, phase, shapeType, sides));
    }
  }
  return d;
}
`, [checkNear, nearerWgsl]);

/**
 * Facets of the metric, or 0 when it is not a polygon's support function. A type
 * morph passes through fractional side counts, where the radial form is nobody's
 * polygon and solving for its edges would be solving for edges that do not exist.
 */
const facetCountWgsl = wgslFn(`
fn facetCountWgsl(shapeType: f32, sides: f32) -> f32 {
  let shape = i32(shapeType + 0.5);
  if (shape <= 1) {
    return 0.0;
  }
  if (shape == 2) {
    return 4.0;
  }
  var n = sides;
  if (shape == 3) {
    n = 3.0;
  }
  let r = round(n);
  if (r < 3.0 || r > 24.0 || abs(n - r) > 1e-3) {
    return 0.0;
  }
  return r;
}
`);

/**
 * Translated polygons in closed form, for every side count.
 *
 * With theta = 0 the ring frame is affine in the index, q_n = p - n delta, and
 * shapeRadius is a support function, so
 *
 *   h(n) = max_k (a_k - n b_k) - n s - phase,  a_k = dot(p, n_k), b_k = dot(delta, n_k)
 *
 * is piecewise linear and convex in n, with asymptotic slope -(s - m) for
 * m = shapeRadius(-delta). When m < s every slope is negative, so h falls
 * monotonically and crosses zero once, on some facet's own segment: that
 * crossing is one of the N linear solves (a_k - phase) / (s + b_k).
 *
 * When m == s the leading facet's slope cancels and h is constant past the
 * crossover, so one evaluation of that constant replaces every index a scan
 * would have to walk to reach it. The L-infinity square is the N = 4 instance.
 */
const polygonTranslatedWgsl = wgslFn(`
fn polygonTranslatedWgsl(p: vec2<f32>, offset: vec2<f32>, spacing: f32, phase: f32, shapeType: f32, sides: f32, facets: f32) -> vec2<f32> {
  // h is convex and, below the marginal drift, strictly falling: one crossing,
  // bracketed by two integers. The whole solve is 2N + 2 evaluations with no
  // rotation in any of them, which is the only reason a closed form beats the scan.
  let seed = max(0.0, (shapeRadiusWgsl(p, shapeType, sides) - phase) / spacing);
  var d = bracketFlat(vec2<f32>(1e6, -1.0), p, seed, offset, spacing, phase, shapeType, sides);
  let count = i32(facets + 0.5);

  // The normals are a rotation apart, so carry them instead of calling trig N times.
  let step = 6.28318530718 / facets;
  let cs = cos(step);
  let ss = sin(step);
  var nk = vec2<f32>(1.0, 0.0);

  for (var k = 0; k < 24; k = k + 1) {
    if (k >= count) {
      break;
    }
    let a = dot(p, nk);
    let b = dot(offset, nk);
    nk = vec2<f32>(cs * nk.x - ss * nk.y, ss * nk.x + cs * nk.y);
    let den = spacing + b;
    // A facet within 1e-4 of flat takes the constant candidate, not the
    // crossing solve: the crossing sits at n ~ 1/den, where f32 subtracts two
    // huge near-equal numbers into garbage (and for den < 0 the seed clamps to
    // zero and the far field is never examined). The tolerance matches the
    // dispatch's own m <= s + 1e-4, so the whole near-marginal band is flat.
    if (abs(den) > 1e-4) {
      d = bracketFlat(d, p, (a - phase) / den, offset, spacing, phase, shapeType, sides);
    } else {
      // Every index past the crossover does equally well, so there is no one
      // index to report -- which is the right answer: no local pitch exists here.
      d = nearerWgsl(d, vec2<f32>(a - phase, -1.0));
    }
  }
  return d;
}
`, [bracketFlat, shapeRadiusWgsl, nearerWgsl]);

/**
 * The concentric families as a signed residual, the index that attained it,
 * and the scan's two runners-up: `vec4(h, n, alt2, alt3)`. Mirrors
 * `ringSignedCpu` in inverseCpu.ts. The closed forms report sentinel
 * runners-up — their residual is monotone around the winner, so the index
 * neighbours ARE the residual neighbours; the rotated scan is where the
 * members adjacent in residual can be other branches of the family.
 */
const ringSignedWgsl = wgslFn(`
fn ringSignedWgsl(p: vec2<f32>, offset: vec2<f32>, theta: f32, spacing: f32, phase: f32, shapeType: f32, sides: f32, acceptBelow: f32, guard: f32) -> vec4<f32> {
  let s = max(spacing, 1e-4);
  let hasOff = dot(offset, offset) > 1e-8;
  let hasRot = abs(theta) > 1e-8;
  let shape = i32(shapeType + 0.5);

  if (!hasOff && (!hasRot || shape <= 1)) {
    let radial = shapeRadiusWgsl(p, shapeType, sides);
    let adj = radial - phase;
    var n = 0.0;
    if (adj >= 0.0) {
      n = round(adj / s);
    }
    return vec4<f32>(centeredResidualWgsl(radial, s, phase), n, 1e6, 1e6);
  }
  if (!hasRot) {
    if (shape <= 1) {
      let hit = circleQuadraticWgsl(p, offset, s, phase, shapeType, sides);
      return vec4<f32>(hit.x, hit.y, 1e6, 1e6);
    }
    // h is convex in n here, so the crossing is a linear solve on one facet. Only
    // a drift that outruns the spacing can hide the answer at a breakpoint
    // instead of a crossing, and that case falls through to the scan.
    let facets = facetCountWgsl(shapeType, sides);
    if (facets > 0.0 && shapeRadiusWgsl(-offset, shapeType, sides) <= s + 1e-4) {
      let hit = polygonTranslatedWgsl(p, offset, s, phase, shapeType, sides, facets);
      return vec4<f32>(hit.x, hit.y, 1e6, 1e6);
    }
  }

  let radius = length(p);
  let angle = atan2(p.y, p.x);
  let offLen = length(offset);
  let drift = shapeRadiusWgsl(-offset, shapeType, sides);
  let win = ringWindowWgsl(radius, offLen, drift, s, phase, ringKappaWgsl(shapeType, sides), guard);
  let lo = win.x;
  let hi = win.y;
  // q_n = R(-n theta) p - n delta, so dq/dn = -theta perp(R(-n theta) p) - delta
  // and the bound is a constant. shapeRadius is 1-Lipschitz in q, corners included.
  let slope = abs(theta) * radius + offLen + s;
  // Budget mirrors RING_BUDGET in inverseCpu.ts. Past it the scan strides on a
  // lattice anchored to multiples of stride, not to lo, so neighbouring pixels
  // agree on which rings exist: a thinner family, never a broken one.
  var stride = 1.0;
  let span = hi - lo + 1.0;
  if (span > 1024.0) {
    stride = exp2(ceil(log2(span / 1024.0)));
  }
  // A caller that measures the phase (acceptBelow = 0) gets the runners-up too:
  // the skip bar must then protect the THIRD-nearest member, not just the
  // nearest, so the trio's members are proven rather than sampled. The plain
  // render keeps the tighter bar and its early exit — it only asks for ink.
  let wantTrio = acceptBelow <= 0.0;

  // q_n advances by a fixed rotation and a fixed translation per stride, so the
  // loop carries them instead of recomputing: no sin, cos, or atan2 per ring.
  // Re-anchoring every 32 steps keeps f32 drift far below a pixel.
  let ct = cos(theta * stride);
  let st = sin(theta * stride);
  var n = ceil(lo / stride) * stride;
  var c = cos(n * theta - angle);
  var sn = sin(n * theta - angle);
  var walk = offset * n;
  var ringR = n * s + phase;
  var carried = 0;

  var best = 1e6;
  var bestSigned = 1e6;
  var bestN = -1.0;
  var alt2 = 1e6;
  var alt2Signed = 1e6;
  var alt3 = 1e6;
  var alt3Signed = 1e6;
  for (var i = 0; i < 1024; i += 1) {
    if (n > hi) {
      break;
    }
    let q = vec2<f32>(radius * c - walk.x, -radius * sn - walk.y);
    let signed = shapeRadiusWgsl(q, shapeType, sides) - ringR;
    let gap = abs(signed);
    if (gap < best) {
      alt3 = alt2;
      alt3Signed = alt2Signed;
      alt2 = best;
      alt2Signed = bestSigned;
      best = gap;
      bestSigned = signed;
      bestN = n;
    } else if (gap < alt2) {
      alt3 = alt2;
      alt3Signed = alt2Signed;
      alt2 = gap;
      alt2Signed = signed;
    } else if (gap < alt3) {
      alt3 = gap;
      alt3Signed = signed;
    }
    if (acceptBelow > 0.0 && best <= acceptBelow) {
      break;
    }
    // No index within (gap - bar) / slope of here can beat bar, so the next index
    // worth looking at is the first lattice point past that run.
    var protect = best;
    if (wantTrio) {
      protect = alt3;
    }
    let bar = min(protect, guard);
    let safe = floor((gap - bar) / slope) + 1.0;
    let jump = max(1.0, ceil(safe / stride)) * stride;
    n = n + jump;
    walk = walk + offset * jump;
    ringR = ringR + jump * s;
    carried = carried + 1;
    if (jump <= stride && carried < 32) {
      let nc = c * ct - sn * st;
      sn = sn * ct + c * st;
      c = nc;
    } else {
      c = cos(n * theta - angle);
      sn = sin(n * theta - angle);
      carried = 0;
    }
  }
  // best <= acceptBelow < guard whenever the loop exited early, so clamping here
  // cannot discard an accepted hit.
  if (best <= guard) {
    return vec4<f32>(bestSigned, bestN, alt2Signed, alt3Signed);
  }
  return vec4<f32>(guard, -1.0, 1e6, 1e6);
}
`, [
  centeredResidualWgsl,
  shapeRadiusWgsl,
  facetCountWgsl,
  polygonTranslatedWgsl,
  circleQuadraticWgsl,
  ringKappaWgsl,
  ringWindowWgsl,
]);

/**
 * The concentric families as a plain distance. The renderer goes through
 * `ringPhase` instead; this is the entry point the ablation harness in
 * `paper/tools/gpu` measures, where a scalar return keeps the generations
 * comparable.
 */
export const ringDistance = wgslFn(`
fn ringDistance(p: vec2<f32>, offset: vec2<f32>, theta: f32, spacing: f32, phase: f32, shapeType: f32, sides: f32, acceptBelow: f32, rejectAbove: f32) -> f32 {
  let s = max(spacing, 1e-4);
  // Anything past guard renders as no ink, so the window only has to be exact below it.
  let guard = max(rejectAbove, s * 0.75);
  return abs(ringSignedWgsl(p, offset, theta, s, phase, shapeType, sides, acceptBelow, guard).x);
}
`, [ringSignedWgsl]);

/**
 * The concentric families as a phase: `vec4(r, rUp, rDown, floor)`, the signed
 * residual of the nearest member plus the two either side of it. Twin of
 * `ringPhaseCpu`.
 *
 * The neighbours are measured rather than assumed to be `r ± s`, because a
 * walking family has no single pitch: `∇shapeRadius` is a facet normal rather
 * than the radial direction, so the rotation term in `dh/dn` survives and grows
 * with radius. Assuming the spacing there averages the carrier over the wrong
 * period and mis-states every fringe.
 */
export const ringPhase = wgslFn(`
fn ringPhase(p: vec2<f32>, offset: vec2<f32>, theta: f32, spacing: f32, phase: f32, shapeType: f32, sides: f32, acceptBelow: f32, rejectAbove: f32, warp: f32, warpGrad: vec2<f32>) -> vec4<f32> {
  let s = max(spacing, 1e-4);
  let phi = phase + warp;
  let radius = length(p);
  var radial = vec2<f32>(0.0, 0.0);
  if (radius >= 1e-6) {
    radial = p / radius;
  }
  var scale = 1.0;
  if (radius >= 1e-6) {
    scale = 1.0 / max(length(radial - warpGrad), 1e-4);
  }

  let guard = max(rejectAbove, s * 0.75) / scale;
  let hit = ringSignedWgsl(p, offset, theta, s, phi, shapeType, sides, acceptBelow / scale, guard);
  let r = hit.x;
  let n = hit.y;

  // A saturated solve found no member inside the guard, so there is no residual
  // to slide: the guard is the answer at every phase.
  if (n < 0.0 && abs(r - guard) < 1e-6) {
    let g = guard * scale;
    return vec4<f32>(g, g, g, g);
  }

  // Rings are ordered by residual, not by index: increasing n lowers h, and past
  // the marginal drift h turns around, so which side a neighbour lands on is not
  // fixed. The trio is a set, so it does not matter. Under rotation past the
  // fold radius (~ spacing/theta) it is sharper than that: the members adjacent
  // in residual are other BRANCHES of the family, indices far from n, which the
  // scan's runners-up carry — report the index neighbours there and the trio
  // spans a whole fold, the measured gap overstates the local period, and the
  // envelope's slide leaves the carrier standing in sector-shaped patches.
  var above = 1e6;
  if (n >= 0.0) {
    above = evalRing(p, n + 1.0, offset, theta, s, phi, shapeType, sides);
  }
  var below = 1e6;
  if (n >= 1.0) {
    below = evalRing(p, n - 1.0, offset, theta, s, phi, shapeType, sides);
  }

  // The nearest candidate to r, then the nearest on the OTHER side of r (else
  // the second-nearest), so the trio flanks the winner when the family does.
  var cnds = array<f32, 4>(above, below, hit.z, hit.w);
  var first = 1e6;
  var second = 1e6;
  for (var k = 0; k < 4; k += 1) {
    let v = cnds[k];
    if (v >= 1e5 || abs(v - r) <= 1e-9) {
      continue;
    }
    if (first >= 1e5 || abs(v - r) < abs(first - r)) {
      second = first;
      first = v;
    } else if (second >= 1e5 || abs(v - r) < abs(second - r)) {
      second = v;
    }
  }
  var opp = 1e6;
  for (var k = 0; k < 4; k += 1) {
    let v = cnds[k];
    if (v >= 1e5 || (v - r) * (first - r) >= 0.0) {
      continue;
    }
    if (opp >= 1e5 || abs(v - r) < abs(opp - r)) {
      opp = v;
    }
  }
  if (opp < 1e5) {
    second = opp;
  }
  var upSlot = first;
  var downSlot = second;
  if (first < 1e5 && first < r) {
    upSlot = second;
    downSlot = first;
  }

  return vec4<f32>(
    r * scale,
    neighbourWgsl(upSlot, r, s, 1.0) * scale,
    neighbourWgsl(downSlot, r, s, -1.0) * scale,
    0.0
  );
}
`, [ringSignedWgsl, evalRing, neighbourWgsl]);

/**
 * A scalar field and its gradient, in layer coordinates, normalised so that the
 * field itself is dimensionless and O(1) over the box `|q| < scale`.
 *
 * Subtracting `amount * spacing * f` from a family's phase makes the index
 * difference against the unmodulated family exactly `amount * f`, so the fringes
 * are the level sets of `f` at interval `1/amount`. The gradient rides along
 * because the phase residual has to be divided by `|grad psi|` to be a distance,
 * and modulation changes that gradient: without the second and third components
 * a modulated stroke thins by however steep the field is.
 *
 * Returns `vec3(f, df/dx, df/dy)`, the derivatives per world unit.
 */
export const fieldWarp = wgslFn(`
fn fieldWarp(q: vec2<f32>, kind: f32, scale: f32) -> vec3<f32> {
  let k = i32(kind + 0.5);
  if (k <= 0) {
    return vec3<f32>(0.0, 0.0, 0.0);
  }
  let L = max(abs(scale), 1e-3);
  let u = q / L;
  var f = 0.0;
  var g = vec2<f32>(0.0, 0.0);
  if (k == 1) {
    // Saddle. The one field whose contours everyone recognises: hyperbolae, with
    // the asymptote cross where the level set is singular.
    f = u.x * u.x - u.y * u.y;
    g = vec2<f32>(2.0 * u.x, -2.0 * u.y);
  } else if (k == 2) {
    // Dipole potential. Its equipotentials crowd without bound at the poles, so
    // it is also the field that shows the carrier's sampling limit.
    let d0 = u - vec2<f32>(1.0, 0.0);
    let d1 = u + vec2<f32>(1.0, 0.0);
    let a = sqrt(dot(d0, d0) + 0.0625);
    let b = sqrt(dot(d1, d1) + 0.0625);
    f = 0.5 * (1.0 / a - 1.0 / b);
    g = 0.5 * (d1 / (b * b * b) - d0 / (a * a * a));
  } else if (k == 3) {
    // Three Gaussian bumps: a height field, and on a line carrier also the
    // displacement of a warped grating, which is shadow moire.
    var cs = array<vec2<f32>, 3>(vec2<f32>(-0.45, 0.35), vec2<f32>(0.55, -0.4), vec2<f32>(0.15, 0.78));
    var ws = array<f32, 3>(0.45, 0.55, 0.33);
    var amp = array<f32, 3>(1.0, -1.2, 0.65);
    for (var i = 0; i < 3; i = i + 1) {
      let d = u - cs[i];
      let w2 = ws[i] * ws[i];
      let e = amp[i] * exp(-dot(d, d) / (2.0 * w2));
      f = f + e;
      g = g - e * d / w2;
    }
  } else if (k == 4) {
    // Stream function of four point vortices. Its level sets are the
    // streamlines, so the fringes are a flow nobody integrated.
    var cs = array<vec2<f32>, 4>(vec2<f32>(-0.6, -0.7), vec2<f32>(0.62, -0.66), vec2<f32>(0.55, 0.7), vec2<f32>(-0.58, 0.72));
    var gam = array<f32, 4>(1.0, -1.0, 0.85, -0.7);
    for (var i = 0; i < 4; i = i + 1) {
      let d = u - cs[i];
      let r2 = dot(d, d) + 0.0324;
      f = f - gam[i] * 0.5 * log(r2);
      g = g - gam[i] * d / r2;
    }
  } else if (k == 5) {
    // A radial sinusoid: nested fringe zones, the ring analogue of a beat.
    let r = length(u);
    let w = 6.28318530718;
    f = cos(w * r);
    g = -w * sin(w * r) * u / max(r, 1e-4);
  } else {
    // Band-limited noise, five modes. Reads as terrain, and is the only field
    // here with no closed-form contour to compare against.
    var modes = array<vec4<f32>, 5>(
      vec4<f32>(1.9, 1.3, 0.34, 0.3),
      vec4<f32>(3.1, -2.4, 0.24, 1.9),
      vec4<f32>(5.0, 3.9, 0.15, 3.4),
      vec4<f32>(-1.3, 5.8, 0.13, 5.1),
      vec4<f32>(7.4, -1.35, 0.09, 2.2)
    );
    for (var i = 0; i < 5; i = i + 1) {
      let m = modes[i];
      let ph = m.x * u.x + m.y * u.y + m.w;
      f = f + m.z * sin(ph);
      g = g + m.z * cos(ph) * vec2<f32>(m.x, m.y);
    }
  }
  return vec3<f32>(f, g.x / L, g.y / L);
}
`);

/**
 * `warp` shifts the phase residual and `warpGrad` is its world-space gradient,
 * both zero unless the layer carries a field. The divide by `|grad psi|` is a
 * no-op at `warpGrad = 0`, since a line family's phase gradient is a unit vector.
 */
/**
 * A phase residual and pitch, divided into world units by |grad psi|.
 *
 * The residual is measured along the phase, and the phase is not arc length: one
 * unit of psi spans 1/|grad psi| of the plane. Skip the divide and a stroke is
 * too thin by exactly the factor the family is steep by, and the hairline floor,
 * which is stated in pixels, stops meaning anything on screen.
 */
const eikonalWgsl = wgslFn(`
fn eikonalWgsl(residual: f32, pitch: f32, grad: f32) -> vec4<f32> {
  let scale = 1.0 / max(grad, 1e-4);
  let r = residual * scale;
  let g = abs(pitch) * scale;
  return vec4<f32>(r, r + g, r - g, 0.0);
}
`);

/**
 * A layer's phase at a point, `vec4(r, rUp, rDown, floor)`: where the three
 * nearest members of the family sit along the phase, plus a distance the layer
 * keeps no matter what the phase does.
 *
 * Advancing a family's phase by `delta` slides every residual by `-delta`, so the
 * distance at any phase is `phaseDistWgsl` below — the whole carrier sweep from a
 * single solve, rather than a solve per sample. That is the difference between an
 * envelope that costs one pass and one that costs a pass per tap.
 *
 * Three members rather than a residual and a pitch, because a walking family has
 * no single pitch: `h(n) = shapeRadius(q_n) - (n s + phi)` is curved in n, so
 * consecutive members are not equally spaced and `r +/- g` is only a first-order
 * guess at where the neighbours are.
 *
 * `floor` carries the parts of a distance that no phase can move: the hole at the
 * centre of a radial family, and a solve that saturated without finding a member
 * at all.
 */
export const phaseDistWgsl = wgslFn(`
fn phaseDistWgsl(ph: vec4<f32>, delta: f32) -> f32 {
  let near = min(abs(ph.x - delta), min(abs(ph.y - delta), abs(ph.z - delta)));
  return max(near, ph.w);
}
`);

export const linePhase = wgslFn(`
fn linePhase(p: vec2<f32>, angle: f32, spacing: f32, phase: f32, progressive: f32, warp: f32, warpGrad: vec2<f32>) -> vec4<f32> {
  let dir = vec2<f32>(cos(angle), sin(angle));
  let proj = dot(p, dir) - phase - warp;
  let pitch = spacing + progressive;
  var s = spacing;
  if (abs(pitch) > 1e-4) {
    s = pitch;
  }
  return eikonalWgsl(signedModWgsl(proj, s), s, length(dir - warpGrad));
}
`, [eikonalWgsl, signedModWgsl]);

export const lineDistance = wgslFn(`
fn lineDistance(p: vec2<f32>, angle: f32, spacing: f32, phase: f32, progressive: f32, warp: f32, warpGrad: vec2<f32>) -> f32 {
  return phaseDistWgsl(linePhase(p, angle, spacing, phase, progressive, warp, warpGrad), 0.0);
}
`, [linePhase, phaseDistWgsl]);

const periodicDistWgsl = wgslFn(`
fn periodicDistWgsl(value: f32, spacing: f32) -> f32 {
  let s = abs(spacing);
  if (s < 1e-8) {
    return abs(value);
  }
  let q = value / s;
  let f = q - floor(q);
  return min(f, 1.0 - f) * s;
}
`);

/**
 * The four curve families, each the level sets of a phase function psi with
 * member n on `psi = n s + phi`. The gradient is carried as a vector rather than
 * a magnitude so that a field's gradient can be added to it: modulation changes
 * `grad psi`, and the divide that turns a phase residual into a length has to see
 * the change or the stroke width lies.
 */
/** eikonalWgsl for a family missing the member one pitch inwards. */
const oneSidedWgsl = wgslFn(`
fn oneSidedWgsl(residual: f32, inner: f32, pitch: f32, grad: f32) -> vec4<f32> {
  let scale = 1.0 / max(grad, 1e-4);
  let r = residual * scale;
  let g = abs(pitch) * scale;
  var cand = 1e6;
  if (inner < 1e5) {
    cand = inner * scale;
  }
  return vec4<f32>(r, neighbourWgsl(cand, r, g, 1.0), r - g, 0.0);
}
`, [neighbourWgsl]);

export const curvePhase = wgslFn(`
fn curvePhase(p: vec2<f32>, kind: f32, spacing: f32, phase: f32, bend: f32, frequency: f32, warp: f32, warpGrad: vec2<f32>) -> vec4<f32> {
  var s = abs(spacing);
  if (s < 1e-4) {
    s = 1e-4;
  }
  let k = i32(kind + 0.5);
  if (k <= 0) {
    let lambda = 32.0 / max(frequency, 0.05);
    let w = 6.28318530718 / lambda;
    let osc = bend * sin(w * p.y + phase);
    let grad = vec2<f32>(1.0, -bend * w * cos(w * p.y + phase)) - warpGrad;
    return eikonalWgsl(signedModWgsl(p.x - osc - warp, s), s, length(grad));
  }
  if (k == 1) {
    let a = bend * 0.01;
    let psi = p.y - a * p.x * p.x - phase - warp;
    let grad = vec2<f32>(-2.0 * a * p.x, 1.0) - warpGrad;
    return eikonalWgsl(signedModWgsl(psi, s), s, length(grad));
  }
  if (k == 2) {
    let u = p.x * p.x - p.y * p.y;
    let m = sqrt(abs(u));
    let adj = m - phase - warp;
    let n = max(round(adj / s), 1.0);
    let grad = sign(u) * vec2<f32>(p.x, -p.y) / max(m, 1e-4) - warpGrad;
    // One-sided: there is no n = 0 hyperbola, so the member one pitch inwards of
    // the innermost one is not there to slide onto.
    var inner = 1e6;
    if (n > 1.0) {
      inner = adj - (n - 1.0) * s;
    }
    return oneSidedWgsl(adj - n * s, inner, s, length(grad));
  }
  let r = length(p);
  if (r < 1e-6) {
    return eikonalWgsl(signedModWgsl(-phase - warp, s), s, 1.0);
  }
  let radial = p / r;
  if (abs(bend) < 1e-4) {
    return eikonalWgsl(signedModWgsl(r - phase - warp, s), s, length(radial - warpGrad));
  }
  let starts = max(round(abs(bend) / s), 1.0);
  let pitch = starts * s;
  let th = atan2(p.y, p.x);
  let b = pitch / 6.28318530718;
  let grad = radial - b * vec2<f32>(-p.y, p.x) / (r * r) - warpGrad;
  return eikonalWgsl(signedModWgsl(r - b * th - phase - warp, s), s, length(grad));
}
`, [eikonalWgsl, signedModWgsl, oneSidedWgsl]);

export const curveDistance = wgslFn(`
fn curveDistance(p: vec2<f32>, kind: f32, spacing: f32, phase: f32, bend: f32, frequency: f32, warp: f32, warpGrad: vec2<f32>) -> f32 {
  return phaseDistWgsl(curvePhase(p, kind, spacing, phase, bend, frequency, warp, warpGrad), 0.0);
}
`, [curvePhase, phaseDistWgsl]);

/**
 * N undirected lines through the origin, as a phase. The index is angular, so the
 * member gap grows with radius: neighbouring lines stand 2 r sin(seg/2) apart at
 * radius r. The hole is not periodic and so cannot be part of the phase; it
 * clamps the distance afterwards, and under the envelope it reads as the solid
 * disc it is.
 *
 * `turn` is a field in index units rather than world units, because this family's
 * index is an angle and has no pitch to convert through: shifting the index by one
 * is a rotation by one sector, wherever you stand.
 */
export const radialLinePhase = wgslFn(`
fn radialLinePhase(p: vec2<f32>, count: f32, start: f32, turn: f32, turnGrad: vec2<f32>) -> vec4<f32> {
  let n = max(round(count), 1.0);
  let r = length(p);
  let inner = max(start, 0.0);
  let seg = 3.14159265359 / n;
  if (r < 1e-6) {
    return vec4<f32>(0.0, seg, -seg, inner);
  }
  let signed = r * sin(wrapToHalfWgsl(atan2(p.y, p.x) - turn * seg, seg));
  // Near a line psi = r (theta - k seg - turn seg), whose gradient is the unit
  // tangent until modulation tilts it by seg r grad(turn).
  let tangent = vec2<f32>(-p.y, p.x) / r;
  let scale = 1.0 / max(length(tangent - turnGrad * (seg * r)), 1e-4);
  let gap = max(2.0 * r * sin(seg * 0.5), 1e-4) * scale;
  let g = signed * scale;
  return vec4<f32>(g, g + gap, g - gap, max(inner - r, 0.0));
}
`, [wrapToHalfWgsl]);

export const radialLineDistance = wgslFn(`
fn radialLineDistance(p: vec2<f32>, count: f32, start: f32) -> f32 {
  return phaseDistWgsl(radialLinePhase(p, count, start, 0.0, vec2<f32>(0.0, 0.0)), 0.0);
}
`, [radialLinePhase, phaseDistWgsl]);
