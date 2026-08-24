import assert from 'node:assert/strict';
import {
  centeredMod,
  circleQuadratic,
  curveDistanceCpu,
  lineDistanceCpu,
  radialLineDistanceCpu,
  ringDistanceCpu,
} from './inverseCpu.ts';

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
