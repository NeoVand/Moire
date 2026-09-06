// A constructive band majorant for the moment certificate (bridge #281): map the intensity range
// [0, W] to theta in [0, pi] by t = W (1 - cos theta) / 2, so a trigonometric polynomial of degree n
// in theta is an algebraic polynomial of degree n in t (Chebyshev). Let J_n be the Jackson kernel,
// J_n(theta) = (3 / (2 pi n (2 n^2 + 1))) (sin(n theta / 2) / sin(theta / 2))^4, a nonnegative even
// trigonometric polynomial of degree 2 n - 2 with unit mass on [-pi, pi]. For a band B in theta
// widened by w to B', q = 1_{B'} * J_n + delta_n(w) with delta_n(w) an upper bound on the kernel's
// mass outside [-w, w] satisfies q >= 0 everywhere and q >= 1 on B, by construction: no search, no
// sum-of-squares solve. Tail bound used: sin(theta / 2) >= theta / pi on [0, pi] gives
// delta_n(w) <= pi^3 / (n (2 n^2 + 1) w^3). This probe checks the tail bound, the majorant property on a
// dense grid, and the certificate E q(h) against the true band mass on two laws: h uniform on (0, 1)
// (which is also the single Gabor atom's intensity under the standard Gaussian) and a Beta(2, 5) law.
const W = 1;
const jackson = (n, th) => { const s = Math.sin(th / 2); if (Math.abs(s) < 1e-12) return 3 * n * n * n * n / (2 * Math.PI * n * (2 * n * n + 1)); const r = Math.sin(n * th / 2) / s; return (3 / (2 * Math.PI * n * (2 * n * n + 1))) * r * r * r * r; };
const tailBound = (n, w) => Math.pow(Math.PI, 3) / (n * (2 * n * n + 1) * w * w * w);
// numerical mass of the kernel outside [-w, w] and its total mass
const grid = 200000;
const kernelMass = (n, w) => { let out = 0, tot = 0; for (let i = 0; i < grid; i++) { const th = -Math.PI + (i + 0.5) * 2 * Math.PI / grid; const v = jackson(n, th) * 2 * Math.PI / grid; tot += v; if (Math.abs(th) > w) out += v; } return { out, tot }; };
console.log('kernel: total mass and tail beyond w against the bound pi^3 / (n (2 n^2 + 1) w^3)');
for (const n of [16, 64, 256]) for (const c of [8, 16, 32]) { const w = c / n; const m = kernelMass(n, w); console.log(`  n ${n} w = ${c}/n: total ${m.tot.toFixed(5)}, tail ${m.out.toExponential(3)}, bound ${tailBound(n, w).toExponential(3)}, ${m.out <= tailBound(n, w) ? 'ok' : 'VIOLATED'}`); }
// the majorant q(theta) = (1_{B'} * J_n)(theta) + delta, B' = [a - b - w, a + b + w] in theta, by quadrature of the convolution
const majorant = (n, a, b, w) => { const delta = tailBound(n, w); const lo = a - b - w, hi = a + b + w; const M = 4000; return (th) => { let s = 0; for (let i = 0; i < M; i++) { const u = lo + (i + 0.5) * (hi - lo) / M; s += jackson(n, th - u) * (hi - lo) / M; } return s + delta; }; };
// laws on t in [0, 1] with densities: uniform, Beta(2, 5); the band in t is [tau - bt, tau + bt]; in theta it is the image (not symmetric), so take B in theta as the image's hull
const laws = { uniform: (t) => 1, beta25: (t) => 30 * t * Math.pow(1 - t, 4) };
const thetaOf = (t) => Math.acos(1 - 2 * t / W);
for (const [name, dens] of Object.entries(laws)) for (const [tau, bt] of [[0.4, 0.02], [0.4, 0.05], [0.1, 0.02]]) {
  const thLo = thetaOf(tau - bt), thHi = thetaOf(tau + bt); const a = (thLo + thHi) / 2, b = (thHi - thLo) / 2;
  let truth = 0; { const N = 20000; for (let i = 0; i < N; i++) { const t = tau - bt + (i + 0.5) * 2 * bt / N; truth += dens(t) * 2 * bt / N; } }
  const line = [`${name}, tau ${tau}, half-width ${bt} (theta band half-width ${b.toFixed(4)}): true mass ${truth.toFixed(4)}`];
  for (const [n, c] of [[32, 12], [128, 12], [512, 12], [512, 8], [512, 20], [2048, 12]]) { const w = c / n; const q = majorant(n, a, b, w); // certificate E q(h) and the majorant check on the band and on the support
    let Eq = 0, minOnBand = Infinity, minOnK = Infinity; const N = 4000; for (let i = 0; i < N; i++) { const t = (i + 0.5) / N; const th = thetaOf(t); const v = q(th); Eq += dens(t) * v / N; if (th >= thLo && th <= thHi) minOnBand = Math.min(minOnBand, v); minOnK = Math.min(minOnK, v); }
    line.push(`  n ${n}, w = ${c}/n (delta ${tailBound(n, w).toExponential(2)}): certificate ${Eq.toFixed(4)}, min q on band ${minOnBand.toFixed(4)}, min q on support ${minOnK.toFixed(4)}`); }
  console.log(line.join('\n'));
}
