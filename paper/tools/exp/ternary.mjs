// Ternary characters: the three-layer character scan, as prediction.
//
// On K layers the superposition is a map into T^K and every integer vector
// k is a candidate moire. For K = 3 the pairwise characters (1,-1,0) and
// friends are the classical ones; the genuinely ternary characters —
// (1,1,-2), (2,-1,-1), (1,-2,1) — are beats BETWEEN beats, invisible to any
// pairwise analysis. This probe takes three ring families, computes
//
//   eta_k(p) = |sum_i k_i grad phi_i| / (max_i |k_i grad phi_i| / 2)
//
// over the frame for every primitive k with |k_i| <= 2, and reports each
// character's slow-area fraction (eta < 1/4, the paper's fringe line). Run
// with no arguments it analyses the three-ring scene from the walking-family
// catalog; `node ternary.mjs search` sweeps the third spacing to find where
// the zero-sum ternary (1,1,-2) owns the most area while every pairwise
// character stays fast — the parameter the theory predicts will show fringes
// no pair explains.
//
// Prints to stdout and feeds no figure, like hyperdiag.mjs.

const FRAME = 420; // world half-width of the sampled frame
const N = 160; // samples per axis

function ringGrad(p, c, s) {
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  const r = Math.hypot(dx, dy) || 1e-9;
  return [dx / (r * s), dy / (r * s)];
}

function primitiveTernaries(maxAbs) {
  const out = [];
  for (let a = -maxAbs; a <= maxAbs; a++)
    for (let b = -maxAbs; b <= maxAbs; b++)
      for (let c = -maxAbs; c <= maxAbs; c++) {
        const nz = (a !== 0) + (b !== 0) + (c !== 0);
        if (nz < 2) continue;
        const g = [a, b, c].reduce((x, y) => gcd(x, Math.abs(y)), 0);
        if (g !== 1) continue;
        // one representative per sign class
        if (a < 0 || (a === 0 && b < 0)) continue;
        out.push([a, b, c]);
      }
  return out;
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

function slowFraction(centers, spacings, k, thr = 0.25) {
  let slow = 0;
  let total = 0;
  for (let iy = 0; iy < N; iy++)
    for (let ix = 0; ix < N; ix++) {
      const p = [((ix + 0.5) / N - 0.5) * 2 * FRAME, ((iy + 0.5) / N - 0.5) * 2 * FRAME];
      let bx = 0;
      let by = 0;
      let carrier = 0;
      for (let i = 0; i < 3; i++) {
        if (!k[i]) continue;
        const g = ringGrad(p, centers[i], spacings[i]);
        bx += k[i] * g[0];
        by += k[i] * g[1];
        carrier = Math.max(carrier, Math.abs(k[i]) / spacings[i]);
      }
      const eta = Math.hypot(bx, by) / (carrier / 2);
      total++;
      if (eta < thr) slow++;
    }
  return slow / total;
}

// Three distinct centres, so no pair of gradients is parallel by
// construction and a ternary locus is a genuine three-way conspiracy.
const CENTERS = [
  [20, 50],
  [10, -20],
  [-45, 15],
];

function analyse(spacings, label) {
  const rows = [];
  for (const k of primitiveTernaries(2)) {
    const f = slowFraction(CENTERS, spacings, k);
    if (f > 0.001) rows.push({ k, f });
  }
  rows.sort((x, y) => y.f - x.f);
  console.log(`\n${label}  s = [${spacings.map((s) => s.toFixed(3)).join(', ')}]`);
  for (const { k, f } of rows.slice(0, 10)) {
    const ternary = k.every((x) => x !== 0) ? 'ternary ' : 'pairwise';
    console.log(
      `  k = (${k.join(',').padEnd(8)})  ${ternary}  slow area ${(f * 100).toFixed(1)}%`
    );
  }
  return rows;
}

const args = process.argv.slice(2);
if (args[0] === 'search') {
  // Fix s1, s2 so no pairwise character is slow, then sweep s3 for the
  // spacing where the zero-sum ternary (1,1,-2) owns the most area:
  // its beat can close exactly when 2/s3 = 1/s1 + 1/s2.
  const s1 = 6;
  const s2 = 3.3;
  const predicted = 2 / (1 / s1 + 1 / s2);
  console.log(`prediction: (1,1,-2) closes at s3 = 2/(1/s1+1/s2) = ${predicted.toFixed(3)}`);
  let best = { s3: 0, f: 0 };
  for (let s3 = predicted * 0.85; s3 <= predicted * 1.15; s3 += predicted * 0.01) {
    const f = slowFraction(CENTERS, [s1, s2, s3], [1, 1, -2]);
    if (f > best.f) best = { s3, f };
  }
  console.log(
    `sweep:      (1,1,-2) slow area peaks at s3 = ${best.s3.toFixed(3)} ` +
      `(${(best.f * 100).toFixed(1)}% of frame)`
  );
  analyse([s1, s2, best.s3], 'at the peak');
} else {
  // The three-ring scene: two equal-pitch families and a third detuned 5.8%.
  analyse([6, 6, 5.67], 'scene');
  analyse([6, 6, 6], 'third layer tuned to the pair');
}
