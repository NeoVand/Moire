// Amplification of the forward error recurrence for the upward edge chain (GAUSSIAN-QUERY-STATE.md / bridge #382):
// delta_q <= |a| sqrt(2/q) delta_{q-1} + sqrt(2 (q-1)/q) delta_{q-2} + sqrt(2/q) deltaB_{q-1} + tau_q.
// Homogeneous amplification A_q(a): delta_0 = 1, all other sources zero; and the response to a unit local error at every order (tau_q = 1, deltaB = 0).
function amp(a, N) { const d = [1, 0]; d[1] = a * Math.sqrt(2) * d[0]; const out = [1, d[1]]; for (let q = 2; q <= N; q++) { const v = a * Math.sqrt(2 / q) * d[q - 1] + Math.sqrt(2 * (q - 1) / q) * d[q - 2]; d.push(v); out.push(v); } return out; }
function tauResp(a, N) { const d = [1]; d.push(a * Math.sqrt(2) * d[0] + 1); for (let q = 2; q <= N; q++) d.push(a * Math.sqrt(2 / q) * d[q - 1] + Math.sqrt(2 * (q - 1) / q) * d[q - 2] + 1); return d; }
for (const a of [0, 1, 2, 3, 5]) {
  const A = amp(a, 24), T = tauResp(a, 24);
  console.log(`|a| ${a}: homogeneous amplification at q = 6, 12, 18, 24: ${[6, 12, 18, 24].map(q => A[q].toExponential(2)).join(', ')}; unit local error at every order accumulates to ${[6, 12, 18, 24].map(q => T[q].toExponential(2)).join(', ')}`);
}
// double and single precision: absolute error of the state contribution after amplification, from unit roundoff 1.1e-16 and 6e-8 on a seed of size one
for (const a of [3, 5]) { const A12 = amp(a, 12)[12], A20 = amp(a, 20)[20]; console.log(`|a| ${a}: N = 12 double ${(A12 * 1.1e-16).toExponential(1)} single ${(A12 * 6e-8).toExponential(1)}; N = 20 double ${(A20 * 1.1e-16).toExponential(1)} single ${(A20 * 6e-8).toExponential(1)}`); }
