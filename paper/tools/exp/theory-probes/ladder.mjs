// Research check for the bridge reply: (1) the exact error of the beat law for two
// half-arc gratings against the ladder bound and the corrector bound; (2) the density
// of the noise mask's near-resonance ladder and the decay of its coefficients along it.
import { MASK, maskCoefTable } from '../../../../demo/mask-table.js';

// ---- (1) two gratings a(omega x + alpha) b((omega - delta) x + beta), Gaussian window sigma = 1
const wrap = (t) => { t = t % (2 * Math.PI); if (t < 0) t += 2 * Math.PI; return t; };
const arc = (t) => (wrap(t) < Math.PI ? 1 : 0);
const hBeat = (s) => { const d = Math.abs(wrap(s) <= Math.PI ? wrap(s) : wrap(s) - 2 * Math.PI); return (Math.PI - d) / (2 * Math.PI); };
function gauss(x, sig) { return Math.exp(-0.5 * x * x / (sig * sig)) / (sig * Math.sqrt(2 * Math.PI)); }
function twoGratings(omega, delta, sigma) {
  const L = 7 * sigma, n = 400000, dx = 2 * L / n;
  let worstErr = 0, worstBeat = 0;
  for (const alpha of [0, 0.7, 1.9, 3.1, 4.4, 5.6]) for (const beta of [0.2, 1.3, 2.6, 3.9, 5.1]) {
    let exact = 0, beat = 0;
    for (let i = 0; i <= n; i++) {
      const x = -L + i * dx; const w = gauss(x, sigma) * dx;
      exact += w * arc(omega * x + alpha) * arc((omega - delta) * x + beta);
      beat += w * hBeat(delta * x + (alpha - beta));
    }
    const e = Math.abs(exact - beat); if (e > worstErr) { worstErr = e; worstBeat = beat; }
  }
  const ladder = (delta / omega) ** 2 * (1 + Math.sqrt(2 * Math.PI) / (delta * sigma)) / 3;
  const corrector = (Math.sqrt(Math.PI / 2) / sigma + Math.abs(delta)) / Math.abs(omega);
  return { omega: +omega.toFixed(3), delta: +delta.toFixed(4), cyclesPerSigma: +(omega * sigma / (2 * Math.PI)).toFixed(2), worstErr: +worstErr.toExponential(2), ladderBound: +ladder.toExponential(2), correctorBound: +corrector.toExponential(2) };
}
console.log('two gratings, sigma = 1, worst over 30 phase pairs');
for (const cyc of [1, 2, 4]) for (const ratio of [0.2, 0.05, 0.01]) {
  const omega = 2 * Math.PI * cyc; console.log(JSON.stringify(twoGratings(omega, ratio * omega, 1)));
}

// ---- (2) the mask's ladder
const K = MASK.k; // three surface rate vectors (rad per unit)
const Km = (m) => [K[0][0] * m[0] + K[1][0] * m[1] + K[2][0] * m[2], K[0][1] * m[0] + K[1][1] * m[1] + K[2][1] * m[2]];
const norm = (v) => Math.hypot(v[0], v[1]);
const kmax = Math.max(...K.map(norm));
// kernel direction
const det = (a, b) => a[0] * b[1] - a[1] * b[0];
const v = [det(K[1], K[2]), -det(K[0], K[2]), det(K[0], K[1])];
const vn = Math.hypot(...v); console.log('\nkernel direction of K (material-intrinsic):', v.map((x) => +(x / vn).toFixed(4)));
const B = 40; const pts = [];
for (let a = -B; a <= B; a++) for (let b = -B; b <= B; b++) for (let c = -B; c <= B; c++) {
  if (a === 0 && b === 0 && c === 0) continue;
  const r = norm(Km([a, b, c])); pts.push({ m: [a, b, c], rate: r, mag: Math.hypot(a, b, c) });
}
pts.sort((p, q) => p.rate - q.rate);
// at a pixel where the fastest component has k sigma = ks, sigma = ks / kmax; retained if rate * sigma <= sqrt(c)
const c = 15;
for (const ks of [0.5, 1, 2, 3, 5, 10]) {
  const sigma = ks / kmax; const cut = Math.sqrt(c) / sigma;
  const kept = pts.filter((p) => p.rate <= cut);
  const byShell = {}; for (const p of kept) { const sh = Math.min(8, Math.floor(p.mag / 5)); byShell[sh] = (byShell[sh] || 0) + 1; }
  console.log(`ks=${ks} sigma=${sigma.toFixed(2)} cutoff |Km|<=${cut.toFixed(3)}: ladder points with |m_i|<=40: ${kept.length}; per |m| shell of 5: ${JSON.stringify(byShell)}; first rungs: ${kept.slice(0, 6).map((p) => `[${p.m}]`).join(' ')}`);
}
// coefficients along the ladder from a larger table (M = 24 needs N >= 96)
const T = maskCoefTable(24, 96); const M = T.M, W = 2 * M + 1;
const coef = (m) => T.table[((m[0] + M) * W + (m[1] + M)) * W + (m[2] + M)];
const inBox = pts.filter((p) => Math.max(...p.m.map(Math.abs)) <= M);
console.log('\ncoefficient magnitude along the ladder (sorted by |Km|), |m_i| <= 24, mean', T.mean.toFixed(5), 'vanish', T.vanish.toExponential(1));
const rows = [];
for (const p of inBox.slice(0, 400)) rows.push({ m: p.m, rate: p.rate, mag: p.mag, c: Math.abs(coef(p.m)) });
// summarize: for shells of |m|, the max and rms coefficient among ladder points with rate <= cutoff at ks = 2
{
  const ks = 2; const sigma = ks / kmax; const cut = Math.sqrt(c) / sigma;
  const kept = inBox.filter((p) => p.rate <= cut);
  console.log(`ks=2: ladder within the box: ${kept.length} points`);
  for (let lo = 1; lo <= 24; lo += 4) {
    const sh = kept.filter((p) => p.mag >= lo && p.mag < lo + 4); if (!sh.length) continue;
    const cs = sh.map((p) => Math.abs(coef(p.m)));
    const rms = Math.sqrt(cs.reduce((s, x) => s + x * x, 0) / cs.length);
    console.log(`  |m| in [${lo},${lo + 4}): ${sh.length} rungs, max |c| ${Math.max(...cs).toExponential(2)}, rms |c| ${rms.toExponential(2)}, sum |c| ${cs.reduce((s, x) => s + x, 0).toExponential(2)}`);
  }
  // partial sums of |c| exp(-sigma^2 rate^2 / 2) along the ladder in order of |m|: how many rungs for the absolute tail below 2e-3?
  const terms = kept.map((p) => ({ mag: p.mag, t: Math.abs(coef(p.m)) * Math.exp(-0.5 * sigma * sigma * p.rate * p.rate) })).sort((a, b) => a.mag - b.mag);
  let total = terms.reduce((s, x) => s + x.t, 0);
  let acc = 0, n = 0; for (const x of terms) { acc += x.t; n++; if (total - acc < 2e-3) break; }
  console.log(`  absolute-weighted ladder sum within the box ${total.toExponential(3)}; rungs until the in-box remainder is under 2e-3: ${n} of ${terms.length}; last |m| used ${terms[n - 1]?.mag.toFixed(1)}`);
  const last = terms.filter((x) => x.mag > 20); console.log(`  contribution of rungs with |m| > 20 (box edge, a proxy for the tail): ${last.reduce((s, x) => s + x.t, 0).toExponential(2)} over ${last.length} rungs`);
}
