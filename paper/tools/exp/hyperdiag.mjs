// Where does the fringe law fail for the hyperbola family, and why?
// Throwaway diagnostic: dump the worst residuals with their local geometry.

import { family, periodicDist } from '../lib/fields.mjs';

const s = 9;
const famA = family({ kind: 'hyperbola', spacing: s, phase: 4 });
const famB = family({ kind: 'parallel', spacing: s, angle: Math.PI / 4 });
const thickness = 1.8;
const halfT = Math.max(thickness * 0.5, 1.15);
const aa = 0.7;
const QUAD = 512;

const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(b - a, 1e-12)));
  return t * t * (3 - 2 * t);
};
const inkAt = (p) => {
  const a = 1 - ss(halfT - aa, halfT + aa, famA.distance(p));
  const b = 1 - ss(halfT - aa, halfT + aa, famB.distance(p));
  return a + b - a * b;
};
const grad = (fam, p, h = 0.25) => ({
  x: (fam.index({ x: p.x + h, y: p.y }) - fam.index({ x: p.x - h, y: p.y })) / (2 * h),
  y: (fam.index({ x: p.x, y: p.y + h }) - fam.index({ x: p.x, y: p.y - h })) / (2 * h),
});

/** Brute-force nearest-member distance: sample each level curve densely. */
function bruteDistance(p) {
  let best = Infinity;
  for (let n = -1; n < 60; n++) {
    const c = famA.phase + n * s;
    if (c <= 0) continue;
    // |x^2 - y^2| = c^2. Parameterise both orientations.
    for (const sign of [1, -1]) {
      for (let i = 0; i <= 4000; i++) {
        const t = -6 + (12 * i) / 4000;
        const ch = Math.cosh(t);
        const sh = Math.sinh(t);
        const pts =
          sign > 0
            ? [
                { x: c * ch, y: c * sh },
                { x: -c * ch, y: c * sh },
              ]
            : [
                { x: c * sh, y: c * ch },
                { x: c * sh, y: -c * ch },
              ];
        for (const q of pts) {
          if (Math.abs(q.x) > 900 || Math.abs(q.y) > 900) continue;
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < best) best = d;
        }
      }
    }
  }
  return best;
}

const rows = [];
for (let y = -200; y <= 200; y += 10) {
  for (let x = -200; x <= 200; x += 10) {
    const p = { x, y };
    const ga = grad(famA, p);
    const gb = grad(famB, p);
    const gm = { x: (ga.x + gb.x) / 2, y: (ga.y + gb.y) / 2 };
    const gmag = Math.hypot(gm.x, gm.y);
    if (!(gmag > 1e-4)) continue;
    const gpA = Math.hypot(ga.x, ga.y);
    const gpB = Math.hypot(gb.x, gb.y);
    const w1 = halfT * gpA;
    const w2 = halfT * gpB;
    if (w1 + aa * gpA > 0.45 || w2 + aa * gpB > 0.45) continue;
    if (w1 < 0.02 || w2 < 0.02) continue;

    const period = 1 / gmag;
    const ux = gm.x / gmag;
    const uy = gm.y / gmag;
    let sum = 0;
    for (let i = 0; i < QUAD; i++) {
      const t = ((i + 0.5) / QUAD - 0.5) * period;
      sum += inkAt({ x: x + ux * t, y: y + uy * t });
    }
    const measured = sum / QUAD;

    const delta = famA.index(p) - famB.index(p);
    let pred = 0;
    for (let i = 0; i < QUAD; i++) {
      const u = (i + 0.5) / QUAD;
      const a = 1 - ss(Math.max(w1 - aa * gpA, 0), w1 + aa * gpA, periodicDist(u, 1));
      const b = 1 - ss(Math.max(w2 - aa * gpB, 0), w2 + aa * gpB, periodicDist(u - delta, 1));
      pred += a + b - a * b;
    }
    pred /= QUAD;

    rows.push({
      x,
      y,
      err: Math.abs(measured - pred),
      measured,
      pred,
      gpA,
      gpB,
      eik: famA.distance(p),
      ratio: Math.hypot(ga.x - gb.x, ga.y - gb.y) / gmag,
    });
  }
}

rows.sort((a, b) => b.err - a.err);
console.log('worst 14 residuals:');
console.log('     x     y     err  measured    pred  |gradA| |gradB|   eikD  bruteD  ratio');
for (const r of rows.slice(0, 14)) {
  const bd = bruteDistance({ x: r.x, y: r.y });
  console.log(
    `${String(r.x).padStart(6)}${String(r.y).padStart(6)}` +
      `${r.err.toFixed(4).padStart(8)}${r.measured.toFixed(4).padStart(10)}${r.pred.toFixed(4).padStart(8)}` +
      `${r.gpA.toFixed(3).padStart(9)}${r.gpB.toFixed(3).padStart(8)}` +
      `${r.eik.toFixed(3).padStart(8)}${bd.toFixed(3).padStart(8)}${r.ratio.toFixed(3).padStart(7)}`
  );
}
const mean = rows.reduce((a, b) => a + b.err, 0) / rows.length;
console.log(`\nn=${rows.length} mean err ${mean.toFixed(5)}`);

// How good is the eikonal distance itself, away from the asymptotes?
console.log('\neikonal vs brute-force distance, by |y/x| distance from the asymptote:');
for (const band of [[0, 0.3], [0.3, 0.6], [0.6, 0.85], [0.85, 0.97], [0.97, 1.03]]) {
  const set = rows.filter((r) => {
    const ax = Math.abs(r.x);
    const ay = Math.abs(r.y);
    const q = ax < 1e-6 ? 99 : ay / ax;
    return q >= band[0] && q < band[1];
  });
  if (!set.length) continue;
  let worstRel = 0;
  let sumRel = 0;
  for (const r of set.slice(0, 40)) {
    const bd = bruteDistance({ x: r.x, y: r.y });
    const rel = Math.abs(r.eik - bd) / Math.max(bd, 0.05);
    sumRel += rel;
    if (rel > worstRel) worstRel = rel;
  }
  const k = Math.min(40, set.length);
  console.log(
    `  |y/x| in [${band[0]}, ${band[1]}): n=${String(set.length).padStart(4)} ` +
      `mean rel err ${(sumRel / k).toFixed(4)}  worst ${worstRel.toFixed(4)}`
  );
}
