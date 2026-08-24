import assert from 'node:assert/strict';
import { gridDistanceCpu, latticeHits } from './latticeCpu.ts';

function approx(actual: number, expected: number, tol = 1e-3) {
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);
}

const s = 10;

// Square: lattice points and axis edges
approx(gridDistanceCpu({ x: 0, y: 0 }, 0, s, true), 0);
approx(gridDistanceCpu({ x: s, y: 0 }, 0, s, true), 0);
approx(gridDistanceCpu({ x: s / 2, y: 0 }, 0, s, false), 0);
approx(gridDistanceCpu({ x: s / 2, y: 0 }, 0, s, true), s / 2);
approx(latticeHits({ x: s / 2, y: s / 2 }, 0, s).edge, s / 2);

// Triangle: 3-line family + hex-packed vertices
approx(gridDistanceCpu({ x: 0, y: 0 }, 2, s, true), 0);
approx(gridDistanceCpu({ x: s, y: 0 }, 2, s, true), 0);
approx(gridDistanceCpu({ x: s / 2, y: 0 }, 2, s, false), 0, 0.02);
approx(gridDistanceCpu({ x: s / 2, y: 0 }, 2, s, true), s / 2, 0.02);
approx(gridDistanceCpu({ x: s / 2, y: (s * Math.sqrt(3)) / 2 }, 2, s, true), 0, 0.02);

// Hex: center is inside a cell; corners are vertices
const hex = latticeHits({ x: 0, y: 0 }, 1, s);
approx(hex.vertex, s, 0.05);
approx(hex.edge, (s * Math.sqrt(3)) / 2, 0.05);
approx(gridDistanceCpu({ x: 0, y: s }, 1, s, true), 0, 0.08);
approx(gridDistanceCpu({ x: 0, y: s }, 1, s, false), 0, 0.08);

// Stretch: cells scale in layer space; distances stay world-space
approx(gridDistanceCpu({ x: s * 2, y: 0 }, 0, s, true, 2, 1), 0);
approx(gridDistanceCpu({ x: s, y: 0 }, 0, s, true, 2, 1), s);
approx(gridDistanceCpu({ x: s, y: 0 }, 0, s, false, 2, 1), 0);
approx(gridDistanceCpu({ x: 0, y: s / 2 }, 0, s, false, 2, 1), 0);
approx(latticeHits({ x: s, y: s / 2 }, 0, s, 2, 1).edge, s / 2);

approx(gridDistanceCpu({ x: s * 2, y: 0 }, 2, s, true, 2, 1), 0, 0.02);
approx(gridDistanceCpu({ x: s, y: 0 }, 2, s, true, 2, 1), s, 0.05);

approx(gridDistanceCpu({ x: 0, y: s * 2 }, 1, s, true, 1, 2), 0, 0.1);
approx(gridDistanceCpu({ x: 0, y: s }, 1, s, true, 1, 2), (s * Math.sqrt(3)) / 2, 0.15);
