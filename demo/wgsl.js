import { OURS_KERNEL } from './ours-kernel.wgsl.js';
import { OURS_KERNEL_CORE as NEXT_CORE, ripplesWith, RIPPLES_LINE, RIPPLES_SPECTRAL, RIPPLES_LINE_STUB, RIPPLES_SPECTRAL_STUB, MASK_WGSL } from './ours-kernel-next.wgsl.js';
// the frozen kernel is what the collaborator measures; ?kernel=next selects
// the working copy where the cost work happens, and ?ripples=none|line|spectral|all
// bisects the ripples' functions when the GPU compiler fails on them
const params = new URLSearchParams(globalThis.location ? globalThis.location.search : '');
const useNext = params.get('kernel') === 'next';
const ripplesPart = params.get('ripples') || 'all';
const HAS_RIPPLES = useNext && ripplesPart !== 'none';
const HAS_MASK = useNext;
const KERNEL = useNext
  ? NEXT_CORE + (HAS_RIPPLES ? ripplesWith(ripplesPart === 'spectral' ? RIPPLES_LINE_STUB : RIPPLES_LINE, ripplesPart === 'line' ? RIPPLES_SPECTRAL_STUB : RIPPLES_SPECTRAL) : '') + MASK_WGSL
  : OURS_KERNEL;

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
  p3: vec4f,      // x: the mask's stationary coverage (scene 3)
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

// the mask of scene 3: a quasi-periodic field thresholded (the same constants as the kernel's node, kept apart on purpose)
const MASKREF_T0: f32 = 0.3;
const MASKREF_A: vec3f = vec3f(1.0, 0.8, 0.6);
const MASKREF_PH: vec3f = vec3f(0.0, 1.0, 2.0);
const MASKREF_K1: vec2f = vec2f(0.260980704, 0.0807307922); const MASKREF_K2: vec2f = vec2f(-0.0476208137, 0.366518457); const MASKREF_K3: vec2f = vec2f(-0.554610007, 0.136658897);
fn maskRef(s: f32, t: f32) -> f32 {
  let st = vec2f(s, t);
  return MASKREF_A.x * sin(dot(MASKREF_K1, st) + MASKREF_PH.x) + MASKREF_A.y * sin(dot(MASKREF_K2, st) + MASKREF_PH.y) + MASKREF_A.z * sin(dot(MASKREF_K3, st) + MASKREF_PH.z);
}
// the pictures: scene 0 checkerboard, scene 1 circles, scene 3 the mask, on (s, t)
fn pictureAt(scene: u32, s: f32, t: f32) -> f32 {
  if (scene == 3u) { return select(0.0, 1.0, maskRef(s, t) > MASKREF_T0); }
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

// the ripples of Yang and Barnes: height a sin(f r - velocity time), r = hypot(s, t),
// the normal from the height's gradient, the counts displaced by the parallax h viewer.xy
const RIPPLE_A: f32 = 0.3333333333333333;
const RIPPLE_F: f32 = 3.0;
struct Rippled { s: f32, t: f32, normal: vec3f };
fn rippled(s: f32, t: f32, viewer: vec3f) -> Rippled {
  let r = sqrt(s * s + t * t);
  let theta = r * RIPPLE_F;
  let h = RIPPLE_A * sin(theta);
  let rinv = 1.0 / max(r, 1e-9);
  let dhdu = s * RIPPLE_A * RIPPLE_F * rinv * cos(theta);
  let dhdv = t * RIPPLE_A * RIPPLE_F * rinv * cos(theta);
  var o: Rippled;
  o.normal = normalize(vec3f(dhdu, dhdv, 1.0));
  o.s = s + h * viewer.x;
  o.t = t + h * viewer.y;
  return o;
}
fn lightingOn(normal: vec3f, viewer: vec3f, specPow: f32) -> vec2f {
  let LN = max(dot(U.light.xyz, normal), 0.0);
  let R = 2.0 * LN * normal - U.light.xyz;
  let spec = pow(max(dot(R, viewer), 0.0), specPow);
  return vec2f(LN, spec);
}
// the shader's colour at a continuous pixel position: the point sample;
// detail = 1 is the material, detail = 0 its predictor (scenes 4 and 5: the
// checkerboard without its noise layer), the difference being the residual
// the history arm accumulates
fn shade(x: f32, y: f32) -> vec3f { return shadeD(x, y, 1.0); }
fn shadeD(x: f32, y: f32, detail: f32) -> vec3f {
  let g = ground(x, y);
  if (g.d <= 0.0) { return vec3f(0.0); }
  let scene = u32(U.p1.z);
  if (scene == 2u) {
    let rp = rippled(g.s, g.t, g.viewer);
    let P = pictureAt(0u, rp.s, rp.t);
    let l = lightingOn(rp.normal, g.viewer, 50.0);
    return vec3f(l.x * P + l.y);
  }
  if (scene >= 4u) {
    // 4: the checkerboard times (1 + m T), the correlated case; 5: the checkerboard plus m T
    let P4 = pictureAt(0u, g.s, g.t);
    let LN4 = lightingLN();
    let m = U.p3.y * detail;
    let T = detailT(g.s, g.t);
    let base = select(LN4 * (P4 + m * T), LN4 * P4 * (1.0 + m * T), scene == 4u);
    return vec3f(base + lightingSpec(g.viewer, 50.0));
  }
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

// the detail layer of scenes 4 and 5: value noise on the plane, lattice
// spacing U.p3.w plane units, hashed values in [-1, 1] on a 64-cell period,
// quintic interpolation; the kernel has no node for it, so it stands in for
// the parts of a material a product leaves to the engine
fn latticeVal(i: i32, j: i32) -> f32 {
  return 2.0 * unit(hash3(vec3u(u32(i & 63), u32(j & 63), 77u))) - 1.0;
}
fn detailT(s: f32, t: f32) -> f32 {
  let u = s / U.p3.w;
  let v = t / U.p3.w;
  let i0 = floor(u);
  let j0 = floor(v);
  let fu = u - i0;
  let fv = v - j0;
  let wu = fu * fu * fu * (fu * (fu * 6.0 - 15.0) + 10.0);
  let wv = fv * fv * fv * (fv * (fv * 6.0 - 15.0) + 10.0);
  let i = i32(i0);
  let j = i32(j0);
  let a = latticeVal(i, j);
  let b = latticeVal(i + 1, j);
  let c = latticeVal(i, j + 1);
  let d = latticeVal(i + 1, j + 1);
  return mix(mix(a, b, wu), mix(c, d, wu), wv);
}
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
// the previous homography, clamped to the current neighbourhood, blended.
// The residual arm runs the same machinery on the residual f - a of the
// material against its predictor a (shadeD with detail 0), at the same jitter
// and with its own blend weight U.p3.z; the predictor's exact pixel mean
// (the ours arm) is added back afterwards, so nothing of it enters the history
export const ARM_TAA = /* wgsl */ `
@fragment fn fsTaaSample(i: VOut) -> @location(0) vec4f {
  let x = floor(i.uv.x * U.res.x);
  let y = floor(i.uv.y * U.res.y);
  return vec4f(shade(x + U.p0.z, y + U.p0.w), 1.0);
}
@fragment fn fsResidualSample(i: VOut) -> @location(0) vec4f {
  let x = floor(i.uv.x * U.res.x) + U.p0.z;
  let y = floor(i.uv.y * U.res.y) + U.p0.w;
  return vec4f(shadeD(x, y, 1.0) - shadeD(x, y, 0.0), 1.0);
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
fn resolveAt(px: i32, py: i32, alpha0: f32) -> vec3f {
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
  var alpha = alpha0;
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
  return mix(hist, cur, alpha);
}
@fragment fn fsTaaResolve(i: VOut) -> @location(0) vec4f {
  return vec4f(resolveAt(i32(i.uv.x * U.res.x), i32(i.uv.y * U.res.y), U.p2.x), 1.0);
}
@fragment fn fsResidualResolve(i: VOut) -> @location(0) vec4f {
  return vec4f(resolveAt(i32(i.uv.x * U.res.x), i32(i.uv.y * U.res.y), U.p3.z), 1.0);
}
`;

// the residual arm's output: the predictor's exact pixel mean plus the residual's history
export const ARM_COMBO = /* wgsl */ `
@group(0) @binding(1) var comboA: texture_2d<f32>;
@group(0) @binding(2) var comboB: texture_2d<f32>;
@fragment fn fsCombine(i: VOut) -> @location(0) vec4f {
  let p = vec2i(i32(i.uv.x * U.res.x), i32(i.uv.y * U.res.y));
  return vec4f(textureLoad(comboA, p, 0).xyz + textureLoad(comboB, p, 0).xyz, 1.0);
}
`;

// the picture as a mipmapped texture, sampled with the analytic footprint
// (the hardware's trilinear and anisotropic filtering)
export const ARM_MIP = /* wgsl */ `
@group(0) @binding(1) var picTex: texture_2d<f32>;
@group(0) @binding(2) var picSamp: sampler;
@group(0) @binding(3) var detailTex: texture_2d<f32>; // the detail layer, 64 lattice cells a tile, stored as (T + 1) / 2
@fragment fn fsMip(i: VOut) -> @location(0) vec4f {
  let x = floor(i.uv.x * U.res.x);
  let y = floor(i.uv.y * U.res.y);
  let g = ground(x, y);
  if (g.d <= 0.0) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  // scene 3 has no period: its texture holds 1024 plane units and repeats beyond them
  let period = select(U.p1.w, 1024.0, u32(U.p1.z) == 3u);
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
  let scene = u32(U.p1.z);
  if (scene == 2u) {
    // a game's route: parallax-displaced coordinates, the texture's footprint from the plane, the normal map at the centre
    let rp = rippled(g.s, g.t, g.viewer);
    let P2 = textureSampleGrad(picTex, picSamp, vec2f(rp.s, rp.t) / period, ddx, ddy).x;
    let l = lightingOn(rp.normal, g.viewer, 50.0);
    return vec4f(vec3f(l.x * P2 + l.y), 1.0);
  }
  let P = textureSampleGrad(picTex, picSamp, uv, ddx, ddy).x;
  let LN = lightingLN();
  if (scene >= 4u) {
    // a game's route for a detail layer: the second texture sampled with its own footprint, the product of the two filtered values
    let Ld = U.p3.w * 64.0;
    let T2 = 2.0 * textureSampleGrad(detailTex, picSamp, vec2f(g.s, g.t) / Ld, ddx * period / Ld, ddy * period / Ld).x - 1.0;
    let m = U.p3.y;
    let vd = select(LN * (P + m * T2), LN * P * (1.0 + m * T2), scene == 4u) + lightingSpec(g.viewer, 50.0);
    return vec4f(vec3f(vd), 1.0);
  }
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
// the work counter: expensive calls a pixel (mode 6 shows it); the next kernel declares its own
${useNext ? '' : 'var<private> WORK: f32 = 0.0;'}
${KERNEL}
@fragment fn fsOurs(i: VOut) -> @location(0) vec4f {
  let x = floor(i.uv.x * U.res.x);
  let y = floor(i.uv.y * U.res.y);
  let g = ground(x, y);
  if (g.d <= 0.0) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  let S = U.p0.x * U.p0.x;
  // scenes 4 and 5 take the checkerboard's path: the kernel integrates the predictor, the residual arm adds the rest
  let scene = select(u32(U.p1.z), 0u, u32(U.p1.z) >= 4u);
  let period = U.p1.w;
  let J = jetsFromHomography(U.hu.xyz, U.hv.xyz, U.hd.xyz, x, y, period);
  var P = 0.5;
  var regime = 0.0;
  let mode = u32(U.p2.w);
  if (scene == 3u) {
    ${HAS_MASK ? 'let mr = maskMeanHMode(U.hu.xyz, U.hv.xyz, U.hd.xyz, x, y, period, S, U.p3.x, mode);' : 'let mr = vec2f(0.5, 4.0); // this kernel has no mask entry'}
    if (mode == 6u) { return vec4f(vec3f(WORK / 256.0), 1.0); }
    let vm = lightingLN() * mr.x;
    if (U.p2.z > 0.5) {
      var tint3 = vec3f(0.2, 0.3, 0.9);
      if (mr.y < 1.5) { tint3 = vec3f(0.2, 0.8, 0.3); }
      if (mr.y > 3.5) { tint3 = vec3f(0.9, 0.2, 0.9); }
      return vec4f(tint3 * (0.5 + 0.5 * vm), 1.0);
    }
    return vec4f(vec3f(vm), 1.0);
  }
  if (scene == 2u) {
    ${HAS_RIPPLES ? 'let rr = ripplesMeanHMode(U.hu.xyz, U.hv.xyz, U.hd.xyz, x, y, period, S, g.viewer, U.light.xyz, mode);' : 'let rr = vec2f(0.5, 4.0); // this kernel has no ripples entry'}
    if (mode == 6u) { return vec4f(vec3f(WORK), 1.0); }
    if (U.p2.z > 0.5) {
      var tint2 = vec3f(0.2, 0.3, 0.9);
      if (rr.y < 1.5) { tint2 = vec3f(0.2, 0.8, 0.3); }
      if (rr.y > 3.5) { tint2 = vec3f(0.9, 0.2, 0.9); }
      return vec4f(tint2 * (0.5 + 0.5 * rr.x), 1.0);
    }
    return vec4f(vec3f(rr.x), 1.0);
  }
  // timing diagnostics through p2.w: 1 runs the coverage path only (the
  // spectral pixels return the mean), 2 the spectral path only
  if (mode == 0u || mode >= 4u) {
    // the homography entries: exact under the guard
    var r = vec2f(0.5, 0.0);
    if (scene == 0u) { r = checkerMeanHMode(U.hu.xyz, U.hv.xyz, U.hd.xyz, x, y, period, S, mode); }
    else { r = circlesMeanHMode(U.hu.xyz, U.hv.xyz, U.hd.xyz, x, y, period, S, mode); }
    P = r.x;
    regime = r.y;
  } else if (scene == 0u) {
    let r = checkerMeanMode(J, S, mode);
    P = r.x;
    regime = r.y;
  } else {
    let r = circlesMeanMode(J, S, mode);
    P = r.x;
    regime = r.y;
  }
  let LN = lightingLN();
  var v = LN * P;
  if (scene == 0u) { v += lightingSpec(g.viewer, 50.0); }
  if (mode == 6u) {
    // the work count as a grey level: 256 expensive calls saturate
    return vec4f(vec3f(WORK), 1.0);
  }
  if (U.p2.z > 0.5) {
    // the regime, for inspection: coverage green, spectral blue
    var tint = vec3f(0.2, 0.3, 0.9);
    if (regime < 1.5) { tint = vec3f(0.2, 0.8, 0.3); }
    if (regime > 2.5) { tint = vec3f(0.9, 0.3, 0.2); }
    if (regime > 3.5) { tint = vec3f(0.9, 0.2, 0.9); }
    return vec4f(tint * (0.5 + 0.5 * v), 1.0);
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
@group(0) @binding(7) var arm5: texture_2d<f32>;
@group(0) @binding(8) var<storage, read_write> partials: array<f32>;
var<workgroup> sh: array<f32, 3072>; // 256 lanes x 6 arms x 2 metrics
fn q8(c: vec3f) -> vec3f { return round(clamp(c, vec3f(0.0), vec3f(1.0)) * 255.0) / 255.0; }
@compute @workgroup_size(16, 16) fn csMeters(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) li: u32, @builtin(workgroup_id) wg: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let inside = gid.x < u32(U.res.x) && gid.y < u32(U.res.y);
  let p = vec2i(i32(gid.x), i32(gid.y));
  var r = vec3f(0.0);
  var a = array<vec3f, 6>(vec3f(0.0), vec3f(0.0), vec3f(0.0), vec3f(0.0), vec3f(0.0), vec3f(0.0));
  if (inside) {
    r = textureLoad(refTex, p, 0).xyz;
    a[0] = textureLoad(arm0, p, 0).xyz;
    a[1] = textureLoad(arm1, p, 0).xyz;
    a[2] = textureLoad(arm2, p, 0).xyz;
    a[3] = textureLoad(arm3, p, 0).xyz;
    a[4] = textureLoad(arm4, p, 0).xyz;
    a[5] = textureLoad(arm5, p, 0).xyz;
  }
  let r8 = q8(r);
  for (var k = 0u; k < 6u; k++) {
    let e = a[k] - r;
    let e8 = q8(a[k]) - r8;
    sh[li * 12u + k * 2u] = select(0.0, dot(e, e) / 3.0, inside);
    sh[li * 12u + k * 2u + 1u] = select(0.0, dot(e8, e8) / 3.0, inside);
  }
  workgroupBarrier();
  for (var stride = 128u; stride > 0u; stride >>= 1u) {
    if (li < stride) {
      for (var j = 0u; j < 12u; j++) { sh[li * 12u + j] += sh[(li + stride) * 12u + j]; }
    }
    workgroupBarrier();
  }
  if (li == 0u) {
    let base = (wg.y * nwg.x + wg.x) * 12u;
    for (var j = 0u; j < 12u; j++) { partials[base + j] = sh[j]; }
  }
}
`;

// the panes: eight textures tiled 4 x 2: point, SSAA, TAA, mip; ours, the
// residual arm, the residual history itself (on mid grey), the reference
export const DISPLAY = /* wgsl */ `
@group(0) @binding(1) var t0: texture_2d<f32>;
@group(0) @binding(2) var t1: texture_2d<f32>;
@group(0) @binding(3) var t2: texture_2d<f32>;
@group(0) @binding(4) var t3: texture_2d<f32>;
@group(0) @binding(5) var t4: texture_2d<f32>;
@group(0) @binding(6) var t5: texture_2d<f32>;
@group(0) @binding(7) var t6: texture_2d<f32>;
@group(0) @binding(8) var t7: texture_2d<f32>;
struct Disp { zoom: vec4f, mode: vec4f }; // zoom: cx, cy (pixels), factor, on; mode: x = error heat (0/1), y = heat gain
@group(0) @binding(9) var<uniform> Dp: Disp;
fn armLoad(k: u32, p: vec2i) -> vec3f {
  switch (k) {
    case 0u: { return textureLoad(t0, p, 0).xyz; }
    case 1u: { return textureLoad(t1, p, 0).xyz; }
    case 2u: { return textureLoad(t2, p, 0).xyz; }
    case 3u: { return textureLoad(t3, p, 0).xyz; }
    case 4u: { return textureLoad(t4, p, 0).xyz; }
    case 5u: { return textureLoad(t5, p, 0).xyz; }
    case 6u: { return vec3f(0.5) + textureLoad(t6, p, 0).xyz; }
    default: { return textureLoad(t7, p, 0).xyz; }
  }
}
@fragment fn fsDisplay(i: VOut) -> @location(0) vec4f {
  let W = U.res.x;
  let H = U.res.y;
  let fx = i.uv.x * 4.0;
  let fy = i.uv.y * 2.0;
  let col = u32(floor(fx));
  let row = u32(floor(fy));
  let k = min(row * 4u + col, 7u);
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
  if (Dp.mode.x > 0.5 && k < 6u) {
    let r = textureLoad(t7, p, 0).xyz;
    let e = abs(c - r) * Dp.mode.y;
    c = vec3f(min(e.x + e.y + e.z, 1.0));
  }
  // a thin border between panes
  let bx = fract(fx);
  let by = fract(fy);
  if (bx < 0.004 || by < 0.006) { c = vec3f(0.25); }
  return vec4f(c, 1.0);
}
`;
