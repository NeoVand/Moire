// Arithmetic of acquiring the orthonormal Hermite state from the arrangement (orientation-note.md 7g), as orders, not measurements.
// Per cell C with E_C edges: base Gaussian measure by edge panels (P ops per edge), then all Hermite moments up to total degree N by the
// divergence recurrence int_C He_{alpha+e_i} phi = - sum_edges n_i int_e He_alpha phi ds, each edge integral a 1D Gaussian-moment contraction:
// K_N = (N+1)(N+2)/2 coefficients, the Hermite polynomial along an edge expanded to degree |alpha| (O(|alpha|) per alpha per edge by a recurrence),
// contracted with the truncated 1D moments M_j, j <= N (O(N) per edge). Cells under a reference footprint of reach R_s standard deviations at level
// s periods: pi (R_s s)^2 rho_X with rho_X crossings per period area. Patches per level (T / s)^2 for a texture of T periods on a side.
const N = 12, KN = (N + 1) * (N + 2) / 2, P = 100, EC = 5, rhoX = 16, T = 1000;
let perEdge = P + N; for (let q = 0; q <= N; q++) perEdge += (q + 1) * (q + 1); // moments M_j plus expansion+contraction per alpha of degree q: (q+1) alphas at degree q in 2D, O(q) each -> (q+1)^2
const perCell = EC * perEdge;
console.log(`N ${N}: K_N ${KN} coefficients; per edge about ${perEdge} ops; per cell (${EC} edges) about ${perCell} ops`);
for (const Rs of [4, 5]) for (const s of [1, 2, 8, 32]) {
  const cells = Math.PI * (Rs * s) ** 2 * rhoX; const patches = (T / s) ** 2;
  const perPatch = cells * perCell; const level = perPatch * patches;
  console.log(`reach ${Rs} sd, level std ${s} periods: cells per patch ${cells.toExponential(2)}, ops per patch ${perPatch.toExponential(2)}, patches ${patches.toExponential(2)}, level total ${level.toExponential(2)} ops, storage ${(patches * KN * 16 / 1e6).toFixed(0)} MB (16 bytes per complex coefficient)`);
}
// the frequency-side acquisition per patch from a retained pair list of |P| pairs: |P| K_N ops
for (const Pn of [50, 5.5e5, 9e6]) console.log(`frequency side, |P| ${Pn.toExponential(1)}: ops per patch ${(Pn * KN).toExponential(2)}, over ${(T ** 2).toExponential(1)} patches ${(Pn * KN * T * T).toExponential(2)}`);
