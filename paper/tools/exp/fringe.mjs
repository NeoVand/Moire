// Does the moire equal the level sets of the index difference?
//
// Setup. Layer i is a family with index field phi_i; it inks where phi_i is near
// an integer, with an index-space stroke profile
//
//   A_i(u) = 1 - smoothstep(w_i - b_i, w_i + b_i, dist(u, Z)),
//
// w_i the stroke half-width and b_i the antialias band, both in index units. Two
// layers of ink over paper compose as a union, A1 + A2 - A1 A2.
//
// Claim (fringe law). Let D = phi1 - phi2 and average the union over one carrier
// period along the carrier direction. The average depends on p only through D:
//
//   Cbar(p) = Phi(D(p) mod 1),   Phi(g) = int_0^1 [A1(u) + A2(u-g) - A1 A2] du,
//
// and Phi is a tent in g that saturates once the strokes clear each other. The
// residual is O(r) in the heterodyne ratio
//
//   r = |grad D| / |grad phi_mean|,
//
// which is the field-space form of "the two carriers must be close". Neither
// family need be periodic, nor a geometric transform of a periodic one.
//
// Test. Compute the exact one-period directional average of the union from the
// fields themselves (no raster, so no sampler error), compare against Phi, and
// bin the residual by r to check the order. No fitting.
//
//   node paper/tools/exp/fringe.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { family, periodicDist, gradIndex } from '../lib/fields.mjs';

const OUT = new URL('../../data/', import.meta.url);
mkdirSync(OUT, { recursive: true });

/** Quadrature nodes for the one-period average and for Phi. */
const QUAD = 512;

/**
 * Heterodyne ratio below which we claim the fringe regime. Above it the two
 * carriers are not close, the superposition is a lattice of crossings rather than
 * a fringe field, and there is no fringe for the law to describe.
 */
const REGIME = 0.25;

const SCENES = [
  {
    name: 'parallel-rotate',
    note: 'two line families 6 degrees apart',
    a: { kind: 'parallel', spacing: 6, angle: 0 },
    b: { kind: 'parallel', spacing: 6, angle: (6 * Math.PI) / 180 },
    thickness: 1.6,
  },
  {
    name: 'parallel-pitch',
    note: 'same direction, pitch mismatched by 4 percent',
    a: { kind: 'parallel', spacing: 6, angle: 0 },
    b: { kind: 'parallel', spacing: 6.24, angle: 0 },
    thickness: 1.6,
  },
  {
    name: 'circle-circle',
    note: 'circle families with displaced centres',
    a: { kind: 'concentric', shape: 'circle', spacing: 7, position: { x: -40, y: 0 } },
    b: { kind: 'concentric', shape: 'circle', spacing: 7, position: { x: 40, y: 0 } },
    thickness: 1.8,
  },
  {
    name: 'circle-parallel',
    note: 'circles under lines; D is not periodic in p',
    a: { kind: 'concentric', shape: 'circle', spacing: 8, position: { x: 0, y: -260 } },
    b: { kind: 'parallel', spacing: 8, angle: Math.PI / 2 },
    thickness: 1.8,
  },
  {
    name: 'hexagon-hexagon',
    note: 'anisotropic metric, hexagons 4 degrees apart',
    a: { kind: 'concentric', shape: 'hexagon', spacing: 8 },
    b: { kind: 'concentric', shape: 'hexagon', spacing: 8, rotation: 4 },
    thickness: 1.8,
  },
  {
    name: 'square-circle',
    note: 'two different norms at the same spacing',
    a: { kind: 'concentric', shape: 'square', spacing: 8 },
    b: { kind: 'concentric', shape: 'circle', spacing: 8 },
    thickness: 1.8,
  },
  {
    name: 'spiral-circle',
    note: 'aperiodic family: Archimedean spiral over circles',
    a: { kind: 'spiral', spacing: 8, bend: 8 },
    b: { kind: 'concentric', shape: 'circle', spacing: 8 },
    thickness: 1.8,
  },
  {
    name: 'parabola-parabola',
    note: 'curved families, bend mismatched by 8 percent',
    a: { kind: 'parabola', spacing: 9, bend: 3 },
    b: { kind: 'parabola', spacing: 9, bend: 3.25 },
    thickness: 1.8,
  },
  {
    name: 'wave-parallel',
    note: 'a wave family over lines',
    a: { kind: 'wave', spacing: 7, bend: 1.2, frequency: 0.6 },
    b: { kind: 'parallel', spacing: 7, angle: 0 },
    thickness: 1.7,
  },
  {
    name: 'hyperbola-hyperbola',
    note: 'rectangular hyperbolae, spacing mismatched by 4 percent',
    a: { kind: 'hyperbola', spacing: 9, phase: 20 },
    b: { kind: 'hyperbola', spacing: 9.36, phase: 20 },
    thickness: 1.8,
  },
  {
    name: 'walking-circle',
    note: 'a walking family (member $n$ displaced by $n\\delta$) over concentric circles',
    a: { kind: 'walking', spacing: 8, offset: { x: 1.1, y: 0.45 }, phase: 4, position: { x: -30, y: 0 } },
    b: { kind: 'concentric', shape: 'circle', spacing: 8, position: { x: 30, y: 0 } },
    thickness: 1.8,
  },
  {
    name: 'hyperbola-parallel',
    note: 'hyperbolae under lines: almost no fringe regime exists',
    a: { kind: 'hyperbola', spacing: 9, phase: 4 },
    b: { kind: 'parallel', spacing: 9, angle: Math.PI / 4 },
    thickness: 1.8,
  },
];

const EXTENT = 240;
const STEP = 4;
const PIXEL = 1;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(b - a, 1e-12)));
  return t * t * (3 - 2 * t);
}

/** Index-space stroke profile of one layer, as a function of index coordinate. */
function profile(u, w, band) {
  return 1 - smoothstep(Math.max(w - band, 0), w + band, periodicDist(u, 1));
}

/** Phi: the predicted one-period mean union, a function of the index gap alone. */
function phi(gap, w1, b1, w2, b2) {
  let sum = 0;
  for (let i = 0; i < QUAD; i++) {
    const u = (i + 0.5) / QUAD;
    const a = profile(u, w1, b1);
    const b = profile(u - gap, w2, b2);
    sum += a + b - a * b;
  }
  return sum / QUAD;
}

/** Ideal hard-edge tent, for the "it is a tent" claim. */
function tent(gap, w1, w2) {
  // Overlap of two arcs saturates once one stroke lies inside the other, so the
  // profile has a flat floor at 2*max(w1,w2) as well as the flat top.
  const overlap = Math.min(2 * Math.min(w1, w2), Math.max(0, w1 + w2 - periodicDist(gap, 1)));
  return 2 * w1 + 2 * w2 - overlap;
}

/**
 * Curvature of the family's level sets, div of the unit normal. The fringe law is
 * local: it needs the carrier to look like parallel lines across one of its own
 * periods. That fails within a few periods of a concentric family's centre and on
 * the corner rays of a polygonal metric, and `curvature * period` measures both.
 */
function levelCurvature(fam, p, h = 1.2) {
  const nhat = (q) => {
    const g = gradIndex(fam, q, h * 0.5);
    const m = Math.hypot(g.x, g.y) || 1e-12;
    return { x: g.x / m, y: g.y / m };
  };
  const dx = (nhat({ x: p.x + h, y: p.y }).x - nhat({ x: p.x - h, y: p.y }).x) / (2 * h);
  const dy = (nhat({ x: p.x, y: p.y + h }).y - nhat({ x: p.x, y: p.y - h }).y) / (2 * h);
  return Math.abs(dx + dy);
}

/** Carrier turn, in radians, across one carrier period. */
const TURN_LIMIT = 0.15;

/**
 * Relative change in |grad phi| across one period. `distance = phase residual /
 * |grad phi|` is an eikonal approximation; it is the true distance to the nearest
 * member only where the gradient is steady at the period scale. The hyperbola
 * breaks this near its asymptotes, where its level sets cross and no distance
 * formula of this shape applies.
 */
function gradVariation(fam, p, period, h = 1.2) {
  const mag = (q) => {
    const g = gradIndex(fam, q, h * 0.5);
    return Math.hypot(g.x, g.y);
  };
  const m = mag(p);
  if (!(m > 1e-9)) return Infinity;
  const dx = (mag({ x: p.x + h, y: p.y }) - mag({ x: p.x - h, y: p.y })) / (2 * h);
  const dy = (mag({ x: p.x, y: p.y + h }) - mag({ x: p.x, y: p.y - h })) / (2 * h);
  return (Math.hypot(dx, dy) * period) / m;
}

function measure(scene) {
  const famA = family(scene.a);
  const famB = family(scene.b);
  const halfA = Math.max(scene.thickness * 0.5, PIXEL * 1.15);
  const halfB = halfA;
  const aa = PIXEL * 0.7;

  const inkAt = (p) => {
    const dA = famA.distance(p);
    const dB = famB.distance(p);
    const a = 1 - smoothstep(halfA - aa, halfA + aa, dA);
    const b = 1 - smoothstep(halfB - aa, halfB + aa, dB);
    return a + b - a * b;
  };

  const rows = [];
  let singular = 0;
  let bent = 0;
  for (let y = -EXTENT; y <= EXTENT; y += STEP) {
    for (let x = -EXTENT; x <= EXTENT; x += STEP) {
      const p = { x, y };
      const ga = gradIndex(famA, p);
      const gb = gradIndex(famB, p);
      const gm = { x: (ga.x + gb.x) / 2, y: (ga.y + gb.y) / 2 };
      const gmag = Math.hypot(gm.x, gm.y);
      if (!Number.isFinite(gmag) || gmag < 1e-4) continue;
      const diff = Math.hypot(ga.x - gb.x, ga.y - gb.y);
      if (!Number.isFinite(diff)) continue;
      const ratio = diff / gmag;

      // Index-space widths and bands from the local phase gradient.
      const gpA = Math.hypot(ga.x, ga.y);
      const gpB = Math.hypot(gb.x, gb.y);
      const w1 = halfA * gpA;
      const w2 = halfB * gpB;
      const b1 = aa * gpA;
      const b2 = aa * gpB;
      if (w1 + b1 > 0.45 || w2 + b2 > 0.45) continue; // strokes merged: nothing left to beat
      if (w1 < 0.02 || w2 < 0.02) continue; // sub-sample strokes: coverage is the sampler's, not the field's

      // One carrier period along the carrier direction.
      const period = 1 / gmag;
      const turn = Math.max(levelCurvature(famA, p), levelCurvature(famB, p)) * period;
      if (!Number.isFinite(turn) || turn > TURN_LIMIT) {
        bent += 1;
        continue; // carrier bends within its own period: not a local line pair
      }
      const eik = Math.max(gradVariation(famA, p, period), gradVariation(famB, p, period));
      if (!Number.isFinite(eik) || eik > TURN_LIMIT) {
        singular += 1;
        continue; // gradient not steady over a period: eikonal distance invalid
      }
      const ux = gm.x / gmag;
      const uy = gm.y / gmag;
      let sum = 0;
      for (let i = 0; i < QUAD; i++) {
        const t = ((i + 0.5) / QUAD - 0.5) * period;
        sum += inkAt({ x: x + ux * t, y: y + uy * t });
      }
      const measured = sum / QUAD;

      const delta = famA.index(p) - famB.index(p);
      if (!Number.isFinite(delta)) continue;
      const predicted = phi(delta, w1, b1, w2, b2);
      const ideal = tent(delta, w1, w2);
      rows.push({
        ratio,
        gap: periodicDist(delta, 1),
        measured,
        predicted,
        ideal,
        err: Math.abs(measured - predicted),
        tentErr: Math.abs(measured - ideal),
      });
    }
  }

  const stat = (set) => {
    if (set.length < 4) return null;
    const e = set.map((r) => r.err).sort((a, b) => a - b);
    const c = set.map((r) => r.measured).sort((a, b) => a - b);
    const byCov = [...set].sort((a, b) => a.measured - b.measured);
    const dec = Math.max(1, Math.floor(set.length * 0.1));
    const gapOf = (s) => s.reduce((a, r) => a + r.gap, 0) / s.length;
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    // Phi is piecewise linear, so a one-period average of an affine D is exact
    // *except* at the tent's two corners. Reporting the corner error separately
    // says where the residual actually lives.
    const corners = set.filter((r) => {
      const c1 = Math.min(r.gap, Math.abs(0.5 - r.gap));
      return c1 < 0.06;
    });
    return {
      n: set.length,
      mean: r4(e.reduce((a, b) => a + b, 0) / e.length),
      p99: r4(e[Math.floor(e.length * 0.99)]),
      max: r4(e[e.length - 1]),
      awayFromCorner: r4(
        (() => {
          const away = set.filter((r) => Math.min(r.gap, Math.abs(0.5 - r.gap)) >= 0.06);
          if (!away.length) return 0;
          return Math.max(...away.map((r) => r.err));
        })()
      ),
      cornerN: corners.length,
      swing: r4(c[c.length - 1] - c[0]),
      lightGap: r4(gapOf(byCov.slice(0, dec))),
      darkGap: r4(gapOf(byCov.slice(-dec))),
    };
  };

  const inRegime = rows.filter((r) => r.ratio <= REGIME);
  return {
    name: scene.name,
    note: scene.note,
    all: stat(rows),
    regime: stat(inRegime),
    /** Share of admissible samples that are in the fringe regime at all. */
    regimeShare: rows.length ? Math.round((inRegime.length / rows.length) * 1000) / 1000 : 0,
    singularSkipped: singular,
    bentSkipped: bent,
    rows,
  };
}

const results = SCENES.map((scene) => {
  const r = measure(scene);
  const g = r.regime;
  if (!g) {
    console.log(`${r.name.padEnd(22)} no fringe regime anywhere in frame (r > ${REGIME} everywhere)`);
    return r;
  }
  console.log(
    `${r.name.padEnd(22)} n=${String(g.n).padEnd(6)} ` +
      `mean ${g.mean.toFixed(5)} p99 ${g.p99.toFixed(4)} max ${g.max.toFixed(4)}` +
      `   swing ${g.swing.toFixed(3)} light@${g.lightGap.toFixed(3)} dark@${g.darkGap.toFixed(3)}` +
      `   in-regime ${(r.regimeShare * 100).toFixed(0)}%`
  );
  return r;
});

const pooled = results.flatMap((r) => r.rows);
console.log(`\npooled samples: ${pooled.length}`);
console.log('error vs heterodyne ratio r:');
console.log(`${'r <='.padStart(8)}${'n'.padStart(8)}${'mean'.padStart(10)}${'p90'.padStart(10)}${'max'.padStart(10)}`);
const bands = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.4, 1];
let prev = 0;
const orderRows = [];
for (const hi of bands) {
  const set = pooled.filter((r) => r.ratio > prev && r.ratio <= hi);
  prev = hi;
  if (set.length < 20) continue;
  const e = set.map((r) => r.err).sort((a, b) => a - b);
  const mean = e.reduce((a, b) => a + b, 0) / e.length;
  const row = {
    hi,
    n: set.length,
    mean,
    p90: e[Math.floor(e.length * 0.9)],
    max: e[e.length - 1],
  };
  orderRows.push(row);
  console.log(
    `${String(hi).padStart(8)}${String(row.n).padStart(8)}${row.mean.toFixed(5).padStart(10)}` +
      `${row.p90.toFixed(5).padStart(10)}${row.max.toFixed(5).padStart(10)}`
  );
}

writeFileSync(
  new URL('fringe.json', OUT),
  JSON.stringify(
    {
      quadrature: QUAD,
      pooled: pooled.length,
      order: orderRows.map((r) => ({
        band: r.hi,
        n: r.n,
        mean: Math.round(r.mean * 1e6) / 1e6,
        p90: Math.round(r.p90 * 1e6) / 1e6,
        max: Math.round(r.max * 1e6) / 1e6,
      })),
      scenes: results.map(({ rows, ...rest }) => rest),
    },
    null,
    2
  )
);

// Transfer curve: measured coverage against index gap, one scene, in regime.
const pick = results.find((r) => r.name === 'circle-circle');
const tightRows = pick.rows.filter((r) => r.ratio <= REGIME);
const stride = Math.max(1, Math.ceil(tightRows.length / 1200));
const lines = ['gap,measured,predicted,ideal'];
for (let i = 0; i < tightRows.length; i += stride) {
  const r = tightRows[i];
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  lines.push(`${r4(r.gap)},${r4(r.measured)},${r4(r.predicted)},${r4(r.ideal)}`);
}
writeFileSync(new URL('fringe-transfer.csv', OUT), lines.join('\n'));

// Order-of-convergence plot data.
const errLines = ['ratio,mean,p90'];
for (let e = -2.6; e <= -0.3; e += 0.2) {
  const lo = 10 ** (e - 0.1);
  const hi = 10 ** (e + 0.1);
  const set = pooled.filter((r) => r.ratio > lo && r.ratio <= hi);
  if (set.length < 25) continue;
  const errs = set.map((r) => r.err).sort((a, b) => a - b);
  errLines.push(
    `${(10 ** e).toExponential(4)},` +
      `${(errs.reduce((a, b) => a + b, 0) / errs.length).toExponential(4)},` +
      `${errs[Math.floor(errs.length * 0.9)].toExponential(4)}`
  );
}
writeFileSync(new URL('fringe-order.csv', OUT), errLines.join('\n'));

console.log('\nwrote data/fringe.json, fringe-transfer.csv, fringe-order.csv');
