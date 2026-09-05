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
//     .x the pixel mean of the unit checkerboard, white where the two
//     half-period predicates [fract(u) >= 1/2] and [fract(v) >= 1/2] are
//     equal (xnor: ss tt + (1 - ss)(1 - tt), the Yang-Barnes picture),
//     under the isotropic Gaussian window of variance S pixels squared;
//     .y the regime, 1 coverage, 2 spectral. Both branches compute
//     1/2 + E[w(u) w(v)] / 2 with w = +1 where fract < 1/2, so the
//     parity is the same in the coverage sum and the Fourier series
//   The jets are ratios of the numerators, so the sign of D does not
//   matter to the kernel; the caller decides ground against sky.
//   fn circlesMean(J: Jets, S: f32) -> vec2f
//     the same for the circles picture: the disc of radius 5/12 cell at
//     the cell's centre (Yang-Barnes: radius 25/3, gap 5/3, cell 20), the
//     counts in cells; coverage of the disc's quadratic argument in its
//     Hessian eigenframe where at most a few discs are within reach, the
//     Fourier series with J1 coefficients over the reduced lattice elsewhere
//   fn checkerMeanH(hu, hv, hd: vec3f, x, y, period, S: f32) -> vec2f
//   fn circlesMeanH(hu, hv, hd: vec3f, x, y, period, S: f32) -> vec2f
//     the same pictures on a homography, exact where the pixel's footprint
//     keeps the denominator positive: a checker edge pulls back to a line in
//     screen space (normal g + delta grad(D)/D), so the coverage is normal
//     distribution functions of signed distances and the joint of two edges
//     a bivariate normal with the two edge normals' cosine; a disc pulls
//     back to a conic, an exact quadratic in screen space, integrated by
//     quadRegion. Beyond the guard (the denominator within 5.5 sigma of
//     zero, or more than 5 edges a count or 9 discs in reach) the spectral
//     path with the second-order model. These are the entry points for a
//     plane under a pinhole camera; the Jets entries are for counts whose
//     jets come from elsewhere.
// Domain: the checkerboard and the circles at any magnification; the
// homography entries are exact under the guard, the Jets entries carry the
// counts to second order.
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
fn checkerMean(J: Jets, S: f32) -> vec2f { return checkerMeanMode(J, S, 0u); }
// mode 1: the coverage path only (spectral pixels return the mean), mode 2:
// the spectral path only; for timing the two paths apart
fn checkerMeanMode(J: Jets, S: f32, mode: u32) -> vec2f {
  let sig = sqrt(S);
  // curvature-aware widths and the means' second-order shift
  let fu = sqrt(J.Hu.x * J.Hu.x + 2.0 * J.Hu.y * J.Hu.y + J.Hu.z * J.Hu.z);
  let fv = sqrt(J.Hv.x * J.Hv.x + 2.0 * J.Hv.y * J.Hv.y + J.Hv.z * J.Hv.z);
  let su = sqrt(S * dot(J.gu, J.gu) + 0.5 * S * S * fu * fu);
  let sv = sqrt(S * dot(J.gv, J.gv) + 0.5 * S * S * fv * fv);
  let mu = J.u0 + 0.5 * S * (J.Hu.x + J.Hu.z);
  let mv = J.v0 + 0.5 * S * (J.Hv.x + J.Hv.z);
  if (min(su, sv) < 0.3 && mode != 3u) {
    if (mode == 2u) { return vec2f(0.5, 1.0); }
    // coverage: the magnified count is the outer integral
    let rho = dot(J.gu, J.gv) / max(length(J.gu) * length(J.gv), 1e-12);
    let e = Eww(mu, su, mv, sv, rho);
    return vec2f(0.5 + 0.5 * e, 1.0);
  }
  if (mode == 1u) { return vec2f(0.5, 2.0); }
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


// ---------------------------------------------------------------------------
// circles
// ---------------------------------------------------------------------------
const DISC_R: f32 = 0.4166666666666667; // 25/3 over the cell 20

// J1(x)/x, the disc's coefficient shape (Numerical Recipes rational forms, |err| ~ 1e-8)
fn j1overx(x: f32) -> f32 {
  let ax = abs(x);
  if (ax < 1e-3) { return 0.5 - x * x / 16.0; }
  if (ax < 8.0) {
    let y = x * x;
    let num = 72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * (-30.16036606)))));
    let den = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return num / den; // J1(x) = x * num / den
  }
  let z = 8.0 / ax;
  let y = z * z;
  let xx = ax - 2.356194491;
  let p1 = 1.0 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * (-0.240337019e-6))));
  let p2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  let j1 = sqrt(0.636619772 / ax) * (cos(xx) * p1 - z * sin(xx) * p2);
  return j1 / ax; // even in x
}

// P(q(X) <= 0) for X ~ N(0, S I) and q(x) = a0 + g . x + x^T H x / 2: the
// quadratic region in the Hessian's eigenframe, the inner coordinate the
// larger eigenvalue's (the interval between the roots of a quadratic), the
// outer integrated by Gauss-Legendre 8 on panels of 1.2 sigma split where the
// discriminant changes sign
fn quadCoverage(a0: f32, g: vec2f, H: vec3f, S: f32) -> f32 {
  let sig = sqrt(S);
  let tr = H.x + H.z;
  let dt = H.x * H.z - H.y * H.y;
  let disc = sqrt(max(0.25 * tr * tr - dt, 0.0));
  var l1 = 0.5 * tr + disc; // eigenvalues
  var l2 = 0.5 * tr - disc;
  // eigenvector of l1
  var e1 = vec2f(1.0, 0.0);
  if (abs(H.y) > 1e-12) { e1 = normalize(vec2f(l1 - H.z, H.y)); }
  else if (H.z > H.x) { e1 = vec2f(0.0, 1.0); }
  var e2 = vec2f(-e1.y, e1.x);
  // the inner coordinate is the one with the larger |eigenvalue|
  var lin = l1; var lout = l2; var ein = e1; var eout = e2;
  if (abs(l2) > abs(l1)) { lin = l2; lout = l1; ein = e2; eout = e1; }
  let gin = dot(g, ein);
  let gout = dot(g, eout);
  if (abs(lin) < 1e-9) {
    // affine region: a half plane
    let gn = length(g);
    if (gn < 1e-12) { return select(0.0, 1.0, a0 <= 0.0); }
    return Phi(-a0 / (sig * gn));
  }
  // for outer coordinate t: c(t) = a0 + gout t + lout t^2 / 2; inner quadratic lin/2 y^2 + gin y + c(t) <= 0
  // discriminant D(t) = gin^2 - 2 lin c(t): a quadratic in t; its sign changes are the panel cuts
  let A = -lin * lout;      // coefficient of t^2 in D
  let B = -2.0 * lin * gout; // of t
  let C = gin * gin - 2.0 * lin * a0;
  var cuts = array<f32, 4>(-5.5 * sig, 5.5 * sig, 5.5 * sig, 5.5 * sig);
  var ncut = 2;
  if (abs(A) > 1e-12) {
    let dd = B * B - 4.0 * A * C;
    if (dd > 0.0) {
      let sq = sqrt(dd);
      let r1 = (-B - sq) / (2.0 * A);
      let r2 = (-B + sq) / (2.0 * A);
      let lo = min(r1, r2);
      let hi = max(r1, r2);
      if (lo > -5.5 * sig && lo < 5.5 * sig) { cuts[ncut] = lo; ncut += 1; }
      if (hi > -5.5 * sig && hi < 5.5 * sig) { cuts[ncut] = hi; ncut += 1; }
    }
  } else if (abs(B) > 1e-12) {
    let r = -C / B;
    if (r > -5.5 * sig && r < 5.5 * sig) { cuts[ncut] = r; ncut += 1; }
  }
  // sort the cuts (at most 4)
  for (var i = 0; i < 4; i++) { for (var j = i + 1; j < 4; j++) { if (cuts[j] < cuts[i]) { let t = cuts[i]; cuts[i] = cuts[j]; cuts[j] = t; } } }
  var glx = GLX;
  var glw = GLW;
  var acc = 0.0;
  for (var seg = 0; seg < 3; seg++) {
    let a = cuts[seg];
    let b = cuts[seg + 1];
    if (b - a < 1e-9) { continue; }
    let panels = ceil((b - a) / (1.2 * sig));
    let dz = (b - a) / panels;
    var q = 0.0;
    loop {
      if (q >= panels) { break; }
      let pa = a + q * dz;
      let half = 0.5 * dz;
      let mid = pa + half;
      for (var k = 0; k < 8; k++) {
        let t = mid + half * glx[k];
        let phi = 0.3989422804014327 * exp(-0.5 * t * t / S) / sig;
        let c = a0 + gout * t + 0.5 * lout * t * t;
        let D = gin * gin - 2.0 * lin * c;
        var p = 0.0;
        if (D > 0.0) {
          let sq = sqrt(D);
          let y1 = (-gin - sq) / lin;
          let y2 = (-gin + sq) / lin;
          let lo = min(y1, y2);
          let hi = max(y1, y2);
          if (lin > 0.0) { p = Phi(hi / sig) - Phi(lo / sig); }
          else { p = 1.0 - (Phi(hi / sig) - Phi(lo / sig)); }
        } else if (lin < 0.0) { p = 1.0; }
        acc += glw[k] * half * phi * p;
      }
      q += 1.0;
    }
  }
  return acc;
}

// the circles' pixel mean: 1/2 + ... no: the disc indicator's expectation
fn circlesMean(J: Jets, S: f32) -> vec2f { return circlesMeanMode(J, S, 0u); }
fn circlesMeanMode(J: Jets, S: f32, mode: u32) -> vec2f {
  let sig = sqrt(S);
  let gmax = max(length(J.gu), length(J.gv));
  if (gmax < 0.15 && mode != 3u) {
    if (mode == 2u) { return vec2f(0.5454, 1.0); }
    // coverage: the discs whose cell is within reach; each region's
    // argument (u - cu)^2 + (v - cv)^2 - rho^2 as a quadratic in the pixel
    let reach = 3.0 * sig * gmax + DISC_R;
    let nu0 = floor(J.u0 - reach);
    let nu1 = floor(J.u0 + reach);
    let nv0 = floor(J.v0 - reach);
    let nv1 = floor(J.v0 + reach);
    var acc = 0.0;
    var nu = nu0;
    loop {
      if (nu > nu1) { break; }
      var nv = nv0;
      loop {
        if (nv > nv1) { break; }
        let du = J.u0 - (nu + 0.5);
        let dv = J.v0 - (nv + 0.5);
        // is the disc within reach of the pixel at all
        let dist = sqrt(du * du + dv * dv);
        if (dist - DISC_R < 3.5 * sig * gmax + 1e-6) {
          let a0 = du * du + dv * dv - DISC_R * DISC_R;
          let g = 2.0 * du * J.gu + 2.0 * dv * J.gv;
          let H = vec3f(
            2.0 * (J.gu.x * J.gu.x + J.gv.x * J.gv.x) + 2.0 * du * J.Hu.x + 2.0 * dv * J.Hv.x,
            2.0 * (J.gu.x * J.gu.y + J.gv.x * J.gv.y) + 2.0 * du * J.Hu.y + 2.0 * dv * J.Hv.y,
            2.0 * (J.gu.y * J.gu.y + J.gv.y * J.gv.y) + 2.0 * du * J.Hu.z + 2.0 * dv * J.Hv.z);
          acc += quadCoverage(a0, g, H, S);
        }
        nv += 1.0;
      }
      nu += 1.0;
    }
    return vec2f(acc, 1.0);
  }
  if (mode == 1u) { return vec2f(0.5454, 2.0); }
  // spectral: the disc's series over the reduced lattice, coefficient
  // (-1)^(k + l) rho J1(2 pi rho |kappa|) / |kappa|, the DC term pi rho^2
  var b1 = J.gu;
  var b2 = J.gv;
  var T = mat2x2f(1.0, 0.0, 0.0, 1.0);
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
  let fu = sqrt(J.Hu.x * J.Hu.x + 2.0 * J.Hu.y * J.Hu.y + J.Hu.z * J.Hu.z);
  let fv = sqrt(J.Hv.x * J.Hv.x + 2.0 * J.Hv.y * J.Hv.y + J.Hv.z * J.Hv.z);
  let lam = TAU * (fu + fv) * 8.0;
  let R = min(1.6 * sqrt(1.0 + S * S * lam * lam), 12.0);
  let n1 = length(b1);
  let perp = sqrt(max(dot(b2, b2) - dot(b1, b2) * dot(b1, b2) / dot(b1, b1), 1e-30));
  let nMax = floor(R / perp);
  var acc = 0.0;
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
      let kap = TAU * DISC_R * sqrt(k * k + l * l);
      // rho J1(2 pi rho kappa)/kappa = TAU rho^2 * (J1(x)/x) with x = 2 pi rho kappa
      var coef = TAU * DISC_R * DISC_R * j1overx(kap);
      let parity = k + l - 2.0 * floor(0.5 * (k + l));
      if (parity > 0.5) { coef = -coef; }
      let bb = TAU * (k * J.gu + l * J.gv);
      let qq = TAU * (k * J.Hu + l * J.Hv);
      let phi0 = TAU * (k * J.u0 + l * J.v0);
      acc += coef * multRe(phi0, bb, qq, S);
      count += 1.0;
      m += 1.0;
      if (count > 2048.0) { break; }
    }
    n += 1.0;
    if (count > 2048.0) { break; }
  }
  return vec2f(acc, 2.0);
}

// ---------------------------------------------------------------------------
// exact regions: a quadratic region under the pixel's Gaussian, and the
// bivariate normal for the joint of two half-planes. The quadrature sums are
// unrolled at module build time: a dynamically indexed local array lives in
// thread memory on the GPU, and these loops are the kernel's inner cost.
// ---------------------------------------------------------------------------
` + unrolledSection() + `

// ---------------------------------------------------------------------------
// the homography entry points
// ---------------------------------------------------------------------------
// the edge list of a rational-linear count is not stored: the edges are
// re-derived per pair from the half-integer index h, u(X) - b =
// (delta + (g + delta r) . X) / (1 + r . X), b = h / 2
struct EdgeRange { hlo: f32, hhi: f32, low: f32, ok: bool };
fn edgeRange(u0: f32, g: vec2f, r: vec2f, sig: f32) -> EdgeRange {
  var E: EdgeRange;
  E.ok = true;
  E.low = wOf(u0);
  E.hlo = 1.0;
  E.hhi = 0.0;
  let L = 5.5;
  let denom = 1.0 - L * sig * length(r);
  if (denom <= 0.05) { E.ok = false; return E; }
  let reach = L * sig * length(g) / denom;
  let hlo = ceil(2.0 * (u0 - reach));
  let hhi = floor(2.0 * (u0 + reach));
  if (hhi - hlo > 9.0) { E.ok = false; return E; }
  // the edges actually within reach, and the lowest of them
  var count = 0.0;
  var bmin = 1e30;
  var h = hlo;
  var first = 1e30;
  var last = -1e30;
  loop {
    if (h > hhi) { break; }
    let b = 0.5 * h;
    let delta = u0 - b;
    let n = g + delta * r;
    let dist = delta / max(length(n), 1e-30);
    if (abs(dist) < L * sig) {
      count += 1.0;
      bmin = min(bmin, b);
      first = min(first, h);
      last = max(last, h);
    }
    h += 1.0;
  }
  if (count > 5.0) { E.ok = false; return E; }
  if (count > 0.0) { E.low = wOf(bmin - 1e-6); E.hlo = first; E.hhi = last; }
  return E;
}
fn checkerMeanH(hu: vec3f, hv: vec3f, hd: vec3f, x: f32, y: f32, period: f32, S: f32) -> vec2f { return checkerMeanHMode(hu, hv, hd, x, y, period, S, 0u); }
// mode 4: the exact part only (the fallback returns the mean), mode 5: the fallback only; for timing
fn checkerMeanHMode(hu: vec3f, hv: vec3f, hd: vec3f, x: f32, y: f32, period: f32, S: f32, mode: u32) -> vec2f {
  let sig = sqrt(S);
  let L = 5.5;
  let p = vec3f(x, y, 1.0);
  let Nu = dot(hu, p);
  let Nv = dot(hv, p);
  let D = dot(hd, p);
  let dD = hd.xy;
  let r = dD / D;
  let u0 = Nu / D / period;
  let v0 = Nv / D / period;
  let gu = (hu.xy * D - Nu * dD) / (D * D) / period;
  let gv = (hv.xy * D - Nv * dD) / (D * D) / period;
  let eu = edgeRange(u0, gu, r, sig);
  let ev = edgeRange(v0, gv, r, sig);
  if (!eu.ok || !ev.ok) {
    if (mode == 4u) { return vec2f(0.5, 3.0); }
    let J = jetsFromHomography(hu, hv, hd, x, y, period);
    let rr = checkerMeanMode(J, S, 3u);
    return vec2f(rr.x, 3.0);
  }
  if (mode == 5u) { return vec2f(0.5, 1.0); }
  var acc = eu.low * ev.low;
  var h = eu.hlo;
  loop {
    if (h > eu.hhi) { break; }
    let bu = 0.5 * h;
    let du = u0 - bu;
    let nuv = gu + du * r;
    let nun = max(length(nuv), 1e-30);
    let distU = du / nun;
    if (abs(distU) < L * sig) {
      let ju = select(-2.0, 2.0, abs(h - 2.0 * round(0.5 * h)) < 0.5);
      acc += ev.low * ju * Phi(distU / sig);
      var k = ev.hlo;
      loop {
        if (k > ev.hhi) { break; }
        let bv = 0.5 * k;
        let dv = v0 - bv;
        let nvv = gv + dv * r;
        let nvn = max(length(nvv), 1e-30);
        let distV = dv / nvn;
        if (abs(distV) < L * sig) {
          let jv = select(-2.0, 2.0, abs(k - 2.0 * round(0.5 * k)) < 0.5);
          let corr = dot(nuv, nvv) / (nun * nvn);
          acc += ju * jv * bvnuAny(-distU / sig, -distV / sig, corr);
        }
        k += 1.0;
      }
    }
    h += 1.0;
  }
  var k = ev.hlo;
  loop {
    if (k > ev.hhi) { break; }
    let bv = 0.5 * k;
    let dv = v0 - bv;
    let nvv = gv + dv * r;
    let distV = dv / max(length(nvv), 1e-30);
    if (abs(distV) < L * sig) {
      let jv = select(-2.0, 2.0, abs(k - 2.0 * round(0.5 * k)) < 0.5);
      acc += eu.low * jv * Phi(distV / sig);
    }
    k += 1.0;
  }
  return vec2f(0.5 + 0.5 * acc, 1.0);
}
fn circlesMeanH(hu: vec3f, hv: vec3f, hd: vec3f, x: f32, y: f32, period: f32, S: f32) -> vec2f { return circlesMeanHMode(hu, hv, hd, x, y, period, S, 0u); }
fn circlesMeanHMode(hu: vec3f, hv: vec3f, hd: vec3f, x: f32, y: f32, period: f32, S: f32, mode: u32) -> vec2f {
  let sig = sqrt(S);
  let p = vec3f(x, y, 1.0);
  let Nu = dot(hu, p);
  let Nv = dot(hv, p);
  let D = dot(hd, p);
  let dD = hd.xy;
  let rn = length(dD) / abs(D);
  let u0 = Nu / D / period;
  let v0 = Nv / D / period;
  let gu = (hu.xy * D - Nu * dD) / (D * D) / period;
  let gv = (hv.xy * D - Nv * dD) / (D * D) / period;
  let gmax = max(length(gu), length(gv));
  let denom = 1.0 - 6.0 * sig * rn;
  let reach = 3.0 * sig * gmax / max(denom, 1e-6) + DISC_R;
  let nu0 = floor(u0 - reach);
  let nu1 = floor(u0 + reach);
  let nv0 = floor(v0 - reach);
  let nv1 = floor(v0 + reach);
  if (denom <= 0.05 || (nu1 - nu0 + 1.0) * (nv1 - nv0 + 1.0) > 9.5) {
    if (mode == 4u) { return vec2f(0.5454, 3.0); }
    let J = jetsFromHomography(hu, hv, hd, x, y, period);
    let rr = circlesMeanMode(J, S, 3u);
    return vec2f(rr.x, 3.0);
  }
  if (mode == 5u) { return vec2f(0.5454, 1.0); }
  // the affine numerators in cells and their gradients
  let nuA = Nu / period;
  let nvA = Nv / period;
  let dnu = hu.xy / period;
  let dnv = hv.xy / period;
  let s2 = 1.0 / (D * D);
  let L = 5.5 * sig;
  var acc = 0.0;
  var nu = nu0;
  loop {
    if (nu > nu1) { break; }
    var nv = nv0;
    loop {
      if (nv > nv1) { break; }
      let cu = nu + 0.5;
      let cv = nv + 0.5;
      // q(X) = (nu - cu D)^2 + (nv - cv D)^2 - R^2 D^2, scaled by 1 / D^2: exact in screen space
      let A0 = nuA - cu * D;
      let B0 = nvA - cv * D;
      let dA = dnu - cu * dD;
      let dB = dnv - cv * dD;
      let a0 = (A0 * A0 + B0 * B0 - DISC_R * DISC_R * D * D) * s2;
      let g = (2.0 * A0 * dA + 2.0 * B0 * dB - 2.0 * DISC_R * DISC_R * D * dD) * s2;
      let H = vec3f(
        2.0 * (dA.x * dA.x + dB.x * dB.x - DISC_R * DISC_R * dD.x * dD.x),
        2.0 * (dA.x * dA.y + dB.x * dB.y - DISC_R * DISC_R * dD.x * dD.y),
        2.0 * (dA.y * dA.y + dB.y * dB.y - DISC_R * DISC_R * dD.y * dD.y)) * s2;
      // the quadratic's range over the footprint: outside, inside, or integrate
      let hn = sqrt(H.x * H.x + 2.0 * H.y * H.y + H.z * H.z);
      let range = L * length(g) + 0.5 * L * L * hn;
      if (a0 - range > 0.0) { }
      else if (a0 + range < 0.0) { acc += 1.0; }
      else { acc += quadRegion(a0, g, H, S); }
      nv += 1.0;
    }
    nu += 1.0;
  }
  return vec2f(acc, 1.0);
}
`;

// the quadrature rules, unrolled into straight-line WGSL
function gaussLegendre(n) {
  const x = [];
  const w = [];
  for (let i = 0; i < n; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let pp = 0;
    for (let it = 0; it < 100; it++) {
      let p1 = 1;
      let p2 = 0;
      for (let j = 1; j <= n; j++) {
        const p3 = p2;
        p2 = p1;
        p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j;
      }
      pp = (n * (z * p1 - p2)) / (z * z - 1);
      const z1 = z;
      z = z1 - p1 / pp;
      if (Math.abs(z - z1) < 1e-15) break;
    }
    x.push(z);
    w.push(2 / ((1 - z * z) * pp * pp));
  }
  return { x, w };
}
function f(v) {
  const t = v.toPrecision(10);
  return t.includes('.') || t.includes('e') ? t : `${t}.0`;
}
function unrolledSection() {
  const gl6 = gaussLegendre(6);
  const gl8 = gaussLegendre(8);
  const gl12 = gaussLegendre(12);
  const gl16 = gaussLegendre(16);
  // the Genz sum for one rule: sn = sin(asr (x + 1) / 2)
  const genz = (gl) => gl.x.map((x, i) => `  { let sn = sin(${f(0.5 * (x + 1))} * asr); bvn += ${f(gl.w[i])} * exp((sn * hk - hs) / (1.0 - sn * sn)); }`).join('\n');
  // the high-correlation conditional integral over [lo, b]
  const high = gl16.x.map((x, i) => `  { let xx = mid + hw * ${f(x)}; acc += ${f(gl16.w[i])} * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }`).join('\n');
  // one panel of quadRegion's outer integral: the node position under the panel's map
  const panel = gl8.x.map((x, i) => `    {
      let x = ${f(x)};
      var t = mid + half * x;
      var jac = half;
      if (mapA && mapB) { t = mid + half * sin(0.5 * PI * x); jac = half * 0.5 * PI * cos(0.5 * PI * x); }
      else if (mapA) { let sN = 0.5 * (x + 1.0); t = pa + dz * sN * sN; jac = dz * sN; }
      else if (mapB) { let sN = 0.5 * (1.0 - x); t = pa + dz - dz * sN * sN; jac = dz * sN; }
      let phi = 0.3989422804014327 * exp(-0.5 * t * t / S) / sig;
      acc += ${f(gl8.w[i])} * jac * phi * innerProb(lin, gin + lmix * t, a0 + gout * t + 0.5 * lout * t * t, sig);
    }`).join('\n');
  return /* wgsl */ `
fn innerProb(lin: f32, b: f32, c: f32, sig: f32) -> f32 {
  if (abs(lin) < 1e-9) {
    if (abs(b) < 1e-12) { return select(0.0, 1.0, c <= 0.0); }
    let y = -c / b;
    return select(1.0 - Phi(y / sig), Phi(y / sig), b > 0.0);
  }
  let D = b * b - 2.0 * lin * c;
  if (D <= 0.0) { return select(0.0, 1.0, lin < 0.0); }
  let sq = sqrt(D);
  let y1 = (-b - sq) / lin;
  let y2 = (-b + sq) / lin;
  let p = Phi(max(y1, y2) / sig) - Phi(min(y1, y2) / sig);
  return select(1.0 - p, p, lin > 0.0);
}
// P(q(X) <= 0), X ~ N(0, S I), q(x) = a0 + g . x + x^T H x / 2, exact up to
// quadrature: the outer coordinate along the gradient's perpendicular when
// the linear term dominates over the pixel, else the Hessian's eigenframe;
// the inner interval is between the roots of a quadratic; the outer integral
// is split where the discriminant changes sign, in panels of two sigma,
// Gauss-Legendre 8, with the panels that end at a root mapped so the root's
// square-root behaviour is smooth
fn quadRegion(a0: f32, g: vec2f, H: vec3f, S: f32) -> f32 {
  let sig = sqrt(S);
  let gn = length(g);
  let hn = sqrt(H.x * H.x + 2.0 * H.y * H.y + H.z * H.z);
  var ein = vec2f(1.0, 0.0);
  if (gn > 0.5 * hn * sig && gn > 1e-20) {
    ein = g / gn;
  } else {
    let tr = H.x + H.z;
    let dt = H.x * H.z - H.y * H.y;
    let disc = sqrt(max(0.25 * tr * tr - dt, 0.0));
    let l1 = 0.5 * tr + disc;
    if (abs(H.y) > 1e-12) { ein = normalize(vec2f(l1 - H.z, H.y)); }
    else if (H.z > H.x) { ein = vec2f(0.0, 1.0); }
  }
  let eout = vec2f(-ein.y, ein.x);
  let lin = H.x * ein.x * ein.x + 2.0 * H.y * ein.x * ein.y + H.z * ein.y * ein.y;
  let lout = H.x * eout.x * eout.x + 2.0 * H.y * eout.x * eout.y + H.z * eout.y * eout.y;
  let lmix = H.x * ein.x * eout.x + H.y * (ein.x * eout.y + ein.y * eout.x) + H.z * ein.y * eout.y;
  let gin = dot(g, ein);
  let gout = dot(g, eout);
  let L = 5.5 * sig;
  // the discriminant D(t) = (gin + lmix t)^2 - 2 lin (a0 + gout t + lout t^2 / 2), a quadratic in t; its roots cut the range
  let A = lmix * lmix - lin * lout;
  let B = 2.0 * gin * lmix - 2.0 * lin * gout;
  let C = gin * gin - 2.0 * lin * a0;
  var c1 = L; // the inner cuts, sorted, L when absent
  var c2 = L;
  if (abs(lin) > 1e-9) {
    if (abs(A) > 1e-12) {
      let dd = B * B - 4.0 * A * C;
      if (dd > 0.0) {
        let sq = sqrt(dd);
        let r1 = min((-B - sq) / (2.0 * A), (-B + sq) / (2.0 * A));
        let r2 = max((-B - sq) / (2.0 * A), (-B + sq) / (2.0 * A));
        if (r1 > -L && r1 < L) { c1 = r1; }
        if (r2 > -L && r2 < L) { if (c1 < L) { c2 = r2; } else { c1 = r2; } }
      }
    } else if (abs(B) > 1e-12) {
      let rr = -C / B;
      if (rr > -L && rr < L) { c1 = rr; }
    }
  }
  var acc = 0.0;
  for (var seg = 0; seg < 3; seg++) {
    let a = select(select(-L, c1, seg == 1), c2, seg == 2);
    let b = select(select(c1, c2, seg == 1), L, seg == 2);
    if (b - a < 1e-9) { continue; }
    let tm = 0.5 * (a + b);
    let Dm = (gin + lmix * tm) * (gin + lmix * tm) - 2.0 * lin * (a0 + gout * tm + 0.5 * lout * tm * tm);
    if (abs(lin) > 1e-9 && Dm <= 0.0 && lin > 0.0) { continue; } // the region is empty here
    let rootA = seg > 0 && a > -L;
    let rootB = b < L;
    let panels = ceil((b - a) / (2.0 * sig));
    let dz = (b - a) / panels;
    var q = 0.0;
    loop {
      if (q >= panels) { break; }
      let pa = a + q * dz;
      let half = 0.5 * dz;
      let mid = pa + half;
      let mapA = rootA && q < 0.5;
      let mapB = rootB && q > panels - 1.5;
${panel}
      q += 1.0;
    }
  }
  return acc;
}
// P(X > h, Y > k) for standard normals with correlation r: Genz 2004 for
// |r| <= 0.925 (six nodes below 0.3, twelve above), the conditional integral
// split at its transition beyond
fn bvnu(h: f32, k: f32, r: f32) -> f32 {
  let hk = h * k;
  let hs = 0.5 * (h * h + k * k);
  let asr = asin(r);
  var bvn = 0.0;
  if (abs(r) < 0.3) {
${genz(gl6)}
  } else {
${genz(gl12)}
  }
  return bvn * asr / (2.0 * TAU) + Phi(-h) * Phi(-k);
}
fn bvnuHigh(h: f32, k: f32, r: f32) -> f32 {
  let s = sqrt(max(1.0 - r * r, 1e-14));
  let xs = k / r;
  let halfw = 6.0 * s / abs(r);
  let a = xs - halfw;
  let b = xs + halfw;
  var acc = 0.0;
  if (b > h) {
    let lo = max(h, a);
    if (r > 0.0) { acc += Phi(-max(b, h)); }
    else if (a > h) { acc += Phi(-h) - Phi(-a); }
    if (lo < b) {
      let hw = 0.5 * (b - lo);
      let mid = 0.5 * (b + lo);
${high}
    }
  } else {
    acc = select(0.0, Phi(-h), r > 0.0);
  }
  return acc;
}
fn bvnuAny(h: f32, k: f32, r: f32) -> f32 {
  let rc = clamp(r, -0.999999, 0.999999);
  if (abs(rc) <= 0.925) { return bvnu(h, k, rc); }
  return bvnuHigh(h, k, rc);
}
`;
}
