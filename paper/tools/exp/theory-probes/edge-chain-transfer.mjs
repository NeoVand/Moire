// Forcing transfers T_{q,j}(a) of the real edge-chain error recurrence
//   x_q = |a| sqrt(2/q) x_{q-1} + sqrt(2 (q-1)/q) x_{q-2}
// (Lemma 8's recurrence): T_{q,j} is the solution with x_j = 1 and x_{j-1} = 0, the response at order q to a unit forcing at order j.
// Rescaling y_q = x_q sqrt(q!) 2^{-q/2} gives y_q = |a| y_{q-1} + ((q-1)/sqrt 2) y_{q-2}; the solution started by a unit at j is the tiling sum
// over coverings of the positions j+1..q by monomers (weight |a|) and dominoes covering (l-1, l) (weight (l-1)/sqrt 2), so
//   T_{q,j}(a) = 2^{(q-j)/2} sqrt(j!/q!) sum_k 2^{-k/2} e_k(j,q) |a|^{q-j-2k},  e_k(j,q) = sum over 2-separated k-subsets {u_i} of {j+1..q-1} of prod u_i (integers).
// Late-landing bound: e_k(j,q) <= C(q-j-k, k) prod_{i<k} (q-1-2i). Uniform Gaussian-weighted bound by monomial maximization sup_a |a|^m e^{-a^2/4} = (2m/e)^{m/2}.
// Ordinary doubles (integers exact below 2^53); a derivation check, not an outward-rounded certificate.
const fact = n => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };
const binom = (n, k) => (k < 0 || k > n) ? 0 : fact(n) / (fact(k) * fact(n - k));
function rec(a, q, j) { const x = new Array(q + 1).fill(0); x[j] = 1; for (let i = j + 1; i <= q; i++) x[i] = a * Math.sqrt(2 / i) * x[i - 1] + (i - 2 >= j ? Math.sqrt(2 * (i - 1) / i) * x[i - 2] : 0); return x[q]; }
function exactCoef(q, j) { // e_k(j,q) by dynamic programming over positions: E[n][k] = tiling sums of positions j+1..n with k dominoes
  const n = q - j; const E = Array.from({ length: n + 1 }, () => new Array(Math.floor(n / 2) + 1).fill(0)); E[0][0] = 1;
  for (let p = 1; p <= n; p++) for (let k = 0; 2 * k <= p; k++) { E[p][k] = E[p - 1][k] + (p >= 2 && k >= 1 ? (j + p - 1) * E[p - 2][k - 1] : 0); }
  return E[n];
}
const lateCoef = (q, j) => { const n = q - j; const c = []; for (let k = 0; 2 * k <= n; k++) { let prod = 1; for (let i = 0; i < k; i++) prod *= (q - 1 - 2 * i); c.push(binom(n - k, k) * prod); } return c; };
const poly = (coef, q, j, a) => { const n = q - j; let s = 0; coef.forEach((c, k) => { s += c * Math.pow(2, -k / 2) * Math.pow(a, n - 2 * k); }); return Math.pow(2, n / 2) * Math.sqrt(fact(j) / fact(q)) * s; };
const uniform = (coef, q, j, w) => { const n = q - j; let s = 0; coef.forEach((c, k) => { const m = n - 2 * k; s += c * Math.pow(2, -k / 2) * (m === 0 ? 1 : Math.pow(m / (w * Math.E), m / 2)); }); return Math.pow(2, n / 2) * Math.sqrt(fact(j) / fact(q)) * s; }; // w = 1/2 for e^{-a^2/4}: sup |a|^m e^{-w a^2} = (m/(2 w e))^{m/2}
const gridMax = (q, j, w) => { let best = 0; for (let i = 0; i <= 8000; i++) { const a = i / 1000; best = Math.max(best, rec(a, q, j) * Math.exp(-w * a * a)); } return best; };
console.log('exact domino coefficients e_k(j,q) for q = 8, j = 3 (positions 4..7 for domino left ends):', exactCoef(8, 3).join(' '), '| late-landing:', lateCoef(8, 3).join(' '));
console.log('exact e_k(0,q) for q = 8 against q!/(k!(q-2k)! 2^k):', exactCoef(8, 0).join(' '), '|', [0, 1, 2, 3, 4].map(k => fact(8) / (fact(k) * fact(8 - 2 * k) * 2 ** k)).join(' '));
for (const [q, j, a] of [[8, 3, 2], [12, 1, 3], [12, 6, 3], [24, 12, 5]]) console.log(`q ${q} j ${j} |a| ${a}: recurrence ${rec(a, q, j).toExponential(5)} exact tiling sum ${poly(exactCoef(q, j), q, j, a).toExponential(5)} late-landing ${poly(lateCoef(q, j), q, j, a).toExponential(5)}`);
console.log('uniform bound sup_a T_{q,j}(a) e^{-a^2/4}: grid max over |a| <= 8 / monomial bound with exact coefficients / with late-landing coefficients');
for (const [q, j] of [[12, 1], [12, 6], [12, 11], [24, 1], [24, 12], [24, 23]]) console.log(`q ${q} j ${j}: ${gridMax(q, j, 0.25).toExponential(4)} ${uniform(exactCoef(q, j), q, j, 0.5).toExponential(4)} ${uniform(lateCoef(q, j), q, j, 0.5).toExponential(4)}`);
console.log('sum over j of the exact-coefficient uniform bounds, sum_{j=1}^{q} U_{q,j} (unit forcing at every order, Gaussian weight on each):');
for (const q of [6, 12, 18, 24]) { let s = 0; for (let j = 1; j <= q; j++) s += uniform(exactCoef(q, j), q, j, 0.5); console.log(`q ${q}: ${s.toExponential(4)}`); }
