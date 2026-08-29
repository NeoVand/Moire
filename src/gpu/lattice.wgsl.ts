// @ts-nocheck — wgslFn includes are FunctionNodes at runtime.
import { wgslFn } from 'three/tsl';

const lineFamilyWgsl = wgslFn(`
fn lineFamilyWgsl(p: vec2<f32>, angle: f32, pitch: f32) -> f32 {
  var s = pitch;
  if (abs(s) < 1e-4) {
    s = 1e-4;
  }
  let proj = -p.x * sin(angle) + p.y * cos(angle);
  let q = proj / s;
  let f = q - floor(q);
  return min(f, 1.0 - f) * abs(s);
}
`);

const worldLineFamilyWgsl = wgslFn(
  `
fn worldLineFamilyWgsl(p: vec2<f32>, angle: f32, pitch: f32, scale: vec2<f32>, phase: f32) -> f32 {
  let n = vec2<f32>(-sin(angle), cos(angle));
  let d = lineFamilyWgsl(p + n * pitch * phase, angle, pitch);
  return d / max(length(n / scale), 1e-6);
}
`,
  [lineFamilyWgsl]
);

const hexEdgeWorldWgsl = wgslFn(`
fn hexEdgeWorldWgsl(q: vec2<f32>, s: f32, scale: vec2<f32>) -> f32 {
  let apothem = s * 0.86602540378;
  var edge = 1e8;
  for (var i = 0; i < 6; i += 1) {
    let ang = f32(i) * 1.0471975512;
    let n = vec2<f32>(cos(ang), sin(ang));
    let dLocal = apothem - dot(q, n);
    edge = min(edge, dLocal / max(length(n / scale), 1e-6));
  }
  return max(edge, 0.0);
}
`);

const hexRoundWgsl = wgslFn(`
fn hexRoundWgsl(uv: vec2<f32>) -> vec2<f32> {
  let x = uv.x;
  let z = uv.y;
  let y = -x - z;
  var rx = round(x);
  var ry = round(y);
  var rz = round(z);
  let xd = abs(rx - x);
  let yd = abs(ry - y);
  let zd = abs(rz - z);
  if (xd > yd && xd > zd) {
    rx = -ry - rz;
  } else if (yd > zd) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }
  return vec2<f32>(rx, rz);
}
`);

/**
 * The two translations a lattice is invariant under, packed as `(a.xy, b.xy)`.
 *
 * Every other family here is the level set of a scalar phase, so the envelope can
 * average over the carrier by sliding a residual — one solve, no resampling. A
 * lattice has no such scalar: its members are indexed by a pair of integers, and
 * a honeycomb is not a union of line families at all, so advancing a "phase"
 * would shrink each cell towards its own centre rather than slide the pattern.
 * What a lattice does have is this translation group, so the envelope averages a
 * lattice layer over its own unit cell instead. Lattice distance is a closed-form
 * cell lookup, so resampling it per tap costs what resampling the ring solver
 * cannot.
 */
export const latticeCellWgsl = wgslFn(`
fn latticeCellWgsl(kind: f32, spacing: f32, scaleX: f32, scaleY: f32) -> vec4<f32> {
  let s = max(spacing, 1e-4);
  var sx = scaleX;
  var sy = scaleY;
  if (abs(sx) < 1e-4) {
    sx = 1e-4;
  }
  if (abs(sy) < 1e-4) {
    sy = 1e-4;
  }
  let k = i32(kind + 0.5);
  if (k <= 0) {
    return vec4<f32>(s * sx, 0.0, 0.0, s * sy);
  }
  // Honeycomb cell centres sit on a triangular lattice of pitch sqrt(3) s.
  if (k == 1) {
    let h = s * 1.73205080757;
    return vec4<f32>(h * sx, 0.0, h * 0.5 * sx, 1.5 * s * sy);
  }
  return vec4<f32>(s * sx, 0.0, 0.5 * s * sx, s * 0.86602540378 * sy);
}
`);

export const gridDistance = wgslFn(
  `
fn gridDistance(p: vec2<f32>, kind: f32, spacing: f32, wantVertex: f32, scaleX: f32, scaleY: f32) -> f32 {
  let s = max(spacing, 1e-4);
  var sx = scaleX;
  var sy = scaleY;
  if (abs(sx) < 1e-4) {
    sx = 1e-4;
  }
  if (abs(sy) < 1e-4) {
    sy = 1e-4;
  }
  let scale = vec2<f32>(sx, sy);
  let k = i32(kind + 0.5);
  var edge = 1e8;
  var vertex = 1e8;

  if (k <= 0) {
    let gx = p.x / (s * sx);
    let gy = p.y / (s * sy);
    let fx = gx - floor(gx);
    let fy = gy - floor(gy);
    let dx = min(fx, 1.0 - fx) * s * sx;
    let dy = min(fy, 1.0 - fy) * s * sy;
    edge = min(dx, dy);
    vertex = length(vec2<f32>(dx, dy));
  } else if (k == 1) {
    let pL = vec2<f32>(p.x / sx, p.y / sy);
    let h = s * 1.73205080757;
    let b = pL.y / (1.5 * s);
    let a = (pL.x - b * h * 0.5) / h;
    let r = hexRoundWgsl(vec2<f32>(a, b));
    let q = pL - vec2<f32>(r.x * h + r.y * h * 0.5, r.y * 1.5 * s);
    edge = hexEdgeWorldWgsl(q, s, scale);
    vertex = 1e8;
    for (var i = 0; i < 6; i += 1) {
      let ang = 0.523598775598 + f32(i) * 1.0471975512;
      let d = q - vec2<f32>(s * cos(ang), s * sin(ang));
      vertex = min(vertex, length(vec2<f32>(d.x * sx, d.y * sy)));
    }
  } else {
    let pL = vec2<f32>(p.x / sx, p.y / sy);
    let pitch = s * 0.86602540378;
    edge = min(
      worldLineFamilyWgsl(pL, 0.0, pitch, scale, 0.0),
      min(
        worldLineFamilyWgsl(pL, 1.0471975512, pitch, scale, 0.0),
        worldLineFamilyWgsl(pL, 2.09439510239, pitch, scale, 0.0)
      )
    );
    let vv = pL.y / (s * 0.86602540378);
    let uu = (pL.x - vv * (s * 0.5)) / s;
    let r = hexRoundWgsl(vec2<f32>(uu, vv));
    let c = vec2<f32>(r.x * s + r.y * s * 0.5, r.y * s * 0.86602540378);
    let d = pL - c;
    vertex = length(vec2<f32>(d.x * sx, d.y * sy));
  }

  if (wantVertex > 0.5) {
    return vertex;
  }
  return edge;
}
`,
  [worldLineFamilyWgsl, hexEdgeWorldWgsl, hexRoundWgsl]
);
