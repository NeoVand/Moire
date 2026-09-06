// The logarithmic-degree law for the Gaussian kernel on prefix cells (bridge #326, derivation in
// beyond-count-maps.md): on a cell of width h <= sigma meeting mu +- R sigma, p(c + h t) = p(c) e^{z(t)}
// with |z| <= M = R / 2 + 3 / 8; truncating e^z after n terms gives degree 2 n with uniform error at most
// p(c) e^M M^{n+1} / (n + 1)!, and summing the cells' L1 errors gives at most e^{2M} M^{n+1} / (n + 1)!
// times the Gaussian's mass. This prints, for a few reaches R and budgets eta, the smallest n with
// e^{2M} M^{n+1} / (n + 1)! <= eta (the tail 2 Phi(-R) reported beside it), the degree 2 n, the number
// of cells of width sigma meeting the reach per axis (at most 2 R + 2), and the absolute coefficient
// sum e^M of the truncated exponential. Numbers of the derivation, not a benchmark.
const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x < 0 ? -y : y; }
for (const R of [3, 3.5, 4]) {
  const M = R / 2 + 3 / 8; const tail = 2 * Phi(-R);
  const line = [`R ${R}: M = ${M.toFixed(4)}, e^M = ${Math.exp(M).toFixed(2)} (coefficient sum), tail 2 Phi(-R) = ${tail.toExponential(2)}, cells of width sigma per axis at most ${2 * R + 2}`];
  for (const eta of [1 / 256, 1 / 512, 1 / 4096]) {
    let n = 0, fact = 1, err = Infinity;
    while (true) { fact *= (n + 1); err = Math.exp(2 * M) * Math.pow(M, n + 1) / fact; if (err <= eta) break; n++; }
    line.push(`  budget ${eta.toExponential(2)}: n = ${n} (degree ${2 * n}), kernel L1 error bound ${err.toExponential(2)}`);
  }
  console.log(line.join('\n'));
}
