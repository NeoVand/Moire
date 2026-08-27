import assert from 'node:assert/strict';
import {
  centeredMod,
  circleQuadratic,
  curveDistanceCpu,
  lineDistanceCpu,
  radialLineDistanceCpu,
  RING_BUDGET,
  ringDistanceCpu,
  ringIndexWindow,
  shapeKappa,
  shapeRadius,
} from './inverseCpu.ts';
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

// The envelope the UI can actually reach must fit the budget, so the scan is
// exact there rather than subsampling. Guard mirrors the renderer's halfT + aa.
let overBudget = 0;
let overDetail = '';
let widest = 0;
for (const zoom of [0.1, 0.2, 0.35, 0.5, 1, 2, 4, 10]) {
  const pixel = 1 / Math.max(zoom, 0.08);
  for (const thickness of [0.01, 3.5, 20]) {
    const halfT = Math.max(thickness * 0.5, pixel * 1.15);
    const guardZoom = halfT + pixel * 0.7;
    // Half-diagonal of a generous viewport at this zoom.
    const reach = Math.hypot(1920, 1200) / (2 * zoom);
    for (const shape of [1, 2, 3, 4] as const) {
      for (const spacing of [6, 10, 16, 24, 40, 80]) {
        // Triangles at the zoom-out limit have the widest fan (κ = 1/2); past
        // |δ| ≈ 1.5 there the window outgrows the budget and the scan subsamples.
        for (const offLen of [0, 0.7, 1.5]) {
          const guard = Math.max(guardZoom, spacing * 0.75);
          const { lo, hi } = ringIndexWindow(
            reach,
            offLen,
            spacing,
            0,
            shapeKappa(shape, 6),
            guard
          );
          const span = hi - lo + 1;
          if (span > widest) widest = span;
          if (span > RING_BUDGET) {
            overBudget += 1;
            overDetail = `zoom=${zoom} t=${thickness} shape=${shape} s=${spacing} |d|=${offLen} span=${span}`;
          }
        }
      }
    }
  }
}
assert.ok(
  overBudget === 0,
  `${overBudget} reachable settings need more than ${RING_BUDGET} indices (${overDetail})`
);
console.log(`  envelope: widest window ${widest} of ${RING_BUDGET} budget`);

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

console.log('inverseCpu checks passed');
