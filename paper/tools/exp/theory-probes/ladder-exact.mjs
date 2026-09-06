// Exact evaluation of the two-arc pixel integral (piecewise constant integrand against a
// Gaussian: a sum of normal CDF differences over the intervals where both arcs are on),
// the exact beat law, and the exact absolute family sum; no quadrature floor.
const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x) { // Abramowitz-Stegun 7.1.26 is too coarse; use a series/continued fraction via erfc
  const t = 1 / (1 + 0.5 * Math.abs(x));
  const y = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? 1 - y : y - 1; // 1.2e-7 accuracy (Numerical Recipes erfc)
}
const TWO_PI = 2 * Math.PI;
// intervals of x in [-L, L] where arc(omega x + alpha) = 1, i.e. (omega x + alpha) mod 2pi in [0, pi)
function onIntervals(omega, alpha, L) {
  const res = [];
  const nMin = Math.floor((omega * -L + alpha) / TWO_PI) - 1, nMax = Math.ceil((omega * L + alpha) / TWO_PI) + 1;
  for (let n = nMin; n <= nMax; n++) {
    const x0 = (TWO_PI * n - alpha) / omega, x1 = (TWO_PI * n + Math.PI - alpha) / omega;
    const a = Math.max(-L, Math.min(x0, x1)), b = Math.min(L, Math.max(x0, x1));
    if (b > a) res.push([a, b]);
  }
  return res;
}
function exactProduct(omega, delta, sigma, alpha, beta) {
  const L = 8 * sigma; const A = onIntervals(omega, alpha, L), B = onIntervals(omega - delta, beta, L);
  let v = 0; let j = 0;
  for (const [a0, a1] of A) {
    for (const [b0, b1] of B) { const lo = Math.max(a0, b0), hi = Math.min(a1, b1); if (hi > lo) v += Phi(hi / sigma) - Phi(lo / sigma); }
  }
  return v;
}
// exact beat law: h(s) = (pi - dist(s, 0)) / 2pi is piecewise linear in x; integrate exactly on the pieces
function exactBeat(delta, sigma, s0) {
  const L = 8 * sigma; // breakpoints where delta x + s0 = k pi
  const pts = [-L, L]; const kMin = Math.floor((delta * -L + s0) / Math.PI) - 1, kMax = Math.ceil((delta * L + s0) / Math.PI) + 1;
  for (let k = kMin; k <= kMax; k++) { const x = (k * Math.PI - s0) / delta; if (x > -L && x < L) pts.push(x); }
  pts.sort((p, q) => p - q);
  const h = (x) => { let s = (delta * x + s0) % TWO_PI; if (s < 0) s += TWO_PI; const d = Math.min(s, TWO_PI - s); return (Math.PI - d) / TWO_PI; };
  const phi = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(TWO_PI);
  let v = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1]; if (b - a < 1e-12) continue;
    const m = 0.5 * (a + b); const ha = h(m) - (h(m + 1e-7) - h(m - 1e-7)) / 2e-7 * (m - a); // affine A + D x on the piece
    const D = (h(m + 1e-7) - h(m - 1e-7)) / 2e-7; const Acoef = h(m) - D * m;
    v += Acoef * (Phi(b / sigma) - Phi(a / sigma)) + D * sigma * (phi(a / sigma) - phi(b / sigma));
  }
  return v;
}
function absFamilySum(omega, delta, sigma, K) {
  const a = (k) => (k === 0 ? 0.5 : (k % 2 ? 1 / (Math.PI * Math.abs(k)) : 0));
  let s = 0; const w1 = omega - delta;
  for (let k = -K; k <= K; k++) {
    // only l with |k omega + l w1| <= 12/sigma matter; enumerate that range
    const lc = -k * omega / w1, half = 12 / (sigma * w1);
    for (let l = Math.floor(lc - half); l <= Math.ceil(lc + half); l++) { if (k + l === 0) continue; const r = k * omega + l * w1; s += a(k) * a(l) * Math.exp(-0.5 * sigma * sigma * r * r); }
  }
  return s;
}
console.log('cycles/sigma delta/omega  exactWorstError(30 phase pairs)  absoluteFamilySum(K=4000)');
for (const cyc of [1, 2, 4, 8]) for (const ratio of [0.2, 0.05, 0.01]) {
  const omega = TWO_PI * cyc, delta = ratio * omega, sigma = 1;
  let worst = 0;
  for (const alpha of [0, 0.7, 1.9, 3.1, 4.4, 5.6]) for (const beta of [0.2, 1.3, 2.6, 3.9, 5.1]) {
    const e = Math.abs(exactProduct(omega, delta, sigma, alpha, beta) - exactBeat(delta, sigma, alpha - beta)); if (e > worst) worst = e;
  }
  console.log(cyc, ratio, worst.toExponential(2), absFamilySum(omega, delta, sigma, 4000).toExponential(2));
}
