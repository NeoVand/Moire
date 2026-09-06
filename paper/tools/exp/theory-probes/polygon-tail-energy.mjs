// Tail energy of the Fourier coefficients of a polygon's indicator on the unit torus.
// a_m = int_P exp(-2 pi i m . theta) dtheta by the divergence theorem, edge by edge;
// T(M) = sum_{|m| > M} |a_m|^2 = area - area^2 - sum_{0 < |m| <= M} |a_m|^2 (Parseval).
// Reports T(M) * M / Per at several M: the boundary-mass law predicts a constant.
function coef(P, m) {
  const n = P.length; let re = 0, im = 0;
  const mm = m[0] * m[0] + m[1] * m[1];
  for (let i = 0; i < n; i++) {
    const p = P[i], q = P[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const l = Math.hypot(dx, dy);
    const nx = dy / l, ny = -dx / l;                   // outward normal for counterclockwise P
    const mn = m[0] * nx + m[1] * ny;
    if (mn === 0) continue;
    const md = m[0] * dx + m[1] * dy;                  // m . (q - p)
    const ph = -2 * Math.PI * (m[0] * p[0] + m[1] * p[1]);
    let Ire, Iim;                                      // I_e = int_e exp(-2 pi i m . theta) ds
    if (Math.abs(md) < 1e-12) { Ire = l * Math.cos(ph); Iim = l * Math.sin(ph); }
    else {
      // l * e^{i ph} (e^{-2 pi i md} - 1) / (-2 pi i md)
      const a = -2 * Math.PI * md;
      const ere = Math.cos(a) - 1, eim = Math.sin(a);
      // divide by (i a): (ere + i eim) / (i a) = (eim - i ere) / a
      const dre = eim / a, dim = -ere / a;
      Ire = l * (Math.cos(ph) * dre - Math.sin(ph) * dim);
      Iim = l * (Math.cos(ph) * dim + Math.sin(ph) * dre);
    }
    re += mn * Ire; im += mn * Iim;
  }
  // divide by (-2 pi i |m|^2): (re + i im) / (-2 pi i mm) = (-im + i re) / (2 pi mm)... check: 1/(-i) = i, so (re + i im) * i / (2 pi mm) = (-im + i re) / (2 pi mm)
  return [-im / (2 * Math.PI * mm), re / (2 * Math.PI * mm)];
}
function area(P) { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function perim(P) { let s = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; s += Math.hypot(q[0] - p[0], q[1] - p[1]); } return s; }
function rot(P, deg, c = [0.5, 0.5]) { const t = deg * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t); return P.map(([x, y]) => [c[0] + cs * (x - c[0]) - sn * (y - c[1]), c[1] + sn * (x - c[0]) + cs * (y - c[1])]); }
const shapes = {
  'square 1/2 axis': [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]],
  'square 1/2 rot 20': rot([[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]], 20),
  'triangle': [[0.2, 0.2], [0.8, 0.3], [0.4, 0.8]],
  'thin rect 0.8x0.05 rot 33': rot([[0.1, 0.475], [0.9, 0.475], [0.9, 0.525], [0.1, 0.525]], 33),
};
const Ms = [16, 32, 64, 128, 256];
const Mmax = Ms[Ms.length - 1];
for (const [name, P] of Object.entries(shapes)) {
  const A = area(P), Per = perim(P);
  const total = A - A * A;
  // accumulate |a_m|^2 by radius
  const byR = new Map(); let acc = 0;
  const partial = [];
  const rad2 = Mmax * Mmax;
  let energyIn = 0;
  const bins = new Float64Array(Mmax + 2);
  for (let x = -Mmax; x <= Mmax; x++) for (let y = -Mmax; y <= Mmax; y++) {
    if (x === 0 && y === 0) continue;
    const r2 = x * x + y * y; if (r2 > rad2) continue;
    const [re, im] = coef(P, [x, y]);
    const e = re * re + im * im;
    bins[Math.ceil(Math.sqrt(r2))] += e;    // |m| in (k-1, k]
  }
  let cum = 0; const out = [];
  for (let k = 1; k <= Mmax; k++) { cum += bins[k]; if (Ms.includes(k)) out.push([k, total - cum]); }
  console.log(name, 'area', A.toFixed(4), 'Per', Per.toFixed(4), 'energy', total.toFixed(5));
  for (const [M, T] of out) console.log('  M', M, 'tail', T.toExponential(3), 'tail*M/Per', (T * M / Per).toFixed(4));
  // sanity: DC coefficient from the edge formula is not defined (m = 0); check one coefficient against quadrature
}
// check: square [0.25,0.75]^2 at m = (1, 0): a = int_{.25}^{.75} e^{-2 pi i x} dx * 0.5 = 0.5 * (sin(2 pi .75) - sin(2 pi .25))/(-2 pi)... compute both
{
  const P = shapes['square 1/2 axis']; const [re, im] = coef(P, [1, 0]);
  const ex = 0.5 * ((Math.sin(2 * Math.PI * 0.75) - Math.sin(2 * Math.PI * 0.25)) / (2 * Math.PI));
  console.log('check m=(1,0): formula', re.toFixed(6), im.toFixed(6), 'exact real part', ex.toFixed(6));
  const [re2, im2] = coef(P, [3, 2]);
  // numeric quadrature
  let qr = 0, qi = 0; const N = 400;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const x = 0.25 + 0.5 * (i + 0.5) / N, y = 0.25 + 0.5 * (j + 0.5) / N; const ph = -2 * Math.PI * (3 * x + 2 * y); qr += Math.cos(ph); qi += Math.sin(ph); }
  qr *= 0.25 / (N * N); qi *= 0.25 / (N * N);
  console.log('check m=(3,2): formula', re2.toExponential(4), im2.toExponential(4), 'quadrature', qr.toExponential(4), qi.toExponential(4));
}
