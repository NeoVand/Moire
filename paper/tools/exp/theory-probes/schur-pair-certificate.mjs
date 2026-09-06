// Check of the full-Gaussian two-factor truncation certificate (Astra #345/#346) in cycle units.
// Factors: half-square masks on Z^2 and on R Z^2 (rotation by 20 degrees); footprint damping K(k) = exp(-2 pi^2 s^2 |k|^2), Sigma = 4 pi^2 s^2 I.
// Dropped absolute mass D(M) = sum over pairs with |m| > M or |n| > M of |a_m| |b_n| K(m + n), enumerated with |m| <= 256 and K >= 1e-14;
// certificate: K_S [sqrt(T_A(M) T_B(M/2)) + sqrt(T_B(M) T_A(M/2))] + 2 exp(-lam M^2 / 16) K_{S/2} |a|_2 |b|_2,
// with K_S = sqrt(Theta_1 Theta_2), Theta_j = sum_{l in Lambda_j} exp(-l^T Sigma l / 2) (Poisson: the sup over shifts is at zero), lam = 4 pi^2 s^2.
function coef(P, m) {
  const n = P.length; let re = 0, im = 0; const mm = m[0] * m[0] + m[1] * m[1];
  if (mm === 0) { let a = 0; for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return [a / 2, 0]; }
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
const square = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]];
const V = 2, cstar = 0.14070; // variation per unit cell of the half square; c* (rounded; the certificate below also uses the measured tails)
const deg = 20, t = deg * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
const Mmax = 256;
// coefficient magnitudes of both masks (same polygon; the second lives on the rotated lattice, its coefficients indexed by the integer n before rotation)
const mag = new Map(); const key = (x, y) => x * 4096 + y;
const getMag = (x, y) => { const k = key(x, y); let v = mag.get(k); if (v === undefined) { const [re, im] = coef(square, [x, y]); v = Math.hypot(re, im); mag.set(k, v); } return v; };
const energy = r => { let e = 0; for (let x = -Mmax; x <= Mmax; x++) for (let y = -Mmax; y <= Mmax; y++) { if (x * x + y * y > r * r) continue; const v = getMag(x, y); e += v * v; } return e; };
const total = 0.25; // |a|_2^2 = area of the half square (includes the mean)
const Ms = [8, 16, 32, 64, 128];
for (const s of [0.25, 0.5, 1]) {
  const lam = 4 * Math.PI ** 2 * s * s;
  const theta = (sig) => { let T = 0; const R = Math.ceil(Math.sqrt(2 * 40 / sig)) + 1; for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) T += Math.exp(-sig * (x * x + y * y) / 2); return T; };
  const Th = theta(lam), Th2 = theta(lam / 2);   // both lattices are rotations of Z^2, so the theta functions agree
  const reach = Math.sqrt(Math.log(1e14) / (2 * Math.PI ** 2 * s * s));
  // accumulate the absolute pairing by (|m| bin, |n| bin) so the dropped mass for each M is a sum over bins
  const bins = new Map();
  let fullAbs = 0;
  for (let x = -Mmax; x <= Mmax; x++) for (let y = -Mmax; y <= Mmax; y++) {
    const r2 = x * x + y * y; if (r2 > Mmax * Mmax) continue;
    const am = getMag(x, y); if (am === 0) continue;
    const ux = cs * (-x) + sn * (-y), uy = -sn * (-x) + cs * (-y);   // R^T (-m)
    const n0 = Math.round(ux), n1 = Math.round(uy); const rr = Math.ceil(reach) + 1;
    for (let dx = -rr; dx <= rr; dx++) for (let dy = -rr; dy <= rr; dy++) {
      const nx = n0 + dx, ny = n1 + dy; const m2x = cs * nx - sn * ny, m2y = sn * nx + cs * ny;
      const kx = x + m2x, ky = y + m2y; const k2 = kx * kx + ky * ky; if (k2 > reach * reach) continue;
      const bn = getMag(nx, ny); if (bn === 0) continue;
      const w = am * bn * Math.exp(-2 * Math.PI ** 2 * s * s * k2);
      fullAbs += w;
      const bm = Math.ceil(Math.sqrt(r2)), bnn = Math.ceil(Math.sqrt(nx * nx + ny * ny));
      const kk = bm * 1000 + bnn; bins.set(kk, (bins.get(kk) || 0) + w);
    }
  }
  console.log(`s ${s}: Theta(Sigma) ${Th.toFixed(4)} Theta(Sigma/2) ${Th2.toFixed(4)} full absolute pairing ${fullAbs.toFixed(5)} (Schur bound sqrt(Th Th) |a|2 |b|2 = ${(Th * total).toFixed(5)})`);
  for (const M of Ms) {
    let D = 0; for (const [kk, w] of bins) { const bm = Math.floor(kk / 1000), bnn = kk % 1000; if (bm > M || bnn > M) D += w; }
    const TA = total - energy(M), TA2 = total - energy(M / 2);
    const certMeasured = Th * (2 * Math.sqrt(TA * TA2)) + 2 * Math.exp(-lam * M * M / 16) * Th2 * total;
    const certLaw = Th * 2 * Math.SQRT2 * cstar * V / M + 2 * Math.exp(-lam * M * M / 16) * Th2 * total;
    console.log(`  M ${M}: dropped ${D.toExponential(3)}  certificate with measured tails ${certMeasured.toExponential(3)}  with the tail law ${certLaw.toExponential(3)}  ratio ${(D / certLaw).toFixed(4)}`);
  }
}
