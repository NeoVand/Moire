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
    let pitch = s * 1.73205080757;
    edge = min(
      worldLineFamilyWgsl(pL, 0.523598775598, pitch, scale, 0.5),
      min(
        worldLineFamilyWgsl(pL, 1.57079632679, pitch, scale, 0.5),
        worldLineFamilyWgsl(pL, 2.61799387799, pitch, scale, 0.5)
      )
    );
    let h = s * 1.73205080757;
    let b = pL.y / (1.5 * s);
    let a = (pL.x - b * h * 0.5) / h;
    let r = hexRoundWgsl(vec2<f32>(a, b));
    let q = pL - vec2<f32>(r.x * h + r.y * h * 0.5, r.y * 1.5 * s);
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
  [worldLineFamilyWgsl, hexRoundWgsl]
);
