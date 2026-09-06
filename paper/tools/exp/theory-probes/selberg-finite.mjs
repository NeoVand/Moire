// The finite algebraic Selberg bracket for a one-sided threshold (bridge #297; Vaaler's finite
// formula): n = N + 1, a = arcsin(sqrt(tau / W)) / pi, v_k = pi (k / n)(1 - k / n) cot(pi k / n) + k / n,
//   p_N^{+-}(t) = 1 - 2 a +- 1 / n + sum_{k = 1}^N { -2 v_k sin(2 pi k a) / (pi k) +- (2 / n)(1 - k / n) cos(2 pi k a) } T_k(1 - 2 t / W),
// the even Selberg bracket of the arc [a, 1 - a] of the circle, i.e. of 1{t >= tau}. Checked here:
// the bracket property on a grid of [0, W]; the means against 1 - 2 a +- 1 / n; the width against
// [K_N(x - a) + K_N(x - 1 + a)] / n; and the majorant against the periodized Beurling construction.
const W = 1, tau = 0.4, N = 32, n = N + 1; const a = Math.asin(Math.sqrt(tau / W)) / Math.PI;
const v = (k) => Math.PI * (k / n) * (1 - k / n) / Math.tan(Math.PI * k / n) + k / n;
const T = (k, y) => Math.cos(k * Math.acos(Math.max(-1, Math.min(1, y))));
const p = (sign) => (t) => { let s = 1 - 2 * a + sign / n; for (let k = 1; k <= N; k++) s += (-2 * v(k) * Math.sin(2 * Math.PI * k * a) / (Math.PI * k) + sign * (2 / n) * (1 - k / n) * Math.cos(2 * Math.PI * k * a)) * T(k, 1 - 2 * t / W); return s; };
const pp = p(1), pm = p(-1);
let ok = true, minGapP = Infinity, minGapM = Infinity; const M = 20000; let meanP = 0, meanM = 0; // means against the circle measure: x uniform in [0, 1/2], t = W sin^2(pi x)
for (let i = 0; i < M; i++) { const x = (i + 0.5) / (2 * M); const t = W * Math.pow(Math.sin(Math.PI * x), 2); const chi = t >= tau ? 1 : 0; const up = pp(t), lo = pm(t); minGapP = Math.min(minGapP, up - chi); minGapM = Math.min(minGapM, chi - lo); if (up < chi - 1e-9 || lo > chi + 1e-9) ok = false; meanP += up / M; meanM += lo / M; }
console.log(`tau ${tau}, a ${a.toFixed(5)}, N ${N}: bracket holds on the grid ${ok} (min p+ - chi ${minGapP.toExponential(2)}, min chi - p- ${minGapM.toExponential(2)}); circle means p+ ${meanP.toFixed(5)} against 1 - 2a + 1/n = ${(1 - 2 * a + 1 / n).toFixed(5)}, p- ${meanM.toFixed(5)} against ${(1 - 2 * a - 1 / n).toFixed(5)}`);
// the width against the Fejer form
const KN = (x) => { const s = Math.sin(Math.PI * x); if (Math.abs(s) < 1e-12) return n; const r = Math.sin(Math.PI * n * x) / s; return r * r / n; };
let maxDev = 0; for (const x of [0.05, 0.15, 0.2, a, 0.25, 0.3, 0.4, 0.5 - 1e-3]) { const t = W * Math.pow(Math.sin(Math.PI * x), 2); const w = pp(t) - pm(t); const f = (KN(x - a) + KN(x - 1 + a)) / n; maxDev = Math.max(maxDev, Math.abs(w - f)); }
console.log(`max deviation of the width p+ - p- from [K_N(x - a) + K_N(x - 1 + a)] / n on eight points: ${maxDev.toExponential(2)}`);
// the majorant against the periodized Beurling construction of the arc [a, 1 - a]
const NT = 200000; const B = (x) => { if (Math.abs(x - Math.round(x)) < 1e-6) return Math.round(x) >= 0 ? 1 : -1; const s = Math.sin(Math.PI * x) / Math.PI; let sum = 2 / x; for (let k = 0; k <= NT; k++) sum += 1 / ((x - k) * (x - k)); for (let k = 1; k <= NT; k++) sum -= 1 / ((x + k) * (x + k)); return s * s * sum; };
const S = (x) => { let s = 0; for (let m = -8; m <= 8; m++) { const y = x + m; s += 0.5 * (B(n * (y - a)) + B(n * (1 - a - y))); } return s; };
let maxDiff = 0; for (const x of [0.05, 0.15, 0.2, a, 0.25, 0.3, 0.4, 0.49]) { const t = W * Math.pow(Math.sin(Math.PI * x), 2); maxDiff = Math.max(maxDiff, Math.abs(pp(t) - S(x))); }
console.log(`max difference between the finite formula's majorant and the periodized Beurling majorant on eight points: ${maxDiff.toExponential(2)}`);
// the coefficients' absolute sum, the numerical-error budget's multiplier
let l1 = Math.abs(1 - 2 * a + 1 / n); for (let k = 1; k <= N; k++) l1 += Math.abs(-2 * v(k) * Math.sin(2 * Math.PI * k * a) / (Math.PI * k)) + Math.abs((2 / n) * (1 - k / n) * Math.cos(2 * Math.PI * k * a));
console.log(`absolute sum of the Chebyshev coefficients of p+ at N ${N}: ${l1.toFixed(4)} (|T_k| <= 1, so a coefficient error budget epsilon_c gives a uniform error at most epsilon_c)`);
