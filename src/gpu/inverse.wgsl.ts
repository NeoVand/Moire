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

const shapeRadiusWgsl = wgslFn(`
fn shapeRadiusWgsl(q: vec2<f32>, shapeType: f32, sides: f32) -> f32 {
  let shape = i32(shapeType + 0.5);
  if (shape <= 1) {
    return length(q);
  }
  if (shape == 2) {
    return max(abs(q.x), abs(q.y));
  }
  var n = sides;
  if (shape == 3) {
    n = 3.0;
  }
  n = max(n, 3.0);
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
 * Ring n's own frame, R(-n theta) p - n delta, in one angle instead of two
 * rotations. The offset drops out of the rotation because R preserves dot
 * products, which is also what makes the window below closed-form.
 */
const ringLocalWgsl = wgslFn(`
fn ringLocalWgsl(radius: f32, angle: f32, n: f32, theta: f32, offset: vec2<f32>) -> vec2<f32> {
  let psi = n * theta - angle;
  return vec2<f32>(radius * cos(psi) - n * offset.x, -radius * sin(psi) - n * offset.y);
}
`);

/**
 * Integer indices that can possibly land within `guard` of p. With
 * h(n) = shapeRadius(q_n) - (n s + phase) and |q_n| in [ | |p| - n|d| |, |p| + n|d| ]:
 *
 *   kappa * | |p| - n|d| | - (n s + phase)  <=  h(n)  <=  (|p| + n|d|) - (n s + phase)
 *
 * h <= guard gives the low end, h >= -guard the high end. Every index outside is
 * proven farther than guard, so no ring can hide outside this window. When
 * kappa|d| <= s <= |d| every ring sweeps past the origin and no finite bound
 * exists, so the span is capped.
 */
const ringWindowWgsl = wgslFn(`
fn ringWindowWgsl(radius: f32, offLen: f32, spacing: f32, phase: f32, kappa: f32, guard: f32) -> vec2<f32> {
  let lo = max(0.0, floor((kappa * radius - phase - guard) / (spacing + kappa * offLen)));
  var hi = lo + 8192.0;
  if (spacing > offLen) {
    hi = ceil((radius - phase + guard) / (spacing - offLen));
  } else if (kappa * offLen > spacing) {
    hi = ceil((guard + phase + kappa * radius) / (kappa * offLen - spacing));
  }
  return vec2<f32>(lo, max(lo, min(hi, lo + 8192.0)));
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
  return abs(shapeRadiusWgsl(q, shapeType, sides) - radius);
}
`, [rotate2d, shapeRadiusWgsl]);

const checkNear = wgslFn(`
fn checkNear(p: vec2<f32>, t: f32, offset: vec2<f32>, theta: f32, spacing: f32, phase: f32, shapeType: f32, sides: f32) -> f32 {
  let n0 = floor(t);
  var d = 1e6;
  d = min(d, evalRing(p, n0 - 4.0, offset, theta, spacing, phase, shapeType, sides));
  d = min(d, evalRing(p, n0 - 3.0, offset, theta, spacing, phase, shapeType, sides));
  d = min(d, evalRing(p, n0 - 2.0, offset, theta, spacing, phase, shapeType, sides));
  d = min(d, evalRing(p, n0 - 1.0, offset, theta, spacing, phase, shapeType, sides));
  d = min(d, evalRing(p, n0, offset, theta, spacing, phase, shapeType, sides));
  d = min(d, evalRing(p, n0 + 1.0, offset, theta, spacing, phase, shapeType, sides));
  d = min(d, evalRing(p, n0 + 2.0, offset, theta, spacing, phase, shapeType, sides));
  d = min(d, evalRing(p, n0 + 3.0, offset, theta, spacing, phase, shapeType, sides));
  d = min(d, evalRing(p, n0 + 4.0, offset, theta, spacing, phase, shapeType, sides));
  return d;
}
`, [evalRing]);

const centeredModWgsl = wgslFn(`
fn centeredModWgsl(r: f32, spacing: f32, phase: f32) -> f32 {
  let adj = r - phase;
  if (adj < 0.0) {
    return -adj;
  }
  let q = adj / max(abs(spacing), 1e-8);
  let f = q - floor(q);
  return min(f, 1.0 - f) * abs(spacing);
}
`);

const circleQuadraticWgsl = wgslFn(`
fn circleQuadraticWgsl(p: vec2<f32>, offset: vec2<f32>, spacing: f32, phase: f32, shapeType: f32, sides: f32) -> f32 {
  let r = length(p);
  let scale = max(r, 1.0);
  let A = dot(offset, offset) - spacing * spacing;
  let B = -2.0 * (dot(p, offset) + spacing * phase);
  let C = r * r - phase * phase;
  let guess = max(0.0, (r - phase) / max(spacing, 1e-5));
  var d = checkNear(p, guess, offset, 0.0, spacing, phase, shapeType, sides);
  if (abs(A) < 1e-8) {
    if (abs(B) > 1e-8) {
      d = min(d, checkNear(p, -C / B, offset, 0.0, spacing, phase, shapeType, sides));
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
      d = min(d, checkNear(p, (qv / A) * scale, offset, 0.0, spacing, phase, shapeType, sides));
      d = min(d, checkNear(p, (Cs / qv) * scale, offset, 0.0, spacing, phase, shapeType, sides));
    }
  }
  return d;
}
`, [checkNear]);

const squareTranslatedWgsl = wgslFn(`
fn squareTranslatedWgsl(p: vec2<f32>, offset: vec2<f32>, spacing: f32, phase: f32) -> f32 {
  let rinf = max(abs(p.x), abs(p.y));
  var d = checkNear(p, max(0.0, (rinf - phase) / spacing), offset, 0.0, spacing, phase, 2.0, 4.0);
  var den = spacing + offset.x;
  if (abs(den) > 1e-6) {
    d = min(d, checkNear(p, (p.x - phase) / den, offset, 0.0, spacing, phase, 2.0, 4.0));
  }
  den = spacing - offset.x;
  if (abs(den) > 1e-6) {
    d = min(d, checkNear(p, (-p.x - phase) / den, offset, 0.0, spacing, phase, 2.0, 4.0));
  }
  den = spacing + offset.y;
  if (abs(den) > 1e-6) {
    d = min(d, checkNear(p, (p.y - phase) / den, offset, 0.0, spacing, phase, 2.0, 4.0));
  }
  den = spacing - offset.y;
  if (abs(den) > 1e-6) {
    d = min(d, checkNear(p, (-p.y - phase) / den, offset, 0.0, spacing, phase, 2.0, 4.0));
  }
  return d;
}
`, [checkNear]);

export const ringDistance = wgslFn(`
fn ringDistance(p: vec2<f32>, offset: vec2<f32>, theta: f32, spacing: f32, phase: f32, shapeType: f32, sides: f32, acceptBelow: f32, rejectAbove: f32) -> f32 {
  let s = max(spacing, 1e-4);
  let hasOff = dot(offset, offset) > 1e-8;
  let hasRot = abs(theta) > 1e-8;
  let shape = i32(shapeType + 0.5);

  if (!hasOff && (!hasRot || shape <= 1)) {
    return centeredModWgsl(shapeRadiusWgsl(p, shapeType, sides), s, phase);
  }
  if (!hasRot) {
    if (shape == 2) {
      return squareTranslatedWgsl(p, offset, s, phase);
    }
    if (shape <= 1) {
      return circleQuadraticWgsl(p, offset, s, phase, shapeType, sides);
    }
  }

  // Anything past guard renders as no ink, so the window only has to be exact below it.
  let guard = max(rejectAbove, s * 0.75);
  let radius = length(p);
  let angle = atan2(p.y, p.x);
  let offLen = length(offset);
  let win = ringWindowWgsl(radius, offLen, s, phase, ringKappaWgsl(shapeType, sides), guard);
  let hi = win.y;
  // q_n = R(-n theta) p - n delta, so dq/dn = -theta perp(R(-n theta) p) - delta
  // and the bound is a constant. shapeRadius is 1-Lipschitz in q, corners included.
  let slope = abs(theta) * radius + offLen + s;

  var best = 1e6;
  var n = win.x;
  for (var i = 0; i < 2048; i += 1) {
    if (n > hi) {
      break;
    }
    let q = ringLocalWgsl(radius, angle, n, theta, offset);
    let gap = abs(shapeRadiusWgsl(q, shapeType, sides) - (n * s + phase));
    best = min(best, gap);
    if (acceptBelow > 0.0 && best <= acceptBelow) {
      return best;
    }
    // No index within (gap - bar) / slope of here can beat bar, so skip the run.
    let bar = min(best, guard);
    let safe = floor((gap - bar) / slope);
    // Keep the tail inside the budget. Only bites when the window is enormous.
    let reach = ceil((hi - n) / max(2048.0 - f32(i), 1.0));
    n = n + max(1.0, max(safe, reach));
  }
  return min(best, guard);
}
`, [
  centeredModWgsl,
  shapeRadiusWgsl,
  squareTranslatedWgsl,
  circleQuadraticWgsl,
  ringKappaWgsl,
  ringLocalWgsl,
  ringWindowWgsl,
]);

export const lineDistance = wgslFn(`
fn lineDistance(p: vec2<f32>, angle: f32, spacing: f32, phase: f32, progressive: f32) -> f32 {
  let dir = vec2<f32>(cos(angle), sin(angle));
  let proj = dot(p, dir) - phase;
  let pitch = spacing + progressive;
  var s = spacing;
  if (abs(pitch) > 1e-4) {
    s = pitch;
  }
  let q = proj / max(abs(s), 1e-4);
  let f = q - floor(q);
  return min(f, 1.0 - f) * abs(s);
}
`);

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

export const curveDistance = wgslFn(`
fn curveDistance(p: vec2<f32>, kind: f32, spacing: f32, phase: f32, bend: f32, frequency: f32) -> f32 {
  var s = abs(spacing);
  if (s < 1e-4) {
    s = 1e-4;
  }
  let k = i32(kind + 0.5);
  if (k <= 0) {
    let lambda = 32.0 / max(frequency, 0.05);
    let osc = bend * sin(6.28318530718 * p.y / lambda + phase);
    return periodicDistWgsl(p.x - osc, s);
  }
  if (k == 1) {
    let a = bend * 0.01;
    let psi = p.y - a * p.x * p.x - phase;
    let grad = sqrt(1.0 + (2.0 * a * p.x) * (2.0 * a * p.x));
    return periodicDistWgsl(psi, s) / max(grad, 1e-4);
  }
  if (k == 2) {
    let u = p.x * p.x - p.y * p.y;
    let adj = sqrt(abs(u)) - phase;
    let n = max(round(adj / s), 1.0);
    return abs(adj - n * s);
  }
  let r = length(p);
  if (r < 1e-6) {
    return periodicDistWgsl(-phase, s);
  }
  if (abs(bend) < 1e-4) {
    return periodicDistWgsl(r - phase, s);
  }
  let starts = max(round(abs(bend) / s), 1.0);
  let pitch = starts * s;
  let th = atan2(p.y, p.x);
  return periodicDistWgsl(r - pitch * th / 6.28318530718 - phase, s);
}
`, [periodicDistWgsl]);

export const radialLineDistance = wgslFn(`
fn radialLineDistance(p: vec2<f32>, count: f32, start: f32) -> f32 {
  let n = max(round(count), 1.0);
  let r = length(p);
  let inner = max(start, 0.0);
  if (r < 1e-6) {
    return inner;
  }
  let seg = 3.14159265359 / n;
  let dLine = r * abs(sin(wrapToHalfWgsl(atan2(p.y, p.x), seg)));
  return max(dLine, inner - r);
}
`, [wrapToHalfWgsl]);
