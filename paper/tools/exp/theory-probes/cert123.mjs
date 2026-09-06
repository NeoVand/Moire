// The collaborator's #123 certificate evaluated on their #122 counterexamples and on the table's points.
const cert = (omega, delta, sigma, T, p = 0.5, q = 0.5) => {
  const a = omega - delta; if (T >= a) return null;
  const N = (delta * delta + Math.sqrt(2 * Math.PI) * delta / sigma) / (3 * (omega - T) * (a - T));
  const fT = Math.exp(-0.5 * sigma * sigma * T * T);
  const IT = fT * Math.min(Math.sqrt(Math.PI / 2) / sigma, 1 / (sigma * sigma * T));
  const R = (2 / 3) * fT + (1 / 3) * (1 / a + 1 / omega) * IT;
  const L = -(2 / Math.PI) * (q * Math.log(1 - Math.exp(-0.5 * sigma * sigma * omega * omega)) + p * Math.log(1 - Math.exp(-0.5 * sigma * sigma * a * a)));
  return { N, R, L, total: N + R + L };
};
console.log('#122 example 1: omega 3, delta 2, T 1/2, sigma -> large; exact limiting error 1/12 = 8.33e-2');
for (const s of [10, 100, 1000]) { const c = cert(3, 2, s, 0.5); console.log(`  sigma ${s}: bound ${c.total.toExponential(2)} (N ${c.N.toExponential(2)} R ${c.R.toExponential(1)} L ${c.L.toExponential(1)})`); }
console.log('#122 example 2: omega 41, delta 2 (N = 39), T 1/2; exact limiting error 1/(4 N (N+2)) = ' + (1 / (4 * 39 * 41)).toExponential(2));
for (const s of [1, 10, 100]) { const c = cert(41, 2, s, 0.5); console.log(`  sigma ${s}: bound ${c.total.toExponential(2)}`); }
console.log("table points (sigma 1, T 4), exact error from ladder-exact.mjs in brackets");
const ex = { '1,0.2': 3.68e-3, '1,0.05': 7.5e-4, '1,0.01': 6.65e-5, '2,0.05': 3.77e-4, '2,0.01': 4.26e-5, '4,0.05': 1.72e-4, '4,0.01': 2.26e-5, '8,0.05': 1.61e-5, '8,0.01': 1.15e-5 };
for (const [key, e] of Object.entries(ex)) { const [cyc, ratio] = key.split(',').map(Number); const omega = 2 * Math.PI * cyc; const c = cert(omega, ratio * omega, 1, 4); console.log(`  ${cyc} cycles, delta/omega ${ratio}: bound ${c ? c.total.toExponential(2) : 'n/a'} [exact ${e.toExponential(2)}]`); }
