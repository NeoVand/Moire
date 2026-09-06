// The exact width of the Selberg bracket (bridge #296, primary sources Akiyama-Tanigawa 2004 and
// Morgenbesser): for one arc [a, b] of the unit circle and degree N, with n = N + 1 and the Fejer
// kernel K_N(x) = (1 / n)[sin(pi n x) / sin(pi x)]^2 of unit circle mass, the majorant S+ and
// minorant S- satisfy S+ - S- = [K_N(x - a) + K_N(x - b)] / n exactly. Checked here with S+ from the
// Beurling construction and S- = 1 - (majorant of the complementary arc).
const NT = 200000;
const B = (x) => { if (Math.abs(x - Math.round(x)) < 1e-6) return Math.round(x) >= 0 ? 1 : -1; /* at and near the integers the series loses all precision against the vanishing sine factor; the limit is sgn, and 1 at zero */ const s = Math.sin(Math.PI * x) / Math.PI; let sum = 2 / x; for (let k = 0; k <= NT; k++) sum += 1 / ((x - k) * (x - k)); for (let k = 1; k <= NT; k++) sum -= 1 / ((x + k) * (x + k)); return s * s * sum; };
const majorant = (alpha, beta, N) => { const d = N + 1; return (x) => { let s = 0; for (let m = -8; m <= 8; m++) { const y = x + m; s += 0.5 * (B(d * (y - alpha)) + B(d * (beta - y))); } return s; }; };
const KN = (N, x) => { const n = N + 1; const s = Math.sin(Math.PI * x); if (Math.abs(s) < 1e-12) return n; const r = Math.sin(Math.PI * n * x) / s; return r * r / n; };
for (const N of [8, 32]) {
  const a = 0.3, b = 0.35, n = N + 1; const Sp = majorant(a, b, N); const Sm = (x) => 1 - majorant(b, a + 1, N)(x);
  let mass = 0; const M = 4000; for (let i = 0; i < M; i++) mass += KN(N, (i + 0.5) / M) / M;
  const line = [`N ${N}: Fejer kernel circle mass ${mass.toFixed(6)}`];
  let maxDev = 0; for (const x of [0.1, 0.29, 0.3, 0.31, 0.325, 0.34, 0.35, 0.36, 0.5, 0.8]) { const w = Sp(x) - Sm(x); const f = (KN(N, x - a) + KN(N, x - b)) / n; maxDev = Math.max(maxDev, Math.abs(w - f)); line.push(`  x ${x}: S+ - S- ${w.toFixed(6)}, [K(x-a) + K(x-b)]/n ${f.toFixed(6)}, S+ - chi ${(Sp(x) - (x >= a && x <= b ? 1 : 0)).toExponential(2)}, chi - S- ${((x >= a && x <= b ? 1 : 0) - Sm(x)).toExponential(2)}`); }
  line.push(`  max deviation of the width identity on these points ${maxDev.toExponential(2)}; one-sided means: S+ ${(() => { let s = 0; for (let i = 0; i < M; i++) s += Sp((i + 0.5) / M) / M; return s; })().toFixed(5)} against b - a + 1/n = ${(b - a + 1 / n).toFixed(5)}, S- ${(() => { let s = 0; for (let i = 0; i < M; i++) s += Sm((i + 0.5) / M) / M; return s; })().toFixed(5)} against b - a - 1/n = ${(b - a - 1 / n).toFixed(5)}`);
  console.log(line.join('\n'));
}
