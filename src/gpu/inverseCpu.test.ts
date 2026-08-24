import assert from 'node:assert/strict';
import { centeredMod, circleQuadratic, ringDistanceCpu } from './inverseCpu.ts';

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

console.log('inverseCpu checks passed');
