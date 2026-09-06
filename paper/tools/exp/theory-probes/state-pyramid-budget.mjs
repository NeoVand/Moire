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
  // Centre grid of #452: allowed spacing s = sqrt2 L c; if s >= 1 integer stride floor(s) with ceil(P / floor(s)) centres per axis and one coset; if s < 1, q = ceil(1 / s), all P q centres per axis and q cosets per axis.
  const perAxis = c => { const s = Math.SQRT2 * L * c; return s >= 1 ? Math.ceil(P / Math.floor(s)) : P * Math.ceil(1 / s); }; const cosets = c => { const s = Math.SQRT2 * L * c; return s < 1 ? Math.ceil(1 / s) ** 2 : 1; };
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
// Budget-consistent selection (after #450): eps_total split in thirds between truncation, state error sqrt(S(1)) eta_H and numerics (the last unpriced).
// N from the truncation at eps/3; eta_H <= sqrt(K_N) * entry error; entry error = kernel (2 ebar + ebar^2 <= 3 ebar, ebar = A_1 e^{sqrt N/2} E + t)
// + table (A_1^2 e^{sqrt N} eta_M), each at most half of eta_entry; within ebar the two terms split evenly; E = M_*^{N_T}/N_T!, M_* = R'/2 + 3/8,
// t = e^{-R'^2/4}; table degree J' = N + 2 (N_T - 1). Table acquisition order per prototype D^2 (J'+1)^2 / eta_M (their (19)), D = 11, S = P D_x D_y with D_x = D_y = 8.
// Lookup comparator: kernel allowance eps/3 -> N_T from their (6), J = 2 (N_T - 1); 16 eta_M <= eps/3; per node one prototype scan P D_x D_y (J+1)^2.
const A1 = Math.exp(3 / 8) * (2 * Math.SQRT2 + Math.sqrt(2 / Math.PI)), Dg = 11, S = P * 64, Dxy = 64;
function budget(r0, L, bits) {
  const eps = 2 ** -bits, N = minN(r0, L, bits + Math.log2(3)), KN = (N + 1) * (N + 2) / 2;
  const S1 = Math.exp(L * L / (1 - r0)) / (1 - r0 * r0), etaEntry = (eps / 3) / (Math.sqrt(S1) * Math.sqrt(KN));
  const ebar = (etaEntry / 2) / 3, t = ebar / 2, Rp = Math.sqrt(4 * Math.log(1 / t)), Mstar = Rp / 2 + 3 / 8;
  let NT = 1, fact = 1; while (A1 * Math.exp(Math.sqrt(N) / 2) * Math.pow(Mstar, NT) / fact > ebar / 2) { NT++; fact *= NT; if (NT > 400) break; }
  const Jp = N + 2 * (NT - 1), etaM = (etaEntry / 2) / (A1 * A1 * Math.exp(Math.sqrt(N)));
  const cs = ladder(r0); let acq = 0, refs = 0; for (const c of cs) { const s = Math.SQRT2 * L * c; acq += (s < 1 ? Math.ceil(1 / s) ** 2 : 1) * ((Jp + 1) ** 2 * P * P + P * P * log2P); const n = s >= 1 ? Math.ceil(P / Math.floor(s)) : P * Math.ceil(1 / s); refs += n * n; } acq *= KN;
  const tables = S * Dg * Dg * (Jp + 1) ** 2 / etaM;
  return { N, KN, S1, etaEntry, Rp, NT, Jp, etaM, acq, tables, refs, reals: refs * KN };
}
console.log('budget-consistent (8 bits): r0 | L | N | K_N | sqrt S(1) | eta_entry | R\' | N_T | J\' | eta_M | iso refs (#452 grid) | iso reals | FFT acquisition | table acquisition order (D=11, S=P*64)');
for (const [r0, L] of [[0.25, 1], [0.125, 1], [0.0625, 1], [0.0625, 0.25]]) { const b = budget(r0, L, 8);
  console.log(`${r0} | ${L} | ${b.N} | ${b.KN} | ${Math.sqrt(b.S1).toFixed(2)} | ${b.etaEntry.toExponential(2)} | ${b.Rp.toFixed(2)} | ${b.NT} | ${b.Jp} | ${b.etaM.toExponential(2)} | ${b.refs} | ${b.reals.toExponential(2)} | ${b.acq.toExponential(2)} | ${b.tables.toExponential(2)}`); }
{ const eps = 2 ** -8, delta = eps / 3, R = Math.sqrt(2 * Math.log(4 / delta)), Mstar = R / 2 + 3 / 8, NT = Math.ceil(Math.max(1, 2 * Math.E * Mstar, Math.log2(8 / delta))), J = 2 * (NT - 1), etaM = eps / 48;
  const nodes = ((P / Math.sqrt(eps)) / (1 - Math.exp(-Math.sqrt(eps) / 2))) ** 2, perNode = P * Dxy * (J + 1) ** 2, tables = S * Dg * Dg * (J + 1) ** 2 / etaM;
  console.log(`lookup comparator (8 bits): N_T ${NT}, J ${J}, eta_M ${etaM.toExponential(2)}, nodes ${nodes.toExponential(2)}, per node ${perNode.toExponential(2)}, node acquisition ${(nodes * perNode).toExponential(2)}, table acquisition order ${tables.toExponential(2)}`); }
// Coherent decomposition (#453): one bounded coherent F^ with disagreement area <= eta per native cell, compared to F once under the query
// (<= 4 eta for independent widths >= 1); the state is that of F^, whose tables are exact rational moments of the quadtree leaves (arithmetic only),
// so the geometric error never passes through the signed weights. Budget: 4 eta <= eps/3 -> eta = eps/12; kernel half of eta_entry as before.
// Leaves per prototype from the unresolved area 10 D h + C_D h^2 <= eta (halves): h = min(eta/(20 D), sqrt(eta/(2 C_D))), nodes <= 1 + 40 D (2^L - 1) + 4 C_D L.
// Lookup with the same coherent decomposition: same tables at its degree J; each node one scan P D_x D_y (J+1)^2.
{ const eps = 2 ** -8, eta = eps / 12, CD = 2 * Dg * Dg + 7 * Dg, h = Math.min(1, eta / (20 * Dg), Math.sqrt(eta / (2 * CD))), Lq = Math.ceil(Math.log2(1 / h)), nodes = 1 + 40 * Dg * (2 ** Lq - 1) + 4 * CD * Lq;
  const b = budget(0.25, 1, 8), b2 = budget(0.125, 1, 8);
  const J = 24;
  console.log(`coherent decomposition (8 bits): eta = ${eta.toExponential(2)}, h = ${h.toExponential(2)}, depth ${Lq}, nodes per prototype ${nodes.toExponential(2)}, over S prototypes ${(nodes * S).toExponential(2)}`);
  console.log(`pyramid tables at J' = ${b.Jp}: ${(nodes * S * (b.Jp + 1) ** 2).toExponential(2)} moment operations; at J' = ${b2.Jp} (r0 = 1/8): ${(nodes * S * (b2.Jp + 1) ** 2).toExponential(2)}; FFT acquisition ${b.acq.toExponential(2)} and ${b2.acq.toExponential(2)}`);
  console.log(`lookup tables at J = ${J}: ${(nodes * S * (J + 1) ** 2).toExponential(2)} moment operations; node acquisition unchanged 1.81e+17`); }
// Candidate scale lookup (the collaborator's, #461), a sufficient selector as read here: target axis variance v >= 1 served by the cached blur
// d in [v/4, v/2] from d_j = 2^{j-1}; U_v(mu) = integral phi_{v-d}(z - mu) U_d(z) dz; the lattice sum over z in h Z has, by completing the square
// in phi_{v-d}(z - mu) phi_d(x - z) = phi_v(x - mu) phi_w(z - m) with w = d (v - d)/v >= d/2, uniform relative error 2 sum_{n>=1} e^{-2 pi^2 w n^2/h^2}
// <= 4 e^{-2 pi^2 w/h^2} <= eps/4 once h <= pi sqrt(d / log(16/eps)); period rounding n = ceil(P/h) per axis; reads per axis within R sqrt(v - d),
// R = sqrt(2 log(8/eps)), v - d <= 3 d: at most 2 R sqrt(3 d)/h + 2. Levels up to d = P^2/2 (Haar beyond). Formula values, not measurements.
for (const bits of [8, 10]) { const eps = 2 ** -bits, R = Math.sqrt(2 * Math.log(8 / eps)); let perAxisSum = 0, levels = 0, readsAxis = 0; const rows = [];
  for (let d = 0.5; d <= P * P / 2; d *= 2) { const h = Math.PI * Math.sqrt(d / Math.log(16 / eps)), n = Math.ceil(P / h); perAxisSum += n; levels++; const reads = 2 * R * Math.sqrt(3 * d) / h + 2; readsAxis = Math.max(readsAxis, reads); if (d <= 4) rows.push(`d=${d}: h=${h.toFixed(3)}, n=${n}, reads/axis<=${reads.toFixed(1)}`); }
  console.log(`scale lookup (${bits} bits, P=256): levels ${levels}; ${rows.join('; ')}; stored values over level pairs ${(perAxisSum * perAxisSum).toExponential(2)}; reads per footprint <= ${(readsAxis * readsAxis).toFixed(0)}`); }
