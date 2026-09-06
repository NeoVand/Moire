// The signed first correction of #246 written out for characters and checked on
// the checkerboard: under the affine model v = m_v + b_v . Z, w = m_w + b_w . Z
// (half-period counts), the checker is 1/2 - (8 / pi^2) sum_{odd p, q} sin(pi p v) sin(pi q w) / (p q),
// each product a pair of characters cos(phi + theta . Z) with theta = pi (p b_v -+ q b_w);
// the Gaussian mean of a character is cos(phi) exp(-|theta|^2 / 2), and the corrected mean
// E[cos(phi + theta . Z) (1 + (k . Z)(3 - |Z|^2))] = exp(-|theta|^2 / 2) [cos(phi) - sin(phi)(k . theta)(|theta|^2 - 1)],
// from E[Z_j e^{i theta . Z}] = i theta_j e^{-|theta|^2 / 2} and E[Z_j |Z|^2 e^{i theta . Z}] = i theta_j (4 - |theta|^2) e^{-|theta|^2 / 2} in two dimensions.
// The series is compared with the Monte Carlo of the affine mean, the corrected mean, and the true rational mean.
const SIGMA = 0.5, LN = 0.7602859212697056, C2 = 1.892;
const hu = [-50, 0, 12000], hv = [0, 0, -12000], hd = [0, 1, 1];
const dotp = (a, x, y) => a[0] * x + a[1] * y + a[2];
const data = (hn, x0, y0) => { const N0 = dotp(hn, x0, y0) / 10, D0 = dotp(hd, x0, y0); const n = [SIGMA * hn[0] / 10, SIGMA * hn[1] / 10], d = [SIGMA * hd[0], SIGMA * hd[1]]; const m = N0 / D0, k = [d[0] / D0, d[1] / D0]; return { m, k, b: [n[0] / D0 - m * k[0], n[1] / D0 - m * k[1]], N0, D0, n, d }; };
// the series: mean and corrected mean of the checker under the affine model
const series = (cv, cw, corrected) => {
  const k = cv.k; let s = 0; const P = 41;
  for (let p = 1; p <= P; p += 2) for (let q = 1; q <= P; q += 2) {
    let term = 0;
    for (const sgn of [-1, 1]) { // cos(pi (p v - q w)) - cos(pi (p v + q w)), halved
      const th = [Math.PI * (p * cv.b[0] + sgn * q * cw.b[0]), Math.PI * (p * cv.b[1] + sgn * q * cw.b[1])];
      const phi = Math.PI * (p * cv.m + sgn * q * cw.m);
      const t2 = th[0] * th[0] + th[1] * th[1];
      const g = Math.exp(-t2 / 2);
      if (g < 1e-14) continue;
      const val = corrected ? g * (Math.cos(phi) - Math.sin(phi) * (k[0] * th[0] + k[1] * th[1]) * (t2 - 1)) : g * Math.cos(phi);
      term += (sgn < 0 ? 0.5 : -0.5) * val;
    }
    s += term / (p * q);
  }
  return 0.5 - (8 / (Math.PI * Math.PI)) * s;
};
let seed = 99; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => { const u1 = rnd(), u2 = rnd(); const r = Math.sqrt(-2 * Math.log(1 - u1)); return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)]; };
const checker = (v, w) => ((Math.floor(v) + Math.floor(w)) & 1);
console.log('pixel: series affine / corrected; Monte Carlo affine / corrected / true rational (1M samples, noise about 0.0005); certified |corrected - true| <= C2 |k|^2 (in the checker\'s unit range)');
for (const [x, y] of [[0, 8], [120, 8], [0, 14], [120, 14], [0, 20], [120, 20], [0, 40], [120, 40], [60, 80], [120, 140]]) {
  const cv = data(hu, x, y), cw = data(hv, x, y);
  const sA = series(cv, cw, false), sC = series(cv, cw, true);
  const N = 1000000; let mA = 0, mC = 0, mT = 0;
  for (let i = 0; i < N; i++) {
    const Z = gauss();
    const ratio = (c) => (c.N0 + c.n[0] * Z[0] + c.n[1] * Z[1]) / (c.D0 + c.d[0] * Z[0] + c.d[1] * Z[1]);
    const aff = (c) => c.m + c.b[0] * Z[0] + c.b[1] * Z[1];
    const fA = checker(aff(cv), aff(cw)); const kz = cv.k[0] * Z[0] + cv.k[1] * Z[1];
    mA += fA; mC += fA * (1 + kz * (3 - Z[0] * Z[0] - Z[1] * Z[1])); mT += checker(ratio(cv), ratio(cw));
  }
  mA /= N; mC /= N; mT /= N;
  const nk = Math.hypot(cv.k[0], cv.k[1]);
  // the bound is checked on the common-sample difference, whose noise is far below the means' own noise
  console.log(`(${x}, ${y}) |k| ${nk.toFixed(4)}: series ${sA.toFixed(5)} / ${sC.toFixed(5)}; MC ${mA.toFixed(5)} / ${mC.toFixed(5)} / ${mT.toFixed(5)}; common-sample |corrected - true| ${Math.abs(mC - mT).toFixed(5)} bound ${(C2 * nk * nk).toFixed(5)}; |affine - true| ${Math.abs(mA - mT).toFixed(5)}; series against MC (affine) ${Math.abs(sA - mA).toFixed(5)}`);
}
