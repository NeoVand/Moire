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
  let nrm = ang - wrapToHalfWgsl(ang, seg);
  return vec2<f32>(cos(nrm), sin(nrm));
}
`, [wrapToHalfWgsl]);

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

const checkWindow = wgslFn(`
fn checkWindow(p: vec2<f32>, t: f32, offset: vec2<f32>, theta: f32, spacing: f32, phase: f32, shapeType: f32, sides: f32, half: f32) -> f32 {
  let n0 = floor(t);
  let h = i32(clamp(round(half), 0.0, 16.0));
  var d = 1e6;
  for (var k = -h; k <= h; k += 1) {
    d = min(d, evalRing(p, n0 + f32(k), offset, theta, spacing, phase, shapeType, sides));
  }
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

const newtonFromWgsl = wgslFn(`
fn newtonFromWgsl(p: vec2<f32>, t0: f32, offset: vec2<f32>, theta: f32, spacing: f32, phase: f32, shapeType: f32, sides: f32) -> f32 {
  var t = max(0.0, t0);
  for (var i = 0; i < 12; i += 1) {
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
    let step = clamp(f / fp, -12.0, 12.0);
    t = max(0.0, t - step);
    if (abs(step) < 1e-4) {
      break;
    }
  }
  return t;
}
`, [rotate2d, perp2d, shapeRadiusWgsl, shapeGradWgsl]);

const polishSeed = wgslFn(`
fn polishSeed(p: vec2<f32>, t0: f32, offset: vec2<f32>, theta: f32, spacing: f32, phase: f32, shapeType: f32, sides: f32) -> f32 {
  let t = newtonFromWgsl(p, t0, offset, theta, spacing, phase, shapeType, sides);
  return min(
    checkNear(p, t, offset, theta, spacing, phase, shapeType, sides),
    checkNear(p, t0, offset, theta, spacing, phase, shapeType, sides)
  );
}
`, [newtonFromWgsl, checkNear]);

export const ringDistance = wgslFn(`
fn ringDistance(p: vec2<f32>, offset: vec2<f32>, theta: f32, spacing: f32, phase: f32, shapeType: f32, sides: f32, acceptBelow: f32) -> f32 {
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

  let r2 = length(p);
  let rInf = max(abs(p.x), abs(p.y));
  let rShape = shapeRadiusWgsl(p, shapeType, sides);
  let tL2 = max(0.0, (r2 - phase) / s);
  let tInf = max(0.0, (rInf - phase) / s);
  let tShape = max(0.0, (rShape - phase) / s);

  var d = polishSeed(p, tL2, offset, theta, s, phase, shapeType, sides);
  d = min(d, polishSeed(p, tInf, offset, theta, s, phase, shapeType, sides));
  d = min(d, polishSeed(p, tShape, offset, theta, s, phase, shapeType, sides));
  d = min(d, polishSeed(p, tL2 * 0.35, offset, theta, s, phase, shapeType, sides));
  d = min(d, polishSeed(p, tL2 * 1.6 + 3.0, offset, theta, s, phase, shapeType, sides));
  if (acceptBelow > 0.0 && d <= acceptBelow) {
    return d;
  }

  if (hasOff) {
    var inv = 0.0;
    if (r2 > 1e-6) {
      inv = 1.0 / r2;
    }
    let rot = rotate2d(offset, tShape * theta);
    let den = s + p.x * inv * rot.x + p.y * inv * rot.y;
    if (abs(den) > 1e-4) {
      d = min(d, polishSeed(p, (r2 - phase) / den, offset, theta, s, phase, shapeType, sides));
    }
    if (acceptBelow > 0.0 && d <= acceptBelow) {
      return d;
    }
  }

  var nSides = 0.0;
  if (shape == 2) {
    nSides = 4.0;
  } else if (shape == 3) {
    nSides = 3.0;
  } else if (shape >= 4) {
    nSides = max(sides, 3.0);
  }
  var sidesForSpan = nSides;
  if (sidesForSpan < 3.0) {
    sidesForSpan = 4.0;
  }
  let seg = 6.28318530718 / sidesForSpan;
  let offLen = length(offset);
  let radialMin = r2 * cos(seg * 0.5);
  let nMin = max(0.0, (radialMin - phase) / (s + offLen + 0.5));
  let nMax = max(nMin + 1.0, (r2 - phase) / max(s - offLen, 0.2) + 2.0);
  let span = nMax - nMin;
  if (hasRot || (hasOff && nSides >= 3.0)) {
    let samples = i32(clamp(ceil(span / 16.0), 8.0, 32.0));
    let step = span / f32(samples);
    let half = min(16.0, max(4.0, ceil(step * 0.5 + 1.0)));
    for (var i = 0; i < 32; i += 1) {
      if (i >= samples) {
        break;
      }
      let t = nMin + (f32(i) + 0.5) * step;
      d = min(d, checkWindow(p, t, offset, theta, s, phase, shapeType, sides, half));
      if (acceptBelow > 0.0 && d <= acceptBelow) {
        return d;
      }
    }
  }

  if (d > s * 0.42) {
    d = min(d, checkWindow(p, tShape, offset, theta, s, phase, shapeType, sides, 16.0));
    d = min(d, checkWindow(p, tL2, offset, theta, s, phase, shapeType, sides, 16.0));
    d = min(d, checkWindow(p, 0.5 * (nMin + nMax), offset, theta, s, phase, shapeType, sides, 16.0));
  }
  return d;
}
`, [
  centeredModWgsl,
  shapeRadiusWgsl,
  squareTranslatedWgsl,
  circleQuadraticWgsl,
  polishSeed,
  rotate2d,
  checkNear,
  checkWindow,
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
