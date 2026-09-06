// Bracket acquisition under the query family: a material F with certified per-cell brackets F_lo <= F <= F_hi has, for every query q = N(m, Q)
// with q_- I <= Q <= q_+ I and |m| <= L, 0 <= E_q F - E_q F_lo <= E_q (F_hi - F_lo) <= gap_W / (2 pi q_-) + exp(-(R - L)^2 / (2 q_+)),
// gap_W = sum_C (u_C - l_C) |C| over the window [-R, R]^2. Test material: F = 1_{|z - c| <= r} (1/2 + sin(2x)/4 + cos(2y)/4), values in [0, 1],
// gradient bound |grad F| <= sqrt(2)/2 (so oscillation <= h on a cell of side h), Hessian norm <= 1 (Taylor affine bracket with error h^2/4).
// Cells meeting the circle get the bracket [0, 1]; cells outside the disc [0, 0]. Ordinary doubles; a derivation check.
const R = 3, c = [0.4, -0.2], r = 1.7, m = [0.5, -0.3], Qs = 0.5; // Q = Qs I, so q_- = q_+ = Qs
const L = Math.hypot(...m);
const F = (x, y) => (Math.hypot(x - c[0], y - c[1]) <= r ? 0.5 + 0.25 * Math.sin(2 * x) + 0.25 * Math.cos(2 * y) : 0);
const gradF = (x, y) => [0.5 * Math.cos(2 * x), -0.5 * Math.sin(2 * y)];
function cellClass(x0, x1, y0, y1) { // distance range from c to the closed rectangle: 'in' (whole cell inside disc), 'out', or 'J'
  const dx = Math.max(x0 - c[0], 0, c[0] - x1), dy = Math.max(y0 - c[1], 0, c[1] - y1); const dmin = Math.hypot(dx, dy);
  const dmax = Math.hypot(Math.max(Math.abs(x0 - c[0]), Math.abs(x1 - c[0])), Math.max(Math.abs(y0 - c[1]), Math.abs(y1 - c[1])));
  return dmax <= r ? 'in' : (dmin > r ? 'out' : 'J');
}
// Gaussian query mass computations
const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const Phi = x => 0.5 * (1 + erf(x / Math.SQRT2));
const massIn = (a, b, mu, s) => Phi((b - mu) / s) - Phi((a - mu) / s);
const s = Math.sqrt(Qs);
const outsideSquare = 1 - massIn(-R, R, m[0], s) * massIn(-R, R, m[1], s);
console.log(`query N(m, ${Qs} I), |m| = ${L.toFixed(4)}: mass outside [-R, R]^2 = ${outsideSquare.toExponential(3)}, bound exp(-(R - L)^2 / (2 q_+)) = ${Math.exp(-((R - L) ** 2) / (2 * Qs)).toExponential(3)}`);
const density = (x, y) => Math.exp(-((x - m[0]) ** 2 + (y - m[1]) ** 2) / (2 * Qs)) / (2 * Math.PI * Qs);
// fine quadrature of E_q F and of E_q F_lo for each mesh
const NQ = 2400, hq = 2 * R / NQ; let EqF = 0;
for (let i = 0; i < NQ; i++) for (let j = 0; j < NQ; j++) { const x = -R + (i + 0.5) * hq, y = -R + (j + 0.5) * hq; EqF += density(x, y) * F(x, y) * hq * hq; }
console.log(`E_q F by ${NQ}^2 midpoint quadrature: ${EqF.toFixed(6)}`);
console.log('level | h | J-cells | 8 l_J / h + 4 | constant bracket: gap_W, bound, actual E_q(F - F_lo) | affine bracket: gap_W, bound, actual');
for (let lev = 2; lev <= 7; lev++) {
  const n = 2 ** lev, h = 2 * R / n; let Jc = 0, gapC = 0, gapA = 0;
  const cls = [], aff = [];
  for (let i = 0; i < n; i++) { cls.push([]); aff.push([]); for (let j = 0; j < n; j++) { const x0 = -R + i * h, y0 = -R + j * h; const k = cellClass(x0, x0 + h, y0, y0 + h); cls[i].push(k);
    if (k === 'J') { Jc++; gapC += h * h; gapA += h * h; aff[i].push(null); }
    else if (k === 'in') { gapC += h * h * h; gapA += (h * h / 2) * h * h; const xc = x0 + h / 2, yc = y0 + h / 2; aff[i].push([F(xc, yc), gradF(xc, yc), xc, yc]); }
    else aff[i].push(null); } }
  let errC = 0, errA = 0;
  for (let i = 0; i < NQ; i++) for (let j = 0; j < NQ; j++) { const x = -R + (i + 0.5) * hq, y = -R + (j + 0.5) * hq; const ci = Math.min(n - 1, Math.floor((x + R) / h)), cj = Math.min(n - 1, Math.floor((y + R) / h));
    const k = cls[ci][cj]; const f = F(x, y); const w = density(x, y) * hq * hq; let loC = 0, loA = 0;
    if (k === 'in') { const [fc, g, xc, yc] = aff[ci][cj]; loC = fc - h / 2; loA = fc + g[0] * (x - xc) + g[1] * (y - yc) - h * h / 4; } // constant bracket: centre value minus half the oscillation bound
    errC += w * (f - loC); errA += w * (f - loA); if (f - loC < -1e-12 || f - loA < -1e-12) { console.log('bracket violated at', x, y, k, f, loC, loA); process.exit(1); } }
  const bound = g => g / (2 * Math.PI * Qs) + Math.exp(-((R - L) ** 2) / (2 * Qs));
  console.log(`${lev} | ${h.toFixed(4)} | ${Jc} | ${(8 * 2 * Math.PI * r / h + 4).toFixed(1)} | ${gapC.toFixed(4)} ${bound(gapC).toFixed(4)} ${errC.toFixed(4)} | ${gapA.toFixed(5)} ${bound(gapA).toFixed(5)} ${errA.toFixed(5)}`);
}
