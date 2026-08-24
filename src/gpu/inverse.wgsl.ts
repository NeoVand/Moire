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

const perp2d = wgslFn(`
fn perp2d(v: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(-v.y, v.x);
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
  let half = seg * 0.5;
  var a = (ang + half) % seg - half;
  if (a < -half) {
    a = a + seg;
  }
  return length(q) * cos(a);
}
`);

const shapeGradWgsl = wgslFn(`
fn shapeGradWgsl(q: vec2<f32>, shapeType: f32, sides: f32) -> vec2<f32> {
  let r = length(q);
  if (r < 1e-6) {
    return vec2<f32>(1.0, 0.0);
  }
  let shape = i32(shapeType + 0.5);
  if (shape <= 1) {
    return q / r;
  }
  if (shape == 2) {
    if (abs(q.x) > abs(q.y)) {
      return vec2<f32>(sign(q.x), 0.0);
    }
    return vec2<f32>(0.0, sign(q.y));
  }
  var n = sides;
  if (shape == 3) {
    n = 3.0;
  }
  n = max(n, 3.0);
  let ang = atan2(q.y, q.x);
  let seg = 6.28318530718 / n;
  let half = seg * 0.5;
  var a = (ang + half) % seg - half;
  if (a < -half) {
    a = a + seg;
  }
  let nrm = ang - a;
  return vec2<f32>(cos(nrm), sin(nrm));
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

const checkNeighbors = wgslFn(`
fn checkNeighbors(p: vec2<f32>, t: f32, offset: vec2<f32>, theta: f32, spacing: f32, phase: f32, shapeType: f32, sides: f32) -> f32 {
  let n0 = floor(t);
  var d = 1e6;
  d = min(d, evalRing(p, n0 - 2.0, offset, theta, spacing, phase, shapeType, sides));
  d = min(d, evalRing(p, n0 - 1.0, offset, theta, spacing, phase, shapeType, sides));
  d = min(d, evalRing(p, n0, offset, theta, spacing, phase, shapeType, sides));
  d = min(d, evalRing(p, n0 + 1.0, offset, theta, spacing, phase, shapeType, sides));
  d = min(d, evalRing(p, n0 + 2.0, offset, theta, spacing, phase, shapeType, sides));
  d = min(d, evalRing(p, n0 + 3.0, offset, theta, spacing, phase, shapeType, sides));
  return d;
}
`, [evalRing]);

const centeredModWgsl = wgslFn(`
fn centeredModWgsl(r: f32, spacing: f32, phase: f32) -> f32 {
  let adj = r - phase;
  if (adj < 0.0) {
    return -adj;
  }
  let t = adj / spacing;
  let f = t - floor(t + 0.5);
  return abs(f) * spacing;
}
`);

const circleQuadraticWgsl = wgslFn(`
fn circleQuadraticWgsl(p: vec2<f32>, offset: vec2<f32>, spacing: f32, phase: f32, shapeType: f32, sides: f32) -> f32 {
  let A = dot(offset, offset) - spacing * spacing;
  let B = -2.0 * (dot(p, offset) + spacing * phase);
  let C = dot(p, p) - phase * phase;
  let guess = max(0.0, (length(p) - phase) / max(spacing, 1e-5));
  var d = checkNeighbors(p, guess, offset, 0.0, spacing, phase, shapeType, sides);
  if (abs(A) < 1e-6) {
    if (abs(B) > 1e-6) {
      d = min(d, checkNeighbors(p, -C / B, offset, 0.0, spacing, phase, shapeType, sides));
    }
    return d;
  }
  let disc = B * B - 4.0 * A * C;
  if (disc >= 0.0) {
    let sd = sqrt(disc);
    d = min(d, checkNeighbors(p, (-B + sd) / (2.0 * A), offset, 0.0, spacing, phase, shapeType, sides));
    d = min(d, checkNeighbors(p, (-B - sd) / (2.0 * A), offset, 0.0, spacing, phase, shapeType, sides));
  }
  return d;
}
`, [checkNeighbors]);

const squareTranslatedWgsl = wgslFn(`
fn squareTranslatedWgsl(p: vec2<f32>, offset: vec2<f32>, spacing: f32, phase: f32) -> f32 {
  let rinf = max(abs(p.x), abs(p.y));
  var d = checkNeighbors(p, max(0.0, (rinf - phase) / spacing), offset, 0.0, spacing, phase, 2.0, 4.0);
  var den = spacing + offset.x;
  if (abs(den) > 1e-6) {
    d = min(d, checkNeighbors(p, (p.x - phase) / den, offset, 0.0, spacing, phase, 2.0, 4.0));
  }
  den = spacing - offset.x;
  if (abs(den) > 1e-6) {
    d = min(d, checkNeighbors(p, (-p.x - phase) / den, offset, 0.0, spacing, phase, 2.0, 4.0));
  }
  den = spacing + offset.y;
  if (abs(den) > 1e-6) {
    d = min(d, checkNeighbors(p, (p.y - phase) / den, offset, 0.0, spacing, phase, 2.0, 4.0));
  }
  den = spacing - offset.y;
  if (abs(den) > 1e-6) {
    d = min(d, checkNeighbors(p, (-p.y - phase) / den, offset, 0.0, spacing, phase, 2.0, 4.0));
  }
  return d;
}
`, [checkNeighbors]);

const newtonFromWgsl = wgslFn(`
fn newtonFromWgsl(p: vec2<f32>, t0: f32, offset: vec2<f32>, theta: f32, spacing: f32, phase: f32, shapeType: f32, sides: f32) -> f32 {
  var t = max(0.0, t0);
  for (var i = 0; i < 8; i += 1) {
    let center = rotate2d(offset * t, t * theta);
    let q = rotate2d(p - center, -t * theta);
    let r = shapeRadiusWgsl(q, shapeType, sides);
    let f = r - (t * spacing + phase);
    let deltaR = rotate2d(offset, t * theta);
    let centerP = deltaR + (t * theta) * perp2d(deltaR);
    let qp = -theta * perp2d(q) - rotate2d(centerP, -t * theta);
    let g = shapeGradWgsl(q, shapeType, sides);
    let fp = dot(g, qp) - spacing;
    if (abs(fp) < 1e-6) {
      break;
    }
    let step = clamp(f / fp, -8.0, 8.0);
    t = max(0.0, t - step);
    if (abs(step) < 1e-4) {
      break;
    }
  }
  return t;
}
`, [rotate2d, perp2d, shapeRadiusWgsl, shapeGradWgsl]);

export const ringDistance = wgslFn(`
fn ringDistance(p: vec2<f32>, offset: vec2<f32>, theta: f32, spacing: f32, phase: f32, shapeType: f32, sides: f32) -> f32 {
  let s = max(spacing, 1e-4);
  let hasOff = dot(offset, offset) > 1e-8;
  let hasRot = abs(theta) > 1e-8;
  let shape = i32(shapeType + 0.5);

  if (!hasOff && !hasRot) {
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

  let t0 = max(0.0, (length(p) - phase) / s);
  let tInf = max(0.0, (max(abs(p.x), abs(p.y)) - phase) / s);
  var d = checkNeighbors(p, newtonFromWgsl(p, t0, offset, theta, s, phase, shapeType, sides), offset, theta, s, phase, shapeType, sides);
  d = min(d, checkNeighbors(p, newtonFromWgsl(p, tInf, offset, theta, s, phase, shapeType, sides), offset, theta, s, phase, shapeType, sides));
  d = min(d, checkNeighbors(p, t0, offset, theta, s, phase, shapeType, sides));
  d = min(d, checkNeighbors(p, newtonFromWgsl(p, t0 * 0.35, offset, theta, s, phase, shapeType, sides), offset, theta, s, phase, shapeType, sides));
  d = min(d, checkNeighbors(p, newtonFromWgsl(p, t0 * 0.7, offset, theta, s, phase, shapeType, sides), offset, theta, s, phase, shapeType, sides));
  d = min(d, checkNeighbors(p, newtonFromWgsl(p, t0 * 1.4 + 2.0, offset, theta, s, phase, shapeType, sides), offset, theta, s, phase, shapeType, sides));
  d = min(d, checkNeighbors(p, newtonFromWgsl(p, t0 * 2.0 + 4.0, offset, theta, s, phase, shapeType, sides), offset, theta, s, phase, shapeType, sides));
  return d;
}
`, [
  centeredModWgsl,
  shapeRadiusWgsl,
  squareTranslatedWgsl,
  circleQuadraticWgsl,
  newtonFromWgsl,
  checkNeighbors,
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
  let t = proj / max(s, 1e-4);
  let f = t - floor(t + 0.5);
  return abs(f) * abs(s);
}
`);
