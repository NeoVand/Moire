// Checks of the analytic tail bound: heat content H(s) = sum_m |a_m|^2 (1 - exp(-2 pi^2 s^2 |m|^2)) <= s Per / sqrt(2 pi) (Ledoux),
// and T(M) = sum_{|m| > M} |a_m|^2 <= c(beta) Per / M with c(beta) = sqrt(beta) / (2 pi^{3/2} (1 - exp(-beta))), minimized at exp(beta) - 1 = 2 beta.
import { execSync } from 'node:child_process';
function coef(P, m) {
  const n = P.length; let re = 0, im = 0; const mm = m[0] * m[0] + m[1] * m[1];
  for (let i = 0; i < n; i++) {
    const p = P[i], q = P[(i + 1) % n]; const dx = q[0] - p[0], dy = q[1] - p[1]; const l = Math.hypot(dx, dy);
    const nx = dy / l, ny = -dx / l; const mn = m[0] * nx + m[1] * ny; if (mn === 0) continue;
    const md = m[0] * dx + m[1] * dy; const ph = -2 * Math.PI * (m[0] * p[0] + m[1] * p[1]); let Ire, Iim;
    if (Math.abs(md) < 1e-12) { Ire = l * Math.cos(ph); Iim = l * Math.sin(ph); }
    else { const a = -2 * Math.PI * md; const ere = Math.cos(a) - 1, eim = Math.sin(a); const dre = eim / a, dim = -ere / a;
      Ire = l * (Math.cos(ph) * dre - Math.sin(ph) * dim); Iim = l * (Math.cos(ph) * dim + Math.sin(ph) * dre); }
    re += mn * Ire; im += mn * Iim;
  }
  return [-im / (2 * Math.PI * mm), re / (2 * Math.PI * mm)];
}
const area = P => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const perim = P => { let s = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; s += Math.hypot(q[0] - p[0], q[1] - p[1]); } return s; };
const rot = (P, deg, c = [0.5, 0.5]) => { const t = deg * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t); return P.map(([x, y]) => [c[0] + cs * (x - c[0]) - sn * (y - c[1]), c[1] + sn * (x - c[0]) + cs * (y - c[1])]); };
const shapes = {
  'square 1/2 axis': [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]],
  'square 1/2 rot 20': rot([[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]], 20),
  'triangle': [[0.2, 0.2], [0.8, 0.3], [0.4, 0.8]],
  'thin rect 0.8x0.05 rot 33': rot([[0.1, 0.475], [0.9, 0.475], [0.9, 0.525], [0.1, 0.525]], 33),
};
// the constant
let beta = 1; for (let i = 0; i < 60; i++) { const f = Math.exp(beta) - 1 - 2 * beta, fp = Math.exp(beta) - 2; beta -= f / fp; }
const c = b => Math.sqrt(b) / (2 * Math.pow(Math.PI, 1.5) * (1 - Math.exp(-b)));
console.log('beta*', beta.toFixed(5), 'c(beta*)', c(beta).toFixed(5), 'c(1)', c(1).toFixed(5), 'asymptotic 1/(2 pi^2)', (1 / (2 * Math.PI ** 2)).toFixed(5), 'ratio', (c(beta) / (1 / (2 * Math.PI ** 2))).toFixed(3));
const Mmax = 256;
for (const [name, P] of Object.entries(shapes)) {
  const A = area(P), Per = perim(P); const total = A - A * A;
  const ms = []; // [r2, e]
  for (let x = -Mmax; x <= Mmax; x++) for (let y = -Mmax; y <= Mmax; y++) { if (!x && !y) continue; const r2 = x * x + y * y; if (r2 > Mmax * Mmax) continue; const [re, im] = coef(P, [x, y]); ms.push([r2, re * re + im * im]); }
  const inside = ms.reduce((s, [, e]) => s + e, 0);
  console.log(name, 'Per', Per.toFixed(4), 'energy', total.toFixed(5), 'energy inside radius', Mmax, inside.toFixed(5), 'unaccounted', (total - inside).toExponential(2));
  // heat content check at several s (the lattice sum truncated at Mmax; the unaccounted energy is an upper bound on the truncation error of H)
  for (const s of [1 / 8, 1 / 16, 1 / 32, 1 / 64, 1 / 128]) {
    let H = 0; for (const [r2, e] of ms) H += e * (1 - Math.exp(-2 * Math.PI ** 2 * s * s * r2));
    const bound = s * Per / Math.sqrt(2 * Math.PI);
    console.log('  s', s.toFixed(5), 'H(s)', H.toFixed(6), '+trunc<=', (H + total - inside).toFixed(6), 'Ledoux s Per/sqrt(2pi)', bound.toFixed(6), 'ratio', ((H + total - inside) / bound).toFixed(4));
  }
  // tail check against c(beta*) Per / M
  for (const M of [8, 16, 32, 64, 128]) {
    let T = total; for (const [r2, e] of ms) if (r2 <= M * M) T -= e;
    console.log('  M', M, 'tail', T.toExponential(3), 'bound c* Per/M', (c(beta) * Per / M).toExponential(3), 'ratio', (T / (c(beta) * Per / M)).toFixed(4));
  }
}
