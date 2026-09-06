// The corrected ladder bound for two single-arc masks: windows with the Gaussian kept,
// coefficient lower bounds on both indices, carrier leakage, edge remainder. Evaluated at
// the table's points to see where it certifies 8 bits. Also the exact absolute family sum.
const bound = (omega, delta, sigma, T) => {
  if (omega - delta <= T) return null;
  let W = 0;
  for (let n = 1; n <= 200; n++) {
    const den = (n * omega - T) * (n * (omega - delta) - T);
    W += 2 * Math.sqrt(2 * Math.PI) * delta / (Math.PI * Math.PI * sigma * den); // both signs of n
  }
  let L = 0; // carrier leakage, single arcs: |a_k| <= 1/(pi k), |b_0|, |a_0| <= 1
  for (let k = 1; k <= 50; k++) L += (Math.exp(-0.5 * sigma * sigma * k * k * omega * omega) + Math.exp(-0.5 * sigma * sigma * k * k * (omega - delta) ** 2)) / (Math.PI * k);
  const C = (T / omega) ** 2 + 0.7 * (1 + 1 / (sigma * (omega - delta)));
  const R = C * Math.exp(-0.5 * sigma * sigma * T * T);
  return { W, L, R, total: W + L + R };
};
// exact absolute sum of the n != 0 families (a certificate computable per pixel)
const absSum = (omega, delta, sigma) => {
  const a = (k) => (k === 0 ? 0.5 : (k % 2 ? 1 / (Math.PI * Math.abs(k)) : 0));
  let s = 0;
  for (let k = -400; k <= 400; k++) for (let l = -400; l <= 400; l++) {
    if (k + l === 0) continue;
    const r = k * omega + l * (omega - delta);
    s += a(k) * a(l) * Math.exp(-0.5 * sigma * sigma * r * r);
  }
  return s;
};
const meas = { '1,0.2': 3.7e-3, '1,0.05': 7.5e-4, '1,0.01': 6.6e-5, '2,0.05': 3.7e-4, '4,0.05': 1.7e-4, '4,0.01': 6.3e-5, '2,0.2': 3.5e-4, '4,0.2': 1.4e-5 };
console.log('cycles/sigma delta/omega measured absoluteFamilySum closedForm(T=4/sigma) [windows leakage remainder]');
for (const cyc of [1, 2, 4, 8]) for (const ratio of [0.2, 0.05, 0.01]) {
  const omega = 2 * Math.PI * cyc, delta = ratio * omega, sigma = 1;
  const b = bound(omega, delta, sigma, 4 / sigma);
  const m = meas[`${cyc},${ratio}`];
  console.log(cyc, ratio, m ?? '-', absSum(omega, delta, sigma).toExponential(2), b ? `${b.total.toExponential(2)} [${b.W.toExponential(1)} ${b.L.toExponential(1)} ${b.R.toExponential(1)}]` : 'invalid (omega - delta <= T)');
}
// the delta -> 0 limit at fixed omega sigma: the leakage series of #116
for (const cyc of [0.5, 1, 2]) { const w = 2 * Math.PI * cyc; let s = 0; for (let j = 0; j < 20; j++) s += (j % 2 ? -1 : 1) * Math.exp(-0.5 * (2 * j + 1) ** 2 * w * w) / (2 * j + 1); console.log(`delta->0 leakage at ${cyc} cycles/sigma: ${(2 / Math.PI * s).toExponential(2)}`); }
