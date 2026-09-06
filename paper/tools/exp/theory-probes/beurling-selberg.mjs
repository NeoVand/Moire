// The Beurling function and the Selberg majorant of an interval, built numerically from the
// classical formulas and checked against their defining properties before any use:
//   B(z) = (sin(pi z) / pi)^2 [ sum_{n >= 0} (z - n)^{-2} - sum_{n >= 1} (z + n)^{-2} + 2 / z ],
//   B(x) >= sgn(x) for all real x, integral of (B - sgn) over R equal to 1, B_hat supported in [-1, 1].
// Selberg's majorant of the indicator of [alpha, beta] of exponential type 2 pi delta is
//   F(x) = (B(delta (x - alpha)) + B(delta (beta - x))) / 2 >= 1_{[alpha, beta]}(x), with excess 1 / delta;
// periodized with delta = N + 1 it is a trigonometric polynomial of degree N on the circle with
// constant term beta - alpha + 1 / (N + 1) (Selberg; Vaaler 1985; Montgomery, Ten Lectures, ch. 1).
// This probe (1) checks B >= sgn and the excess integral, (2) builds the periodized majorant for a band
// on the circle, checks its excess and its degree by a discrete Fourier transform, and (3) compares its
// band certificate with the Jackson construction at equal degree on the two toy laws of jackson-majorant.mjs.
const NT = 20000; // terms of the two series; the tails are handled by the integral comparison below
const B = (x) => {
  if (Math.abs(x - Math.round(x)) < 1e-6) return Math.round(x) >= 0 ? 1 : -1; /* at and near the integers the series loses all precision against the vanishing sine factor; the limit is sgn, and 1 at zero */ // removable singularities: the (sin pi z / pi)^2 factor cancels the double pole at each integer, leaving B(m) = sgn(m) for m != 0 and B(0) = 1
  const s = Math.sin(Math.PI * x) / Math.PI; let sum = 2 / x;
  for (let n = 0; n <= NT; n++) sum += 1 / ((x - n) * (x - n));
  for (let n = 1; n <= NT; n++) sum -= 1 / ((x + n) * (x + n));
  // the tails beyond NT: sum_{n > NT} 1/(x-n)^2 - 1/(x+n)^2 ~ integral, of order 4 x / NT^2; negligible for |x| << NT
  return s * s * sum;
};
// (1) B >= sgn on a grid and the excess integral
let minGap = Infinity, worst = 0; for (let i = -4000; i <= 4000; i++) { const x = i / 200; const g = B(x) - Math.sign(x); if (g < minGap) { minGap = g; worst = x; } }
let excess = 0; { const L = 60, M = 60000; for (let i = 0; i < M; i++) { const x = -L + (i + 0.5) * 2 * L / M; excess += (B(x) - Math.sign(x)) * 2 * L / M; } }
console.log(`B - sgn: minimum on [-20, 20] ${minGap.toExponential(2)} at x = ${worst}; integral of B - sgn over [-60, 60] ${excess.toFixed(4)} (the tail beyond 60 is of order 1 / (pi^2 60) = ${(1 / (Math.PI * Math.PI * 60)).toFixed(4)}, since B - sgn ~ 1 / (pi x)^2 ... checked below)`);
// the decay of B - sgn: compare with 1/(pi x)^2 at a few points
console.log('B - sgn at x = 5, 10, 20, 40:', [5, 10, 20, 40].map((x) => (B(x) - 1).toExponential(3)).join(' '), ' against (pi x)^-2 * c: ', [5, 10, 20, 40].map((x) => (1 / (Math.PI * Math.PI * x * x)).toExponential(3)).join(' '));
// (2) the periodized Selberg majorant on the circle of length 1 for the band [alpha, beta], degree N
const selberg = (alpha, beta, N) => { const delta = N + 1; return (x) => { let s = 0; for (let n = -6; n <= 6; n++) { const y = x + n; s += 0.5 * (B(delta * (y - alpha)) + B(delta * (beta - y))); } return s; }; };
for (const [alpha, beta, N] of [[0.3, 0.35, 32], [0.3, 0.35, 128]]) {
  const S = selberg(alpha, beta, N); const M = 8192; const vals = new Float64Array(M); let mean = 0, minGapC = Infinity;
  for (let i = 0; i < M; i++) { const x = i / M; vals[i] = S(x); mean += vals[i] / M; const chi = x >= alpha && x <= beta ? 1 : 0; minGapC = Math.min(minGapC, vals[i] - chi); }
  // Fourier coefficients by DFT: magnitude at |k| = N, N + 1, N + 2, 2N
  const coef = (k) => { let re = 0, im = 0; for (let i = 0; i < M; i++) { const ph = -2 * Math.PI * k * i / M; re += vals[i] * Math.cos(ph) / M; im += vals[i] * Math.sin(ph) / M; } return Math.hypot(re, im); };
  console.log(`Selberg majorant of [${alpha}, ${beta}] at degree ${N}: mean ${mean.toFixed(5)} against beta - alpha + 1/(N+1) = ${(beta - alpha + 1 / (N + 1)).toFixed(5)}; min(S - chi) on the grid ${minGapC.toExponential(2)}; |coefficient| at k = N-1, N, N+1, N+2, 2N: ${[N - 1, N, N + 1, N + 2, 2 * N].map((k) => coef(k).toExponential(2)).join(' ')}`);
}
// (3) the band certificate on the toy laws in theta (range mapped by t = (1 - cos theta) / 2, circle of length 2 pi -> scale to length 1 by x = theta / (2 pi))
const laws = { uniform: (t) => 1, beta25: (t) => 30 * t * Math.pow(1 - t, 4) };
const thetaOf = (t) => Math.acos(1 - 2 * t);
for (const [name, dens] of Object.entries(laws)) for (const [tau, bt] of [[0.4, 0.02], [0.4, 0.05], [0.1, 0.02]]) {
  const xLo = thetaOf(tau - bt) / (2 * Math.PI), xHi = thetaOf(tau + bt) / (2 * Math.PI);
  let truth = 0; { const n = 20000; for (let i = 0; i < n; i++) { const t = tau - bt + (i + 0.5) * 2 * bt / n; truth += dens(t) * 2 * bt / n; } }
  const line = [`${name}, tau ${tau}, half-width ${bt}: true mass ${truth.toFixed(4)}`];
  for (const N of [32, 128, 512]) { const S = selberg(xLo, xHi, N); let E = 0, minG = Infinity; const n = 4000; for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; const x = thetaOf(t) / (2 * Math.PI); const v = S(x); E += dens(t) * v / n; const chi = x >= xLo && x <= xHi ? 1 : 0; minG = Math.min(minG, v - chi); }
    line.push(`  degree ${N}: certificate ${E.toFixed(4)}, min(S - chi) ${minG.toExponential(1)}`); }
  console.log(line.join('\n'));
}
