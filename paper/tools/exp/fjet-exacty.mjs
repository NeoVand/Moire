// Exact vertical conditioning, measured standalone (a reviewer's proposal for the
// horizon row): at fixed Y the perspective is affine in X, so for the circles
// shader the pixel is one outer integral over Y of a sum of erf differences.
// Prints, per pixel, the conditioned value, a fine 2-D reference and the
// compiler's value. node paper/tools/exp/fjet-exacty.mjs (about a minute).
//
// Exact vertical conditioning for the circles shader at a horizon pixel.
// The pixel is the Gaussian average over (dx, dy) of LN * 1{inside a disc}.
// At fixed dy the perspective is affine in dx, so the inside-set is a union
// of intervals in dx and the inner integral is a sum of erf differences;
// the outer integral over dy is done by a fine midpoint rule (the integrand
// oscillates at the t-count's rate, ~ 100 cycles across the pixel at y = 5).
// Reference: a fine 2-D midpoint rule on the indicator itself.
process.env.FJET_LIB = '1';
const yb = await import('./fjet-yb.mjs');
const NUM = yb.NUM;
const cs = yb.CASES.find((c) => c.name === 'circles');
const sig = yb.SIG;
const R = 25 / 3, gap = 5 / 3, d = 2 * R + 2 * gap; // 20
const rc = R / d, cc = (gap + R) / d; // radius and centre in cell units
const LN = 0.76028592126970562; // light.z, normal (0,0,1)
const Phi = (x) => 0.5 * erfc(-x / Math.SQRT2);
function erfc(x) { // Numerical Recipes erfcc, refined: use complementary error via series/continued fraction
  const z = Math.abs(x); const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
// higher-precision erf via Abramowitz-Stegun is 1e-7; use a better one: erf by series/continued fraction (W. J. Cody) is overkill; use Math-based: 
// implement erf with 1e-15 accuracy (Numerical Recipes erf via incomplete gamma is heavy); use the rational approximation of Cody through a small port:
function erfCody(x) {
  // Cody's rational Chebyshev approximation (1969), accuracy ~1e-16
  const a = [3.16112374387056560e00, 1.13864154151050156e02, 3.77485237685302021e02, 3.20937758913846947e03, 1.85777706184603153e-1];
  const b = [2.36012909523441209e01, 2.44024637934444173e02, 1.28261652607737228e03, 2.84423683343917062e03];
  const c = [5.64188496988670089e-1, 8.88314979438837594e00, 6.61191906371416295e01, 2.98635138197400131e02, 8.81952221241769090e02, 1.71204761263407058e03, 2.05107837782607147e03, 1.23033935479799725e03, 2.15311535474403846e-8];
  const dd = [1.57449261107098347e01, 1.17693950891312499e02, 5.37181101862009858e02, 1.62138957456669019e03, 3.29079923573345963e03, 4.36261909014324716e03, 3.43936767414372164e03, 1.23033935480374942e03];
  const p = [3.05326634961232344e-1, 3.60344899949804439e-1, 1.25781726111229246e-1, 1.60837851487422766e-2, 6.58749161529837803e-4, 1.63153871373020978e-2];
  const q = [2.56852019228982242e00, 1.87295284992346725e00, 5.27905102951428412e-1, 6.05183413124413191e-2, 2.33520497626869185e-3];
  const ax = Math.abs(x);
  let res;
  if (ax <= 0.46875) {
    const z = ax * ax; let xn = a[4] * z, xd = z;
    for (let i = 0; i < 3; i++) { xn = (xn + a[i]) * z; xd = (xd + b[i]) * z; }
    res = x * (xn + a[3]) / (xd + b[3]);
    return res;
  } else if (ax <= 4) {
    let xn = c[8] * ax, xd = ax;
    for (let i = 0; i < 7; i++) { xn = (xn + c[i]) * ax; xd = (xd + dd[i]) * ax; }
    res = (xn + c[7]) / (xd + dd[7]);
    const z = Math.floor(ax * 16) / 16; const del = (ax - z) * (ax + z);
    res = Math.exp(-z * z) * Math.exp(-del) * res;
  } else {
    const z = 1 / (ax * ax); let xn = p[5] * z, xd = z;
    for (let i = 0; i < 4; i++) { xn = (xn + p[i]) * z; xd = (xd + q[i]) * z; }
    res = z * (xn + p[4]) / (xd + q[4]);
    res = (0.5641895835477563 - res) / ax;
    const zz = Math.floor(ax * 16) / 16; const del = (ax - zz) * (ax + zz);
    res = Math.exp(-zz * zz) * Math.exp(-del) * res;
  }
  return x < 0 ? -(1 - res) : 1 - res; // erfc -> erf
}
const PhiC = (x) => 0.5 * (1 + erfCody(x / Math.SQRT2));
const fract = (u) => u - Math.floor(u);
// semi-analytic: outer midpoint in dy, inner erf sum in dx
function exactY(x0, y0, N = 400000, L = 6) {
  let total = 0;
  const Y0 = y0 + 1, X0 = x0 - 240;
  for (let i = 0; i < N; i++) {
    const dy = -L * sig + (2 * L * sig * (i + 0.5)) / N;
    const wgt = Math.exp(-0.5 * (dy / sig) ** 2) / (sig * Math.sqrt(2 * Math.PI)) * (2 * L * sig / N);
    const Y = Y0 + dy;
    const t = -12000 / Y;
    const w = fract(t / d);
    const h2 = rc * rc - (w - cc) * (w - cc);
    if (h2 <= 0) continue;
    const h = Math.sqrt(h2);
    // s = -50 (X0 + dx) / Y ; inside iff fract(s/d) in (cc-h, cc+h)
    // dx range: +- L sig -> s range
    const sOf = (dx) => (-50 * (X0 + dx)) / Y;
    const s1 = sOf(-L * sig), s2 = sOf(L * sig);
    const smin = Math.min(s1, s2), smax = Math.max(s1, s2);
    let inner = 0;
    for (let m = Math.floor(smin / d) - 1; m <= Math.ceil(smax / d) + 1; m++) {
      const sa = (m + cc - h) * d, sb = (m + cc + h) * d;
      // dx = -s Y / 50 - X0
      const da = -sb * Y / 50 - X0, db = -sa * Y / 50 - X0; // ordered since Y > 0 -> dx decreasing in s
      const lo = Math.min(da, db), hi = Math.max(da, db);
      inner += PhiC(hi / sig) - PhiC(lo / sig);
    }
    total += wgt * inner;
  }
  return LN * total;
}
// 2-D reference on the shader itself
function ref2D(x0, y0, N = 3000, L = 5.5) {
  let total = 0;
  for (let i = 0; i < N; i++) {
    const dx = -L * sig + (2 * L * sig * (i + 0.5)) / N;
    const wx = Math.exp(-0.5 * (dx / sig) ** 2);
    let row = 0;
    for (let j = 0; j < N; j++) {
      const dy = -L * sig + (2 * L * sig * (j + 0.5)) / N;
      row += Math.exp(-0.5 * (dy / sig) ** 2) * cs.eval(NUM, x0 + dx, y0 + dy, false)[0];
    }
    total += wx * row;
  }
  return total * (2 * L * sig / N) ** 2 / (2 * Math.PI * sig * sig);
}
for (const [x0, y0] of [[240, 5], [300, 12], [30, 5], [240, 20]]) {
  const t0 = Date.now();
  const e1 = exactY(x0, y0, 200000), e2 = exactY(x0, y0, 400000);
  const r1 = ref2D(x0, y0, 2000), r2 = ref2D(x0, y0, 4000);
  const ours = yb.oursPixel(cs, x0, y0, null)[0];
  console.log(`(${x0},${y0}) exactY ${e2.toFixed(6)} (Δ vs half N ${(e2 - e1).toExponential(1)})  ref2D ${r2.toFixed(6)} (Δ ${(r2 - r1).toExponential(1)})  compiler ${ours.toFixed(6)}  compiler-exact ${(ours - e2).toExponential(2)}  ${Date.now() - t0} ms`);
}
