import { OURS_KERNEL } from './ours-kernel.wgsl.js';

// WGSL for the side-by-side anti-aliasing demo: the plane seen through a
// homography, the benchmark shaders point-evaluated, and the arms: point
// sampling, supersampling, temporal AA, mipmapped texture, ours (the pixel's
// Gaussian window integrated in closed form over the shader's structure) and
// the sampled reference.
//
// Conventions follow paper/tools/exp/fjet-yb.mjs: a pixel's continuous
// coordinate is its integer index (x, y), its window is a Gaussian of
// sigma 0.5 px, and the plane coordinates (s, t) are (Nu, Nv) / D with
// (Nu, Nv, D) affine in (x, y, 1): the homography rows hu, hv, hd.

export const COMMON = /* wgsl */ `
const TAU: f32 = 6.283185307179586;
const PI: f32 = 3.141592653589793;

struct Uniforms {
  hu: vec4f,      // Nu = hu.x * x + hu.y * y + hu.z
  hv: vec4f,      // Nv
  hd: vec4f,      // D
  huP: vec4f,     // the previous frame's homography (for TAA reprojection)
  hvP: vec4f,
  hdP: vec4f,
  invP0: vec4f,   // rows of the inverse of the previous homography: (u, v, 1) -> (x' w, y' w, w)
  invP1: vec4f,
  invP2: vec4f,
  light: vec4f,   // xyz: the light direction; w: unused
  eye: vec4f,     // xyz: the eye position in plane units (general camera); w: 1 when the YB viewer formula is used
  res: vec4f,     // W, H, 1/W, 1/H
  p0: vec4f,      // sigma, time, jitter x, jitter y (pixels)
  p1: vec4f,      // samples, seed, scene, period
  p2: vec4f,      // taa alpha, reference accumulate (0/1), regime debug, ours cut
};
@group(0) @binding(0) var<uniform> U: Uniforms;

struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vsFull(@builtin(vertex_index) i: u32) -> VOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = 0.5 * (p[i] + vec2f(1.0, 1.0));
  o.uv.y = 1.0 - o.uv.y;
  return o;
}

// plane coordinates and the viewer vector at a continuous pixel position
struct Ground { s: f32, t: f32, d: f32, viewer: vec3f };
fn ground(x: f32, y: f32) -> Ground {
  let p = vec3f(x, y, 1.0);
  let Nu = dot(U.hu.xyz, p);
  let Nv = dot(U.hv.xyz, p);
  let D = dot(U.hd.xyz, p);
  var g: Ground;
  g.d = D;
  g.s = Nu / D;
  g.t = Nv / D;
  if (U.eye.w > 0.5) {
    // the benchmark's viewer vector for its plane
    g.viewer = normalize(vec3f(x - 240.0, 240.0, y + 1.0));
  } else {
    g.viewer = normalize(U.eye.xyz - vec3f(g.s, g.t, 0.0));
  }
  return g;
}

// the benchmark's lighting on the plane's flat normal (0, 0, 1)
fn lightingLN() -> f32 { return max(U.light.z, 0.0); }
fn lightingSpec(viewer: vec3f, specPow: f32) -> f32 {
  let LN = lightingLN();
  let R = 2.0 * LN * vec3f(0.0, 0.0, 1.0) - U.light.xyz;
  return pow(max(dot(R, viewer), 0.0), specPow);
}

// the pictures: scene 0 checkerboard, scene 1 circles, on (s, t)
fn pictureAt(scene: u32, s: f32, t: f32) -> f32 {
  if (scene == 0u) {
    let xs = fract(s / 20.0);
    let ys = fract(t / 20.0);
    let ss = select(0.0, 1.0, xs >= 0.5);
    let tt = select(0.0, 1.0, ys >= 0.5);
    return ss * tt + (1.0 - ss) * (1.0 - tt);
  }
  // circles: radius 25/3, gap 5/3, cell 2 r + 2 gap
  let circleR = 25.0 / 3.0;
  let gap = 5.0 / 3.0;
  let d = 2.0 * circleR + 2.0 * gap;
  let xm = fract(s / d) * d - gap;
  let ym = fract(t / d) * d - gap;
  let r = sqrt((xm - circleR) * (xm - circleR) + (ym - circleR) * (ym - circleR));
  return 0.5 - 0.5 * sign(r - circleR);
}

// the shader's colour at a continuous pixel position: the point sample
fn shade(x: f32, y: f32) -> vec3f {
  let g = ground(x, y);
  if (g.d <= 0.0) { return vec3f(0.0); }
  let scene = u32(U.p1.z);
  let P = pictureAt(scene, g.s, g.t);
  let LN = lightingLN();
  if (scene == 0u) {
    let v = LN * P + lightingSpec(g.viewer, 50.0);
    return vec3f(v);
  }
  return vec3f(LN * P);
}

// hashing for the sampled arms
fn hash3(p: vec3u) -> u32 {
  var h = (p.x * 0x9E3779B1u) ^ (p.y * 0x85EBCA77u) ^ (p.z * 0xC2B2AE3Du);
  h ^= h >> 15u; h *= 0x2C1B3C6Du; h ^= h >> 12u; h *= 0x297A2D39u; h ^= h >> 15u;
  return h;
}
fn unit(h: u32) -> f32 { return (f32(h & 0x00FFFFFFu) + 0.5) / 16777216.0; }
`;

// point sampling: the pixel's centre
export const ARM_POINT = /* wgsl */ `
@fragment fn fsPoint(i: VOut) -> @location(0) vec4f {
  let x = floor(i.uv.x * U.res.x);
  let y = floor(i.uv.y * U.res.y);
  return vec4f(shade(x, y), 1.0);
}
`;

// supersampling: N stratified samples of the pixel's Gaussian, fixed per frame
export const ARM_SSAA = /* wgsl */ `
@fragment fn fsSSAA(i: VOut) -> @location(0) vec4f {
  let x = floor(i.uv.x * U.res.x);
  let y = floor(i.uv.y * U.res.y);
  let n = u32(U.p1.x);
  let side = u32(sqrt(f32(n)) + 0.5);
  let sig = U.p0.x;
  var acc = vec3f(0.0);
  for (var k = 0u; k < n; k++) {
    // a stratified grid in the unit square, the same offsets in every pixel,
    // through Box-Muller to the Gaussian window
    let cx = f32(k % side);
    let cy = f32(k / side);
    let h = hash3(vec3u(k, 7u, 11u));
    let u1 = (cx + unit(h)) / f32(side);
    let u2 = (cy + unit(h * 0x9E3779B1u + 1u)) / f32(side);
    let m = sqrt(-2.0 * log(max(1.0 - u1, 1e-7)));
    let dx = m * cos(TAU * u2);
    let dy = m * sin(TAU * u2);
    acc += shade(x + sig * dx, y + sig * dy);
  }
  return vec4f(acc / f32(n), 1.0);
}
`;

// the sampled reference: N stratified Gaussian samples with a per-frame
// seed, accumulated across frames while the camera rests
export const ARM_REFERENCE = /* wgsl */ `
@group(0) @binding(1) var refPrev: texture_2d<f32>;
@fragment fn fsReference(i: VOut) -> @location(0) vec4f {
  let px = u32(i.uv.x * U.res.x);
  let py = u32(i.uv.y * U.res.y);
  let x = f32(px);
  let y = f32(py);
  let n = u32(U.p1.x);
  let side = u32(sqrt(f32(n)) + 0.5);
  let seed = u32(U.p1.y);
  let sig = U.p0.x;
  var acc = vec3f(0.0);
  for (var k = 0u; k < n; k++) {
    let cx = f32(k % side);
    let cy = f32(k / side);
    let h = hash3(vec3u(px * 4096u + py, k, seed));
    let u1 = (cx + unit(h)) / f32(side);
    let u2 = (cy + unit(h * 0x9E3779B1u + 1u)) / f32(side);
    let m = sqrt(-2.0 * log(max(1.0 - u1, 1e-7)));
    let dx = m * cos(TAU * u2);
    let dy = m * sin(TAU * u2);
    acc += shade(x + sig * dx, y + sig * dy);
  }
  let cur = acc / f32(n);
  if (U.p2.y > 0.5) {
    let prev = textureLoad(refPrev, vec2i(i32(px), i32(py)), 0);
    let count = prev.w + 1.0;
    return vec4f(mix(prev.xyz, cur, 1.0 / count), count);
  }
  return vec4f(cur, 1.0);
}
`;

// temporal AA: one jittered sample a frame, the history reprojected through
// the previous homography, clamped to the current neighbourhood, blended
export const ARM_TAA = /* wgsl */ `
@fragment fn fsTaaSample(i: VOut) -> @location(0) vec4f {
  let x = floor(i.uv.x * U.res.x);
  let y = floor(i.uv.y * U.res.y);
  return vec4f(shade(x + U.p0.z, y + U.p0.w), 1.0);
}
@group(0) @binding(1) var taaCur: texture_2d<f32>;
@group(0) @binding(2) var taaHist: texture_2d<f32>;
fn bilinearHist(xp: f32, yp: f32) -> vec3f {
  let x0 = floor(xp);
  let y0 = floor(yp);
  let fx = xp - x0;
  let fy = yp - y0;
  let W = i32(U.res.x) - 1;
  let H = i32(U.res.y) - 1;
  let ix = clamp(i32(x0), 0, W);
  let iy = clamp(i32(y0), 0, H);
  let ix1 = min(ix + 1, W);
  let iy1 = min(iy + 1, H);
  let c00 = textureLoad(taaHist, vec2i(ix, iy), 0).xyz;
  let c10 = textureLoad(taaHist, vec2i(ix1, iy), 0).xyz;
  let c01 = textureLoad(taaHist, vec2i(ix, iy1), 0).xyz;
  let c11 = textureLoad(taaHist, vec2i(ix1, iy1), 0).xyz;
  return mix(mix(c00, c10, fx), mix(c01, c11, fx), fy);
}
@fragment fn fsTaaResolve(i: VOut) -> @location(0) vec4f {
  let px = i32(i.uv.x * U.res.x);
  let py = i32(i.uv.y * U.res.y);
  let cur = textureLoad(taaCur, vec2i(px, py), 0).xyz;
  // the neighbourhood's bounds
  var lo = cur;
  var hi = cur;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let q = vec2i(clamp(px + dx, 0, i32(U.res.x) - 1), clamp(py + dy, 0, i32(U.res.y) - 1));
      let c = textureLoad(taaCur, q, 0).xyz;
      lo = min(lo, c);
      hi = max(hi, c);
    }
  }
  // reprojection: the pixel's ground point through the previous camera
  let g = ground(f32(px), f32(py));
  var alpha = U.p2.x;
  var hist = cur;
  if (g.d > 0.0) {
    let q = vec3f(g.s, g.t, 1.0);
    let w = dot(U.invP2.xyz, q);
    if (w > 0.0) {
      let xp = dot(U.invP0.xyz, q) / w;
      let yp = dot(U.invP1.xyz, q) / w;
      if (xp >= 0.0 && xp <= U.res.x - 1.0 && yp >= 0.0 && yp <= U.res.y - 1.0) {
        hist = clamp(bilinearHist(xp, yp), lo, hi);
      } else { alpha = 1.0; }
    } else { alpha = 1.0; }
  } else { alpha = 1.0; }
  return vec4f(mix(hist, cur, alpha), 1.0);
}
`;

// the picture as a mipmapped texture, sampled with the analytic footprint
// (the hardware's trilinear and anisotropic filtering)
export const ARM_MIP = /* wgsl */ `
@group(0) @binding(1) var picTex: texture_2d<f32>;
@group(0) @binding(2) var picSamp: sampler;
@fragment fn fsMip(i: VOut) -> @location(0) vec4f {
  let x = floor(i.uv.x * U.res.x);
  let y = floor(i.uv.y * U.res.y);
  let g = ground(x, y);
  if (g.d <= 0.0) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  let period = U.p1.w;
  let p = vec3f(x, y, 1.0);
  let Nu = dot(U.hu.xyz, p);
  let Nv = dot(U.hv.xyz, p);
  let D = g.d;
  let dD = U.hd.xy;
  let gu = (U.hu.xy * D - Nu * dD) / (D * D);
  let gv = (U.hv.xy * D - Nv * dD) / (D * D);
  let uv = vec2f(g.s, g.t) / period;
  let ddx = vec2f(gu.x, gv.x) / period;
  let ddy = vec2f(gu.y, gv.y) / period;
  let P = textureSampleGrad(picTex, picSamp, uv, ddx, ddy).x;
  let scene = u32(U.p1.z);
  let LN = lightingLN();
  var v = LN * P;
  if (scene == 0u) { v += lightingSpec(g.viewer, 50.0); }
  return vec4f(vec3f(v), 1.0);
}
`;

// ours: the kernel module (ours-kernel.wgsl.js) plus this demo's fragment
// entry. The pixel's Gaussian window integrated in closed form. The counts
// u = s / period and v = t / period have jets from the homography; a pixel
// where a count is magnified takes the coverage path (Gaussian probabilities
// of the intervals of the step, the two steps jointly through the conditional
// along the second normal); elsewhere the spectral path: the picture's
// Fourier series over the lattice of recipes k gu + l gv near the origin,
// each term the Gaussian expectation of its quadratic phase in closed form.
export const ARM_OURS = /* wgsl */ `
${OURS_KERNEL}
@fragment fn fsOurs(i: VOut) -> @location(0) vec4f {
  let x = floor(i.uv.x * U.res.x);
  let y = floor(i.uv.y * U.res.y);
  let g = ground(x, y);
  if (g.d <= 0.0) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  let S = U.p0.x * U.p0.x;
  let scene = u32(U.p1.z);
  let period = U.p1.w;
  let J = jetsFromHomography(U.hu.xyz, U.hv.xyz, U.hd.xyz, x, y, period);
  var P = 0.5;
  var regime = 0.0;
  if (scene == 0u) {
    let r = checkerMean(J, S);
    P = r.x;
    regime = r.y;
  } else {
    let r = circlesMean(J, S);
    P = r.x;
    regime = r.y;
  }
  let LN = lightingLN();
  var v = LN * P;
  if (scene == 0u) { v += lightingSpec(g.viewer, 50.0); }
  if (U.p2.z > 0.5) {
    // the regime, for inspection: coverage green, spectral blue
    return vec4f(select(vec3f(0.2, 0.3, 0.9), vec3f(0.2, 0.8, 0.3), regime < 1.5) * (0.5 + 0.5 * v), 1.0);
  }
  return vec4f(vec3f(v), 1.0);
}
`;

// the meters: per workgroup, the sums of squared error of each arm against
// the reference, in linear light and after the 8-bit clamp
export const METERS = /* wgsl */ `
@group(0) @binding(1) var refTex: texture_2d<f32>;
@group(0) @binding(2) var arm0: texture_2d<f32>;
@group(0) @binding(3) var arm1: texture_2d<f32>;
@group(0) @binding(4) var arm2: texture_2d<f32>;
@group(0) @binding(5) var arm3: texture_2d<f32>;
@group(0) @binding(6) var arm4: texture_2d<f32>;
@group(0) @binding(7) var<storage, read_write> partials: array<f32>;
var<workgroup> sh: array<f32, 2560>; // 256 lanes x 5 arms x 2 metrics
fn q8(c: vec3f) -> vec3f { return round(clamp(c, vec3f(0.0), vec3f(1.0)) * 255.0) / 255.0; }
@compute @workgroup_size(16, 16) fn csMeters(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) li: u32, @builtin(workgroup_id) wg: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let inside = gid.x < u32(U.res.x) && gid.y < u32(U.res.y);
  let p = vec2i(i32(gid.x), i32(gid.y));
  var r = vec3f(0.0);
  var a = array<vec3f, 5>(vec3f(0.0), vec3f(0.0), vec3f(0.0), vec3f(0.0), vec3f(0.0));
  if (inside) {
    r = textureLoad(refTex, p, 0).xyz;
    a[0] = textureLoad(arm0, p, 0).xyz;
    a[1] = textureLoad(arm1, p, 0).xyz;
    a[2] = textureLoad(arm2, p, 0).xyz;
    a[3] = textureLoad(arm3, p, 0).xyz;
    a[4] = textureLoad(arm4, p, 0).xyz;
  }
  let r8 = q8(r);
  for (var k = 0u; k < 5u; k++) {
    let e = a[k] - r;
    let e8 = q8(a[k]) - r8;
    sh[li * 10u + k * 2u] = select(0.0, dot(e, e) / 3.0, inside);
    sh[li * 10u + k * 2u + 1u] = select(0.0, dot(e8, e8) / 3.0, inside);
  }
  workgroupBarrier();
  for (var stride = 128u; stride > 0u; stride >>= 1u) {
    if (li < stride) {
      for (var j = 0u; j < 10u; j++) { sh[li * 10u + j] += sh[(li + stride) * 10u + j]; }
    }
    workgroupBarrier();
  }
  if (li == 0u) {
    let base = (wg.y * nwg.x + wg.x) * 10u;
    for (var j = 0u; j < 10u; j++) { partials[base + j] = sh[j]; }
  }
}
`;

// the panes: six arm textures tiled 3 x 2, with an optional magnifier
export const DISPLAY = /* wgsl */ `
@group(0) @binding(1) var t0: texture_2d<f32>;
@group(0) @binding(2) var t1: texture_2d<f32>;
@group(0) @binding(3) var t2: texture_2d<f32>;
@group(0) @binding(4) var t3: texture_2d<f32>;
@group(0) @binding(5) var t4: texture_2d<f32>;
@group(0) @binding(6) var t5: texture_2d<f32>;
struct Disp { zoom: vec4f, mode: vec4f }; // zoom: cx, cy (pixels), factor, on; mode: x = error heat (0/1), y = heat gain
@group(0) @binding(7) var<uniform> Dp: Disp;
fn armLoad(k: u32, p: vec2i) -> vec3f {
  switch (k) {
    case 0u: { return textureLoad(t0, p, 0).xyz; }
    case 1u: { return textureLoad(t1, p, 0).xyz; }
    case 2u: { return textureLoad(t2, p, 0).xyz; }
    case 3u: { return textureLoad(t3, p, 0).xyz; }
    case 4u: { return textureLoad(t4, p, 0).xyz; }
    default: { return textureLoad(t5, p, 0).xyz; }
  }
}
@fragment fn fsDisplay(i: VOut) -> @location(0) vec4f {
  let W = U.res.x;
  let H = U.res.y;
  let fx = i.uv.x * 3.0;
  let fy = i.uv.y * 2.0;
  let col = u32(floor(fx));
  let row = u32(floor(fy));
  let k = min(row * 3u + col, 5u);
  var px = (fx - f32(col)) * W;
  var py = (fy - f32(row)) * H;
  if (Dp.zoom.w > 0.5) {
    // the magnifier: the pane shows a window around the chosen pixel, enlarged
    px = Dp.zoom.x + (px - 0.5 * W) / Dp.zoom.z;
    py = Dp.zoom.y + (py - 0.5 * H) / Dp.zoom.z;
    if (px < 0.0 || py < 0.0 || px >= W || py >= H) { return vec4f(0.1, 0.1, 0.1, 1.0); }
  }
  let p = vec2i(i32(px), i32(py));
  var c = armLoad(k, p);
  if (Dp.mode.x > 0.5 && k < 5u) {
    let r = textureLoad(t5, p, 0).xyz;
    let e = abs(c - r) * Dp.mode.y;
    c = vec3f(e.x, e.y * 0.5, 0.0) + vec3f(0.0, 0.0, 0.0);
    c = vec3f(min(e.x + e.y + e.z, 1.0));
  }
  // a thin border between panes
  let bx = fract(fx);
  let by = fract(fy);
  if (bx < 0.004 || by < 0.006) { c = vec3f(0.25); }
  return vec4f(c, 1.0);
}
`;
