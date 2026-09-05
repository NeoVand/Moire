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

// ours: the pixel's Gaussian window integrated in closed form. The counts
// u = s / period and v = t / period have jets from the homography; a pixel
// where a count is magnified takes the coverage path (Gaussian probabilities
// of the intervals of the step, the two steps jointly through the conditional
// along the second normal); elsewhere the spectral path: the picture's
// Fourier series over the lattice of recipes k gu + l gv near the origin,
// each term the Gaussian expectation of its quadratic phase in closed form.
export const ARM_OURS = /* wgsl */ `
// erf, Abramowitz and Stegun 7.1.26 (|error| < 1.5e-7)
fn erfA(x: f32) -> f32 {
  let s = sign(x);
  let a = abs(x);
  let t = 1.0 / (1.0 + 0.3275911 * a);
  let y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-a * a);
  return s * y;
}
fn Phi(x: f32) -> f32 { return 0.5 * (1.0 + erfA(x * 0.7071067811865476)); }

// E[w(X)], X ~ N(mu, s^2), w = +1 on (n, n + 1/2), -1 on (n + 1/2, n + 1)
fn Ew(mu: f32, s: f32) -> f32 {
  if (s > 1.6) { return 0.0; } // exp(-2 pi^2 s^2) < 1e-22: the step's harmonics are gone
  var acc = 0.0;
  let n0 = floor(mu - 5.5 * s - 1.0);
  let n1 = ceil(mu + 5.5 * s + 1.0);
  var n = n0;
  loop {
    if (n > n1) { break; }
    acc += 2.0 * Phi((n + 0.5 - mu) / s) - Phi((n - mu) / s) - Phi((n + 1.0 - mu) / s);
    n += 1.0;
  }
  return acc;
}

// Gauss-Legendre 8 on [-1, 1]
const GLX = array<f32, 8>(-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498, 0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363);
const GLW = array<f32, 8>(0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620, 0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763);

// E[w(U) w(V)] for jointly Gaussian counts: U = mu + su Z1, V = mv + sv (rho Z1 + sqrt(1 - rho^2) Z2).
// A count with no breakpoint of w within its reach is constant over the
// pixel, so the other's expectation stands alone; when both steps are within
// reach (a corner) the outer integral runs over the count with fewer
// breakpoints, split at them and into panels no wider than 1.2 in z
fn breaks(mu: f32, s: f32) -> f32 {
  // the number of half-integer crossings of mu + s z over |z| < 5.5
  return floor(2.0 * (mu + 5.5 * s)) - ceil(2.0 * (mu - 5.5 * s)) + 1.0;
}
fn wOf(u: f32) -> f32 { return select(-1.0, 1.0, fract(u) < 0.5); }
fn EwwOuter(mu: f32, su: f32, mv: f32, sv: f32, rho: f32) -> f32 {
  let svc = sv * sqrt(max(1.0 - rho * rho, 1e-6));
  let zlo = -5.5;
  let zhi = 5.5;
  let hlo = ceil(2.0 * (mu + su * zlo));
  let hhi = floor(2.0 * (mu + su * zhi));
  var glx = GLX;
  var glw = GLW;
  var acc = 0.0;
  var a = zlo;
  var h = hlo;
  var guard = 0;
  loop {
    var b = zhi;
    if (h <= hhi) { b = (0.5 * h - mu) / su; }
    if (b > a) {
      let wu = wOf(mu + su * 0.5 * (a + b));
      let panels = ceil((b - a) / 1.2);
      let dz = (b - a) / panels;
      var seg = 0.0;
      var q = 0.0;
      loop {
        if (q >= panels) { break; }
        let pa = a + q * dz;
        let half = 0.5 * dz;
        let mid = pa + half;
        for (var k = 0; k < 8; k++) {
          let z = mid + half * glx[k];
          let phi = 0.3989422804014327 * exp(-0.5 * z * z);
          seg += glw[k] * half * phi * Ew(mv + rho * sv * z, svc);
        }
        q += 1.0;
      }
      acc += wu * seg;
    }
    a = max(a, b);
    if (h > hhi) { break; }
    h += 1.0;
    guard += 1;
    if (guard > 64) { break; }
  }
  return acc;
}
fn Eww(mu: f32, su: f32, mv: f32, sv: f32, rho: f32) -> f32 {
  let nu = breaks(mu, su);
  let nv = breaks(mv, sv);
  if (nu <= 0.0 && nv <= 0.0) { return wOf(mu) * wOf(mv); }
  if (nu <= 0.0) { return wOf(mu) * Ew(mv, sv); }
  if (nv <= 0.0) { return wOf(mv) * Ew(mu, su); }
  if (nu <= nv) { return EwwOuter(mu, su, mv, sv, rho); }
  return EwwOuter(mv, sv, mu, su, rho);
}

// Re E[exp(i (phi0 + b . x + x^T Q x / 2))], x ~ N(0, S I): the multiplier
// theorem at second order in closed form
fn multRe(phi0: f32, b: vec2f, q: vec3f, S: f32) -> f32 {
  let tr = q.x + q.z;
  let dt = q.x * q.z - q.y * q.y;
  let disc = sqrt(max(0.25 * tr * tr - dt, 0.0));
  let l1 = 0.5 * tr + disc;
  let l2 = 0.5 * tr - disc;
  let modu = pow((1.0 + S * S * l1 * l1) * (1.0 + S * S * l2 * l2), -0.25);
  let ph = 0.5 * (atan(S * l1) + atan(S * l2));
  // b^T adj(I - i S Q) b / det, adj = [[1 - i S q11, i S q01], [i S q01, 1 - i S q00]]
  let Ar = b.x * b.x + b.y * b.y;
  let Ai = -S * (q.z * b.x * b.x - 2.0 * q.y * b.x * b.y + q.x * b.y * b.y);
  let Dr = 1.0 - S * S * dt;
  let Di = -S * tr;
  let dd = Dr * Dr + Di * Di;
  let Er = -0.5 * S * (Ar * Dr + Ai * Di) / dd;
  let Ei = -0.5 * S * (Ai * Dr - Ar * Di) / dd;
  return modu * exp(Er) * cos(phi0 + ph + Ei);
}

struct Jets { u0: f32, v0: f32, gu: vec2f, gv: vec2f, Hu: vec3f, Hv: vec3f };
fn jetsAt(x: f32, y: f32, period: f32) -> Jets {
  let p = vec3f(x, y, 1.0);
  let Nu = dot(U.hu.xyz, p);
  let Nv = dot(U.hv.xyz, p);
  let D = dot(U.hd.xyz, p);
  let dD = U.hd.xy;
  var J: Jets;
  J.u0 = Nu / D / period;
  J.v0 = Nv / D / period;
  let gu = (U.hu.xy * D - Nu * dD) / (D * D);
  let gv = (U.hv.xy * D - Nv * dD) / (D * D);
  J.gu = gu / period;
  J.gv = gv / period;
  J.Hu = vec3f(-2.0 * dD.x * gu.x / D, -(dD.y * gu.x + dD.x * gu.y) / D, -2.0 * dD.y * gu.y / D) / period;
  J.Hv = vec3f(-2.0 * dD.x * gv.x / D, -(dD.y * gv.x + dD.x * gv.y) / D, -2.0 * dD.y * gv.y / D) / period;
  return J;
}

// the checkerboard's pixel mean: 1/2 + E[w(u) w(v)] / 2
fn checkerMean(J: Jets, S: f32, cut: f32) -> vec2f {
  let sig = sqrt(S);
  // curvature-aware widths and the means' second-order shift
  let fu = sqrt(J.Hu.x * J.Hu.x + 2.0 * J.Hu.y * J.Hu.y + J.Hu.z * J.Hu.z);
  let fv = sqrt(J.Hv.x * J.Hv.x + 2.0 * J.Hv.y * J.Hv.y + J.Hv.z * J.Hv.z);
  let su = sqrt(S * dot(J.gu, J.gu) + 0.5 * S * S * fu * fu);
  let sv = sqrt(S * dot(J.gv, J.gv) + 0.5 * S * S * fv * fv);
  let mu = J.u0 + 0.5 * S * (J.Hu.x + J.Hu.z);
  let mv = J.v0 + 0.5 * S * (J.Hv.x + J.Hv.z);
  if (min(su, sv) < 0.3) {
    // coverage: the magnified count is the outer integral
    let rho = dot(J.gu, J.gv) / max(length(J.gu) * length(J.gv), 1e-12);
    let e = Eww(mu, su, mv, sv, rho);
    return vec2f(0.5 + 0.5 * e, 1.0);
  }
  // spectral: recipes (k, l), both odd, over the lattice k gu + l gv
  var b1 = J.gu;
  var b2 = J.gv;
  var T = mat2x2f(1.0, 0.0, 0.0, 1.0); // (k, l) = T * (m, n)
  for (var it = 0; it < 12; it++) {
    if (dot(b1, b1) > dot(b2, b2)) {
      let tb = b1; b1 = b2; b2 = tb;
      T = mat2x2f(T[1], T[0]);
    }
    let m = round(dot(b1, b2) / max(dot(b1, b1), 1e-30));
    if (m == 0.0) { break; }
    b2 = b2 - m * b1;
    T[1] = T[1] - m * T[0];
  }
  let lam = TAU * (fu + fv) * 8.0;
  let R = min(1.6 * sqrt(1.0 + S * S * lam * lam), 12.0); // cycles per px
  let n1 = length(b1);
  let perp = sqrt(max(dot(b2, b2) - dot(b1, b2) * dot(b1, b2) / dot(b1, b1), 1e-30));
  let nMax = floor(R / perp);
  var acc = 0.5;
  var count = 0.0;
  var n = -nMax;
  loop {
    if (n > nMax) { break; }
    let c = n * b2;
    let mStar = -dot(c, b1) / dot(b1, b1);
    let hw = sqrt(max(R * R - n * n * perp * perp, 0.0)) / n1;
    var m = ceil(mStar - hw);
    let mEnd = floor(mStar + hw);
    loop {
      if (m > mEnd) { break; }
      let kl = T * vec2f(m, n);
      let k = kl.x;
      let l = kl.y;
      let ok = (abs(k - 2.0 * round(0.5 * (k - 1.0)) - 1.0) < 0.5) && (abs(l - 2.0 * round(0.5 * (l - 1.0)) - 1.0) < 0.5);
      if (ok) {
        let coef = -2.0 / (PI * PI * k * l);
        let bb = TAU * (k * J.gu + l * J.gv);
        let qq = TAU * (k * J.Hu + l * J.Hv);
        let phi0 = TAU * (k * J.u0 + l * J.v0);
        acc += coef * multRe(phi0, bb, qq, S);
        count += 1.0;
      }
      m += 1.0;
      if (count > 2048.0) { break; }
    }
    n += 1.0;
    if (count > 2048.0) { break; }
  }
  return vec2f(acc, 2.0);
}

@fragment fn fsOurs(i: VOut) -> @location(0) vec4f {
  let x = floor(i.uv.x * U.res.x);
  let y = floor(i.uv.y * U.res.y);
  let g = ground(x, y);
  if (g.d <= 0.0) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  let S = U.p0.x * U.p0.x;
  let scene = u32(U.p1.z);
  let period = U.p1.w;
  let J = jetsAt(x, y, period);
  var P = 0.5;
  var regime = 0.0;
  if (scene == 0u) {
    let r = checkerMean(J, S, U.p2.w);
    P = r.x;
    regime = r.y;
  } else {
    P = pictureAt(scene, g.s, g.t);
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
