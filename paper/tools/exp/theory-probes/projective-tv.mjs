// The total variation between the standard Gaussian and its pushforward by the
// projective map P(z) = z / (1 + k . z) (bridge #244, #246: TV <= C |k| with
// C = 6 sqrt(3) e^{-3/2} / pi), and between the projective and the positive
// quadratic pushforwards Q(z) = z (1 - k . z) (bridge #252: TV <= 5 |k|^2), in two
// dimensions, by integrating the explicit densities on a grid; k = kappa e_1.
const C = 6 * Math.sqrt(3) * Math.exp(-1.5) / Math.PI;
const g2 = (x, y) => Math.exp(-(x * x + y * y) / 2) / (2 * Math.PI);
// P: z = w / (1 - k . w), Jacobian determinant (1 - k . w)^(-3)
const densP = (kappa, x, y) => { const den = 1 - kappa * x; if (den <= 0) return 0; return g2(x / den, y / den) * Math.pow(den, -3); };
// Q: w = z (1 - kappa z_1): z_1 = (1 - sqrt(1 - 4 kappa w_1)) / (2 kappa) on the identity branch, z_2 = w_2 / (1 - kappa z_1), det DQ = (1 - t)(1 - 2 t), t = kappa z_1
const densQ = (kappa, x, y) => { const disc = 1 - 4 * kappa * x; if (disc <= 0) return 0; const z1 = (1 - Math.sqrt(disc)) / (2 * kappa); const t = kappa * z1; if (t >= 0.5) return 0; return g2(z1, y / (1 - t)) / ((1 - t) * (1 - 2 * t)); };
const grid = (f) => { const n = 2000, Lm = 12, h = 2 * Lm / n; let s = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const x = -Lm + (i + 0.5) * h, y = -Lm + (j + 0.5) * h; s += f(x, y) * h * h; } return s; };
console.log('generator constant C =', C.toFixed(4), '; 0.5 E|Z_1 (3 - |Z|^2)| =', (0.5 * grid((x, y) => Math.abs(x * (3 - x * x - y * y)) * g2(x, y))).toFixed(4));
console.log('TV(P# gamma, gamma) against C |k|:');
for (const k of [0.005, 0.01, 0.02, 0.05, 0.1]) { const tv = 0.5 * grid((x, y) => Math.abs(densP(k, x, y) - g2(x, y))); console.log(`  |k| ${k}: TV ${tv.toFixed(5)}  C|k| ${(C * k).toFixed(5)}  ratio ${(tv / (C * k)).toFixed(3)}`); }
console.log('TV(P# gamma, Q# gamma) against 5 |k|^2 (the folded mass beyond t = 1/2 is omitted from the quadratic density; it is Phi(-1 / (2 |k|)), negligible at these rates):');
for (const k of [0.02, 0.05, 0.1, 0.2]) { const tv = 0.5 * grid((x, y) => Math.abs(densP(k, x, y) - densQ(k, x, y))); console.log(`  |k| ${k}: TV ${tv.toFixed(6)}  5|k|^2 ${(5 * k * k).toFixed(6)}  ratio ${(tv / (5 * k * k)).toFixed(3)}`); }
