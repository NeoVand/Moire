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
//     zero, or more than 10 edges a count or 9 discs in reach) the spectral
//     path with the second-order model. These are the entry points for a
//     plane under a pinhole camera; the Jets entries are for counts whose
//     jets come from elsewhere.
// Domain: the checkerboard and the circles at any magnification; the
// homography entries are exact under the guard, the Jets entries carry the
// counts to second order.
// Not in it: the ground/sky edge or any silhouette, the compiler's exact
// depth conditioning, certified whole-image bounds. The spectral
// enumeration is capped at 2048 lattice points a pixel.
// The WGSL string requires the constants TAU and PI in scope; the HLSL
// string (OURS_KERNEL_HLSL) defines them. The homography entries, the
// spectral paths and the exact regions are written in a portable subset
// (explicit types, no arrays or matrices) and emitted in both languages;
// the Jets coverage entries are WGSL only.
const PORTABLE_MATH = /* wgsl */ `
// the work counter: expensive calls a pixel (multRe, the bivariate normal, a disc
// panel, a line node), read by the demo's mode 6; the HLSL emission strips it
var<private> WORK: f32 = 0.0;
// erf, Abramowitz and Stegun 7.1.26 (|error| < 1.5e-7)
fn erfA(x: f32) -> f32 {
  let s: f32 = sign(x);
  let a: f32 = abs(x);
  let t: f32 = 1.0 / (1.0 + 0.3275911 * a);
  let y: f32 = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-a * a);
  return s * y;
}
fn Phi(x: f32) -> f32 { return 0.5 * (1.0 + erfA(x * 0.7071067811865476)); }
// the unit square wave, +1 where fract < 1/2
fn wOf(u: f32) -> f32 { return select(-1.0, 1.0, fract(u) < 0.5); }

// Re E[exp(i (phi0 + b . x + x^T Q x / 2))], x ~ N(0, S I): the multiplier
// theorem at second order in closed form
fn multRe(phi0: f32, b: vec2f, q: vec3f, S: f32) -> f32 {
  WORK += 1.0;
  let tr: f32 = q.x + q.z;
  let dt: f32 = q.x * q.z - q.y * q.y;
  let disc: f32 = sqrt(max(0.25 * tr * tr - dt, 0.0));
  let l1: f32 = 0.5 * tr + disc;
  let l2: f32 = 0.5 * tr - disc;
  let modu: f32 = inverseSqrt(sqrt((1.0 + S * S * l1 * l1) * (1.0 + S * S * l2 * l2)));
  let ph: f32 = 0.5 * atan2(S * (l1 + l2), 1.0 - S * S * l1 * l2); // atan a + atan b = atan2(a + b, 1 - a b)
  // b^T adj(I - i S Q) b / det, adj = [[1 - i S q11, i S q01], [i S q01, 1 - i S q00]]
  let Ar: f32 = b.x * b.x + b.y * b.y;
  let Ai: f32 = -S * (q.z * b.x * b.x - 2.0 * q.y * b.x * b.y + q.x * b.y * b.y);
  let Dr: f32 = 1.0 - S * S * dt;
  let Di: f32 = -S * tr;
  let dd: f32 = Dr * Dr + Di * Di;
  let Er: f32 = -0.5 * S * (Ar * Dr + Ai * Di) / dd;
  let Ei: f32 = -0.5 * S * (Ai * Dr - Ar * Di) / dd;
  return modu * exp(Er) * cos(phi0 + ph + Ei);
}

struct Jets { u0: f32, v0: f32, gu: vec2f, gv: vec2f, Hu: vec3f, Hv: vec3f };
// exact jets of the two counts from a homography: (Nu, Nv, D) = (hu, hv, hd) . (x, y, 1),
// counts (Nu, Nv) / D / period; the caller's pixel-centre convention is in (x, y)
fn jetsFromHomography(hu: vec3f, hv: vec3f, hd: vec3f, x: f32, y: f32, period: f32) -> Jets {
  let p: vec3f = vec3f(x, y, 1.0);
  let Nu: f32 = dot(hu, p);
  let Nv: f32 = dot(hv, p);
  let D: f32 = dot(hd, p);
  let dD: vec2f = hd.xy;
  var J: Jets;
  J.u0 = Nu / D / period;
  J.v0 = Nv / D / period;
  let gu: vec2f = (hu.xy * D - Nu * dD) / (D * D);
  let gv: vec2f = (hv.xy * D - Nv * dD) / (D * D);
  J.gu = gu / period;
  J.gv = gv / period;
  J.Hu = vec3f(-2.0 * dD.x * gu.x / D, -(dD.y * gu.x + dD.x * gu.y) / D, -2.0 * dD.y * gu.y / D) / period;
  J.Hv = vec3f(-2.0 * dD.x * gv.x / D, -(dD.y * gv.x + dD.x * gv.y) / D, -2.0 * dD.y * gv.y / D) / period;
  return J;
}

// the lattice of recipes k gu + l gv, Lagrange-Gauss reduced: (k, l) = m T0 + n T1
struct Lattice { b1: vec2f, b2: vec2f, T0: vec2f, T1: vec2f };
fn reduceLattice(gu: vec2f, gv: vec2f) -> Lattice {
  var L: Lattice;
  L.b1 = gu;
  L.b2 = gv;
  L.T0 = vec2f(1.0, 0.0);
  L.T1 = vec2f(0.0, 1.0);
  for (var it: i32 = 0; it < 12; it++) {
    if (dot(L.b1, L.b1) > dot(L.b2, L.b2)) {
      let tb: vec2f = L.b1; L.b1 = L.b2; L.b2 = tb;
      let tT: vec2f = L.T0; L.T0 = L.T1; L.T1 = tT;
    }
    let m: f32 = round(dot(L.b1, L.b2) / max(dot(L.b1, L.b1), 1e-30));
    if (m == 0.0) { break; }
    L.b2 = L.b2 - m * L.b1;
    L.T1 = L.T1 - m * L.T0;
  }
  return L;
}
// the reach in cycles per pixel of the lattice enumeration, grown by the
// curvature the recipes can reach
fn latticeReach(J: Jets, S: f32) -> f32 {
  let fu: f32 = sqrt(J.Hu.x * J.Hu.x + 2.0 * J.Hu.y * J.Hu.y + J.Hu.z * J.Hu.z);
  let fv: f32 = sqrt(J.Hv.x * J.Hv.x + 2.0 * J.Hv.y * J.Hv.y + J.Hv.z * J.Hv.z);
  let lam: f32 = TAU * (fu + fv) * 8.0;
  return min(1.6 * sqrt(1.0 + S * S * lam * lam), 12.0);
}

// the checkerboard's spectral path: 1/2 - (2 / pi^2) sum over odd (k, l) of
// Re E[e^{2 pi i (k u + l v)}] / (k l) over the reduced lattice within reach
fn checkerSpectral(J: Jets, S: f32) -> vec2f {
  let L: Lattice = reduceLattice(J.gu, J.gv);
  let R: f32 = latticeReach(J, S);
  let n1: f32 = length(L.b1);
  let perp: f32 = sqrt(max(dot(L.b2, L.b2) - dot(L.b1, L.b2) * dot(L.b1, L.b2) / dot(L.b1, L.b1), 1e-30));
  // a lattice whose shortest vector is under 1e-4 cycles a pixel would need
  // more than 1e4 recipes along it: the enumeration is declined to the mean
  if (n1 < 1e-4 || perp < 1e-4) { return vec2f(0.5, 0.0); }
  let nMax: f32 = floor(R / perp);
  var acc: f32 = 0.5;
  var count: f32 = 0.0;
  var tried: i32 = 0; // every recipe attempted, accepted or not, counts toward the bound
  let nCount: i32 = i32(min(nMax, 4096.0)) + 1; // the half lattice; the conjugate half is folded in
  for (var iN: i32 = 0; iN < nCount; iN++) {
    let n: f32 = f32(iN);
    let c: vec2f = n * L.b2;
    let mStar: f32 = -dot(c, L.b1) / dot(L.b1, L.b1);
    let hw: f32 = sqrt(max(R * R - n * n * perp * perp, 0.0)) / n1;
    let m0: f32 = ceil(mStar - hw);
    let mEnd: f32 = floor(mStar + hw);
    let mCount: i32 = i32(min(mEnd - m0, 4096.0)) + 1;
    for (var iM: i32 = 0; iM < mCount; iM++) {
      let m: f32 = m0 + f32(iM);
      tried += 1;
      if (tried > 4096) { break; }
      let kl: vec2f = m * L.T0 + n * L.T1;
      let k: f32 = kl.x;
      let l: f32 = kl.y;
      let ok: bool = (abs(k - 2.0 * round(0.5 * (k - 1.0)) - 1.0) < 0.5) && (abs(l - 2.0 * round(0.5 * (l - 1.0)) - 1.0) < 0.5);
      // the conjugate pair (k, l), (-k, -l) shares its real part: keep one of each
      let half: bool = n > 0.0 || (n == 0.0 && m > 0.0);
      if (ok && half) {
        let bb: vec2f = TAU * (k * J.gu + l * J.gv);
        let qq: vec3f = TAU * (k * J.Hu + l * J.Hv);
        // the term's own reach: its rate against the curvature it carries
        let lamT: f32 = sqrt(qq.x * qq.x + 2.0 * qq.y * qq.y + qq.z * qq.z);
        let reach: f32 = TAU * 1.6 * sqrt(1.0 + S * S * lamT * lamT);
        if (dot(bb, bb) <= reach * reach) {
          let coef: f32 = -4.0 / (PI * PI * k * l);
          let phi0: f32 = TAU * (k * J.u0 + l * J.v0);
          acc += coef * multRe(phi0, bb, qq, S);
          count += 1.0;
        }
      }
      if (count > 2048.0) { break; }
    }
    if (count > 2048.0 || tried > 4096) { break; }
  }
  // exhaustion of either cap leaves a partial sum: reported as such
  return vec2f(acc, select(1.0, 0.0, count > 2048.0 || tried > 4096));
}

const DISC_R: f32 = 0.4166666666666667; // 25/3 over the cell 20

// J1(x)/x, the disc's coefficient shape (Numerical Recipes rational forms, |err| ~ 1e-8)
fn j1overx(x: f32) -> f32 {
  let ax: f32 = abs(x);
  if (ax < 1e-3) { return 0.5 - x * x / 16.0; }
  if (ax < 8.0) {
    let y: f32 = x * x;
    let num: f32 = 72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * (-30.16036606)))));
    let den: f32 = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return num / den; // J1(x) = x * num / den
  }
  let z: f32 = 8.0 / ax;
  let y: f32 = z * z;
  let xx: f32 = ax - 2.356194491;
  let p1: f32 = 1.0 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * (-0.240337019e-6))));
  let p2: f32 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  let j1: f32 = sqrt(0.636619772 / ax) * (cos(xx) * p1 - z * sin(xx) * p2);
  return j1 / ax; // even in x
}
// the circles' spectral path: the disc's series over the reduced lattice,
// coefficient (-1)^(k + l) rho J1(2 pi rho |kappa|) / |kappa|, DC pi rho^2
fn circlesSpectral(J: Jets, S: f32) -> vec2f {
  let L: Lattice = reduceLattice(J.gu, J.gv);
  let R: f32 = latticeReach(J, S);
  let n1: f32 = length(L.b1);
  let perp: f32 = sqrt(max(dot(L.b2, L.b2) - dot(L.b1, L.b2) * dot(L.b1, L.b2) / dot(L.b1, L.b1), 1e-30));
  // a lattice whose shortest vector is under 1e-4 cycles a pixel would need
  // more than 1e4 recipes along it: the enumeration is declined to the mean
  if (n1 < 1e-4 || perp < 1e-4) { return vec2f(0.5454, 0.0); }
  let nMax: f32 = floor(R / perp);
  var acc: f32 = 0.0;
  var count: f32 = 0.0;
  var tried: i32 = 0; // every recipe attempted, accepted or not, counts toward the bound
  let nCount: i32 = i32(min(nMax, 4096.0)) + 1; // the half lattice; the conjugate half is folded in
  for (var iN: i32 = 0; iN < nCount; iN++) {
    let n: f32 = f32(iN);
    let c: vec2f = n * L.b2;
    let mStar: f32 = -dot(c, L.b1) / dot(L.b1, L.b1);
    let hw: f32 = sqrt(max(R * R - n * n * perp * perp, 0.0)) / n1;
    let m0: f32 = ceil(mStar - hw);
    let mEnd: f32 = floor(mStar + hw);
    let mCount: i32 = i32(min(mEnd - m0, 4096.0)) + 1;
    for (var iM: i32 = 0; iM < mCount; iM++) {
      let m: f32 = m0 + f32(iM);
      tried += 1;
      if (tried > 4096) { break; }
      let kl: vec2f = m * L.T0 + n * L.T1;
      let k: f32 = kl.x;
      let l: f32 = kl.y;
      let half: bool = n > 0.0 || (n == 0.0 && m > 0.0);
      let dc: bool = n == 0.0 && m == 0.0;
      if (half || dc) {
        let bb: vec2f = TAU * (k * J.gu + l * J.gv);
        let qq: vec3f = TAU * (k * J.Hu + l * J.Hv);
        let lamT: f32 = sqrt(qq.x * qq.x + 2.0 * qq.y * qq.y + qq.z * qq.z);
        let reach: f32 = TAU * 1.6 * sqrt(1.0 + S * S * lamT * lamT);
        if (dot(bb, bb) <= reach * reach) {
          let kap: f32 = TAU * DISC_R * sqrt(k * k + l * l);
          var coef: f32 = TAU * DISC_R * DISC_R * j1overx(kap);
          let parity: f32 = k + l - 2.0 * floor(0.5 * (k + l));
          if (parity > 0.5) { coef = -coef; }
          if (!dc) { coef = 2.0 * coef; }
          let phi0: f32 = TAU * (k * J.u0 + l * J.v0);
          acc += coef * multRe(phi0, bb, qq, S);
          count += 1.0;
        }
      }
      if (count > 2048.0) { break; }
    }
    if (count > 2048.0 || tried > 4096) { break; }
  }
  // exhaustion of either cap leaves a partial sum: reported as such
  return vec2f(acc, select(1.0, 0.0, count > 2048.0 || tried > 4096));
}
`;

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
function lit(v) {
  const t = v.toPrecision(10);
  return t.includes('.') || t.includes('e') ? t : `${t}.0`;
}
// the exact regions in the portable subset, with the quadrature sums
// unrolled: a dynamically indexed local array lives in thread memory on the
// GPU and these sums are the kernel's inner cost
function exactRegions() {
  const gl6 = gaussLegendre(6);
  const gl8 = gaussLegendre(8);
  const gl12 = gaussLegendre(12);
  const gl16 = gaussLegendre(16);
  const genz = (gl) => gl.x.map((x, i) => `  { let sn: f32 = sin(${lit(0.5 * (x + 1))} * asr); bvn += ${lit(gl.w[i])} * exp((sn * hk - hs) / (1.0 - sn * sn)); }`).join('\n');
  const high = gl16.x.map((x, i) => `  { let xx: f32 = mid + hw * ${lit(x)}; acc += ${lit(gl16.w[i])} * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }`).join('\n');
  const panel = gl16.x.map((x, i) => `    {
      let x: f32 = ${lit(x)};
      var t: f32 = mid + half * x;
      var jac: f32 = half;
      if (mapA && mapB) { t = mid + half * sin(0.5 * PI * x); jac = half * 0.5 * PI * cos(0.5 * PI * x); }
      else if (mapA) { let sN: f32 = 0.5 * (x + 1.0); t = pa + dz * sN * sN; jac = dz * sN; }
      else if (mapB) { let sN: f32 = 0.5 * (1.0 - x); t = pa + dz - dz * sN * sN; jac = dz * sN; }
      let phi: f32 = 0.3989422804014327 * exp(-0.5 * t * t / S) / sig;
      acc += ${lit(gl16.w[i])} * jac * phi * innerProb(lin, gin + lmix * t, a0 + gout * t + 0.5 * lout * t * t, sig);
    }`).join('\n');
  return `
// the probability under N(0, sigma^2) of the set where lin/2 y^2 + b y + c <= 0
fn innerProb(lin: f32, b: f32, c: f32, sig: f32) -> f32 {
  if (abs(lin) < 1e-9) {
    if (abs(b) < 1e-12) { return select(0.0, 1.0, c <= 0.0); }
    let y: f32 = -c / b;
    return select(1.0 - Phi(y / sig), Phi(y / sig), b > 0.0);
  }
  let D: f32 = b * b - 2.0 * lin * c;
  if (D <= 0.0) { return select(0.0, 1.0, lin < 0.0); }
  let sq: f32 = sqrt(D);
  let y1: f32 = (-b - sq) / lin;
  let y2: f32 = (-b + sq) / lin;
  let p: f32 = Phi(max(y1, y2) / sig) - Phi(min(y1, y2) / sig);
  return select(1.0 - p, p, lin > 0.0);
}
// P(q(X) <= 0), X ~ N(0, S I), q(x) = a0 + g . x + x^T H x / 2, exact up to
// quadrature: the outer coordinate along the gradient's perpendicular when
// the linear term dominates over the pixel, else the Hessian's eigenframe;
// the inner interval is between the roots of a quadratic; the outer integral
// is split where the discriminant changes sign, in panels of 5.5 sigma,
// Gauss-Legendre 16, with the panels that end at a root mapped so the root's
// square-root behaviour is smooth
fn quadRegion(a0: f32, g: vec2f, H: vec3f, S: f32) -> f32 {
  let sig: f32 = sqrt(S);
  let gn: f32 = length(g);
  let hn: f32 = sqrt(H.x * H.x + 2.0 * H.y * H.y + H.z * H.z);
  var ein: vec2f = vec2f(1.0, 0.0);
  if (gn > 0.5 * hn * sig && gn > 1e-20) {
    ein = g / gn;
  } else {
    let tr: f32 = H.x + H.z;
    let dt: f32 = H.x * H.z - H.y * H.y;
    let disc: f32 = sqrt(max(0.25 * tr * tr - dt, 0.0));
    let l1: f32 = 0.5 * tr + disc;
    if (abs(H.y) > 1e-12) { ein = normalize(vec2f(l1 - H.z, H.y)); }
    else if (H.z > H.x) { ein = vec2f(0.0, 1.0); }
  }
  let eout: vec2f = vec2f(-ein.y, ein.x);
  let lin: f32 = H.x * ein.x * ein.x + 2.0 * H.y * ein.x * ein.y + H.z * ein.y * ein.y;
  let lout: f32 = H.x * eout.x * eout.x + 2.0 * H.y * eout.x * eout.y + H.z * eout.y * eout.y;
  let lmix: f32 = H.x * ein.x * eout.x + H.y * (ein.x * eout.y + ein.y * eout.x) + H.z * ein.y * eout.y;
  let gin: f32 = dot(g, ein);
  let gout: f32 = dot(g, eout);
  let L: f32 = 5.5 * sig;
  // the discriminant D(t) = (gin + lmix t)^2 - 2 lin (a0 + gout t + lout t^2 / 2), a quadratic in t; its roots cut the range
  let A: f32 = lmix * lmix - lin * lout;
  let B: f32 = 2.0 * gin * lmix - 2.0 * lin * gout;
  let C: f32 = gin * gin - 2.0 * lin * a0;
  var c1: f32 = L; // the inner cuts, sorted, L when absent
  var c2: f32 = L;
  if (abs(lin) > 1e-9) {
    if (abs(A) > 1e-12) {
      let dd: f32 = B * B - 4.0 * A * C;
      if (dd > 0.0) {
        let sq: f32 = sqrt(dd);
        let r1: f32 = min((-B - sq) / (2.0 * A), (-B + sq) / (2.0 * A));
        let r2: f32 = max((-B - sq) / (2.0 * A), (-B + sq) / (2.0 * A));
        if (r1 > -L && r1 < L) { c1 = r1; }
        if (r2 > -L && r2 < L) { if (c1 < L) { c2 = r2; } else { c1 = r2; } }
      }
    } else if (abs(B) > 1e-12) {
      let rr: f32 = -C / B;
      if (rr > -L && rr < L) { c1 = rr; }
    }
  }
  var acc: f32 = 0.0;
  for (var seg: i32 = 0; seg < 3; seg++) {
    let a: f32 = select(select(-L, c1, seg == 1), c2, seg == 2);
    let b: f32 = select(select(c1, c2, seg == 1), L, seg == 2);
    if (b - a < 1e-9) { continue; }
    let tm: f32 = 0.5 * (a + b);
    let Dm: f32 = (gin + lmix * tm) * (gin + lmix * tm) - 2.0 * lin * (a0 + gout * tm + 0.5 * lout * tm * tm);
    if (abs(lin) > 1e-9 && Dm <= 0.0 && lin > 0.0) { continue; } // the region is empty here
    let rootA: bool = seg > 0 && a > -L;
    let rootB: bool = b < L;
    let panels: f32 = ceil((b - a) / (5.5 * sig));
    let dz: f32 = (b - a) / panels;
    var q: f32 = 0.0;
    loop {
      if (q >= panels) { break; }
      let pa: f32 = a + q * dz;
      let half: f32 = 0.5 * dz;
      let mid: f32 = pa + half;
      let mapA: bool = rootA && q < 0.5;
      let mapB: bool = rootB && q > panels - 1.5;
      WORK += 1.0;
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
  let hk: f32 = h * k;
  let hs: f32 = 0.5 * (h * h + k * k);
  let asr: f32 = asin(r);
  var bvn: f32 = 0.0;
  if (abs(r) < 0.3) {
${genz(gl6)}
  } else if (abs(r) < 0.75) {
${genz(gl8)}
  } else {
${genz(gl12)}
  }
  return bvn * asr / (2.0 * TAU) + Phi(-h) * Phi(-k);
}
fn bvnuHigh(h: f32, k: f32, r: f32) -> f32 {
  let s: f32 = sqrt(max(1.0 - r * r, 1e-14));
  let xs: f32 = k / r;
  let halfw: f32 = 6.0 * s / abs(r);
  let a: f32 = xs - halfw;
  let b: f32 = xs + halfw;
  var acc: f32 = 0.0;
  if (b > h) {
    let lo: f32 = max(h, a);
    if (r > 0.0) { acc += Phi(-max(b, h)); }
    else if (a > h) { acc += Phi(-h) - Phi(-a); }
    if (lo < b) {
      let hw: f32 = 0.5 * (b - lo);
      let mid: f32 = 0.5 * (b + lo);
${high}
    }
  } else {
    acc = select(0.0, Phi(-h), r > 0.0);
  }
  return acc;
}
fn bvnuAny(h: f32, k: f32, r: f32) -> f32 {
  WORK += 1.0;
  let rc: f32 = clamp(r, -0.999999, 0.999999);
  if (abs(rc) <= 0.925) { return bvnu(h, k, rc); }
  return bvnuHigh(h, k, rc);
}
`;
}

const PORTABLE_H = /* wgsl */ `
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
  let L: f32 = 5.5;
  let denom: f32 = 1.0 - L * sig * length(r);
  if (denom <= 0.05) { E.ok = false; return E; }
  let reach: f32 = L * sig * length(g) / denom;
  // a count beyond 2^20 periods has no sub-period precision in float32 for
  // any method: the picture is not representable there
  if (abs(u0) > 1048576.0) { E.ok = false; return E; }
  let hlo: f32 = ceil(2.0 * (u0 - reach));
  let hhi: f32 = floor(2.0 * (u0 + reach));
  if (hhi - hlo > 19.0) { E.ok = false; return E; }
  // the edges actually within reach; the value of w below the lowest of
  // them follows from that edge's parity (an integer edge jumps -1 to +1,
  // a half-integer edge +1 to -1), with no epsilon, so it holds at any
  // distance from the origin in float32
  var count: f32 = 0.0;
  var first: f32 = 1e30;
  var last: f32 = -1e30;
  let nh: i32 = i32(hhi - hlo) + 1; // the loops run on integer counters: a float step can stall at large phases
  for (var ih: i32 = 0; ih < nh; ih++) {
    let h: f32 = hlo + f32(ih);
    let b: f32 = 0.5 * h;
    let delta: f32 = u0 - b;
    let n: vec2f = g + delta * r;
    let dist: f32 = delta / max(length(n), 1e-30);
    if (abs(dist) < L * sig) {
      count += 1.0;
      first = min(first, h);
      last = max(last, h);
    }
  }
  if (count > 10.0) { E.ok = false; return E; }
  if (count > 0.0) {
    let even: bool = abs(first - 2.0 * round(0.5 * first)) < 0.5;
    E.low = select(1.0, -1.0, even);
    E.hlo = first;
    E.hhi = last;
  }
  return E;
}
// mode 4: the exact part only (the fallback returns the mean), mode 5: the fallback only; for timing
fn checkerMeanHMode(hu: vec3f, hv: vec3f, hd: vec3f, x: f32, y: f32, period: f32, S: f32, mode: u32) -> vec2f {
  let sig: f32 = sqrt(S);
  let L: f32 = 5.5;
  let p: vec3f = vec3f(x, y, 1.0);
  let Nu: f32 = dot(hu, p);
  let Nv: f32 = dot(hv, p);
  let D: f32 = dot(hd, p);
  let dD: vec2f = hd.xy;
  let r: vec2f = dD / D;
  let u0: f32 = Nu / D / period;
  let v0: f32 = Nv / D / period;
  let gu: vec2f = (hu.xy * D - Nu * dD) / (D * D) / period;
  let gv: vec2f = (hv.xy * D - Nv * dD) / (D * D) / period;
  let eu: EdgeRange = edgeRange(u0, gu, r, sig);
  let ev: EdgeRange = edgeRange(v0, gv, r, sig);
  if (!eu.ok || !ev.ok) {
    if (mode == 4u) { return vec2f(0.5, 3.0); }
    let J: Jets = jetsFromHomography(hu, hv, hd, x, y, period);
    let sp: vec2f = checkerSpectral(J, S);
    return vec2f(sp.x, select(4.0, 3.0, sp.y > 0.5)); // 3 the lattice fallback, 4 declined or exhausted: approximate
  }
  if (mode == 5u) { return vec2f(0.5, 1.0); }
  var acc: f32 = eu.low * ev.low;
  let nu: i32 = i32(eu.hhi - eu.hlo) + 1;
  let nvE: i32 = i32(ev.hhi - ev.hlo) + 1;
  for (var ih: i32 = 0; ih < nu; ih++) {
    let h: f32 = eu.hlo + f32(ih);
    let bu: f32 = 0.5 * h;
    let du: f32 = u0 - bu;
    let nuv: vec2f = gu + du * r;
    let nun: f32 = max(length(nuv), 1e-30);
    let distU: f32 = du / nun;
    if (abs(distU) < L * sig) {
      let ju: f32 = select(-2.0, 2.0, abs(h - 2.0 * round(0.5 * h)) < 0.5);
      acc += ev.low * ju * Phi(distU / sig);
      for (var ik: i32 = 0; ik < nvE; ik++) {
        let k: f32 = ev.hlo + f32(ik);
        let bv: f32 = 0.5 * k;
        let dv: f32 = v0 - bv;
        let nvv: vec2f = gv + dv * r;
        let nvn: f32 = max(length(nvv), 1e-30);
        let distV: f32 = dv / nvn;
        if (abs(distV) < L * sig) {
          let jv: f32 = select(-2.0, 2.0, abs(k - 2.0 * round(0.5 * k)) < 0.5);
          let corr: f32 = dot(nuv, nvv) / (nun * nvn);
          acc += ju * jv * bvnuAny(-distU / sig, -distV / sig, corr);
        }
      }
    }
  }
  for (var ik: i32 = 0; ik < nvE; ik++) {
    let k: f32 = ev.hlo + f32(ik);
    let bv: f32 = 0.5 * k;
    let dv: f32 = v0 - bv;
    let nvv: vec2f = gv + dv * r;
    let distV: f32 = dv / max(length(nvv), 1e-30);
    if (abs(distV) < L * sig) {
      let jv: f32 = select(-2.0, 2.0, abs(k - 2.0 * round(0.5 * k)) < 0.5);
      acc += eu.low * jv * Phi(distV / sig);
    }
  }
  return vec2f(0.5 + 0.5 * acc, 1.0);
}
fn checkerMeanH(hu: vec3f, hv: vec3f, hd: vec3f, x: f32, y: f32, period: f32, S: f32) -> vec2f { return checkerMeanHMode(hu, hv, hd, x, y, period, S, 0u); }
fn circlesMeanHMode(hu: vec3f, hv: vec3f, hd: vec3f, x: f32, y: f32, period: f32, S: f32, mode: u32) -> vec2f {
  let sig: f32 = sqrt(S);
  let p: vec3f = vec3f(x, y, 1.0);
  let Nu: f32 = dot(hu, p);
  let Nv: f32 = dot(hv, p);
  let D: f32 = dot(hd, p);
  let dD: vec2f = hd.xy;
  let rn: f32 = length(dD) / abs(D);
  let u0: f32 = Nu / D / period;
  let v0: f32 = Nv / D / period;
  let gu: vec2f = (hu.xy * D - Nu * dD) / (D * D) / period;
  let gv: vec2f = (hv.xy * D - Nv * dD) / (D * D) / period;
  let denom: f32 = 1.0 - 5.5 * sig * rn;
  // the cells whose disc can reach the footprint: per axis, the disc's
  // radius plus the count's 5.5 sigma excursion, the same reach the conic
  // rule keeps below
  let reachU: f32 = 5.5 * sig * length(gu) / max(denom, 1e-6) + DISC_R;
  let reachV: f32 = 5.5 * sig * length(gv) / max(denom, 1e-6) + DISC_R;
  let nu0: f32 = floor(u0 - reachU);
  let nu1: f32 = floor(u0 + reachU);
  let nv0: f32 = floor(v0 - reachV);
  let nv1: f32 = floor(v0 + reachV);
  if (denom <= 0.05 || (nu1 - nu0 + 1.0) * (nv1 - nv0 + 1.0) > 9.5 || abs(u0) > 1048576.0 || abs(v0) > 1048576.0) {
    if (mode == 4u) { return vec2f(0.5454, 3.0); }
    let J: Jets = jetsFromHomography(hu, hv, hd, x, y, period);
    let sp: vec2f = circlesSpectral(J, S);
    return vec2f(sp.x, select(4.0, 3.0, sp.y > 0.5));
  }
  if (mode == 5u) { return vec2f(0.5454, 1.0); }
  // the conic through the pullback: (u - cu) = (du + a . X) / (1 + r . X) with
  // a = gu + du r, so the disc is (du + a . X)^2 + (dv + b . X)^2 <= R^2 (1 + r . X)^2,
  // an exact quadratic in X built from fractional offsets, no cell origin subtracted
  let r: vec2f = dD / D;
  let L: f32 = 5.5 * sig;
  var acc: f32 = 0.0;
  let cellsU: i32 = i32(nu1 - nu0) + 1;
  let cellsV: i32 = i32(nv1 - nv0) + 1;
  for (var iu: i32 = 0; iu < cellsU; iu++) {
    for (var iv: i32 = 0; iv < cellsV; iv++) {
      let cu: f32 = nu0 + f32(iu) + 0.5;
      let cv: f32 = nv0 + f32(iv) + 0.5;
      let du: f32 = u0 - cu;
      let dv: f32 = v0 - cv;
      let a: vec2f = gu + du * r;
      let b: vec2f = gv + dv * r;
      let a0: f32 = du * du + dv * dv - DISC_R * DISC_R;
      let g: vec2f = 2.0 * du * a + 2.0 * dv * b - 2.0 * DISC_R * DISC_R * r;
      let H: vec3f = vec3f(
        2.0 * (a.x * a.x + b.x * b.x - DISC_R * DISC_R * r.x * r.x),
        2.0 * (a.x * a.y + b.x * b.y - DISC_R * DISC_R * r.x * r.y),
        2.0 * (a.y * a.y + b.y * b.y - DISC_R * DISC_R * r.y * r.y));
      // the quadratic's range over the footprint: outside, inside, or integrate
      let hn: f32 = sqrt(H.x * H.x + 2.0 * H.y * H.y + H.z * H.z);
      let range: f32 = L * length(g) + 0.5 * L * L * hn;
      if (a0 - range > 0.0) { }
      else if (a0 + range < 0.0) { acc += 1.0; }
      else { acc += quadRegion(a0, g, H, S); }
    }
  }
  return vec2f(acc, 1.0);
}
fn circlesMeanH(hu: vec3f, hv: vec3f, hd: vec3f, x: f32, y: f32, period: f32, S: f32) -> vec2f { return circlesMeanHMode(hu, hv, hd, x, y, period, S, 0u); }
`;

// ---------------------------------------------------------------------------
// the portable subset to HLSL: explicit types on every declaration, no
// arrays, no matrices, select and loop translated
// ---------------------------------------------------------------------------
const TYPES = { f32: 'float', u32: 'uint', i32: 'int', vec2f: 'float2', vec3f: 'float3', bool: 'bool' };
const typeOf = (t) => TYPES[t] || t;
function translateSelect(src) {
  // select(a, b, c) -> (c ? b : a), with balanced parentheses
  let out = '';
  let i = 0;
  for (;;) {
    const j = src.indexOf('select(', i);
    if (j < 0) { out += src.slice(i); break; }
    out += src.slice(i, j);
    let depth = 0;
    let k = j + 7;
    const args = [];
    let start = k;
    for (; k < src.length; k++) {
      const ch = src[k];
      if (ch === '(') depth++;
      else if (ch === ')') { if (depth === 0) break; depth--; }
      else if (ch === ',' && depth === 0) { args.push(src.slice(start, k)); start = k + 1; }
    }
    args.push(src.slice(start, k));
    const [a, b, c] = args.map((s) => translateSelect(s.trim()));
    out += `((${c}) ? (${b}) : (${a}))`;
    i = k + 1;
  }
  return out;
}
export function toHLSL(src) {
  // the production emission carries no instrumentation: the counter and its increments go
  let s = src.replace(/^var<private> WORK: f32 = 0\.0;\n/m, '').replace(/^[ \t]*WORK \+= 1\.0;[^\n]*\n/gm, '');
  s = s.replace(/fn (\w+)\(([^)]*)\) -> (\w+) \{/g, (m, name, args, ret) => {
    const a = args.trim() ? args.split(',').map((p) => { const [n, t] = p.split(':').map((v) => v.trim()); return `${typeOf(t)} ${n}`; }).join(', ') : '';
    return `${typeOf(ret)} ${name}(${a}) {`;
  });
  s = s.replace(/struct (\w+) \{([^}]*)\};/g, (m, name, body) => {
    const fields = body.split(',').map((p) => { const [n, t] = p.split(':').map((v) => v.trim()); return `${typeOf(t)} ${n};`; }).join(' ');
    return `struct ${name} { ${fields} };`;
  });
  s = s.replace(/^const (\w+): (\w+) = /gm, (m, n, t) => `static const ${typeOf(t)} ${n} = `);
  s = s.replace(/\b(let|var) (\w+): (\w+)( =|;)/g, (m, kw, n, t, tail) => `${typeOf(t)} ${n}${tail}`);
  s = s.replace(/\bloop \{/g, 'while (true) {');
  s = s.replace(/\bfract\(/g, 'frac(').replace(/\binverseSqrt\(/g, 'rsqrt(');
  s = s.replace(/\bvec2f\(/g, 'float2(').replace(/\bvec3f\(/g, 'float3(');
  s = s.replace(/\bf32\(/g, 'float(').replace(/\bu32\(/g, 'uint(').replace(/\bi32\(/g, 'int(');
  s = s.replace(/\b(\d+)u\b/g, '$1');
  s = translateSelect(s);
  // engine macros own PI and TAU; the emitted code uses its own names
  s = s.replace(/\bTAU\b/g, 'OURS_TAU').replace(/\bPI\b/g, 'OURS_PI');
  return s;
}
const HLSL_PRELUDE = `// Generated from demo/ours-kernel.wgsl.js: the same kernel in HLSL.
static const float OURS_TAU = 6.283185307179586;
static const float OURS_PI = 3.141592653589793;
`;

const RIPPLES_COMMON = /* wgsl */ `
// ---------------------------------------------------------------------------
// the rippled checkerboard (Yang-Barnes parallax ripples): the checker's
// counts displaced by A sin(psi), psi = f hypot(s, t), the lighting a periodic
// function of psi through the height's gradient. Recipes (k, l, p): the
// checker's (k, l) with the Jacobi-Anger sidebands n of the displacement and
// the lighting's harmonics m, p = n + m, rate 2 pi (k gu + l gv) + p grad psi
// ---------------------------------------------------------------------------
const RIP_A: f32 = 0.3333333333333333;
const RIP_F: f32 = 3.0;
const RIP_M: i32 = 12;        // lighting harmonics kept, |m| <= RIP_M
const RIP_NB: i32 = 6;        // sideband orders kept, |n| <= RIP_NB
const RIP_SAMPLES: i32 = 32;  // samples of psi over [0, pi] for the lighting's spectrum (array<f32, 32> below)

struct J2 { v: f32, g: vec2f, H: vec3f };
fn j2add(a: J2, b: J2) -> J2 { return J2(a.v + b.v, a.g + b.g, a.H + b.H); }
fn j2scale(a: J2, c: f32) -> J2 { return J2(c * a.v, c * a.g, c * a.H); }
fn j2mul(a: J2, b: J2) -> J2 {
  return J2(a.v * b.v, a.v * b.g + b.v * a.g, vec3f(
    a.v * b.H.x + b.v * a.H.x + 2.0 * a.g.x * b.g.x,
    a.v * b.H.y + b.v * a.H.y + a.g.x * b.g.y + a.g.y * b.g.x,
    a.v * b.H.z + b.v * a.H.z + 2.0 * a.g.y * b.g.y));
}
fn j2fn(a: J2, f0: f32, f1: f32, f2: f32) -> J2 {
  return J2(f0, f1 * a.g, vec3f(f1 * a.H.x + f2 * a.g.x * a.g.x, f1 * a.H.y + f2 * a.g.x * a.g.y, f1 * a.H.z + f2 * a.g.y * a.g.y));
}
// the complex multiplier E[exp(i (phi0 + b . x + x^T Q x / 2))] as (re, im)
fn multC(phi0: f32, b: vec2f, q: vec3f, S: f32) -> vec2f {
  WORK += 1.0;
  let tr: f32 = q.x + q.z;
  let dt: f32 = q.x * q.z - q.y * q.y;
  let disc: f32 = sqrt(max(0.25 * tr * tr - dt, 0.0));
  let l1: f32 = 0.5 * tr + disc;
  let l2: f32 = 0.5 * tr - disc;
  let modu: f32 = inverseSqrt(sqrt((1.0 + S * S * l1 * l1) * (1.0 + S * S * l2 * l2)));
  let ph: f32 = 0.5 * atan2(S * (l1 + l2), 1.0 - S * S * l1 * l2);
  let Ar: f32 = b.x * b.x + b.y * b.y;
  let Ai: f32 = -S * (q.z * b.x * b.x - 2.0 * q.y * b.x * b.y + q.x * b.y * b.y);
  let Dr: f32 = 1.0 - S * S * dt;
  let Di: f32 = -S * tr;
  let dd: f32 = Dr * Dr + Di * Di;
  let Er: f32 = -0.5 * S * (Ar * Dr + Ai * Di) / dd;
  let Ei: f32 = -0.5 * S * (Ai * Dr - Ar * Di) / dd;
  let amp: f32 = modu * exp(Er);
  let arg: f32 = phi0 + ph + Ei;
  return vec2f(amp * cos(arg), amp * sin(arg));
}
// J_n(x) for small |x| (the displacement's arguments stay under a few) by the
// ascending series; n >= 0, J_{-n} = (-1)^n J_n
fn besselSmall(n: i32, x: f32) -> f32 {
  let h: f32 = 0.5 * x;
  var term: f32 = 1.0;
  for (var i: i32 = 1; i <= n; i++) { term *= h / f32(i); }
  var sum: f32 = term;
  let h2: f32 = -h * h;
  for (var j: i32 = 1; j < 14; j++) {
    term *= h2 / (f32(j) * f32(n + j));
    sum += term;
  }
  return sum;
}
fn besselJ(n: i32, x: f32) -> f32 {
  let an: i32 = abs(n);
  let v: f32 = besselSmall(an, x);
  return select(v, -v, n < 0 && (an & 1) == 1);
}
// the ripple phase's second-order jet: s = period u, t = period v, r = hypot(s, t), psi = f r
struct RippleJets { psi: J2 };
fn rippleJets(J: Jets, period: f32, viewer: vec3f) -> RippleJets {
  let sJ: J2 = J2(J.u0 * period, J.gu * period, J.Hu * period);
  let tJ: J2 = J2(J.v0 * period, J.gv * period, J.Hv * period);
  let r2: J2 = j2add(j2mul(sJ, sJ), j2mul(tJ, tJ));
  let r0: f32 = sqrt(max(r2.v, 1e-12));
  let rJ: J2 = j2fn(r2, r0, 0.5 / r0, -0.25 / (r0 * r0 * r0));
  var out: RippleJets;
  out.psi = j2scale(rJ, RIP_F);
  return out;
}
// the lighting as a function of psi at this pixel: the normal from the height's
// gradient with the radial direction frozen at the centre
fn rippleLighting(psi: f32, dir: vec2f, viewer: vec3f, light: vec3f) -> vec2f {
  let c: f32 = RIP_A * RIP_F * cos(psi);
  let n: vec3f = normalize(vec3f(dir.x * c, dir.y * c, 1.0));
  let LN: f32 = max(dot(light, n), 0.0);
  let R: vec3f = 2.0 * LN * n - light;
  let spec: f32 = pow(max(dot(R, viewer), 0.0), 50.0);
  return vec2f(LN, spec);
}
// Gauss-Legendre 8 nodes and weights by index, without an indexed array
fn glx8(k: i32) -> f32 {
  var v: f32 = -0.9602898564975363;
  if (k == 1) { v = -0.7966664774136267; } else if (k == 2) { v = -0.5255324099163290; } else if (k == 3) { v = -0.1834346424956498; }
  else if (k == 4) { v = 0.1834346424956498; } else if (k == 5) { v = 0.5255324099163290; } else if (k == 6) { v = 0.7966664774136267; } else if (k == 7) { v = 0.9602898564975363; }
  return v;
}
fn glw8(k: i32) -> f32 {
  var v: f32 = 0.1012285362903763;
  if (k == 1 || k == 6) { v = 0.2223810344533745; } else if (k == 2 || k == 5) { v = 0.3137066458778873; } else if (k == 3 || k == 4) { v = 0.3626837833783620; }
  return v;
}
// the probability under N(0, sigma^2) of the intersection of two half-lines
// given as (coefficient, offset): the set c sigma + d >= 0
fn halfLineProb(c: f32, d: f32, sig: f32) -> f32 {
  if (abs(c) < 1e-30) { return select(0.0, 1.0, d >= 0.0); }
  let a: f32 = -d / c;
  return select(1.0 - Phi(a / sig), Phi(a / sig), c < 0.0);
}
fn halfLinesProb(c1: f32, d1: f32, c2: f32, d2: f32, sig: f32) -> f32 {
  var lo: f32 = -1e30;
  var hi: f32 = 1e30;
  if (abs(c1) < 1e-30) { if (d1 < 0.0) { return 0.0; } } else if (c1 > 0.0) { lo = max(lo, -d1 / c1); } else { hi = min(hi, -d1 / c1); }
  if (abs(c2) < 1e-30) { if (d2 < 0.0) { return 0.0; } } else if (c2 > 0.0) { lo = max(lo, -d2 / c2); } else { hi = min(hi, -d2 / c2); }
  if (hi <= lo) { return 0.0; }
  return Phi(hi / sig) - Phi(lo / sig);
}
`;
export const RIPPLES_LINE = /* wgsl */ `// the line quadrature across the ripple: on each line perpendicular to grad psi
// the phase is psi(tau) plus the first-order tilt H_TP tau p, the displaced
// checker edges are half-lines in the perpendicular coordinate p, and the
// lighting is taken at the line's centre. Along tau the integrand has a step
// wherever an edge crosses the line family's axis (a root of d0(tau)), sharp
// when the edge runs nearly parallel to the lines: the integral is split at
// those roots and each piece, at most half a pixel wide, takes eight
// Gauss-Legendre nodes (measured on the CPU: 1.8e-4 worst on the near field at
// 72 to 88 nodes a pixel; a smoothstep map clustering the nodes at the ends
// was worse, since the steps' layers are 0.1 px wide, not 0.001)
fn psiAlong(psi0: f32, gpsi: f32, Hpp: f32, tau: f32) -> f32 { return psi0 + gpsi * tau + 0.5 * Hpp * tau * tau; }
// an edge's d0 along tau: (delta + A sin psi)(1 + rT tau) + gT tau
fn edgeD0(dd: f32, A: f32, gT: f32, rT: f32, psi0: f32, gpsi: f32, Hpp: f32, tau: f32) -> f32 {
  return (dd + A * sin(psiAlong(psi0, gpsi, Hpp, tau))) * (1.0 + rT * tau) + gT * tau;
}
fn ripplesLine(J: Jets, R: RippleJets, eu: EdgeRange, ev: EdgeRange, rr: vec2f, dir: vec2f, dirX: vec2f, dirY: vec2f, viewer: vec3f, light: vec3f, Au: f32, Av: f32, S: f32, mode: u32) -> f32 {
  let sig: f32 = sqrt(S);
  let gpsi: f32 = length(R.psi.g);
  var eT: vec2f = vec2f(1.0, 0.0);
  if (gpsi > 1e-9) { eT = R.psi.g / gpsi; }
  let eP: vec2f = vec2f(-eT.y, eT.x);
  let Hpp: f32 = R.psi.H.x * eT.x * eT.x + 2.0 * R.psi.H.y * eT.x * eT.y + R.psi.H.z * eT.y * eT.y;
  let Htp: f32 = R.psi.H.x * eT.x * eP.x + R.psi.H.y * (eT.x * eP.y + eT.y * eP.x) + R.psi.H.z * eT.y * eP.y;
  // the radial direction's variation along the nodes (its variation along a line,
  // and the lighting's, integrate to under 2e-5 and are dropped)
  let dirT: vec2f = vec2f(dot(dirX, eT), dot(dirY, eT));
  let Lt: f32 = 4.0 * sig;
  let nu: i32 = i32(eu.hhi - eu.hlo) + 1;
  let nv: i32 = i32(ev.hhi - ev.hlo) + 1;
  let rT: f32 = dot(rr, eT);
  let gTu: f32 = dot(J.gu, eT);
  let gTv: f32 = dot(J.gv, eT);
  let psi0: f32 = R.psi.v;
  // the breakpoints: every edge's roots of d0 on [-Lt, Lt], by sign changes on a
  // grid of 96 cells and eight bisections; at most 64 kept (a folded edge near the
  // spectral boundary crosses about three times a ripple period)
  var bp: array<f32, 64>;
  var nbp: i32 = 0;
  let NG: i32 = 96;
  let dg: f32 = 2.0 * Lt / f32(NG);
  for (var ie: i32 = 0; ie < nu + nv; ie++) {
    var dd: f32 = J.u0 - 0.5 * (eu.hlo + f32(ie));
    var A: f32 = Au;
    var gT: f32 = gTu;
    if (ie >= nu) { dd = J.v0 - 0.5 * (ev.hlo + f32(ie - nu)); A = Av; gT = gTv; }
    var ta: f32 = -Lt;
    var fa: f32 = edgeD0(dd, A, gT, rT, psi0, gpsi, Hpp, ta);
    for (var ig: i32 = 1; ig <= NG; ig++) {
      let tb: f32 = -Lt + f32(ig) * dg;
      let fb: f32 = edgeD0(dd, A, gT, rT, psi0, gpsi, Hpp, tb);
      if ((fa < 0.0) != (fb < 0.0) && nbp < 64) {
        var lo: f32 = ta;
        var hi: f32 = tb;
        var flo: f32 = fa;
        for (var it: i32 = 0; it < 8; it++) {
          let tm: f32 = 0.5 * (lo + hi);
          let fm: f32 = edgeD0(dd, A, gT, rT, psi0, gpsi, Hpp, tm);
          if ((fm < 0.0) == (flo < 0.0)) { lo = tm; flo = fm; } else { hi = tm; }
        }
        bp[nbp] = 0.5 * (lo + hi);
        nbp += 1;
      }
      ta = tb;
      fa = fb;
    }
  }
  var acc: f32 = 0.0;
  var norm: f32 = 0.0;
  var a: f32 = -Lt;
  let W0: f32 = 0.5; // the widest piece, in pixels
  for (var seg: i32 = 0; seg < 96; seg++) {
    if (a >= Lt - 1e-6) { break; }
    var b: f32 = min(a + W0, Lt);
    for (var i: i32 = 0; i < nbp; i++) {
      let t: f32 = bp[i];
      if (t > a + 1e-5 && t < b) { b = t; }
    }
    let wid: f32 = b - a;
    for (var kq: i32 = 0; kq < 8; kq++) {
      let tau: f32 = a + 0.5 * wid * (1.0 + glx8(kq));
      let wq: f32 = glw8(kq) * 0.5 * wid * 0.3989422804014327 * exp(-0.5 * tau * tau / S) / sig;
      norm += wq;
      WORK += 1.0; // a line node: three lighting evaluations and the edges' half-line terms
      let psiT: f32 = psiAlong(psi0, gpsi, Hpp, tau);
      let kap: f32 = Htp * tau; // d psi / d p on this line
      let sh: f32 = sin(psiT);
      let ch: f32 = cos(psiT);
      let dT: vec2f = dir + dirT * tau;
      let l0: vec2f = rippleLighting(psiT, dT, viewer, light);
      if (mode == 10u) { acc += wq * (l0.x * 0.5 + l0.y); continue; }
      // the displacement on the line is Au (sh + ch kap p) to first order in p
      let tu: f32 = Au * ch * kap;
      let tv: f32 = Av * ch * kap;
      var e: f32 = eu.low * ev.low;
      for (var ih: i32 = 0; ih < nu; ih++) {
        let h: f32 = eu.hlo + f32(ih);
        let du: f32 = J.u0 - 0.5 * h + Au * sh;
        let nvec: vec2f = J.gu + du * rr;
        let d0: f32 = du + dot(nvec, eT) * tau;
        let np: f32 = dot(nvec, eP) + tu;
        let ju: f32 = select(-2.0, 2.0, abs(h - 2.0 * round(0.5 * h)) < 0.5);
        e += ev.low * ju * halfLineProb(np, d0, sig);
        for (var ik: i32 = 0; ik < nv; ik++) {
          let k: f32 = ev.hlo + f32(ik);
          let dv: f32 = J.v0 - 0.5 * k + Av * sh;
          let mvec: vec2f = J.gv + dv * rr;
          let c0: f32 = dv + dot(mvec, eT) * tau;
          let mp: f32 = dot(mvec, eP) + tv;
          let jv: f32 = select(-2.0, 2.0, abs(k - 2.0 * round(0.5 * k)) < 0.5);
          e += ju * jv * halfLinesProb(np, d0, mp, c0, sig);
        }
      }
      for (var ik: i32 = 0; ik < nv; ik++) {
        let k: f32 = ev.hlo + f32(ik);
        let dv: f32 = J.v0 - 0.5 * k + Av * sh;
        let mvec: vec2f = J.gv + dv * rr;
        let c0: f32 = dv + dot(mvec, eT) * tau;
        let mp: f32 = dot(mvec, eP) + tv;
        let jv: f32 = select(-2.0, 2.0, abs(k - 2.0 * round(0.5 * k)) < 0.5);
        e += eu.low * jv * halfLineProb(mp, c0, sig);
      }
      acc += wq * (l0.x * (0.5 + 0.5 * e) + l0.y);
    }
    a = b;
  }
  return acc / max(norm, 1e-12);
}
`;
export const RIPPLES_SPECTRAL = /* wgsl */ `// the spectral path: recipes (k, l, p) over the checker's odd sublattice, each
// shifted by p w, w = grad psi / 2 pi, with the lighting's spectrum over psi and
// the displacement's Jacobi-Anger sidebands. The mean and the lighting's own
// harmonics come first and the shifts run from p = 0 outward, so a partial sum
// (regime 4) has dropped only the weakest recipes
fn ripplesSpectral(J: Jets, R: RippleJets, dir: vec2f, viewer: vec3f, light: vec3f, Au: f32, Av: f32, S: f32) -> vec2f {
  // the lighting is a function of cos psi (the normal tilts along the frozen radial
  // direction), so its spectrum is real and even: sample it once over [0, pi] and
  // take the cosine sums, L_m = (1 / N) sum_j L(psi_j) cos(m psi_j)
  var Ls: array<f32, 32>;
  var Ss: array<f32, 32>;
  for (var jj: i32 = 0; jj < RIP_SAMPLES; jj++) {
    let ps: f32 = PI * (f32(jj) + 0.5) / f32(RIP_SAMPLES);
    let ls: vec2f = rippleLighting(ps, dir, viewer, light);
    Ls[jj] = ls.x;
    Ss[jj] = ls.y;
  }
  var Lc: array<f32, 13>;
  var Sc: array<f32, 13>;
  for (var m: i32 = 0; m <= RIP_M; m++) {
    var lr: f32 = 0.0;
    var sr: f32 = 0.0;
    for (var jj: i32 = 0; jj < RIP_SAMPLES; jj++) {
      let cm: f32 = cos(f32(m) * PI * (f32(jj) + 0.5) / f32(RIP_SAMPLES));
      lr += Ls[jj] * cm;
      sr += Ss[jj] * cm;
    }
    Lc[m] = lr / f32(RIP_SAMPLES);
    Sc[m] = sr / f32(RIP_SAMPLES);
  }
  // the lighting harmonics above the cut bound the shifts worth visiting
  var mEff: i32 = 0;
  for (var m: i32 = 1; m <= RIP_M; m++) {
    if (abs(Lc[m]) > 1e-4) { mEff = m; }
  }
  // the recipes' phases are 2 pi (k u + l v) + p psi on the undisplaced counts: the
  // displacement is already expanded into the sidebands, so the rates and the
  // curvatures come from J, not from the displaced jets
  let wpsi: vec2f = R.psi.g / TAU;
  var acc: f32 = 0.5 * Lc[0] + Sc[0]; // the mean: E[1] = 1
  // the lighting's harmonics at the checker's mean, p and -p together (real coefficients)
  for (var ip: i32 = 1; ip <= RIP_M; ip++) {
    let cr0: f32 = 0.5 * Lc[ip] + Sc[ip];
    if (abs(cr0) < 1e-6) { continue; }
    let bb0: vec2f = f32(ip) * R.psi.g;
    let qq0: vec3f = f32(ip) * R.psi.H;
    let lam0: f32 = sqrt(qq0.x * qq0.x + 2.0 * qq0.y * qq0.y + qq0.z * qq0.z);
    let reach0: f32 = TAU * 1.6 * sqrt(1.0 + S * S * lam0 * lam0);
    if (dot(bb0, bb0) > reach0 * reach0) { continue; }
    acc += 2.0 * cr0 * multRe(f32(ip) * R.psi.v, bb0, qq0, S);
  }
  // the odd sublattice (k, l) = (2 a + 1, 2 b + 1): basis 2 gu, 2 gv, offset gu + gv
  let Lat: Lattice = reduceLattice(2.0 * J.gu, 2.0 * J.gv);
  let off: vec2f = J.gu + J.gv;
  let Rr: f32 = latticeReach(J, S);
  let n1: f32 = length(Lat.b1);
  let e1: vec2f = Lat.b1 / max(n1, 1e-30);
  let ePerp: vec2f = vec2f(-e1.y, e1.x);
  let sPerp: f32 = dot(Lat.b2, ePerp); // signed: the rows' spacing across b1
  let b2Par: f32 = dot(Lat.b2, e1);
  if (n1 < 1e-4 || abs(sPerp) < 1e-4) { return vec2f(acc, 4.0); }
  var tried: i32 = 0;
  var exhausted: bool = false;
  let pMax: i32 = mEff + RIP_NB;
  for (var pp: i32 = 0; pp <= pMax; pp++) {
    // this shift's largest possible coefficient: 2 / pi^2 times the lighting harmonics its sidebands reach
    var cb: f32 = 0.0;
    for (var nb: i32 = -RIP_NB; nb <= RIP_NB; nb++) {
      let mm: i32 = abs(pp - nb);
      if (mm <= RIP_M) { cb = max(cb, abs(Lc[mm])); }
    }
    if (cb * 0.2026423672846756 < 1e-5) { continue; }
    let mult: f32 = select(2.0, 1.0, pp == 0); // p > 0 stands for its conjugate -p as well
    let c: vec2f = f32(pp) * wpsi + off;
    let cPerp: f32 = dot(c, ePerp);
    let cPar: f32 = dot(c, e1);
    // the rows n with |n sPerp + cPerp| <= Rr
    let nA: f32 = (-Rr - cPerp) / sPerp;
    let nB: f32 = (Rr - cPerp) / sPerp;
    let nLo: f32 = ceil(min(nA, nB));
    let nHi: f32 = floor(max(nA, nB));
    let nCount: i32 = i32(min(max(nHi - nLo, -1.0), 512.0)) + 1;
    for (var iN: i32 = 0; iN < nCount; iN++) {
      let n: f32 = nLo + f32(iN);
      let dPerp: f32 = n * sPerp + cPerp;
      let hw2: f32 = Rr * Rr - dPerp * dPerp;
      if (hw2 < 0.0) { continue; }
      let hw: f32 = sqrt(hw2);
      let mStar: f32 = -(n * b2Par + cPar) / n1;
      let m0: f32 = ceil(mStar - hw / n1);
      let mEnd: f32 = floor(mStar + hw / n1);
      let mCount: i32 = i32(min(max(mEnd - m0, -1.0), 512.0)) + 1;
      for (var iM: i32 = 0; iM < mCount; iM++) {
        let m: f32 = m0 + f32(iM);
        tried += 1;
        if (tried > 6144) { exhausted = true; break; }
        let ab: vec2f = m * Lat.T0 + n * Lat.T1;
        let k: f32 = 2.0 * ab.x + 1.0;
        let l: f32 = 2.0 * ab.y + 1.0;
        let bb: vec2f = TAU * (k * J.gu + l * J.gv) + f32(pp) * R.psi.g;
        let qq: vec3f = TAU * (k * J.Hu + l * J.Hv) + f32(pp) * R.psi.H;
        let lamT: f32 = sqrt(qq.x * qq.x + 2.0 * qq.y * qq.y + qq.z * qq.z);
        let curv: f32 = 1.0 + S * S * lamT * lamT;
        let reach: f32 = TAU * 1.6 * sqrt(curv);
        if (dot(bb, bb) > reach * reach) { continue; }
        // the term's coefficient bound against its multiplier's bound, before the Bessel sums
        let base: f32 = -2.0 / (PI * PI * k * l);
        let mb: f32 = exp(-0.5 * S * dot(bb, bb) / curv);
        if (abs(base) * cb * mb < 1e-5) { continue; }
        let theta: f32 = TAU * (k * Au + l * Av);
        if (abs(theta) > 8.0) { continue; }
        var cr: f32 = 0.0;
        for (var nb: i32 = -RIP_NB; nb <= RIP_NB; nb++) {
          let mm: i32 = abs(pp - nb);
          if (mm > RIP_M) { continue; }
          cr += base * besselJ(nb, theta) * Lc[mm];
        }
        if (abs(cr) * mb < 1e-5) { continue; }
        let phi0: f32 = TAU * (k * J.u0 + l * J.v0) + f32(pp) * R.psi.v;
        acc += mult * cr * multRe(phi0, bb, qq, S);
      }
      if (exhausted) { break; }
    }
    if (exhausted) { break; }
  }
  return vec2f(acc, select(2.0, 4.0, exhausted));
}
`;
const RIPPLES_ENTRY = /* wgsl */ `// the rippled checkerboard's pixel mean: the line quadrature where the ripple
// is under two cycles a pixel and the pullback holds, the spectral path beyond
fn ripplesMeanH(hu: vec3f, hv: vec3f, hd: vec3f, x: f32, y: f32, period: f32, S: f32, viewer: vec3f, light: vec3f) -> vec2f { return ripplesMeanHMode(hu, hv, hd, x, y, period, S, viewer, light, 0u); }
// mode 7: the line quadrature only (spectral pixels return 0.5), mode 8: the spectral path only
fn ripplesMeanHMode(hu: vec3f, hv: vec3f, hd: vec3f, x: f32, y: f32, period: f32, S: f32, viewer: vec3f, light: vec3f, mode: u32) -> vec2f {
  let sig: f32 = sqrt(S);
  let J: Jets = jetsFromHomography(hu, hv, hd, x, y, period);
  let R: RippleJets = rippleJets(J, period, viewer);
  let s0: f32 = J.u0 * period;
  let t0: f32 = J.v0 * period;
  let r0: f32 = max(sqrt(s0 * s0 + t0 * t0), 1e-9);
  let dir: vec2f = vec2f(s0, t0) / r0;
  // the radial direction's gradient: d dir / dX = (grad s, grad t) / r - (s, t) grad r / r^2, grad r = grad psi / f
  let gr: vec2f = R.psi.g / RIP_F;
  let dirX: vec2f = (J.gu * period - s0 * gr / r0) / r0;
  let dirY: vec2f = (J.gv * period - t0 * gr / r0) / r0;
  let Au: f32 = RIP_A * viewer.x / period;
  let Av: f32 = RIP_A * viewer.y / period;
  let psiRate: f32 = length(R.psi.g) / TAU;
  let p: vec3f = vec3f(x, y, 1.0);
  let D: f32 = dot(hd, p);
  let rr: vec2f = hd.xy / D;
  let eu: EdgeRange = edgeRange(J.u0, J.gu, rr, sig * 1.25);
  let ev: EdgeRange = edgeRange(J.v0, J.gv, rr, sig * 1.25);
  if (psiRate <= 2.0 && eu.ok && ev.ok) {
    if (mode == 8u) { return vec2f(0.5, 1.0); }
    if (mode == 9u) { return vec2f(0.5 + 0.01 * f32(i32(eu.hhi - eu.hlo) + i32(ev.hhi - ev.hlo)), 1.0); }
    return vec2f(ripplesLine(J, R, eu, ev, rr, dir, dirX, dirY, viewer, light, Au, Av, S, mode), 1.0);
  }
  if (mode == 7u) { return vec2f(0.5, 2.0); }
  return ripplesSpectral(J, R, dir, viewer, light, Au, Av, S);
}
`;
// stubs for bisecting a GPU compiler failure: each returns the mean with its regime
export const RIPPLES_LINE_STUB = /* wgsl */ `
fn ripplesLine(J: Jets, R: RippleJets, eu: EdgeRange, ev: EdgeRange, rr: vec2f, dir: vec2f, dirX: vec2f, dirY: vec2f, viewer: vec3f, light: vec3f, Au: f32, Av: f32, S: f32, mode: u32) -> f32 { return 0.5; }
`;
export const RIPPLES_SPECTRAL_STUB = /* wgsl */ `
fn ripplesSpectral(J: Jets, R: RippleJets, dir: vec2f, viewer: vec3f, light: vec3f, Au: f32, Av: f32, S: f32) -> vec2f { return vec2f(0.5, 2.0); }
`;
export const ripplesWith = (line, spectral) => RIPPLES_COMMON + line + spectral + RIPPLES_ENTRY;
const RIPPLES_WGSL = ripplesWith(RIPPLES_LINE, RIPPLES_SPECTRAL);

const LEGACY_WGSL = /* wgsl */ `
// ---------------------------------------------------------------------------
// the Jets entries (WGSL only): the counts to second order, the coverage
// paths Gaussianising the count; kept for callers without a homography and
// for the demo's timing modes
// ---------------------------------------------------------------------------
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
  let sp = checkerSpectral(J, S);
  return vec2f(sp.x, select(4.0, 2.0, sp.y > 0.5));
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
  let sp = circlesSpectral(J, S);
  return vec2f(sp.x, select(4.0, 2.0, sp.y > 0.5));
}
`;

const PORTABLE = PORTABLE_MATH + exactRegions() + PORTABLE_H;
export const OURS_KERNEL_CORE = PORTABLE + LEGACY_WGSL;
export const OURS_KERNEL = OURS_KERNEL_CORE + RIPPLES_WGSL;
export const HAS_WORK_COUNTER = true;
export const OURS_KERNEL_HLSL = HLSL_PRELUDE + toHLSL(PORTABLE);
