// The smallest test of the correlation the compiler still drops: a curved
// mask 1{xi(z) > 0} with a quadratic amplitude c(z) AND a dependent
// oscillatory factor cos(2 pi eta(z)), both counts quadratic in the pixel
// displacement z ~ N(0, sigma^2 I). The compiler's coverage path integrates
// c with the mask and multiplies by the cosine's own mean (independence).
// This adapter integrates the complete term jointly: eigenframe of the
// mask's Hessian, condition on w1, intervals in w2 from the mask, and on
// each interval the collaborator's gaussianChirpMoments for the amplitude
// moments under the conditional quadratic phase; the outer integral by
// Gauss-Legendre panels cut where roots appear. Reference: a fine 2-D
// midpoint rule on the integrand.
//   node correlated-coverage-adapter.mjs
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
const here = fileURLToPath(new URL('.', import.meta.url));
const { gaussianChirpMoments } = await import(new URL('../author-reply/gaussian-chirp.mjs', import.meta.url).href);
const TAU = 2 * Math.PI;
const sigma = 0.5;
const erf = (x) => { // Abramowitz-Stegun 7.1.26 is not enough; use a series/continued-fraction combo
  const t = 1 / (1 + 0.5 * Math.abs(x));
  const y = 1 - t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? y : -y;
};
// Gauss-Legendre 32 nodes on [-1, 1] by Newton on Legendre polynomials
const gl = (() => { const n = 32, x = [], w = []; for (let i = 0; i < n; i++) { let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)); for (let it = 0; it < 100; it++) { let p0 = 1, p1 = z; for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; } const dp = n * (z * p1 - p0) / (z * z - 1); const dz = p1 / dp; z -= dz; if (Math.abs(dz) < 1e-15) { x.push(z); w.push(2 / ((1 - z * z) * dp * dp)); break; } } } return { x, w }; })();

// a quadratic form in pixel coordinates: v + g.z + z^T H z / 2
const quad = (v, gx, gy, hxx, hxy, hyy) => ({ v, gx, gy, hxx, hxy, hyy, at: (x, y) => v + gx * x + gy * y + 0.5 * (hxx * x * x + 2 * hxy * x * y + hyy * y * y) });
const rotate = (Q, e1, e2) => ({
  // the same form in the frame (w1, w2) = (e1.z, e2.z)
  v: Q.v,
  g1: Q.gx * e1[0] + Q.gy * e1[1], g2: Q.gx * e2[0] + Q.gy * e2[1],
  h11: Q.hxx * e1[0] * e1[0] + 2 * Q.hxy * e1[0] * e1[1] + Q.hyy * e1[1] * e1[1],
  h12: Q.hxx * e1[0] * e2[0] + Q.hxy * (e1[0] * e2[1] + e1[1] * e2[0]) + Q.hyy * e1[1] * e2[1],
  h22: Q.hxx * e2[0] * e2[0] + 2 * Q.hxy * e2[0] * e2[1] + Q.hyy * e2[1] * e2[1],
});

function jointTerm(xi, amp, eta, opts = {}) {
  const S = sigma, L = 6;
  // eigenframe of the mask's Hessian
  const tr = xi.hxx + xi.hyy, disc = Math.sqrt(Math.max(0, ((xi.hxx - xi.hyy) / 2) ** 2 + xi.hxy ** 2));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  let e1 = Math.abs(xi.hxy) > 1e-300 ? [l1 - xi.hyy, xi.hxy] : xi.hxx >= xi.hyy ? [1, 0] : [0, 1];
  const n1 = Math.hypot(e1[0], e1[1]); e1 = [e1[0] / n1, e1[1] / n1]; const e2 = [-e1[1], e1[0]];
  const X = rotate(xi, e1, e2), C = rotate(amp, e1, e2), P = rotate(eta, e1, e2);
  let calls = 0, failed = 0;
  const moments = (lo, hi, beta, q) => {
    calls++;
    const r = gaussianChirpMoments({ a: lo, b: hi, sigma: S, beta, q, normalized: true, absTol: opts.absTol || 1e-11, maxPanels: 1 << 20 });
    if (r.status !== 'estimated-tolerance-met') failed++;
    return r.moments; // [[re,im] x3]
  };
  // the conditional term at w1: sum over intervals of e^{i theta} (A M0 + B M1 + C/2 M2)
  const inner = (w1) => {
    const k = X.v + X.g1 * w1 + 0.5 * X.h11 * w1 * w1; // xi = k + a2 w2 + l2 w2^2 / 2 with a2 = X.g2
    const a2 = X.g2;
    const theta = TAU * (P.v + P.g1 * w1 + 0.5 * P.h11 * w1 * w1);
    const beta = TAU * (P.g2 + P.h12 * w1);
    const q = TAU * P.h22;
    const A = C.v + C.g1 * w1 + 0.5 * C.h11 * w1 * w1, B = C.g2 + C.h12 * w1, Cc = C.h22;
    const intervals = []; // where xi > 0
    if (Math.abs(l2) < 1e-14 * (Math.abs(a2) + 1e-300)) {
      if (Math.abs(a2) < 1e-300) { if (k > 0) intervals.push([-Infinity, Infinity]); }
      else { const r = -k / a2; if (a2 > 0) intervals.push([r, Infinity]); else intervals.push([-Infinity, r]); }
    } else {
      const D = a2 * a2 - 2 * l2 * k;
      if (D < 0) { if (l2 > 0) intervals.push([-Infinity, Infinity]); }
      else {
        const sq = Math.sqrt(D), r1 = (-a2 - sq) / l2, r2 = (-a2 + sq) / l2, lo = Math.min(r1, r2), hi = Math.max(r1, r2);
        if (l2 > 0) { intervals.push([-Infinity, lo]); intervals.push([hi, Infinity]); } // xi > 0 outside the roots when the parabola opens up
        else intervals.push([lo, hi]);
      }
    }
    let re = 0, im = 0;
    const ct = Math.cos(theta), st = Math.sin(theta);
    for (const [lo, hi] of intervals) {
      if (hi - lo <= 0) continue;
      const M = moments(lo, hi, beta, q);
      const vr = A * M[0][0] + B * M[1][0] + 0.5 * Cc * M[2][0];
      const vi = A * M[0][1] + B * M[1][1] + 0.5 * Cc * M[2][1];
      re += ct * vr - st * vi; im += st * vr + ct * vi;
    }
    return [re, im];
  };
  // outer integral over w1: cuts where the discriminant vanishes (roots appear) or the inert indicator jumps
  const cuts = [-L * S, L * S];
  const a2 = X.g2;
  const pushRoots = (A, B, Cq) => { if (Math.abs(A) > 1e-300) { const dd = B * B - 4 * A * Cq; if (dd >= 0) { const sq = Math.sqrt(dd); for (const r of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) if (r > -L * S && r < L * S) cuts.push(r); } } else if (Math.abs(B) > 1e-300) { const r = -Cq / B; if (r > -L * S && r < L * S) cuts.push(r); } };
  if (Math.abs(l2) < 1e-14 * (Math.abs(a2) + 1e-300) && Math.abs(a2) < 1e-300) pushRoots(0.5 * X.h11, X.g1, X.v);
  else if (Math.abs(l2) >= 1e-14 * (Math.abs(a2) + 1e-300)) pushRoots(-l2 * X.h11, -2 * l2 * X.g1, a2 * a2 - 2 * l2 * X.v); // D(w1) = a2^2 - 2 l2 (X.v + X.g1 w1 + X.h11 w1^2 / 2)
  cuts.sort((p, q) => p - q);
  let re = 0, im = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const lo = cuts[i], hi = cuts[i + 1]; if (hi - lo < 1e-300) continue;
    const nsub = Math.max(1, Math.ceil((hi - lo) / (1.5 * S)));
    for (let j = 0; j < nsub; j++) {
      const p0 = lo + (hi - lo) * j / nsub, p1 = lo + (hi - lo) * (j + 1) / nsub, h = 0.5 * (p1 - p0), m = 0.5 * (p1 + p0);
      for (let qq = 0; qq < gl.x.length; qq++) {
        const w1 = m + h * gl.x[qq], wgt = h * gl.w[qq] * Math.exp(-0.5 * (w1 / S) ** 2) / (S * Math.sqrt(TAU));
        const [r, ii] = inner(w1); re += wgt * r; im += wgt * ii;
      }
    }
  }
  return { re, im, calls, failed };
}
const ref2D = (f, N = 3000, L = 6) => { let total = 0; for (let i = 0; i < N; i++) { const dx = -L * sigma + (2 * L * sigma * (i + 0.5)) / N; const wx = Math.exp(-0.5 * (dx / sigma) ** 2); let row = 0; for (let j = 0; j < N; j++) { const dy = -L * sigma + (2 * L * sigma * (j + 0.5)) / N; row += Math.exp(-0.5 * (dy / sigma) ** 2) * f(dx, dy); } total += wx * row; } return total * (2 * L * sigma / N) ** 2 / (TAU * sigma * sigma); };

const cases = [
  // saddle mask from the compiler's coverage gate (eps 0.3, rotated 0.6), constant amplitude, a slow oscillation aligned with the mask's rate
  { name: 'saddle mask x cos, aligned slow phase', xi: null, amp: quad(1, 0, 0, 0, 0, 0), eta: quad(0.1, 0.35, 0.2, 0.05, 0, -0.03) },
  { name: 'saddle mask x quadratic amp x cos, fast phase', xi: null, amp: quad(0.8, 0.3, -0.1, -0.4, 0.2, 0.1), eta: quad(0.3, 1.1, -0.7, 0.2, 0.1, 0.15) },
  { name: 'ridge mask x amp x cos, phase along the ridge', xi: 'ridge', amp: quad(0.6, 0.1, 0.2, 0.1, 0, -0.2), eta: quad(0, 0.5, 0.05, 0, 0, 0.02) },
];
const rot = 0.6, cr = Math.cos(rot), sr = Math.sin(rot);
const rotQuad = (a, b, c, d, e, f, eps) => { // eps (a X'^2 + b X'Y' + c Y'^2 + d X' + e Y' + f)/sigma^2 in pixel coordinates
  const s2 = eps / (sigma * sigma);
  // X' = cr X + sr Y, Y' = -sr X + cr Y
  const hxx = s2 * (2 * a * cr * cr - 2 * b * cr * sr + 2 * c * sr * sr);
  const hyy = s2 * (2 * a * sr * sr + 2 * b * cr * sr + 2 * c * cr * cr);
  const hxy = s2 * (2 * a * cr * sr + b * (cr * cr - sr * sr) - 2 * c * sr * cr);
  const gx = s2 * (d * cr - e * sr), gy = s2 * (d * sr + e * cr);
  return quad(s2 * f, gx, gy, hxx, hxy, hyy);
};
for (const cs of cases) {
  const xi = cs.xi === 'ridge' ? rotQuad(-0.6, 0, -0.02, 0, 0.15, 0.2, 0.3) : rotQuad(0.7, 0.4, -0.3, 0.05, 0, -0.1, 0.3);
  const f = (x, y) => (xi.at(x, y) > 0 ? cs.amp.at(x, y) * Math.cos(TAU * cs.eta.at(x, y)) : 0);
  const t0 = performance.now();
  const ref = ref2D(f);
  const t1 = performance.now();
  const J = jointTerm(xi, cs.amp, cs.eta);
  const t2 = performance.now();
  // the compiler's factorisation: E[amp * mask] times E[cos(2 pi eta)]
  const covAmp = ref2D((x, y) => (xi.at(x, y) > 0 ? cs.amp.at(x, y) : 0));
  const meanCos = ref2D((x, y) => Math.cos(TAU * cs.eta.at(x, y)));
  console.log(JSON.stringify({ case: cs.name, reference: ref, joint: J.re, jointImag: J.im, jointError: J.re - ref, factorized: covAmp * meanCos, factorizedError: covAmp * meanCos - ref, chirpCalls: J.calls, chirpFailures: J.failed, jointMs: +(t2 - t1).toFixed(1), refMs: +(t1 - t0).toFixed(0) }));
}
