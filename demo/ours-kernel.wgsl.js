// The kernel of "ours" for the checkerboard: the pixel's Gaussian window
// integrated in closed form over the picture's structure, as a WGSL module
// with no bindings and no uniforms, so that any harness can include it.
//
// Contract (see paper/reviews/2026-09-05-integral-compiler/author-reply/REPLY-6.md
// and the bridge message #2):
//   struct Jets { u0, v0: f32; gu, gv: vec2f; Hu, Hv: vec3f }
//     the two counts in periods, gradients in periods per pixel, Hessians
//     (xx, xy, yy) in periods per pixel squared, at the pixel's centre in
//     the caller's convention
//   fn jetsFromHomography(hu, hv, hd: vec3f, x, y, period: f32) -> Jets
//     exact jets from the homography numerators (u, v, d)
//   fn checkerMean(J: Jets, S: f32) -> vec2f
//     .x the pixel mean of the unit checkerboard ([fract(u) >= 1/2] xor
//     [fract(v) >= 1/2]) under the isotropic Gaussian window of variance S
//     pixels squared; .y the regime, 1 coverage, 2 spectral
// Domain: the checkerboard at any magnification, curvature to second order.
// Not in it: the ground/sky edge or any silhouette, the compiler's exact
// depth conditioning, certified whole-image bounds. The spectral
// enumeration is capped at 2048 lattice points a pixel.
// Requires the constants TAU and PI in scope.
export const OURS_KERNEL = /* wgsl */ `
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
// exact jets of the two counts from a homography: (Nu, Nv, D) = (hu, hv, hd) . (x, y, 1),
// counts (Nu, Nv) / D / period; the caller's pixel-centre convention is in (x, y)
fn jetsFromHomography(hu: vec3f, hv: vec3f, hd: vec3f, x: f32, y: f32, period: f32) -> Jets {
  let p = vec3f(x, y, 1.0);
  let Nu = dot(hu, p);
  let Nv = dot(hv, p);
  let D = dot(hd, p);
  let dD = hd.xy;
  var J: Jets;
  J.u0 = Nu / D / period;
  J.v0 = Nv / D / period;
  let gu = (hu.xy * D - Nu * dD) / (D * D);
  let gv = (hv.xy * D - Nv * dD) / (D * D);
  J.gu = gu / period;
  J.gv = gv / period;
  J.Hu = vec3f(-2.0 * dD.x * gu.x / D, -(dD.y * gu.x + dD.x * gu.y) / D, -2.0 * dD.y * gu.y / D) / period;
  J.Hv = vec3f(-2.0 * dD.x * gv.x / D, -(dD.y * gv.x + dD.x * gv.y) / D, -2.0 * dD.y * gv.y / D) / period;
  return J;
}

// the checkerboard's pixel mean: 1/2 + E[w(u) w(v)] / 2
fn checkerMean(J: Jets, S: f32) -> vec2f {
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

`;
