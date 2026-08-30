import assert from 'node:assert/strict';
import {
  centeredMod,
  circleQuadratic,
  curveDistanceCpu,
  curvePhaseCpu,
  facetCount,
  fieldWarpCpu,
  linePhaseCpu,
  phaseDistance,
  phaseGap,
  ringPhaseCpu,
  type PhaseSample,
  lineDistanceCpu,
  radialLineDistanceCpu,
  radialLinePhaseCpu,
  RING_BUDGET,
  RING_SPAN_CAP,
  ringDistanceCpu,
  ringDrift,
  ringIndexWindow,
  shapeKappa,
  shapeRadius,
  type FieldCode,
} from './inverseCpu.ts';
import { gridDistanceCpu, latticeCell } from './latticeCpu.ts';
import { concentricSideCount, mixInvN } from '../types/moire.ts';

function approx(actual: number, expected: number, tol = 1e-3) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `expected ${expected}, got ${actual}`
  );
}

// Centered: exact ring
approx(centeredMod(30, 10, 0), 0);
approx(centeredMod(25, 10, 0), 5);
approx(centeredMod(2, 10, 5), 3);

// Centered dispatch through the full inverse
approx(
  ringDistanceCpu({ x: 30, y: 0 }, { x: 0, y: 0 }, 0, 10, 0, 1, 3),
  0
);

// Circles + rot offset, no translation: θ is a no-op
approx(
  ringDistanceCpu({ x: 25, y: 0 }, { x: 0, y: 0 }, 0.4, 10, 0, 1, 3),
  ringDistanceCpu({ x: 25, y: 0 }, { x: 0, y: 0 }, 0, 10, 0, 1, 3)
);

// Far from origin — no ring cap. Ring 100 at r=600.
approx(
  ringDistanceCpu({ x: 600, y: 0 }, { x: 0, y: 0 }, 0, 6, 0, 1, 3),
  0
);
approx(
  ringDistanceCpu({ x: 603, y: 0 }, { x: 0, y: 0 }, 0, 6, 0, 1, 3),
  3
);

// Translated circles: |p - nδ| = n s
// p=(30,0), δ=(0.5,0), s=6 → n≈4.615, nearest n=5, dist=2.5
approx(circleQuadratic({ x: 30, y: 0 }, { x: 0.5, y: 0 }, 6, 0), 2.5, 0.05);
approx(
  ringDistanceCpu({ x: 30, y: 0 }, { x: 0.5, y: 0 }, 0, 6, 0, 1, 3),
  2.5,
  0.05
);

// Default-scene style offset, far out — still a real ring, not a hole
const far = ringDistanceCpu({ x: 2400, y: 0 }, { x: 0, y: 0.5 }, 0, 6, 0, 1, 3);
assert.ok(far < 3.5, `far translated ring should be near a stroke, got ${far}`);

// Rotation + offset: a point on the continuous family should be near a ring
const n = 20;
const s = 10;
const theta = 0.08;
const offset = { x: 0.4, y: 0 };
const radius = n * s;
const center = {
  x: Math.cos(n * theta) * offset.x * n - Math.sin(n * theta) * offset.y * n,
  y: Math.sin(n * theta) * offset.x * n + Math.cos(n * theta) * offset.y * n,
};
const p = { x: center.x + radius, y: center.y };
const d = ringDistanceCpu(p, offset, theta, s, 0, 1, 3);
assert.ok(d < 2, `spiraled ring 20 should be found, dist=${d}`);

// Polygon n=4 matches L∞; many-gon matches Euclidean (circle stand-in)
approx(shapeRadius({ x: 10, y: 4 }, 4, 4), shapeRadius({ x: 10, y: 4 }, 2, 4), 1e-6);
approx(shapeRadius({ x: 10, y: 0 }, 4, 64), 10, 0.02);

// Support forms must equal the atan2 form they replaced, all the way round.
function radialForm(q: { x: number; y: number }, n: number) {
  const seg = (Math.PI * 2) / n;
  let a = ((Math.atan2(q.y, q.x) + seg * 0.5) % seg) - seg * 0.5;
  if (a < -seg * 0.5) a += seg;
  return Math.hypot(q.x, q.y) * Math.cos(a);
}
for (let i = 0; i < 41; i++) {
  const a = (i * Math.PI * 2) / 41 + 0.03;
  for (const r of [1, 17, 940]) {
    const q = { x: r * Math.cos(a), y: r * Math.sin(a) };
    for (const n of [3, 4, 6]) {
      approx(shapeRadius(q, 4, n), radialForm(q, n), 1e-4 * r);
    }
    approx(shapeRadius(q, 3, 3), radialForm(q, 3), 1e-4 * r);
    approx(shapeRadius(q, 2, 4), radialForm(q, 4), 1e-4 * r);
  }
}

// Drift is the exact per-index reach: |δ| for circles, max|δ| for squares, and
// less than |δ| for a triangle whose corner does not face the offset.
approx(ringDrift({ x: 3, y: 4 }, 1, 6), 5, 1e-6);
approx(ringDrift({ x: 3, y: -4 }, 2, 4), 4, 1e-6);
assert.ok(
  ringDrift({ x: 2.5, y: 2.5 }, 3, 3) < Math.hypot(2.5, 2.5),
  'triangle drift should be tighter than |δ|'
);
assert.ok(ringDrift({ x: -4, y: 0 }, 3, 3) > 3.9, 'a corner-on offset drifts at nearly |δ|');
approx(mixInvN(64, 4, 0), 64, 1e-6);
approx(mixInvN(64, 4, 1), 4, 1e-6);
approx(concentricSideCount('concentric-circles', 6), 64);
approx(concentricSideCount('concentric-squares', 6), 4);

// Centered squares — L∞, infinite, including the diagonal
approx(ringDistanceCpu({ x: 10, y: 0 }, { x: 0, y: 0 }, 0, 10, 0, 2, 4), 0);
approx(ringDistanceCpu({ x: 10, y: 10 }, { x: 0, y: 0 }, 0, 10, 0, 2, 4), 0);
approx(ringDistanceCpu({ x: 1000, y: 0 }, { x: 0, y: 0 }, 0, 10, 0, 2, 4), 0);

// Translated squares on the diagonal — circle-quadratic neighbors would miss
const squareDiag = ringDistanceCpu({ x: 200, y: 200 }, { x: 0, y: -0.5 }, 0, 6, 0, 2, 4);
assert.ok(squareDiag < 3.5, `translated square on diagonal should hit a ring, got ${squareDiag}`);

const squareFar = ringDistanceCpu({ x: 2400, y: 2400 }, { x: 0, y: -0.5 }, 0, 6, 0, 2, 4);
assert.ok(squareFar < 3.5, `far translated square should not hole, got ${squareFar}`);

// Rotated squares (no translation): ring n is R(nθ) of an axis-aligned square
const nSq = 20;
const thetaSq = 0.08;
const rSq = nSq * 10;
const pSq = {
  x: Math.cos(nSq * thetaSq) * rSq,
  y: Math.sin(nSq * thetaSq) * rSq,
};
const dSq = ringDistanceCpu(pSq, { x: 0, y: 0 }, thetaSq, 10, 0, 2, 4);
assert.ok(dSq < 2, `rotated square ring 20 should be found, dist=${dSq}`);

function onRotatedSquare(n: number, spacing: number, theta: number) {
  const r = n * spacing;
  return {
    x: Math.cos(n * theta) * r,
    y: Math.sin(n * theta) * r,
  };
}

for (const nFar of [80, 200, 400]) {
  const pf = onRotatedSquare(nFar, 6, 0.08);
  const df = ringDistanceCpu(pf, { x: 0, y: 0 }, 0.08, 6, 0, 2, 4);
  assert.ok(df < 2, `rotated square ring ${nFar} should be found, dist=${df}`);
}

const pDiagFar = { x: 4200, y: 4200 };
const dDiagFar = ringDistanceCpu(pDiagFar, { x: 0, y: 0 }, 0.08, 6, 0, 2, 4);
assert.ok(dDiagFar < 3.2, `far diagonal rotated square should not hole, got ${dDiagFar}`);

function rotate2d(q: { x: number; y: number }, a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: c * q.x - s * q.y, y: s * q.x + c * q.y };
}

function bruteSquare(
  p: { x: number; y: number },
  theta: number,
  spacing: number,
  nMax: number,
  offset = { x: 0, y: 0 }
) {
  let best = 1e9;
  for (let n = 0; n <= nMax; n++) {
    const center = rotate2d({ x: offset.x * n, y: offset.y * n }, n * theta);
    const q = rotate2d({ x: p.x - center.x, y: p.y - center.y }, -n * theta);
    const r = Math.max(Math.abs(q.x), Math.abs(q.y));
    best = Math.min(best, Math.abs(r - n * spacing));
  }
  return best;
}

let onRingFail = 0;
let onRingWorst = 0;
for (const n of [8, 40, 120, 260, 480]) {
  const R = n * 6;
  for (const side of [0, 1, 2, 3]) {
    for (let i = 0; i < 8; i++) {
      const t = -R + (2 * R * i) / 7;
      const q =
        side === 0
          ? { x: R, y: t }
          : side === 1
            ? { x: -R, y: t }
            : side === 2
              ? { x: t, y: R }
              : { x: t, y: -R };
      const p = rotate2d(q, n * 0.08);
      const d = ringDistanceCpu(p, { x: 0, y: 0 }, 0.08, 6, 0, 2, 4);
      onRingWorst = Math.max(onRingWorst, d);
      if (d > 1.25) onRingFail += 1;
    }
  }
}
assert.ok(onRingFail === 0, `rotated square sides vanished, worst=${onRingWorst}`);

let solverMiss = 0;
let missDetail = '';
for (const r of [180, 900, 2400, 4800]) {
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI * 2) / 24;
    const p = { x: r * Math.cos(a), y: r * Math.sin(a) };
    const brute = bruteSquare(p, 0.08, 6, Math.ceil(r / 5) + 24);
    const sl = ringDistanceCpu(p, { x: 0, y: 0 }, 0.08, 6, 0, 2, 4);
    if (sl - brute > 0.35) {
      solverMiss += 1;
      missDetail = `r=${r} sl=${sl.toFixed(3)} brute=${brute.toFixed(3)}`;
    }
  }
}
assert.ok(solverMiss === 0, `solver missed brute-force nearest ring (${missDetail})`);

// The window is a proven superset, so it must match brute force everywhere the
// stroke could possibly land — across every shape, offset, and rotation the UI
// can reach. This is the test that replaces "trust the sample budget".
function bruteRing(
  p: { x: number; y: number },
  offset: { x: number; y: number },
  theta: number,
  spacing: number,
  phase: number,
  shape: 1 | 2 | 3 | 4,
  sides: number,
  nMax: number
) {
  let best = 1e9;
  for (let k = 0; k <= nMax; k++) {
    const center = rotate2d({ x: offset.x * k, y: offset.y * k }, k * theta);
    const q = rotate2d({ x: p.x - center.x, y: p.y - center.y }, -k * theta);
    best = Math.min(best, Math.abs(shapeRadius(q, shape, sides) - (k * spacing + phase)));
  }
  return best;
}

let exactCases = 0;
let exactMiss = 0;
let exactDetail = '';
let phantom = 0;
let phantomDetail = '';
let subsampled = 0;

for (const shape of [1, 2, 3, 4] as const) {
  for (const spacing of [3, 6, 20]) {
    for (const phase of [0, 14]) {
      for (const theta of [-0.2, -0.05, 0, 0.013, 0.2]) {
        for (const offset of [
          { x: 0, y: 0 },
          { x: 0, y: -0.5 },
          { x: 0.4, y: 0.9 },
          { x: -4, y: 4 },
        ]) {
          // The closed forms own these; the scan is only responsible for the rest.
          const hasOff = offset.x !== 0 || offset.y !== 0;
          const hasRot = Math.abs(theta) > 1e-8;
          if (!hasRot && (shape === 1 || shape === 2)) continue;
          if (!hasOff && !hasRot) continue;
          if (!hasOff && shape === 1) continue;

          const offLen = Math.hypot(offset.x, offset.y);
          const kappa = shapeKappa(shape, 6);

          for (const r of [40, 300, 1500, 6000]) {
            for (let i = 0; i < 11; i++) {
              const a = (i * Math.PI * 2) / 11 + 0.17;
              const p = { x: r * Math.cos(a), y: r * Math.sin(a) };
              const guard = Math.max(spacing * 0.75, 4);
              const got = ringDistanceCpu(p, offset, theta, spacing, phase, shape, 6, 0, guard);
              const reach =
                Math.ceil((r + phase + guard) / Math.max(spacing - offLen, 0.05)) + 32;
              const want = bruteRing(p, offset, theta, spacing, phase, shape, 6, reach);
              const label =
                `shape=${shape} s=${spacing} phase=${phase} theta=${theta} ` +
                `off=(${offset.x},${offset.y}) r=${r} i=${i} got=${got.toFixed(4)} want=${want.toFixed(4)}`;

              // A subset minimum can never come out closer than the true minimum.
              // If it did, the field would ink where no ring is.
              if (got < Math.min(want, guard) - 1e-6) {
                phantom += 1;
                phantomDetail = label;
              }

              const span =
                (({ lo, hi }) => hi - lo + 1)(
                  ringIndexWindow(
                    Math.hypot(p.x, p.y),
                    offLen,
                    ringDrift(offset, shape, 6),
                    Math.max(spacing, 1e-4),
                    phase,
                    kappa,
                    guard
                  )
                );
              if (span > RING_BUDGET) {
                subsampled += 1;
                continue;
              }
              // Window fits the budget, so the scan saw every candidate: exact.
              exactCases += 1;
              if (want <= guard && got - want > 1e-6) {
                exactMiss += 1;
                exactDetail = label;
              }
            }
          }
        }
      }
    }
  }
}

assert.ok(exactCases > 3000, `expected a wide sweep, ran ${exactCases} exact cases`);
assert.ok(
  exactMiss === 0,
  `window fit the budget but still missed the nearest ring in ${exactMiss}/${exactCases} (${exactDetail})`
);
assert.ok(phantom === 0, `reported ink closer than any real ring (${phantomDetail})`);
console.log(
  `  window: ${exactCases} exact, ${subsampled} subsampled (window > ${RING_BUDGET})`
);

// Translated polygons take the closed form, so there is no budget to hide behind:
// every side count, every offset up to and including the marginal one where the
// drift exactly cancels the spacing, has to match brute force outright. The
// marginal band is the point of this test — that is where a scan of any finite
// budget walks off the end before reaching the indices that carry the answer.
assert.equal(facetCount(2, 4), 4);
assert.equal(facetCount(3, 3), 3);
assert.equal(facetCount(4, 9), 9);
assert.equal(facetCount(1, 6), 0, 'circles are not a polygon support function');
assert.equal(facetCount(4, 6.5), 0, 'a morph through fractional sides must not solve for facets');

let closedCases = 0;
let closedMiss = 0;
let closedDetail = '';
let marginalCases = 0;

for (const [shape, sides] of [
  [2, 4],
  [3, 3],
  [4, 5],
  [4, 6],
  [4, 9],
] as const) {
  for (const spacing of [3, 6, 20]) {
    for (const phase of [0, 14]) {
      // The last two are exactly marginal: shapeRadius(-delta) == spacing, so the
      // leading facet's slope cancels and h is flat past the crossover.
      const unit = ringDrift({ x: 1, y: 0 }, shape, sides);
      const offsets = [
        { x: 0.4, y: 0.9 },
        { x: 2, y: -1 },
        { x: spacing * 0.5, y: 0 },
        { x: spacing / unit, y: 0 },
        { x: -spacing / ringDrift({ x: -1, y: 0 }, shape, sides), y: 0 },
      ];
      for (const offset of offsets) {
        const drift = ringDrift(offset, shape, sides);
        if (drift > spacing + 1e-4) continue;
        const marginal = Math.abs(drift - spacing) < 1e-4;
        for (const r of [40, 300, 1500, 6000]) {
          for (let i = 0; i < 9; i++) {
            const a = (i * Math.PI * 2) / 9 + 0.31;
            const p = { x: r * Math.cos(a), y: r * Math.sin(a) };
            const guard = Math.max(spacing * 0.75, 4);
            const got = ringDistanceCpu(p, offset, 0, spacing, phase, shape, sides, 0, guard);
            // Reach past the facet crossover, which sits near |p| over the spread
            // of the facet projections of the offset.
            const reach = Math.ceil((4 * (r + phase + guard)) / spacing) + 128;
            const want = bruteRing(p, offset, 0, spacing, phase, shape, sides, reach);
            closedCases += 1;
            if (marginal) marginalCases += 1;
            if (Math.min(want, guard) - got > 1e-6) {
              phantom += 1;
              phantomDetail = `closed form under brute force: shape=${shape}/${sides} s=${spacing} off=(${offset.x},${offset.y}) r=${r}`;
            }
            if (want <= guard && got - want > 1e-3) {
              closedMiss += 1;
              closedDetail =
                `shape=${shape}/${sides} s=${spacing} phase=${phase} off=(${offset.x.toFixed(3)},${offset.y}) ` +
                `drift=${drift.toFixed(3)} r=${r} i=${i} got=${got.toFixed(4)} want=${want.toFixed(4)}`;
            }
          }
        }
      }
    }
  }
}

assert.ok(marginalCases > 200, `expected the marginal band to be covered, got ${marginalCases}`);
assert.ok(
  closedMiss === 0,
  `translated polygon closed form missed the nearest ring in ${closedMiss}/${closedCases} (${closedDetail})`
);
console.log(`  translated polygons: ${closedCases} closed-form cases exact, ${marginalCases} of them marginal`);

// The near-marginal sliver, pinned at 5e-5 to either side of m = s. The old
// solver routed |s - m| in (1e-6, 1e-4) through a crossing solve at n ~ 1/|s-m|,
// which the shader's f32 turns into garbage (and, for m slightly above s, into a
// clamped seed that never examines the far field). The whole band now takes the
// flat-constant branch: never nearer than a bounded brute force (no phantom
// ink), and above it by at most the drift the terminal facet accumulates over
// the range the brute force can walk (bounded, slver-scaled under-ink).
{
  let checked = 0;
  for (const [shape, sides] of [
    [2, 4],
    [4, 6],
  ] as const) {
    const unit = ringDrift({ x: 1, y: 0 }, shape, sides);
    for (const spacing of [3, 14]) {
      for (const side of [-1, 1]) {
        const den = -side * 5e-5; // s - m; negative means m just above s
        const offset = { x: (spacing + side * 5e-5) / unit, y: 0 };
        for (const r of [60, 800]) {
          for (let i = 0; i < 7; i++) {
            const ang = (i * Math.PI * 2) / 7 + 0.17;
            const p = { x: r * Math.cos(ang), y: r * Math.sin(ang) };
            const guard = Math.max(spacing * 0.75, 4);
            const got = ringDistanceCpu(p, offset, 0, spacing, 0, shape, sides, 0, guard);
            const reach = Math.ceil((4 * (r + guard)) / spacing) + 128;
            const want = bruteRing(p, offset, 0, spacing, 0, shape, sides, reach);
            checked += 1;
            // The flat value is the terminal segment's constant; the true
            // residual drifts off it at |s - m| per index, so both directions
            // carry the same drift-scaled slack: the flat semantics may sit
            // under or over a bounded brute force by at most that drift over
            // the range either can walk. Well under a stroke width everywhere.
            const slack = Math.abs(den) * reach + 1e-3;
            assert.ok(
              Math.min(want, guard) - got <= slack,
              `sliver phantom beyond drift bound: shape=${shape}/${sides} s=${spacing} den=${den} r=${r} i=${i} got=${got} want=${want} slack=${slack}`
            );
            assert.ok(
              want > guard || got - want <= slack,
              `sliver under-ink beyond drift bound: shape=${shape}/${sides} s=${spacing} den=${den} r=${r} i=${i} got=${got} want=${want} slack=${slack}`
            );
          }
        }
      }
    }
  }
  console.log(`  near-marginal sliver: ${checked} pinned cases at |s-m| = 5e-5 hold both bounds`);
}

// Exactness is exactly the property "window fits the budget", so pin down where
// that holds: rings at least two device pixels apart, and an offset no more than
// a quarter of the spacing. Both edges are real. Below two pixels of pitch the
// strokes already overlap into a fill, and as the offset approaches the spacing
// the drift cancels the growth so unboundedly many rings genuinely crowd every
// point. Outside the envelope the scan thins the family on an anchored lattice
// rather than pretending to be exact. Guard mirrors the renderer's halfT + aa.
let overBudget = 0;
let overDetail = '';
let widestResolvable = 0;
let widestAny = 0;
let widestDetail = '';
let capped = 0;
let cappedDetail = '';
for (const zoom of [0.1, 0.2, 0.35, 0.5, 1, 2, 4, 10]) {
  const pixel = 1 / Math.max(zoom, 0.08);
  for (const thickness of [0.01, 3.5, 20]) {
    const halfT = Math.max(thickness * 0.5, pixel * 1.15);
    const guardZoom = halfT + pixel * 0.7;
    // Half-diagonal of a generous viewport at this zoom.
    const reach = Math.hypot(1920, 1200) / (2 * zoom);
    for (const shape of [1, 2, 3, 4] as const) {
      for (const spacing of [1, 6, 10, 16, 24, 40, 120]) {
        for (const offset of [
          { x: 0, y: 0 },
          { x: 0, y: -0.5 },
          { x: 0.7, y: 0.7 },
          { x: 1.06, y: 1.06 },
          { x: -4, y: 4 },
          { x: 4, y: 4 },
          { x: -4, y: 0 },
        ]) {
          const offLen = Math.hypot(offset.x, offset.y);
          const guard = Math.max(guardZoom, spacing * 0.75);
          const { lo, hi } = ringIndexWindow(
            reach,
            offLen,
            ringDrift(offset, shape, 6),
            spacing,
            0,
            shapeKappa(shape, 6),
            guard
          );
          const span = hi - lo + 1;
          const label =
            `zoom=${zoom} t=${thickness} shape=${shape} s=${spacing} ` +
            `off=(${offset.x},${offset.y}) span=${span}`;
          if (span > widestAny) {
            widestAny = span;
            widestDetail = label;
          }
          if (span > RING_SPAN_CAP) {
            capped += 1;
            cappedDetail = label;
          }
          if (spacing * zoom < 2 || offLen > spacing * 0.25) continue;
          if (span > widestResolvable) widestResolvable = span;
          if (span > RING_BUDGET) {
            overBudget += 1;
            overDetail = label;
          }
        }
      }
    }
  }
}
assert.ok(
  overBudget === 0,
  `${overBudget} resolvable settings need more than ${RING_BUDGET} indices (${overDetail})`
);
console.log(
  `  envelope: widest exact window ${widestResolvable} of ${RING_BUDGET} budget; ` +
    `widest anywhere ${widestAny} (${widestDetail}); ${capped} settings hit the span cap` +
    (capped ? ` (${cappedDetail})` : '')
);

// The drift bound is what earns that: κ|δ| ≤ s ≤ |δ| used to be declared
// unbounded wholesale, but a triangle only drifts at shapeRadius(−δ) per index,
// so these windows are finite and the scan stays exact inside them.
for (const spacing of [4, 5, 5.5]) {
  const offset = { x: 4, y: 4 };
  const { lo, hi } = ringIndexWindow(
    1500,
    Math.hypot(offset.x, offset.y),
    ringDrift(offset, 3, 3),
    spacing,
    0,
    shapeKappa(3, 3),
    4
  );
  assert.ok(
    hi - lo + 1 < RING_SPAN_CAP,
    `triangle at s=${spacing}, |δ|=5.66 should be bounded, got ${hi - lo + 1}`
  );
}
// Only true equality is unbounded, and then unboundedly many rings really do
// pass near p: every ring runs through the origin.
{
  const offset = { x: -4, y: 0 };
  const { lo, hi } = ringIndexWindow(1500, 4, ringDrift(offset, 1, 6), 4, 0, 1, 4);
  assert.ok(hi - lo + 1 > RING_SPAN_CAP, 'drift == spacing should hit the cap');
}

// n-gon side counts other than 6, including the fractional ones a morph produces.
let gonMiss = 0;
let gonDetail = '';
for (const sides of [3, 5, 7, 11, 16, 7.4]) {
  for (const theta of [-0.2, 0.06]) {
    for (const r of [120, 2200]) {
      for (let i = 0; i < 13; i++) {
        const a = (i * Math.PI * 2) / 13 + 0.4;
        const p = { x: r * Math.cos(a), y: r * Math.sin(a) };
        const offset = { x: 0.6, y: -1.2 };
        const guard = 24;
        const got = ringDistanceCpu(p, offset, theta, 6, 0, 4, sides, 0, guard);
        const want = bruteRing(p, offset, theta, 6, 0, 4, sides, Math.ceil(r / 4) + 64);
        if (want <= guard && got - want > 1e-3) {
          gonMiss += 1;
          gonDetail = `sides=${sides} theta=${theta} r=${r} i=${i} got=${got.toFixed(4)} want=${want.toFixed(4)}`;
        }
      }
    }
  }
}
assert.ok(gonMiss === 0, `n-gon window missed a ring (${gonDetail})`);

// Sitting exactly on a ring must read as ink, for every shape and every pose.
let onFamilyWorst = 0;
let onFamilyDetail = '';
let onFamilyChecked = 0;
let onFamilySkipped = 0;
for (const shape of [1, 2, 3, 4] as const) {
  for (const theta of [-0.2, 0.037, 0.2]) {
    for (const offset of [{ x: 0, y: 0 }, { x: 0.5, y: -0.5 }, { x: -3, y: 2 }]) {
      for (const nOn of [1, 9, 57, 240, 900]) {
        const spacing = 6;
        const radius = nOn * spacing;
        const offLen = Math.hypot(offset.x, offset.y);
        const center = rotate2d({ x: offset.x * nOn, y: offset.y * nOn }, nOn * theta);
        // Sample the ring's own outline, so corners and side midpoints both get hit.
        for (let i = 0; i < 9; i++) {
          const a = (i * Math.PI * 2) / 9;
          const dir = { x: Math.cos(a), y: Math.sin(a) };
          const scale = radius / Math.max(shapeRadius(dir, shape, 6), 1e-6);
          const local = { x: dir.x * scale, y: dir.y * scale };
          const spun = rotate2d(local, nOn * theta);
          const p = { x: spun.x + center.x, y: spun.y + center.y };
          const guard = Math.max(spacing * 0.75, 4);
          const { lo, hi } = ringIndexWindow(
            Math.hypot(p.x, p.y),
            offLen,
            ringDrift(offset, shape, 6),
            spacing,
            0,
            shapeKappa(shape, 6),
            guard
          );
          if (hi - lo + 1 > RING_BUDGET) {
            onFamilySkipped += 1;
            continue;
          }
          onFamilyChecked += 1;
          const got = ringDistanceCpu(p, offset, theta, spacing, 0, shape, 6, 0, guard);
          if (got > onFamilyWorst) {
            onFamilyWorst = got;
            onFamilyDetail = `shape=${shape} theta=${theta} off=(${offset.x},${offset.y}) n=${nOn} i=${i}`;
          }
        }
      }
    }
  }
}
assert.ok(
  onFamilyWorst < 1e-3,
  `a point on ring n did not read as ink, worst=${onFamilyWorst.toFixed(4)} at ${onFamilyDetail}`
);
console.log(
  `  on-ring: ${onFamilyChecked} exact, ${onFamilySkipped} over budget`
);

let lineWorst = 0;
for (const r of [80, 900, 6000]) {
  for (let i = 0; i < 16; i++) {
    lineWorst = Math.max(lineWorst, lineDistanceCpu({ x: r * Math.cos(i), y: r * Math.sin(i) }, 0.7, 16, 0, 0));
  }
}
assert.ok(lineWorst <= 8.01, `lines opened a gap, worst=${lineWorst}`);

// Radial: 2 lines are the axes. Origin is ink. A point on +X is on a line.
approx(radialLineDistanceCpu({ x: 0, y: 0 }, 2), 0);
approx(radialLineDistanceCpu({ x: 80, y: 0 }, 2), 0);
approx(radialLineDistanceCpu({ x: 0, y: 80 }, 2), 0);
approx(radialLineDistanceCpu({ x: 80, y: 80 }, 2), 80);
approx(radialLineDistanceCpu({ x: 80, y: 0 }, 4), 0);
approx(radialLineDistanceCpu({ x: 80, y: 80 }, 4), 0);
approx(radialLineDistanceCpu({ x: 0, y: 0 }, 2, 20), 20);
approx(radialLineDistanceCpu({ x: 10, y: 0 }, 2, 20), 10);
approx(radialLineDistanceCpu({ x: 20, y: 0 }, 2, 20), 0);
approx(radialLineDistanceCpu({ x: 40, y: 0 }, 2, 20), 0);

// Wave at amplitude 0 is vertical parallels. Frequency is independent of spacing.
approx(curveDistanceCpu({ x: 0, y: 40 }, 0, 16, 0, 0), 0);
approx(curveDistanceCpu({ x: 8, y: 0 }, 0, 16, 0, 0), 8);
approx(
  curveDistanceCpu({ x: 5, y: 30 }, 0, 16, 0, 0),
  lineDistanceCpu({ x: 5, y: 30 }, 0, 16, 0, 0)
);
const waveY = 8;
const waveX = 10 * Math.sin((Math.PI * 2 * 1 * waveY) / 32);
approx(curveDistanceCpu({ x: waveX, y: waveY }, 0, 16, 0, 10), 0, 0.05);
const wavePhase = Math.PI / 2;
approx(curveDistanceCpu({ x: 10, y: 0 }, 0, 16, wavePhase, 10), 0, 0.05);

// Parabola opens up: y = 0.01 B x² + n s. Bend 0 is horizontal parallels.
approx(curveDistanceCpu({ x: 40, y: 0 }, 1, 16, 0, 0), 0);
approx(curveDistanceCpu({ x: 0, y: 8 }, 1, 16, 0, 0), 8);
approx(curveDistanceCpu({ x: 20, y: 0.01 * 400 }, 1, 16, 0, 1), 0, 0.05);
approx(curveDistanceCpu({ x: 0, y: 8 }, 1, 16, 0, 4), 8, 0.2);
const paraFar = curveDistanceCpu({ x: 80, y: 0.04 * 6400 + 8 }, 1, 16, 0, 4);
assert.ok(paraFar > 0.4, `high-bend parabola should stay a single family, dist=${paraFar}`);

// Hyperbola: east-west rectangular, vertices at (± n s, 0). Not a quadratic wrap.
approx(curveDistanceCpu({ x: 16, y: 0 }, 2, 16, 0, 0), 0, 0.05);
approx(curveDistanceCpu({ x: -32, y: 0 }, 2, 16, 0, 0), 0, 0.05);
approx(curveDistanceCpu({ x: 0, y: 32 }, 2, 16, 0, 0), 0, 0.05);
assert.ok(curveDistanceCpu({ x: 0, y: 0 }, 2, 16, 0, 0) > 8, 'hyperbola leaves the origin open');

// Spiral: pitch is Δr per turn. Integer starts keep the field continuous across the cut.
approx(curveDistanceCpu({ x: 16, y: 0 }, 3, 16, 0, 0), 0, 0.05);
approx(curveDistanceCpu({ x: 0, y: 4 }, 3, 16, 0, 20), 0, 0.15);
approx(curveDistanceCpu({ x: 16, y: 0 }, 3, 16, 0, 32), 0, 0.15);
approx(curveDistanceCpu({ x: 24, y: 0 }, 3, 24, 0, 32), 0, 0.15);
assert.ok(
  curveDistanceCpu({ x: 16, y: 0 }, 3, 24, 0, 32) > 4,
  'spiral spacing should be the arm gap'
);
const dCutA = curveDistanceCpu({ x: -80, y: 0.2 }, 3, 16, 0, 20);
const dCutB = curveDistanceCpu({ x: -80, y: -0.2 }, 3, 16, 0, 20);
assert.ok(Math.abs(dCutA - dCutB) < 0.6, `spiral branch cut, ${dCutA} vs ${dCutB}`);

// ---------------------------------------------------------------- field warp
//
// A field enters as a shift of the phase residual. Three things have to hold, and
// each of them is a way the feature could be silently wrong:
//
//   1. no field is exactly no change,
//   2. the gradient the shift reports is the gradient of the shift,
//   3. the modulated distance is still a distance.

const FIELD_KINDS: FieldCode[] = [1, 2, 3, 4, 5, 6];
const FIELD_SCALE = 200;

// 1. Kind 0 is the identity, and the six others actually do something.
for (const p of [{ x: 0, y: 0 }, { x: 37, y: -91 }, { x: -180, y: 60 }]) {
  const off = fieldWarpCpu(p, 0, FIELD_SCALE);
  assert.equal(off.f, 0);
  assert.equal(off.gx, 0);
  assert.equal(off.gy, 0);
}
for (const kind of FIELD_KINDS) {
  let span = 0;
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const r = (0.15 + (i % 8) * 0.15) * FIELD_SCALE;
    span = Math.max(
      span,
      Math.abs(fieldWarpCpu({ x: r * Math.cos(a), y: r * Math.sin(a) }, kind, FIELD_SCALE).f)
    );
  }
  // Normalised to O(1) over the extent, so `amount` reads as a fringe count.
  assert.ok(span > 0.05 && span < 6, `field ${kind} is off scale, span=${span}`);
}

// 2. Analytic gradient against central differences. Getting this wrong is the
// eikonal bug of Section 4.2 all over again: strokes would thin wherever the
// field steepens, and the hairline floor would stop meaning anything on screen.
let gradWorst = 0;
for (const kind of FIELD_KINDS) {
  for (let i = 0; i < 240; i++) {
    const a = i * 0.7391;
    const r = 8 + (i % 24) * 11;
    const p = { x: r * Math.cos(a), y: r * Math.sin(a) };
    const h = 0.05;
    const got = fieldWarpCpu(p, kind, FIELD_SCALE);
    const fd = {
      x:
        (fieldWarpCpu({ x: p.x + h, y: p.y }, kind, FIELD_SCALE).f -
          fieldWarpCpu({ x: p.x - h, y: p.y }, kind, FIELD_SCALE).f) /
        (2 * h),
      y:
        (fieldWarpCpu({ x: p.x, y: p.y + h }, kind, FIELD_SCALE).f -
          fieldWarpCpu({ x: p.x, y: p.y - h }, kind, FIELD_SCALE).f) /
        (2 * h),
    };
    const scale = Math.max(Math.hypot(fd.x, fd.y), 1e-4);
    gradWorst = Math.max(gradWorst, Math.hypot(got.gx - fd.x, got.gy - fd.y) / scale);
  }
}
assert.ok(gradWorst < 0.02, `field gradient disagrees with finite differences, ${gradWorst}`);

// Modulation at amount 0 leaves both residual families untouched.
for (const kind of FIELD_KINDS) {
  const p = { x: 41, y: -63 };
  const w = fieldWarpCpu(p, kind, FIELD_SCALE);
  approx(lineDistanceCpu(p, 0, 16, 0, 0, 0, { x: 0, y: 0 }), lineDistanceCpu(p, 0, 16, 0, 0), 1e-9);
  for (const k of [0, 1, 2, 3]) {
    approx(
      curveDistanceCpu(p, k, 16, 0, k === 3 ? 32 : 4, 1, 0 * w.f, { x: 0, y: 0 }),
      curveDistanceCpu(p, k, 16, 0, k === 3 ? 32 : 4, 1),
      1e-9
    );
  }
}

// 3. Still a distance. Step from p by the reported distance along the phase
// normal; the residual there has to be an integer multiple of the spacing, i.e.
// a member of the family really is that far away. This is the check that fails if
// `warpGrad` is dropped: the step lands short by the factor the field is steep by.
const AMOUNT = 3;
const PITCH = 6;
function encoded(p: { x: number; y: number }, kind: FieldCode) {
  const w = fieldWarpCpu(p, kind, FIELD_SCALE);
  const gain = AMOUNT * PITCH;
  return { warp: w.f * gain, grad: { x: w.gx * gain, y: w.gy * gain } };
}
let stepWorst = 0;
let stepChecked = 0;
for (const kind of FIELD_KINDS) {
  for (let i = 0; i < 300; i++) {
    const a = i * 1.1071;
    const r = 14 + (i % 25) * 10;
    const p = { x: r * Math.cos(a), y: r * Math.sin(a) };
    const { warp, grad } = encoded(p, kind);
    const d = lineDistanceCpu(p, 0, PITCH, 0, 0, warp, grad);
    // Where the fringe is finer than three carrier periods the family folds over
    // itself within a stroke width and there is no single nearest member to walk
    // to. That is the sampling limit of Eq. (contour-nyquist), not an error, and
    // |warpGrad| <= 1/3 is exactly that inequality.
    if (Math.hypot(grad.x, grad.y) > 1 / 3) continue;
    const gx = 1 - grad.x;
    const gy = -grad.y;
    const gl = Math.hypot(gx, gy);
    let best = Infinity;
    for (const sign of [1, -1]) {
      const q = { x: p.x + (sign * d * gx) / gl, y: p.y + (sign * d * gy) / gl };
      best = Math.min(best, lineDistanceCpu(q, 0, PITCH, 0, 0, encoded(q, kind).warp, encoded(q, kind).grad));
    }
    stepChecked += 1;
    stepWorst = Math.max(stepWorst, best);
  }
}
assert.ok(stepChecked > 800, `too few modulated probes admissible, ${stepChecked}`);
assert.ok(stepWorst < 0.06 * PITCH, `modulated distance is not Euclidean, worst=${stepWorst}`);
console.log(
  `  field warp: gradient within ${(gradWorst * 100).toFixed(2)}% of finite differences; ` +
    `${stepChecked} modulated probes land within ${stepWorst.toFixed(4)} of a member`
);

// The contouring identity itself. Two carriers of the same pitch, one modulated,
// have index difference D = amount · f, so the light fringes are the level sets of
// the field at interval 1/amount. That is checkable without rendering anything:
// walk a point onto {D in Z} by Newton steps along the field gradient, and the two
// families' phase residuals there have to agree — one stroke sitting on the other.
let fringeWorst = 0;
let fringeChecked = 0;
for (const kind of FIELD_KINDS) {
  for (let i = 0; i < 300; i++) {
    const a = i * 0.5717;
    const r = 14 + (i % 25) * 10;
    let q = { x: r * Math.cos(a), y: r * Math.sin(a) };
    let landed = false;
    for (let it = 0; it < 40; it++) {
      const w = fieldWarpCpu(q, kind, FIELD_SCALE);
      const D = AMOUNT * w.f;
      const gx = AMOUNT * w.gx;
      const gy = AMOUNT * w.gy;
      const g2 = gx * gx + gy * gy;
      if (!(g2 > 1e-14)) break;
      const resid = D - Math.round(D);
      if (Math.abs(resid) < 1e-9) {
        landed = true;
        break;
      }
      q = { x: q.x - (resid * gx) / g2, y: q.y - (resid * gy) / g2 };
      if (!Number.isFinite(q.x) || Math.hypot(q.x, q.y) > 4 * FIELD_SCALE) break;
    }
    if (!landed) continue;
    fringeChecked += 1;
    const { warp } = encoded(q, kind);
    const bare = lineDistanceCpu(q, 0, PITCH, 0, 0);
    const mod = lineDistanceCpu(q, 0, PITCH, 0, 0, warp, { x: 0, y: 0 });
    fringeWorst = Math.max(fringeWorst, Math.abs(bare - mod));
  }
}
assert.ok(fringeChecked > 600, `too few level-set points reached, ${fringeChecked}`);
assert.ok(fringeWorst < 1e-5 * PITCH, `light fringes are not the level sets, worst=${fringeWorst}`);
console.log(
  `  contouring: ${fringeChecked} points solved onto {D in Z}; ` +
    `the two carriers coincide there to ${fringeWorst.toExponential(1)} world units`
);

// The phase identity the envelope rests on. Every family reports a signed
// residual `r` and a local member gap `g` alongside its distance, and the claim
// is that advancing the family's own phase by `u` periods is the same as sliding
// the residual: `d(phase + u·s) == periodicDist(r − u·g, g)`. If that holds, one
// solve yields the whole carrier sweep, and the envelope costs a pass rather than
// a pass per sample.
const SWEEP_US = [0.07, 0.23, 0.5, 0.61, 0.88];
const PHASE_FAMILIES: {
  label: string;
  spacing: number;
  at: (p: { x: number; y: number }, phase: number) => PhaseSample;
}[] = [
  {
    label: 'lines',
    spacing: 13,
    at: (p, phase) => linePhaseCpu(p, 0.4, 13, phase, 0),
  },
  {
    label: 'lines + field',
    spacing: 13,
    at: (p, phase) => {
      const w = fieldWarpCpu(p, 1, 260);
      const gain = 0.9 * 13;
      return linePhaseCpu(p, 0.4, 13, phase, 0, w.f * gain, { x: w.gx * gain, y: w.gy * gain });
    },
  },
  // The wave's `phase` is the sinusoid's own argument, not an index offset, so
  // its carrier is advanced through the same channel a field uses.
  { label: 'wave', spacing: 11, at: (p, shift) => curvePhaseCpu(p, 0, 11, 0.7, 9, 1.3, shift) },
  { label: 'parabola', spacing: 15, at: (p, phase) => curvePhaseCpu(p, 1, 15, phase, 22) },
  { label: 'spiral', spacing: 12, at: (p, phase) => curvePhaseCpu(p, 3, 12, phase, 48) },
  {
    label: 'circles centered',
    spacing: 14,
    at: (p, phase) => ringPhaseCpu(p, { x: 0, y: 0 }, 0, 14, phase, 1, 6, 0, 40),
  },
  {
    label: 'circles translated',
    spacing: 14,
    at: (p, phase) => ringPhaseCpu(p, { x: 0.6, y: -0.3 }, 0, 14, phase, 1, 6, 0, 40),
  },
  {
    label: 'hexagons rotated',
    spacing: 16,
    at: (p, phase) => ringPhaseCpu(p, { x: 0.4, y: 0.2 }, 0.02, 16, phase, 4, 6, 0, 40),
  },
  {
    label: 'squares translated',
    spacing: 18,
    at: (p, phase) => ringPhaseCpu(p, { x: 1.1, y: 0.7 }, 0, 18, phase, 2, 4, 0, 40),
  },
];

let sweepWorst = 0;
let sweepDetail = '';
let sweepChecked = 0;
for (const family of PHASE_FAMILIES) {
  for (let i = 0; i < 220; i++) {
    const a = i * 0.9127;
    const rad = 22 + (i % 22) * 13;
    const p = { x: rad * Math.cos(a), y: rad * Math.sin(a) };
    const base = family.at(p, 0);
    const gap = phaseGap(base);
    const baseD = phaseDistance(base);
    // A saturated solve found no member inside the guard, so there is no residual
    // to slide.
    if (baseD > gap * 0.5 + 1e-3) continue;
    // How much world residual one unit of phase buys. It is 1 for a bare family
    // and `1/|∇ψ|` for a modulated one, and rather than hand each family its own
    // constant, read it off a short step — which also catches a family reporting
    // its residual and its members in different units.
    const eps = 1e-4 * family.spacing;
    const slope = (base.r - family.at(p, eps).r) / eps;
    if (!(slope > 0.2) || !(slope < 5)) continue;
    for (const u of SWEEP_US) {
      const delta = u * (base.rUp - base.r);
      const want = phaseDistance(family.at(p, delta / slope));
      const got = phaseDistance(base, delta);
      sweepChecked += 1;
      const err = Math.abs(want - got);
      if (err > sweepWorst) {
        sweepWorst = err;
        sweepDetail = `${family.label} u=${u} p=(${p.x.toFixed(1)},${p.y.toFixed(1)}) want=${want.toFixed(5)} got=${got.toFixed(5)}`;
      }
    }
  }
}
assert.ok(sweepChecked > 6000, `too few phase probes admissible, ${sweepChecked}`);
assert.ok(
  sweepWorst < 1e-3,
  `sliding the residual is not the same as advancing the phase: ${sweepDetail}`
);

// The phase at rest is the distance. Everything the renderer draws now goes
// through `phaseDistance`, so if this drifts the ordinary view changes, and it has
// to hold in the awkward places too: the hole inside a radial family, inside the
// innermost ring, and inside the n = 1 hyperbola, where the member one pitch
// further in does not exist to slide onto.
let restWorst = 0;
let restDetail = '';
const REST_CASES: { label: string; d: () => number; p: () => PhaseSample }[] = [];
for (let i = 0; i < 400; i++) {
  const a = i * 0.7351;
  const rad = (i % 40) * 4;
  const p = { x: rad * Math.cos(a), y: rad * Math.sin(a) };
  REST_CASES.push(
    { label: 'lines', d: () => lineDistanceCpu(p, 0.3, 14, 3, 0), p: () => linePhaseCpu(p, 0.3, 14, 3, 0) },
    { label: 'radial hole', d: () => radialLineDistanceCpu(p, 7, 40), p: () => radialLinePhaseCpu(p, 7, 40) },
    { label: 'hyperbola', d: () => curveDistanceCpu(p, 2, 16, 0, 0), p: () => curvePhaseCpu(p, 2, 16, 0, 0) },
    { label: 'spiral', d: () => curveDistanceCpu(p, 3, 12, 5, 48), p: () => curvePhaseCpu(p, 3, 12, 5, 48) },
    { label: 'wave', d: () => curveDistanceCpu(p, 0, 11, 0.7, 9, 1.3), p: () => curvePhaseCpu(p, 0, 11, 0.7, 9, 1.3) },
    {
      label: 'rings start',
      d: () => ringDistanceCpu(p, { x: 0, y: 0 }, 0, 14, 37, 1, 6, 0, 40),
      p: () => ringPhaseCpu(p, { x: 0, y: 0 }, 0, 14, 37, 1, 6, 0, 40),
    },
    {
      label: 'squares walking',
      d: () => ringDistanceCpu(p, { x: 1.1, y: 0.7 }, 0, 18, 0, 2, 4, 0, 40),
      p: () => ringPhaseCpu(p, { x: 1.1, y: 0.7 }, 0, 18, 0, 2, 4, 0, 40),
    },
    {
      label: 'hexagons rotated',
      d: () => ringDistanceCpu(p, { x: 0.4, y: 0.2 }, 0.02, 16, 0, 4, 6, 0, 40),
      p: () => ringPhaseCpu(p, { x: 0.4, y: 0.2 }, 0.02, 16, 0, 4, 6, 0, 40),
    }
  );
}
for (const c of REST_CASES) {
  const err = Math.abs(phaseDistance(c.p()) - c.d());
  if (err > restWorst) {
    restWorst = err;
    restDetail = `${c.label} phase=${phaseDistance(c.p()).toFixed(5)} dist=${c.d().toFixed(5)}`;
  }
}
assert.ok(restWorst < 1e-9, `the phase at rest is not the distance: ${restDetail}`);

// And the residual really is the distance, on every family.
let signWorst = 0;
for (const family of PHASE_FAMILIES) {
  for (let i = 0; i < 120; i++) {
    const a = i * 1.7231;
    const rad = 18 + (i % 19) * 17;
    const p = { x: rad * Math.cos(a), y: rad * Math.sin(a) };
    const s = family.at(p, 0);
    const d = phaseDistance(s);
    if (d > phaseGap(s) * 0.5 + 1e-3) continue;
    signWorst = Math.max(signWorst, Math.abs(Math.abs(s.r) - d));
  }
}
assert.ok(signWorst < 1e-9, `|r| is not d, worst=${signWorst}`);
console.log(
  `  phase: ${sweepChecked} probes across ${PHASE_FAMILIES.length} families; ` +
    `sliding the residual matches a re-solve to ${sweepWorst.toExponential(1)} world units`
);

// ---------------------------------------------------- crowded rotated rings
//
// Past the fold radius ≈ spacing/θ the residual h(n) turns non-monotonic and
// several BRANCHES of a rotated family pass every point. The trio must then
// report the residual-adjacent branches, not the index neighbours a fold away:
// the envelope's slide period is measured off the trio, and a fold-wide gap
// there leaves the carrier standing in sector-shaped hash (the hexrot scene:
// hexagon rings, s = 6, θ = 0.02 rad per ring, fold radius 300).
{
  const sC = 6;
  const thetaC = 0.02;
  const guardC = sC; // the envelope's reject guard: one whole pitch
  let trioLie = 0;
  let adjMiss = 0;
  let checked = 0;
  let crowdSeen = 0;
  let detail = '';
  for (const r of [350, 520, 800]) {
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI * 2) / 24 + 0.11;
      const p = { x: r * Math.cos(a), y: r * Math.sin(a) };
      const ph = ringPhaseCpu(p, { x: 0, y: 0 }, thetaC, sC, 0, 4, 6, 0, guardC);
      if (ph.floor > 0) continue; // saturated: no members inside the guard here
      checked += 1;

      const nMax = Math.ceil((r + guardC) / sC) + 8;
      const residuals: number[] = [];
      for (let n = 0; n <= nMax; n++) {
        residuals.push(shapeRadius(rotate2d(p, -n * thetaC), 4, 6) - n * sC);
      }
      const nearest = residuals.reduce((b, c) => (Math.abs(c) < Math.abs(b) ? c : b));
      approx(ph.r, nearest, 1e-3);

      // Every reported neighbour is a real member or the declared nominal step.
      for (const slot of [ph.rUp, ph.rDown]) {
        const real = residuals.some((c) => Math.abs(c - slot) < 1e-3);
        const nominal =
          Math.abs(slot - (ph.r + sC)) < 1e-3 || Math.abs(slot - (ph.r - sC)) < 1e-3;
        if (!real && !nominal) {
          trioLie += 1;
          detail = `r=${r} i=${i} slot=${slot.toFixed(3)} near=${nearest.toFixed(3)}`;
        }
      }

      // The scan provably finds the three nearest members inside the guard, so
      // whenever a runner-up branch sits comfortably inside it and within a
      // pitch of the winner, the trio must CONTAIN it — an index neighbour
      // from a fold away in its slot instead is the sector-hash bug.
      const inGuard = residuals
        .filter((c) => Math.abs(c) <= guardC)
        .sort((x, y) => Math.abs(x) - Math.abs(y));
      // Keep clear of the ring around one nominal step, where a fallback
      // rUp = r ± s could coincidentally match a real branch.
      const provable = inGuard
        .slice(1, 3)
        .filter(
          (c) =>
            Math.abs(c) <= guardC * 0.85 &&
            Math.abs(Math.abs(c - nearest) - sC) > sC * 0.1
        );
      if (provable.length) crowdSeen += 1;
      for (const c of provable) {
        if (Math.abs(ph.rUp - c) > 1e-3 && Math.abs(ph.rDown - c) > 1e-3) {
          adjMiss += 1;
          detail =
            `r=${r} i=${i} trio=(${ph.r.toFixed(3)}, ${ph.rUp.toFixed(3)}, ${ph.rDown.toFixed(3)}) ` +
            `missing branch at ${c.toFixed(3)}`;
        }
      }
    }
  }
  assert.ok(checked > 50, `too few crowded probes admissible, ${checked}`);
  assert.ok(crowdSeen > 20, `the crowded regime was not reached, ${crowdSeen}`);
  assert.ok(trioLie === 0, `trio reported a member that does not exist (${detail})`);
  assert.ok(adjMiss === 0, `trio missed the adjacent branch in a crowd (${detail})`);
  console.log(
    `  crowded rings: ${checked} probes past the fold radius, ` +
      `${crowdSeen} in a full crowd — the trio reports the adjacent branches`
  );
}

// Lattices have no scalar phase, so the envelope averages them by translation
// instead. That is only an average over the carrier if the reported cell really is
// a period of the lattice, in both generators and for edges and vertices alike.
let cellWorst = 0;
let cellDetail = '';
for (const [kind, label] of [
  [0, 'square'],
  [1, 'hexagon'],
  [2, 'triangle'],
] as const) {
  for (const [sx, sy] of [
    [1, 1],
    [1.7, 0.6],
  ] as const) {
    const cell = latticeCell(kind, 15, sx, sy);
    for (let i = 0; i < 200; i++) {
      const a = i * 0.9137;
      const rad = (i % 23) * 6;
      const p = { x: rad * Math.cos(a), y: rad * Math.sin(a) };
      for (const wantVertex of [false, true]) {
        const base = gridDistanceCpu(p, kind, 15, wantVertex, sx, sy);
        for (const [dx, dy] of [
          [cell.ax, cell.ay],
          [cell.bx, cell.by],
          [-cell.bx, -cell.by],
          [cell.ax + cell.bx, cell.ay + cell.by],
        ]) {
          const moved = gridDistanceCpu(
            { x: p.x + dx, y: p.y + dy },
            kind,
            15,
            wantVertex,
            sx,
            sy
          );
          const err = Math.abs(moved - base);
          if (err > cellWorst) {
            cellWorst = err;
            cellDetail = `${label} ${sx}x${sy} ${wantVertex ? 'vertex' : 'edge'} by (${dx.toFixed(2)}, ${dy.toFixed(2)}): ${base.toFixed(5)} vs ${moved.toFixed(5)}`;
          }
        }
      }
    }
  }
}
assert.ok(cellWorst < 1e-4, `the lattice cell is not a period: ${cellDetail}`);
console.log(`  lattice cell: a period of every grid to ${cellWorst.toExponential(1)} world units`);

console.log('inverseCpu checks passed');
