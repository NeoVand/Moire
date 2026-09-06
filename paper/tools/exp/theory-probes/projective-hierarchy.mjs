// The finite correction hierarchy of the collaborator's PROJECTIVE-DENSITY.md, section 5,
// checked numerically on the checkerboard: L^j phi = (k . z)^j p_j(t) phi with t = |z|^2,
// p_0 = 1, p_{j+1} = (d + 1 + j - t) p_j + 2 t p_j'; I_p = E[F(A Z) sum_{j <= p} (k . Z)^j p_j(|Z|^2) / j!];
// |I - I_p| <= W |k|^{p+1} / (2 (p + 1)!) E[|Z_1|^{p+1} |p_{p+1}(|Z|^2)|]. Two dimensions.
const d = 2;
// the polynomials p_j as coefficient arrays in t
const polyMul = (a, b) => { const r = new Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { r[i + j] += x * y; })); return r; };
const polyAdd = (a, b) => { const r = new Array(Math.max(a.length, b.length)).fill(0); a.forEach((x, i) => { r[i] += x; }); b.forEach((x, i) => { r[i] += x; }); return r; };
const polyDer = (a) => a.slice(1).map((x, i) => x * (i + 1));
const ps = [[1]];
for (let j = 0; j < 4; j++) { const pj = ps[j]; ps.push(polyAdd(polyMul([d + 1 + j, -1], pj), polyMul([0, 2], polyDer(pj)))); }
const evalP = (c, t) => c.reduce((acc, x, i) => acc + x * Math.pow(t, i), 0);
console.log('p_1 =', ps[1], ' p_2 =', ps[2], ' p_3 =', ps[3]);
// the constants K_{p+1} = E[|Z_1|^{p+1} |p_{p+1}(|Z|^2)|] / (2 (p+1)!) by quadrature
const K = [];
for (let p = 0; p <= 2; p++) { let s = 0; const n = 1600, Lm = 9, h = 2 * Lm / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const x = -Lm + (i + 0.5) * h, y = -Lm + (j + 0.5) * h; const t = x * x + y * y; s += Math.pow(Math.abs(x), p + 1) * Math.abs(evalP(ps[p + 1], t)) * Math.exp(-t / 2) / (2 * Math.PI) * h * h; } let fact = 1; for (let m = 2; m <= p + 1; m++) fact *= m; K.push(s / (2 * fact)); }
console.log('K_1 (affine)', K[0].toFixed(4), ' K_2', K[1].toFixed(4), ' K_3', K[2].toFixed(4));
const SIGMA = 0.5, LN = 0.7602859212697056;
const hu = [-50, 0, 12000], hv = [0, 0, -12000], hd = [0, 1, 1];
const dotp = (a, x, y) => a[0] * x + a[1] * y + a[2];
const data = (hn, x0, y0) => { const N0 = dotp(hn, x0, y0) / 10, D0 = dotp(hd, x0, y0); const n = [SIGMA * hn[0] / 10, SIGMA * hn[1] / 10], dd = [SIGMA * hd[0], SIGMA * hd[1]]; const m = N0 / D0, k = [dd[0] / D0, dd[1] / D0]; return { m, k, b: [n[0] / D0 - m * k[0], n[1] / D0 - m * k[1]], N0, D0, n, d: dd }; };
let seed = 31337; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => { const u1 = rnd(), u2 = rnd(); const r = Math.sqrt(-2 * Math.log(1 - u1)); return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)]; };
const checker = (v, w) => ((Math.floor(v) + Math.floor(w)) & 1);
console.log('common-sample errors |I_p - I| of the checker (unit range) against W K_{p+1} |k|^{p+1} with W = 1, two million samples a pixel');
for (const [x, y] of [[0, 4], [120, 4], [0, 8], [120, 8], [0, 14], [120, 14], [120, 20], [120, 40]]) {
  const cv = data(hu, x, y), cw = data(hv, x, y); const nk = Math.hypot(cv.k[0], cv.k[1]);
  const N = 2000000; let sT = 0; const sI = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const Z = gauss(); const t = Z[0] * Z[0] + Z[1] * Z[1];
    const ratio = (c) => (c.N0 + c.n[0] * Z[0] + c.n[1] * Z[1]) / (c.D0 + c.d[0] * Z[0] + c.d[1] * Z[1]);
    const aff = (c) => c.m + c.b[0] * Z[0] + c.b[1] * Z[1];
    const fA = checker(aff(cv), aff(cw)); const kz = cv.k[0] * Z[0] + cv.k[1] * Z[1];
    sT += checker(ratio(cv), ratio(cw));
    let w = 0, fact = 1;
    for (let p = 0; p <= 2; p++) { if (p > 0) fact *= p; w += Math.pow(kz, p) * evalP(ps[p], t) / fact; sI[p] += fA * w; }
  }
  const errs = sI.map((v) => Math.abs(v - sT) / N); const bounds = K.map((Kp, p) => Kp * Math.pow(nk, p + 1));
  console.log(`(${x}, ${y}) |k| ${nk.toFixed(4)}: |I_0 - I| ${errs[0].toFixed(5)} (bound ${bounds[0].toFixed(5)}), |I_1 - I| ${errs[1].toFixed(5)} (${bounds[1].toFixed(5)}), |I_2 - I| ${errs[2].toFixed(5)} (${bounds[2].toFixed(5)}); at 8 bits in radiance the p = 2 bound is ${(LN * bounds[2] * 256).toFixed(2)} levels`);
}
