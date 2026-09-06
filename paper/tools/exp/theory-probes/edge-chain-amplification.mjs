// Amplification of the forward error recurrence for the upward edge chain (GAUSSIAN-QUERY-STATE.md / bridge #382):
// delta_q <= |a| sqrt(2/q) delta_{q-1} + sqrt(2 (q-1)/q) delta_{q-2} + sqrt(2/q) deltaB_{q-1} + tau_q.
// CONDITIONAL SENSITIVITY ILLUSTRATIONS, not a certificate: ordinary doubles, not outward-rounded; no seed/CDF, endpoint, geometry, assembly or query allowances are priced.
// Homogeneous amplification A_q(a): delta_0 = 1, all other sources zero; and the zero-seed forcing response to a unit local error at every order q >= 1 (tau_q = 1, delta_0 = 0, deltaB = 0).
function amp(a, N) { const d = [1, 0]; d[1] = a * Math.sqrt(2) * d[0]; const out = [1, d[1]]; for (let q = 2; q <= N; q++) { const v = a * Math.sqrt(2 / q) * d[q - 1] + Math.sqrt(2 * (q - 1) / q) * d[q - 2]; d.push(v); out.push(v); } return out; }
function tauResp(a, N) { const d = [0]; d.push(a * Math.sqrt(2) * d[0] + 1); for (let q = 2; q <= N; q++) d.push(a * Math.sqrt(2 / q) * d[q - 1] + Math.sqrt(2 * (q - 1) / q) * d[q - 2] + 1); return d; }
for (const a of [0, 1, 2, 3, 5]) {
  const A = amp(a, 24), T = tauResp(a, 24);
  console.log(`|a| ${a}: homogeneous amplification at q = 6, 12, 18, 24: ${[6, 12, 18, 24].map(q => A[q].toExponential(2)).join(', ')}; zero-seed response to a unit local error at every order is ${[6, 12, 18, 24].map(q => T[q].toExponential(2)).join(', ')}`);
}
// illustration only: homogeneous amplification times the binary64 and binary32 unit roundoffs 2^-53 and 2^-24 on a seed of size one (no forcing terms, no priced inputs)
for (const a of [3, 5]) { const A12 = amp(a, 12)[12], A20 = amp(a, 20)[20]; const u64 = Math.pow(2, -53), u32 = Math.pow(2, -24); console.log(`|a| ${a}: illustration, seed amplification times unit roundoff: N = 12 binary64 ${(A12 * u64).toExponential(1)} binary32 ${(A12 * u32).toExponential(1)}; N = 20 binary64 ${(A20 * u64).toExponential(1)} binary32 ${(A20 * u32).toExponential(1)}`); }
