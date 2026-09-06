// Formula evaluation (no material, no measurement) for orientation-note.md 7m after the collaborator's repairs (#449).
// Sufficient degree: smallest N with min_w sqrt(S(w)) w^{-(N+1)/2} <= 2^{-bits}, S(w) <= (1 - w^2 r0^2)^{-1} exp(w L^2/(1 - w r0)), 1 < w < 1/r0,
//   for Euclidean whitened reach |m| <= L and spectral band ||D|| <= r0 (sufficient componentwise box: |D_ii|, |D_12| <= r0/2).
// Centres: squares of half-side L/sqrt2 cover the Euclidean ball of radius L, so stored centres at spacing s = sqrt2 L c cells, ceil(P/s) per axis.
// Widths: a stored variance c^2 admits |q/c^2 - 1| <= r0/2, so the ladder ratio is rho' = (1 + r0/2)/(1 - r0/2), from c = 1 to the declared c_max = P.
// Fractional centres (s < 1): ceil(1/s)^2 cosets of the integer grid, one FFT pass each. Acquisition per (entry, width, coset): (J'+1)^2 P^2 + P^2 log2 P, full P^2 (no frequency truncation).
// Comparator: the certified scale-space lookup of #447 with spacing sqrt(eps v) in position and sqrt(eps) in log-variance.
const P = 256, Jp = 20, log2P = 8, cmax = P;
function minN(r0, L, bits) { const target = 2 ** -bits; for (let N = 0; N <= 400; N++) { let best = Infinity; for (let w = 1.001; w < 1 / r0; w += 0.001) { const S = Math.exp(w * L * L / (1 - w * r0)) / (1 - w * w * r0 * r0); const v = Math.sqrt(S) * Math.pow(w, -(N + 1) / 2); if (v < best) best = v; } if (best <= target) return N; } return -1; }
function ladder(r0) { const rho = (1 + r0 / 2) / (1 - r0 / 2); const cs = []; for (let v = 1; v <= cmax * cmax * 1.0000001; v *= rho) cs.push(Math.sqrt(v)); if (cs[cs.length - 1] < cmax) cs.push(cmax); return cs; }
console.log('r0 | L | bits | N | K_N | widths | iso refs | iso reals | iso acquisition ops | aniso refs | aniso reals');
const rows = {};
for (const bits of [8, 10]) for (const r0 of [0.5, 0.25, 0.125, 0.0625]) for (const L of [0.5, 1 / Math.SQRT2, 1]) {
  const N = minN(r0, L, bits), KN = (N + 1) * (N + 2) / 2, cs = ladder(r0);
  const perAxis = c => Math.ceil(P / (Math.SQRT2 * L * c)); const cosets = c => { const s = Math.SQRT2 * L * c; return s < 1 ? Math.ceil(1 / s) ** 2 : 1; };
  let isoRefs = 0, isoAcq = 0, anisoRefs = 0; for (const c of cs) { isoRefs += perAxis(c) ** 2; isoAcq += cosets(c) * ((Jp + 1) ** 2 * P * P + P * P * log2P); } for (const cx of cs) for (const cy of cs) anisoRefs += perAxis(cx) * perAxis(cy);
  isoAcq *= KN;
  const Ls = L === 1 / Math.SQRT2 ? '1/sqrt2' : String(L);
  rows[`${bits}|${r0}|${Ls}`] = { isoReals: isoRefs * KN, anisoReals: anisoRefs * KN };
  console.log(`${r0} | ${Ls} | ${bits} | ${N} | ${KN} | ${cs.length} | ${isoRefs} | ${(isoRefs * KN).toExponential(2)} | ${isoAcq.toExponential(2)} | ${anisoRefs} | ${(anisoRefs * KN).toExponential(2)}`);
}
const phi1 = Math.exp(-0.5) / Math.sqrt(2 * Math.PI);
console.log('lookup comparator: eps | interpolation error / eps | per-axis entries | 2D entries at P=256 | ratio to iso pyramid (r0=1/4, L=1) | ratio to aniso pyramid (r0=1/4, L=1)');
for (const bits of [8, 10]) { const eps = 2 ** -bits, err = 2 * ((eps / 8) * 2 * phi1 + (eps / 8) / Math.SQRT2) / eps; const perAxis = (P / Math.sqrt(eps)) / (1 - Math.exp(-Math.sqrt(eps) / 2)); const total = perAxis * perAxis; const r = rows[`${bits}|0.25|1`];
  console.log(`${eps.toExponential(2)} | ${err.toFixed(3)} | ${perAxis.toExponential(2)} | ${total.toExponential(2)} | ${(total / r.isoReals).toExponential(2)} | ${(total / r.anisoReals).toExponential(2)}`); }
