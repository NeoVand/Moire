// Astra's budget selector (#361) evaluated for two half-square masks on unit cells (radian units), far field:
// h = max(2b, b + 2/l_min, rho), c = (1 + rho/h)^2, C0 = 4 sum_{e,f} J_e J_f (l_e^2 + l_f^2) / (A_A A_B D), K = C0 N_E c,
// v = max(1, K/eta), a = 3 + log c, u = 2 v [a + log(2 v)], T = h^2 u, tail = K [3 + log(c u)] / u (must be <= eta),
// union count per edge N(T) = (4 c T / D) [1 + (1/2) log(c T / h^2)], total over the 8 edges (4 of A, 4 of B) in the outer lattice.
const D = (2 * Math.PI) ** 2, rho = Math.PI * Math.SQRT2, l = 0.5, J = 1, AA = 1, AB = 1;
const edgesA = 4, edgesB = 4;
// The reach b is in radians per cell; the beat-pair-count probe's disc radius 0.2 in cycles per cell is b = 2 pi 0.2 = 1.2566 radians (fourth line).
for (const [b, NE, eta] of [[0.2, 1, 1 / 512], [0.2, 1, 1 / 8192], [1.0, 1, 1 / 512], [2 * Math.PI * 0.2, 1, 1 / 512], [3.0, 4, 1 / 512]]) {
  const h = Math.max(2 * b, b + 2 / l, rho);
  const c = (1 + rho / h) ** 2;
  const C0 = 4 * edgesA * edgesB * J * J * (l * l + l * l) / (AA * AB * D);
  const K = C0 * NE * c;
  const v = Math.max(1, K / eta), a = 3 + Math.log(c);
  const u = 2 * v * (a + Math.log(2 * v));
  const T = h * h * u;
  const tail = K * (3 + Math.log(c * u)) / u;
  const Nedge = (4 * c * T / D) * (1 + 0.5 * Math.log(c * T / (h * h)));
  console.log(`b ${b.toFixed(4)} rad N_E ${NE} eta ${eta.toExponential(2)}: h ${h.toFixed(3)} c ${c.toFixed(3)} C0 ${C0.toFixed(4)} K ${K.toFixed(4)} u ${u.toExponential(3)} T ${T.toExponential(3)} tail ${tail.toExponential(3)} (<= eta ${tail <= eta}) union per edge region at most ${Nedge.toExponential(3)}, eight-edge sum at most ${((edgesA + edgesB) * Nedge).toExponential(3)} (an upper bound; the square's opposite edges share a tangent, so four distinct regions: at most ${(4 * Nedge).toExponential(3)})`);
}
