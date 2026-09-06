// Formula evaluation (not a probe of any implementation): the Hermite query state's degree forced by an admission region, and the
// storage and acquisition of a periodic state pyramid for a P-periodic hashed material. Truncation bound of 7g: sqrt(S(w)) w^{-(N+1)/2},
// S(w) <= (1 - w^2 r0^2)^{-1} exp(w L^2 / (1 - w r0)) for centre reach |m| <= L and band ||D|| <= r0 in the reference's whitening, 1 < w < 1/r0.
// Isotropic reference family: widths c_k^2 = rho^k, rho = (1 + r0)/(1 - r0), centres on a grid of spacing 2 L c_k within one period; storage
// per reference K_N = (N+1)(N+2)/2 reals; references per width (P / (2 L c))^2; sum_k c_k^{-2} = (1 + r0)/(2 r0). Axis-aligned anisotropic
// family: widths (c_x, c_y) both on the ladder; sum over pairs of 1/(c_x c_y) = (1/(1 - rho^{-1/2}))^2. Acquisition per (entry, width pair):
// (J'+1)^2 P^2/(c_x c_y) frequency-domain products plus P^2 log2 P for the inverse FFT.
const P = 256, Jp = 20, log2P = 8;
function minN(r0, L, bits) { const target = 2 ** -bits; for (let N = 0; N <= 400; N++) { let best = Infinity; for (let w = 1.001; w < 1 / r0; w += 0.001) { const S = Math.exp(w * L * L / (1 - w * r0)) / (1 - w * w * r0 * r0); const v = Math.sqrt(S) * Math.pow(w, -(N + 1) / 2); if (v < best) best = v; } if (best <= target) return N; } return -1; }
console.log('r0 | L | bits | N | K_N | levels(1..P) | iso storage/P^2 | iso reals at P=256 | aniso storage/P^2 | aniso reals | iso acquisition ops (J\'=20)');
for (const bits of [8, 10]) for (const r0 of [0.5, 0.25, 0.125, 0.0625]) for (const L of [0.25, 0.5, 1]) {
  const N = minN(r0, L, bits), KN = (N + 1) * (N + 2) / 2, rho = (1 + r0) / (1 - r0);
  const levels = Math.ceil(Math.log(P * P) / Math.log(rho)) + 1, isoSum = (1 + r0) / (2 * r0), anisoSum = (1 / (1 - Math.pow(rho, -0.5))) ** 2;
  const isoF = KN / (4 * L * L) * isoSum, anisoF = KN / (4 * L * L) * anisoSum;
  const acq = KN * ((Jp + 1) ** 2 * P * P * isoSum + levels * P * P * log2P);
  console.log(`${r0} | ${L} | ${bits} | ${N} | ${KN} | ${levels} | ${isoF.toFixed(0)} | ${(isoF * P * P).toExponential(2)} | ${anisoF.toFixed(0)} | ${(anisoF * P * P).toExponential(2)} | ${acq.toExponential(2)}`);
}
