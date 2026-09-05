// The collaborator's first probes (paper/reviews/2026-09-05-integral-compiler/theory-program-review/REVIEW.md):
//   1. affine Gaussian-envelope, quadratic-phase positive control, sweeping anisotropy and conditioning;
//   2. the quadratic-envelope counterexample: the quadratic-form closure against direct integration,
//      sweeping curvature and phase frequency, with the claimed remainder bound checked as an enclosure;
//   6. rational depth conditioning against its quadratic and cubic surrogates across pole distance,
//      with the kernel's 24-node depth quadrature, and explicit refusal where the ball meets the pole.
// Direct integration is a dense grid under the window; errors are absolute on |E| <= 1 quantities.
// usage: node paper/tools/exp/theory-probes/probes-1-2-6.mjs

const S = 0.25; // sigma = 0.5 px, the demo's window
const sig = Math.sqrt(S);

// complex helpers
const C = (re, im = 0) => ({ re, im });
const cadd = (a, b) => C(a.re + b.re, a.im + b.im);
const csub = (a, b) => C(a.re - b.re, a.im - b.im);
const cmul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const cexp = (a) => C(Math.exp(a.re) * Math.cos(a.im), Math.exp(a.re) * Math.sin(a.im));
const csqrt = (a) => { const r = Math.hypot(a.re, a.im); const re = Math.sqrt((r + a.re) / 2); const im = Math.sign(a.im || 1) * Math.sqrt(Math.max(0, (r - a.re) / 2)); return C(re, im); };
const cabs = (a) => Math.hypot(a.re, a.im);

// the closed form of atom-expectation.md for a complex symmetric 2x2 A = I/S + Mr/w^2 - i Q, beta, c:
// E = exp(c) det(S A)^(-1/2) exp(beta^T A^-1 beta / 2)
function closedForm(Mr, Q, beta, c) {
  const A = [[C(1 / S + Mr[0][0], -Q[0][0]), C(Mr[0][1], -Q[0][1])], [C(Mr[0][1], -Q[0][1]), C(1 / S + Mr[1][1], -Q[1][1])]];
  const det = csub(cmul(A[0][0], A[1][1]), cmul(A[0][1], A[0][1]));
  const detS = cmul(C(S * S), det); // det(S A)
  // A^-1 = (1/det) [[A11, -A01], [-A01, A00]]
  const inv = [[cdiv(A[1][1], det), cdiv(C(-A[0][1].re, -A[0][1].im), det)], [cdiv(C(-A[0][1].re, -A[0][1].im), det), cdiv(A[0][0], det)]];
  const Ab = [cadd(cmul(inv[0][0], beta[0]), cmul(inv[0][1], beta[1])), cadd(cmul(inv[1][0], beta[0]), cmul(inv[1][1], beta[1]))];
  const q = cadd(cmul(beta[0], Ab[0]), cmul(beta[1], Ab[1]));
  const arg = cadd(c, C(q.re / 2, q.im / 2));
  return cdiv(cexp(arg), csqrt(detS));
}

// direct integration of f(X) under N(0, S I) on a grid of n^2 over +-6 sigma
function direct(f, n = 601) {
  const L = 6 * sig; const h = 2 * L / n; let re = 0, im = 0, wsum = 0;
  for (let i = 0; i < n; i++) { const x = -L + (i + 0.5) * h; for (let j = 0; j < n; j++) { const y = -L + (j + 0.5) * h; const w = Math.exp(-0.5 * (x * x + y * y) / S); const v = f(x, y); re += w * v.re; im += w * v.im; wsum += w; } }
  return C(re / wsum, im / wsum);
}

// the atom pulled back through u(X) = c0 + J X + (1/2) H[X, X]: envelope exp(-|u - uc|^2 / 2 w^2), phase psi + 2 pi kappa . u
function pullback(c0, J, H, uc, w, kappa, psi) {
  return (x, y) => {
    const u0 = c0[0] + J[0][0] * x + J[0][1] * y + 0.5 * (H[0][0][0] * x * x + 2 * H[0][0][1] * x * y + H[0][1][1] * y * y);
    const u1 = c0[1] + J[1][0] * x + J[1][1] * y + 0.5 * (H[1][0][0] * x * x + 2 * H[1][0][1] * x * y + H[1][1][1] * y * y);
    const env = Math.exp(-((u0 - uc[0]) ** 2 + (u1 - uc[1]) ** 2) / (2 * w * w));
    const ph = psi + 2 * Math.PI * (kappa[0] * u0 + kappa[1] * u1);
    return C(env * Math.cos(ph), env * Math.sin(ph));
  };
}
// the quadratic-form model of the same: M = J^T J + sum_j delta_j H_j, Q = 2 pi sum kappa_j H_j, beta = -J^T delta / w^2 + i 2 pi J^T kappa
function model(c0, J, H, uc, w, kappa, psi) {
  const delta = [c0[0] - uc[0], c0[1] - uc[1]];
  const JtJ = [[J[0][0] ** 2 + J[1][0] ** 2, J[0][0] * J[0][1] + J[1][0] * J[1][1]], [0, J[0][1] ** 2 + J[1][1] ** 2]]; JtJ[1][0] = JtJ[0][1];
  const M = [[0, 0], [0, 0]]; const Q = [[0, 0], [0, 0]];
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { M[a][b] = (JtJ[a][b] + delta[0] * H[0][a][b] + delta[1] * H[1][a][b]) / (w * w); Q[a][b] = 2 * Math.PI * (kappa[0] * H[0][a][b] + kappa[1] * H[1][a][b]); }
  const Jt = [[J[0][0], J[1][0]], [J[0][1], J[1][1]]];
  const beta = [C(-(Jt[0][0] * delta[0] + Jt[0][1] * delta[1]) / (w * w), 2 * Math.PI * (Jt[0][0] * kappa[0] + Jt[0][1] * kappa[1])), C(-(Jt[1][0] * delta[0] + Jt[1][1] * delta[1]) / (w * w), 2 * Math.PI * (Jt[1][0] * kappa[0] + Jt[1][1] * kappa[1]))];
  const c = C(-(delta[0] ** 2 + delta[1] ** 2) / (2 * w * w), psi + 2 * Math.PI * (kappa[0] * c0[0] + kappa[1] * c0[1]));
  // the positivity witness: smallest eigenvalue of I/S + M
  const P = [[1 / S + M[0][0], M[0][1]], [M[0][1], 1 / S + M[1][1]]];
  const tr = P[0][0] + P[1][1], dt = P[0][0] * P[1][1] - P[0][1] ** 2; const lmin = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - dt));
  return { E: closedForm(M, Q, beta, c), lmin, delta };
}
// the remainder bound of atom-expectation.md over the ball of radius 2.5 sigma (envelope terms), times the atom's mass, plus the outside mass
function remainderBound(J, H, delta, w, kappa) {
  const R = 2.5 * sig;
  const nJ = Math.sqrt(J[0][0] ** 2 + J[0][1] ** 2 + J[1][0] ** 2 + J[1][1] ** 2);
  const nH = Math.sqrt(H.flat(2).reduce((s, v) => s + v * v, 0));
  const nd = Math.hypot(delta[0], delta[1]);
  const env = (nJ * nH * R ** 3 + nd * nH * R ** 3 + nH * nH * R ** 4 / 4) / (2 * w * w);
  const phase = 2 * Math.PI * Math.hypot(kappa[0], kappa[1]) * nH * R ** 3 / 6 * 0; // the phase's own cubic term is zero for a quadratic map
  return env + phase + Math.exp(-R * R / (2 * S));
}

console.log('probe 1: affine pullback, closed form against direct integration');
let worst1 = 0;
for (const aniso of [1, 3, 10, 30, 100]) for (const w of [0.3, 1, 3]) for (const kap of [0, 0.3, 1.2]) {
  const J = [[0.4, 0], [0, 0.4 * aniso]]; const H = [[[0, 0], [0, 0]], [[0, 0], [0, 0]]];
  const c0 = [0.2, -0.1], uc = [0, 0.3], kappa = [kap, 0.5 * kap], psi = 0.7;
  const m = model(c0, J, H, uc, w, kappa, psi); const d = direct(pullback(c0, J, H, uc, w, kappa, psi));
  const err = cabs(csub(m.E, d)); if (err > worst1) worst1 = err;
  if (aniso === 100 || w === 0.3) console.log(`  aniso ${aniso} w ${w} kappa ${kap}: |E| ${cabs(d).toExponential(2)} err ${err.toExponential(1)} lmin ${m.lmin.toFixed(2)}`);
}
console.log(`  worst absolute error ${worst1.toExponential(2)} (direct grid 601^2; the grid's own error is about 1e-9)`);

console.log('probe 2: quadratic envelope, the quadratic-form model against direct integration, with the remainder bound as an enclosure');
for (const curv of [0.02, 0.1, 0.3, 1.0]) for (const kap of [0, 0.5]) for (const w of [1, 0.4]) {
  const J = [[0.5, 0.1], [0, 0.7]]; const H = [[[curv, 0.3 * curv], [0.3 * curv, -0.5 * curv]], [[0.2 * curv, 0], [0, curv]]];
  const c0 = [0.1, 0.2], uc = [0, 0], kappa = [kap, 0.3 * kap], psi = 0.2;
  const m = model(c0, J, H, uc, w, kappa, psi); const d = direct(pullback(c0, J, H, uc, w, kappa, psi));
  const err = cabs(csub(m.E, d)); const bound = remainderBound(J, H, m.delta, w, kappa);
  console.log(`  curv ${curv} kappa ${kap} w ${w}: |E| ${cabs(d).toFixed(4)} model err ${err.toExponential(1)} bound ${bound.toExponential(1)} ${err <= bound ? 'inside' : 'OUTSIDE'} lmin ${m.lmin.toFixed(2)}${m.lmin <= 0 ? ' (indefinite: refused)' : ''}`);
}

console.log('probe 6: rational depth phase theta = (a X + b Y + c) / (d + e Y): exact against the quadratic model, the cubic surrogate and the 24-node depth quadrature');
// exact: E = int phi(y) exp(i (b y + c) / (d + e y) - a^2 S / (2 (d + e y)^2)) dy over the depth Gaussian (S the variance), with the transverse integral closed form
function rationalExact(a, b, c, d, e) {
  const n = 40001, L = 7 * sig; let re = 0, im = 0, wsum = 0;
  for (let i = 0; i < n; i++) { const y = -L + (i + 0.5) * (2 * L / n); const den = d + e * y; if (den <= 0) continue; const w = Math.exp(-0.5 * y * y / S); const amp = Math.exp(-a * a * S / (2 * den * den)); const ph = (b * y + c) / den; re += w * amp * Math.cos(ph); im += w * amp * Math.sin(ph); wsum += w; }
  return { E: C(re / wsum, im / wsum), mass: wsum };
}
// the depth quadrature of the kernel (24 Gauss-Legendre nodes over +-4 sigma, the exact phase per node, transverse closed form)
const GL8x = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498, 0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
const GL8w = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620, 0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
function depthQuad(a, b, c, d, e) {
  const Lt = 4 * sig; let re = 0, im = 0, wsum = 0;
  for (let q = 0; q < 3; q++) { const A0 = -Lt + q * (2 * Lt / 3), half = Lt / 3; for (let k = 0; k < 8; k++) { const y = A0 + half * (1 + GL8x[k]); const den = d + e * y; const w = GL8w[k] * half * Math.exp(-0.5 * y * y / S); const amp = Math.exp(-a * a * S / (2 * den * den)); const ph = (b * y + c) / den; re += w * amp * Math.cos(ph); im += w * amp * Math.sin(ph); wsum += w; } }
  return C(re / wsum, im / wsum);
}
// the quadratic model: theta's second-order jet in (X, Y) at 0, the multiplier theorem (closed form via the same 2x2 machinery)
function quadModel(a, b, c, d, e) {
  // theta = (aX + bY + c)/(d + eY): theta0 = c/d; grad = (a/d, b/d - c e/d^2); Hessian: XX 0, XY -a e/d^2, YY 2 c e^2/d^3 - 2 b e/d^2
  const g = [a / d, b / d - c * e / (d * d)]; const Hq = [[0, -a * e / (d * d)], [-a * e / (d * d), 2 * c * e * e / (d ** 3) - 2 * b * e / (d * d)]];
  const Mr = [[0, 0], [0, 0]]; const beta = [C(0, g[0]), C(0, g[1])];
  return closedForm(Mr, Hq, beta, C(0, c / d));
}
// the cubic surrogate: third-order jet along Y (the depth), integrated numerically (an Airy-type integral, done by quadrature here)
function cubicModel(a, b, c, d, e) {
  const t0 = c / d, t1 = b / d - c * e / (d * d), t2 = c * e * e / (d ** 3) - b * e / (d * d), t3 = -c * e ** 3 / d ** 4 + b * e * e / d ** 3;
  const gx = a / d, hxy = -a * e / (d * d), hxyy = 2 * a * e * e / (d ** 3);
  const n = 40001, L = 7 * sig; let re = 0, im = 0, wsum = 0;
  for (let i = 0; i < n; i++) { const y = -L + (i + 0.5) * (2 * L / n); const w = Math.exp(-0.5 * y * y / S); const bx = gx + hxy * y + 0.5 * hxyy * y * y; const amp = Math.exp(-0.5 * S * bx * bx); const ph = t0 + t1 * y + t2 * y * y + t3 * y * y * y; re += w * amp * Math.cos(ph); im += w * amp * Math.sin(ph); wsum += w; }
  return C(re / wsum, im / wsum);
}
for (const poleDist of [40, 12, 6, 3, 1.5, 0.8]) {
  const d = poleDist * sig, e = 1; const a = 6, b = 14, c = 30; // rates of a few cycles across the window, a phase of a few radians at the centre
  const ex = rationalExact(a, b, c, d, e); const q = quadModel(a, b, c, d, e); const cu = cubicModel(a, b, c, d, e); const dq = depthQuad(a, b, c, d, e);
  const ballMeetsPole = d / e < 2.5 * sig;
  console.log(`  pole at ${poleDist} sigma: exact |E| ${cabs(ex.E).toFixed(4)} | quadratic err ${cabs(csub(q, ex.E)).toExponential(1)} | cubic err ${cabs(csub(cu, ex.E)).toExponential(1)} | depth quadrature err ${cabs(csub(dq, ex.E)).toExponential(1)}${ballMeetsPole ? ' | the 2.5-sigma ball meets the pole: polynomial bounds refused, the source domain clips at D <= 0' : ''}`);
}
