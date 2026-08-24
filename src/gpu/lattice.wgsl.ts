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

const hexNormWgsl = wgslFn(`
fn hexNormWgsl(p: vec2<f32>) -> f32 {
  let x = abs(p.x);
  let y = abs(p.y);
  return max(x, x * 0.5 + y * 0.86602540378);
}
`);

export const gridDistance = wgslFn(
  `
fn gridDistance(p: vec2<f32>, kind: f32, spacing: f32, wantVertex: f32) -> f32 {
  let s = max(spacing, 1e-4);
  let k = i32(kind + 0.5);
  var edge = 1e8;
  var vertex = 1e8;

  if (k <= 0) {
    let gx = p.x / s;
    let gy = p.y / s;
    let fx = gx - floor(gx);
    let fy = gy - floor(gy);
    let dx = min(fx, 1.0 - fx) * s;
    let dy = min(fy, 1.0 - fy) * s;
    edge = min(dx, dy);
    vertex = length(vec2<f32>(min(fx, 1.0 - fx), min(fy, 1.0 - fy))) * s;
  } else if (k == 1) {
    let h = s * 1.73205080757;
    let b = p.y / (1.5 * s);
    let a = (p.x - b * h * 0.5) / h;
    let r = hexRoundWgsl(vec2<f32>(a, b));
    let q = p - vec2<f32>(r.x * h + r.y * h * 0.5, r.y * 1.5 * s);
    edge = max(0.0, s * 0.86602540378 - hexNormWgsl(q));
    vertex = 1e8;
    for (var i = 0; i < 6; i += 1) {
      let ang = 0.523598775598 + f32(i) * 1.0471975512;
      vertex = min(vertex, length(q - vec2<f32>(s * cos(ang), s * sin(ang))));
    }
  } else {
    let pitch = s * 0.86602540378;
    edge = min(
      lineFamilyWgsl(p, 0.0, pitch),
      min(lineFamilyWgsl(p, 1.0471975512, pitch), lineFamilyWgsl(p, 2.09439510239, pitch))
    );
    let vv = p.y / (s * 0.86602540378);
    let uu = (p.x - vv * (s * 0.5)) / s;
    let r = hexRoundWgsl(vec2<f32>(uu, vv));
    let c = vec2<f32>(r.x * s + r.y * s * 0.5, r.y * s * 0.86602540378);
    vertex = length(p - c);
  }

  if (wantVertex > 0.5) {
    return vertex;
  }
  return edge;
}
`,
  [lineFamilyWgsl, hexRoundWgsl, hexNormWgsl]
);
